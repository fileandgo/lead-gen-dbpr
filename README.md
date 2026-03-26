# DBPR Lead Gen

Internal lead generation web app for scraping Florida DBPR contractor licenses, enriching with Apollo, scoring leads, and exporting Instantly-ready CSVs.

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS + shadcn/ui**
- **Prisma ORM** with PostgreSQL (Supabase)
- **Playwright** for headless browser scraping
- **Google Places API** for business resolution (pre-enrichment domain lookup)
- **Apollo.io API** for enrichment
- **PapaParse** for CSV export
- **xlsx** for optional Excel export

## Features

- **Search & Scrape**: Select a Florida county and license types, then scrape DBPR automatically
- **Deduplication**: Normalize and deduplicate businesses by name + address
- **Lead Review**: Filterable, paginated table with detail drawer
- **Google Business Resolution**: Auto-resolve business domains via Google Places before enrichment
- **Apollo Enrichment**: Enrich companies and find preferred contacts (anchored to Google-confirmed domains)
- **Lead Scoring**: Automated scoring out of 100 with manual override
- **CSV Export**: Instantly-ready CSV with all required columns
- **Background Worker**: Scraping and enrichment run outside the request lifecycle
- **Dashboard**: Stats cards showing pipeline health

## Project Structure

```
├── prisma/
│   ├── schema.prisma          # Database schema (9 tables)
│   └── seed.ts                # Seed script
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Redirects to /dashboard
│   │   ├── globals.css        # Tailwind + shadcn CSS vars
│   │   ├── dashboard/         # Dashboard page
│   │   ├── search/            # Search & scrape page
│   │   ├── leads/             # Leads table + detail
│   │   ├── exports/           # Export history
│   │   └── api/               # API routes
│   │       ├── dashboard/     # GET stats
│   │       ├── scrape/        # GET list, POST create job
│   │       ├── leads/         # GET list, GET/PATCH detail
│   │       ├── enrich/        # POST enrich businesses
│   │       ├── google-resolve/ # POST trigger, GET run history
│   │       ├── settings/      # GET/PATCH app settings
│   │       └── export/        # GET history, POST generate CSV
│   ├── components/
│   │   ├── ui/                # shadcn/ui components
│   │   ├── layout/            # Sidebar + AppLayout
│   │   ├── dashboard/         # StatsCards
│   │   ├── search/            # SearchForm + ScrapeHistory
│   │   ├── leads/             # LeadsTable + LeadDetail
│   │   └── exports/           # ExportHistory
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client singleton
│   │   ├── utils.ts           # Helpers (normalize, hash, etc.)
│   │   ├── constants.ts       # Florida counties, license types
│   │   ├── scraper/
│   │   │   ├── dbpr-scraper.ts  # Playwright scraper
│   │   │   └── parser.ts       # HTML result parser
│   │   ├── enrichment/
│   │   │   ├── apollo.ts      # Apollo.io API integration
│   │   │   └── google-resolver.ts # Google Places business resolution
│   │   ├── scoring/
│   │   │   └── lead-scorer.ts # Lead scoring (0-100)
│   │   ├── export/
│   │   │   └── csv-exporter.ts # CSV + Excel generation
│   │   └── worker/
│   │       └── job-worker.ts  # Background job processor
│   └── types/
│       └── index.ts           # TypeScript interfaces
├── worker.ts                  # Worker entry point
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── prisma/schema.prisma
└── .env.example
```

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database (Supabase recommended)
- Google Places API key (for business resolution)
- Apollo.io API key (for enrichment)

### 1. Clone & Install

```bash
git clone https://github.com/fileandgo/lead-gen-dbpr.git
cd lead-gen-dbpr
npm install
```

### 2. Install Playwright Browsers

```bash
npx playwright install chromium
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
DATABASE_URL="postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"
APOLLO_API_KEY="your_apollo_api_key"
GOOGLE_PLACES_API_KEY="your_google_places_api_key"
NEXT_PUBLIC_APP_NAME="DBPR Lead Gen"
```

### 4. Setup Database

```bash
npm run db:push
# OR for migration-based workflow:
npm run db:migrate
```

### 5. Run the App

You need two terminal windows:

**Terminal 1 - Next.js dev server:**
```bash
npm run dev
```

**Terminal 2 - Background worker:**
```bash
npm run worker
```

Open http://localhost:3000

## How It Works

### Scraper Flow

1. User selects county + license types in the UI
2. API creates a `ScrapeRun` record with status `pending`
3. Worker picks up the job and launches Playwright
4. For each selected license type:
   - Navigates to `myfloridalicense.com`
   - Selects "Search by City or County"
   - Sets License Category = Construction Industry
   - Sets County, State = Florida, License Type
   - Clicks Search
   - Parses all result pages
   - Saves raw records to `raw_licenses` table
