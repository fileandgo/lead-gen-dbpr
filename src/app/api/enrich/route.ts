import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { ENRICHMENT_STAGE, BUSINESS_ENRICHMENT_STATUS } from '@/lib/constants';
import type { EnrichmentMode, EnrichmentConfig } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessIds, filters, enrichmentMode, enrichmentConfig } = body as {
      businessIds?: string[];
      filters?: Record<string, any>;
      enrichmentMode?: EnrichmentMode;
      enrichmentConfig?: EnrichmentConfig;
    };

    let targetIds: string[] = businessIds || [];

    // If no explicit IDs, resolve from filters
    if (!targetIds.length && filters) {
      const where: Prisma.BusinessWhereInput = {
        excluded: false,
      };
      if (filters.county) where.county = filters.county;
      if (filters.trade) where.primaryTrade = filters.trade;
      if (filters.status === 'active') {
        where.latestLicenseStatus = { contains: 'Current, Active', mode: 'insensitive' };
      }
      if (filters.search) {
        where.displayBusinessName = { contains: filters.search, mode: 'insensitive' };
      }

      const businesses = await prisma.business.findMany({
        where,
        select: { id: true },
      });
      targetIds = businesses.map((b) => b.id);
    }

    // Filter out excluded businesses
    if (targetIds.length > 0) {
      const validBusinesses = await prisma.business.findMany({
        where: { id: { in: targetIds }, excluded: false },
        select: { id: true },
      });
      targetIds = validBusinesses.map((b) => b.id);
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'No businesses to enrich' }, { status: 400 });
    }

    // Determine enrichment stage from mode
    let stage: string = ENRICHMENT_STAGE.FULL;
    if (enrichmentMode === 'company_only') {
      stage = ENRICHMENT_STAGE.COMPANY;
    } else if (enrichmentMode === 'contacts_only') {
      stage = ENRICHMENT_STAGE.CONTACTS;
    }

    // Mark businesses as queued
    for (const id of targetIds) {
      await prisma.businessEnrichment.upsert({
        where: { businessId: id },
        update: { enrichmentStatus: BUSINESS_ENRICHMENT_STATUS.QUEUED },
        create: { businessId: id, enrichmentStatus: BUSINESS_ENRICHMENT_STATUS.QUEUED },
      });
    }

    // Create pending enrichment run for the worker to pick up
    const enrichmentRun = await prisma.enrichmentRun.create({
      data: {
        triggeredBy: 'manual',
        filterJson: filters || undefined,
        businessIds: targetIds,
        enrichmentStage: stage,
        enrichmentConfig: enrichmentConfig ? JSON.parse(JSON.stringify(enrichmentConfig)) : undefined,
        status: 'pending',
        totalSubmitted: targetIds.length,
      },
    });

    return NextResponse.json({
      enrichmentRunId: enrichmentRun.id,
      totalSubmitted: targetIds.length,
      enrichmentStage: stage,
      message: 'Enrichment job queued. Worker will process it shortly.',
    });
  } catch (error) {
    console.error('Enrich error:', error);
    return NextResponse.json({ error: 'Failed to start enrichment' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const runs = await prisma.enrichmentRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        enrichmentStage: r.enrichmentStage,
        totalSubmitted: r.totalSubmitted,
        totalEnriched: r.totalEnriched,
        totalFailed: r.totalFailed,
        startedAt: r.startedAt?.toISOString() || null,
        completedAt: r.completedAt?.toISOString() || null,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Enrich list error:', error);
    return NextResponse.json({ error: 'Failed to load enrichment runs' }, { status: 500 });
  }
}
