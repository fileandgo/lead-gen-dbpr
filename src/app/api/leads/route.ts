import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { EnrichmentStatusValue } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const county = url.searchParams.get('county');
    const trade = url.searchParams.get('trade');
    const status = url.searchParams.get('status');
    const enriched = url.searchParams.get('enriched');
    const googleStatus = url.searchParams.get('googleStatus');
    const excluded = url.searchParams.get('excluded') || 'included';
    const hasBusinessName = url.searchParams.get('hasBusinessName');
    const scoreMin = url.searchParams.get('scoreMin');
    const scoreMax = url.searchParams.get('scoreMax');
    const search = url.searchParams.get('search');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '25');

    const where: Prisma.BusinessWhereInput = {};

    // Excluded filter (default: show only included)
    if (excluded === 'included') {
      where.excluded = false;
    } else if (excluded === 'excluded') {
      where.excluded = true;
    }

    if (county) where.county = county;
    if (trade) where.primaryTrade = trade;
    if (status === 'active') {
      where.latestLicenseStatus = { contains: 'Current, Active', mode: 'insensitive' };
    } else if (status === 'current') {
      where.latestLicenseStatus = { contains: 'Current', mode: 'insensitive' };
    }
    if (enriched === 'enriched') {
      where.enrichment = { isNot: null };
    } else if (enriched === 'not_enriched') {
      where.enrichment = { is: null };
    }
    if (googleStatus === 'matched') {
      where.googleResolution = { matchStatus: 'matched' };
    } else if (googleStatus === 'possible') {
      where.googleResolution = { matchStatus: 'possible' };
    } else if (googleStatus === 'no_match') {
      where.googleResolution = { matchStatus: 'no_match' };
    } else if (googleStatus === 'pending') {
      where.googleResolution = { matchStatus: 'pending' };
    } else if (googleStatus === 'not_resolved') {
      where.googleResolution = { is: null };
    }
    if (hasBusinessName === 'yes') {
      where.displayBusinessName = { not: '' };
    }
    if (search) {
      where.displayBusinessName = { contains: search, mode: 'insensitive' };
    }

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        include: {
          enrichment: true,
          leadScore: true,
          contacts: { where: { isPreferred: true }, take: 1 },
          googleResolution: true,
        },
        orderBy: { lastSeenAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.business.count({ where }),
    ]);

    let filteredLeads = businesses;
    if (scoreMin) {
      filteredLeads = filteredLeads.filter(
        (b) => (b.leadScore?.manualOverride ?? b.leadScore?.score ?? 0) >= parseInt(scoreMin)
      );
    }
    if (scoreMax) {
      filteredLeads = filteredLeads.filter(
        (b) => (b.leadScore?.manualOverride ?? b.leadScore?.score ?? 0) <= parseInt(scoreMax)
      );
    }

    const leads = filteredLeads.map((b) => {
      const preferredContact = b.contacts[0] || null;

      let enrichmentStatus: EnrichmentStatusValue = 'none';
      if (b.enrichment) {
        const s = b.enrichment.enrichmentStatus;
        if (s === 'completed') enrichmentStatus = 'enriched';
        else if (s === 'company_done') enrichmentStatus = 'company_done';
        else if (s === 'queued') enrichmentStatus = 'queued';
        else if (s === 'partial') enrichmentStatus = 'partial';
        else if (s === 'failed') enrichmentStatus = 'failed';
        else enrichmentStatus = 'enriched';
      }

      return {
        id: b.id,
        displayBusinessName: b.displayBusinessName,
        licenseeName: b.licenseeName || null,
        primaryTrade: b.primaryTrade,
        canonicalLicenseNumber: b.canonicalLicenseNumber,
        latestLicenseStatus: b.latestLicenseStatus,
        county: b.county,
        city: b.city || null,
        normalizedAddress: b.normalizedAddress,
        firstSeenAt: b.firstSeenAt.toISOString(),
        lastSeenAt: b.lastSeenAt.toISOString(),
        enrichmentStatus,
        googleResolutionStatus: b.googleResolution?.matchStatus ?? null,
        googleResolvedDomain: b.googleResolution?.resolvedDomain ?? null,
        excluded: b.excluded,
        score: b.leadScore?.manualOverride ?? b.leadScore?.score ?? null,
        manualOverride: b.leadScore?.manualOverride ?? null,
        hasEmail: !!preferredContact?.email,
        preferredContactName: preferredContact?.fullName ?? null,
        preferredContactTitle: preferredContact?.title ?? null,
        preferredContactEmail: preferredContact?.email ?? null,
        preferredContactTitleBucket: preferredContact?.titleBucket ?? null,
      };
    });

    return NextResponse.json({ leads, total });
  } catch (error) {
    console.error('Leads error:', error);
    return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
  }
}
