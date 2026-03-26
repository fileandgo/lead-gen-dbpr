const fs = require('fs');
const html = fs.readFileSync('diag-page2.html', 'utf8');

const linkPattern = /<a\s+href="LicenseDetail\.asp[^"]*">\s*([^<]+?)\s*<\/a>/gi;
let match;
const links = [];
while ((match = linkPattern.exec(html)) !== null) {
  const after = html.substring(match.index + match[0].length, match.index + match[0].length + 1500);
  const licMatch = after.match(/\b(C[A-Z]{1,2}\d{5,7}|R[A-Z]\d{5,7}|P[A-Z]\d{5,7})\b/);
  const licNum = licMatch ? licMatch[1] : 'NOT_FOUND';

  // If NOT_FOUND, show what text IS after the link
  let debugText = '';
  if (!licMatch) {
    // Extract the next ~200 chars of visible text
    const textOnly = after.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    debugText = textOnly.substring(0, 200);
  }

  links.push({ name: match[1].trim(), licNum, debugText });
}

console.log('Total links on page 2:', links.length);
const notFound = links.filter(function(e) { return e.licNum === 'NOT_FOUND'; });
console.log('Records with NO license number found:', notFound.length);
notFound.forEach(function(e, i) {
  console.log('  ' + (i+1) + '. Name: "' + e.name + '"');
  console.log('     After text: "' + e.debugText + '"');
});
