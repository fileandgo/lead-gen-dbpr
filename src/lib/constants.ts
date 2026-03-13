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
