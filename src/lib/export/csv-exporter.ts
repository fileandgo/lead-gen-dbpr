import Papa from 'papaparse';
import type {
  Business,
  BusinessEnrichment,
  Contact,
  LeadScore,
} from '@prisma/client';

type BusinessWithRelations = Business & {
  enrichment: BusinessEnrichment | null;
  contacts: Contact[];
  leadScore: LeadScore | null;
};

interface CSVRow {
  first_name: string;
  last_name: string;
  email: string;
  company_name: string;
  title: string;
  county: string;
  city: string;
  trade: string;
  license_status: string;
  score: string;
  website: string;
  phone: string;
  source_url: string;
}

/**
 * Generate an Instantly-ready CSV from a list of businesses with their
 * enrichment data, contacts, and lead scores.
 */
export function generateCSV(businesses: BusinessWithRelations[]): string {
  const rows: CSVRow[] = [];

  for (const business of businesses) {
    const contact = business.contacts[0] || null;
    const score = business.leadScore?.manualOverride ?? business.leadScore?.score ?? 0;

    rows.push({
      first_name: contact?.firstName || '',
      last_name: contact?.lastName || '',
      email: contact?.email || '',
      company_name: business.displayBusinessName,
      title: contact?.title || '',
      county: business.county || '',
      city: '',
      trade: business.primaryTrade || '',
      license_status: business.latestLicenseStatus || '',
      score: String(score),
      website: business.enrichment?.website || business.enrichment?.domain || '',
      phone: contact?.phone || business.enrichment?.phone || '',
      source_url: `https://www.myfloridalicense.com`,
    });
  }

  return Papa.unparse(rows, {
    header: true,
    quotes: true,
  });
}

/**
 * Generate an Excel export (XLSX format) from businesses.
 * Optional feature - requires xlsx package.
 */
export function generateExcel(businesses: BusinessWithRelations[]): Buffer | null {
  try {
    const XLSX = require('xlsx');

    const rows = businesses.map((business) => {
      const contact = business.contacts[0] || null;
      const score = business.leadScore?.manualOverride ?? business.leadScore?.score ?? 0;

      return {
        'First Name': contact?.firstName || '',
        'Last Name': contact?.lastName || '',
        'Email': contact?.email || '',
        'Company Name': business.displayBusinessName,
        'Title': contact?.title || '',
        'County': business.county || '',
        'Trade': business.primaryTrade || '',
        'License Status': business.latestLicenseStatus || '',
        'Score': score,
        'Website': business.enrichment?.website || '',
        'Phone': contact?.phone || business.enrichment?.phone || '',
        'LinkedIn': business.enrichment?.linkedinUrl || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  } catch (error) {
    console.error('[Export] Excel generation failed:', error);
    return null;
  }
}
