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
      headless: false,
      channel: 'chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    let totalRaw = 0;

    for (const licenseType of licenseTypes) {
      console.log(`[Scraper] Starting search: ${county} / ${licenseType}`);
      const count = await scrapeForLicenseType(browser, runId, county, licenseType);
      totalRaw += count;
      console.log(`[Scraper] Found ${count} records for ${licenseType}`);
      await sleep(2000);
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
    // Step 1: Navigate to DBPR search page
    console.log('[Scraper] Step 1: Navigating to DBPR...');
    await page.goto(`${DBPR_BASE_URL}/wl11.asp?mode=0&SID=`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await captureScreenshot(page, `step1-landing`);

    // Step 2: Select "Search by City or County" radio and submit
    console.log('[Scraper] Step 2: Selecting "Search by City or County"...');
    await navigateToCountyForm(page);
    await captureScreenshot(page, `step2-county-form`);

    // Step 3: Fill the search form
    console.log('[Scraper] Step 3: Filling search form...');
    await fillSearchForm(page, county, licenseType);
    await captureScreenshot(page, `step3-filled`);

    // Step 4: Submit the search
    console.log('[Scraper] Step 4: Submitting search...');
    await submitSearch(page);
    await captureScreenshot(page, `step4-results`);

    // Step 5: Parse all pages of results
    console.log('[Scraper] Step 5: Parsing results...');
    totalRecords = await scrapeAllPages(page, runId, county, licenseType);
  } catch (error) {
    await captureScreenshot(page, `error-${licenseType}`);
    throw error;
  } finally {
    await context.close();
  }

  return totalRecords;
}

/**
 * Select the "Search by City or County" radio button and submit the form
 * to navigate to the county search page.
 *
 * Radio button values on DBPR:
 *   Name, LicNbr, City (=City or County), LicTyp
 */
async function navigateToCountyForm(page: Page): Promise<void> {
  // Click the "City" radio button (which is "Search by City or County")
  const radioSelector = 'input[type="radio"][name="SearchType"][value="City"]';
  await page.waitForSelector(radioSelector, { timeout: 10000 });
  await page.click(radioSelector);
  console.log('[Scraper] Clicked "City" radio button');
  await sleep(300);

  // Click the Search button to navigate to the county form
  await page.click('button[name="SelectSearchType"]');
  await page.waitForLoadState('networkidle', { timeout: 20000 });
  console.log('[Scraper] Navigated to county search form');
  await sleep(1000);

  // Verify we're on the county form by checking for County dropdown
  const hasCountyDropdown = await page.locator('select[name="County"]').isVisible().catch(() => false);
  if (!hasCountyDropdown) {
    throw new Error('Failed to navigate to county search form - County dropdown not found');
  }
  console.log('[Scraper] Confirmed: on county search form');
}

/**
 * Fill in the county search form fields.
 *
 * Field names: Board, LicenseType, City, County, State, SpecQual, RecsPerPage
 * Board change triggers page reload to populate LicenseType.
 */
async function fillSearchForm(page: Page, county: string, licenseType: string): Promise<void> {
  // 1. Select License Category (Board) = "Construction Industry" (value "06")
  //    This triggers a page reload to populate LicenseType dropdown
  console.log('[Scraper] Selecting Board = Construction Industry...');
  await page.selectOption('select[name="Board"]', '06');
  await page.waitForLoadState('networkidle', { timeout: 20000 });
  await sleep(2000);
  console.log('[Scraper] Board selected, page reloaded');

  // 2-5: Set remaining fields directly via evaluate WITHOUT triggering change events
  //      (DBPR onchange handlers auto-submit the form, causing unwanted navigation)
  const formResult = await page.evaluate((args: { licenseType: string; county: string }) => {
    const results: string[] = [];

    // License Type
    const licTypeSel = document.querySelector('select[name="LicenseType"]') as HTMLSelectElement;
    if (licTypeSel) {
      const match = Array.from(licTypeSel.options).find(o => o.text.trim() === args.licenseType);
      if (match) {
        licTypeSel.value = match.value;
        results.push(`LicenseType=${match.value}`);
      } else {
        results.push(`LicenseType=NOT_FOUND`);
      }
    }

    // County
    const countySel = document.querySelector('select[name="County"]') as HTMLSelectElement;
    if (countySel) {
      const match = Array.from(countySel.options).find(
        o => o.text.trim().toLowerCase() === args.county.toLowerCase()
      );
      if (match) {
        countySel.value = match.value;
        results.push(`County=${match.value}`);
      } else {
        results.push(`County=NOT_FOUND`);
      }
    }

    // State = Florida
    const stateSel = document.querySelector('select[name="State"]') as HTMLSelectElement;
    if (stateSel) {
      stateSel.value = 'FL';
      results.push('State=FL');
    }

    // Records per page = 50
    const recsSel = document.querySelector('select[name="RecsPerPage"]') as HTMLSelectElement;
    if (recsSel) {
      recsSel.value = '50';
      results.push('RecsPerPage=50');
    }

    return results;
  }, { licenseType, county });

  console.log(`[Scraper] Form fields set: ${formResult.join(', ')}`);

  if (formResult.some(r => r.includes('NOT_FOUND'))) {
    throw new Error(`Form field not found: ${formResult.filter(r => r.includes('NOT_FOUND')).join(', ')}`);
  }
}

