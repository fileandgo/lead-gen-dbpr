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

    // License Type (use startsWith for truncated DBPR option texts)
    const licTypeSel = document.querySelector('select[name="LicenseType"]') as HTMLSelectElement;
    if (licTypeSel) {
      const match = Array.from(licTypeSel.options).find(o => {
        const optText = o.text.trim();
        if (!optText) return false;
        return optText === args.licenseType || args.licenseType.startsWith(optText);
      });
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

  // Wait for results to appear (look for "Page X of Y" or "No Records Found")
  let loaded = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(1000);
    try {
      const text = await page.evaluate(() => document.body.innerText);
      if (text.match(/Page\s+\d+\s+of\s+\d+/) || text.includes('No Records Found') || text.includes('0 Records')) {
        loaded = true;
        break;
      }
    } catch {
      // Page might be navigating
    }
  }

  if (!loaded) {
    console.log('[Scraper] Warning: search results page did not load within 30s');
  }
  console.log('[Scraper] Search submitted');
  await sleep(1000);
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

    // Save all records to database (DBA + Primary) for data completeness
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
            nameType: record.nameType,
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
  }

  return totalRecords;
}

async function navigateToNextPage(page: Page, _currentPage: number): Promise<boolean> {
  // Check pagination info
  const pageText = await page.evaluate(() => document.body.innerText);
  const pageMatch = pageText.match(/Page\s+(\d+)\s+of\s+(\d+)/);
  if (!pageMatch) {
    console.log('[Scraper] Pagination: could not find "Page X of Y" text');
    await captureScreenshot(page, 'pagination-no-match');
    return false;
  }

  const current = parseInt(pageMatch[1]);
  const total = parseInt(pageMatch[2]);
  console.log(`[Scraper] Pagination: page ${current} of ${total}`);
  if (current >= total) return false;

  // DBPR uses <button name="SearchForward" onclick="return ChangePage(4);"> for next page
  const forwardBtn = page.locator('button[name="SearchForward"]');
  if (!(await forwardBtn.isVisible().catch(() => false))) {
    console.log('[Scraper] Pagination: SearchForward button not visible');
    await captureScreenshot(page, 'pagination-no-btn');
    return false;
  }

  await forwardBtn.click();

  // Wait for the page number to actually change (poll instead of networkidle)
  const expectedPage = String(current + 1);
  let loaded = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(1000);
    try {
      const newText = await page.evaluate(() => document.body.innerText);
      const newMatch = newText.match(/Page\s+(\d+)\s+of\s+(\d+)/);
      if (newMatch && newMatch[1] === expectedPage) {
        loaded = true;
        break;
      }
    } catch {
      // Page might be navigating, retry
    }
  }

  if (!loaded) {
    console.log(`[Scraper] Pagination: page did not advance to ${expectedPage} after 30s`);
    await captureScreenshot(page, `pagination-stuck-${current}`);
    return false;
  }

  await sleep(500);
  return true;
}

