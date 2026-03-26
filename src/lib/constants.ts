export const FLORIDA_COUNTIES = [
  'Alachua', 'Baker', 'Bay', 'Bradford', 'Brevard', 'Broward', 'Calhoun',
  'Charlotte', 'Citrus', 'Clay', 'Collier', 'Columbia', 'DeSoto', 'Dixie',
  'Duval', 'Escambia', 'Flagler', 'Franklin', 'Gadsden', 'Gilchrist',
  'Glades', 'Gulf', 'Hamilton', 'Hardee', 'Hendry', 'Hernando', 'Highlands',
  'Hillsborough', 'Holmes', 'Indian River', 'Jackson', 'Jefferson',
  'Lafayette', 'Lake', 'Lee', 'Leon', 'Levy', 'Liberty', 'Madison',
  'Manatee', 'Marion', 'Martin', 'Miami-Dade', 'Monroe', 'Nassau',
  'Okaloosa', 'Okeechobee', 'Orange', 'Osceola', 'Palm Beach', 'Pasco',
  'Pinellas', 'Polk', 'Putnam', 'Santa Rosa', 'Sarasota', 'Seminole',
  'St. Johns', 'St. Lucie', 'Sumter', 'Suwannee', 'Taylor', 'Union',
  'Volusia', 'Wakulla', 'Walton', 'Washington',
] as const;

export type FloridaCounty = typeof FLORIDA_COUNTIES[number];

export const LICENSE_TYPES = [
  'Certified AC Contractor',
  'Certified Building Contractor',
  'Certified General Contractor',
  'Certified Mechanical Contractor',
  'Certified Plumbing Contractor',
  'Certified Pollutant Storage Contractor',
  'Certified Pool/Spa Contractor',
  'Certified Residential Contractor',
  'Certified Roofing Contractor',
  'Certified Sheet Metal Contractor',
  'Certified Solar Contractor',
  'Certified Specialty Contractor',
  'Certified Utility and Excavation',
  'Construction Business Information',
  'Construction CE Provider',
  'Construction Financial Officer',
  'Registered Air Conditioning Contractor',
  'Registered Building Contractor',
  'Registered General Contractor',
  'Registered Mechanical Contractor',
  'Registered Plumbing Contractor',
  'Registered Pool/Spa Contractor',
  'Registered Precision Tank Tester',
  'Registered Residential Contractor',
  'Registered Roofing Contractor',
  'Registered Sheet Metal Contractor',
  'Registered Solar Contractor',
  'Registered Specialty Contractor',
  'Registered Tank Lining Applicator',
  'Registered Utility and Excavation Contractor',
] as const;

export type LicenseType = typeof LICENSE_TYPES[number];

export const TARGET_LICENSE_TYPES: LicenseType[] = [
  'Certified AC Contractor',
  'Certified Building Contractor',
  'Certified General Contractor',
  'Certified Mechanical Contractor',
  'Certified Plumbing Contractor',
  'Certified Pool/Spa Contractor',
  'Certified Residential Contractor',
  'Certified Roofing Contractor',
  'Certified Sheet Metal Contractor',
  'Certified Solar Contractor',
  'Certified Specialty Contractor',
  'Certified Utility and Excavation',
  'Registered Air Conditioning Contractor',
  'Registered Building Contractor',
  'Registered General Contractor',
  'Registered Mechanical Contractor',
  'Registered Plumbing Contractor',
  'Registered Pool/Spa Contractor',
  'Registered Residential Contractor',
  'Registered Roofing Contractor',
  'Registered Sheet Metal Contractor',
  'Registered Solar Contractor',
  'Registered Specialty Contractor',
  'Registered Utility and Excavation Contractor',
];

export const PREFERRED_CONTACT_TITLES = [
  'Owner',
  'Founder',
  'President',
  'CEO',
  'Office Manager',
  'Operations Manager',
  'Estimator',
  'Vice President',
  'General Manager',
  'Director of Operations',
];

