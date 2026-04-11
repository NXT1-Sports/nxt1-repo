/**
 * @fileoverview Organization Specialist Sub-Agent
 * @module @nxt1/backend/modules/agent/agents/sub-agents
 *
 * Lightweight extraction class invoked by the Boss (DataCoordinator).
 * Receives scraped Markdown, calls the `extraction` tier LLM (claude-haiku-4-5)
 * with a focused system prompt, and validates the JSON response against
 * OrgExtractionSchema (Zod).
 *
 * Produces a deterministic org key via buildOrgKey() to prevent race-condition
 * duplicate organizations in Firestore.
 */

import type { OpenRouterService } from '../../llm/openrouter.service.js';
import type { LLMMessage, LLMCompletionOptions } from '../../llm/llm.types.js';
import { OrgExtractionSchema, type OrgExtraction, buildOrgKey } from '../../schemas/index.js';
import { logger } from '../../../../utils/logger.js';

/** Max chars sent to the LLM (~30k chars ≈ ~8k tokens for Haiku). */
const MAX_CONTENT_LENGTH = 30_000;

// ─── System Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an elite sports organization data extraction specialist.

Your ONLY job: Extract school/club/program information from scraped profile content.

EXTRACT ONLY (return empty/omit fields you can't find — NEVER fabricate):
- organizationName: Official name (e.g. "Allen High School", "Houston Rockets AAU")
- programType: One of: high-school, college, club, travel, aau, prep, academy, juco, naia, unknown
- location: { city: string, state: "TX" (2-char uppercase) }
- branding:
  - mascot: e.g. "Eagles"
  - logoUrl: Direct URL to the logo image (if found)
  - primaryColor: 6-digit hex (e.g. "#1A2B3C") — extract from page styling or branding
  - secondaryColor: 6-digit hex
- website: Organization website URL
- team: { teamName, teamType (varsity/jv/freshman/club/travel/aau/academy), conference?, division? }

CRITICAL RULES:
1. NEVER fabricate colors. Only extract hex codes that are explicitly visible on the page or in metadata.
2. State MUST be a 2-character uppercase abbreviation (e.g. "TX", not "Texas").
3. programType must be one of the exact enum values listed above.
4. Return valid JSON only. No markdown, no explanations, no wrapping.
5. If the content has NO organization data, return an empty object: {}`;

// ─── Sub-Agent Class ────────────────────────────────────────────────────────

export class OrgSpecialist {
  constructor(private readonly llm: OpenRouterService) {}

  /**
   * Extract organization data from scraped Markdown content.
   *
   * @param content  - Distilled Markdown from Firecrawl scrape
   * @param context  - Metadata for telemetry
   * @returns Object with validated OrgExtraction + deterministic orgKey, or null
   * @throws On LLM failure or Zod validation failure
   */
  async extract(
    content: string,
    context: {
      userId: string;
      threadId?: string;
      sourceUrl?: string;
    }
  ): Promise<{ data: OrgExtraction; orgKey: string } | null> {
    const messages: LLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Extract all organization/school/club data from this scraped profile content.\n\n---\n\n${content}`,
      },
    ];

    const options: LLMCompletionOptions = {
      tier: 'extraction',
      maxTokens: 2048,
      temperature: 0,
      jsonMode: true,
      telemetryContext: {
        operationId: context.threadId ?? `org-extract-${Date.now()}`,
        userId: context.userId,
        agentId: 'data_coordinator',
        feature: 'onboarding-scrape',
      },
    };

    // Truncate oversized content to prevent context-window overflow
    if (content.length > MAX_CONTENT_LENGTH) {
      logger.warn('[OrgSpecialist] Truncating oversized content', {
        userId: context.userId,
        originalLength: content.length,
        truncatedTo: MAX_CONTENT_LENGTH,
      });
      content = content.slice(0, MAX_CONTENT_LENGTH);
    }

    logger.info('[OrgSpecialist] Extracting organization data', {
      userId: context.userId,
      sourceUrl: context.sourceUrl,
      contentLength: content.length,
    });

    const result = await this.llm.complete(messages, options);

    if (!result.content) {
      logger.warn('[OrgSpecialist] LLM returned empty content', {
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
      logger.error('[OrgSpecialist] LLM returned invalid JSON', {
        userId: context.userId,
        content: result.content.slice(0, 500),
      });
      throw new Error('OrgSpecialist: LLM returned invalid JSON');
    }

    // Empty object = no data found
    if (typeof raw === 'object' && raw !== null && Object.keys(raw).length === 0) {
      logger.info('[OrgSpecialist] No organization data found in content', {
        userId: context.userId,
      });
      return null;
    }

    // Validate with Zod
    const parsed = OrgExtractionSchema.safeParse(raw);

    if (!parsed.success) {
      logger.error('[OrgSpecialist] Zod validation failed', {
        userId: context.userId,
        errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        rawKeys: typeof raw === 'object' && raw !== null ? Object.keys(raw) : [],
      });
      throw new Error(
        `OrgSpecialist: Schema validation failed — ${parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`
      );
    }

    // Build deterministic org key for deduplication
    const orgKey = buildOrgKey(parsed.data.organizationName, parsed.data.location?.state);

    logger.info('[OrgSpecialist] Extraction succeeded', {
      userId: context.userId,
      orgName: parsed.data.organizationName,
      orgKey,
      programType: parsed.data.programType,
      hasLocation: !!parsed.data.location,
      hasBranding: !!parsed.data.branding,
      model: result.model,
      tokens: result.usage?.totalTokens ?? 0,
    });

    return { data: parsed.data, orgKey };
  }
}