5. After all types scraped, deduplicates into `businesses` table
6. Updates `ScrapeRun` with final counts

### Google Business Resolution (Pre-Enrichment)

Google resolution runs automatically after every scrape or import (toggle on/off in the Leads page). It uses the Google Places API to find the real business website/domain before Apollo enrichment.

1. After import/scrape completes, worker auto-queues a Google resolution run
2. For each business, searches Google Places using business name + city/county/state
3. Gets Place Details for the best match (website, phone, address)
4. Calculates a confidence score and classifies as:
   - **Matched** (>= 70% confidence) — domain used by Apollo
   - **Possible** (>= 30%) — available for manual review
   - **No Match** (< 30%) — lead stays in system for manual enrichment
5. Users can also manually trigger Google resolution on selected leads
6. Filter leads by Google status: Matched / Possible / No Match / Not Resolved

### Enrichment Flow

1. User selects businesses in the Leads table
2. Clicks "Enrich Selected"
3. For each business:
   - **If Google-matched domain exists**: Apollo searches by domain first (highest accuracy)
   - Falls back to name + city/county/state search
   - Saves company data (domain, website, LinkedIn, phone, etc.)
   - Searches for contacts with preferred titles:
     - Owner, Founder, President, CEO
     - Office Manager, Operations Manager, Estimator
   - Marks best contact as preferred
4. Automatically re-scores the lead after enrichment

### Lead Scoring (0-100)

| Factor | Points |
|--------|--------|
| Active license | 15 |
| Target trade | 10 |
| County match | 5 |
| Google resolved (matched) | 10 |
| Company matched via Apollo | 20 |
| Domain present | 10 |
| Preferred contact found | 5 |
| Owner-level contact | 5 |
| Verified email found | 10 |
| Phone found | 5 |

### Export Flow

1. User applies filters on the Leads page
2. Clicks "Export CSV"
3. Server generates Instantly-ready CSV with columns:
   - first_name, last_name, email, company_name
   - title, county, city, trade
   - license_status, score, website, phone, source_url
4. File downloads automatically
5. Export is logged in export history for re-download

## Database Schema

12 tables designed for the full lead gen pipeline:

- **scrape_runs**: Track each scrape job
- **raw_licenses**: Raw scraped DBPR records
- **businesses**: Deduplicated canonical businesses
- **business_licenses**: Links businesses to raw licenses
- **google_resolutions**: Google Places match result per business
- **google_resolution_runs**: Track Google resolution batch jobs
- **enrichment_runs**: Track enrichment batch jobs
- **business_enrichment**: Apollo company data
- **contacts**: Apollo contact data with preferred flag
- **lead_scores**: Computed scores with breakdown
- **export_runs**: Export history
- **app_settings**: Global app settings (e.g. Google auto-resolve toggle)

## Available Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run start        # Start production server
npm run worker       # Start background job worker
npm run db:push      # Push schema to database
npm run db:migrate   # Run Prisma migrations
npm run db:studio    # Open Prisma Studio
npm run db:seed      # Run seed script
```

## Production Deployment

1. Set environment variables on your hosting platform
2. Run `npm run build`
3. Start the Next.js server: `npm run start`
4. Start the worker as a separate process: `npm run worker`
5. Ensure the worker process is managed (PM2, systemd, etc.)

## Setting Up the Google Places API Key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services > Library**
4. Enable these two APIs:
   - **Places API** (or "Places API (New)")
   - **Places API** includes both Text Search and Place Details
5. Navigate to **APIs & Services > Credentials**
6. Click **Create Credentials > API Key**
7. Copy the API key
8. (Recommended) Click **Restrict Key** to limit it:
   - Under **API restrictions**, select "Restrict key" and choose only **Places API**
   - Under **Application restrictions**, you can restrict by IP if running on a server
9. Add the key to your `.env` file:
   ```env
   GOOGLE_PLACES_API_KEY="AIza..."
   ```
10. Restart the worker process

**Pricing note**: Google Places API uses a pay-as-you-go model. Text Search costs ~$32 per 1,000 requests, and Place Details costs ~$17 per 1,000 requests. Each lead resolution uses 1 Text Search + 1 Place Details call. You can set budget alerts in the Cloud Console to control costs.

## Notes

- The scraper is headless by default and captures screenshots on errors
- DBPR uses ASP.NET classic pages - the scraper adapts to session tokens
- Google business resolution runs automatically after import/scrape (toggle in Leads page)
- Apollo enrichment uses Google-confirmed domains when available for higher accuracy
- Enrichment requires a valid Apollo.io API key
- The worker polls every 5 seconds for pending jobs
- Lead scores auto-update after enrichment and Google resolution
- Manual score overrides persist across re-scoring
