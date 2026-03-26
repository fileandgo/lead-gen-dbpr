import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateCSV } from '@/lib/export/csv-exporter';
import { Prisma } from '@prisma/client';

export async function GET() {
  try {
    const exports = await prisma.exportRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      exports: exports.map((e) => ({
        id: e.id,
        filterJson: e.filterJson,
        totalExported: e.totalExported,
        fileName: e.fileName,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Export list error:', error);
    return NextResponse.json({ error: 'Failed to load exports' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const filters = await req.json();

    const where: Prisma.BusinessWhereInput = {
      excluded: false,
    };
    if (filters.county) where.county = filters.county;
    if (filters.trade) where.primaryTrade = filters.trade;
    if (filters.activeOnly || filters.status === 'active') {
      where.latestLicenseStatus = { contains: 'Current, Active', mode: 'insensitive' };
    }
    if (filters.enrichedOnly || filters.enriched === 'enriched') {
      where.enrichment = { isNot: null };
    }
    if (filters.hasEmailOnly) {
      where.contacts = { some: { email: { not: null }, isPreferred: true } };
    }

    const businesses = await prisma.business.findMany({
      where,
      include: {
        enrichment: true,
        contacts: {
          where: filters.preferredOnly ? { isPreferred: true } : {},
          orderBy: { isPreferred: 'desc' },
          take: 1,
        },
        leadScore: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    let filtered = businesses;
    if (filters.scoreMin !== undefined) {
      filtered = filtered.filter(
        (b) => (b.leadScore?.manualOverride ?? b.leadScore?.score ?? 0) >= filters.scoreMin
      );
    }
    if (filters.scoreMax !== undefined) {
      filtered = filtered.filter(
        (b) => (b.leadScore?.manualOverride ?? b.leadScore?.score ?? 0) <= filters.scoreMax
      );
    }
    if (filters.title) {
      filtered = filtered.filter((b) =>
        b.contacts.some((c) => c.title?.toLowerCase().includes(filters.title.toLowerCase()))
      );
    }

    // Filter by title bucket if specified
    if (filters.titleMode && filters.titleMode !== 'mixed') {
      filtered = filtered.filter((b) =>
        b.contacts.some((c) => (c as any).titleBucket === filters.titleMode)
      );
    }

    const csv = generateCSV(filtered);
    const fileName = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;

    await prisma.exportRun.create({
      data: {
        filterJson: filters,
        totalExported: filtered.length,
        fileName,
      },
    });

    // Track export on each business
    const exportedIds = filtered.map((b) => b.id);
    if (exportedIds.length > 0) {
      await prisma.business.updateMany({
        where: { id: { in: exportedIds } },
        data: {
          lastExportedAt: new Date(),
          exportCount: { increment: 1 },
        },
      });
    }

    return NextResponse.json({ csv, fileName, totalExported: filtered.length });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to generate export' }, { status: 500 });
  }
}