/**
 * Submit the search form and wait for results
 */
async function submitSearch(page: Page): Promise<void> {
  // The Search button: <button type="submit" name="..." value="Search">Search</button>
  // or <input type="submit" value="Search">
  const searchBtnSelector = 'button:has-text("Search"), input[value="Search"]';

  await page.locator(searchBtnSelector).first().click();
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  console.log('[Scraper] Search submitted');
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
    const pageText = await page.evaluate(() => document.body.innerText);
    if (pageText.includes('No Records Found') || pageText.includes('0 Records')) {
      console.log(`[Scraper] No results found for ${county} / ${licenseType}`);
      break;
    }

    const pageContent = await page.content();
    const records = parseResultsPage(pageContent, county, licenseType);

    if (records.length === 0 && currentPage === 1) {
      console.log(`[Scraper] No records parsed on first page. Page text sample: ${pageText.substring(0, 500)}`);
      break;
    }

    if (records.length === 0) {
      break;
    }

    console.log(`[Scraper] Parsed ${records.length} records on page ${currentPage}`);

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
        if (!(error instanceof Error && error.message.includes('Unique constraint'))) {
          console.error(`[Scraper] Error saving record:`, error);
        }
      }
    }

    // Check for next page
    hasMorePages = await navigateToNextPage(page, currentPage);
    currentPage++;

    if (currentPage > 500) {
      console.log(`[Scraper] Reached page limit (500), stopping`);
      break;
    }

    await sleep(1500);
  }

  return totalRecords;
}

async function navigateToNextPage(page: Page, _currentPage: number): Promise<boolean> {
  // Check pagination info
  const pageText = await page.evaluate(() => document.body.innerText);
  const pageMatch = pageText.match(/Page\s+(\d+)\s+of\s+(\d+)/);
  if (pageMatch) {
    const current = parseInt(pageMatch[1]);
    const total = parseInt(pageMatch[2]);
    console.log(`[Scraper] Pagination: page ${current} of ${total}`);
    if (current >= total) return false;
  } else {
    return false;
  }

  // DBPR uses <button name="SearchForward" onclick="return ChangePage(4);"> for next page
  const forwardBtn = page.locator('button[name="SearchForward"]');
  if (await forwardBtn.isVisible().catch(() => false)) {
    await forwardBtn.click();
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(1500);
    return true;
  }

  return false;
}

async function deduplicateRecords(runId: string, county: string): Promise<number> {
  const rawLicenses = await prisma.rawLicense.findMany({
    where: { scrapeRunId: runId },
  });

  // Group all raw records by normalized business key (name + address)
  // This keeps ALL licenses per business, not just the first
  const businessGroups = new Map<string, typeof rawLicenses>();

  for (const raw of rawLicenses) {
    const normName = normalizeBusinessName(raw.businessName);
    const normAddr = normalizeAddress(raw.addressLine1 || '');
    const key = `${normName}::${normAddr}`;

    if (!businessGroups.has(key)) {
      businessGroups.set(key, []);
    }
    businessGroups.get(key)!.push(raw);
  }

  let uniqueCount = 0;

  for (const records of Array.from(businessGroups.values())) {
    // Use the first record for business-level info
    const primary = records[0];
    const normName = normalizeBusinessName(primary.businessName);
    const normAddr = normalizeAddress(primary.addressLine1 || '');

    // Prefer an active license as the primary trade
    const activeRecord = records.find(r => r.licenseStatus?.includes('Active')) || primary;

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
          latestLicenseStatus: activeRecord.licenseStatus,
          primaryTrade: activeRecord.licenseType,
          canonicalLicenseNumber: activeRecord.licenseNumber,
        },
        create: {
          normalizedBusinessName: normName,
          displayBusinessName: primary.businessName,
          normalizedAddress: normAddr,
          county: county,
          primaryTrade: activeRecord.licenseType,
          latestLicenseStatus: activeRecord.licenseStatus,
          canonicalLicenseNumber: activeRecord.licenseNumber,
        },
      });

      // Link ALL licenses for this business, not just the first
      for (const raw of records) {
        await prisma.businessLicense.upsert({
          where: {
            businessId_licenseNumber: {
              businessId: business.id,
              licenseNumber: raw.licenseNumber,
            },
          },
          update: {
            status: raw.licenseStatus,
            expirationDate: raw.expirationDate,
            rawLicenseId: raw.id,
          },
          create: {
            businessId: business.id,
            rawLicenseId: raw.id,
            licenseType: raw.licenseType,
            licenseNumber: raw.licenseNumber,
            status: raw.licenseStatus,
            expirationDate: raw.expirationDate,
          },
        }).catch(() => {});
      }

      uniqueCount++;
    } catch (error) {
      console.error(`[Scraper] Dedup error for ${primary.businessName}:`, error);
    }
  }

  return uniqueCount;
}

async function captureScreenshot(page: Page, name: string): Promise<void> {
  try {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `${safeName}-${Date.now()}.png`;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });
    console.log(`[Scraper] Screenshot saved: ${filename}`);
  } catch (e) {
    console.error('[Scraper] Failed to capture screenshot:', e);
  }
}