async function deduplicateRecords(runId: string, county: string): Promise<number> {
  const rawLicenses = await prisma.rawLicense.findMany({
    where: { scrapeRunId: runId },
  });

  // Step 1: Group raw records by license number to merge DBA + Primary pairs.
  // DBPR returns two rows per license: one DBA (business name), one Primary (individual name).
  // They share the same license number.
  const byLicenseNum = new Map<string, typeof rawLicenses>();
  for (const raw of rawLicenses) {
    const key = raw.licenseNumber;
    if (!byLicenseNum.has(key)) {
      byLicenseNum.set(key, []);
    }
    byLicenseNum.get(key)!.push(raw);
  }

  // Step 2: For each license number, resolve DBA name, Primary (individual) name, and address.
  interface MergedLicense {
    displayName: string;       // DBA name (business name) — preferred for display
    licenseeName: string | null; // Primary name (individual) — for person search
    licenseNumber: string;
    licenseType: string;
    licenseStatus: string;
    expirationDate: string | null;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    rawIds: string[];
  }

  const mergedLicenses: MergedLicense[] = [];

  for (const [licNum, rows] of Array.from(byLicenseNum)) {
    const dbaRow = rows.find(r => r.nameType === 'DBA');
    const primaryRow = rows.find(r => r.nameType === 'Primary');
    const fallbackRow = rows[0]; // For old data without nameType

    // Only use DBA rows for display name; skip "." placeholder names
    let displayName: string | null = null;
    if (dbaRow && dbaRow.businessName !== '.' && dbaRow.businessName.trim() !== '') {
      displayName = dbaRow.businessName;
    } else if (!dbaRow && !primaryRow) {
      // No nameType at all (old data) — use the name as-is
      displayName = fallbackRow.businessName;
    }

    const licenseeName = primaryRow?.licenseeName || primaryRow?.businessName || null;

    // If DBA name is blank/placeholder and only Primary exists, skip this license entirely
    // User wants only businesses with real DBA names
    if (!displayName) {
      continue;
    }

    // Prefer address from DBA row, then Primary, then fallback
    const addrRow = dbaRow || primaryRow || fallbackRow;
    const statusRow = rows.find(r => r.licenseStatus?.includes('Active')) || fallbackRow;

    mergedLicenses.push({
      displayName,
      licenseeName,
      licenseNumber: licNum,
      licenseType: statusRow.licenseType,
      licenseStatus: statusRow.licenseStatus,
      expirationDate: statusRow.expirationDate,
      addressLine1: addrRow.addressLine1,
      city: addrRow.city,
      state: addrRow.state,
      zip: addrRow.zip,
      rawIds: rows.map(r => r.id),
    });
  }

  // Step 3: Group merged licenses by normalized displayName + address for Business-level dedup.
  // Multiple license types (CBC, CRC) for the same company become one Business.
  const businessGroups = new Map<string, MergedLicense[]>();

  for (const ml of mergedLicenses) {
    const normName = normalizeBusinessName(ml.displayName);
    const normAddr = normalizeAddress(ml.addressLine1 || '');
    const key = `${normName}::${normAddr}`;

    if (!businessGroups.has(key)) {
      businessGroups.set(key, []);
    }
    businessGroups.get(key)!.push(ml);
  }

  let uniqueCount = 0;

  for (const licenses of Array.from(businessGroups.values())) {
    const first = licenses[0];
    const normName = normalizeBusinessName(first.displayName);
    const normAddr = normalizeAddress(first.addressLine1 || '');

    // Prefer an active license for the primary trade
    const activeLic = licenses.find(l => l.licenseStatus?.includes('Active')) || first;

    // Collect the licensee name from any license in the group
    const licenseeName = licenses.find(l => l.licenseeName)?.licenseeName || null;

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
          latestLicenseStatus: activeLic.licenseStatus,
          primaryTrade: activeLic.licenseType,
          canonicalLicenseNumber: activeLic.licenseNumber,
          licenseeName,
          city: first.city,
          state: first.state,
          zip: first.zip,
        },
        create: {
          normalizedBusinessName: normName,
          displayBusinessName: first.displayName,
          normalizedAddress: normAddr,
          county,
          primaryTrade: activeLic.licenseType,
          latestLicenseStatus: activeLic.licenseStatus,
          canonicalLicenseNumber: activeLic.licenseNumber,
          licenseeName,
          city: first.city,
          state: first.state,
          zip: first.zip,
        },
      });

      // Link ALL licenses for this business
      for (const lic of licenses) {
        // Pick any rawId to link (first one)
        const rawId = lic.rawIds[0];
        await prisma.businessLicense.upsert({
          where: {
            businessId_licenseNumber: {
              businessId: business.id,
              licenseNumber: lic.licenseNumber,
            },
          },
          update: {
            status: lic.licenseStatus,
            expirationDate: lic.expirationDate,
            rawLicenseId: rawId,
          },
          create: {
            businessId: business.id,
            rawLicenseId: rawId,
            licenseType: lic.licenseType,
            licenseNumber: lic.licenseNumber,
            status: lic.licenseStatus,
            expirationDate: lic.expirationDate,
          },
        }).catch(() => {});
      }

      uniqueCount++;
    } catch (error) {
      console.error(`[Scraper] Dedup error for ${first.displayName}:`, error);
    }
  }

  console.log(`[Scraper] Dedup: ${rawLicenses.length} raw → ${mergedLicenses.length} merged licenses → ${uniqueCount} businesses`);
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
