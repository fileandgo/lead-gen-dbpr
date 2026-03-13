import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const run = await prisma.scrapeRun.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { rawLicenses: true } },
      },
    });

    if (!run) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: run.id,
      county: run.county,
      selectedLicenseTypes: run.selectedLicenseTypes,
      status: run.status,
      totalRawRecords: run.totalRawRecords,
      totalUniqueRecords: run.totalUniqueRecords,
      startedAt: run.startedAt?.toISOString() || null,
      completedAt: run.completedAt?.toISOString() || null,
      errorMessage: run.errorMessage,
      createdAt: run.createdAt.toISOString(),
      rawLicenseCount: run._count.rawLicenses,
    });
  } catch (error) {
    console.error('Scrape detail error:', error);
    return NextResponse.json({ error: 'Failed to load scrape run' }, { status: 500 });
  }
}
