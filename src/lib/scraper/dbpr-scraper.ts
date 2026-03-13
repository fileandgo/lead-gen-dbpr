import { chromium, Browser, Page } from 'playwright';
import prisma from '../prisma';
import { parseResultsPage } from './parser';
import { hashRecord, normalizeBusinessName, normalizeAddress, sleep } from '../utils';
import { DBPR_BASE_URL, LICENSE_CATEGORY } from '../constants';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots');

interface ScrapeOptions {
  runId: string;
  county: string;
  licenseTypes: string[];
}

export async function runScrape(options: ScrapeOptions): Promise<void> {
  const { runId, county, licenseTypes } = options;
  let browser: Browser | null = null;

  try {
    await prisma.scrapeRun.update({
      where: { id: runId },
      data: { status: 'running', startedAt: new Date() },
    });

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    let totalRaw = 0;

    for (const licenseType of licenseTypes) {
      console.log(`[Scraper] Starting search: ${county} / ${licenseType}`);
      const count = await scrapeForLicenseType(browser, runId, county, licenseType);
      totalRaw += count;
      console.log(`[Scraper] Found ${count} records for ${licenseType}`);
      await sleep(2000); // Be polite between searches
    }

    // Deduplicate
    const uniqueCount = await deduplicateRecords(runId, county);

    await prisma.scrapeRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        totalRawRecords: totalRaw,
        totalUniqueRecords: uniqueCount,
        completedAt: new Date(),
      },
    });

    console.log(`[Scraper] Run ${runId} completed: ${totalRaw} raw, ${uniqueCount} unique`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Scraper] Run ${runId} failed:`, message);

    await prisma.scrapeRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        errorMessage: message.substring(0, 1000),
        completedAt: new Date(),
      },
    });
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeForLicenseType(
  browser: Browser,
  runId: string,
  county: string,
  licenseType: string
): Promise<number> {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  let totalRecords = 0;

  try {
    // Step 1: Navigate to DBPR
    await navigateToSearch(page);

    // Step 2: Select "Search by City or County"
    await selectSearchByCounty(page);

    // Step 3: Fill in the search form
    await fillSearchForm(page, county, licenseType);

    // Step 4: Submit search
    await submitSearch(page);

    // Step 5: Parse all pages of results
    totalRecords = await scrapeAllPages(page, runId, county, licenseType);
  } catch (error) {
    await captureScreenshot(page, `error-${runId}-${licenseType}`);
    throw error;
  } finally {
    await context.close();
  }

  return totalRecords;
}

async function navigateToSearch(page: Page): Promise<void> {
  // Try the direct search URL first
  await page.goto(`${DBPR_BASE_URL}/wl11.asp?mode=0&SID=`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Wait for the page to be interactive
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  // Check if we landed on the search options page
  const searchTypeVisible = await page
    .locator('text=Select Search Type')
    .isVisible()
    .catch(() => false);

  if (!searchTypeVisible) {
    // Try navigating from the main page
    await page.goto(DBPR_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Look for the Online Services or Licensee Search link
    const searchLink = page.locator('a:has-text("Licensee Search"), a:has-text("LICENSEE SEARCH")');
    if (await searchLink.isVisible().catch(() => false)) {
      await searchLink.first().click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    }
  }
}

async function selectSearchByCounty(page: Page): Promise<void> {
  // Look for the "Search by City or County" radio button
  const radioSelectors = [
    'input[type="radio"][value*="County"]',
    'input[type="radio"][value*="county"]',
    'input[type="radio"][value="2"]', // Often the 3rd option (0-indexed)
  ];

  for (const selector of radioSelectors) {
    const radio = page.locator(selector);
    if (await radio.isVisible().catch(() => false)) {
      await radio.click();
      await sleep(500);

      // Click the Search button to proceed to the form
      const searchBtn = page.locator('input[type="submit"][value="Search"], button:has-text("Search")');
      if (await searchBtn.isVisible().catch(() => false)) {
        await searchBtn.first().click();
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      }
      return;
    }
  }

  // Try clicking the text directly
  const countyOption = page.locator('text=Search by City or County');
  if (await countyOption.isVisible().catch(() => false)) {
    await countyOption.click();
    await sleep(500);

    const searchBtn = page.locator('input[type="submit"][value="Search"], button:has-text("Search")');
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.first().click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    }
    return;
  }

  // If we're already on the county search form, continue
  const licenseCategory = page.locator('select[name*="Category"], select[name*="category"]');
  if (await licenseCategory.isVisible().catch(() => false)) {
    return;
  }

  throw new Error('Could not find "Search by City or County" option on the page');
}

async function fillSearchForm(page: Page, county: string, licenseType: string): Promise<void> {
  // Wait for the form to load
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  // Select License Category = Construction Industry
  const categorySelect = page.locator(
    'select[name*="Category"], select[name*="category"], select[name="SID1"]'
  ).first();

  if (await categorySelect.isVisible().catch(() => false)) {
    await categorySelect.selectOption({ label: LICENSE_CATEGORY }).catch(async () => {
      // Try by partial text match
      const options = await categorySelect.locator('option').all();
      for (const opt of options) {
        const text = await opt.textContent();
        if (text && text.includes('Construction')) {
          const val = await opt.getAttribute('value');
          if (val) await categorySelect.selectOption(val);
          break;
        }
      }
    });

    // Wait for dependent dropdowns to load
    await sleep(2000);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  }

  // Select License Type
  const typeSelect = page.locator(
    'select[name*="Type"], select[name*="type"], select[name="SID2"]'
  ).first();

  if (await typeSelect.isVisible().catch(() => false)) {
    await typeSelect.selectOption({ label: licenseType }).catch(async () => {
      const options = await typeSelect.locator('option').all();
      for (const opt of options) {
        const text = await opt.textContent();
        if (text && text.trim() === licenseType) {
          const val = await opt.getAttribute('value');
          if (val) await typeSelect.selectOption(val);
          break;
        }
      }
    });
  }

  // Select County
  const countySelect = page.locator(
    'select[name*="County"], select[name*="county"], select[name="SID5"]'
  ).first();

  if (await countySelect.isVisible().catch(() => false)) {
    await countySelect.selectOption({ label: county }).catch(async () => {
      const options = await countySelect.locator('option').all();
      for (const opt of options) {
        const text = await opt.textContent();
        if (text && text.trim().toLowerCase() === county.toLowerCase()) {
          const val = await opt.getAttribute('value');
          if (val) await countySelect.selectOption(val);
          break;
        }
      }
    });
  }

  // Select State = Florida
  const stateSelect = page.locator(
    'select[name*="State"], select[name*="state"], select[name="SID6"]'
  ).first();

  if (await stateSelect.isVisible().catch(() => false)) {
    await stateSelect.selectOption({ label: 'Florida' }).catch(async () => {
      await stateSelect.selectOption({ value: 'FL' }).catch(() => {});
    });
  }

  // Set Licenses Per Page to maximum
  const perPageSelect = page.locator(
    'select[name*="PerPage"], select[name*="perpage"], select[name*="per_page"]'
  ).first();

  if (await perPageSelect.isVisible().catch(() => false)) {
    const options = await perPageSelect.locator('option').all();
    if (options.length > 0) {
      // Select the last (largest) option
      const lastOpt = options[options.length - 1];
      const val = await lastOpt.getAttribute('value');
      if (val) await perPageSelect.selectOption(val);
    }
  }
}

async function submitSearch(page: Page): Promise<void> {
  // Find and click the Search button
  const searchBtn = page.locator(
    'input[type="submit"][value="Search"], button:has-text("Search"), input[name*="Search"]'
  ).first();

  if (await searchBtn.isVisible().catch(() => false)) {
    await searchBtn.click();
  } else {
    throw new Error('Could not find Search button');
  }

  // Wait for results to load
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await sleep(2000);
}

async function scrapeAllPages(
  page: Page,
  runId: string,
  county: string,
  licenseType: string
): Promise<number> {
  let totalRecords = 0;
  let currentPage = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    console.log(`[Scraper] Parsing page ${currentPage}...`);

    // Check for "no results" message
    const noResults = await page
      .locator('text=No Records Found, text=0 Records')
      .isVisible()
      .catch(() => false);

    if (noResults) {
      console.log(`[Scraper] No results found for ${county} / ${licenseType}`);
      break;
    }

    const pageContent = await page.content();
    const records = parseResultsPage(pageContent, county, licenseType);

    if (records.length === 0) {
      console.log(`[Scraper] No records parsed on page ${currentPage}`);
      break;
    }

    // Save records to database
    for (const record of records) {
      const hash = hashRecord(
        `${record.licenseNumber}-${record.businessName}-${record.addressLine1}`
      );

      try {
        await prisma.rawLicense.upsert({
          where: { rawHash: hash },
          update: {},
          create: {
            scrapeRunId: runId,
            county,
            licenseCategory: LICENSE_CATEGORY,
            licenseType,
            businessName: record.businessName,
            licenseeName: record.licenseeName,
            licenseNumber: record.licenseNumber,
            licenseStatus: record.licenseStatus,
            expirationDate: record.expirationDate,
            addressLine1: record.addressLine1,
            addressLine2: record.addressLine2,
            city: record.city,
            state: record.state,
            zip: record.zip,
            sourceUrl: page.url(),
            sourcePage: currentPage,
            rawHash: hash,
          },
        });
        totalRecords++;
      } catch (error) {
        // Skip duplicates silently
        if (!(error instanceof Error && error.message.includes('Unique constraint'))) {
          console.error(`[Scraper] Error saving record:`, error);
        }
      }
    }

    // Check for next page
    hasMorePages = await navigateToNextPage(page, currentPage);
    currentPage++;

    // Safety limit
    if (currentPage > 500) {
      console.log(`[Scraper] Reached page limit (500), stopping`);
      break;
    }

    await sleep(1500); // Be polite between pages
  }

  return totalRecords;
}

async function navigateToNextPage(page: Page, currentPage: number): Promise<boolean> {
  const nextPage = currentPage + 1;

  // Look for page navigation links
  // DBPR uses links like: <a href="javascript:...">2</a> or form-based pagination
  const pageLinkSelectors = [
    `a:has-text("${nextPage}")`,
    `a[href*="Page=${nextPage}"]`,
    `a[href*="page=${nextPage}"]`,
    'a:has-text("Next")',
    'a:has-text(">")',
    `input[type="submit"][value="${nextPage}"]`,
  ];

  // First check if the total page info indicates more pages
  const pageInfo = await page.locator('text=/Page \\d+ of \\d+/').textContent().catch(() => '');
  if (pageInfo) {
    const match = pageInfo.match(/Page\s+(\d+)\s+of\s+(\d+)/);
    if (match) {
      const current = parseInt(match[1]);
      const total = parseInt(match[2]);
      if (current >= total) return false;
    }
  }

  for (const selector of pageLinkSelectors) {
    const link = page.locator(selector).first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await sleep(1000);
      return true;
    }
  }

  return false;
}

async function deduplicateRecords(runId: string, county: string): Promise<number> {
  const rawLicenses = await prisma.rawLicense.findMany({
    where: { scrapeRunId: runId },
  });

  const uniqueBusinesses = new Map<string, typeof rawLicenses[0]>();

  for (const raw of rawLicenses) {
    // Dedup strategy 1: exact license number match
    // Dedup strategy 2: normalized name + address
    const normName = normalizeBusinessName(raw.businessName);
    const normAddr = normalizeAddress(raw.addressLine1 || '');
    const key = `${normName}::${normAddr}`;

    if (!uniqueBusinesses.has(key)) {
      uniqueBusinesses.set(key, raw);
    }
  }

  let uniqueCount = 0;

  for (const [, raw] of uniqueBusinesses) {
    const normName = normalizeBusinessName(raw.businessName);
    const normAddr = normalizeAddress(raw.addressLine1 || '');

    try {
      const business = await prisma.business.upsert({
        where: {
          normalizedBusinessName_normalizedAddress: {
            normalizedBusinessName: normName,
            normalizedAddress: normAddr,
          },
        },
        update: {
          lastSeenAt: new Date(),
          latestLicenseStatus: raw.licenseStatus,
          primaryTrade: raw.licenseType,
          canonicalLicenseNumber: raw.licenseNumber,
        },
        create: {
          normalizedBusinessName: normName,
          displayBusinessName: raw.businessName,
          normalizedAddress: normAddr,
          county: county,
          primaryTrade: raw.licenseType,
          latestLicenseStatus: raw.licenseStatus,
          canonicalLicenseNumber: raw.licenseNumber,
        },
      });

      // Link license to business
      await prisma.businessLicense.create({
        data: {
          businessId: business.id,
          rawLicenseId: raw.id,
          licenseType: raw.licenseType,
          licenseNumber: raw.licenseNumber,
          status: raw.licenseStatus,
          expirationDate: raw.expirationDate,
        },
      }).catch(() => {}); // Ignore if already linked

      uniqueCount++;
    } catch (error) {
      console.error(`[Scraper] Dedup error for ${raw.businessName}:`, error);
    }
  }

  return uniqueCount;
}

async function captureScreenshot(page: Page, name: string): Promise<void> {
  try {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    const filename = `${name}-${Date.now()}.png`;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });
    console.log(`[Scraper] Screenshot saved: ${filename}`);
  } catch (e) {
    console.error('[Scraper] Failed to capture screenshot:', e);
  }
}