export const DBPR_BASE_URL = 'https://www.myfloridalicense.com';
export const DBPR_SEARCH_URL = `${DBPR_BASE_URL}/wl11.asp?mode=0&SID=`;
export const LICENSE_CATEGORY = 'Construction Industry';

export const SCRAPE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const ENRICHMENT_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const ENRICHMENT_STAGE = {
  COMPANY: 'company',
  CONTACTS: 'contacts',
  FULL: 'full',
} as const;

export const MAX_CONTACTS_TO_ENRICH = 3;

export const TITLE_MODES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MIXED: 'mixed',
} as const;

export const OWNER_TITLES = ['Owner', 'Founder', 'President', 'Principal', 'CEO', 'Co-Founder'];
export const ADMIN_TITLES = ['Office Manager', 'Operations Manager', 'Estimator', 'Project Manager', 'General Manager', 'Director of Operations', 'Administrator'];

export const EXCLUDED_TITLES = [
  'Intern', 'Student', 'Volunteer', 'Temp', 'Contractor',
  'Marketing', 'HR', 'Human Resources', 'Recruiter',
  'Software', 'Developer', 'Engineer', 'IT ',
  'Accountant', 'Bookkeeper', 'Clerk',
];

export const RANK_WEIGHTS = {
  TITLE_OWNER: 100,
  TITLE_ADMIN: 60,
  TITLE_OTHER: 10,
  HAS_EMAIL: 50,
  VERIFIED_EMAIL: 25,
  HAS_PHONE: 20,
  HAS_LINKEDIN: 5,
} as const;

/** Human-readable helper text for each title mode */
export const TITLE_MODE_DESCRIPTIONS: Record<string, string> = {
  owner: 'Owner, Founder, President, Principal',
  admin: 'Office Manager, Operations Manager, Administrator',
  mixed: 'Owner, Founder, President, Principal, Office Manager, Operations Manager, Estimator, Project Manager',
};

export const ENRICHMENT_PRESETS = {
  owner_first: {
    label: 'Owner First',
    description: 'Target only owner-level contacts. Best for direct outreach.',
    titleMode: 'owner' as const,
    maxContacts: 1,
    requireEmail: true,
    verifiedEmailOnly: true,
    skipExcludedTitles: true,
  },
  owner_admin: {
    label: 'Owner + Admin',
    description: 'Owners and office staff. Best balance of quality and coverage.',
    titleMode: 'mixed' as const,
    maxContacts: 2,
    requireEmail: true,
    verifiedEmailOnly: true,
    skipExcludedTitles: true,
  },
  growth: {
    label: 'Growth / Broader',
    description: 'Wider net including estimators and project managers.',
    titleMode: 'mixed' as const,
    maxContacts: 2,
    requireEmail: true,
    verifiedEmailOnly: false,
    skipExcludedTitles: true,
  },
} as const;

/** Apollo credit cost estimates per enrichment type */
export const CREDIT_COSTS = {
  COMPANY_SEARCH: 0,   // org search is free
  PERSON_SEARCH: 0,    // people search is free
  PERSON_ENRICH: 1,    // people/match costs 1 credit
  COMPANY_ENRICH: 1,   // company enrichment costs ~1 credit
} as const;

export const BUSINESS_ENRICHMENT_STATUS = {
  QUEUED: 'queued',
  COMPANY_DONE: 'company_done',
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  FAILED: 'failed',
} as const;

// === Import Feature Constants ===

