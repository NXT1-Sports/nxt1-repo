/**
 * @fileoverview Dispatch Extraction Tool
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Boss-level tool that fans out scraped content to 3 domain-specific
 * Sub-Agent extraction specialists in parallel. Each specialist validates
 * its output with a Zod schema before returning to the Boss.
 *
 * Uses Promise.allSettled() for fault isolation — if one specialist fails,
 * the others still succeed (Partial Success Mode).
 *
 * Role-locking: Coaches/Directors NEVER receive athlete-specific data
 * (sports[], measurables[], connectedSources) on their User doc.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import { z } from 'zod';
import {
  AthleteSpecialist,
  OrgSpecialist,
  MediaSpecialist,
} from '../../agents/sub-agents/index.js';
import type { AthleteExtraction } from '../../schemas/athlete-extraction.schema.js';
import type { OrgExtraction } from '../../schemas/org-extraction.schema.js';
import type { MediaExtraction } from '../../schemas/media-extraction.schema.js';
import { isTeamRole, isAthleteRole } from '@nxt1/core';
import { logger } from '../../../../utils/logger.js';

/** Max chars sent to each sub-agent LLM call (~30k chars ≈ ~8k tokens for Haiku). */
const MAX_CONTENT_LENGTH = 30_000;

/** Allowed userRole values (validated at runtime). */
const VALID_ROLES = new Set(['athlete', 'coach', 'director']);

// ─── Result Type ────────────────────────────────────────────────────────────

