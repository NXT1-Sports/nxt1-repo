/**
 * @fileoverview Athlete Specialist Sub-Agent
 * @module @nxt1/backend/modules/agent/agents/sub-agents
 *
 * Lightweight extraction class invoked by the Boss (DataCoordinator).
 * Receives scraped Markdown, calls the `extraction` tier LLM (claude-haiku-4-5)
 * with a focused system prompt, and validates the JSON response against
 * AthleteExtractionSchema (Zod).
 *
 * This class is NOT a BaseAgent subclass — it doesn't enter a ReAct loop.
 * It makes a single-shot LLM call and returns validated data or throws.
 */

import type { OpenRouterService } from '../../llm/openrouter.service.js';
import type { LLMMessage, LLMCompletionOptions } from '../../llm/llm.types.js';
import { AthleteExtractionSchema, type AthleteExtraction } from '../../schemas/index.js';
import { logger } from '../../../../utils/logger.js';

/** Max chars sent to the LLM (~30k chars ≈ ~8k tokens for Haiku). */
const MAX_CONTENT_LENGTH = 30_000;

// ─── System Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an elite sports data extraction specialist.

Your ONLY job: Extract athletic performance data from scraped profile content.

EXTRACT ONLY (return empty/omit fields you can't find — NEVER fabricate):
- classOf: Graduation year (4-digit integer, e.g. 2026)
- physical: { heightInches, weightLbs } — convert "6'2" → 74, "185 lbs" → 185
- sportInfo: { positions (abbreviated, e.g. ["QB", "S"]), jerseyNumber, side }
- metrics: Array of combine/measurable metrics (40-yard dash, vertical, bench press, etc.)
  Each: { field: snake_case, label: "Human Label", value: number, unit?: string }
- seasons: Array of per-season stat lines  
  Each season: { season: "2024-2025", category?: "Passing", games: [...], totals: [...] }
  Each stat: { field: snake_case, label: "Human Label", value: number|string }
- awards: Array of { title, year?, organization? }

CRITICAL RULES:
1. NEVER fabricate stats. If the page says "Touchdowns: 12", use 12. If it doesn't mention TDs, omit.
2. Convert all heights to INCHES (5'11" = 71). Convert weights to LBS.
3. Metric fields MUST be snake_case (e.g. "forty_yard_dash", not "40-Yard Dash").
4. Return valid JSON only. No markdown, no explanations, no wrapping.
5. If the content has NO athletic data, return an empty object: {}`;

// ─── Sub-Agent Class ────────────────────────────────────────────────────────

export class AthleteSpecialist {
  constructor(private readonly llm: OpenRouterService) {}

  /**
   * Extract athlete performance data from scraped Markdown content.
   *
   * @param content  - Distilled Markdown from Firecrawl scrape
   * @param context  - Metadata for telemetry (userId, threadId, sport)
   * @returns Validated AthleteExtraction or null if no data found
   * @throws On LLM failure or Zod validation failure
   */
  async extract(
    content: string,
    context: {
      userId: string;
      threadId?: string;
      sport?: string;
      sourceUrl?: string;
    }
  ): Promise<AthleteExtraction | null> {
    const sportHint = context.sport
      ? `\nThe athlete plays ${context.sport}. Use sport-specific stat names and position abbreviations.`
      : '';

    const messages: LLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Extract all athletic data from this scraped profile content.${sportHint}\n\n---\n\n${content}`,
      },
    ];

    const options: LLMCompletionOptions = {
      tier: 'extraction',
      maxTokens: 4096,
      temperature: 0,
      jsonMode: true,
      telemetryContext: {
        operationId: context.threadId ?? `athlete-extract-${Date.now()}`,
        userId: context.userId,
        agentId: 'data_coordinator',
        feature: 'onboarding-scrape',
      },
    };

    // Truncate oversized content to prevent context-window overflow
    if (content.length > MAX_CONTENT_LENGTH) {
      logger.warn('[AthleteSpecialist] Truncating oversized content', {
        userId: context.userId,
        originalLength: content.length,
        truncatedTo: MAX_CONTENT_LENGTH,
      });
      content = content.slice(0, MAX_CONTENT_LENGTH);
    }

    logger.info('[AthleteSpecialist] Extracting athlete data', {
      userId: context.userId,
      sport: context.sport,
      sourceUrl: context.sourceUrl,
      contentLength: content.length,
    });

    const result = await this.llm.complete(messages, options);

    if (!result.content) {
      logger.warn('[AthleteSpecialist] LLM returned empty content', {
        userId: context.userId,
        model: result.model,
      });
      return null;
    }

    // Parse JSON from LLM response
    let raw: unknown;
    try {
      raw = JSON.parse(result.content);
    } catch {
      logger.error('[AthleteSpecialist] LLM returned invalid JSON', {
        userId: context.userId,
        content: result.content.slice(0, 500),
      });
      throw new Error('AthleteSpecialist: LLM returned invalid JSON');
    }

    // Empty object = no data found
    if (typeof raw === 'object' && raw !== null && Object.keys(raw).length === 0) {
      logger.info('[AthleteSpecialist] No athlete data found in content', {
        userId: context.userId,
      });
      return null;
    }

    // Validate with Zod
    const parsed = AthleteExtractionSchema.safeParse(raw);

    if (!parsed.success) {
      logger.error('[AthleteSpecialist] Zod validation failed', {
        userId: context.userId,
        errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        rawKeys: typeof raw === 'object' && raw !== null ? Object.keys(raw) : [],
      });
      throw new Error(
        `AthleteSpecialist: Schema validation failed — ${parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`
      );
    }

    logger.info('[AthleteSpecialist] Extraction succeeded', {
      userId: context.userId,
      hasClassOf: !!parsed.data.classOf,
      hasPhysical: !!parsed.data.physical,
      metricCount: parsed.data.metrics.length,
      seasonCount: parsed.data.seasons.length,
      awardCount: parsed.data.awards.length,
      model: result.model,
      tokens: result.usage?.totalTokens ?? 0,
    });

    return parsed.data;
  }
}
