import prisma from '../prisma';
import { GOOGLE_RESOLUTION_STATUS, GOOGLE_MATCH_THRESHOLDS } from '../constants';
import type { Business } from '@prisma/client';

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  website?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  url?: string;
  types?: string[];
}

interface TextSearchResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  business_status?: string;
}

/**
 * Extract a canonical domain from a URL string.
 * e.g. "https://www.acmeroofing.com/about" → "acmeroofing.com"
 */
function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname || null;
  } catch {
    return null;
  }
}

/**
 * Calculate confidence score (0-1) comparing Google result to our business data.
 */
function calculateConfidence(
  business: { displayBusinessName: string; city?: string | null; state?: string | null; county?: string | null },
  place: PlaceResult
): number {
  let score = 0;

  // Name similarity (0-0.5)
  const bizName = business.displayBusinessName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const placeName = place.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

  if (bizName === placeName) {
    score += 0.5;
  } else if (placeName.includes(bizName) || bizName.includes(placeName)) {
    score += 0.35;
  } else {
    // Check word overlap
    const bizWordsArr = bizName.split(/\s+/).filter(w => w.length > 2);
    const placeWords = new Set(placeName.split(/\s+/).filter(w => w.length > 2));
    const overlap = bizWordsArr.filter(w => placeWords.has(w)).length;
    const maxWords = Math.max(bizWordsArr.length, placeWords.size);
    if (maxWords > 0) {
      score += 0.5 * (overlap / maxWords);
    }
  }

  // Address/city match (0-0.3)
  const addr = (place.formatted_address || '').toLowerCase();
  if (business.city && addr.includes(business.city.toLowerCase())) {
    score += 0.2;
  }
  if (business.state && addr.includes(business.state.toLowerCase())) {
    score += 0.05;
  }
  if (addr.includes('florida') || addr.includes(', fl')) {
    score += 0.05;
  }

  // Has website (0-0.2)
  if (place.website) {
    score += 0.2;
  }

  return Math.min(score, 1);
}

/**
 * Classify match status based on confidence score.
 */
function classifyMatch(confidence: number): string {
  if (confidence >= GOOGLE_MATCH_THRESHOLDS.MATCHED) return GOOGLE_RESOLUTION_STATUS.MATCHED;
  if (confidence >= GOOGLE_MATCH_THRESHOLDS.POSSIBLE) return GOOGLE_RESOLUTION_STATUS.POSSIBLE;
  return GOOGLE_RESOLUTION_STATUS.NO_MATCH;
}

/**
 * Build a search query from business data.
 */
function buildSearchQuery(business: Business): string {
  const parts = [business.displayBusinessName];
  if (business.city) parts.push(business.city);
  if (business.county) parts.push(`${business.county} County`);
  parts.push('Florida');
  return parts.join(', ');
}

/**
 * Search Google Places API (Text Search) for a business.
 */
async function textSearch(query: string): Promise<TextSearchResult[]> {
  const params = new URLSearchParams({
    query,
    type: 'establishment',
    key: GOOGLE_API_KEY!,
  });

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`
  );

  if (!res.ok) {
    throw new Error(`Google Places Text Search error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.status === 'REQUEST_DENIED') {
    throw new Error(`Google Places API denied: ${data.error_message || 'Check API key'}`);
  }

  if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
    return [];
  }

  return data.results.slice(0, 5).map((r: Record<string, unknown>) => ({
    place_id: r.place_id as string,
    name: r.name as string,
    formatted_address: r.formatted_address as string | undefined,
    business_status: r.business_status as string | undefined,
  }));
}

/**
 * Get full place details including website and phone.
 */