export interface ExtractionResults {
  /** Athlete data (null if user is coach/director or no data found) */
  athlete: AthleteExtraction | null;
  /** Organization data with deterministic key (null if not found) */
  org: { data: OrgExtraction; orgKey: string } | null;
  /** Media links and social profiles (null if not found) */
  media: MediaExtraction | null;
  /** Which specialists succeeded vs failed */
  status: {
    athlete: 'success' | 'skipped' | 'failed';
    org: 'success' | 'skipped' | 'failed';
    media: 'success' | 'skipped' | 'failed';
  };
  /** Error messages for failed specialists */
  errors: string[];
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class DispatchExtractionTool extends BaseTool {
  readonly name = 'dispatch_extraction';
  readonly description = `Fan out scraped profile content to 3 domain-specific extraction specialists in parallel.
Returns Zod-validated structured data for: athlete performance (stats, metrics, awards), 
organization (school/club info, branding, location), and media (videos, social profiles).
Uses fault-tolerant Promise.allSettled — partial results are returned if one specialist fails.
Role-aware: Coaches/Directors receive only org and media data, never athlete stats.`;

  readonly parameters = z.object({
    content: z.string().min(1),
    userRole: z.enum(['athlete', 'coach', 'director']),
    sport: z.string().trim().min(1).optional(),
    sourceUrl: z.string().trim().min(1).optional(),
  });

  readonly isMutation = false;
  readonly category = 'analytics' as const;
  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['data_coordinator'] as const;

  private readonly athleteSpecialist: AthleteSpecialist;
  private readonly orgSpecialist: OrgSpecialist;
  private readonly mediaSpecialist: MediaSpecialist;

  constructor(llm: OpenRouterService) {
    super();
    this.athleteSpecialist = new AthleteSpecialist(llm);
    this.orgSpecialist = new OrgSpecialist(llm);
    this.mediaSpecialist = new MediaSpecialist(llm);
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    // ── Runtime input validation ────────────────────────────────────────
    const rawContent = input['content'];
    const rawRole = input['userRole'];

    if (typeof rawContent !== 'string' || rawContent.trim().length === 0) {
      return { success: false, error: 'Content must be a non-empty string.' };
    }

    if (typeof rawRole !== 'string' || !VALID_ROLES.has(rawRole)) {
      return {
        success: false,
        error: `Invalid userRole "${String(rawRole)}". Expected: athlete, coach, or director.`,
      };
    }

    const userRole = rawRole as 'athlete' | 'coach' | 'director';
    const sport = typeof input['sport'] === 'string' ? input['sport'] : undefined;
    const sourceUrl = typeof input['sourceUrl'] === 'string' ? input['sourceUrl'] : undefined;
    const userId = context?.userId ?? 'unknown';
    const threadId = context?.threadId;

    // Truncate oversized content to prevent context-window overflow
    let content = rawContent.trim();
    if (content.length > MAX_CONTENT_LENGTH) {
      logger.warn('[DispatchExtraction] Truncating oversized content', {
        userId,
        originalLength: content.length,
        truncatedTo: MAX_CONTENT_LENGTH,
      });
      content = content.slice(0, MAX_CONTENT_LENGTH);
    }

    logger.info('[DispatchExtraction] Starting parallel extraction', {
      userId,
      userRole,
      sport,
      sourceUrl,
      contentLength: content.length,
    });

    const extractionContext = { userId, threadId, sport, sourceUrl };
    const isCoachOrDirector = isTeamRole(userRole);
    const isAthlete = isAthleteRole(userRole);

    // ── Build extraction promises ─────────────────────────────────────────

    // Athlete extraction: ONLY for athlete roles
    const athletePromise: Promise<AthleteExtraction | null> = isAthlete
      ? (() => {
          context?.emitStage?.('invoking_sub_agent', {
            icon: 'database',
            subAgentId: 'athlete-specialist',
            source: 'dispatch_extraction',
          });
          return this.athleteSpecialist.extract(content, extractionContext);
        })()
      : Promise.resolve(null);

    // Org extraction: ALL roles benefit from org data
    context?.emitStage?.('invoking_sub_agent', {
      icon: 'document',
      subAgentId: 'org-specialist',
      source: 'dispatch_extraction',
    });
    const orgPromise = this.orgSpecialist.extract(content, extractionContext);

    // Media extraction: ALL roles benefit from media data
    context?.emitStage?.('invoking_sub_agent', {
      icon: 'media',
      subAgentId: 'media-specialist',
      source: 'dispatch_extraction',
    });
    const mediaPromise = this.mediaSpecialist.extract(content, extractionContext);

    // ── Execute in parallel with fault isolation ──────────────────────────

    const [athleteResult, orgResult, mediaResult] = await Promise.allSettled([
      athletePromise,
      orgPromise,
      mediaPromise,
    ]);

    // ── Build results ────────────────────────────────────────────────────

    const results: ExtractionResults = {
      athlete: null,
      org: null,
      media: null,
      status: {
        athlete: isCoachOrDirector ? 'skipped' : 'failed',
        org: 'failed',
        media: 'failed',
      },
      errors: [],
    };

    // Athlete
    if (athleteResult.status === 'fulfilled') {
      results.athlete = athleteResult.value;
      results.status.athlete = isCoachOrDirector ? 'skipped' : 'success';
    } else if (isAthlete) {
      const msg =
        athleteResult.reason instanceof Error
          ? athleteResult.reason.message
          : String(athleteResult.reason);
      results.errors.push(`AthleteSpecialist: ${msg}`);
      logger.error('[DispatchExtraction] Athlete extraction failed', {
        userId,
        error: msg,
      });
    }

    // Org
    if (orgResult.status === 'fulfilled') {
      results.org = orgResult.value;
      results.status.org = 'success';
    } else {
      const msg =
        orgResult.reason instanceof Error ? orgResult.reason.message : String(orgResult.reason);
      results.errors.push(`OrgSpecialist: ${msg}`);
      logger.error('[DispatchExtraction] Org extraction failed', {
        userId,
        error: msg,
      });
    }

    // Media
    if (mediaResult.status === 'fulfilled') {
      results.media = mediaResult.value;
      results.status.media = 'success';
    } else {
      const msg =
        mediaResult.reason instanceof Error
          ? mediaResult.reason.message
          : String(mediaResult.reason);
      results.errors.push(`MediaSpecialist: ${msg}`);
      logger.error('[DispatchExtraction] Media extraction failed', {
        userId,
        error: msg,
      });
    }

    // ── Summary logging ──────────────────────────────────────────────────

    const successCount = Object.values(results.status).filter((s) => s === 'success').length;
    const failedCount = results.errors.length;

    logger.info('[DispatchExtraction] Extraction complete', {
      userId,
      successCount,
      failedCount,
      skippedAthleteForCoach: isCoachOrDirector,
      athleteStatus: results.status.athlete,
      orgStatus: results.status.org,
      mediaStatus: results.status.media,
      hasAthleteData: !!results.athlete,
      hasOrgData: !!results.org,
      hasMediaData: !!results.media,
    });

    // If ALL non-skipped specialists failed, return failure
    // For coaches/directors: org + media must both fail; for athletes: all 3
    if (successCount === 0) {
      return {
        success: false,
        error: `All extraction specialists failed: ${results.errors.join(' | ')}`,
      };
    }

    // Partial or full success
    return {
      success: true,
      data: results,
    };
  }
}
