import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function diagnose() {
  const browser = await chromium.launch({ headless: false, channel: 'chromium' });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to DBPR
    await page.goto('https://www.myfloridalicense.com/wl11.asp?mode=0&SID=', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Select "Search by City or County"
    await page.click('input[type="radio"][name="SearchType"][value="City"]');
    await new Promise(r => setTimeout(r, 300));
    await page.click('button[name="SelectSearchType"]');
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));

    // Select Board = Construction Industry
    await page.selectOption('select[name="Board"]', '06');
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await new Promise(r => setTimeout(r, 2000));

    // Set remaining fields via evaluate
    await page.evaluate(() => {
      const licTypeSel = document.querySelector('select[name="LicenseType"]') as HTMLSelectElement;
      if (licTypeSel) {
        const match = Array.from(licTypeSel.options).find(o => o.text.trim() === 'Certified Roofing Contractor');
        if (match) licTypeSel.value = match.value;
      }
      const countySel = document.querySelector('select[name="County"]') as HTMLSelectElement;
      if (countySel) {
        const match = Array.from(countySel.options).find(o => o.text.trim().toLowerCase() === 'broward');
        if (match) countySel.value = match.value;
      }
      const stateSel = document.querySelector('select[name="State"]') as HTMLSelectElement;
      if (stateSel) stateSel.value = 'FL';
      const recsSel = document.querySelector('select[name="RecsPerPage"]') as HTMLSelectElement;
      if (recsSel) recsSel.value = '50';
    });

    // Submit
    await page.locator('button:has-text("Search"), input[value="Search"]').first().click();
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Save page 1 HTML
    const html1 = await page.content();
    fs.writeFileSync(path.join(process.cwd(), 'diag-page1.html'), html1);
    console.log('Saved page 1 HTML');

    // Check page text for pagination info
    const pageText = await page.evaluate(() => document.body.innerText);
    const pageMatch = pageText.match(/Page\s+(\d+)\s+of\s+(\d+)/);
    console.log('Page match:', pageMatch ? `Page ${pageMatch[1]} of ${pageMatch[2]}` : 'NO MATCH');

    // Check total records info
    const totalMatch = pageText.match(/(\d+)\s+(?:Records?|results?)\s+(?:Found|Returned)/i);
    console.log('Total records match:', totalMatch ? totalMatch[0] : 'NO MATCH');

    // Count LicenseDetail links
    const linkCount = (html1.match(/LicenseDetail\.asp/gi) || []).length;
    console.log('LicenseDetail links on page 1:', linkCount);

    // Check all pagination elements
    const paginationInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const inputs = Array.from(document.querySelectorAll('input[type="submit"]'));
      return {
        buttons: buttons.map(b => ({ name: b.name, value: b.value, text: b.textContent?.trim(), onclick: b.getAttribute('onclick') })),
        inputs: inputs.map(i => ({ name: i.name, value: i.value })),
      };
    });
    console.log('Buttons:', JSON.stringify(paginationInfo.buttons, null, 2));
    console.log('Submit inputs:', JSON.stringify(paginationInfo.inputs, null, 2));

    // Navigate to page 2
    const fwdBtn = page.locator('button[name="SearchForward"]');
    if (await fwdBtn.isVisible().catch(() => false)) {
      console.log('SearchForward button found, clicking...');
      await fwdBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));

      const html2 = await page.content();
      fs.writeFileSync(path.join(process.cwd(), 'diag-page2.html'), html2);
      console.log('Saved page 2 HTML');

      const pageText2 = await page.evaluate(() => document.body.innerText);
      const pageMatch2 = pageText2.match(/Page\s+(\d+)\s+of\s+(\d+)/);
      console.log('Page 2 match:', pageMatch2 ? `Page ${pageMatch2[1]} of ${pageMatch2[2]}` : 'NO MATCH');
    } else {
      console.log('SearchForward button NOT found!');
    }

    // Also check: what does the LicenseType dropdown text look like for Pool/Spa?
    // Navigate back to form
    await page.goto('https://www.myfloridalicense.com/wl11.asp?mode=0&SID=', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.click('input[type="radio"][name="SearchType"][value="City"]');
    await new Promise(r => setTimeout(r, 300));
    await page.click('button[name="SelectSearchType"]');
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));
    await page.selectOption('select[name="Board"]', '06');
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await new Promise(r => setTimeout(r, 2000));

    // Get all license type option texts
    const licenseTypeOptions = await page.evaluate(() => {
      const sel = document.querySelector('select[name="LicenseType"]') as HTMLSelectElement;
      if (!sel) return [];
      return Array.from(sel.options).map(o => ({ value: o.value, text: o.text.trim() }));
    });
    console.log('\nAll LicenseType options:');
    for (const opt of licenseTypeOptions) {
      console.log(`  "${opt.text}" (value: ${opt.value})`);
    }

  } finally {
    await browser.close();
  }
}

diagnose().catch(e => { console.error(e); process.exit(1); });
