import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const [
      totalBusinesses,
      enrichedCount,
      partialCount,
      failedCount,
      leadsWithEmail,
      scoreAgg,
      googleMatchedCount,
      googlePossibleCount,
      googleNoMatchCount,
      recentScrapes,
      recentEnrichmentRuns,
      recentErrors,
    ] = await Promise.all([
      prisma.business.count(),
      prisma.businessEnrichment.count({ where: { enrichmentStatus: 'completed' } }),
      prisma.businessEnrichment.count({ where: { enrichmentStatus: 'partial' } }),
      prisma.businessEnrichment.count({ where: { enrichmentStatus: 'failed' } }),
      prisma.contact.count({ where: { email: { not: null }, isPreferred: true } }),
      prisma.leadScore.aggregate({ _avg: { score: true } }),
      prisma.googleResolution.count({ where: { matchStatus: 'matched' } }),
      prisma.googleResolution.count({ where: { matchStatus: 'possible' } }),
      prisma.googleResolution.count({ where: { matchStatus: 'no_match' } }),
      prisma.scrapeRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.enrichmentRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.businessEnrichment.findMany({
        where: { enrichmentStatus: { in: ['partial', 'failed'] } },
        include: { business: { select: { displayBusinessName: true, county: true } } },
        orderBy: { enrichedAt: 'desc' },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      totalBusinesses,
      enrichedBusinesses: enrichedCount,
      partialBusinesses: partialCount,
      failedBusinesses: failedCount,
      leadsWithEmail,
      averageScore: Math.round(scoreAgg._avg?.score ?? 0),
      googleMatched: googleMatchedCount,
      googlePossible: googlePossibleCount,
      googleNoMatch: googleNoMatchCount,
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
      recentEnrichmentRuns: recentEnrichmentRuns.map((r) => ({
        id: r.id,
        status: r.status,
        enrichmentStage: r.enrichmentStage,
        totalSubmitted: r.totalSubmitted,
        totalEnriched: r.totalEnriched,
        totalFailed: r.totalFailed,
        errorMessage: r.errorMessage,
        startedAt: r.startedAt?.toISOString() || null,
        completedAt: r.completedAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
      })),
      recentEnrichmentErrors: recentErrors.map((e) => ({
        id: e.id,
        businessId: e.businessId,
        businessName: e.business?.displayBusinessName ?? 'Unknown',
        county: e.business?.county ?? '',
        enrichmentStatus: e.enrichmentStatus,
        errorReason: e.errorReason,
        enrichedAt: e.enrichedAt?.toISOString() ?? new Date().toISOString(),
      })),
    });
  } catch (error) {
    console.error('Dashboard error:', error instanceof Error ? error.message : error);
    console.error('Dashboard stack:', error instanceof Error ? error.stack : '');
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
