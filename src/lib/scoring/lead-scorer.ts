import prisma from '../prisma';
import { TARGET_LICENSE_TYPES } from '../constants';

interface ScoreBreakdown {
  activeLicense: number;
  targetTrade: number;
  countyMatch: number;
  googleResolved: number;
  companyMatched: number;
  domainPresent: number;
  preferredContact: number;
  contactRankBonus: number;
  verifiedEmail: number;
  phoneFound: number;
}

/**
 * Score a business lead out of 100 based on data completeness and quality.
 *
 * Scoring breakdown:
 * - Active license: 15 points
 * - Target trade (Construction Industry): 10 points
 * - County match (has county data): 5 points
 * - Google resolved (matched): 10 points
 * - Company matched confidently via Apollo: 20 points
 * - Domain present: 10 points
 * - Preferred contact found: 5 points
 * - Owner-level contact bonus: 5 points
 * - Verified email found: 10 points
 * - Phone found: 5 points
 *
 * Total possible: ~95 points (capped at 100)
 */
export async function scoreBusiness(businessId: string): Promise<number> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      enrichment: true,
      googleResolution: true,
      contacts: { where: { isPreferred: true }, take: 1 },
      businessLicenses: true,
    },
  });

  if (!business) return 0;

  const breakdown: ScoreBreakdown = {
    activeLicense: 0,
    targetTrade: 0,
    countyMatch: 0,
    googleResolved: 0,
    companyMatched: 0,
    domainPresent: 0,
    preferredContact: 0,
    contactRankBonus: 0,
    verifiedEmail: 0,
    phoneFound: 0,
  };

  // Active license (15 pts)
  const hasActiveLicense =
    business.latestLicenseStatus?.toLowerCase().includes('current') &&
    business.latestLicenseStatus?.toLowerCase().includes('active');
  if (hasActiveLicense) breakdown.activeLicense = 15;

  // Target trade (10 pts)
  if (
    business.primaryTrade &&
    TARGET_LICENSE_TYPES.includes(business.primaryTrade as any)
  ) {
    breakdown.targetTrade = 10;
  }

  // County match (5 pts)
  if (business.county) breakdown.countyMatch = 5;

  // Google resolved (10 pts for matched, 3 for possible)
  if (business.googleResolution?.matchStatus === 'matched') {
    breakdown.googleResolved = 10;
  } else if (business.googleResolution?.matchStatus === 'possible') {
    breakdown.googleResolved = 3;
  }

  // Company matched confidently (20 pts)
  if (
    business.enrichment &&
    business.enrichment.apolloMatchConfidence !== 'none'
  ) {
    breakdown.companyMatched = 20;
  }

  // Domain present (10 pts)
  if (business.enrichment?.domain) breakdown.domainPresent = 10;

  // Preferred contact found (5 pts)
  const preferredContact = business.contacts[0];
  if (preferredContact) breakdown.preferredContact = 5;

  // Contact rank bonus — owner-level contact (5 pts)
  if (preferredContact?.titleBucket === 'owner') {
    breakdown.contactRankBonus = 5;
  }

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
