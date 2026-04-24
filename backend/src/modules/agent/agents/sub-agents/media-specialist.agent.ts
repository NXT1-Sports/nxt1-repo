/**
 * @fileoverview Media Specialist Sub-Agent
 * @module @nxt1/backend/modules/agent/agents/sub-agents
 *
 * Lightweight extraction class invoked by the Boss (DataCoordinator).
 * Receives scraped Markdown, calls the `extraction` tier LLM (claude-haiku-4-5)
 * with a focused system prompt, and validates the JSON response against
 * MediaExtractionSchema (Zod).
 *
 * Extracts video links, social profiles, connected sources, and image URLs.
 */

import type { OpenRouterService } from '../../llm/openrouter.service.js';
import type { LLMMessage, LLMCompletionOptions } from '../../llm/llm.types.js';
import { resolveStructuredOutput } from '../../llm/structured-output.js';
import { MediaExtractionSchema, type MediaExtraction } from '../../schemas/index.js';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';
import { logger } from '../../../../utils/logger.js';

/** Max chars sent to the LLM (~30k chars ≈ ~8k tokens for Haiku). */
const MAX_CONTENT_LENGTH = 30_000;

// ─── System Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an elite sports media extraction specialist.

Your ONLY job: Extract video links, social media profiles, and media assets from scraped profile content.

EXTRACT ONLY (return empty/omit fields you can't find — NEVER fabricate):
- videos: Array of video links found on the page
  Each: { url, platform (youtube/hudl/vimeo/maxpreps/other), title?, thumbnailUrl?, durationSeconds?, publishedAt?, isHighlight }
- socialProfiles: Array of social media profiles linked
  Each: { url, platform (twitter/instagram/tiktok/facebook/linkedin/snapchat/threads/other), handle?, followerCount?, verified? }
- connectedSources: Array of third-party sports platform profiles
  Each: { platform (e.g. "maxpreps", "247sports", "rivals", "prepbaseballreport"), profileUrl, displayName? }
- profileImageUrl: Direct URL to profile/headshot image (if found)
- bannerImageUrl: Direct URL to banner/cover image (if found)

CRITICAL RULES:
1. NEVER fabricate URLs. Only extract URLs that are explicitly present in the content.
2. Video platform detection: youtube.com/youtu.be → "youtube", hudl.com → "hudl", vimeo.com → "vimeo", maxpreps.com → "maxpreps".
3. Social handle extraction: Strip "@" prefix (e.g. "@john_smith" → "john_smith").
4. For connectedSources, only include legitimate sports recruiting/stats platforms.
5. Return valid JSON only. No markdown, no explanations, no wrapping.
6. If the content has NO media/social data, return an empty object: {}`;

// ─── Sub-Agent Class ────────────────────────────────────────────────────────

export class MediaSpecialist {
  constructor(private readonly llm: OpenRouterService) {}

  /**
   * Extract media links and social profiles from scraped Markdown content.
   *
   * @param content  - Distilled Markdown from Firecrawl scrape
   * @param context  - Metadata for telemetry
   * @returns Validated MediaExtraction or null if no data found
   * @throws On LLM failure or Zod validation failure
   */
  async extract(
    content: string,
    context: {
      userId: string;
      threadId?: string;
      sourceUrl?: string;
    }
  ): Promise<MediaExtraction | null> {
    const messages: LLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Extract all video links, social profiles, and media assets from this scraped profile content.\n\n---\n\n${content}`,
      },
    ];

    const options: LLMCompletionOptions = {
      tier: 'extraction',
      maxTokens: 2048,
      temperature: 0,
      outputSchema: {
        name: 'media_extraction',
        schema: MediaExtractionSchema,
      },
      telemetryContext: {
        operationId: context.threadId ?? `media-extract-${Date.now()}`,
        userId: context.userId,
        agentId: 'data_coordinator',
        feature: 'onboarding-scrape',
      },
    };

    // Truncate oversized content to prevent context-window overflow
    if (content.length > MAX_CONTENT_LENGTH) {
      logger.warn('[MediaSpecialist] Truncating oversized content', {
        userId: context.userId,
        originalLength: content.length,
        truncatedTo: MAX_CONTENT_LENGTH,
      });
      content = content.slice(0, MAX_CONTENT_LENGTH);
    }

    logger.info('[MediaSpecialist] Extracting media data', {
      userId: context.userId,
      sourceUrl: context.sourceUrl,
      contentLength: content.length,
    });

    const result = await this.llm.complete(messages, options);

    if (result.parsedOutput === undefined && !result.content) {
      logger.warn('[MediaSpecialist] LLM returned empty content', {
        userId: context.userId,
        model: result.model,
      });
      return null;
    }

    let raw: MediaExtraction;
    try {
      raw = resolveStructuredOutput<MediaExtraction>(
        result,
        MediaExtractionSchema,
        'MediaSpecialist extraction'
      );
    } catch (error) {
      logger.error('[MediaSpecialist] LLM returned invalid structured output', {
        userId: context.userId,
        content: (result.content ?? '').slice(0, 500),
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AgentEngineError(
        'AGENT_SUB_AGENT_INVALID_OUTPUT',
        'MediaSpecialist: LLM returned invalid structured output',
        {
          cause: error,
          metadata: {
            subAgent: 'media_specialist',
          },
        }
      );
    }

    // Empty object = no data found
    if (typeof raw === 'object' && raw !== null && Object.keys(raw).length === 0) {
      logger.info('[MediaSpecialist] No media data found in content', {
        userId: context.userId,
      });
      return null;
    }

    logger.info('[MediaSpecialist] Extraction succeeded', {
      userId: context.userId,
      videoCount: raw.videos.length,
      socialCount: raw.socialProfiles.length,
      sourceCount: raw.connectedSources.length,
      hasProfileImage: !!raw.profileImageUrl,
      hasBanner: !!raw.bannerImageUrl,
      model: result.model,
      tokens: result.usage?.totalTokens ?? 0,
    });

    return raw;
  }
}
