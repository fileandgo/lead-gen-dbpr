import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { GOOGLE_RESOLUTION_STATUS } from '@/lib/constants';

/**
 * POST /api/google-resolve
 * Trigger Google business resolution for specific leads or filtered set.
 * Body: { businessIds?: string[], filters?: object, triggeredBy?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessIds, filters, triggeredBy } = body as {
      businessIds?: string[];
      filters?: Record<string, unknown>;
      triggeredBy?: string;
    };

    let targetIds: string[] = businessIds || [];

    // Resolve from filters if no explicit IDs
    if (!targetIds.length && filters) {
      const where: Prisma.BusinessWhereInput = { excluded: false };
      if (filters.county) where.county = filters.county as string;
      if (filters.trade) where.primaryTrade = filters.trade as string;
      if (filters.search) {
        where.displayBusinessName = { contains: filters.search as string, mode: 'insensitive' };
      }

      const businesses = await prisma.business.findMany({
        where,
        select: { id: true },
      });
      targetIds = businesses.map((b) => b.id);
    }

    // Filter out excluded
    if (targetIds.length > 0) {
      const valid = await prisma.business.findMany({
        where: { id: { in: targetIds }, excluded: false },
        select: { id: true },
      });
      targetIds = valid.map((b) => b.id);
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'No businesses to resolve' }, { status: 400 });
    }

    // Mark pending
    for (const id of targetIds) {
      await prisma.googleResolution.upsert({
        where: { businessId: id },
        update: { matchStatus: GOOGLE_RESOLUTION_STATUS.PENDING },
        create: { businessId: id, matchStatus: GOOGLE_RESOLUTION_STATUS.PENDING },
      });
    }

    // Create run for worker to pick up
    const run = await prisma.googleResolutionRun.create({
      data: {
        triggeredBy: triggeredBy || 'manual',
        businessIds: targetIds,
        status: 'pending',
        totalSubmitted: targetIds.length,
      },
    });

    return NextResponse.json({
      googleResolutionRunId: run.id,
      totalSubmitted: targetIds.length,
      message: 'Google resolution job queued. Worker will process it shortly.',
    });
  } catch (error) {
    console.error('Google resolve error:', error);
    return NextResponse.json({ error: 'Failed to start Google resolution' }, { status: 500 });
  }
}

/**
 * GET /api/google-resolve
 * List recent Google resolution runs.
 */
export async function GET() {
  try {
    const runs = await prisma.googleResolutionRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        triggeredBy: r.triggeredBy,
        totalSubmitted: r.totalSubmitted,
        totalMatched: r.totalMatched,
        totalPossible: r.totalPossible,
        totalNoMatch: r.totalNoMatch,
        totalFailed: r.totalFailed,
        startedAt: r.startedAt?.toISOString() || null,
        completedAt: r.completedAt?.toISOString() || null,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Google resolve list error:', error);
    return NextResponse.json({ error: 'Failed to load Google resolution runs' }, { status: 500 });
  }
}
