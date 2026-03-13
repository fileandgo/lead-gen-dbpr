import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const [totalBusinesses, enrichedBusinesses, leadsWithEmail, scoreAgg, recentScrapes] =
      await Promise.all([
        prisma.business.count(),
        prisma.businessEnrichment.count(),
        prisma.contact.count({ where: { email: { not: null }, isPreferred: true } }),
        prisma.leadScore.aggregate({ _avg: { score: true } }),
        prisma.scrapeRun.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

    return NextResponse.json({
      totalBusinesses,
      enrichedBusinesses,
      leadsWithEmail,
      averageScore: Math.round(scoreAgg._avg.score || 0),
      recentScrapes: recentScrapes.map((r) => ({
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
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
