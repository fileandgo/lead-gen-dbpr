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
 * Parse the HTML content of a DBPR search results page.
 *
 * The DBPR results page displays records in a table-like format:
 * - License Type | Name | Name Type | License Number | License Type/Rank | Status/Expires
 * - Below each record: Main Address and optionally License Location Address
 *
 * This parser is designed to be resilient to minor HTML structure changes.
 */
export function parseResultsPage(
  html: string,
  county: string,
  licenseType: string
): ParsedRecord[] {
  const records: ParsedRecord[] = [];

  // Strategy 1: Parse table rows (most DBPR pages use tables)
  const tableRecords = parseTableFormat(html);
  if (tableRecords.length > 0) return tableRecords;

  // Strategy 2: Parse div-based layout
  const divRecords = parseDivFormat(html);
  if (divRecords.length > 0) return divRecords;

  // Strategy 3: Regex-based fallback
  return parseRegexFallback(html);
}

function parseTableFormat(html: string): ParsedRecord[] {
  const records: ParsedRecord[] = [];

  // DBPR typically uses a table with class or specific structure
  // Each result block typically contains:
  // - A row with license type, name, name type, license number, rank, status
  // - Following row(s) with address info

  // Find all result entries. DBPR wraps each license in a section with address below.
  const entryPattern = /License\s+Type[^]*?(?=License\s+Type|Page\s+\d+\s+of|$)/gi;

  // Alternative: split by common patterns in result rows
  // Look for license number patterns (e.g., CRC1234567, CBC1234567, etc.)
  const licenseNumberPattern = /([A-Z]{2,3}\d{5,7})/g;
  const namePattern = /<a[^>]*>([^<]+)<\/a>/gi;

  // Split HTML into result blocks
  // DBPR results typically have each record separated by <hr> or table rows
  const blocks = html.split(/<tr[^>]*class=["'][^"']*(?:result|data|row)[^"']*["'][^>]*>/i);

  if (blocks.length <= 1) {
    // Try splitting by horizontal rules or other delimiters
    const altBlocks = html.split(/(?:<hr[^>]*>)|(?:<\/tr>\s*<tr[^>]*>)/i);
    if (altBlocks.length > 1) {
      return parseBlocksForRecords(altBlocks);
    }
  } else {
    return parseBlocksForRecords(blocks);
  }

  return records;
}

function parseDivFormat(html: string): ParsedRecord[] {
  return []; // Placeholder for div-based parsing if needed
}

function parseBlocksForRecords(blocks: string[]): ParsedRecord[] {
  const records: ParsedRecord[] = [];

  for (const block of blocks) {
    // Skip blocks without license numbers
    const licNumMatch = block.match(/([A-Z]{2,4}\d{4,8})/)
      || block.match(/License\s*(?:Number|#|No\.?)\s*:?\s*([A-Z0-9]+)/i);

    if (!licNumMatch) continue;

    const licenseNumber = licNumMatch[1];

    // Extract name - usually in a link or bold text
    let name = '';
    const nameMatch = block.match(/<a[^>]*>\s*([^<]+)\s*<\/a>/i)
      || block.match(/<b>\s*([^<]+)\s*<\/b>/i)
      || block.match(/<strong>\s*([^<]+)\s*<\/strong>/i);

    if (nameMatch) {
      name = nameMatch[1].trim();
    }

    if (!name || name.length < 2) continue;

    // Extract status
    let status = 'Unknown';
    const statusMatch = block.match(
      /(?:Status\/Expires|Status)[^:]*:?\s*(?:<[^>]*>)*\s*([^<\n]+)/i
    ) || block.match(
      /(Current,\s*Active|Null\s+and\s+Void|Application\s+in\s+Progress|Eligible\s+for\s+Exam|Current|Delinquent)/i
    );
    if (statusMatch) {
      status = statusMatch[1].trim();
    }

    // Extract expiration date
    let expirationDate: string | null = null;
    const expMatch = status.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (expMatch) {
      expirationDate = expMatch[1];
      status = status.replace(expirationDate, '').replace(/,?\s*$/, '').trim();
    }

    // Extract address
    let addressLine1: string | null = null;
    let city: string | null = null;
    let state: string | null = null;
    let zip: string | null = null;

    const addressMatch = block.match(
      /Main\s*Address[^:]*:?\s*(?:<[^>]*>)*\s*([^<\n]+)/i
    );
    if (addressMatch) {
      const fullAddr = addressMatch[1].trim();
      addressLine1 = fullAddr;

      // Try to parse city, state, zip from address
      const cityStateZip = fullAddr.match(/([A-Za-z\s]+),?\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/);
      if (cityStateZip) {
        city = cityStateZip[1].trim();
        state = cityStateZip[2];
        zip = cityStateZip[3];
      }
    }

    // Extract DBA name if present
    const dbaMatch = block.match(/DBA[^:]*:?\s*([^<\n]+)/i);
    const businessName = dbaMatch ? dbaMatch[1].trim() : name;

    records.push({
      businessName: businessName || name,
      licenseeName: name,
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

  return records;
}

function parseRegexFallback(html: string): ParsedRecord[] {
  const records: ParsedRecord[] = [];

  // Strip HTML tags for text-based parsing
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n');

  // Find patterns: License number followed by name and status
  const licensePattern = /([A-Z]{2,4}\d{4,8})/g;
  let match;

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const licMatch = line.match(/([A-Z]{2,4}\d{4,8})/);

    if (licMatch) {
      // Look backward for a name
      let name = '';
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        if (lines[j].length > 3 && !lines[j].match(/^(License|Name|Type|Main|Address|Status|Page)/i)) {
          name = lines[j];
          break;
        }
      }

      // Look forward for status and address
      let status = 'Unknown';
      let address = '';

      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
        if (lines[j].match(/(Current|Active|Null|Void|Application|Eligible|Delinquent)/i)) {
          status = lines[j];
        }
        if (lines[j].match(/Main\s*Address/i) && j + 1 < lines.length) {
          address = lines[j + 1];
        }
      }

      if (name) {
        let expirationDate: string | null = null;
        const expMatch = status.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (expMatch) {
          expirationDate = expMatch[1];
          status = status.replace(expirationDate, '').replace(/,?\s*$/, '').trim();
        }

        let city: string | null = null;
        let state: string | null = null;
        let zip: string | null = null;

        const cityStateZip = address.match(/([A-Za-z\s]+),?\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/);
        if (cityStateZip) {
          city = cityStateZip[1].trim();
          state = cityStateZip[2];
          zip = cityStateZip[3];
        }

        records.push({
          businessName: name,
          licenseeName: name,
          licenseNumber: licMatch[1],
          licenseStatus: status,
          expirationDate,
          addressLine1: address || null,
          addressLine2: null,
          city,
          state,
          zip,
        });
      }
    }
  }

  return records;
}
