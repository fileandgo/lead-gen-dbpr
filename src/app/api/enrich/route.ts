import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { enrichBusiness } from '@/lib/enrichment/apollo';
import { scoreBusiness } from '@/lib/scoring/lead-scorer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessIds, filters } = body;

    let targetIds: string[] = businessIds || [];

    if (!targetIds.length && filters) {
      const businesses = await prisma.business.findMany({
        where: {
          enrichment: { is: null },
          ...(filters.county ? { county: filters.county } : {}),
          ...(filters.trade ? { primaryTrade: filters.trade } : {}),
        },
        select: { id: true },
        take: 100,
      });
      targetIds = businesses.map((b) => b.id);
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'No businesses to enrich' }, { status: 400 });
    }

    const enrichmentRun = await prisma.enrichmentRun.create({
      data: {
        triggeredBy: 'manual',
        filterJson: filters || { businessIds: targetIds },
        status: 'running',
        totalSubmitted: targetIds.length,
        startedAt: new Date(),
      },
    });

    // Process enrichment in background (non-blocking)
    processEnrichment(enrichmentRun.id, targetIds).catch(console.error);

    return NextResponse.json({
      enrichmentRunId: enrichmentRun.id,
      totalSubmitted: targetIds.length,
      message: 'Enrichment started',
    });
  } catch (error) {
    console.error('Enrich error:', error);
    return NextResponse.json({ error: 'Failed to start enrichment' }, { status: 500 });
  }
}

async function processEnrichment(runId: string, businessIds: string[]) {
  let enriched = 0;
  let failed = 0;

  for (const businessId of businessIds) {
    try {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
      });

      if (!business) {
        failed++;
        continue;
      }

      await enrichBusiness(business);
      await scoreBusiness(businessId);
      enriched++;
    } catch (error) {
      console.error(`Enrichment failed for ${businessId}:`, error);
      failed++;
    }
  }

  await prisma.enrichmentRun.update({
    where: { id: runId },
    data: {
      status: 'completed',
      totalEnriched: enriched,
      totalFailed: failed,
      completedAt: new Date(),
    },
  });
}
