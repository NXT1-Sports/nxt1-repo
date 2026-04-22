/**
 * @fileoverview Search Index Utility
 * @module @nxt1/backend/utils/search-index
 *
 * Utility for building and managing search indexes for Firestore documents.
 * Generates lowercase token arrays for efficient array-contains queries.
 */

/**
 * Normalize text for search indexing
 * - Convert to lowercase
 * - Remove special characters
 * - Trim whitespace
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .trim();
}

/**
 * Generate tokens from text
 * Creates both individual words and phrases
 */
function generateTokens(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const words = normalized.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];

  // Add individual words
  tokens.push(...words);

  // Add 2-word phrases
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]} ${words[i + 1]}`);
  }

  // Add 3-word phrases (if applicable)
  if (words.length >= 3) {
    for (let i = 0; i < words.length - 2; i++) {
      tokens.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
  }

  // Add full phrase if more than 1 word
  if (words.length > 1) {
    tokens.push(words.join(' '));
  }

  return tokens;
}

/**
 * Build search index from multiple text fields
 *
 * @param fields - Array of text strings to include in search index
 * @returns Array of lowercase search tokens for Firestore array-contains queries
 *
 * @example
 * ```typescript
 * const searchIndex = buildSearchIndex([
 *   user.displayName,
 *   user.sport,
 *   user.position,
 *   user.location,
 * ]);
 * // Returns: ["john", "smith", "john smith", "basketball", ...]
 * ```
 */
export function buildSearchIndex(fields: (string | undefined | null)[]): string[] {
  const allTokens = new Set<string>();

  for (const field of fields) {
    if (!field || typeof field !== 'string') continue;

    const tokens = generateTokens(field);
    tokens.forEach((token) => allTokens.add(token));
  }

  // Convert to array and sort for consistency
  return Array.from(allTokens).sort();
}

/**
 * Build search index for a video
 */
export function buildVideoSearchIndex(data: {
  title?: string;
  description?: string;
  sport?: string;
  creatorName?: string;
  tags?: string[];
}): string[] {
  const fields = [data.title, data.description, data.sport, data.creatorName, ...(data.tags || [])];

  return buildSearchIndex(fields);
}
