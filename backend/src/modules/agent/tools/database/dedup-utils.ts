/**
 * @fileoverview Deduplication utilities for Agent X database write tools
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Centralised normalization functions used by write tools to prevent
 * duplicate records in top-level collections (Recruiting, Events, Posts,
 * RosterEntries). Each function is deterministic and side-effect-free.
 */

// ─── College / Organization Name Normalization ─────────────────────────────

/**
 * Common prefixes and suffixes scraped from school/college names that should
 * be stripped for fuzzy dedup. Order matters — longer patterns first.
 */
const COLLEGE_STRIP_PATTERNS = [
  /^the\s+/i,
  /\s+university$/i,
  /\s+college$/i,
  /\s+state\s+university$/i,
  /\s+community\s+college$/i,
  /\s+technical\s+college$/i,
  /\s+institute\s+of\s+technology$/i,
  /\buniversity\s+of\s+/i,
];

/**
 * Normalize a college/organization/school name for dedup key comparison.
 *
 * Strips common prefixes ("The ", "University of"), suffixes ("University",
 * "College"), collapses whitespace, removes punctuation, and lowercases.
 *
 * @example
 * normalizeCollegeName("The Ohio State University") → "ohio state"
 * normalizeCollegeName("University of Alabama")     → "alabama"
 * normalizeCollegeName("Ohio State")                → "ohio state"
 * normalizeCollegeName("St. Mary's College")        → "saint marys"
 */
export function normalizeCollegeName(name: string): string {
  let n = name.trim().toLowerCase();

  // Replace common abbreviations
  n = n.replace(/\bst\.\s*/g, 'saint ');
  n = n.replace(/\bmt\.\s*/g, 'mount ');

  // Strip known patterns
  for (const pattern of COLLEGE_STRIP_PATTERNS) {
    n = n.replace(pattern, '');
  }

  // Remove all punctuation (apostrophes, hyphens, periods, etc.)
  n = n.replace(/[^\w\s]/g, '');

  // Collapse whitespace
  n = n.replace(/\s+/g, ' ').trim();

  return n || 'unknown';
}

// ─── Opponent / Team Name Normalization ─────────────────────────────────────

/**
 * Normalize an opponent/team name for schedule event dedup.
 *
 * Strips JV/Varsity tags, normalizes abbreviations, removes punctuation.
 *
 * @example
 * normalizeOpponentName("St. Mary's JV")  → "saint marys"
 * normalizeOpponentName("Liberty (Home)") → "liberty"
 */
export function normalizeOpponentName(name: string): string {
  let n = name.trim().toLowerCase();

  // Strip team-level qualifiers
  n = n.replace(/\b(varsity|junior\s+varsity|jv|freshman|frosh|fr\.?)\b/gi, '');

  // Strip parenthetical notes like (Home), (Away)
  n = n.replace(/\([^)]*\)/g, '');

  // Replace common abbreviations
  n = n.replace(/\bst\.\s*/g, 'saint ');
  n = n.replace(/\bmt\.\s*/g, 'mount ');

  // Remove all punctuation
  n = n.replace(/[^\w\s]/g, '');

  // Collapse whitespace
  n = n.replace(/\s+/g, ' ').trim();

  return n || 'unknown';
}

// ─── Video URL Normalization ────────────────────────────────────────────────

/**
 * Tracking / analytics query params that don't identify the resource.
 * These are stripped before dedup comparison.
 */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'ref',
  'source',
  'si', // YouTube shares
  'feature', // YouTube
  'ab_channel', // YouTube
]);

/**
 * Extracts a canonical YouTube video ID from various URL formats.
 * Returns null if the URL is not a recognizable YouTube URL.
 */
function extractYouTubeId(url: string): string | null {
  // youtube.com/watch?v=ID
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // youtu.be/ID or youtube.com/embed/ID or youtube.com/shorts/ID
  const pathMatch = url.match(
    /(?:youtu\.be|youtube\.com\/(?:embed|shorts|v))\/([a-zA-Z0-9_-]{11})/
  );
  if (pathMatch) return pathMatch[1];

  return null;
}

/**
 * Extracts a canonical Hudl highlight ID from its URL.
 * Returns null if not a recognizable Hudl URL.
 */
function extractHudlId(url: string): string | null {
  // hudl.com/video/3/{highlightId} or hudl.com/v/{id}
  const match = url.match(/hudl\.com\/(?:video\/\d+|v)\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Normalize a video URL for dedup comparison.
 *
 * - Strips protocol (http/https) and www prefix
 * - Removes tracking query parameters (utm_*, fbclid, etc.)
 * - For YouTube URLs: extracts the canonical 11-char video ID
 * - For Hudl URLs: extracts the highlight ID
 * - Strips trailing slashes
 * - Lowercases everything
 *
 * @example
 * normalizeVideoUrl("https://www.youtube.com/watch?v=abc123def45&utm_source=fb")
 *   → "youtube::abc123def45"
 * normalizeVideoUrl("https://youtu.be/abc123def45?si=share")
 *   → "youtube::abc123def45"
 * normalizeVideoUrl("https://www.hudl.com/video/3/abc123/highlights")
 *   → "hudl::abc123"
 * normalizeVideoUrl("https://vimeo.com/123456789")
 *   → "vimeo.com/123456789"
 */
export function normalizeVideoUrl(src: string): string {
  const s = src.trim();
  if (!s) return '';

  // Try platform-specific canonical forms first (most reliable)
  const ytId = extractYouTubeId(s);
  if (ytId) return `youtube::${ytId.toLowerCase()}`;

  const hudlId = extractHudlId(s);
  if (hudlId) return `hudl::${hudlId.toLowerCase()}`;

  // Generic normalization for all other URLs
  let normalized = s.toLowerCase();

  // Strip protocol
  normalized = normalized.replace(/^https?:\/\//, '');

  // Strip www.
  normalized = normalized.replace(/^www\./, '');

  // Strip tracking params from query string
  try {
    // Rebuild as URL to safely parse query params
    const url = new URL(`https://${normalized}`);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key)) {
        url.searchParams.delete(key);
      }
    }
    // Reconstruct without protocol
    const search = url.search || '';
    const hash = url.hash || '';
    normalized = `${url.hostname}${url.pathname}${search}${hash}`;
  } catch {
    // If URL parsing fails, just use the raw lowercased string
  }

  // Strip trailing slash
  normalized = normalized.replace(/\/+$/, '');

  return normalized;
}

// ─── Person Name Normalization (Roster) ─────────────────────────────────────

/**
 * Build a dedup key for a roster member.
 *
 * Uses name + classOf + jerseyNumber when available to reduce false
 * positives (two "John Smith" athletes on the same team with different
 * graduation years are treated as different people).
 *
 * @example
 * rosterDedupeKey("John", "Smith", 2026, "12")  → "john|smith|2026|12"
 * rosterDedupeKey("John", "Smith", null, null)   → "john|smith"
 */
export function rosterDedupeKey(
  firstName: string,
  lastName: string,
  classOf: number | null | undefined,
  jerseyNumber: string | null | undefined
): string {
  const fn = firstName.toLowerCase().trim();
  const ln = lastName.toLowerCase().trim();

  let key = `${fn}|${ln}`;
  if (classOf) key += `|${classOf}`;
  if (jerseyNumber) key += `|${jerseyNumber.trim()}`;

  return key;
}
