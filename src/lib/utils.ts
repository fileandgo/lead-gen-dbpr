import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import crypto from 'crypto';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

export function hashRecord(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex');
}

export function formatDate(date: Date | string | null): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getScoreBadgeColor(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-800';
  if (score >= 60) return 'bg-blue-100 text-blue-800';
  if (score >= 40) return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-800';
}

export function getStatusBadgeColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('current') && s.includes('active')) return 'bg-green-100 text-green-800';
  if (s.includes('current')) return 'bg-blue-100 text-blue-800';
  if (s.includes('null') || s.includes('void')) return 'bg-red-100 text-red-800';
  if (s.includes('application')) return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-800';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseAddressCity(fullAddress: string): { city: string; state: string; zip: string } {
  const match = fullAddress.match(/([A-Z\s]+),?\s*([A-Z]{2})\s*(\d{5}(-\d{4})?)\s*$/);
  if (match) {
    return { city: match[1].trim(), state: match[2], zip: match[3] };
  }
  return { city: '', state: '', zip: '' };
}
