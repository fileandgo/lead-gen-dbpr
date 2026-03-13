import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const runs = await prisma.scrapeRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id,
        county: r.county,
        selectedLicenseTypes: r.selectedLicenseTypes,
        status: r.status,
        totalRawRecords: r.totalRawRecords,
        totalUniqueRecords: r.totalUniqueRecords,
        startedAt: r.startedAt?.toISOString() || null,
        completedAt: r.completedAt?.toISOString() || null,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Scrape list error:', error);
    return NextResponse.json({ error: 'Failed to load scrape runs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { county, licenseTypes } = body;

    if (!county || !licenseTypes || licenseTypes.length === 0) {
      return NextResponse.json(
        { error: 'County and at least one license type are required' },
        { status: 400 }
      );
    }

    const run = await prisma.scrapeRun.create({
      data: {
        county,
        selectedLicenseTypes: licenseTypes,
        status: 'pending',
      },
    });

    return NextResponse.json({
      id: run.id,
      status: run.status,
      message: 'Scrape job created. Worker will pick it up shortly.',
    });
  } catch (error) {
    console.error('Scrape create error:', error);
    return NextResponse.json({ error: 'Failed to create scrape job' }, { status: 500 });
  }
}
