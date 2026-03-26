import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { normalizeBusinessName, normalizeAddress } from '@/lib/normalize';
import { isGoogleAutoResolveEnabled } from '@/lib/enrichment/google-resolver';
import type { ImportPayload, ImportableRow } from '@/types';

export async function GET() {
  try {
    const runs = await prisma.importRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        fileType: r.fileType,
        status: r.status,
        totalRows: r.totalRows,
        validRows: r.validRows,
        importedRows: r.importedRows,
        skippedDuplicates: r.skippedDuplicates,
        updatedExisting: r.updatedExisting,
        errorRows: r.errorRows,
        duplicateStrategy: r.duplicateStrategy,
        startedAt: r.startedAt?.toISOString() || null,
        completedAt: r.completedAt?.toISOString() || null,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Import history error:', error);
    return NextResponse.json(
      { error: 'Failed to load import history' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ImportPayload;
    const { fileName, fileType, columnMapping, duplicateStrategy, rows } = body;

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: 'No rows to import' },
        { status: 400 }
      );
    }

    const run = await prisma.importRun.create({
      data: {
        fileName,
        fileType,
        status: 'processing',
        totalRows: rows.length,
        validRows: rows.length,
        duplicateStrategy,
        columnMappingJson: JSON.parse(JSON.stringify(columnMapping)),
        startedAt: new Date(),
      },
    });

    let importedRows = 0;
    let skippedDuplicates = 0;
    let updatedExisting = 0;
    let errorRows = 0;
    const importErrors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const result = await processRow(
          row,
          i + 2, // 1-based + header
          run.id,
          duplicateStrategy
        );

        if (result === 'imported') importedRows++;
        else if (result === 'skipped') skippedDuplicates++;
        else if (result === 'updated') updatedExisting++;
      } catch (err) {
        errorRows++;
        importErrors.push({
          row: i + 2,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        importedRows,
        skippedDuplicates,
        updatedExisting,
        errorRows,
        errorsJson: importErrors.length > 0 ? importErrors : undefined,
        completedAt: new Date(),
      },
    });

    // Auto-trigger Google resolution for imported businesses
    try {
      const autoEnabled = await isGoogleAutoResolveEnabled();
      if (autoEnabled && importedRows > 0) {
        const newBusinesses = await prisma.business.findMany({
          where: {
            importRunId: run.id,
            googleResolution: null,
            excluded: false,
          },
          select: { id: true },
        });

        if (newBusinesses.length > 0) {
          await prisma.googleResolutionRun.create({
            data: {
              triggeredBy: 'auto_import',
              businessIds: newBusinesses.map((b) => b.id),
              status: 'pending',
              totalSubmitted: newBusinesses.length,
            },
          });
        }
      }
    } catch (err) {
      console.error('Failed to auto-trigger Google resolution after import:', err);
    }

    return NextResponse.json({
      id: run.id,
      importedRows,
      skippedDuplicates,
      updatedExisting,
      errorRows,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Failed to import leads' },
      { status: 500 }
    );
  }
}

async function processRow(
  row: ImportableRow,
  rowNum: number,
  importRunId: string,
  duplicateStrategy: string
): Promise<'imported' | 'skipped' | 'updated'> {
  if (!row.displayBusinessName?.trim()) {
    throw new Error(`Row ${rowNum}: Missing business name`);
  }

  const normName = normalizeBusinessName(row.displayBusinessName);
  const addrParts = [row.city, row.state, row.zip].filter(Boolean);
  const normAddr =
    addrParts.length > 0 ? normalizeAddress(addrParts.join(' ')) : null;

  // Check for existing business
  const existing = await prisma.business.findFirst({
    where: {
      normalizedBusinessName: normName,
      normalizedAddress: normAddr,
    },
  });

  if (existing && duplicateStrategy === 'skip') {
    return 'skipped';
  }

  if (existing && duplicateStrategy === 'update') {
    await prisma.business.update({
      where: { id: existing.id },
      data: {
        displayBusinessName: row.displayBusinessName,
        county: row.county || existing.county,
        city: row.city || existing.city,
        state: row.state || existing.state,
        zip: row.zip || existing.zip,
        primaryTrade: row.primaryTrade || existing.primaryTrade,
        canonicalLicenseNumber: row.licenseNumber || existing.canonicalLicenseNumber,
        licenseeName: row.licenseeName || existing.licenseeName,
        lastSeenAt: new Date(),
      },
    });

    // Create contact if provided and doesn't exist
    if (row.contactFirstName || row.contactEmail) {
      await upsertContact(existing.id, row);
    }

    return 'updated';
  }

  // Create new or upsert (import_all strategy or no existing)
  const business = await prisma.business.create({
    data: {
      normalizedBusinessName: normName,
      displayBusinessName: row.displayBusinessName,
      normalizedAddress: normAddr,
      county: row.county || null,
      city: row.city || null,
      state: row.state || 'FL',
      zip: row.zip || null,
      primaryTrade: row.primaryTrade || null,
      canonicalLicenseNumber: row.licenseNumber || null,
      licenseeName: row.licenseeName || null,
      latestLicenseStatus: null,
      source: 'csv_import',
      importRunId,
    },
  });

  // Create contact if provided
  if (row.contactFirstName || row.contactEmail) {
    await upsertContact(business.id, row);
  }

  return 'imported';
}

async function upsertContact(businessId: string, row: ImportableRow) {
  const firstName = row.contactFirstName?.trim() || null;
  const lastName = row.contactLastName?.trim() || null;
  const email = row.contactEmail?.trim() || row.email?.trim() || null;
  const phone = row.contactPhone?.trim() || row.phone?.trim() || null;

  if (!firstName && !email) return;

  const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;

  await prisma.contact.create({
    data: {
      businessId,
      firstName,
      lastName,
      fullName,
      title: row.contactTitle?.trim() || null,
      email,
      phone,
      isPreferred: true,
    },
  });
}
