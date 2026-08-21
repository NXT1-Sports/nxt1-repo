export type CanonicalReferralSource =
  | 'club'
  | 'social'
  | 'search'
  | 'friend'
  | 'advertisement'
  | 'team-code'
  | 'other';

const SOURCE_SYNONYM_MAP: Readonly<Record<string, CanonicalReferralSource>> = {
  club: 'club',
  'club or team': 'club',
  social: 'social',
  'social media': 'social',
  search: 'search',
  'search engine': 'search',
  friend: 'friend',
  'friend or teammate': 'friend',
  advertisement: 'advertisement',
  advertising: 'advertisement',
  ad: 'advertisement',
  'paid ad': 'advertisement',
  'team-code': 'team-code',
  'team code': 'team-code',
  'team invite code': 'team-code',
  other: 'other',
};

function compactText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeToken(rawValue: string): string {
  return rawValue
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
}

export function normalizeReferralSource(rawSource: unknown): CanonicalReferralSource | null {
  const compact = compactText(rawSource);
  if (!compact) return null;
  return SOURCE_SYNONYM_MAP[normalizeToken(compact)] ?? 'other';
}

export function normalizeReferralDetail(rawValue: unknown, maxLength = 120): string | null {
  const compact = compactText(rawValue);
  if (!compact) return null;

  const normalized = compact.replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) return normalized;

  return `${normalized.slice(0, maxLength - 1)}…`;
}
