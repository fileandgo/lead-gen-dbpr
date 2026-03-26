const fs = require('fs');
const html = fs.readFileSync('diag-page1.html', 'utf8');

// Count DBA vs Primary
const dbaCount = (html.match(/>DBA</gi) || []).length;
const primaryCount = (html.match(/>Primary</gi) || []).length;
console.log('DBA entries:', dbaCount);
console.log('Primary entries:', primaryCount);
console.log('Total name entries:', dbaCount + primaryCount);
console.log('LicenseDetail links:', (html.match(/LicenseDetail\.asp/gi) || []).length);

// Extract structured data from the HTML
// Each record row: License Type | Name (link) | Name Type (DBA/Primary) | License#<br>Rank | Status<br>Date
const linkPattern = /<a\s+href="LicenseDetail\.asp[^"]*">\s*([^<]+?)\s*<\/a>/gi;
let match;
const links = [];
while ((match = linkPattern.exec(html)) !== null) {
  // Look for name type (DBA/Primary) after the link
  const after = html.substring(match.index + match[0].length, match.index + match[0].length + 500);
  const typeMatch = after.match(/>(\s*(?:DBA|Primary)\s*)</i);
  const nameType = typeMatch ? typeMatch[1].trim() : 'unknown';

  // Look for license number
  const licMatch = after.match(/\b(C[A-Z]{1,2}\d{5,7}|R[A-Z]\d{5,7}|P[A-Z]\d{5,7})\b/);
  const licNum = licMatch ? licMatch[1] : 'NOT_FOUND';

  links.push({ name: match[1].trim(), nameType, licNum });
}

console.log('\nAll ' + links.length + ' link entries:');
links.forEach(function(e, i) {
  console.log('  ' + (i+1) + '. [' + e.nameType + '] ' + e.name + ' -> ' + e.licNum);
});

// Check for entries where license number was NOT found
const notFound = links.filter(function(e) { return e.licNum === 'NOT_FOUND'; });
console.log('\nRecords with NO license number found: ' + notFound.length);
notFound.forEach(function(e, i) {
  console.log('  ' + (i+1) + '. [' + e.nameType + '] ' + e.name);
});
