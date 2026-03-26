import { OWNER_TITLES, ADMIN_TITLES, EXCLUDED_TITLES, RANK_WEIGHTS } from '../constants';
import type { EnrichmentConfig } from '@/types';

export interface RankedContact {
  preview: Record<string, unknown>;
  rankScore: number;
  rankReasons: string[];
  titleBucket: 'owner' | 'admin' | 'other' | 'excluded';
}

export function rankContacts(
  previews: Record<string, unknown>[],
  config: EnrichmentConfig
): RankedContact[] {
  const ranked = previews.map((preview) => scoreContact(preview));

  let filtered = ranked;

  // Filter out excluded titles if configured
  if (config.skipExcludedTitles) {
    filtered = filtered.filter((r) => r.titleBucket !== 'excluded');
  }

  // Filter by title mode
  if (config.titleMode === 'owner') {
    const owners = filtered.filter((r) => r.titleBucket === 'owner');
    filtered = owners.length > 0 ? owners : filtered;
  } else if (config.titleMode === 'admin') {
    const admins = filtered.filter((r) => r.titleBucket === 'admin');
    filtered = admins.length > 0 ? admins : filtered;
  }

  // Filter by email requirement
  if (config.requireEmail) {
    const withEmail = filtered.filter((r) => r.preview.has_email === true);
    filtered = withEmail.length > 0 ? withEmail : filtered;
  }

  // Filter by verified email if configured
  if (config.verifiedEmailOnly) {
    const verified = filtered.filter((r) => {
      const status = r.preview.email_status as string | undefined;
      return status === 'verified' || status === 'valid';
    });
    // Only apply filter if we'd still have results; fall back to email-having contacts
    if (verified.length > 0) {
      filtered = verified;
    }
  }

  // Sort by score desc and limit
  filtered.sort((a, b) => b.rankScore - a.rankScore);
  return filtered.slice(0, config.maxContacts);
}

function scoreContact(preview: Record<string, unknown>): RankedContact {
  let score = 0;
  const reasons: string[] = [];
  const title = ((preview.title as string) || '').toLowerCase();

  let titleBucket: RankedContact['titleBucket'] = 'other';

  if (EXCLUDED_TITLES.some((t) => title.includes(t.toLowerCase()))) {
    titleBucket = 'excluded';
    reasons.push('excluded_title');
  } else if (OWNER_TITLES.some((t) => title.includes(t.toLowerCase()))) {
    titleBucket = 'owner';
    score += RANK_WEIGHTS.TITLE_OWNER;
    reasons.push('owner_title');
  } else if (ADMIN_TITLES.some((t) => title.includes(t.toLowerCase()))) {
    titleBucket = 'admin';
    score += RANK_WEIGHTS.TITLE_ADMIN;
    reasons.push('admin_title');
  } else {
    score += RANK_WEIGHTS.TITLE_OTHER;
  }

  if (preview.has_email === true) {
    score += RANK_WEIGHTS.HAS_EMAIL;
    reasons.push('has_email');
  }

  const emailStatus = preview.email_status as string | undefined;
  if (emailStatus === 'verified' || emailStatus === 'valid') {
    score += RANK_WEIGHTS.VERIFIED_EMAIL;
    reasons.push('verified_email');
  }

  if (preview.has_direct_phone === 'Yes') {
    score += RANK_WEIGHTS.HAS_PHONE;
    reasons.push('has_phone');
  }

  return { preview, rankScore: score, rankReasons: reasons, titleBucket };
}
