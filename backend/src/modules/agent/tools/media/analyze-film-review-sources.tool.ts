import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { loadUniversalFilmReview } from '../../../../services/team/universal-film-reviews.service.js';
import { parallelBatch } from '../../utils/parallel-batch.js';
import { assertReviewAccess } from '../intel/team/film-review-compat.tool.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { AnalyzeVideoTool } from './analyze-video.tool.js';

const MAX_SELECTED_SOURCES = 25;
const DEFAULT_CONCURRENCY = 2;

const PlayerStatLineSchema = z.object({
  player: z.string().trim().min(1),
  passingAttempts: z.number().int().min(0).default(0),
  passingCompletions: z.number().int().min(0).default(0),
  passingYards: z.number().int().default(0),
  passingTouchdowns: z.number().int().min(0).default(0),
  interceptions: z.number().int().min(0).default(0),
  rushingAttempts: z.number().int().min(0).default(0),
  rushingYards: z.number().int().default(0),
  rushingTouchdowns: z.number().int().min(0).default(0),
  receptions: z.number().int().min(0).default(0),
  receivingYards: z.number().int().default(0),
  receivingTouchdowns: z.number().int().min(0).default(0),
  confidence: z.enum(['high', 'medium', 'low']),
});

const SourceObservationSchema = z.object({
  classification: z.enum(['offense', 'defense', 'special_teams', 'no_play', 'uncertain']),
  playerStats: z.array(PlayerStatLineSchema).max(22),
  notes: z.string().trim().max(800).optional(),
});

const AnalyzeFilmReviewSourcesInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  sourceIds: z.array(z.string().trim().min(1)).min(1).max(MAX_SELECTED_SOURCES),
  sportContext: z.string().trim().min(1).optional(),
  teamContext: z.string().trim().min(1).optional(),
  concurrency: z.number().int().min(1).max(3).optional(),
});

type PlayerStatLine = z.infer<typeof PlayerStatLineSchema>;
type SourceObservation = z.infer<typeof SourceObservationSchema>;

type SourceResult = {
  readonly sourceId: string;
  readonly title: string;
  readonly status: 'analyzed' | 'unavailable' | 'failed' | 'invalid_output';
  readonly observation?: SourceObservation;
  readonly error?: string;
};