export const IMPORT_TARGET_FIELDS = [
  { value: 'displayBusinessName', label: 'Business Name', required: true },
  { value: 'city', label: 'City', required: false },
  { value: 'state', label: 'State', required: false },
  { value: 'zip', label: 'Zip Code', required: false },
  { value: 'county', label: 'County', required: false },
  { value: 'primaryTrade', label: 'Primary Trade', required: false },
  { value: 'licenseNumber', label: 'License Number', required: false },
  { value: 'licenseeName', label: 'Licensee Name', required: false },
  { value: 'phone', label: 'Phone', required: false },
  { value: 'email', label: 'Email', required: false },
  { value: 'website', label: 'Website', required: false },
  { value: 'contactFirstName', label: 'Contact First Name', required: false },
  { value: 'contactLastName', label: 'Contact Last Name', required: false },
  { value: 'contactTitle', label: 'Contact Title', required: false },
  { value: 'contactEmail', label: 'Contact Email', required: false },
  { value: 'contactPhone', label: 'Contact Phone', required: false },
] as const;

export const COLUMN_ALIAS_MAP: Record<string, string> = {
  'business name': 'displayBusinessName',
  'business_name': 'displayBusinessName',
  'businessname': 'displayBusinessName',
  'company': 'displayBusinessName',
  'company name': 'displayBusinessName',
  'company_name': 'displayBusinessName',
  'companyname': 'displayBusinessName',
  'name': 'displayBusinessName',
  'dba': 'displayBusinessName',
  'city': 'city',
  'state': 'state',
  'st': 'state',
  'zip': 'zip',
  'zip code': 'zip',
  'zip_code': 'zip',
  'zipcode': 'zip',
  'postal code': 'zip',
  'postal_code': 'zip',
  'county': 'county',
  'trade': 'primaryTrade',
  'primary trade': 'primaryTrade',
  'primary_trade': 'primaryTrade',
  'license type': 'primaryTrade',
  'license_type': 'primaryTrade',
  'specialty': 'primaryTrade',
  'license number': 'licenseNumber',
  'license_number': 'licenseNumber',
  'licensenumber': 'licenseNumber',
  'license #': 'licenseNumber',
  'license no': 'licenseNumber',
  'lic #': 'licenseNumber',
  'licensee': 'licenseeName',
  'licensee name': 'licenseeName',
  'licensee_name': 'licenseeName',
  'phone': 'phone',
  'phone number': 'phone',
  'phone_number': 'phone',
  'tel': 'phone',
  'telephone': 'phone',
  'email': 'email',
  'email address': 'email',
  'email_address': 'email',
  'website': 'website',
  'url': 'website',
  'web': 'website',
  'domain': 'website',
  'contact first name': 'contactFirstName',
  'contact_first_name': 'contactFirstName',
  'first name': 'contactFirstName',
  'first_name': 'contactFirstName',
  'firstname': 'contactFirstName',
  'contact last name': 'contactLastName',
  'contact_last_name': 'contactLastName',
  'last name': 'contactLastName',
  'last_name': 'contactLastName',
  'lastname': 'contactLastName',
  'contact title': 'contactTitle',
  'contact_title': 'contactTitle',
  'title': 'contactTitle',
  'job title': 'contactTitle',
  'job_title': 'contactTitle',
  'contact email': 'contactEmail',
  'contact_email': 'contactEmail',
  'contact phone': 'contactPhone',
  'contact_phone': 'contactPhone',
};

export const IMPORT_FILE_MAX_SIZE_MB = 10;

// === Google Resolution Constants ===

export const GOOGLE_RESOLUTION_STATUS = {
  PENDING: 'pending',
  MATCHED: 'matched',
  POSSIBLE: 'possible',
  NO_MATCH: 'no_match',
  FAILED: 'failed',
} as const;

export type GoogleResolutionStatusValue = typeof GOOGLE_RESOLUTION_STATUS[keyof typeof GOOGLE_RESOLUTION_STATUS];

/** Confidence thresholds for Google Places match classification */
export const GOOGLE_MATCH_THRESHOLDS = {
  MATCHED: 0.7,   // >= 0.7 → matched
  POSSIBLE: 0.3,  // >= 0.3 → possible
  // < 0.3 → no_match
} as const;

/** Default app setting key for Google auto-resolution toggle */
export const SETTING_GOOGLE_AUTO_RESOLVE = 'google_auto_resolve_enabled';
