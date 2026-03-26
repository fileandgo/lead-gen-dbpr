import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await prisma.business.findUnique({
      where: { id: params.id },
      include: {
        businessLicenses: {
          include: { rawLicense: true },
        },
        enrichment: true,
        googleResolution: true,
        contacts: { orderBy: { isPreferred: 'desc' } },
        leadScore: true,
      },
    });

    if (!business) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: business.id,
      displayBusinessName: business.displayBusinessName,
      normalizedBusinessName: business.normalizedBusinessName,
      normalizedAddress: business.normalizedAddress,
      county: business.county,
      licenseeName: business.licenseeName,
      city: business.city,
      state: business.state,
      zip: business.zip,
      primaryTrade: business.primaryTrade,
      latestLicenseStatus: business.latestLicenseStatus,
      canonicalLicenseNumber: business.canonicalLicenseNumber,
      excluded: business.excluded,
      firstSeenAt: business.firstSeenAt.toISOString(),
      lastSeenAt: business.lastSeenAt.toISOString(),
      licenses: business.businessLicenses.map((bl) => ({
        id: bl.id,
        licenseType: bl.licenseType,
        licenseNumber: bl.licenseNumber,
        status: bl.status,
        expirationDate: bl.expirationDate,
      })),
      googleResolution: business.googleResolution
        ? {
            resolvedName: business.googleResolution.resolvedName,
            resolvedDomain: business.googleResolution.resolvedDomain,
            resolvedWebsite: business.googleResolution.resolvedWebsite,
            resolvedPhone: business.googleResolution.resolvedPhone,
            resolvedAddress: business.googleResolution.resolvedAddress,
            matchStatus: business.googleResolution.matchStatus,
            confidence: business.googleResolution.confidence,
            searchQuery: business.googleResolution.searchQuery,
            resolvedAt: business.googleResolution.resolvedAt.toISOString(),
          }
        : null,
      enrichment: business.enrichment
        ? {
            companyName: business.enrichment.companyName,
            domain: business.enrichment.domain,
            website: business.enrichment.website,
            linkedinUrl: business.enrichment.linkedinUrl,
            phone: business.enrichment.phone,
            employeeCount: business.enrichment.employeeCount,
            estimatedRevenue: business.enrichment.estimatedRevenue,
            apolloMatchConfidence: business.enrichment.apolloMatchConfidence,
            enrichmentStrategy: business.enrichment.enrichmentStrategy,
            enrichmentStatus: business.enrichment.enrichmentStatus,
            errorReason: business.enrichment.errorReason,
            enrichedAt: business.enrichment.enrichedAt.toISOString(),
          }
        : null,
      contacts: business.contacts.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        fullName: c.fullName,
        title: c.title,
        email: c.email,
        phone: c.phone,
        linkedinUrl: c.linkedinUrl,
        emailStatus: c.emailStatus,
        isPreferred: c.isPreferred,
        contactRankScore: c.contactRankScore,
        titleBucket: c.titleBucket,
        contactRankReasons: c.contactRankReasons as string[] | null,
      })),
      score: business.leadScore
        ? {
            score: business.leadScore.score,
            manualOverride: business.leadScore.manualOverride,
            scoreBreakdownJson: business.leadScore.scoreBreakdownJson as Record<string, number>,
            scoredAt: business.leadScore.scoredAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    console.error('Lead detail error:', error);
    return NextResponse.json({ error: 'Failed to load lead' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();

    if (body.manualOverride !== undefined) {
      await prisma.leadScore.upsert({
        where: { businessId: params.id },
        update: { manualOverride: body.manualOverride },
        create: {
          businessId: params.id,
          score: 0,
          scoreBreakdownJson: {},
          manualOverride: body.manualOverride,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Lead update error:', error);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}
