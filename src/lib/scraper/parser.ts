interface ParsedRecord {
  businessName: string;
  licenseeName: string;
  licenseNumber: string;
  licenseStatus: string;
  expirationDate: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

/**
 * Parse DBPR search results page HTML.
 *
 * Each record consists of two table rows:
 *  Row 1: License Type | Name (link) | Name Type (DBA/Primary) | LicenseNumber<br>Rank | Status<br>Date
 *  Row 2: Address row with "Main Address*:" or "License Location Address*:" + full address
 *
 * DBPR license numbers follow the pattern: 2-3 letter prefix + 6-7 digits
 * e.g., CBC1261841, CRC1335391, CGC1234567, CAC1234567, RB0012345
 */
export function parseResultsPage(
  html: string,
  _county: string,
  _licenseType: string
): ParsedRecord[] {
  const records: ParsedRecord[] = [];

  // Find all name links: <a href="LicenseDetail.asp?...">NAME</a>
  const linkPattern = /<a\s+href="LicenseDetail\.asp[^"]*">\s*([^<]+?)\s*<\/a>/gi;
  let linkMatch;
  const linkPositions: { name: string; pos: number; endPos: number }[] = [];

  while ((linkMatch = linkPattern.exec(html)) !== null) {
    linkPositions.push({
      name: linkMatch[1].trim(),
      pos: linkMatch.index,
      endPos: linkMatch.index + linkMatch[0].length,
    });
  }

  if (linkPositions.length === 0) {
    console.log('[Parser] No LicenseDetail links found');
    return records;
  }

  console.log(`[Parser] Found ${linkPositions.length} license links`);

  // DBPR license number pattern: 2-3 uppercase letters + 6-7 digits
  // Prefixes: CBC, CRC, CGC, CAC, CMC, CPC, CPP, CCC, CFP, CSC, CUC,
  //           RB, RG, RM, RP, RR, RS, RU, etc.
  const licenseNumPattern = /\b(C[A-Z]{1,2}\d{6,7}|R[A-Z]\d{6,7}|P[A-Z]\d{6,7})\b/;

  for (let i = 0; i < linkPositions.length; i++) {
    const { name, endPos } = linkPositions[i];

    // Get the HTML AFTER the name link up to the next record or 3000 chars
    const nextPos = i + 1 < linkPositions.length ? linkPositions[i + 1].pos : endPos + 3000;
    const afterLink = html.substring(endPos, Math.min(html.length, nextPos));

    // Extract license number from the cell after the name link
    // It appears in a <td> like: CBC1261841<br>Cert Building
    const licNumMatch = afterLink.match(licenseNumPattern);
    if (!licNumMatch) continue;
    const licenseNumber = licNumMatch[1];

    // Extract status and expiration date
    // Status cell content: "Current, Active<br>08/31/2026" or "Null and Void<br>08/31/2016"
    let status = 'Unknown';
    let expirationDate: string | null = null;

    const statusPattern = /(Current,?\s*Active|Null\s+and\s+Void|Application\s+in\s+Progress|Eligible\s+for\s+Exam|Current,?\s*Inactive|Delinquent|License\s+Authority\s+Voided|Revoked|Suspended)/i;
    const statusMatch = afterLink.match(statusPattern);
    if (statusMatch) {
      status = statusMatch[1].replace(/,\s*$/, '').trim();
    }

    // Find expiration date near the status
    const dateMatch = afterLink.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (dateMatch) {
      expirationDate = dateMatch[1];
    }

    // Extract address - look for "Main Address" or "License Location Address"
    let addressLine1: string | null = null;
    let city: string | null = null;
    let state: string | null = null;
    let zip: string | null = null;

    const addrMatch = afterLink.match(
      /(?:Main Address|License Location Address)[^<]*<\/b>\s*<\/span>\s*<\/font>\s*<\/td>\s*<td[^>]*>\s*<font[^>]*>\s*([^<]+)/i
    );
    if (addrMatch) {
      const fullAddr = addrMatch[1].replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
      addressLine1 = fullAddr;

      // Parse city, state, zip from address like "16727 SW 135 AVE  ARCHER, FL 32618"
      // Strategy: find the ", STATE ZIP" pattern at the end, then extract city before it
      const stateZipMatch = fullAddr.match(/,\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
      if (stateZipMatch) {
        state = stateZipMatch[1];
        zip = stateZipMatch[2];

        // City is the word(s) between double spaces and the comma
        // "16727 SW 135 AVE  ARCHER, FL 32618" → ARCHER
        const beforeStateZip = fullAddr.substring(0, fullAddr.lastIndexOf(',')).trim();
        // Look for double-space separator between street and city
        const dblSpaceIdx = beforeStateZip.lastIndexOf('  ');
        if (dblSpaceIdx >= 0) {
          city = beforeStateZip.substring(dblSpaceIdx).trim();
        } else {
          // Fallback: take the last word(s) that look like a city name
          const parts = beforeStateZip.split(/\s+/);
          // City is usually the last 1-3 words (e.g., "LAKE CITY", "FORT LAUDERDALE")
          city = parts.slice(-2).join(' ');
        }
      } else {
        // Try without comma: "STREET  CITY STATE ZIP"
        const noCommaMatch = fullAddr.match(/\s{2,}([A-Z][A-Z\s]*?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
        if (noCommaMatch) {
          city = noCommaMatch[1].trim();
          state = noCommaMatch[2];
          zip = noCommaMatch[3];
        }
      }
    }

    records.push({
      businessName: decodeHtmlEntities(name),
      licenseeName: decodeHtmlEntities(name),
      licenseNumber,
      licenseStatus: status,
      expirationDate,
      addressLine1,
      addressLine2: null,
      city,
      state,
      zip,
    });
  }

  console.log(`[Parser] Parsed ${records.length} records`);
  return records;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
