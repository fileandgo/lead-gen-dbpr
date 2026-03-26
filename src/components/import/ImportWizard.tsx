'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Download,
} from 'lucide-react';
import { IMPORT_TARGET_FIELDS, IMPORT_FILE_MAX_SIZE_MB } from '@/lib/constants';
import {
  parseFile,
  autoMapColumns,
  applyMapping,
  validateRows,
  generateCSVTemplate,
  generateErrorReport,
} from '@/lib/import/import-utils';
import type {
  ImportColumnMapping,
  ImportableRow,
  ImportRowError,
  DuplicateStrategy,
} from '@/types';

interface ImportWizardProps {
  onComplete: () => void;
}

export function ImportWizard({ onComplete }: ImportWizardProps) {
  const [step, setStep] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 1: File state
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState('');

  // Step 2: Mapping state
  const [mapping, setMapping] = useState<ImportColumnMapping[]>([]);

  // Step 3: Validation state
  const [validRows, setValidRows] = useState<ImportableRow[]>([]);
  const [errors, setErrors] = useState<ImportRowError[]>([]);

  // Step 4: Config state
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');

  // Step 5: Result state
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    importedRows: number;
    skippedDuplicates: number;
    updatedExisting: number;
    errorRows: number;
  } | null>(null);
  const [importError, setImportError] = useState('');

  const handleFileSelect = useCallback(async (file: File) => {
    setParseError('');

    const maxBytes = IMPORT_FILE_MAX_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      setParseError(`File too large. Maximum size is ${IMPORT_FILE_MAX_SIZE_MB}MB.`);
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setParseError('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
      return;
    }

    try {
      const { headers: h, rows: r } = await parseFile(file);
      if (h.length === 0) {
        setParseError('No headers found in file.');
        return;
      }
      if (r.length === 0) {
        setParseError('No data rows found in file.');
        return;
      }

      setFileName(file.name);
      setFileType(ext);
      setHeaders(h);
      setRawRows(r);
      setMapping(autoMapColumns(h));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleMappingChange = useCallback(
    (sourceColumn: string, targetField: string) => {
      setMapping((prev) =>
        prev.map((m) =>
          m.sourceColumn === sourceColumn
            ? { ...m, targetField: targetField === 'none' ? '' : targetField }
            : m
        )
      );
    },
    []
  );

  const handleNext = useCallback(() => {
    if (step === 2) {
      // Run validation when moving to step 3
      const mapped = applyMapping(rawRows, mapping);
      const { valid, errors: errs } = validateRows(mapped);
      setValidRows(valid);
      setErrors(errs);
    }
    setStep((s) => s + 1);
  }, [step, rawRows, mapping]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    setImportError('');

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          fileType,
          columnMapping: mapping,
          duplicateStrategy,
          rows: validRows,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data);
      setStep(5);
      onComplete();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [fileName, fileType, mapping, duplicateStrategy, validRows, onComplete]);

  const handleDownloadTemplate = useCallback(() => {
    const csv = generateCSVTemplate();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lead-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleDownloadErrors = useCallback(() => {
    const csv = generateErrorReport(errors);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [errors]);

  const handleReset = useCallback(() => {
    setStep(1);
    setFileName('');
    setFileType('');
    setHeaders([]);
    setRawRows([]);
    setMapping([]);
    setValidRows([]);
    setErrors([]);
    setDuplicateStrategy('skip');
    setResult(null);
    setImportError('');
    setParseError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const isBusinessNameMapped = mapping.some(
    (m) => m.targetField === 'displayBusinessName'
  );

  // Used targets for preventing duplicate assignments
  const usedTargets = new Set(
    mapping.filter((m) => m.targetField).map((m) => m.targetField)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Import Leads
        </CardTitle>
        <CardDescription>
          {step === 1 && 'Upload a CSV or Excel file to import leads'}
          {step === 2 && 'Map your file columns to lead fields'}
          {step === 3 && 'Review validation results'}
          {step === 4 && 'Configure import settings and confirm'}
          {step === 5 && 'Import complete'}
        </CardDescription>

        {/* Step indicator */}
        <div className="flex items-center gap-2 pt-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-2 flex-1 rounded-full ${
                s <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {/* === STEP 1: Upload === */}
        {step === 1 && (
          <div className="space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-12 transition-colors hover:border-primary/50"
            >
              <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">
                Drop your file here, or click to browse
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                CSV, XLSX, or XLS up to {IMPORT_FILE_MAX_SIZE_MB}MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleInputChange}
                className="hidden"
              />
            </div>

            {parseError && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {parseError}
              </div>
            )}

            {fileName && (
              <div className="flex items-center justify-between rounded-md bg-muted/50 p-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{fileName}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{rawRows.length} rows</span>
                  <span>{headers.length} columns</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
              >
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
              <Button
                onClick={handleNext}
                disabled={!fileName || rawRows.length === 0}
              >
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* === STEP 2: Map Columns === */}
        {step === 2 && (
          <div className="space-y-4">
            {!isBusinessNameMapped && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                Business Name must be mapped to continue
              </div>
            )}

            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Column</TableHead>
                    <TableHead>Sample Value</TableHead>
                    <TableHead>Map To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mapping.map((m) => {
                    const sample = rawRows[0]?.[m.sourceColumn] || '';
                    return (
                      <TableRow key={m.sourceColumn}>
                        <TableCell className="font-medium">
                          {m.sourceColumn}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {sample}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={m.targetField || 'none'}
                            onValueChange={(val) =>
                              handleMappingChange(m.sourceColumn, val)
                            }
                          >
                            <SelectTrigger className="w-[220px]">
                              <SelectValue placeholder="Skip this column" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                -- Skip --
                              </SelectItem>
                              {IMPORT_TARGET_FIELDS.map((f) => (
                                <SelectItem
                                  key={f.value}
                                  value={f.value}
                                  disabled={
                                    usedTargets.has(f.value) &&
                                    m.targetField !== f.value
                                  }
                                >
                                  {f.label}
                                  {f.required ? ' *' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleNext} disabled={!isBusinessNameMapped}>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* === STEP 3: Validate === */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold">
                  {validRows.length + errors.length}
                </p>
                <p className="text-sm text-muted-foreground">Total Rows</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {validRows.length}
                </p>
                <p className="text-sm text-muted-foreground">Valid</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-red-600">
                  {errors.length}
                </p>
                <p className="text-sm text-muted-foreground">Errors</p>
              </div>
            </div>

            {errors.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-red-600">
                    {errors.length} validation error{errors.length !== 1 ? 's' : ''} found
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadErrors}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Error Report
                  </Button>
                </div>

                <div className="max-h-[250px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Field</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {errors.slice(0, 50).map((err, i) => (
                        <TableRow key={i}>
                          <TableCell>{err.row}</TableCell>
                          <TableCell className="font-medium">
                            {err.field}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate text-muted-foreground">
                            {err.value || '(empty)'}
                          </TableCell>
                          <TableCell className="text-red-600">
                            {err.message}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {errors.length > 50 && (
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      Showing first 50 of {errors.length} errors. Download the
                      full report above.
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleNext}
                disabled={validRows.length === 0}
              >
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* === STEP 4: Review & Configure === */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-sm">
                <span className="font-bold text-green-600">
                  {validRows.length}
                </span>{' '}
                valid rows ready to import from{' '}
                <span className="font-medium">{fileName}</span>
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Duplicate Handling
              </Label>
              <div className="space-y-2">
                {[
                  {
                    value: 'skip' as DuplicateStrategy,
                    label: 'Skip duplicates',
                    desc: 'Matching businesses will be skipped',
                  },
                  {
                    value: 'update' as DuplicateStrategy,
                    label: 'Update existing',
                    desc: 'Matching businesses will be updated with new data',
                  },
                  {
                    value: 'import_all' as DuplicateStrategy,
                    label: 'Import all',
                    desc: 'All rows imported as new records',
                  },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      duplicateStrategy === option.value
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="duplicateStrategy"
                      value={option.value}
                      checked={duplicateStrategy === option.value}
                      onChange={() => setDuplicateStrategy(option.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium">{option.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {option.desc}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            {/* Preview first 5 rows */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Preview</Label>
              <div className="max-h-[200px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business Name</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>County</TableHead>
                      <TableHead>Trade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validRows.slice(0, 5).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {row.displayBusinessName}
                        </TableCell>
                        <TableCell>{row.city || '-'}</TableCell>
                        <TableCell>{row.state || '-'}</TableCell>
                        <TableCell>{row.county || '-'}</TableCell>
                        <TableCell>{row.primaryTrade || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {validRows.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  Showing 5 of {validRows.length} rows
                </p>
              )}
            </div>

            {importError && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {importError}
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Importing...
                  </>
                ) : (
                  <>
                    Import {validRows.length} Leads
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* === STEP 5: Complete === */}
        {step === 5 && result && (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-6">
              <CheckCircle2 className="mb-4 h-12 w-12 text-green-500" />
              <h3 className="text-lg font-bold">Import Complete</h3>
              <p className="text-sm text-muted-foreground">
                Your leads have been imported successfully
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {result.importedRows}
                </p>
                <p className="text-xs text-muted-foreground">Imported</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-muted-foreground">
                  {result.skippedDuplicates}
                </p>
                <p className="text-xs text-muted-foreground">Skipped</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {result.updatedExisting}
                </p>
                <p className="text-xs text-muted-foreground">Updated</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-red-600">
                  {result.errorRows}
                </p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
            </div>

            <div className="flex justify-center">
              <Button onClick={handleReset}>Import More</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