async function getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'place_id,name,formatted_address,website,formatted_phone_number,international_phone_number,url,types',
    key: GOOGLE_API_KEY!,
  });

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?${params}`
  );

  if (!res.ok) {
    console.warn(`[Google] Place details error: ${res.status}`);
    return null;
  }

  const data = await res.json();
  if (data.status !== 'OK' || !data.result) return null;

  const r = data.result;
  return {
    place_id: r.place_id,
    name: r.name,
    formatted_address: r.formatted_address,
    website: r.website,
    formatted_phone_number: r.formatted_phone_number,
    international_phone_number: r.international_phone_number,
    url: r.url,
    types: r.types,
  };
}

/**
 * Resolve a single business using Google Places API.
 * Returns the match status.
 */
export async function resolveBusinessGoogle(business: Business): Promise<string> {
  if (!GOOGLE_API_KEY) {
    console.warn('[Google] No API key configured. Skipping resolution.');
    return GOOGLE_RESOLUTION_STATUS.FAILED;
  }

  const query = buildSearchQuery(business);
  console.log(`[Google] Resolving: "${query}"`);

  try {
    // Step 1: Text search
    const results = await textSearch(query);

    if (results.length === 0) {
      console.log(`[Google] No results for "${business.displayBusinessName}"`);
      await prisma.googleResolution.upsert({
        where: { businessId: business.id },
        update: {
          matchStatus: GOOGLE_RESOLUTION_STATUS.NO_MATCH,
          searchQuery: query,
          confidence: 0,
          resolvedAt: new Date(),
          errorReason: null,
        },
        create: {
          businessId: business.id,
          matchStatus: GOOGLE_RESOLUTION_STATUS.NO_MATCH,
          searchQuery: query,
          confidence: 0,
        },
      });
      return GOOGLE_RESOLUTION_STATUS.NO_MATCH;
    }

    // Step 2: Get details for best candidate
    const topResult = results[0];
    const details = await getPlaceDetails(topResult.place_id);

    if (!details) {
      await prisma.googleResolution.upsert({
        where: { businessId: business.id },
        update: {
          matchStatus: GOOGLE_RESOLUTION_STATUS.NO_MATCH,
          searchQuery: query,
          confidence: 0,
          resolvedAt: new Date(),
          errorReason: 'Place details unavailable',
        },
        create: {
          businessId: business.id,
          matchStatus: GOOGLE_RESOLUTION_STATUS.NO_MATCH,
          searchQuery: query,
          confidence: 0,
          errorReason: 'Place details unavailable',
        },
      });
      return GOOGLE_RESOLUTION_STATUS.NO_MATCH;
    }

    // Step 3: Calculate confidence and classify
    const confidence = calculateConfidence(business, details);
    const matchStatus = classifyMatch(confidence);
    const domain = details.website ? extractDomain(details.website) : null;

    console.log(
      `[Google] ${business.displayBusinessName} → ${details.name} | ` +
      `confidence=${confidence.toFixed(2)} status=${matchStatus} domain=${domain || 'none'}`
    );

    // Step 4: Save result
    await prisma.googleResolution.upsert({
      where: { businessId: business.id },
      update: {
        resolvedName: details.name,
        resolvedDomain: domain,
        resolvedWebsite: details.website || null,
        resolvedPhone: details.international_phone_number || details.formatted_phone_number || null,
        resolvedAddress: details.formatted_address || null,
        googlePlaceId: details.place_id,
        matchStatus,
        confidence,
        searchQuery: query,
        resolvedAt: new Date(),
        errorReason: null,
      },
      create: {
        businessId: business.id,
        resolvedName: details.name,
        resolvedDomain: domain,
        resolvedWebsite: details.website || null,
        resolvedPhone: details.international_phone_number || details.formatted_phone_number || null,
        resolvedAddress: details.formatted_address || null,
        googlePlaceId: details.place_id,
        matchStatus,
        confidence,
        searchQuery: query,
      },
    });

    return matchStatus;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error during Google resolution';
    console.error(`[Google] Resolution failed for ${business.displayBusinessName}:`, error);

    await prisma.googleResolution.upsert({
      where: { businessId: business.id },
      update: {
        matchStatus: GOOGLE_RESOLUTION_STATUS.FAILED,
        searchQuery: query,
        errorReason: reason.substring(0, 500),
        resolvedAt: new Date(),
      },
      create: {
        businessId: business.id,
        matchStatus: GOOGLE_RESOLUTION_STATUS.FAILED,
        searchQuery: query,
        errorReason: reason.substring(0, 500),
      },
    });

    return GOOGLE_RESOLUTION_STATUS.FAILED;
  }
}

/**
 * Check if Google auto-resolution is enabled via AppSetting.
 * Defaults to true if no setting exists.
 */
export async function isGoogleAutoResolveEnabled(): Promise<boolean> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: 'google_auto_resolve_enabled' },
  });
  if (!setting) return true; // default enabled
  return setting.value === 'true';
}
