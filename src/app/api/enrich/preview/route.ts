import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { EnrichmentPreview, EnrichmentWarning } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessIds, filters } = body;

    const where: Prisma.BusinessWhereInput = {};

    if (businessIds?.length) {
      where.id = { in: businessIds };
    } else if (filters) {
      if (filters.county) where.county = filters.county;
      if (filters.trade) where.primaryTrade = filters.trade;
      if (filters.status === 'active') {
        where.latestLicenseStatus = { contains: 'Current, Active', mode: 'insensitive' };
      }
      if (filters.excluded === 'included') {
        where.excluded = false;
      } else if (filters.excluded === 'excluded') {
        where.excluded = true;
      }
      if (filters.search) {
        where.displayBusinessName = { contains: filters.search, mode: 'insensitive' };
      }
    }

    const totalCount = await prisma.business.count({ where });

    const businesses = await prisma.business.findMany({
      where,
      include: {
        enrichment: true,
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
    });

    const previews: EnrichmentPreview[] = businesses.map((b) => {
      const warnings: EnrichmentWarning[] = [];

      if (!b.displayBusinessName || b.displayBusinessName.trim() === '') {
        warnings.push('no_business_name');
      }
      if (b.enrichment && b.enrichment.enrichmentStatus === 'completed') {
        warnings.push('already_enriched');
      }
      if (b.excluded) {
        warnings.push('excluded');
      }
      if (!b.normalizedAddress) {
        warnings.push('no_address');
      }
      if (!b.city) {
        warnings.push('missing_city');
      }
      if (b.enrichment && !b.enrichment.domain && b.enrichment.enrichmentStatus !== 'completed') {
        // Only flag no_domain for businesses that have been partially enriched
      }
      if (b.enrichment?.domain === null && b.enrichment.enrichmentStatus === 'completed') {
        warnings.push('no_domain');
      }
      if (b.enrichment?.apolloMatchConfidence === 'none' || b.enrichment?.apolloMatchConfidence === 'low') {
        warnings.push('weak_match');
      }
      if (b.lastExportedAt) {
        warnings.push('already_exported');
      }
      // Heuristic: owner-operated if licensee name looks like an individual
      // and business name doesn't have corp indicators
      if (
        b.licenseeName &&
        !b.displayBusinessName.match(/\b(LLC|INC|CORP|CO|COMPANY)\b/i) &&
        b.licenseeName.match(/^[A-Z]+,\s+[A-Z]/)
      ) {
        warnings.push('likely_owner_operated');
      }

      const enrichmentStatus = b.enrichment
        ? (b.enrichment.enrichmentStatus === 'completed' ? 'enriched' as const :
           b.enrichment.enrichmentStatus === 'company_done' ? 'company_done' as const :
           b.enrichment.enrichmentStatus === 'queued' ? 'queued' as const :
           b.enrichment.enrichmentStatus === 'partial' ? 'partial' as const :
           b.enrichment.enrichmentStatus === 'failed' ? 'failed' as const :
           'enriched' as const)
        : 'none' as const;

      return {
        id: b.id,
        displayBusinessName: b.displayBusinessName,
        county: b.county,
        primaryTrade: b.primaryTrade,
        city: b.city,
        domain: b.enrichment?.domain || null,
        enrichmentStatus,
        excluded: b.excluded,
        exported: !!b.lastExportedAt,
        matchConfidence: b.enrichment?.apolloMatchConfidence || null,
        warnings,
      };
    });

    const readyCount = previews.filter((p) =>
      !p.warnings.includes('already_enriched') && !p.warnings.includes('excluded')
    ).length;
    const alreadyEnrichedCount = previews.filter((p) => p.warnings.includes('already_enriched')).length;
    const excludedCount = previews.filter((p) => p.warnings.includes('excluded')).length;

    return NextResponse.json({
      previews,
      totalCount,
      readyCount,
      alreadyEnrichedCount,
      excludedCount,
    });
  } catch (error) {
    console.error('Enrich preview error:', error);
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 });
  }
}
