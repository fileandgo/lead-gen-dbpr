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

export type EnrichmentStatusValue = 'none' | 'queued' | 'company_done' | 'enriched' | 'partial' | 'failed';
export type EnrichmentMode = 'company_only' | 'company_and_contacts' | 'contacts_only';
export type TitleMode = 'owner' | 'admin' | 'mixed';

export interface EnrichmentConfig {
  titleMode: TitleMode;
  maxContacts: number;
  requireEmail: boolean;
  verifiedEmailOnly: boolean;
  skipExcludedTitles: boolean;
}

export type GoogleResolutionStatus = 'pending' | 'matched' | 'possible' | 'no_match' | 'failed';

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
  enrichmentStatus: EnrichmentStatusValue;
  googleResolutionStatus: GoogleResolutionStatus | null;
  googleResolvedDomain: string | null;
  excluded: boolean;
  score: number | null;
  manualOverride: number | null;
  hasEmail: boolean;
  preferredContactName: string | null;
  preferredContactTitle: string | null;
  preferredContactEmail: string | null;
  preferredContactTitleBucket: string | null;
}

export interface LeadDetail {
  id: string;
  displayBusinessName: string;
  normalizedBusinessName: string;
  normalizedAddress: string | null;
  county: string | null;
  licenseeName: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  primaryTrade: string | null;
  latestLicenseStatus: string | null;
  canonicalLicenseNumber: string | null;
  excluded: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  licenses: {
    id: string;
    licenseType: string;
    licenseNumber: string;
    status: string;
    expirationDate: string | null;
  }[];
  googleResolution: {
    resolvedName: string | null;
    resolvedDomain: string | null;
    resolvedWebsite: string | null;
    resolvedPhone: string | null;
    resolvedAddress: string | null;
    matchStatus: string;
    confidence: number | null;
    searchQuery: string | null;
    resolvedAt: string;
  } | null;
  enrichment: {
    companyName: string | null;
    domain: string | null;
    website: string | null;
    linkedinUrl: string | null;
    phone: string | null;
    employeeCount: number | null;
    estimatedRevenue: string | null;
    apolloMatchConfidence: string | null;
    enrichmentStrategy: string | null;
    enrichmentStatus: string;
    errorReason: string | null;
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
    contactRankScore: number | null;
    titleBucket: string | null;
    contactRankReasons: string[] | null;
  }[];
  score: {
    score: number;
    manualOverride: number | null;
    scoreBreakdownJson: Record<string, number>;
    scoredAt: string;
  } | null;
}

export interface GoogleResolutionRunSummary {
  id: string;
  status: string;
  triggeredBy: string;
  totalSubmitted: number;
  totalMatched: number;
  totalPossible: number;
  totalNoMatch: number;
  totalFailed: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface EnrichmentRunSummary {
  id: string;
  status: string;
  enrichmentStage: string;
  totalSubmitted: number;
  totalEnriched: number;
  totalFailed: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface EnrichmentError {
  id: string;
  businessId: string;
  businessName: string;
  county: string | null;
  enrichmentStatus: string;
  errorReason: string | null;
  enrichedAt: string;
}

export interface DashboardStats {
  totalBusinesses: number;
  enrichedBusinesses: number;
  partialBusinesses: number;
  failedBusinesses: number;
  leadsWithEmail: number;
  averageScore: number;
  recentScrapes: ScrapeRunSummary[];
  recentEnrichmentRuns: EnrichmentRunSummary[];
  recentEnrichmentErrors: EnrichmentError[];
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
  googleStatus?: string;
  excluded?: 'included' | 'excluded' | 'all';
  hasBusinessName?: 'yes' | 'no';
  scoreMin?: number;
  scoreMax?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

export type EnrichmentWarning =
  | 'no_business_name'
  | 'already_enriched'
  | 'excluded'
  | 'no_address'
  | 'no_domain'
  | 'weak_match'
  | 'already_exported'
  | 'likely_owner_operated'
  | 'missing_city';

// === Import Feature Types ===

export type DuplicateStrategy = 'skip' | 'update' | 'import_all';

export interface ImportRunSummary {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  totalRows: number;
  validRows: number;
  importedRows: number;
  skippedDuplicates: number;
  updatedExisting: number;
  errorRows: number;
  duplicateStrategy: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ImportColumnMapping {
  sourceColumn: string;
  targetField: string;
}

export interface ImportRowError {
  row: number;
  field: string;
  value: string;
  message: string;
}

export interface ImportableRow {
  displayBusinessName: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
  primaryTrade?: string;
  licenseNumber?: string;
  licenseeName?: string;
  phone?: string;
  email?: string;
  website?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactTitle?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface ImportPayload {
  fileName: string;
  fileType: string;
  columnMapping: ImportColumnMapping[];
  duplicateStrategy: DuplicateStrategy;
  rows: ImportableRow[];
}

export interface EnrichmentPreview {
  id: string;
  displayBusinessName: string;
  county: string | null;
  primaryTrade: string | null;
  city: string | null;
  domain: string | null;
  enrichmentStatus: EnrichmentStatusValue;
  excluded: boolean;
  exported: boolean;
  matchConfidence: string | null;
  warnings: EnrichmentWarning[];
}
