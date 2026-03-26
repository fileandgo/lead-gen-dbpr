export function normalizeBusinessName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\b(LLC|INC|CORP|CO|LTD|LP|LLP|DBA|THE)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAddress(address: string): string {
  return address
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bLANE\b/g, 'LN')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bCOURT\b/g, 'CT')
    .replace(/\bCIRCLE\b/g, 'CIR')
    .replace(/\bPLACE\b/g, 'PL')
    .replace(/\bSUITE\b/g, 'STE')
    .replace(/\bAPARTMENT\b/g, 'APT')
    .replace(/\s+/g, ' ')
    .trim();
}
