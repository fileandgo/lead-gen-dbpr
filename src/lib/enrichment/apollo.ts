import prisma from '../prisma';
import { PREFERRED_CONTACT_TITLES, BUSINESS_ENRICHMENT_STATUS, ENRICHMENT_PRESETS, GOOGLE_RESOLUTION_STATUS } from '../constants';
import { rankContacts } from './contact-ranker';
import type { Business } from '@prisma/client';
import type { EnrichmentConfig } from '@/types';

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const APOLLO_BASE = 'https://api.apollo.io/v1';

interface ApolloOrg {
  id: string;
  name: string;
  website_url: string | null;
  primary_domain: string | null;
  linkedin_url: string | null;
  phone: string | null;
  estimated_num_employees: number | null;
  annual_revenue: number | null;
  annual_revenue_printed: string | null;
}

interface ApolloContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  title: string | null;
  seniority: string | null;
  email: string | null;
  phone_numbers: { raw_number: string }[];
  linkedin_url: string | null;
  email_status: string | null;
}

export interface CompanyEnrichResult {
  success: boolean;
  apolloOrgId: string | null;
  domain: string | null;
  matchConfidence: string;
}

export interface ContactEnrichResult {
  success: boolean;
  contactCount: number;
}

/**
 * Detect if a name looks like an individual (e.g., "SMITH, JOHN MICHAEL")
 * rather than a business (e.g., "WRIGHT NOW CONSTRUCTION LLC").
 */
function looksLikeIndividualName(name: string): boolean {
  const businessIndicators = /\b(LLC|INC|CORP|CO|COMPANY|CONSTRUCTION|ROOFING|PLUMBING|ELECTRIC|MECHANICAL|CONTRACTING|ENTERPRISES|SERVICES|BUILDERS|GROUP|SOLUTIONS|SYSTEMS|ASSOCIATES)\b/i;
  if (businessIndicators.test(name)) return false;

  // "LAST, FIRST" format
  if (/^[A-Z]+,\s+[A-Z]/.test(name.trim())) return true;

  // Short name with no business words (2-3 words, all caps)
  const words = name.trim().split(/\s+/);
  if (words.length <= 3 && words.every(w => /^[A-Z]+$/.test(w))) return true;

  return false;
}

/**
 * Parse "SMITH, JOHN MICHAEL" → { firstName: "John", lastName: "Smith" }
 */
function parseIndividualName(name: string): { firstName: string; lastName: string } | null {
  const commaMatch = name.match(/^([A-Z][A-Z'-]+),\s+([A-Z][A-Z'-]+)/i);
  if (commaMatch) {
    return {
      firstName: commaMatch[2].charAt(0) + commaMatch[2].slice(1).toLowerCase(),
      lastName: commaMatch[1].charAt(0) + commaMatch[1].slice(1).toLowerCase(),
    };
  }

  // "JOHN SMITH" format
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return {
      firstName: words[0].charAt(0) + words[0].slice(1).toLowerCase(),
      lastName: words[words.length - 1].charAt(0) + words[words.length - 1].slice(1).toLowerCase(),
    };
  }

  return null;
}

/**
 * Search Apollo for an individual using the People Match (enrichment) endpoint.
 * Uses first_name, last_name, and optionally organization_name for context.
 */
