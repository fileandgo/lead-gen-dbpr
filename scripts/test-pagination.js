const { chromium } = require('playwright');

async function testPagination() {
  const browser = await chromium.launch({ headless: false, channel: 'chromium' });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // Navigate to DBPR
    await page.goto('https://www.myfloridalicense.com/wl11.asp?mode=0&SID=', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(function() {});

    // Select "Search by City or County"
    await page.click('input[type="radio"][name="SearchType"][value="City"]');
    await sleep(300);
    await page.click('button[name="SelectSearchType"]');
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await sleep(1000);

    // Select Board = Construction Industry
    await page.selectOption('select[name="Board"]', '06');
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await sleep(2000);

    // Set remaining fields
    await page.evaluate(function() {
      var licTypeSel = document.querySelector('select[name="LicenseType"]');
      if (licTypeSel) {
        var match = Array.from(licTypeSel.options).find(function(o) { return o.text.trim() === 'Certified Roofing Contractor'; });
        if (match) licTypeSel.value = match.value;
      }
      var countySel = document.querySelector('select[name="County"]');
      if (countySel) {
        var match2 = Array.from(countySel.options).find(function(o) { return o.text.trim().toLowerCase() === 'broward'; });
        if (match2) countySel.value = match2.value;
      }
      var stateSel = document.querySelector('select[name="State"]');
      if (stateSel) stateSel.value = 'FL';
      var recsSel = document.querySelector('select[name="RecsPerPage"]');
      if (recsSel) recsSel.value = '50';
    });

    // Submit
    await page.locator('button:has-text("Search"), input[value="Search"]').first().click();
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await sleep(2000);

    // Now paginate through pages and log what happens
    var maxPagesToTest = 20;
    for (var i = 1; i <= maxPagesToTest; i++) {
      var pageText = await page.evaluate(function() { return document.body.innerText; });
      var pageMatch = pageText.match(/Page\s+(\d+)\s+of\s+(\d+)/);

      if (pageMatch) {
        console.log('Page ' + pageMatch[1] + ' of ' + pageMatch[2] + ' - OK');
      } else {
        console.log('Page ' + i + ' - NO PAGE MATCH FOUND!');
        // Check what the page shows
        var sample = pageText.substring(0, 300);
        console.log('Page text sample: ' + sample);

        // Take screenshot
        await page.screenshot({ path: 'screenshots/pagination-fail-' + i + '.png', fullPage: true });
        console.log('Screenshot saved');
        break;
      }

      // Check if there's a next page
      if (parseInt(pageMatch[1]) >= parseInt(pageMatch[2])) {
        console.log('Reached last page');
        break;
      }

      // Click forward
      var fwdBtn = page.locator('button[name="SearchForward"]');
      var isVisible = await fwdBtn.isVisible().catch(function() { return false; });
      if (!isVisible) {
        console.log('SearchForward button NOT visible on page ' + i);
        await page.screenshot({ path: 'screenshots/no-forward-btn-' + i + '.png', fullPage: true });
        break;
      }

      await fwdBtn.click();

      // Wait for new page to load - check for page number change
      var startTime = Date.now();
      var loaded = false;
      var oldPage = pageMatch[1];

      for (var attempt = 0; attempt < 20; attempt++) {
        await sleep(1000);
        try {
          var newText = await page.evaluate(function() { return document.body.innerText; });
          var newMatch = newText.match(/Page\s+(\d+)\s+of\s+(\d+)/);
          if (newMatch && newMatch[1] !== oldPage) {
            loaded = true;
            break;
          }
        } catch (e) {
          console.log('Error checking page: ' + e.message);
        }
      }

      if (!loaded) {
        console.log('Page did not change after clicking forward on page ' + oldPage + ' (waited ' + (Date.now() - startTime) + 'ms)');
        await page.screenshot({ path: 'screenshots/page-stuck-' + oldPage + '.png', fullPage: true });
        break;
      }

      await sleep(500);
    }

  } finally {
    await browser.close();
  }
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

testPagination().catch(function(e) { console.error(e); process.exit(1); });
