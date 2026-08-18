import type { Firestore } from 'firebase-admin/firestore';
import {
  getTeamFilmReviewRevision,
  getTeamFilmReviewSportTagDefinitions,
  isTeamFilmReviewSportTagValueValid,
  type TeamFilmReviewDoc,
  type TeamFilmReviewPlaySegment,
  type TeamFilmReviewSourceBreakdownPatch,
  type TeamFilmReviewSourceBreakdownPatchTagValue,
} from '@nxt1/core';
import { z } from 'zod';
import { loadUniversalFilmReview } from '../../../../services/team/universal-film-reviews.service.js';
import { parallelBatch } from '../../utils/parallel-batch.js';
import {
  assertReviewAccess,
  PatchFilmReviewSourceBreakdownsTool,
} from '../intel/team/film-review-compat.tool.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { AnalyzeVideoTool } from './analyze-video.tool.js';

const MAX_SELECTED_SOURCES = 5;
const DEFAULT_CONCURRENCY = 2;
const MAX_ANALYSIS_OBJECTIVES = 8;

const TagValueSchema = z.union([
  z.string().trim().min(1),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const SourceBreakdownObservationSchema = z.object({
  status: z.enum(['verified', 'partial', 'insufficient']),
  applicability: z.enum(['scrimmage', 'non_scrimmage', 'unclear']).optional(),
  label: z.string().trim().min(1).max(120).optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  playStartSec: z.number().nonnegative().optional(),
  playEndSec: z.number().nonnegative().optional(),
  tags: z.record(z.string().trim().min(1), TagValueSchema).default({}),
  notes: z.string().trim().max(800).optional(),
});

const AnalyzeFilmReviewSourceBreakdownsInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  sourceIds: z.array(z.string().trim().min(1)).min(1).max(MAX_SELECTED_SOURCES),
  requestedTagIds: z.union([z.literal('all'), z.array(z.string().trim().min(1)).min(1).max(32)]),
  sportContext: z.string().trim().min(1).optional(),
  teamContext: z.string().trim().min(1).optional(),
  playContext: z.string().trim().min(1).optional(),
  analysisObjectives: z.array(z.string().trim().min(1)).min(1).max(8).optional(),
  concurrency: z.number().int().min(1).max(3).optional(),
});

type SourceBreakdownObservation = z.infer<typeof SourceBreakdownObservationSchema>;

type SourceResult = {
  readonly sourceId: string;
  readonly title: string;
  readonly status:
    | 'analyzed'
    | 'not_applicable'
    | 'unavailable'
    | 'failed'
    | 'invalid_output'
    | 'insufficient'
    | 'ambiguous';
  readonly patch?: TeamFilmReviewSourceBreakdownPatch;
  readonly notes?: string;
  readonly error?: string;
};

