import prisma from '../prisma';
import { PREFERRED_CONTACT_TITLES } from '../constants';
import type { Business } from '@prisma/client';

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

export async function enrichBusiness(business: Business): Promise<void> {
  if (!APOLLO_API_KEY) {
    console.warn('[Apollo] No API key configured. Skipping enrichment.');
    return;
  }

  try {
    // Step 1: Search for the organization
    const org = await searchOrganization(business.displayBusinessName, business.county || '');

    if (org) {
      // Save enrichment data
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
          enrichedAt: new Date(),
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
          enrichedAt: new Date(),
        },
      });

      // Step 2: Search for contacts at this organization
      if (org.id) {
        await enrichContacts(business.id, org.id, org.primary_domain);
      }
    } else {
      // Save partial enrichment to mark as attempted
      await prisma.businessEnrichment.upsert({
        where: { businessId: business.id },
        update: {
          apolloMatchConfidence: 'none',
          enrichedAt: new Date(),
        },
        create: {
          businessId: business.id,
          apolloMatchConfidence: 'none',
          enrichedAt: new Date(),
        },
      });
    }
  } catch (error) {
    console.error(`[Apollo] Enrichment failed for ${business.displayBusinessName}:`, error);
    throw error;
  }
}

async function searchOrganization(name: string, location: string): Promise<ApolloOrg | null> {
  try {
    const res = await fetch(`${APOLLO_BASE}/mixed_companies/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY!,
      },
      body: JSON.stringify({
        q_organization_name: name,
        organization_locations: location ? [`Florida, ${location} County`] : ['Florida'],
        page: 1,
        per_page: 5,
      }),
    });

    if (!res.ok) {
      console.error(`[Apollo] Org search failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const accounts = data.accounts || data.organizations || [];

    if (accounts.length === 0) return null;

    // Return the best match
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
  } catch (error) {
    console.error('[Apollo] Organization search error:', error);
    return null;
  }
}

async function enrichContacts(
  businessId: string,
  apolloOrgId: string,
  domain: string | null
): Promise<void> {
  try {
    const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY!,
      },
      body: JSON.stringify({
        q_organization_domains: domain ? [domain] : undefined,
        organization_ids: [apolloOrgId],
        person_titles: PREFERRED_CONTACT_TITLES,
        page: 1,
        per_page: 10,
      }),
    });

    if (!res.ok) {
      console.error(`[Apollo] People search failed: ${res.status} ${res.statusText}`);
      return;
    }

    const data = await res.json();
    const people: ApolloContact[] = data.people || data.contacts || [];

    // Determine preferred contact based on title priority
    let preferredSet = false;

    for (const person of people) {
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
        },
      });
    }

    // If no preferred contact was found from title matching, mark the first one
    if (!preferredSet && people.length > 0) {
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
  } catch (error) {
    console.error('[Apollo] Contact search error:', error);
  }
}

function isPreferredTitle(title: string | null): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return PREFERRED_CONTACT_TITLES.some((t) => lower.includes(t.toLowerCase()));
}
