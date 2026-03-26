import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { COLUMN_ALIAS_MAP, IMPORT_TARGET_FIELDS } from '../constants';
import { normalizeBusinessName, normalizeAddress } from '../normalize';
import type { ImportColumnMapping, ImportRowError, ImportableRow } from '@/types';

/**
 * Parse a CSV or Excel file into headers and raw rows.
 * Runs entirely client-side (browser).
 */
export async function parseFile(
  file: File
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    return parseCSV(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    return parseExcel(file);
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

function parseCSV(
  file: File
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const headers = results.meta.fields || [];
        const rows = (results.data as Record<string, string>[]).map((row) => {
          const clean: Record<string, string> = {};
          for (const key of headers) {
            clean[key] = String(row[key] ?? '').trim();
          }
          return clean;
        });
        resolve({ headers, rows });
      },
      error(err: Error) {
        reject(err);
      },
    });
  });
}

async function parseExcel(
  file: File
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

  if (rawData.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = (rawData[0] as string[]).map((h) => String(h ?? '').trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < rawData.length; i++) {
    const rawRow = rawData[i] as string[];
    if (!rawRow || rawRow.every((cell) => !cell)) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = String(rawRow[j] ?? '').trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Auto-map file headers to target fields using the alias map.
 * First match wins — no duplicate target assignments.
 */
export function autoMapColumns(headers: string[]): ImportColumnMapping[] {
  const usedTargets = new Set<string>();

  return headers.map((header) => {
    const normalized = header.toLowerCase().trim();
    const target = COLUMN_ALIAS_MAP[normalized];

    if (target && !usedTargets.has(target)) {
      usedTargets.add(target);
      return { sourceColumn: header, targetField: target };
    }

    return { sourceColumn: header, targetField: '' };
  });
}

/**
 * Apply column mapping to transform raw rows into typed ImportableRow[].
 */
export function applyMapping(
  rows: Record<string, string>[],
  mapping: ImportColumnMapping[]
): ImportableRow[] {
  const activeMapping = mapping.filter((m) => m.targetField !== '');

  return rows
    .map((row) => {
      const mapped: Record<string, string> = {};
      for (const m of activeMapping) {
        const val = row[m.sourceColumn];
        if (val) {
          mapped[m.targetField] = val;
        }
      }
      return mapped as unknown as ImportableRow;
    })
    .filter((row) => row.displayBusinessName);
}

/**
 * Validate mapped rows for required fields and format correctness.
 * Returns valid rows and per-row errors.
 */
export function validateRows(rows: ImportableRow[]): {
  valid: ImportableRow[];
  errors: ImportRowError[];
} {
  const valid: ImportableRow[] = [];
  const errors: ImportRowError[] = [];

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const zipRegex = /^\d{5}(-\d{4})?$/;

  rows.forEach((row, index) => {
    const rowNum = index + 2; // +2 for 1-based + header row
    let hasError = false;

    if (!row.displayBusinessName || !row.displayBusinessName.trim()) {
      errors.push({
        row: rowNum,
        field: 'Business Name',
        value: row.displayBusinessName || '',
        message: 'Business name is required',
      });
      hasError = true;
    }

    if (row.email && !emailRegex.test(row.email)) {
      errors.push({
        row: rowNum,
        field: 'Email',
        value: row.email,
        message: 'Invalid email format',
      });
      hasError = true;
    }

    if (row.contactEmail && !emailRegex.test(row.contactEmail)) {
      errors.push({
        row: rowNum,
        field: 'Contact Email',
        value: row.contactEmail,
        message: 'Invalid email format',
      });
      hasError = true;
    }

    if (row.zip && !zipRegex.test(row.zip)) {
      errors.push({
        row: rowNum,
        field: 'Zip Code',
        value: row.zip,
        message: 'Invalid zip code format (expected 12345 or 12345-6789)',
      });
      hasError = true;
    }

    if (row.phone) {
      const digits = row.phone.replace(/\D/g, '');
      if (digits.length < 10) {
        errors.push({
          row: rowNum,
          field: 'Phone',
          value: row.phone,
          message: 'Phone must have at least 10 digits',
        });
        hasError = true;
      }
    }

    if (row.contactPhone) {
      const digits = row.contactPhone.replace(/\D/g, '');
      if (digits.length < 10) {
        errors.push({
          row: rowNum,
          field: 'Contact Phone',
          value: row.contactPhone,
          message: 'Phone must have at least 10 digits',
        });
        hasError = true;
      }
    }

    if (!hasError) {
      valid.push(row);
    }
  });

  return { valid, errors };
}

/**
 * Normalize a row's business name and address for deduplication.
 */
export function normalizeImportRow(row: ImportableRow): {
  normalizedBusinessName: string;
  normalizedAddress: string | null;
} {
  const normName = normalizeBusinessName(row.displayBusinessName);

  const addrParts = [row.city, row.state, row.zip].filter(Boolean);
  const normAddr =
    addrParts.length > 0 ? normalizeAddress(addrParts.join(' ')) : null;

  return { normalizedBusinessName: normName, normalizedAddress: normAddr };
}

/**
 * Generate a CSV template with all target field headers.
 */
export function generateCSVTemplate(): string {
  const headers = IMPORT_TARGET_FIELDS.map((f) => f.label);
  return headers.join(',') + '\n';
}

/**
 * Generate a CSV error report for download.
 */
export function generateErrorReport(errors: ImportRowError[]): string {
  const header = 'Row,Field,Value,Message\n';
  const rows = errors.map(
    (e) =>
      `${e.row},"${e.field}","${(e.value || '').replace(/"/g, '""')}","${e.message}"`
  );
  return header + rows.join('\n');
}