function parseObservation(value: unknown): SourceObservation | null {
  if (typeof value !== 'string') return null;
  const candidate = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    const parsed = JSON.parse(candidate);
    const result = SourceObservationSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function aggregatePlayerStats(results: readonly SourceResult[]): readonly PlayerStatLine[] {
  const totals = new Map<string, PlayerStatLine>();
  for (const result of results) {
    if (result.status !== 'analyzed' || !result.observation) continue;
    for (const stat of result.observation.playerStats) {
      const previous = totals.get(stat.player);
      if (!previous) {
        totals.set(stat.player, { ...stat });
        continue;
      }

      totals.set(stat.player, {
        player: stat.player,
        passingAttempts: previous.passingAttempts + stat.passingAttempts,
        passingCompletions: previous.passingCompletions + stat.passingCompletions,
        passingYards: previous.passingYards + stat.passingYards,
        passingTouchdowns: previous.passingTouchdowns + stat.passingTouchdowns,
        interceptions: previous.interceptions + stat.interceptions,
        rushingAttempts: previous.rushingAttempts + stat.rushingAttempts,
        rushingYards: previous.rushingYards + stat.rushingYards,
        rushingTouchdowns: previous.rushingTouchdowns + stat.rushingTouchdowns,
        receptions: previous.receptions + stat.receptions,
        receivingYards: previous.receivingYards + stat.receivingYards,
        receivingTouchdowns: previous.receivingTouchdowns + stat.receivingTouchdowns,
        confidence:
          previous.confidence === 'low' || stat.confidence === 'low'
            ? 'low'
            : previous.confidence === 'medium' || stat.confidence === 'medium'
              ? 'medium'
              : 'high',
      });
    }
  }

  return [...totals.values()].sort((left, right) => left.player.localeCompare(right.player));
}

function buildSourcePrompt(): string {
  return [
    'Return ONLY valid JSON with this exact shape:',
    '{"classification":"offense|defense|special_teams|no_play|uncertain","playerStats":[{"player":"#12 or verified name","passingAttempts":0,"passingCompletions":0,"passingYards":0,"passingTouchdowns":0,"interceptions":0,"rushingAttempts":0,"rushingYards":0,"rushingTouchdowns":0,"receptions":0,"receivingYards":0,"receivingTouchdowns":0,"confidence":"high|medium|low"}],"notes":"brief evidence"}',
    'Analyze only this source clip. Count only directly visible, attributable offensive events for our team.',
    'Use a jersey number when a player name is not verifiable. For defense, special teams, or no-play clips, return an empty playerStats array.',
    'Do not estimate, infer, or include any prose outside the JSON object.',
  ].join('\n');
}

export class AnalyzeFilmReviewSourcesTool extends BaseTool {
  readonly name = 'analyze_film_review_sources';
  readonly description =
    'Deterministically analyzes every selected source clip in a multi-source film review and returns source-level coverage plus aggregated football offensive player stats.';
  readonly parameters = AnalyzeFilmReviewSourcesInputSchema;
  readonly isMutation = false;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;
  override readonly allowedAgents = ['performance_coordinator'] as const;

  constructor(
    private readonly analyzeVideo: AnalyzeVideoTool,
    private readonly db: Firestore
  ) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = this.parameters.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    const sourceIds = [...new Set(parsed.data.sourceIds)];
    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} was not found.` };
    }

    const permission = await assertReviewAccess(this.db, review, context.userId, 'read');
    if (!permission.ok) return { success: false, error: permission.error };

    const sourcesById = new Map(
      (review.sources ?? []).flatMap((source) => {
        const sourceId = source.id?.trim();
        return sourceId ? [[sourceId, source] as const] : [];
      })
    );
    const unavailable = new Map<string, SourceResult>();
    const available: Array<{
      readonly sourceId: string;
      readonly title: string;
      readonly ordinal: number;
    }> = [];

    for (const [index, sourceId] of sourceIds.entries()) {
      const source = sourcesById.get(sourceId);
      const playableUrl = source?.videoUrl?.trim() || source?.downloadUrl?.trim();
      if (!source || !playableUrl) {
        unavailable.set(sourceId, {
          sourceId,
          title: source?.title?.trim() || sourceId,
          status: 'unavailable',
          error: source
            ? 'Source does not have a playable video URL.'
            : 'Source was not found in the review.',
        });
        continue;
      }
      available.push({ sourceId, title: source.title?.trim() || sourceId, ordinal: index + 1 });
    }

    const batch = await parallelBatch(
      available,
      async ({ sourceId, title, ordinal }): Promise<SourceResult> => {
        const stepId = `film-source:${sourceId}`;
        const stepLabel = `Analyzing ${title} (${ordinal}/${sourceIds.length})`;
        context.emitToolStep?.({
          type: 'step_active',
          toolName: 'analyze_video',
          stepId,
          message: stepLabel,
          icon: 'media',
          metadata: { sourceTitle: title, sourceOrdinal: ordinal, sourceCount: sourceIds.length },
        });
        const result = await this.analyzeVideo.execute(
          {
            filmReviewId: parsed.data.filmReviewId,
            sourceId,
            prompt: buildSourcePrompt(),
            sportContext: parsed.data.sportContext ?? review.sport,
            teamContext: parsed.data.teamContext ?? 'Our team offense only',
            focusArea: 'football offensive player statistics',
            analysisObjectives: [
              'Identify offensive players',
              'Extract verified player stat deltas',
            ],
          },
          { ...context, filmReviewBatchExecution: true }
        );
        if (!result.success) {
          const error = result.error ?? 'Video analysis failed.';
          context.emitToolStep?.({
            type: 'tool_result',
            toolName: 'analyze_video',
            stepId,
            message: stepLabel,
            icon: 'media',
            toolSuccess: false,
            error,
            toolResult: { sourceTitle: title, status: 'failed' },
          });
          return { sourceId, title, status: 'failed', error };
        }

        const analysis =
          result.data && typeof result.data === 'object'
            ? (result.data as Record<string, unknown>)['analysis']
            : undefined;
        const observation = parseObservation(analysis);
        if (!observation) {
          const error = 'Video analysis did not return the required structured observation.';
          context.emitToolStep?.({
            type: 'tool_result',
            toolName: 'analyze_video',
            stepId,
            message: stepLabel,
            icon: 'media',
            toolSuccess: false,
            error,
            toolResult: { sourceTitle: title, status: 'invalid_output' },
          });
          return {
            sourceId,
            title,
            status: 'invalid_output',
            error,
          };
        }
        context.emitToolStep?.({
          type: 'tool_result',
          toolName: 'analyze_video',
          stepId,
          message: stepLabel,
          icon: 'media',
          toolSuccess: true,
          toolResult: {
            sourceTitle: title,
            status: observation.classification,
            playerStatLines: observation.playerStats.length,
          },
        });
        return { sourceId, title, status: 'analyzed', observation };
      },
      {
        concurrency: parsed.data.concurrency ?? DEFAULT_CONCURRENCY,
        signal: context.signal,
        onItemSettled: (completed, total) => {
          context.emitStage?.('processing_media', {
            icon: 'media',
            phase: 'analyze_film_review_sources',
            completedSources: completed,
            totalSources: total,
          });
        },
      }
    );

    const completed = new Map(unavailable);
    for (const item of batch) {
      const source = available[item.index];
      if (!source) continue;
      completed.set(
        source.sourceId,
        item.status === 'fulfilled'
          ? item.value
          : {
              sourceId: source.sourceId,
              title: source.title,
              status: 'failed',
              error: item.reason.message,
            }
      );
    }

    const sourceResults = sourceIds.map((sourceId) => completed.get(sourceId)!);
    const coverage = {
      requested: sourceIds.length,
      analyzed: sourceResults.filter((result) => result.status === 'analyzed').length,
      unavailable: sourceResults.filter((result) => result.status === 'unavailable').length,
      failed: sourceResults.filter((result) => result.status === 'failed').length,
      invalidOutput: sourceResults.filter((result) => result.status === 'invalid_output').length,
    };
    const aggregate = aggregatePlayerStats(sourceResults);

    if (coverage.analyzed !== coverage.requested) {
      return {
        success: false,
        error: `Selected-film analysis is incomplete: ${coverage.analyzed}/${coverage.requested} source clips produced verified observations.`,
        data: { coverage, sourceResults, aggregate },
      };
    }

    return {
      success: true,
      data: {
        coverage,
        sourceResults,
        aggregate,
        reportScope: `Verified from all ${coverage.requested} selected source clips.`,
      },
    };
  }
}