function parseObservation(value: unknown): SourceBreakdownObservation | null {
  if (typeof value !== 'string') return null;
  const candidate = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    const parsed = JSON.parse(candidate);
    const result = SourceBreakdownObservationSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function hasMeaningfulTagValue(
  value: z.infer<typeof TagValueSchema> | undefined
): value is TeamFilmReviewSourceBreakdownPatchTagValue {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function confidenceScore(confidence: SourceBreakdownObservation['confidence']): number {
  if (confidence === 'high') return 0.92;
  if (confidence === 'medium') return 0.72;
  return 0.5;
}

function buildSourcePrompt(params: {
  readonly requestedTags: readonly {
    readonly id: string;
    readonly label: string;
    readonly valueType: string;
    readonly options?: readonly string[];
    readonly description?: string;
  }[];
}): string {
  const tagLines = params.requestedTags.map((tag) => {
    const description = tag.description?.trim();
    const valueContract = tag.options?.length
      ? `${tag.valueType}; allowed values: ${tag.options.join(', ')}`
      : tag.valueType;
    return `- ${tag.id} (${tag.label}) [${valueContract}]${description ? `: ${description}` : ''}`;
  });

  return [
    'Return ONLY valid JSON with this exact shape:',
    '{"status":"verified|partial|insufficient","applicability":"scrimmage|non_scrimmage|unclear","label":"short play label","confidence":"high|medium|low","playStartSec":0,"playEndSec":1,"tags":{"schemaTagId":"verified visible value"},"notes":"brief evidence"}',
    'Analyze only this selected source clip and create exactly one source-scoped breakdown row.',
    'Fill only the requested schema tag ids listed below.',
    'If a requested tag cannot be verified directly from the clip, omit it from the tags object instead of guessing.',
    'Set applicability to "non_scrimmage" only when the clip is clearly not live offense-versus-defense scrimmage film. Set it to "unclear" when that cannot be verified.',
    'For a verified non-scrimmage clip, omit defFront from the tags object unless the clip visibly shows a verifiable front.',
    'Use status "verified" when all requested tags are visible, "partial" when at least one requested tag is visible, and "insufficient" when none of the requested tags can be verified.',
    'Keep values compact and coach-facing. Do not include prose outside the JSON object.',
    'Requested schema tags:',
    ...tagLines,
  ].join('\n');
}

function buildCreatedRowId(sourceId: string, startSec: number, endSec: number): string {
  const normalizedSourceId = sourceId.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 64);
  return `agent-breakdown-${normalizedSourceId}-${Math.round(startSec * 1000)}-${Math.round(endSec * 1000)}`;
}

function resolveTargetRow(input: {
  readonly sourceId: string;
  readonly rows: readonly TeamFilmReviewPlaySegment[];
  readonly startSec: number;
  readonly endSec: number;
}): {
  readonly rowId: string;
  readonly createIfMissing?: TeamFilmReviewSourceBreakdownPatch['createIfMissing'];
} | null {
  if (input.rows.length === 1) {
    return { rowId: input.rows[0]!.id };
  }
  if (input.rows.length > 1) {
    const matchingRows = input.rows.filter(
      (row) =>
        Math.abs(row.startSec - input.startSec) <= 1 && Math.abs(row.endSec - input.endSec) <= 1
    );
    return matchingRows.length === 1 ? { rowId: matchingRows[0]!.id } : null;
  }

  return {
    rowId: buildCreatedRowId(input.sourceId, input.startSec, input.endSec),
  };
}

function getToolResultDataRecord(result: ToolResult): Record<string, unknown> {
  return result.data && typeof result.data === 'object' && !Array.isArray(result.data)
    ? (result.data as Record<string, unknown>)
    : {};
}

function isRevisionConflictResult(result: ToolResult): boolean {
  return getToolResultDataRecord(result)['code'] === 'REVISION_CONFLICT';
}

function summarizeWriteConflict(input: {
  readonly writeResult: ToolResult;
  readonly retryableSourceIds: readonly string[];
  readonly updatedSourceIds: readonly string[];
}): readonly string[] {
  return isRevisionConflictResult(input.writeResult)
    ? [...new Set([...input.retryableSourceIds, ...input.updatedSourceIds])]
    : input.retryableSourceIds;
}

export class AnalyzeFilmReviewSourceBreakdownsTool extends BaseTool {
  readonly name = 'analyze_film_review_source_breakdowns';
  readonly description =
    'Analyzes up to 5 selected film-review source clips for requested or all schema-backed tags, then losslessly patches the verified source rows while preserving existing annotations and unrelated fields. If more than 5 clips need analysis, call this tool iteratively: process 5 clips, let the patch save, review any returned follow-up needs, then call it again for the next 5.';
  readonly parameters = AnalyzeFilmReviewSourceBreakdownsInputSchema;
  readonly isMutation = true;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;
  override readonly allowedAgents = ['performance_coordinator'] as const;

  constructor(
    private readonly analyzeVideo: AnalyzeVideoTool,
    private readonly patchSourceBreakdowns: Pick<PatchFilmReviewSourceBreakdownsTool, 'execute'>,
    private readonly db: Firestore
  ) {
    super();
  }

  private async loadWritableReview(
    filmReviewId: string,
    userId: string
  ): Promise<{ review: TeamFilmReviewDoc } | { error: string }> {
    const review = await loadUniversalFilmReview(this.db, filmReviewId);
    if (!review) {
      return { error: `Film review ${filmReviewId} was not found.` };
    }

    const permission = await assertReviewAccess(this.db, review, userId, 'write');
    if (!permission.ok) return { error: permission.error };

    return { review };
  }

  private async persistPatchesWithFreshRevision(input: {
    readonly filmReviewId: string;
    readonly userId: string;
    readonly patches: readonly TeamFilmReviewSourceBreakdownPatch[];
    readonly context: ToolExecutionContext;
  }): Promise<ToolResult> {
    let lastConflict: ToolResult | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const latestReviewResult = await this.loadWritableReview(input.filmReviewId, input.userId);
      if ('error' in latestReviewResult) {
        return {
          success: false,
          error: latestReviewResult.error,
          isValidationError: true,
        };
      }

      const writeResult = await this.patchSourceBreakdowns.execute(
        {
          filmReviewId: input.filmReviewId,
          expectedRevision: getTeamFilmReviewRevision(latestReviewResult.review),
          patches: input.patches,
        },
        input.context
      );

      if (writeResult.success || !isRevisionConflictResult(writeResult)) {
        return writeResult;
      }

      lastConflict = writeResult;
    }

    return (
      lastConflict ?? {
        success: false,
        error: 'Failed to persist source breakdown patches.',
      }
    );
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = this.parameters.safeParse(input);
    if (!parsed.success) {
      const requestedSourceIds = input['sourceIds'];
      const requestedCount = Array.isArray(requestedSourceIds) ? requestedSourceIds.length : null;
      if (requestedCount !== null && requestedCount > MAX_SELECTED_SOURCES) {
        return {
          success: false,
          error:
            `This tool accepts at most ${MAX_SELECTED_SOURCES} source clips per call. ` +
            `Process clips iteratively in batches of ${MAX_SELECTED_SOURCES}: analyze the first batch, let the patch save, handle any follow-up input needed from that batch, then call the tool again for the next batch.`,
          data: {
            maxSelectedSources: MAX_SELECTED_SOURCES,
            requestedSourceCount: requestedCount,
            recommendedNextAction: `Retry with the first ${MAX_SELECTED_SOURCES} sourceIds only, then continue with the next batch after this call completes.`,
          },
        };
      }
      return this.zodError(parsed.error);
    }
    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const sourceIds = [...new Set(parsed.data.sourceIds)];
    const initialReviewResult = await this.loadWritableReview(
      parsed.data.filmReviewId,
      context.userId
    );
    if ('error' in initialReviewResult) {
      return { success: false, error: initialReviewResult.error };
    }
    const review = initialReviewResult.review;

    const sportTagSchema = getTeamFilmReviewSportTagDefinitions(review.sport);
    const sportTagsById = new Map(sportTagSchema.map((tag) => [tag.id, tag]));
    const requestedTagIds =
      parsed.data.requestedTagIds === 'all'
        ? sportTagSchema.map((tag) => tag.id)
        : [...new Set(parsed.data.requestedTagIds)];
    const requestedTags = requestedTagIds.map((tagId) =>
      sportTagSchema.find((tag) => tag.id === tagId)
    );
    const unknownTagIds = requestedTagIds.filter((_, index) => !requestedTags[index]);
    if (unknownTagIds.length > 0) {
      return {
        success: false,
        error: `Requested tag ids are not valid for ${review.sport || 'this'} film review: ${unknownTagIds.join(', ')}.`,
        data: {
          requestedTagIds,
          availableTagIds: sportTagSchema.map((tag) => tag.id),
        },
      };
    }

    const sourcesById = new Map(
      (review.sources ?? []).flatMap((source) => {
        const sourceId = source.id?.trim();
        return sourceId ? [[sourceId, source] as const] : [];
      })
    );
    const sourceRowsById = new Map<string, readonly TeamFilmReviewPlaySegment[]>();
    for (const sourceId of sourceIds) {
      sourceRowsById.set(
        sourceId,
        (review.timeline ?? []).filter((row) => row.sourceId === sourceId)
      );
    }
    const unavailable = new Map<string, SourceResult>();
    const available: Array<{
      readonly sourceId: string;
      readonly title: string;
      readonly durationSec?: number | null;
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

      available.push({
        sourceId,
        title: source.title?.trim() || sourceId,
        durationSec: source.durationSec,
        ordinal: index + 1,
      });
    }

    const batch = await parallelBatch(
      available,
      async ({ sourceId, title, durationSec, ordinal }): Promise<SourceResult> => {
        const stepId = `film-breakdown:${sourceId}`;
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
            prompt: buildSourcePrompt({
              requestedTags: requestedTags as Array<{
                readonly id: string;
                readonly label: string;
                readonly valueType: string;
                readonly options?: readonly string[];
                readonly description?: string;
              }>,
            }),
            sportContext: parsed.data.sportContext ?? review.sport,
            teamContext: parsed.data.teamContext,
            playContext: parsed.data.playContext,
            focusArea: 'source-scoped film review breakdown tagging',
            analysisObjectives:
              parsed.data.analysisObjectives ??
              requestedTagIds
                .slice(0, MAX_ANALYSIS_OBJECTIVES)
                .map((tagId) => `Verify ${tagId} from visible film evidence`),
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
          const error =
            'Video analysis did not return the required structured breakdown observation.';
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
          return { sourceId, title, status: 'invalid_output', error };
        }

        const tags: Record<string, TeamFilmReviewSourceBreakdownPatchTagValue> = {};
        for (const [tagId, tagValue] of Object.entries(observation.tags)) {
          const definition = sportTagsById.get(tagId);
          if (
            requestedTagIds.includes(tagId) &&
            hasMeaningfulTagValue(tagValue) &&
            definition !== undefined &&
            isTeamFilmReviewSportTagValueValid(definition, tagValue)
          ) {
            tags[tagId] = tagValue;
          }
        }

        if (observation.applicability === 'unclear') {
          return {
            sourceId,
            title,
            status: 'insufficient',
            notes: observation.notes,
            error: 'Clip applicability could not be verified from the selected source.',
          };
        }

        const isNotApplicable =
          observation.applicability === 'non_scrimmage' &&
          requestedTagIds.includes('defFront') &&
          observation.status !== 'insufficient';

        if (observation.status === 'insufficient') {
          context.emitToolStep?.({
            type: 'tool_result',
            toolName: 'analyze_video',
            stepId,
            message: stepLabel,
            icon: 'media',
            toolSuccess: true,
            toolResult: { sourceTitle: title, status: 'insufficient' },
          });
          return {
            sourceId,
            title,
            status: 'insufficient',
            notes: observation.notes,
            error: 'No requested breakdown tags could be verified from the selected source clip.',
          };
        }

        if (Object.keys(tags).length === 0) {
          context.emitToolStep?.({
            type: 'tool_result',
            toolName: 'analyze_video',
            stepId,
            message: stepLabel,
            icon: 'media',
            toolSuccess: true,
            toolResult: {
              sourceTitle: title,
              status: isNotApplicable ? 'not_applicable' : 'insufficient',
            },
          });
          return {
            sourceId,
            title,
            status: isNotApplicable ? 'not_applicable' : 'insufficient',
            notes: observation.notes,
            ...(isNotApplicable
              ? {}
              : {
                  error:
                    'No requested breakdown tags could be verified from the selected source clip.',
                }),
          };
        }

        const startSec = observation.playStartSec ?? 0;
        const endSecCandidate = observation.playEndSec ?? durationSec ?? startSec + 1;
        const endSec = endSecCandidate > startSec ? endSecCandidate : startSec + 1;
        const target = resolveTargetRow({
          sourceId,
          rows: sourceRowsById.get(sourceId) ?? [],
          startSec,
          endSec,
        });
        if (!target) {
          return {
            sourceId,
            title,
            status: 'ambiguous',
            notes: observation.notes,
            error:
              'Multiple existing source rows exist and the model time range did not uniquely match one row.',
          };
        }

        const confidence = confidenceScore(observation.confidence);
        const patch: TeamFilmReviewSourceBreakdownPatch = {
          sourceId,
          rowId: target.rowId,
          tags,
          tagProvenance: Object.fromEntries(
            Object.keys(tags).map((tagId) => [
              tagId,
              {
                origin: 'agent_x' as const,
                confidence,
                ...(observation.notes ? { evidence: observation.notes } : {}),
                ...(context.operationId ? { operationId: context.operationId } : {}),
                updatedAt: new Date().toISOString(),
              },
            ])
          ),
          ...(sourceRowsById.get(sourceId)?.length === 0
            ? {
                createIfMissing: {
                  number: 1,
                  label: observation.label ?? title,
                  startSec,
                  endSec,
                  confidence,
                },
              }
            : {}),
        };

        context.emitToolStep?.({
          type: 'tool_result',
          toolName: 'analyze_video',
          stepId,
          message: stepLabel,
          icon: 'media',
          toolSuccess: true,
          toolResult: {
            sourceTitle: title,
            status: observation.status,
            verifiedTagCount: Object.keys(tags).length,
          },
        });

        return {
          sourceId,
          title,
          status: isNotApplicable ? 'not_applicable' : 'analyzed',
          patch,
          notes: observation.notes,
        };
      },
      {
        concurrency: parsed.data.concurrency ?? DEFAULT_CONCURRENCY,
        signal: context.signal,
        onItemSettled: (completed, total) => {
          context.emitStage?.('processing_media', {
            icon: 'media',
            phase: 'analyze_film_review_source_breakdowns',
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
      notApplicable: sourceResults.filter((result) => result.status === 'not_applicable').length,
      unavailable: sourceResults.filter((result) => result.status === 'unavailable').length,
      failed: sourceResults.filter((result) => result.status === 'failed').length,
      invalidOutput: sourceResults.filter((result) => result.status === 'invalid_output').length,
      insufficient: sourceResults.filter((result) => result.status === 'insufficient').length,
      ambiguous: sourceResults.filter((result) => result.status === 'ambiguous').length,
    };

    const patches = sourceResults.flatMap((result) => (result.patch ? [result.patch] : []));
    const updatedSourceIds = sourceResults.flatMap((result) =>
      result.patch ? [result.sourceId] : []
    );
    const notApplicableSourceIds = sourceResults
      .filter((result) => result.status === 'not_applicable')
      .map((result) => result.sourceId);
    const insufficientSourceIds = sourceResults
      .filter((result) => result.status === 'insufficient' || result.status === 'ambiguous')
      .map((result) => result.sourceId);
    const unavailableSourceIds = sourceResults
      .filter((result) => result.status === 'unavailable')
      .map((result) => result.sourceId);
    const failedSourceIds = sourceResults
      .filter((result) => result.status === 'failed' || result.status === 'invalid_output')
      .map((result) => result.sourceId);
    const retryableSourceIds = [
      ...new Set([...insufficientSourceIds, ...unavailableSourceIds, ...failedSourceIds]),
    ];

    if (patches.length === 0) {
      if (
        coverage.notApplicable > 0 &&
        coverage.notApplicable +
          coverage.unavailable +
          coverage.failed +
          coverage.invalidOutput +
          coverage.insufficient +
          coverage.ambiguous ===
          coverage.requested
      ) {
        return {
          success: true,
          data: {
            coverage,
            sourceResults,
            requestedTagIds,
            updatedSourceIds,
            notApplicableSourceIds,
            insufficientSourceIds,
            unavailableSourceIds,
            failedSourceIds,
            retryableSourceIds,
            persistedSources: [],
            reportScope:
              'Selected source clips were analyzed, but no writable tag values were produced; non-applicable fields were left empty.',
          },
        };
      }

      return {
        success: false,
        error: 'No selected source clip produced a verified, uniquely targetable breakdown patch.',
        data: {
          coverage,
          sourceResults,
          requestedTagIds,
          updatedSourceIds,
          notApplicableSourceIds,
          insufficientSourceIds,
          unavailableSourceIds,
          failedSourceIds,
          retryableSourceIds,
        },
      };
    }

    const writeResult = await this.persistPatchesWithFreshRevision({
      filmReviewId: parsed.data.filmReviewId,
      userId: context.userId,
      patches,
      context,
    });
    if (!writeResult.success) {
      return {
        success: false,
        error: writeResult.error ?? 'Failed to persist source breakdown patches.',
        ...(isRevisionConflictResult(writeResult) ? { isValidationError: true } : {}),
        data: {
          coverage,
          sourceResults,
          requestedTagIds,
          updatedSourceIds: [],
          notApplicableSourceIds,
          insufficientSourceIds,
          unavailableSourceIds,
          failedSourceIds,
          retryableSourceIds: summarizeWriteConflict({
            writeResult,
            retryableSourceIds,
            updatedSourceIds,
          }),
        },
      };
    }

    return {
      success: true,
      data: {
        coverage,
        requestedTagIds,
        sourceResults,
        updatedSourceIds,
        notApplicableSourceIds,
        insufficientSourceIds,
        unavailableSourceIds,
        failedSourceIds,
        retryableSourceIds,
        persistedSources: updatedSourceIds,
        reportScope: `Verified and persisted ${updatedSourceIds.length}/${coverage.requested} selected source breakdown patches in one batch.`,
      },
    };
  }
}
