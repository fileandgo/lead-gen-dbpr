export interface ScrapeRunSummary {
  id: string;
  county: string;
  selectedLicenseTypes: string[];
  status: string;
  totalRawRecords: number;
  totalUniqueRecords: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface LeadRow {
  id: string;
  displayBusinessName: string;
  licenseeName: string;
  primaryTrade: string | null;
  canonicalLicenseNumber: string | null;
  latestLicenseStatus: string | null;
  county: string | null;
  city: string | null;
  normalizedAddress: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  enrichmentStatus: 'none' | 'enriched';
  score: number | null;
  manualOverride: number | null;
  hasEmail: boolean;
  preferredContactName: string | null;
  preferredContactTitle: string | null;
  preferredContactEmail: string | null;
}

export interface LeadDetail {
  id: string;
  displayBusinessName: string;
  normalizedBusinessName: string;
  normalizedAddress: string | null;
  county: string | null;
  primaryTrade: string | null;
  latestLicenseStatus: string | null;
  canonicalLicenseNumber: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  licenses: {
    id: string;
    licenseType: string;
    licenseNumber: string;
    status: string;
    expirationDate: string | null;
  }[];
  enrichment: {
    companyName: string | null;
    domain: string | null;
    website: string | null;
    linkedinUrl: string | null;
    phone: string | null;
    employeeCount: number | null;
    estimatedRevenue: string | null;
    apolloMatchConfidence: string | null;
    enrichedAt: string;
  } | null;
  contacts: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    emailStatus: string | null;
    isPreferred: boolean;
  }[];
  score: {
    score: number;
    manualOverride: number | null;
    scoreBreakdownJson: Record<string, number>;
    scoredAt: string;
  } | null;
}

export interface DashboardStats {
  totalBusinesses: number;
  enrichedBusinesses: number;
  leadsWithEmail: number;
  averageScore: number;
  recentScrapes: ScrapeRunSummary[];
}

export interface ExportFilters {
  county?: string;
  trade?: string;
  scoreMin?: number;
  scoreMax?: number;
  enrichedOnly?: boolean;
  activeOnly?: boolean;
  hasEmailOnly?: boolean;
  preferredOnly?: boolean;
  title?: string;
}

export interface ExportRunRow {
  id: string;
  filterJson: Record<string, unknown>;
  totalExported: number;
  fileName: string | null;
  createdAt: string;
}

export interface LeadFilters {
  county?: string;
  trade?: string;
  status?: string;
  enriched?: string;
  scoreMin?: number;
  scoreMax?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}
