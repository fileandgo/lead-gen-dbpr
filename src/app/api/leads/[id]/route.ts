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
      primaryTrade: business.primaryTrade,
      latestLicenseStatus: business.latestLicenseStatus,
      canonicalLicenseNumber: business.canonicalLicenseNumber,
      firstSeenAt: business.firstSeenAt.toISOString(),
      lastSeenAt: business.lastSeenAt.toISOString(),
      licenses: business.businessLicenses.map((bl) => ({
        id: bl.id,
        licenseType: bl.licenseType,
        licenseNumber: bl.licenseNumber,
        status: bl.status,
        expirationDate: bl.expirationDate,
      })),
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
