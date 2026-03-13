import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const county = url.searchParams.get('county');
    const trade = url.searchParams.get('trade');
    const status = url.searchParams.get('status');
    const enriched = url.searchParams.get('enriched');
    const scoreMin = url.searchParams.get('scoreMin');
    const scoreMax = url.searchParams.get('scoreMax');
    const search = url.searchParams.get('search');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '25');

    const where: Prisma.BusinessWhereInput = {};

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
      return {
        id: b.id,
        displayBusinessName: b.displayBusinessName,
        licenseeName: b.displayBusinessName,
        primaryTrade: b.primaryTrade,
        canonicalLicenseNumber: b.canonicalLicenseNumber,
        latestLicenseStatus: b.latestLicenseStatus,
        county: b.county,
        city: null,
        normalizedAddress: b.normalizedAddress,
        firstSeenAt: b.firstSeenAt.toISOString(),
        lastSeenAt: b.lastSeenAt.toISOString(),
        enrichmentStatus: b.enrichment ? 'enriched' : 'none',
        score: b.leadScore?.manualOverride ?? b.leadScore?.score ?? null,
        manualOverride: b.leadScore?.manualOverride ?? null,
        hasEmail: !!preferredContact?.email,
        preferredContactName: preferredContact?.fullName ?? null,
        preferredContactTitle: preferredContact?.title ?? null,
        preferredContactEmail: preferredContact?.email ?? null,
      };
    });

    return NextResponse.json({ leads, total });
  } catch (error) {
    console.error('Leads error:', error);
    return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
  }
}
