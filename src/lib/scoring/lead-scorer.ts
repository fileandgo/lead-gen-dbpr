import prisma from '../prisma';
import { TARGET_LICENSE_TYPES } from '../constants';

interface ScoreBreakdown {
  activeLicense: number;
  targetTrade: number;
  countyMatch: number;
  companyMatched: number;
  domainPresent: number;
  preferredContact: number;
  verifiedEmail: number;
  phoneFound: number;
}

/**
 * Score a business lead out of 100 based on data completeness and quality.
 *
 * Scoring breakdown:
 * - Active license: 20 points
 * - Target trade (Construction Industry): 15 points
 * - County match (has county data): 10 points
 * - Company matched confidently via Apollo: 15 points
 * - Domain present: 10 points
 * - Preferred contact found: 15 points
 * - Verified email found: 10 points
 * - Phone found: 5 points
 *
 * Total possible: 100 points
 */
export async function scoreBusiness(businessId: string): Promise<number> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      enrichment: true,
      contacts: { where: { isPreferred: true }, take: 1 },
      businessLicenses: true,
    },
  });

  if (!business) return 0;

  const breakdown: ScoreBreakdown = {
    activeLicense: 0,
    targetTrade: 0,
    countyMatch: 0,
    companyMatched: 0,
    domainPresent: 0,
    preferredContact: 0,
    verifiedEmail: 0,
    phoneFound: 0,
  };

  // Active license (20 pts)
  const hasActiveLicense =
    business.latestLicenseStatus?.toLowerCase().includes('current') &&
    business.latestLicenseStatus?.toLowerCase().includes('active');
  if (hasActiveLicense) breakdown.activeLicense = 20;

  // Target trade (15 pts)
  if (
    business.primaryTrade &&
    TARGET_LICENSE_TYPES.includes(business.primaryTrade as any)
  ) {
    breakdown.targetTrade = 15;
  }

  // County match (10 pts)
  if (business.county) breakdown.countyMatch = 10;

  // Company matched confidently (15 pts)
  if (
    business.enrichment &&
    business.enrichment.apolloMatchConfidence !== 'none'
  ) {
    breakdown.companyMatched = 15;
  }

  // Domain present (10 pts)
  if (business.enrichment?.domain) breakdown.domainPresent = 10;

  // Preferred contact found (15 pts)
  const preferredContact = business.contacts[0];
  if (preferredContact) breakdown.preferredContact = 15;

  // Verified email (10 pts)
  if (preferredContact?.email) {
    if (
      preferredContact.emailStatus === 'valid' ||
      preferredContact.emailStatus === 'verified' ||
      preferredContact.email // If email exists, give points
    ) {
      breakdown.verifiedEmail = 10;
    }
  }

  // Phone found (5 pts)
  if (
    preferredContact?.phone ||
    business.enrichment?.phone
  ) {
    breakdown.phoneFound = 5;
  }

  const totalScore = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  await prisma.leadScore.upsert({
    where: { businessId },
    update: {
      score: totalScore,
      scoreBreakdownJson: breakdown as any,
      primaryContactId: preferredContact?.id || null,
      scoredAt: new Date(),
    },
    create: {
      businessId,
      score: totalScore,
      scoreBreakdownJson: breakdown as any,
      primaryContactId: preferredContact?.id || null,
      scoredAt: new Date(),
    },
  });

  return totalScore;
}

/**
 * Score all businesses that don't have scores yet.
 */
export async function scoreAllUnscored(): Promise<number> {
  const businesses = await prisma.business.findMany({
    where: { leadScore: { is: null } },
    select: { id: true },
  });

  let scored = 0;
  for (const b of businesses) {
    await scoreBusiness(b.id);
    scored++;
  }

  return scored;
}
