/**
 * @fileoverview Name Normalizer Service
 * @module @nxt1/backend/services/name-normalizer
 *
 * Uses OpenRouter LLM (fast tier) to normalize organization/program names.
 * Examples: "Katy HS" → "Katy", "st marys basketball" → "St. Mary's"
 *
 * Features:
 * - Redis caching of normalized names (24h TTL) to avoid repeated LLM calls
 * - Graceful fallback to raw input on LLM failure
 * - Dynamic import of OpenRouterService (no startup cost)
 *
 * @version 1.0.0
 */

import { getCacheService, CACHE_TTL } from './cache.service.js';
import { logger } from '../utils/logger.js';

// ============================================
// CACHE KEYS
// ============================================

const CACHE_PREFIX = 'name-norm:';
const CACHE_TTL_SECONDS = CACHE_TTL.COLLEGES; // 24h — normalizations are stable

// ============================================
// LLM PROMPT
// ============================================

const SYSTEM_PROMPT = `You are a data normalization assistant for US sports program names.

Your ONLY job is to normalize the given program name into a clean, proper organization name.

Rules:
- Return ONLY the base organization/program name.
- Do NOT include sport names (e.g. "Football", "Basketball").
- Do NOT include program type suffixes (e.g. "High School", "HS", "Middle School", "Club", "College", "University", "JUCO").
- Fix capitalization: "katy high school" → "Katy"
- Add punctuation: "st marys" → "St. Mary's"
- Expand abbreviations: "HS" → "High School", "MS" → "Middle School", "CC" → "Community College"
- Remove trailing sport names: "Harvey High School Football" → "Harvey"
- Keep location qualifiers only when they are part of the name.
- Do NOT invent or add information not in the input
- Do NOT add "Academy", "Prep", etc. unless the input suggests it
- If the input is already properly formatted, return it unchanged

Examples:
- "Harvey HS Football" → "Harvey"
- "st marys basketball" → "St. Mary's"
- "katy high school" → "Katy"
- "Lincoln Prep" → "Lincoln Prep"
- "westlake hs" → "Westlake"

Respond with ONLY the normalized name. No explanation, no quotes, no extra text.`;

const TRAILING_SPORT_PATTERN =
  /\s+(football|basketball|baseball|softball|soccer|volleyball|lacrosse|wrestling|track|cross\s*country|swim(?:ming)?|tennis|golf|hockey)\s*$/i;

const TRAILING_PROGRAM_TYPE_PATTERNS: readonly RegExp[] = [
  /\s+high\s+school\s*$/i,
  /\s+hs\s*$/i,
  /\s+middle\s+school\s*$/i,
  /\s+ms\s*$/i,
  /\s+junior\s+college\s*$/i,
  /\s+juco\s*$/i,
  /\s+community\s+college\s*$/i,
  /\s+college\s*$/i,
  /\s+university\s*$/i,
  /\s+club\s*$/i,
  /\s+travel\s*$/i,
];

function stripProgramSuffixes(rawName: string): string {
  let normalized = rawName.trim().replace(/\s+/g, ' ');

  normalized = normalized.replace(TRAILING_SPORT_PATTERN, '').trim();

  for (const pattern of TRAILING_PROGRAM_TYPE_PATTERNS) {
    normalized = normalized.replace(pattern, '').trim();
  }

  return normalized;
}

// ============================================
// SERVICE
// ============================================

/**
 * Normalize a program/organization name using LLM.
 * Cached in Redis for 24h. Falls back to raw input on any error.
 */
export async function normalizeProgramName(rawName: string): Promise<string> {
  const trimmed = rawName.trim();
  if (!trimmed) return trimmed;

  const preNormalized = stripProgramSuffixes(trimmed) || trimmed;

  // Check cache first
  const cacheKey = `${CACHE_PREFIX}${preNormalized.toLowerCase()}`;
  const cache = getCacheService();

  try {
    const cached = await cache?.get<string>(cacheKey);
    if (cached) {
      logger.debug('[NameNormalizer] Cache hit', { raw: trimmed, normalized: cached });
      return cached;
    }
  } catch {
    // Cache miss or error — proceed to LLM
  }

  // Call LLM
  try {
    const { OpenRouterService } = await import('../modules/agent/llm/openrouter.service.js');
    const llm = new OpenRouterService();

    const result = await llm.prompt(SYSTEM_PROMPT, preNormalized, {
      tier: 'extraction',
      maxTokens: 100,
      temperature: 0,
    });

    const llmNormalized = result.content?.trim() || preNormalized;
    const normalized = stripProgramSuffixes(llmNormalized) || preNormalized;

    // Sanity check: LLM response should be a reasonable name, not a paragraph
    if (normalized.length > 200 || normalized.includes('\n')) {
      logger.warn('[NameNormalizer] LLM returned unexpected format, using raw input', {
        raw: trimmed,
        response: normalized.substring(0, 100),
      });
      return preNormalized;
    }

    logger.info('[NameNormalizer] Normalized', { raw: trimmed, normalized });

    // Cache the result
    try {
      await cache?.set(cacheKey, normalized, { ttl: CACHE_TTL_SECONDS });
    } catch {
      // Non-critical — name still returns correctly
    }

    return normalized;
  } catch (err) {
    logger.error('[NameNormalizer] LLM call failed, using pre-normalized input', {
      raw: trimmed,
      preNormalized,
      error: err,
    });
    return preNormalized;
  }
}
