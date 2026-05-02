/**
 * @fileoverview Platform slug → display name mapping for verification attribution.
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Maps Agent X source slugs (e.g. "maxpreps", "247sports") to their
 * human-readable display names for DataVerification entries.
 * Aligned with PLATFORM_REGISTRY in @nxt1/core/onboarding.
 */

// ─── Platform Display Name Map ──────────────────────────────────────────────

/**
 * Canonical mapping of platform slugs to display names.
 * Maintained in sync with PLATFORM_REGISTRY.label values in @nxt1/core.
 */
const PLATFORM_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  // Stats / Recruiting
  maxpreps: 'MaxPreps',
  '247sports': '247Sports',
  rivals: 'Rivals',
  on3: 'On3',
  perfectgame: 'Perfect Game',
  prepbaseballreport: 'Prep Baseball Report',
  gamechanger: 'GameChanger',

  // Film
  hudl: 'Hudl',
  krossover: 'Krossover',
  veo: 'Veo',
  ballertv: 'BallerTV',
  nfhsnetwork: 'NFHS Network',

  // Recruiting services
  ncsa: 'NCSA',
  fieldlevel: 'FieldLevel',
  captainu: 'CaptainU',
  sportsrecruits: 'SportsRecruits',
  streamlineathletes: 'Streamline Athletes',
  recruitlook: 'RecruitLook',
  connectlax: 'ConnectLAX',
  berecruited: 'BeRecruited',

  // Social
  instagram: 'Instagram',
  twitter: 'X',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',

  // Other
  collegeathtrack: 'College Ath Track',
  imlcarecruits: 'IMLCA Recruits',
  sportsengineplay: 'SportsEngine Play',
  vimeo: 'Vimeo',
};

/**
 * Resolves a platform slug to its human-readable display name.
 *
 * Falls back to title-casing the slug if not found in the known registry.
 *
 * @example
 * platformDisplayName('maxpreps')  → 'MaxPreps'
 * platformDisplayName('247sports') → '247Sports'
 * platformDisplayName('newsite')   → 'Newsite'
 */
export function platformDisplayName(slug: string): string {
  const normalized = slug.toLowerCase().trim();
  return PLATFORM_DISPLAY_NAMES[normalized] ?? titleCase(normalized);
}

/** Simple title-case fallback: "someplatform" → "Someplatform" */
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