async function searchPerson(
  firstName: string,
  lastName: string,
  organizationName?: string
): Promise<ApolloContact | null> {
  const params = new URLSearchParams();
  params.set('first_name', firstName);
  params.set('last_name', lastName);
  if (organizationName) {
    params.set('organization_name', organizationName);
  }
  params.set('reveal_personal_emails', 'true');

  const res = await fetch(`https://api.apollo.io/api/v1/people/match?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': APOLLO_API_KEY!,
    },
  });

  if (!res.ok) {
    console.warn(`[Apollo] People match error: ${res.status} ${res.statusText}`);
    return null;
  }

  const data = await res.json();
  const person = data.person;
  if (!person) return null;

  return {
    id: person.id,
    first_name: person.first_name || null,
    last_name: person.last_name || null,
    name: person.name || null,
    title: person.title || null,
    seniority: person.seniority || null,
    email: person.email || null,
    phone_numbers: person.phone_numbers || [],
    linkedin_url: person.linkedin_url || null,
    email_status: person.email_status || null,
  };
}

/**
 * Save a person-based enrichment match and create a Contact.
 */
async function savePersonEnrichment(
  business: Business,
  person: ApolloContact,
  strategy: string
): Promise<CompanyEnrichResult> {
  await prisma.businessEnrichment.upsert({
    where: { businessId: business.id },
    update: {
      companyName: null, // Person match — no company data available
      phone: person.phone_numbers?.[0]?.raw_number || null,
      linkedinUrl: person.linkedin_url,
      apolloMatchConfidence: 'medium',
      enrichmentStrategy: strategy,
      enrichmentStatus: BUSINESS_ENRICHMENT_STATUS.COMPLETED,
      enrichedAt: new Date(),
      errorReason: null,
    },
    create: {
      businessId: business.id,
      companyName: null,
      phone: person.phone_numbers?.[0]?.raw_number || null,
      linkedinUrl: person.linkedin_url,
      apolloMatchConfidence: 'medium',
      enrichmentStrategy: strategy,
      enrichmentStatus: BUSINESS_ENRICHMENT_STATUS.COMPLETED,
      enrichedAt: new Date(),
    },
  });

  // Create a Contact record directly from the person match
  await prisma.contact.create({
    data: {
      businessId: business.id,
      firstName: person.first_name,
      lastName: person.last_name,
      fullName: person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim(),
      title: person.title,
      seniority: person.seniority,
      email: person.email,
      phone: person.phone_numbers?.[0]?.raw_number || null,
      linkedinUrl: person.linkedin_url,
      emailStatus: person.email_status,
      apolloContactId: person.id,
      isPreferred: true,
    },
  }).catch(() => {}); // May already exist

  return { success: true, apolloOrgId: null, domain: null, matchConfidence: 'medium' };
}

/**
 * Stage 1: Enrich company data using multi-strategy cascading search.
 *
 * Strategies (tried in order):
 * 1. DBA name + city         → org search
 * 2. DBA name + county       → org search
 * 3. DBA name + state only   → org search
 * 4. Person by licenseeName  → people search (Primary/individual name)
 * 5. Person by displayName   → people search (if display name looks like an individual)
 */
export async function enrichCompany(business: Business): Promise<CompanyEnrichResult> {
  if (!APOLLO_API_KEY) {
    console.warn('[Apollo] No API key configured. Skipping enrichment.');
    return { success: false, apolloOrgId: null, domain: null, matchConfidence: 'none' };
  }

  const displayName = business.displayBusinessName;
  const licenseeName = (business as Record<string, unknown>).licenseeName as string | null;
  const city = (business as Record<string, unknown>).city as string | null;
  const county = business.county;
  const isIndividualDisplay = looksLikeIndividualName(displayName);

  try {
    // Strategy 0: Use Google-resolved domain if available (highest priority)
    const googleResolution = await prisma.googleResolution.findUnique({
      where: { businessId: business.id },
    });

    if (googleResolution?.resolvedDomain && googleResolution.matchStatus === GOOGLE_RESOLUTION_STATUS.MATCHED) {
      console.log(`[Apollo] Strategy 0: using Google-resolved domain "${googleResolution.resolvedDomain}" for "${displayName}"`);
      const org = await searchOrganizationByDomain(googleResolution.resolvedDomain);
      if (org) {
        return saveOrgEnrichment(business, org, 'google_domain');
      }
      console.log(`[Apollo] Google domain "${googleResolution.resolvedDomain}" not found in Apollo, falling back to name search`);
    }

    // --- Organization search only (strategies 1-3) ---
    if (!isIndividualDisplay) {
      // Strategy 1: DBA name + city
      if (city) {
        console.log(`[Apollo] Strategy 1: org search "${displayName}" in "${city}, FL"`);
        const org = await searchOrganization(displayName, `${city}, FL`);
        if (org) {
          return saveOrgEnrichment(business, org, 'org_dba_city');
        }
      }

      // Strategy 2: DBA name + county
      if (county) {
        console.log(`[Apollo] Strategy 2: org search "${displayName}" in "Florida, ${county} County"`);
        const org = await searchOrganization(displayName, `Florida, ${county} County`);
        if (org) {
          return saveOrgEnrichment(business, org, 'org_dba_county');
        }
      }

      // Strategy 3: DBA name + state only
      console.log(`[Apollo] Strategy 3: org search "${displayName}" in "Florida"`);
      const org = await searchOrganization(displayName, 'Florida');
      if (org) {
        return saveOrgEnrichment(business, org, 'org_dba_state');
      }
    }

    // All strategies exhausted — no person fallback
    const reason = isIndividualDisplay
      ? `Skipped: "${displayName}" looks like an individual name, not a company`
      : `No company match found for "${displayName}" in ${county || 'Florida'}`;
    console.log(`[Apollo] ${reason}`);

    await prisma.businessEnrichment.upsert({
      where: { businessId: business.id },
      update: {
        apolloMatchConfidence: 'none',
        enrichmentStatus: BUSINESS_ENRICHMENT_STATUS.PARTIAL,
        enrichmentStrategy: 'none_matched',
        errorReason: reason,
        enrichedAt: new Date(),
      },
      create: {
        businessId: business.id,
        apolloMatchConfidence: 'none',
        enrichmentStatus: BUSINESS_ENRICHMENT_STATUS.PARTIAL,
        enrichmentStrategy: 'none_matched',
        errorReason: reason,
        enrichedAt: new Date(),
      },
    });

    return { success: false, apolloOrgId: null, domain: null, matchConfidence: 'none' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error during company enrichment';
    console.error(`[Apollo] Company enrichment failed for ${displayName}:`, error);
    await prisma.businessEnrichment.upsert({
      where: { businessId: business.id },
      update: { enrichmentStatus: BUSINESS_ENRICHMENT_STATUS.FAILED, errorReason: reason, enrichedAt: new Date() },
      create: { businessId: business.id, enrichmentStatus: BUSINESS_ENRICHMENT_STATUS.FAILED, errorReason: reason, enrichedAt: new Date() },
    });
    throw error;
  }
}

/**
 * Save an organization-based enrichment match.
 */
async function saveOrgEnrichment(
  business: Business,
  org: ApolloOrg,
  strategy: string
): Promise<CompanyEnrichResult> {
  await prisma.businessEnrichment.upsert({
    where: { businessId: business.id },
    update: {
      apolloOrgId: org.id,
      companyName: org.name,
      domain: org.primary_domain,
      website: org.website_url,
      linkedinUrl: org.linkedin_url,
      phone: org.phone,
      employeeCount: org.estimated_num_employees,
      estimatedRevenue: org.annual_revenue_printed,
      apolloMatchConfidence: 'high',
      enrichmentStrategy: strategy,
      enrichmentStatus: BUSINESS_ENRICHMENT_STATUS.COMPANY_DONE,
      enrichedAt: new Date(),
      errorReason: null,
    },
    create: {
      businessId: business.id,
      apolloOrgId: org.id,
      companyName: org.name,
      domain: org.primary_domain,
      website: org.website_url,
      linkedinUrl: org.linkedin_url,
      phone: org.phone,
      employeeCount: org.estimated_num_employees,
      estimatedRevenue: org.annual_revenue_printed,
      apolloMatchConfidence: 'high',
      enrichmentStrategy: strategy,
      enrichmentStatus: BUSINESS_ENRICHMENT_STATUS.COMPANY_DONE,
      enrichedAt: new Date(),
    },
  });

  return { success: true, apolloOrgId: org.id, domain: org.primary_domain, matchConfidence: 'high' };
}

/**
 * Stage 2: Enrich contacts for a business that already has company enrichment.
 * Updates enrichmentStatus to 'completed'.
 */
export async function enrichBusinessContacts(
  businessId: string,
  apolloOrgId: string,
  domain: string | null,
  config?: EnrichmentConfig
): Promise<ContactEnrichResult> {
  if (!APOLLO_API_KEY) {
    return { success: false, contactCount: 0 };
  }

  try {
    const contactCount = await fetchAndSaveContacts(businessId, apolloOrgId, domain, config);

    await prisma.businessEnrichment.update({
      where: { businessId },
      data: {
        enrichmentStatus: BUSINESS_ENRICHMENT_STATUS.COMPLETED,
        enrichedAt: new Date(),
      },
    });

    return { success: true, contactCount };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error during contact enrichment';
    console.error(`[Apollo] Contact enrichment failed for business ${businessId}:`, error);
    await prisma.businessEnrichment.update({
      where: { businessId },
      data: { errorReason: reason },
    });
    throw error;
  }
}

/**
 * Full enrichment (backward-compatible): company + contacts in one call.
 */
export async function enrichBusiness(business: Business, config?: EnrichmentConfig): Promise<void> {
  const companyResult = await enrichCompany(business);

  if (companyResult.success && companyResult.apolloOrgId) {
    await enrichBusinessContacts(business.id, companyResult.apolloOrgId, companyResult.domain, config);
  }
}

/**
 * Search Apollo organizations. Location is a pre-formatted string like
 * "Jacksonville, FL", "Florida, Duval County", or "Florida".
 */
async function searchOrganization(name: string, location: string): Promise<ApolloOrg | null> {
  const res = await fetch(`${APOLLO_BASE}/mixed_companies/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': APOLLO_API_KEY!,
    },
    body: JSON.stringify({
      q_organization_name: name,
      organization_locations: [location],
      page: 1,
      per_page: 5,
    }),
  });

  if (!res.ok) {
    throw new Error(`Apollo API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const accounts = (data.accounts?.length ? data.accounts : data.organizations) || [];

  if (accounts.length === 0) return null;

  return {
    id: accounts[0].id,
    name: accounts[0].name,
    website_url: accounts[0].website_url || null,
    primary_domain: accounts[0].primary_domain || null,
    linkedin_url: accounts[0].linkedin_url || null,
    phone: accounts[0].phone || null,
    estimated_num_employees: accounts[0].estimated_num_employees || null,
    annual_revenue: accounts[0].annual_revenue || null,
    annual_revenue_printed: accounts[0].annual_revenue_printed || null,
  };
}

/**
 * Search Apollo organizations by domain. Used when Google has resolved a domain.
 */
async function searchOrganizationByDomain(domain: string): Promise<ApolloOrg | null> {
  const res = await fetch(`${APOLLO_BASE}/mixed_companies/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': APOLLO_API_KEY!,
    },
    body: JSON.stringify({
      q_organization_domains: domain,
      page: 1,
      per_page: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`Apollo API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const accounts = (data.accounts?.length ? data.accounts : data.organizations) || [];

  if (accounts.length === 0) return null;

  return {
    id: accounts[0].id,
    name: accounts[0].name,
    website_url: accounts[0].website_url || null,
    primary_domain: accounts[0].primary_domain || null,
    linkedin_url: accounts[0].linkedin_url || null,
    phone: accounts[0].phone || null,
    estimated_num_employees: accounts[0].estimated_num_employees || null,
    annual_revenue: accounts[0].annual_revenue || null,
    annual_revenue_printed: accounts[0].annual_revenue_printed || null,
  };
}

async function fetchAndSaveContacts(
  businessId: string,
  apolloOrgId: string,
  domain: string | null,
  config?: EnrichmentConfig
): Promise<number> {
  const enrichConfig = config || ENRICHMENT_PRESETS.owner_admin;
  console.log(`[Apollo] Contact search: domain=${domain}, orgId=${apolloOrgId}, mode=${enrichConfig.titleMode}, max=${enrichConfig.maxContacts}`);

  // Step 1: Search for people (returns preview/obfuscated data with IDs)
  const searchBody: Record<string, unknown> = {
    per_page: 10,
    page: 1,
    person_titles: PREFERRED_CONTACT_TITLES,
  };
  if (domain) {
    searchBody.q_organization_domains = domain;
  } else {
    searchBody.q_organization_name = apolloOrgId;
  }

  const searchRes = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': APOLLO_API_KEY!,
    },
    body: JSON.stringify(searchBody),
  });

  if (!searchRes.ok) {
    const body = await searchRes.text().catch(() => '');
    console.warn(`[Apollo] Contact search error: ${searchRes.status} ${searchRes.statusText}`, body.substring(0, 500));
    return 0;
  }

  const searchData = await searchRes.json();
  const previewPeople: Record<string, unknown>[] = searchData.people || [];
  console.log(`[Apollo] Contact search found ${previewPeople.length} people (total: ${searchData.total_entries ?? 'unknown'})`);

  if (previewPeople.length === 0) {
    // Retry without title filter
    console.log('[Apollo] Retrying contact search without title filter...');
    const retryBody = { ...searchBody, person_titles: undefined, per_page: 5 };
    const retryRes = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY!,
      },
      body: JSON.stringify(retryBody),
    });
    if (retryRes.ok) {
      const retryData = await retryRes.json();
      previewPeople.push(...(retryData.people || []));
      console.log(`[Apollo] Retry found ${previewPeople.length} people`);
    }
  }

  if (previewPeople.length === 0) return 0;

  // Step 1.5: Rank and filter using contact ranker
  const ranked = rankContacts(previewPeople, enrichConfig);
  console.log(`[Apollo] Enriching top ${ranked.length} of ${previewPeople.length} contacts (ranked: ${ranked.map(r => `${r.preview.first_name}/${r.preview.title}=${r.rankScore}[${r.titleBucket}]`).join(', ')})`);

  // Step 2: Enrich each selected person by ID to get full contact details
  let preferredSet = false;
  let savedCount = 0;

  for (const rankedContact of ranked) {
    try {
      const person = await enrichPersonById(rankedContact.preview.id as string);
      if (!person) continue;

      const isPreferred = !preferredSet && isPreferredTitle(person.title);
      if (isPreferred) preferredSet = true;

      await prisma.contact.create({
        data: {
          businessId,
          firstName: person.first_name,
          lastName: person.last_name,
          fullName: person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim(),
          title: person.title,
          seniority: person.seniority,
          email: person.email,
          phone: person.phone_numbers?.[0]?.raw_number || null,
          linkedinUrl: person.linkedin_url,
          emailStatus: person.email_status,
          apolloContactId: person.id,
          isPreferred,
          contactRankScore: rankedContact.rankScore,
          contactRankReasons: rankedContact.rankReasons,
          titleBucket: rankedContact.titleBucket,
        },
      });
      savedCount++;
    } catch (err) {
      console.warn(`[Apollo] Failed to enrich person ${rankedContact.preview.id}:`, err);
    }
  }

  if (!preferredSet && savedCount > 0) {
    const firstContact = await prisma.contact.findFirst({
      where: { businessId },
      orderBy: { enrichedAt: 'asc' },
    });
    if (firstContact) {
      await prisma.contact.update({
        where: { id: firstContact.id },
        data: { isPreferred: true },
      });
    }
  }

  console.log(`[Apollo] Saved ${savedCount} contacts for business ${businessId}`);
  return savedCount;
}

/**
 * Enrich a single person by Apollo ID to get full (non-obfuscated) details.
 */
async function enrichPersonById(apolloPersonId: string): Promise<ApolloContact | null> {
  const res = await fetch(`https://api.apollo.io/api/v1/people/match?id=${apolloPersonId}&reveal_personal_emails=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': APOLLO_API_KEY!,
    },
  });

  if (!res.ok) {
    console.warn(`[Apollo] Person enrich error for ${apolloPersonId}: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const person = data.person;
  if (!person) return null;

  return {
    id: person.id,
    first_name: person.first_name || null,
    last_name: person.last_name || null,
    name: person.name || null,
    title: person.title || null,
    seniority: person.seniority || null,
    email: person.email || null,
    phone_numbers: person.phone_numbers || [],
    linkedin_url: person.linkedin_url || null,
    email_status: person.email_status || null,
  };
}

function isPreferredTitle(title: string | null): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return PREFERRED_CONTACT_TITLES.some((t) => lower.includes(t.toLowerCase()));
}
