/**
 * @fileoverview Agent X — Dashboard, history, operations-log, goals, upload routes.
 *
 * GET  /jobs/:operationId
 * GET  /history
 * GET  /operations-log
 * GET  /dashboard
 * POST /goals
 * POST /upload
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { uploadRateLimit } from '../../middleware/rate-limit/rate-limit.middleware.js';
import { validateBody } from '../../middleware/validation/validation.middleware.js';
import { SetGoalsDto, CompleteGoalDto } from '../../dtos/agent-x.dto.js';
import type {
  AgentDashboardGoal,
  ShellActionChip,
  ShellWeeklyPlaybookItem,
  ShellBriefingInsight,
  OperationLogEntry,
  CompletedGoalRecord,
  TeamGamePlanDoc,
  TeamGamePlanEvidenceType,
  TeamGamePlanPriorityLevel,
  TeamGamePlanStrengthWeaknessItem,
  TeamFilmReviewDoc,
  TeamFilmReviewPerspective,
  TeamFilmReviewPlayAnnotation,
  TeamFilmReviewPlaySegment,
  TeamFilmReviewPlayTagValue,
  TeamFilmReviewSportTagSchemaKey,
  TeamFilmReviewStatus,
  TeamFilmReviewDownloadPrewarm,
  TeamFilmReviewDownloadPrewarmStatus,
  TeamFilmReviewSportTagDefinition,
  TeamFilmReviewTimelineTag,
  TeamFilmReviewAnnotation,
  TeamFilmReviewBreakdownSource,
  TeamFilmReviewTagCategory,
} from '@nxt1/core';
import {
  AGENT_X_FIREBASE_MAX_VIDEO_FILE_SIZE,
  AGENT_X_VIDEO_CLOUDFLARE_THRESHOLD_BYTES,
  getTeamFilmReviewSportTagDefinitions,
  normalizeBaseSportKey,
  resolveTeamFilmReviewSportTagSchemaKey,
} from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import { getSignedUrlWithTimeout } from '../../utils/gcs-signed-url.js';
import firebaseAdmin from '../../utils/firebase.js';
import {
  getAgentAppConfig,
  resolveConfiguredCoordinatorsForRole,
} from '../../modules/agent/config/agent-app-config.js';
import {
  validateJobOrigin,
  isScheduledOrigin,
  shouldHideRecurringExecutionJob,
  shouldHideRecurringSourceThread,
  mapJobStatus,
  inferCategory,
  iconForCategory,
  computeDuration,
} from './operations-log.helpers.js';
import {
  jobRepository,
  chatService,
  queueService,
  agentUpload,
  getAuthUser,
  llmService,
  getGenerationService,
  isLegacyFallbackPlaybook,
  contextBuilder,
} from './shared.js';
import { AgentMediaLifecycleService } from '../../modules/agent/tools/media/agent-media-lifecycle.service.js';
import {
  GeminiFilesService,
  type GeminiVideoAnalysisOptions,
} from '../../modules/agent/llm/gemini-files.service.js';
import {
  canManageTeamMutationForUser,
  canReadTeamIntelForUser,
} from '../../services/team/team-intel-permissions.js';
import {
  ExportService,
  type ExportColumn,
  type ExportRow,
} from '../../modules/agent/services/export.service.js';
import { parseHudlBreakdownBuffer } from '../../services/team/hudl-breakdown-import.service.js';
import { getCacheService } from '../../services/core/cache.service.js';
import {
  fetchCloudflareFinalizedVideo,
  fetchCloudflareDownloadStatus,
  requestCloudflareVideoDownloadRender,
  CLOUDFLARE_API_BASE_URL,
} from '../core/upload/shared.js';
import { BoardDiagramAssetService } from '../../modules/agent/tools/integrations/board-diagram/services/board-diagram-asset.service.js';
import {
  BoardDiagramService,
  renderBoardDiagramSvg,
} from '../../modules/agent/tools/integrations/board-diagram/board-diagram.service.js';
import { normalizeSportId } from '../../modules/agent/tools/integrations/play-diagram/sport-normalization.js';
import { syncPlaybookDiagramAsset } from '../../modules/agent/tools/intel/team/playbook-diagram-asset.util.js';
import type {
  BoardDiagramAsset,
  BoardDiagramKind,
} from '../../modules/agent/tools/integrations/board-diagram/shared/board-diagram.types.js';

type AuthenticatedRequest = Request & {
  user?: {
    uid?: string;
  };
};

type ErrorWithCode = Error & {
  code?: string;
};

type TimestampLike = {
  toMillis(): number;
};

type RepeatableJobDescriptor = {
  key: string;
  next?: number | null;
  tz?: string;
};

type FirestoreDocLike = {
  id: string;
  data(): Record<string, unknown>;
};

type FilmReviewFirestore = {
  collection(name: string): {
    doc(id: string): {
      update(payload: Record<string, unknown>): Promise<unknown>;
    };
  };
};

type FilmReviewTimelineProgressUpdate = {
  readonly processedWindowCount: number;
  readonly totalWindows: number;
  readonly playCount: number;
  readonly timeline: readonly TeamFilmReviewPlaySegment[];
};

type FilmReviewTimelineGenerationOptions = {
  readonly operationId: string;
  readonly userId: string;
  readonly filmReviewId: string;
  readonly onWindowComplete?: (update: FilmReviewTimelineProgressUpdate) => Promise<void>;
};

type FirestoreReadDocSnapshot = {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
};

type FirestoreReadDb = {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<FirestoreReadDocSnapshot>;
    };
  };
};

const router = Router();
const RECURRING_TASKS_COLLECTION = 'RecurringTasks' as const;
const TEAM_GAMEPLANS_COLLECTION = 'TeamGamePlans' as const;
const TEAM_FILM_REVIEWS_COLLECTION = 'TeamFilmReviews' as const;
const TEAMS_COLLECTION = 'Teams' as const;
const MAX_STRENGTH_WEAKNESS_ITEMS = 50;
const MB = 1024 * 1024;

function resolveFilmReviewBreakdownProvider(
  fileName: string,
  mimeType: string
): TeamFilmReviewBreakdownSource['provider'] {
  const normalizedName = fileName.trim().toLowerCase();
  if (normalizedName.endsWith('.xlsx')) return 'hudl';
  if (normalizedName.endsWith('.csv') || mimeType === 'text/csv') return 'csv';
  return 'manual_import';
}
const GB = 1024 * MB;
const VIDEO_UPLOAD_URL_TTL_MS_SMALL = 30 * 60 * 1000;
const VIDEO_UPLOAD_URL_TTL_MS_MEDIUM = 60 * 60 * 1000;
const VIDEO_UPLOAD_URL_TTL_MS_LARGE = 120 * 60 * 1000;
const CONFIGURED_TIMELINE_WINDOW_CONCURRENCY = parsePositiveIntEnv(
  process.env['AGENT_X_TIMELINE_WINDOW_CONCURRENCY']
);
const TIMELINE_WINDOW_CONCURRENCY = Math.min(CONFIGURED_TIMELINE_WINDOW_CONCURRENCY ?? 3, 4);
const MAX_FILM_REVIEW_ANNOTATION_STROKES = 24;
const MAX_FILM_REVIEW_ANNOTATION_POINTS = 1200;
const MAX_FILM_REVIEW_COMPACT_POINTS = 120;
const INVALID_FILM_REVIEW_PLAY_ANNOTATION = Symbol('invalid-film-review-play-annotation');

const DIAGRAM_ASSET_KIND_VALUES = [
  'sport_play',
  'sport_drill',
] as const satisfies readonly BoardDiagramKind[];
const DIAGRAM_FIELD_STYLE_VALUES = ['classic', 'modern', 'night', 'blueprint', 'chalk'] as const;
const DIAGRAM_ROUTE_TYPE_VALUES = [
  'screen',
  'pick',
  'block',
  'cut',
  'drag',
  'space',
  'go',
  'fade',
] as const;
const DIAGRAM_ZONE_SHAPE_VALUES = ['ellipse', 'rect', 'text'] as const;
const DIAGRAM_PLAYER_SHAPE_VALUES = ['circle', 'square', 'diamond', 'triangle'] as const;
const hexColorRegex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const diagramPointSchema = z.tuple([z.number().finite(), z.number().finite()]);
const diagramPlayerSchema = z.object({
  id: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(40),
  x: z.number().finite(),
  y: z.number().finite(),
  team: z.enum(['offense', 'defense']),
  shape: z.enum(DIAGRAM_PLAYER_SHAPE_VALUES).optional(),
});
const diagramRouteSchema = z.object({
  id: z.string().trim().min(1).max(60).optional(),
  from: z.string().trim().min(1).max(60),
  points: z.array(diagramPointSchema).min(2).max(32),
  label: z.string().trim().max(80).optional(),
  type: z.enum(DIAGRAM_ROUTE_TYPE_VALUES).optional(),
  curve: z.boolean().optional(),
  color: z.string().regex(hexColorRegex, 'Route color must be a hex value').optional(),
  strokeDasharray: z.string().trim().max(30).optional(),
  opacity: z.number().min(0.15).max(1).optional(),
});
const diagramZoneSchema = z.object({
  id: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(60),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(20),
  height: z.number().finite().min(20),
  shape: z.enum(DIAGRAM_ZONE_SHAPE_VALUES).optional(),
  team: z.enum(['offense', 'defense']).optional(),
});
const diagramLayoutSchema = z.object({
  sport: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(120),
  fieldWidth: z.number().finite().min(300).max(1200),
  fieldHeight: z.number().finite().min(220).max(900),
  losY: z.number().finite().min(0).max(900),
  fieldStyle: z.enum(DIAGRAM_FIELD_STYLE_VALUES).optional(),
  players: z.array(diagramPlayerSchema).min(1).max(40),
  routes: z.array(diagramRouteSchema).max(64),
  zones: z.array(diagramZoneSchema).max(24).optional(),
});
const diagramAssetPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    sourceLayout: diagramLayoutSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

function toDiagramAssetSummary(asset: BoardDiagramAsset): Record<string, unknown> {
  return {
    id: asset.id,
    kind: asset.kind,
    sport: asset.sport,
    title: asset.title,
    description: asset.description,
    imageUrl: asset.imageUrl,
    ...(asset.storagePath ? { storagePath: asset.storagePath } : {}),
    ...(asset.svgUrl ? { svgUrl: asset.svgUrl } : {}),
    ...(asset.svgStoragePath ? { svgStoragePath: asset.svgStoragePath } : {}),
    ...(asset.editUrl ? { editUrl: asset.editUrl } : {}),
    threadId: asset.threadId,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

function toDiagramAssetDetail(asset: BoardDiagramAsset): Record<string, unknown> {
  let svgContent: string | undefined;

  try {
    if (asset.assetSource !== 'external_image' && asset.sourceLayout) {
      svgContent = renderBoardDiagramSvg(asset.sourceLayout, asset.kind);
    }
  } catch (error) {
    logger.error('Failed to render diagram SVG detail', {
      assetId: asset.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    ...toDiagramAssetSummary(asset),
    ...(asset.xmlContent ? { xmlContent: asset.xmlContent } : {}),
    ...(asset.sourceLayout ? { sourceLayout: asset.sourceLayout } : {}),
    ...(svgContent ? { svgContent } : {}),
  };
}

function normalizeDiagramSportFilter(input: unknown): string | null {
  const value = normalizeString(input);
  if (!value) return null;
  return normalizeBaseSportKey(value) || value.toLowerCase();
}

function formatSizeLabel(bytes: number): string {
  if (bytes >= GB) {
    const value = bytes / GB;
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} GB`;
  }
  return `${Math.round(bytes / MB)} MB`;
}

type FilmReviewDeleteFailure = {
  readonly target: 'cloudflare' | 'firebase';
  readonly message: string;
};

type FirebaseBucketLike = {
  readonly name: string;
  file(path: string): {
    delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
  };
};

async function deleteCloudflareFilmReviewVideo(
  cloudflareVideoId: string,
  metadata: {
    readonly filmReviewId: string;
    readonly teamId: string;
    readonly userId: string;
  }
): Promise<FilmReviewDeleteFailure | null> {
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
  const apiToken = process.env['CLOUDFLARE_API_TOKEN'];

  if (!accountId || !apiToken) {
    return {
      target: 'cloudflare',
      message: 'Cloudflare deletion is not configured (missing CLOUDFLARE_ACCOUNT_ID/API_TOKEN).',
    };
  }

  try {
    const response = await fetch(
      `${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/stream/${cloudflareVideoId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok || response.status === 404) {
      logger.info('Film review Cloudflare Stream asset deleted', {
        ...metadata,
        cloudflareVideoId,
        status: response.status,
      });
      return null;
    }

    let details = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as {
        errors?: Array<{ message?: string }>;
        messages?: Array<{ message?: string }>;
      };
      const msg = payload.errors?.[0]?.message ?? payload.messages?.[0]?.message;
      if (msg) details = msg;
    } catch {
      // ignore JSON parsing errors and fall back to status
    }

    return {
      target: 'cloudflare',
      message: `Cloudflare deletion failed for ${cloudflareVideoId}: ${details}`,
    };
  } catch (error) {
    return {
      target: 'cloudflare',
      message:
        error instanceof Error
          ? `Cloudflare deletion failed for ${cloudflareVideoId}: ${error.message}`
          : `Cloudflare deletion failed for ${cloudflareVideoId}`,
    };
  }
}

async function deleteFirebaseFilmReviewVideo(
  bucket: FirebaseBucketLike,
  storagePath: string,
  metadata: {
    readonly filmReviewId: string;
    readonly teamId: string;
    readonly userId: string;
  }
): Promise<FilmReviewDeleteFailure | null> {
  try {
    const file = bucket.file(storagePath) as {
      delete: (options?: { ignoreNotFound?: boolean }) => Promise<unknown>;
    };
    await file.delete({ ignoreNotFound: true });
    logger.info('Film review Firebase Storage asset deleted', {
      ...metadata,
      storagePath,
      bucket: bucket.name,
    });
    return null;
  } catch (error) {
    return {
      target: 'firebase',
      message:
        error instanceof Error
          ? `Firebase deletion failed for ${storagePath}: ${error.message}`
          : `Firebase deletion failed for ${storagePath}`,
    };
  }
}

function parsePositiveIntEnv(input: string | undefined): number | null {
  if (!input) return null;
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function resolveVideoUploadUrlTtlMs(fileSize: number): number {
  const configuredTtlMs = parsePositiveIntEnv(process.env['AGENT_X_VIDEO_UPLOAD_URL_TTL_MS']);
  if (configuredTtlMs) return configuredTtlMs;

  if (fileSize <= 250 * MB) return VIDEO_UPLOAD_URL_TTL_MS_SMALL;
  if (fileSize <= GB) return VIDEO_UPLOAD_URL_TTL_MS_MEDIUM;
  return VIDEO_UPLOAD_URL_TTL_MS_LARGE;
}

function parsePositiveInt(input: unknown, fallback: number, max: number): number {
  const value = typeof input === 'string' ? Number(input) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function normalizeString(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const value = input.trim();
  return value.length > 0 ? value : undefined;
}

function normalizeImpactLevel(input: unknown): TeamGamePlanPriorityLevel {
  const value = normalizeString(input)?.toLowerCase();
  if (value === 'must_win' || value === 'must win') return 'must_win';
  if (value === 'high') return 'high';
  if (value === 'medium' || value === 'med') return 'medium';
  return 'medium';
}

function normalizeStrengthWeaknessSide(input: unknown): 'own' | 'opponent' {
  const value = normalizeString(input)?.toLowerCase();
  if (value === 'opponent' || value === 'their' || value === 'them') return 'opponent';
  return 'own';
}

function normalizeStrengthWeaknessType(input: unknown): 'strength' | 'weakness' {
  const value = normalizeString(input)?.toLowerCase();
  if (value === 'weakness' || value === 'risk' || value === 'liability') return 'weakness';
  return 'strength';
}

function inferTypeFromLabel(label: string | undefined): 'strength' | 'weakness' | undefined {
  const value = normalizeString(label)?.toLowerCase();
  if (!value) return undefined;
  if (
    value.includes('weakness') ||
    value.includes('risk') ||
    value.includes('concern') ||
    value.includes('liability')
  ) {
    return 'weakness';
  }
  if (value.includes('strength') || value.includes('advantage')) {
    return 'strength';
  }
  return undefined;
}

function inferSideFromLabel(label: string | undefined): 'own' | 'opponent' | undefined {
  const value = normalizeString(label)?.toLowerCase();
  if (!value) return undefined;
  if (
    value.includes('opponent') ||
    value.includes('their ') ||
    value.startsWith('their') ||
    value.includes('test opponent')
  ) {
    return 'opponent';
  }
  if (value.includes('our ') || value.startsWith('our') || value.includes('own')) {
    return 'own';
  }
  return undefined;
}

function normalizeEvidenceType(input: unknown): TeamGamePlanEvidenceType {
  const value = normalizeString(input)?.toLowerCase();
  if (value === 'video' || value === 'diagram' || value === 'stat') return value;
  return 'note';
}

function slugifyLabel(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveStrengthWeaknessLabel(actionPlan: string | undefined): string | undefined {
  if (!actionPlan) return undefined;
  const value = actionPlan.replace(/\s+/g, ' ').trim();
  return value.length > 0 ? value.slice(0, 120) : undefined;
}

function normalizeStrengthsWeaknesses(
  input: unknown
): readonly TeamGamePlanStrengthWeaknessItem[] | undefined {
  if (!Array.isArray(input) || input.length === 0) return undefined;

  const normalized: TeamGamePlanStrengthWeaknessItem[] = [];

  for (const [index, candidate] of input.entries()) {
    if (!candidate || typeof candidate !== 'object') continue;
    const record = candidate as Record<string, unknown>;

    const explicitLabel = normalizeString(record['label'] ?? record['title'] ?? record['name']);
    const side =
      inferSideFromLabel(explicitLabel) ??
      normalizeStrengthWeaknessSide(record['side'] ?? record['team'] ?? record['perspectiveTeam']);
    const type =
      inferTypeFromLabel(explicitLabel) ??
      normalizeStrengthWeaknessType(record['type'] ?? record['kind'] ?? record['category']);
    const actionPlan = normalizeString(
      record['actionPlan'] ??
        record['plan'] ??
        record['recommendation'] ??
        record['content'] ??
        record['objective'] ??
        record['analysis'] ??
        record['note']
    );
    const label = explicitLabel ?? deriveStrengthWeaknessLabel(actionPlan);

    if (!label) continue;

    const evidenceObj =
      record['evidence'] && typeof record['evidence'] === 'object'
        ? (record['evidence'] as Record<string, unknown>)
        : undefined;
    const evidenceNote = normalizeString(evidenceObj?.['note'] ?? record['evidenceNote']);
    const evidenceUrl = normalizeString(evidenceObj?.['url'] ?? record['evidenceUrl']);
    const rawTags = Array.isArray(record['tags'])
      ? (record['tags'] as unknown[])
      : Array.isArray(record['keywords'])
        ? (record['keywords'] as unknown[])
        : undefined;
    const tags = rawTags?.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0);

    const id =
      normalizeString(record['id']) ??
      `${side}-${type}-${slugifyLabel(label).slice(0, 48)}-${String(index + 1).padStart(2, '0')}`;

    normalized.push({
      id,
      side,
      type,
      label,
      impactLevel: normalizeImpactLevel(
        record['impactLevel'] ?? record['level'] ?? record['impact'] ?? record['priority']
      ),
      ...(actionPlan ? { actionPlan } : {}),
      ...(evidenceNote || evidenceUrl
        ? {
            evidence: {
              type: normalizeEvidenceType(evidenceObj?.['type'] ?? record['evidenceType']),
              ...(evidenceNote ? { note: evidenceNote } : {}),
              ...(evidenceUrl ? { url: evidenceUrl } : {}),
            },
          }
        : {}),
      ...(tags && tags.length > 0 ? { tags } : {}),
    });

    if (normalized.length >= MAX_STRENGTH_WEAKNESS_ITEMS) break;
  }

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeBoolean(input: unknown): boolean | undefined {
  if (typeof input === 'boolean') return input;
  if (typeof input !== 'string') return undefined;

  const normalized = input.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

function toGameplanSummary(item: TeamGamePlanDoc): Record<string, unknown> {
  return {
    id: item.id,
    teamId: item.teamId,
    sport: item.sport,
    title: item.title,
    phase: item.phase,
    status: item.status,
    season: item.season,
    division: item.division,
    gameDate: item.gameDate,
    opponentId: item.opponentId,
    opponentName: item.opponentName,
    identityFocus: item.identityFocus,
    primaryAttackPlan: item.primaryAttackPlan,
    defensivePriorities: item.defensivePriorities,
    specialSituations: item.specialSituations,
    updatedAt: item.updatedAt,
    createdAt: item.createdAt,
    adjustmentTriggerCount: item.adjustmentTriggers?.length ?? 0,
    halftimePriorityCount: item.halftimePriorities?.length ?? 0,
    customSectionCount: item.customSections?.length ?? 0,
    linkedPlayCount: item.linkedPlays?.length ?? 0,
  };
}

function toFilmReviewSummary(item: TeamFilmReviewDoc): Record<string, unknown> {
  return {
    id: item.id,
    teamId: item.teamId,
    sport: item.sport,
    title: item.title,
    status: item.status,
    perspective: item.perspective,
    opponentName: item.opponentName,
    gameDate: item.gameDate,
    playlistId: item.playlistId ?? null,
    playlistName: item.playlistName ?? null,
    videoUrl: item.videoUrl,
    storagePath: item.storagePath,
    cloudflareVideoId: item.cloudflareVideoId,
    cloudflareStatus: item.cloudflareStatus,
    readyToStream: item.readyToStream,
    thumbnailUrl: item.thumbnailUrl,
    durationSec: item.durationSec,
    tagCount: item.aiTags?.length ?? 0,
    clipCount: item.clips?.length ?? 0,
    annotationCount: item.annotations?.length ?? 0,
    source: item.source,
    sourceUrl: item.sourceUrl,
    schemaVersion: item.schemaVersion,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    timelineState: item.timelineState,
    timeline: item.timeline,
    timelineGeneratedAt: item.timelineGeneratedAt,
    timelineError: item.timelineError,
    downloadPrewarm: item.downloadPrewarm,
    updatedAt: item.updatedAt,
    createdAt: item.createdAt,
  };
}

type SignedUrlBucket = {
  file(path: string): {
    getSignedUrl(options: { version: 'v4'; action: 'read'; expires: number }): Promise<[string]>;
  };
};

async function resolveFilmReviewVideoUrl(
  review: TeamFilmReviewDoc,
  bucket: SignedUrlBucket
): Promise<string> {
  const storagePath = review.storagePath?.trim();
  if (!storagePath) return review.videoUrl;

  try {
    const storageFile = bucket.file(storagePath) as {
      getSignedUrl(options: { version: 'v4'; action: 'read'; expires: number }): Promise<[string]>;
    };
    const [signedUrl] = await storageFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });
    return signedUrl;
  } catch {
    return review.videoUrl;
  }
}

function shouldRefreshFilmReviewCloudflareState(review: TeamFilmReviewDoc): boolean {
  if (!review.cloudflareVideoId?.trim()) return false;

  const streamReady = review.readyToStream === true;
  const cloudflareStatus = review.cloudflareStatus?.trim().toLowerCase();
  const downloadStatus = review.downloadPrewarm?.status?.trim().toLowerCase();
  const hasDownloadUrl = !!review.downloadPrewarm?.mp4Url?.trim();

  const streamNeedsRefresh = !streamReady || cloudflareStatus !== 'ready';
  const downloadNeedsRefresh = !hasDownloadUrl || downloadStatus !== 'ready';

  return streamNeedsRefresh || downloadNeedsRefresh;
}

function toDownloadPrewarmStatus(status: string): TeamFilmReviewDownloadPrewarmStatus {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'ready') return 'ready';
  if (normalized === 'error') return 'error';
  if (normalized === 'queued' || normalized === 'pending') return 'queued';
  if (normalized === 'inprogress' || normalized === 'processing') return 'processing';
  return 'unknown';
}

function normalizeDownloadPrewarm(
  status: string,
  now: string,
  percentComplete: number | null,
  mp4Url: string | null,
  requestedAt?: TeamFilmReviewDownloadPrewarm['requestedAt'],
  lastError?: string
): TeamFilmReviewDownloadPrewarm {
  return {
    status: toDownloadPrewarmStatus(status),
    ...(requestedAt ? { requestedAt } : {}),
    lastCheckedAt: now,
    ...(typeof percentComplete === 'number' ? { percentComplete } : {}),
    ...(mp4Url ? { mp4Url } : {}),
    ...(lastError ? { lastError } : {}),
  };
}

async function refreshFilmReviewCloudflareState(
  review: TeamFilmReviewDoc,
  db: FilmReviewFirestore
): Promise<TeamFilmReviewDoc> {
  if (!shouldRefreshFilmReviewCloudflareState(review)) return review;

  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
  const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
  if (!accountId || !apiToken || !review.cloudflareVideoId) return review;

  try {
    const finalized = await fetchCloudflareFinalizedVideo(
      review.createdBy,
      review.cloudflareVideoId,
      accountId,
      apiToken,
      process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE']
    );
    const now = new Date().toISOString();
    let downloadStatus = review.downloadPrewarm;
    try {
      let cloudflareDownload = await fetchCloudflareDownloadStatus(
        review.cloudflareVideoId,
        accountId,
        apiToken
      );

      if (!cloudflareDownload.url && cloudflareDownload.status !== 'ready') {
        cloudflareDownload = await requestCloudflareVideoDownloadRender(
          review.cloudflareVideoId,
          accountId,
          apiToken
        );
      }

      downloadStatus = normalizeDownloadPrewarm(
        cloudflareDownload.status,
        now,
        cloudflareDownload.percentComplete,
        cloudflareDownload.url,
        review.downloadPrewarm?.requestedAt ?? now
      );
    } catch (downloadError) {
      downloadStatus = normalizeDownloadPrewarm(
        review.downloadPrewarm?.status ?? 'error',
        now,
        review.downloadPrewarm?.percentComplete ?? null,
        review.downloadPrewarm?.mp4Url ?? null,
        review.downloadPrewarm?.requestedAt,
        downloadError instanceof Error ? downloadError.message : String(downloadError)
      );
    }

    const nextStatus: TeamFilmReviewStatus = finalized.readyToStream ? 'ready' : 'processing';
    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
      cloudflareStatus: finalized.status,
      readyToStream: finalized.readyToStream,
      downloadPrewarm: downloadStatus,
      updatedAt: now,
    };

    if (finalized.thumbnailUrl) updatePayload['thumbnailUrl'] = finalized.thumbnailUrl;
    if (finalized.durationSeconds !== null)
      updatePayload['durationSec'] = finalized.durationSeconds;

    await db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(review.id).update(updatePayload);

    return {
      ...review,
      status: nextStatus,
      cloudflareStatus: finalized.status,
      readyToStream: finalized.readyToStream,
      downloadPrewarm: downloadStatus,
      ...(finalized.thumbnailUrl ? { thumbnailUrl: finalized.thumbnailUrl } : {}),
      ...(finalized.durationSeconds !== null ? { durationSec: finalized.durationSeconds } : {}),
      updatedAt: updatePayload['updatedAt'] as string,
    };
  } catch (error) {
    logger.warn('Failed to refresh Cloudflare state for film review', {
      filmReviewId: review.id,
      cloudflareVideoId: review.cloudflareVideoId,
      error: error instanceof Error ? error.message : String(error),
    });
    return review;
  }
}

function parseSeconds(input: unknown): number | null {
  const value = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 1000) / 1000;
}

function parseNormalizedAnnotationCoordinate(input: unknown): number | null {
  const value = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(value)) return null;
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}

function parseFilmReviewAnnotationPoint(input: unknown): { x: number; y: number } | null {
  if (!input || typeof input !== 'object') return null;

  const candidate = input as Record<string, unknown>;
  const x = parseNormalizedAnnotationCoordinate(candidate['x']);
  const y = parseNormalizedAnnotationCoordinate(candidate['y']);

  return x === null || y === null ? null : { x, y };
}

function compactFilmReviewAnnotationPoints(
  points: readonly { x: number; y: number }[]
): readonly { x: number; y: number }[] {
  if (points.length <= MAX_FILM_REVIEW_COMPACT_POINTS) {
    return points;
  }

  const step = Math.max(1, Math.ceil(points.length / MAX_FILM_REVIEW_COMPACT_POINTS));
  return points.filter((_, index) => index % step === 0).slice(0, MAX_FILM_REVIEW_COMPACT_POINTS);
}

function computeFilmReviewAnnotationBounds(points: readonly { x: number; y: number }[]) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX: Number(minX.toFixed(3)),
    minY: Number(minY.toFixed(3)),
    maxX: Number(maxX.toFixed(3)),
    maxY: Number(maxY.toFixed(3)),
  };
}

function parseFilmReviewAnnotationPoints(
  input: unknown,
  maxPoints: number
): readonly { x: number; y: number }[] | null {
  if (!Array.isArray(input)) return null;

  const points: Array<{ x: number; y: number }> = [];
  for (const entry of input) {
    if (points.length >= maxPoints) break;

    const point = parseFilmReviewAnnotationPoint(entry);
    if (!point) return null;
    points.push(point);
  }

  return points.length > 0 ? points : null;
}

function parseFilmReviewPlayAnnotation(
  input: unknown
): TeamFilmReviewPlayAnnotation | null | typeof INVALID_FILM_REVIEW_PLAY_ANNOTATION {
  if (input === null) return null;
  if (!input || typeof input !== 'object') return INVALID_FILM_REVIEW_PLAY_ANNOTATION;

  const candidate = input as Record<string, unknown>;
  if (candidate['kind'] !== 'freehand') {
    return INVALID_FILM_REVIEW_PLAY_ANNOTATION;
  }

  const strokes: Array<readonly { x: number; y: number }[]> = [];
  let totalPoints = 0;

  if (Array.isArray(candidate['strokes'])) {
    for (const strokeInput of candidate['strokes'].slice(0, MAX_FILM_REVIEW_ANNOTATION_STROKES)) {
      const remainingPoints = MAX_FILM_REVIEW_ANNOTATION_POINTS - totalPoints;
      if (remainingPoints <= 0) break;

      const stroke = parseFilmReviewAnnotationPoints(strokeInput, remainingPoints);
      if (!stroke) return INVALID_FILM_REVIEW_PLAY_ANNOTATION;

      strokes.push(stroke);
      totalPoints += stroke.length;
    }
  }

  if (strokes.length === 0) {
    const fallbackPoints = parseFilmReviewAnnotationPoints(
      candidate['points'],
      MAX_FILM_REVIEW_ANNOTATION_POINTS
    );

    if (!fallbackPoints) {
      return INVALID_FILM_REVIEW_PLAY_ANNOTATION;
    }

    strokes.push(fallbackPoints);
  }

  const flattenedPoints = strokes.flat();
  if (flattenedPoints.length === 0) {
    return INVALID_FILM_REVIEW_PLAY_ANNOTATION;
  }

  const activeFromSec = parseSeconds(candidate['activeFromSec']);
  const activeUntilSec = parseSeconds(candidate['activeUntilSec']);
  const timingWindow =
    activeFromSec !== null && activeUntilSec !== null && activeUntilSec > activeFromSec
      ? { activeFromSec, activeUntilSec }
      : activeFromSec !== null
        ? { activeFromSec }
        : activeUntilSec !== null
          ? { activeUntilSec }
          : {};

  return {
    kind: 'freehand',
    bounds: computeFilmReviewAnnotationBounds(flattenedPoints),
    strokeCount: strokes.length,
    points: compactFilmReviewAnnotationPoints(flattenedPoints),
    ...timingWindow,
  } satisfies TeamFilmReviewPlayAnnotation;
}

function isTeamFilmReviewStatus(input: unknown): input is TeamFilmReviewStatus {
  return ['draft', 'processing', 'ready', 'archived'].includes(String(input));
}

function isTeamFilmReviewPerspective(input: unknown): input is TeamFilmReviewPerspective {
  return ['own_team', 'opponent', 'neutral'].includes(String(input));
}

function parseFilmReviewTimelineSegments(
  input: unknown,
  sport?: string | null
): readonly TeamFilmReviewPlaySegment[] | null {
  if (!Array.isArray(input)) return null;

  const timeline = input.map((entry, index) => {
    if (!entry || typeof entry !== 'object') return null;

    const candidate = entry as Record<string, unknown>;
    const label = normalizeString(candidate['label']);
    const startSec = parseSeconds(candidate['startSec']);
    const endSec = parseSeconds(candidate['endSec']);

    if (!label || startSec === null || endSec === null || endSec < startSec) {
      return null;
    }

    const rawNumber = typeof candidate['number'] === 'number' ? candidate['number'] : Number.NaN;
    const number = Number.isFinite(rawNumber) && rawNumber > 0 ? Math.floor(rawNumber) : index + 1;
    const id = normalizeString(candidate['id']) ?? `play-${number}`;
    const confidence =
      typeof candidate['confidence'] === 'number' && Number.isFinite(candidate['confidence'])
        ? candidate['confidence']
        : undefined;
    const tags = normalizeTimelineTagRecord(candidate, sport);
    const hasAnnotation = Object.prototype.hasOwnProperty.call(candidate, 'annotation');
    const annotation = hasAnnotation
      ? parseFilmReviewPlayAnnotation(candidate['annotation'])
      : undefined;

    if (annotation === INVALID_FILM_REVIEW_PLAY_ANNOTATION) {
      return null;
    }

    return {
      id,
      number,
      label,
      startSec,
      endSec,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(annotation !== undefined ? { annotation } : {}),
      ...(tags ? { tags } : {}),
    } satisfies TeamFilmReviewPlaySegment;
  });

  return timeline.every((entry) => entry !== null) ? timeline : null;
}

function buildSyntheticFilmReviewAi(
  review: TeamFilmReviewDoc
): Pick<TeamFilmReviewDoc, 'aiSummary' | 'aiTags' | 'keyInsights'> {
  const duration = Math.max(review.durationSec ?? 0, 1);
  const quarter = Math.max(Math.floor(duration / 4), 10);

  const labels: readonly {
    readonly label: string;
    readonly category: TeamFilmReviewTagCategory;
  }[] = [
    { label: 'Opening Sequence', category: 'execution' },
    { label: 'Transition Window', category: 'transition' },
    { label: 'Defensive Pressure', category: 'defense' },
    { label: 'Late-Game Decisions', category: 'decision' },
  ];

  const aiTags: TeamFilmReviewTimelineTag[] = labels.map((item, index) => {
    const startSec = index * quarter;
    const endSec = Math.min(startSec + quarter, duration);
    return {
      id: `tag_${index + 1}`,
      label: item.label,
      category: item.category,
      startSec,
      endSec,
      confidence: 0.8,
      notes: `Agent X auto-tagged this sequence for ${item.label.toLowerCase()}.`,
    };
  });

  const keyInsights = [
    'Momentum shifts were strongest in transition windows.',
    'Execution quality dropped under late-clock pressure.',
    'Defensive communication improved after halftime adjustments.',
  ] as const;

  return {
    aiSummary:
      'Agent X identified core momentum swings, decision quality patterns, and defensive communication trends across this film session.',
    aiTags,
    keyInsights,
  };
}

function extractJsonPayload(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function buildTimelineTagSchemaDescriptor(definition: TeamFilmReviewSportTagDefinition): string {
  const options = definition.options?.length ? ` options: ${definition.options.join('/')}.` : '';
  const description = definition.description ? ` ${definition.description}` : '';
  return `${definition.id} (${definition.label}) => ${definition.valueType}.${options}${description}`;
}

function buildTimelineTagJsonShape(tagSchema: readonly TeamFilmReviewSportTagDefinition[]): string {
  return `{${tagSchema
    .map((definition) => {
      const valueType = definition.valueType === 'number' ? 'number|null' : 'string|null';
      return `"${definition.id}":"${valueType}"`;
    })
    .join(',')}}`;
}

function normalizeTimelineTagValue(
  input: unknown,
  definition: TeamFilmReviewSportTagDefinition
): TeamFilmReviewPlayTagValue | undefined {
  if (input === null) return null;

  switch (definition.valueType) {
    case 'number': {
      if (typeof input === 'number' && Number.isFinite(input)) {
        return Math.round(input * 1000) / 1000;
      }

      if (typeof input === 'string') {
        const match = input.match(/-?\d+(?:\.\d+)?/);
        if (!match) return undefined;
        const parsed = Number(match[0]);
        return Number.isFinite(parsed) ? Math.round(parsed * 1000) / 1000 : undefined;
      }

      return undefined;
    }
    case 'boolean': {
      if (typeof input === 'boolean') return input;
      if (typeof input !== 'string') return undefined;
      const normalized = input.trim().toLowerCase();
      if (['true', 'yes', 'y'].includes(normalized)) return true;
      if (['false', 'no', 'n'].includes(normalized)) return false;
      return undefined;
    }
    case 'enum':
      if (typeof input !== 'string' && typeof input !== 'number' && typeof input !== 'boolean') {
        return undefined;
      }

      if (!definition.options?.length) return undefined;

      return definition.options.find(
        (option) => option.toLowerCase() === String(input).trim().toLowerCase()
      );
    case 'string': {
      if (typeof input !== 'string' && typeof input !== 'number' && typeof input !== 'boolean') {
        return undefined;
      }

      const normalized = String(input).trim();
      if (!normalized) return undefined;
      return normalized;
    }
    default:
      return undefined;
  }
}

function normalizeTimelineTagRecord(
  play: Record<string, unknown>,
  sport?: string | null
): Readonly<Record<string, TeamFilmReviewPlayTagValue>> | undefined {
  const tagSchema = getTeamFilmReviewSportTagDefinitions(sport);
  if (!tagSchema.length) return undefined;

  const rawTags =
    play['tags'] && typeof play['tags'] === 'object' && !Array.isArray(play['tags'])
      ? (play['tags'] as Record<string, unknown>)
      : play;

  const normalizedEntries = tagSchema.flatMap((definition) => {
    const normalizedValue = normalizeTimelineTagValue(rawTags[definition.id], definition);
    return normalizedValue === undefined ? [] : ([[definition.id, normalizedValue]] as const);
  });

  if (normalizedEntries.length === 0) return undefined;

  return Object.fromEntries(normalizedEntries) as Readonly<
    Record<string, TeamFilmReviewPlayTagValue>
  >;
}

function parseAiTimelineSeconds(input: unknown): number | null {
  if (typeof input === 'number') {
    return Number.isFinite(input) && input >= 0 ? Math.round(input * 1000) / 1000 : null;
  }

  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value) return null;

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.round(numeric * 1000) / 1000;
  }

  const timeParts = value.split(':').map((part) => Number(part.trim()));
  if (
    timeParts.length >= 2 &&
    timeParts.length <= 3 &&
    timeParts.every((part) => Number.isFinite(part) && part >= 0)
  ) {
    const seconds =
      timeParts.length === 3
        ? timeParts[0]! * 3600 + timeParts[1]! * 60 + timeParts[2]!
        : timeParts[0]! * 60 + timeParts[1]!;
    return Math.round(seconds * 1000) / 1000;
  }

  return null;
}

function getAiTimelineArray(parsed: unknown): readonly unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed !== 'object' || parsed === null) return [];

  const payload = parsed as Record<string, unknown>;
  if (Array.isArray(payload['plays'])) return payload['plays'];
  if (Array.isArray(payload['timeline'])) return payload['timeline'];
  if (Array.isArray(payload['segments'])) return payload['segments'];
  if (Array.isArray(payload['events'])) return payload['events'];

  return [];
}

const TIMELINE_LABEL_EXAMPLES: Readonly<
  Record<TeamFilmReviewSportTagSchemaKey, readonly string[]>
> = {
  football: ['QB dropback pass left', 'Outside zone run right', 'Blitz pickup checkdown'],
  basketball: [
    'Pick and roll finishing at rim',
    'Wing catch and shoot 3-pointer',
    'Transition fast break layup',
  ],
  baseball: ['Ground ball double play', 'Fly out to center field', 'Strikeout swinging'],
  softball: ['Ground ball force out', 'Line drive to left field', 'Strikeout looking'],
  soccer: [
    'Build up play from back',
    'Cross into box from right wing',
    'High press turnover in final third',
  ],
  lacrosse: ['Dodge from X and feed inside', 'Ride caused turnover', 'Man-up finish crease side'],
  volleyball: ['Outside attack block out', 'Quick set middle kill', 'Serve receive error'],
  wrestling: ['Single leg finish', 'Sprawl and go behind', 'Escape to neutral'],
  field_hockey: ['Circle entry from right', 'Penalty corner shot', 'Press break outlet'],
  hockey: ['Neutral zone turnover', 'Slot shot off cycle', 'Defensive zone clear'],
  generic: ['Primary attacking sequence', 'Defensive recovery sequence', 'Momentum swing play'],
};

const TIMELINE_LABEL_LEAK_PATTERNS: Readonly<
  Partial<Record<TeamFilmReviewSportTagSchemaKey, readonly RegExp[]>>
> = {
  football: [
    /\b(qb|quarterback|touchdown|snap|handoff|checkdown|blitz|punt|kickoff|field goal)\b/i,
  ],
  basketball: [
    /\b(3-?pointer|three-?pointer|layup|dunk|pick and roll|catch and shoot|free throw|rebound|paint)\b/i,
  ],
  baseball: [
    /\b(home run|double play|fly out|ground ball|strikeout|fastball|curveball|shortstop|center field)\b/i,
  ],
  softball: [
    /\b(home run|double play|fly out|ground ball|strikeout|fastball|curveball|shortstop|center field)\b/i,
  ],
  soccer: [
    /\b(cross into box|corner kick|penalty box|final third|through ball|offside|goal kick|header)\b/i,
  ],
  lacrosse: [/\b(crease|ride|clear|man-up|stick check|dodge from x|faceoff)\b/i],
  volleyball: [/\b(kill|serve receive|setter|middle attack|dig|ace|sideout)\b/i],
  wrestling: [/\b(takedown|reversal|near fall|escape|sprawl|single leg|double leg)\b/i],
  field_hockey: [/\b(penalty corner|circle entry|stick tackle|scoop|press break)\b/i],
  hockey: [/\b(faceoff|blue line|slot shot|power play|penalty kill|puck|wrister)\b/i],
};

function buildTimelineLabelExamples(sport?: string | null): string {
  const schemaKey = resolveTeamFilmReviewSportTagSchemaKey(sport);
  return (TIMELINE_LABEL_EXAMPLES[schemaKey] ?? TIMELINE_LABEL_EXAMPLES['generic'])
    .map((example) => `"${example}"`)
    .join(', ');
}

function sanitizeTimelineLabel(label: string, index: number, sport?: string | null): string {
  const normalizedLabel = label.replace(/\s+/g, ' ').trim();
  if (!normalizedLabel) return `Sequence ${index + 1}`;

  const schemaKey = resolveTeamFilmReviewSportTagSchemaKey(sport);
  if (schemaKey === 'generic') return normalizedLabel;

  const leakedSport = Object.entries(TIMELINE_LABEL_LEAK_PATTERNS).find(([candidate, patterns]) => {
    if (!patterns?.length || candidate === schemaKey) return false;
    if (
      (schemaKey === 'baseball' && candidate === 'softball') ||
      (schemaKey === 'softball' && candidate === 'baseball')
    ) {
      return false;
    }

    return patterns.some((pattern) => pattern.test(normalizedLabel));
  });

  return leakedSport ? `Sequence ${index + 1}` : normalizedLabel;
}

function buildFallbackTimelineSegments(durationSec: number): readonly TeamFilmReviewPlaySegment[] {
  const normalizedDuration = Math.max(1, Math.floor(durationSec));

  // Keep fallback segmentation readable while ensuring full timeline coverage.
  const targetSegmentLengthSec = Math.max(20, Math.min(75, Math.floor(normalizedDuration / 10)));
  const segmentCount = Math.max(
    1,
    Math.min(24, Math.ceil(normalizedDuration / Math.max(1, targetSegmentLengthSec)))
  );
  const segmentLengthSec = Math.max(1, Math.ceil(normalizedDuration / segmentCount));

  const segments: TeamFilmReviewPlaySegment[] = [];
  let startSec = 0;

  for (let index = 0; index < segmentCount && startSec < normalizedDuration; index++) {
    const endSec = Math.min(normalizedDuration, startSec + segmentLengthSec);
    segments.push({
      id: `play-${index + 1}`,
      number: index + 1,
      label: `Sequence ${index + 1}`,
      startSec,
      endSec: Math.max(startSec + 1, endSec),
      confidence: 0.35,
    });
    startSec = endSec;
  }

  return segments;
}

function truncateTimelinePreview(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, 280);
}

function parseAiTimelineResponse(
  rawContent: string,
  durationSec: number,
  sport?: string | null
): readonly TeamFilmReviewPlaySegment[] {
  const payloadText = extractJsonPayload(rawContent);
  if (!payloadText) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadText);
  } catch {
    return [];
  }

  const plays = getAiTimelineArray(parsed);

  const normalized = plays
    .map((value, index) => {
      if (typeof value !== 'object' || value === null) return null;
      const play = value as Record<string, unknown>;
      const rawLabel = typeof play['label'] === 'string' ? play['label'] : `Sequence ${index + 1}`;
      const label = sanitizeTimelineLabel(rawLabel, index, sport);
      const startSec =
        parseAiTimelineSeconds(play['startSec']) ??
        parseAiTimelineSeconds(play['start']) ??
        parseAiTimelineSeconds(play['startTime']);
      const endSec =
        parseAiTimelineSeconds(play['endSec']) ??
        parseAiTimelineSeconds(play['end']) ??
        parseAiTimelineSeconds(play['endTime']);
      const confidenceRaw =
        typeof play['confidence'] === 'number'
          ? play['confidence']
          : typeof play['confidenceScore'] === 'number'
            ? play['confidenceScore']
            : Number.NaN;

      if (startSec === null || endSec === null) return null;

      const normalizedStart = Math.max(0, Math.min(startSec, durationSec));
      const normalizedEnd = Math.max(normalizedStart + 1, Math.min(endSec, durationSec));
      const confidence = Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(1, confidenceRaw))
        : undefined;
      const tags = normalizeTimelineTagRecord(play, sport);

      return {
        id: `play-${index + 1}`,
        number: index + 1,
        label,
        startSec: Math.round(normalizedStart * 1000) / 1000,
        endSec: Math.round(normalizedEnd * 1000) / 1000,
        ...(confidence !== undefined ? { confidence } : {}),
        ...(tags ? { tags } : {}),
      } as TeamFilmReviewPlaySegment;
    })
    .filter((play): play is TeamFilmReviewPlaySegment => play !== null)
    .sort((a, b) => a.startSec - b.startSec)
    .slice(0, 220);

  return normalized;
}

async function analyzeTimelineWindowWithRetry(
  geminiFiles: GeminiFilesService,
  sourceVideoUrl: string,
  review: TeamFilmReviewDoc,
  durationSec: number,
  chunkStartSec: number,
  chunkEndSec: number,
  operationId: string,
  windowIndex: number,
  totalWindows: number,
  analysisOptions: GeminiVideoAnalysisOptions
): Promise<readonly TeamFilmReviewPlaySegment[]> {
  const basePrompt = buildTimelineAnalysisPrompt(
    durationSec,
    chunkStartSec,
    chunkEndSec,
    review.sport
  );
  const prompts = [
    basePrompt,
    `${basePrompt} CRITICAL: Return a JSON object with a non-empty plays array. Use numeric seconds for startSec and endSec only. Do not use prose.`,
  ] as const;

  for (let attempt = 0; attempt < prompts.length; attempt++) {
    const analysis = await geminiFiles.analyzeVideoFromUrl(
      sourceVideoUrl,
      prompts[attempt]!,
      4096,
      {
        ...analysisOptions,
        operationId: `${operationId}:timeline:${windowIndex + 1}/${totalWindows}:attempt:${attempt + 1}`,
      }
    );

    const rawContent = analysis.content?.trim() ?? '';
    if (!rawContent) {
      logger.warn('Gemini timeline window returned empty content', {
        operationId,
        windowIndex: windowIndex + 1,
        totalWindows,
        attempt: attempt + 1,
        outputTokens: analysis.usage?.outputTokens,
        finishReason: analysis.finishReason,
      });
      continue;
    }

    const parsedWindowSegments = parseAiTimelineResponse(
      rawContent,
      durationSec,
      review.sport
    ).filter(
      (play) => play.startSec <= chunkEndSec + 30 && play.endSec >= Math.max(0, chunkStartSec - 30)
    );

    if (parsedWindowSegments.length > 0) {
      return parsedWindowSegments;
    }

    logger.warn('Gemini timeline window returned unparsable or empty plays', {
      operationId,
      windowIndex: windowIndex + 1,
      totalWindows,
      attempt: attempt + 1,
      outputTokens: analysis.usage?.outputTokens,
      finishReason: analysis.finishReason,
      responsePreview: truncateTimelinePreview(rawContent),
    });
  }

  return [];
}

function buildFilmReviewTimelineCacheOptions(
  userId: string,
  filmReviewId: string
): GeminiVideoAnalysisOptions {
  return {
    userId,
    contextCacheScopeId: `film-review:${filmReviewId}`,
    enableContextCache: true,
  };
}

function mergeTimelineSegments(
  plays: readonly TeamFilmReviewPlaySegment[],
  durationSec: number
): readonly TeamFilmReviewPlaySegment[] {
  const dedupStartToleranceSec = 2;
  const dedupEndToleranceSec = 3;

  const sorted = [...plays].sort((a, b) => a.startSec - b.startSec);
  const merged: TeamFilmReviewPlaySegment[] = [];

  for (const play of sorted) {
    const clampedStart = Math.max(0, Math.min(play.startSec, durationSec));
    const clampedEnd = Math.max(clampedStart + 1, Math.min(play.endSec, durationSec));

    const normalizedPlay: TeamFilmReviewPlaySegment = {
      ...play,
      startSec: Math.round(clampedStart * 1000) / 1000,
      endSec: Math.round(clampedEnd * 1000) / 1000,
    };

    const previous = merged[merged.length - 1];
    if (
      previous &&
      Math.abs(previous.startSec - normalizedPlay.startSec) <= dedupStartToleranceSec &&
      Math.abs(previous.endSec - normalizedPlay.endSec) <= dedupEndToleranceSec
    ) {
      continue;
    }

    merged.push(normalizedPlay);
  }

  const labelCounts = new Map<string, number>();

  return merged.map((play, index) => {
    const baseLabel = play.label.trim().length > 0 ? play.label.trim() : `Play ${index + 1}`;
    const normalizedLabel = baseLabel.toLowerCase();
    const nextCount = (labelCounts.get(normalizedLabel) ?? 0) + 1;
    labelCounts.set(normalizedLabel, nextCount);

    return {
      ...play,
      id: `play-${index + 1}`,
      number: index + 1,
      label: nextCount > 1 ? `${baseLabel} (${nextCount})` : baseLabel,
    };
  });
}

function buildTimelineAnalysisPrompt(
  durationSec: number,
  chunkStartSec: number,
  chunkEndSec: number,
  sport?: string | null
): string {
  const tagSchema = getTeamFilmReviewSportTagDefinitions(sport);
  const tagSchemaDescriptor = tagSchema.map(buildTimelineTagSchemaDescriptor).join(' ');
  const tagJsonShape = buildTimelineTagJsonShape(tagSchema);
  const examples = buildTimelineLabelExamples(sport);

  return [
    'Analyze this game film and segment the specified time window into discrete plays.',
    `Sport context: ${sport?.trim() || 'generic field/court sport'}.`,
    `Only include plays whose primary action begins between ${chunkStartSec} and ${chunkEndSec} seconds.`,
    'Return only valid JSON, no markdown, no commentary.',
    'Use this exact schema:',
    `{"plays":[{"label":"string","startSec":number,"endSec":number,"confidence":number,"tags":${tagJsonShape}}]}`,
    `Global constraints: startSec >= 0, endSec <= ${durationSec}, endSec > startSec, confidence between 0 and 1.`,
    'Use absolute game timestamps in seconds (not relative chunk timestamps).',
    'Populate every tags object with the sport-specific keys above. Use null when a value is not visible or cannot be inferred confidently.',
    `Sport-specific tag guide: ${tagSchemaDescriptor}`,
    'Do not use terminology, play names, scoring outcomes, or jargon from any other sport.',
    'Prefer one play per sequence and concise labels.',
    `Make labels distinct across plays by including the primary action and context (for example: ${examples}).`,
    'Avoid repeating the exact same label for multiple different segments unless the action is truly identical in structure and outcome.',
  ].join(' ');
}

function computeTimelineWindows(
  durationSec: number
): readonly { startSec: number; endSec: number }[] {
  if (durationSec <= 0) return [];

  const chunkDurationSec = 15 * 60;
  const chunkOverlapSec = 10;

  if (durationSec <= chunkDurationSec) {
    return [{ startSec: 0, endSec: durationSec }];
  }

  const windows: { startSec: number; endSec: number }[] = [];
  let startSec = 0;

  while (startSec < durationSec) {
    const endSec = Math.min(durationSec, startSec + chunkDurationSec);
    windows.push({ startSec, endSec });
    if (endSec >= durationSec) break;
    startSec = Math.max(0, endSec - chunkOverlapSec);
  }

  return windows;
}

async function runTimelineWindowsWithConcurrency(
  windows: readonly { startSec: number; endSec: number }[],
  concurrency: number,
  worker: (window: { startSec: number; endSec: number }, index: number) => Promise<void>
): Promise<void> {
  let nextWindowIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), windows.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextWindowIndex < windows.length) {
        const windowIndex = nextWindowIndex;
        nextWindowIndex += 1;

        const window = windows[windowIndex];
        if (!window) continue;
        await worker(window, windowIndex);
      }
    })
  );
}

async function buildAiFilmReviewTimeline(
  review: TeamFilmReviewDoc,
  sourceVideoUrl: string,
  options: FilmReviewTimelineGenerationOptions
): Promise<readonly TeamFilmReviewPlaySegment[]> {
  if (!GeminiFilesService.isConfigured()) {
    throw new Error('Gemini timeline generation is not configured (missing GEMINI_API_KEY).');
  }

  const geminiFiles = new GeminiFilesService();
  const durationSec = Math.floor(review.durationSec ?? 0);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error(
      'Film review duration is required for strict timeline generation. Please set durationSec on this film review.'
    );
  }
  const windows = computeTimelineWindows(durationSec);
  const collectedSegments: TeamFilmReviewPlaySegment[] = [];
  let completedWindowCount = 0;
  const analysisOptions = buildFilmReviewTimelineCacheOptions(options.userId, options.filmReviewId);

  logger.info('Starting Gemini film review timeline generation', {
    operationId: options.operationId,
    filmReviewId: options.filmReviewId,
    userId: options.userId,
    durationSec,
    windows: windows.length,
    concurrency: TIMELINE_WINDOW_CONCURRENCY,
    contextCacheScopeId: analysisOptions.contextCacheScopeId,
  });

  const analyzeWindow = async (
    window: { startSec: number; endSec: number },
    index: number
  ): Promise<void> => {
    const parsedWindowSegments = await analyzeTimelineWindowWithRetry(
      geminiFiles,
      sourceVideoUrl,
      review,
      durationSec,
      window.startSec,
      window.endSec,
      options.operationId,
      index,
      windows.length,
      analysisOptions
    );

    collectedSegments.push(...parsedWindowSegments);
    completedWindowCount += 1;

    const partialTimeline = mergeTimelineSegments(collectedSegments, durationSec);
    if (partialTimeline.length > 0 && options.onWindowComplete) {
      try {
        await options.onWindowComplete({
          processedWindowCount: completedWindowCount,
          totalWindows: windows.length,
          playCount: partialTimeline.length,
          timeline: partialTimeline,
        });
      } catch (err) {
        logger.warn('Failed to persist film review timeline partial progress; continuing job', {
          operationId: options.operationId,
          filmReviewId: options.filmReviewId,
          windowIndex: index + 1,
          processedWindowCount: completedWindowCount,
          totalWindows: windows.length,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  const firstWindow = windows[0];
  if (firstWindow) {
    await analyzeWindow(firstWindow, 0);
    await runTimelineWindowsWithConcurrency(
      windows.slice(1),
      TIMELINE_WINDOW_CONCURRENCY,
      (window, relativeIndex) => analyzeWindow(window, relativeIndex + 1)
    );
  }

  const merged = mergeTimelineSegments(collectedSegments, durationSec);
  if (merged.length === 0) {
    logger.warn('Gemini timeline generation produced no valid play segments; applying fallback.', {
      operationId: options.operationId,
      filmReviewId: review.id,
      durationSec,
      windows: windows.length,
    });
    return buildFallbackTimelineSegments(durationSec);
  }

  return merged;
}

function readRecurringTaskString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveRecurringTaskSourceId(data: Record<string, unknown>): string | undefined {
  return (
    readRecurringTaskString(data, 'sourceId') ??
    readRecurringTaskString(data, 'threadId') ??
    readRecurringTaskString(data, 'sourceThreadId')
  );
}

function buildRecurringTaskPayload(userId: string, actionSummary: string, sourceId?: string) {
  const timestamp = Date.now();
  return {
    operationId: `recurring-${userId}-${timestamp}`,
    userId,
    intent: actionSummary,
    sessionId: `scheduled-${userId}`,
    origin: 'system_cron' as const,
    ...(sourceId
      ? {
          context: {
            sourceId,
            threadId: sourceId,
          },
        }
      : {}),
  };
}

function parsePendingInitialRunAt(data: Record<string, unknown>): string | null {
  const firstRunAt = readRecurringTaskString(data, 'firstRunAt');
  if (!firstRunAt) return null;
  const parsedMs = Date.parse(firstRunAt);
  if (!Number.isFinite(parsedMs) || parsedMs <= Date.now()) return null;
  return new Date(parsedMs).toISOString();
}

function readRecurringTaskInitialJobId(data: Record<string, unknown>): string | undefined {
  return readRecurringTaskString(data, 'initialRunJobId');
}

// ─── GET /jobs/:operationId ─────────────────────────────────────────────────

router.get('/jobs/:operationId', appGuard, async (req: Request, res: Response) => {
  try {
    if (!jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const operationId = req.params['operationId'] as string;
    const { db } = req.firebase!;
    const job = await jobRepository.withDb(db).getById(operationId);

    if (!job) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    // Enforce ownership — only the job owner can poll their own job.
    if (job.userId !== user.uid) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const progress = job.progress;

    res.json({
      success: true,
      data: {
        jobId: job.operationId,
        operationId,
        status: job.status,
        progress: progress
          ? { percent: progress.percent ?? 0, message: progress.message ?? '' }
          : undefined,
        result: job.result,
        error: job.error,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get job status', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get job status' });
  }
});

// ─── GET /history ─────────────────────────────────────────────────────────

router.get('/history', appGuard, async (req: Request, res: Response) => {
  try {
    if (!jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const limitParam = req.query['limit'];
    const limit = Math.min(parseInt(typeof limitParam === 'string' ? limitParam : '20') || 20, 50);
    const { db } = req.firebase!;
    const jobs = await jobRepository.withDb(db).getByUser(user.uid, limit);

    res.json({ success: true, data: jobs });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get job history', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get history' });
  }
});

// ─── GET /operations-log ──────────────────────────────────────────────────

router.get('/operations-log', appGuard, async (req: Request, res: Response) => {
  try {
    if (!jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const limitParam = req.query['limit'];
    const rawLimit = typeof limitParam === 'string' ? Number(limitParam) : NaN;
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 150) : 150;

    const { db } = req.firebase!;

    let jobs: import('../../modules/agent/queue/job.repository.js').AgentJobDocument[];
    try {
      jobs = await jobRepository.withDb(db).getByUser(user.uid, limit);
    } catch (queryErr) {
      const msg = queryErr instanceof Error ? queryErr.message : String(queryErr);
      logger.warn('agentJobs query failed — composite index may not be deployed', {
        userId: user.uid,
        error: msg,
      });
      jobs = [];
    }

    let activeThreads: Awaited<
      ReturnType<NonNullable<typeof chatService>['getUserThreads']>
    >['items'] = [];
    const activeThreadIds = new Set<string>();
    const threadTitleById = new Map<string, string>();
    // Track whether the thread query ran successfully. When true, activeThreadIds
    // is authoritative — even if empty (user archived everything). When false
    // (query threw), we fall back to lenient filtering to avoid hiding valid jobs.
    let threadQuerySucceeded = false;

    if (chatService) {
      try {
        const threadResult = await chatService.getUserThreads({
          userId: user.uid,
          archived: false,
          limit,
        });
        activeThreads = threadResult.items ?? [];
        threadQuerySucceeded = true;

        for (const thread of activeThreads) {
          if (!thread.id) continue;
          activeThreadIds.add(thread.id);
          threadTitleById.set(thread.id, thread.title);
        }

        if (threadResult.hasMore) {
          logger.info('Operations log thread augmentation truncated — consider increasing limit', {
            userId: user.uid,
            displayedCount: activeThreads.length,
            limit,
          });
        }
      } catch (threadErr) {
        logger.warn('Failed to fetch active threads for operations log filtering', {
          userId: user.uid,
          error: threadErr instanceof Error ? threadErr.message : String(threadErr),
        });
      }
    }

    let recurringTasksSnapshot: {
      empty: boolean;
      docs: FirestoreDocLike[];
    } | null = null;
    const activeRecurringTaskKeys = new Set<string>();
    const activeRecurringSourceIds = new Set<string>();

    try {
      const snapshot = await db
        .collection(RECURRING_TASKS_COLLECTION)
        .where('userId', '==', user.uid)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      recurringTasksSnapshot = {
        empty: snapshot.empty,
        docs: snapshot.docs as FirestoreDocLike[],
      };

      for (const doc of recurringTasksSnapshot.docs) {
        activeRecurringTaskKeys.add(doc.id);
        const data = doc.data();
        const sourceId = resolveRecurringTaskSourceId(data);
        if (sourceId) activeRecurringSourceIds.add(sourceId);
      }
    } catch (recurringErr) {
      logger.warn('Failed to prefetch recurring tasks for operations log filtering', {
        userId: user.uid,
        error: recurringErr instanceof Error ? recurringErr.message : String(recurringErr),
      });
    }

    // ── Deduplicate by threadId (professional-app pattern) ────────────────
    // jobs[] is ordered by createdAt DESC from Firestore, so the first job
    // seen for a threadId is the most recent and represents the conversation's
    // current state. All later jobs for the same thread (retries, fan-out
    // chunks, follow-up turns, child operations from tools) collapse into
    // that single sidebar row. This mirrors how ChatGPT, Claude, Linear, and
    // Cursor present agent sessions: one row per conversation.
    //
    // Jobs without a threadId (rare — typically orphaned enqueue jobs) keep
    // their own row keyed by operationId.
    //
    // Child operations (context.parentOperationId set) are never rendered as
    // their own row regardless of thread state — they are sub-steps of the
    // parent and surface only inside the parent's operations log panel.

    const seenThreadIds = new Set<string>();
    const entries: OperationLogEntry[] = [];
    const representedThreadIds = new Set<string>();

    for (const job of jobs) {
      const operationId = (job['operationId'] as string) ?? '';
      const replayContext = job.replayPayload?.context;
      const jobContext =
        replayContext && typeof replayContext === 'object'
          ? replayContext
          : (job as typeof job & { context?: unknown }).context;
      const jobMode =
        jobContext && typeof jobContext === 'object' && 'mode' in jobContext
          ? typeof (jobContext as { mode?: unknown }).mode === 'string'
            ? (jobContext as { mode: string }).mode
            : undefined
          : undefined;
      const parentOperationId =
        jobContext && typeof jobContext === 'object' && 'parentOperationId' in jobContext
          ? typeof (jobContext as { parentOperationId?: unknown }).parentOperationId === 'string'
            ? (jobContext as { parentOperationId: string }).parentOperationId
            : undefined
          : undefined;

      // Option 2 UX: hide background playbook-generation jobs from session history.
      // These jobs do not create a chat thread and open as empty chats when tapped.
      if (operationId.startsWith('playbook-') || jobMode === 'playbook') {
        continue;
      }

      // Child operations never surface in the sidebar. They live inside the
      // parent operation's expanded operations log.
      if (parentOperationId) {
        continue;
      }

      const intent = (job['intent'] as string) ?? '';
      if (!intent) continue;

      const status = mapJobStatus(
        (job['status'] as string) ?? '',
        (raw: string) => logger.warn('Unknown job status mapped to in-progress', { status: raw }),
        job['yieldState']
      );
      const threadId = (job['threadId'] as string) ?? undefined;
      const resolvedTitle = threadId ? (threadTitleById.get(threadId)?.trim() ?? '') : '';

      // Single-thread dedupe: one sidebar row per thread, regardless of status.
      // The newest job (already first thanks to DESC ordering) wins — its
      // status drives the row's "Processing…", "Awaiting input", etc. badge.
      if (threadId) {
        // Guardrail: ignore stale jobs referencing deleted/archived threads.
        // Only apply when threadQuerySucceeded — distinguishes "query returned 0
        // active threads" (user archived everything) from "query failed" (be lenient).
        if (threadQuerySucceeded && !activeThreadIds.has(threadId)) continue;

        if (seenThreadIds.has(threadId)) continue;
        seenThreadIds.add(threadId);
        representedThreadIds.add(threadId);
      }

      const category = inferCategory(intent);
      const createdAt = job['createdAt'] as TimestampLike | undefined;
      const completedAt = job['completedAt'] as TimestampLike | undefined | null;
      const result = job['result'] as { summary?: string } | null | undefined;
      const jobOrigin = validateJobOrigin(job['origin']);

      if (
        shouldHideRecurringExecutionJob({
          origin: jobOrigin,
          recurringTaskKey:
            typeof job['recurringTaskKey'] === 'string'
              ? (job['recurringTaskKey'] as string)
              : null,
          threadId,
          context: jobContext,
          activeRecurringTaskKeys,
          activeRecurringSourceIds,
        })
      ) {
        continue;
      }

      const isScheduled = isScheduledOrigin(jobOrigin);

      // Prefer the thread's title (user-meaningful conversation label) over
      // the per-operation intent. Fall back to the first line of intent when
      // a title hasn't been generated yet.
      const intentFirstLine = intent.split('\n')[0] ?? intent;
      const displayTitle = resolvedTitle || intentFirstLine;

      entries.push({
        id: (job['operationId'] as string) ?? threadId ?? '',
        operationId: (job['operationId'] as string) ?? undefined,
        title: displayTitle.slice(0, 120),
        summary:
          result?.summary ??
          (status === 'error' ? ((job['error'] as string) ?? 'Operation failed') : 'Processing...'),
        icon: iconForCategory(category),
        status,
        category,
        timestamp: createdAt
          ? new Date(createdAt.toMillis()).toISOString()
          : new Date().toISOString(),
        duration: computeDuration(createdAt, completedAt),
        threadId,
        origin: jobOrigin,
        isScheduled,
        metadata: {
          agent: (result as Record<string, unknown> | null)?.['agent'] ?? null,
        },
      });
    }

    try {
      if (recurringTasksSnapshot && !recurringTasksSnapshot.empty) {
        const repeatables: RepeatableJobDescriptor[] = queueService
          ? ((await queueService.getAllRepeatableJobs()) as RepeatableJobDescriptor[])
          : [];
        const repeatableMap = new Map(
          repeatables.map((job: RepeatableJobDescriptor) => [
            job.key,
            {
              nextRun: job.next,
              timezone: job.tz,
            },
          ])
        );

        for (const doc of recurringTasksSnapshot.docs) {
          const data = doc.data();
          const repeatable = repeatableMap.get(doc.id);
          const explicitTitle = readRecurringTaskString(data, 'title');
          const actionSummary =
            typeof data['actionSummary'] === 'string' && data['actionSummary'].trim().length > 0
              ? data['actionSummary'].trim()
              : 'Scheduled task';
          const cronExpression =
            typeof data['cronExpression'] === 'string' ? data['cronExpression'] : '';
          const timezone =
            typeof data['timezone'] === 'string' && data['timezone'].trim().length > 0
              ? data['timezone'].trim()
              : (repeatable?.timezone ?? 'UTC');
          const sourceId = resolveRecurringTaskSourceId(data);
          const resolvedTitle = sourceId ? (threadTitleById.get(sourceId)?.trim() ?? '') : '';
          const createdAt = data['createdAt'] as TimestampLike | undefined;
          const repeatableNextRunIso =
            typeof repeatable?.nextRun === 'number'
              ? new Date(repeatable.nextRun).toISOString()
              : null;
          const pendingFirstRunAt = parsePendingInitialRunAt(data);
          const initialRunJobId = readRecurringTaskInitialJobId(data);
          const pendingInitialRun =
            pendingFirstRunAt && initialRunJobId && queueService
              ? await queueService.getJobStatus(initialRunJobId).catch(() => null)
              : null;
          const nextRunIso =
            pendingInitialRun?.status === 'queued' ? pendingFirstRunAt : repeatableNextRunIso;

          entries.push({
            id: `schedule:${doc.id}`,
            title: (explicitTitle || resolvedTitle || actionSummary).slice(0, 120),
            summary: nextRunIso
              ? cronExpression
                ? `Next run ${cronExpression} (${timezone})`
                : `Next run (${timezone})`
              : cronExpression
                ? `Schedule ${cronExpression} (${timezone})`
                : `Scheduled task (${timezone})`,
            icon: 'calendar',
            status: 'complete',
            category: 'system',
            timestamp: createdAt
              ? new Date(createdAt.toMillis()).toISOString()
              : new Date().toISOString(),
            threadId: sourceId,
            origin: 'system_cron',
            isScheduled: true,
            metadata: {
              source: 'recurring_task',
              recurringTaskKey: doc.id,
              cronExpression,
              timezone,
              nextRun: nextRunIso,
              ...(sourceId ? { sourceId, threadId: sourceId } : {}),
            },
          });
        }
      }
    } catch (recurringErr) {
      logger.warn('Failed to augment operations log with recurring tasks', {
        userId: user.uid,
        error: recurringErr instanceof Error ? recurringErr.message : String(recurringErr),
      });
    }

    if (chatService) {
      try {
        // Build reverse map: MongoDB threadId → Firestore operationId.
        // This is necessary because AgentJobs docs have threadId patched in
        // asynchronously after creation. At the time getByUser runs, some jobs
        // may not yet have threadId and therefore fall through to thread-only
        // entries below without an operationId.
        // without an operationId. This map ensures those entries still carry
        // the correct UUID for the Firestore events subscription.
        const threadIdToOperationId = new Map<string, string>();
        for (const job of jobs) {
          const tid = job['threadId'] as string | null | undefined;
          const oid = job['operationId'] as string | undefined;
          if (tid && oid) threadIdToOperationId.set(tid, oid);
        }

        for (const thread of activeThreads) {
          if (
            !thread.id ||
            representedThreadIds.has(thread.id) ||
            shouldHideRecurringSourceThread({
              threadId: thread.id,
              activeRecurringSourceIds,
            })
          ) {
            continue;
          }

          const category = inferCategory(thread.title);
          const resolvedOperationId = threadIdToOperationId.get(thread.id);
          entries.push({
            id: resolvedOperationId ?? thread.id,
            operationId: resolvedOperationId,
            title: thread.title.slice(0, 120),
            summary: `${thread.messageCount} message${thread.messageCount !== 1 ? 's' : ''} · ${thread.category ?? 'general'}`,
            icon: iconForCategory(category),
            status: 'complete',
            category,
            timestamp: thread.lastMessageAt,
            threadId: thread.id,
            origin: 'user',
            isScheduled: false,
            metadata: {
              source: 'thread',
              messageCount: thread.messageCount,
              threadCategory: thread.category ?? null,
            },
          });
        }
      } catch (threadErr) {
        logger.warn('Failed to augment operations log with MongoDB threads', {
          userId: user.uid,
          error: threadErr instanceof Error ? threadErr.message : String(threadErr),
        });
      }
    }

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    logger.info('Operations log fetched', { userId: user.uid, count: entries.length });
    res.json({ success: true, data: entries });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get operations log', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get operations log' });
  }
});

// ─── GET /gameplans ─────────────────────────────────────────────────────

router.get('/gameplans', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const teamId = normalizeString(req.query['teamId']);
    const sport = normalizeString(req.query['sport'])?.toLowerCase();
    const status = normalizeString(req.query['status']);
    const phase = normalizeString(req.query['phase']);
    const opponentName = normalizeString(req.query['opponentName'])?.toLowerCase();
    const includeArchived = String(req.query['includeArchived'] ?? '').toLowerCase() === 'true';
    const limit = parsePositiveInt(req.query['limit'], 25, 100);

    let candidates: TeamGamePlanDoc[] = [];

    if (teamId) {
      const teamDoc = await db.collection(TEAMS_COLLECTION).doc(teamId).get();
      if (!teamDoc.exists) {
        res.status(404).json({ success: false, error: `Team ${teamId} not found` });
        return;
      }

      const authorized = await canReadTeamIntelForUser(db, user.uid, teamId, teamDoc.data() ?? {});
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }

      const snap = await db
        .collection(TEAM_GAMEPLANS_COLLECTION)
        .where('teamId', '==', teamId)
        .limit(Math.max(limit * 4, 80))
        .get();
      candidates = snap.docs.map((doc) => doc.data() as TeamGamePlanDoc);
    } else {
      const [updatedBySnap, createdBySnap] = await Promise.all([
        db
          .collection(TEAM_GAMEPLANS_COLLECTION)
          .where('updatedBy', '==', user.uid)
          .limit(Math.max(limit * 3, 60))
          .get(),
        db
          .collection(TEAM_GAMEPLANS_COLLECTION)
          .where('createdBy', '==', user.uid)
          .limit(Math.max(limit * 3, 60))
          .get(),
      ]);

      const byId = new Map<string, TeamGamePlanDoc>();
      for (const doc of [...updatedBySnap.docs, ...createdBySnap.docs]) {
        const item = doc.data() as TeamGamePlanDoc;
        byId.set(item.id, item);
      }
      candidates = [...byId.values()];
    }

    const filtered = candidates
      .filter((item) => (includeArchived ? true : item.status !== 'archived'))
      .filter((item) => (status ? item.status === status : true))
      .filter((item) => (phase ? item.phase === phase : true))
      .filter((item) => (sport ? item.sport.toLowerCase() === sport : true))
      .filter((item) => {
        if (!opponentName) return true;
        return (item.opponentName ?? '').toLowerCase().includes(opponentName);
      })
      .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
      .slice(0, limit)
      .map(toGameplanSummary);

    res.json({
      success: true,
      data: {
        gamePlans: filtered,
        count: filtered.length,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to list gameplans', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to list gameplans' });
  }
});

// ─── GET /gameplans/:gamePlanId ────────────────────────────────────────

router.get('/gameplans/:gamePlanId/export.pdf', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const gamePlanIdParam = req.params['gamePlanId'];
    const gamePlanId = Array.isArray(gamePlanIdParam) ? gamePlanIdParam[0] : gamePlanIdParam;

    if (!gamePlanId) {
      res.status(400).json({ success: false, error: 'gamePlanId is required' });
      return;
    }

    const gamePlanDoc = await db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId).get();
    if (!gamePlanDoc.exists) {
      res.status(404).json({ success: false, error: 'Game plan not found' });
      return;
    }

    const gamePlan = gamePlanDoc.data() as TeamGamePlanDoc;
    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(gamePlan.teamId).get();
    const canManageTeam = teamDoc.exists
      ? await canManageTeamMutationForUser(db, user.uid, gamePlan.teamId, teamDoc.data() ?? {})
      : false;
    const isOwner = gamePlan.createdBy === user.uid || gamePlan.updatedBy === user.uid;

    if (!canManageTeam && !isOwner) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const exportService = new ExportService();
    const payload = buildGamePlanPdfPayload(gamePlan);
    const branding = await resolveExportBranding(
      db as unknown as FirestoreReadDb,
      (teamDoc.data() ?? {}) as Record<string, unknown>
    );
    const pdfBuffer = await exportService.generatePdf({
      ...payload,
      includeTable: !!(payload.columns?.length && payload.rows?.length),
      theme: 'light',
      ...branding,
    });

    const safeBase = sanitizeExportFileBase(payload.title || gamePlan.title || 'game-plan');
    const fileName = `${safeBase}.pdf`;

    logger.info('GET /gameplans/:gamePlanId/export.pdf', {
      gamePlanId,
      teamId: gamePlan.teamId,
      userId: user.uid,
      sizeBytes: pdfBuffer.length,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.status(200).send(pdfBuffer);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('GET /gameplans/:gamePlanId/export.pdf failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to export game plan PDF' });
  }
});

router.get('/gameplans/:gamePlanId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const gamePlanIdParam = req.params['gamePlanId'];
    const gamePlanId = Array.isArray(gamePlanIdParam) ? gamePlanIdParam[0] : gamePlanIdParam;
    if (!gamePlanId) {
      res.status(400).json({ success: false, error: 'gamePlanId is required' });
      return;
    }

    const doc = await db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId).get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Game plan not found' });
      return;
    }

    const gamePlan = doc.data() as TeamGamePlanDoc;
    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(gamePlan.teamId).get();
    const canManageTeam = teamDoc.exists
      ? await canManageTeamMutationForUser(db, user.uid, gamePlan.teamId, teamDoc.data() ?? {})
      : false;
    const isOwner = gamePlan.createdBy === user.uid || gamePlan.updatedBy === user.uid;

    if (!canManageTeam && !isOwner) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    res.json({
      success: true,
      data: {
        gamePlan,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to load gameplan', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to load gameplan' });
  }
});

// ─── POST /gameplans ───────────────────────────────────────────────────

router.post('/gameplans', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const payload = req.body as Record<string, unknown>;

    // Validate required fields
    if (!payload['teamId'] || !payload['sport'] || !payload['title']) {
      res.status(400).json({
        success: false,
        error: 'teamId, sport, and title are required',
      });
      return;
    }

    const teamId = String(payload['teamId']).trim();
    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(teamId).get();

    if (!teamDoc.exists) {
      res.status(404).json({ success: false, error: `Team ${teamId} not found` });
      return;
    }

    const isAuthorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      teamId,
      teamDoc.data() ?? {}
    );

    if (!isAuthorized) {
      res
        .status(403)
        .json({ success: false, error: 'Not authorized to create game plans for this team' });
      return;
    }

    const now = new Date().toISOString();
    const normalizedSport = String(payload['sport']).trim().toLowerCase();
    const phase = (payload['phase'] ?? 'pregame') as string;
    const status = (payload['status'] ?? 'draft') as string;
    const docId = `${teamId}_${normalizedSport}_${phase}_${payload['gameDate'] ? String(payload['gameDate']).substring(0, 10) : 'open'}_${String(
      payload['opponentName'] ?? payload['title']
    )
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}`;

    const strengthsWeaknesses = normalizeStrengthsWeaknesses(payload['strengthsWeaknesses']);
    if (Array.isArray(payload['strengthsWeaknesses']) && !strengthsWeaknesses) {
      res.status(400).json({
        success: false,
        error:
          'strengthsWeaknesses must include at least one valid item with label (or title/name) and team context.',
      });
      return;
    }

    const gamePlanData = {
      id: docId,
      teamId,
      sport: normalizedSport,
      title: String(payload['title']).trim(),
      phase: phase as unknown,
      status: status as unknown,
      ...(payload['season'] ? { season: String(payload['season']).trim() } : {}),
      ...(payload['division'] ? { division: String(payload['division']).trim() } : {}),
      ...(payload['opponentName'] ? { opponentName: String(payload['opponentName']).trim() } : {}),
      ...(payload['gameDate'] ? { gameDate: String(payload['gameDate']).trim() } : {}),
      ...(payload['perspectiveTeam']
        ? { perspectiveTeam: String(payload['perspectiveTeam']).trim() }
        : {}),
      ...(payload['ownTeamColor'] ? { ownTeamColor: String(payload['ownTeamColor']).trim() } : {}),
      ...(payload['opponentTeamColor']
        ? { opponentTeamColor: String(payload['opponentTeamColor']).trim() }
        : {}),
      ...(payload['identityFocus']
        ? { identityFocus: String(payload['identityFocus']).trim() }
        : {}),
      ...(payload['primaryAttackPlan']
        ? { primaryAttackPlan: String(payload['primaryAttackPlan']).trim() }
        : {}),
      ...(payload['defensivePriorities']
        ? { defensivePriorities: String(payload['defensivePriorities']).trim() }
        : {}),
      ...(payload['specialSituations']
        ? { specialSituations: String(payload['specialSituations']).trim() }
        : {}),
      ...(Array.isArray(payload['openingScript'])
        ? {
            openingScript: payload['openingScript']
              .map((v) => String(v).trim())
              .filter((v) => v.length > 0),
          }
        : {}),
      ...(strengthsWeaknesses ? { strengthsWeaknesses } : {}),
      ...(payload['scoutingReport']
        ? { scoutingReport: String(payload['scoutingReport']).trim() }
        : {}),
      ...(Array.isArray(payload['priorities'])
        ? { priorities: payload['priorities'] as unknown }
        : {}),
      ...(Array.isArray(payload['planBlocks'])
        ? { planBlocks: payload['planBlocks'] as unknown }
        : {}),
      ...(Array.isArray(payload['adjustmentTriggers'])
        ? { adjustmentTriggers: payload['adjustmentTriggers'] as unknown }
        : {}),
      ...(Array.isArray(payload['halftimePriorities'])
        ? { halftimePriorities: payload['halftimePriorities'] as unknown }
        : {}),
      ...(Array.isArray(payload['customSections'])
        ? { customSections: payload['customSections'] as unknown }
        : {}),
      ...(Array.isArray(payload['linkedPlays'])
        ? { linkedPlays: payload['linkedPlays'] as unknown }
        : {}),
      ...(Array.isArray(payload['tags'])
        ? {
            tags: (payload['tags'] as unknown[])
              .map((v) => String(v).trim())
              .filter((v) => v.length > 0),
          }
        : {}),
      ...(Array.isArray(payload['linkedPlaybookIds'])
        ? {
            linkedPlaybookIds: (payload['linkedPlaybookIds'] as unknown[])
              .map((v) => String(v).trim())
              .filter((v) => v.length > 0),
          }
        : {}),
      source: 'api_direct',
      schemaVersion: 2,
      createdBy: user.uid,
      updatedBy: user.uid,
      createdAt: now,
      updatedAt: now,
    } as unknown as TeamGamePlanDoc;

    const docRef = db.collection(TEAM_GAMEPLANS_COLLECTION).doc(docId);
    await docRef.set(gamePlanData);

    // Invalidate cache
    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${teamId}`),
        cache.del(`team:gameplans:${teamId}:${normalizedSport}`),
        cache.del(`team:profile:${teamId}`),
      ]);
    } catch {
      // Best effort
    }

    logger.info('Game plan created via API', {
      gamePlanId: docId,
      teamId,
      sport: normalizedSport,
      title: gamePlanData['title'],
    });

    res.status(201).json({
      success: true,
      data: { gamePlan: gamePlanData },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to create gameplan', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to create gameplan' });
  }
});

// ─── PUT /gameplans/:gamePlanId ────────────────────────────────────────

router.put('/gameplans/:gamePlanId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const gamePlanIdParam = req.params['gamePlanId'];
    const gamePlanId = Array.isArray(gamePlanIdParam) ? gamePlanIdParam[0] : gamePlanIdParam;

    if (!gamePlanId) {
      res.status(400).json({ success: false, error: 'gamePlanId is required' });
      return;
    }

    const doc = await db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId).get();

    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Game plan not found' });
      return;
    }

    const existing = doc.data() as TeamGamePlanDoc;
    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(existing.teamId).get();

    if (!teamDoc.exists) {
      res.status(404).json({ success: false, error: `Team ${existing.teamId} not found` });
      return;
    }

    const isAuthorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      existing.teamId,
      teamDoc.data() ?? {}
    );

    if (!isAuthorized) {
      res
        .status(403)
        .json({ success: false, error: 'Not authorized to update game plans for this team' });
      return;
    }

    const payload = req.body as Record<string, unknown>;
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updatedBy: user.uid, updatedAt: now };

    // Merge only provided fields
    if (typeof payload['title'] === 'string') updateData['title'] = payload['title'].trim();
    if (typeof payload['status'] === 'string') updateData['status'] = payload['status'];
    if (typeof payload['phase'] === 'string') updateData['phase'] = payload['phase'];
    if (typeof payload['gameDate'] === 'string')
      updateData['gameDate'] = payload['gameDate'].trim();
    if (typeof payload['opponentName'] === 'string')
      updateData['opponentName'] = payload['opponentName'].trim();
    if (typeof payload['season'] === 'string') updateData['season'] = payload['season'].trim();
    if (typeof payload['division'] === 'string')
      updateData['division'] = payload['division'].trim();
    if (typeof payload['perspectiveTeam'] === 'string')
      updateData['perspectiveTeam'] = payload['perspectiveTeam'].trim();
    if (typeof payload['ownTeamColor'] === 'string')
      updateData['ownTeamColor'] = payload['ownTeamColor'].trim();
    if (typeof payload['opponentTeamColor'] === 'string')
      updateData['opponentTeamColor'] = payload['opponentTeamColor'].trim();
    if (typeof payload['identityFocus'] === 'string')
      updateData['identityFocus'] = payload['identityFocus'].trim();
    if (typeof payload['primaryAttackPlan'] === 'string')
      updateData['primaryAttackPlan'] = payload['primaryAttackPlan'].trim();
    if (typeof payload['defensivePriorities'] === 'string')
      updateData['defensivePriorities'] = payload['defensivePriorities'].trim();
    if (typeof payload['specialSituations'] === 'string')
      updateData['specialSituations'] = payload['specialSituations'].trim();
    if (Array.isArray(payload['openingScript']))
      updateData['openingScript'] = (payload['openingScript'] as unknown[])
        .map((v) => String(v).trim())
        .filter((v) => v.length > 0);
    if (Array.isArray(payload['strengthsWeaknesses'])) {
      const strengthsWeaknesses = normalizeStrengthsWeaknesses(payload['strengthsWeaknesses']);
      if (!strengthsWeaknesses) {
        res.status(400).json({
          success: false,
          error:
            'strengthsWeaknesses must include at least one valid item with label (or title/name) and team context.',
        });
        return;
      }
      updateData['strengthsWeaknesses'] = strengthsWeaknesses;
    }
    if (typeof payload['scoutingReport'] === 'string')
      updateData['scoutingReport'] = payload['scoutingReport'].trim();
    if (Array.isArray(payload['priorities'])) updateData['priorities'] = payload['priorities'];
    if (Array.isArray(payload['planBlocks'])) updateData['planBlocks'] = payload['planBlocks'];
    if (Array.isArray(payload['adjustmentTriggers']))
      updateData['adjustmentTriggers'] = payload['adjustmentTriggers'];
    if (Array.isArray(payload['halftimePriorities']))
      updateData['halftimePriorities'] = payload['halftimePriorities'];
    if (Array.isArray(payload['customSections']))
      updateData['customSections'] = payload['customSections'];
    if (Array.isArray(payload['linkedPlays'])) updateData['linkedPlays'] = payload['linkedPlays'];
    if (Array.isArray(payload['linkedPlaybookIds'])) {
      updateData['linkedPlaybookIds'] = (payload['linkedPlaybookIds'] as unknown[])
        .map((v) => String(v).trim())
        .filter((v) => v.length > 0);
    }
    if (Array.isArray(payload['tags']))
      updateData['tags'] = (payload['tags'] as unknown[])
        .map((v) => String(v).trim())
        .filter((v) => v.length > 0);

    const docRef = db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId);
    await docRef.update(updateData);

    // Invalidate cache
    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${existing.teamId}`),
        cache.del(`team:gameplans:${existing.teamId}:${existing.sport}`),
        cache.del(`team:profile:${existing.teamId}`),
      ]);
    } catch {
      // Best effort
    }

    logger.info('Game plan updated via API', {
      gamePlanId,
      teamId: existing.teamId,
      updatedFields: Object.keys(payload),
    });

    // Fetch updated document
    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data() as TeamGamePlanDoc;

    res.json({
      success: true,
      data: { gamePlan: updatedData },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to update gameplan', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to update gameplan' });
  }
});

// ─── DELETE /gameplans/:gamePlanId ─────────────────────────────────────

router.delete('/gameplans/:gamePlanId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const gamePlanIdParam = req.params['gamePlanId'];
    const gamePlanId = Array.isArray(gamePlanIdParam) ? gamePlanIdParam[0] : gamePlanIdParam;

    if (!gamePlanId) {
      res.status(400).json({ success: false, error: 'gamePlanId is required' });
      return;
    }

    const doc = await db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId).get();

    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Game plan not found' });
      return;
    }

    const gamePlan = doc.data() as TeamGamePlanDoc;
    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(gamePlan.teamId).get();

    if (!teamDoc.exists) {
      res.status(404).json({ success: false, error: `Team ${gamePlan.teamId} not found` });
      return;
    }

    const isAuthorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      gamePlan.teamId,
      teamDoc.data() ?? {}
    );

    if (!isAuthorized) {
      res
        .status(403)
        .json({ success: false, error: 'Not authorized to delete game plans for this team' });
      return;
    }

    const now = new Date().toISOString();
    const docRef = db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId);

    // Soft-delete: archive instead of removing
    await docRef.update({
      status: 'archived',
      updatedBy: user.uid,
      updatedAt: now,
      archivedAt: now,
      archivedBy: user.uid,
    });

    // Invalidate cache
    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${gamePlan.teamId}`),
        cache.del(`team:gameplans:${gamePlan.teamId}:${gamePlan.sport}`),
        cache.del(`team:profile:${gamePlan.teamId}`),
      ]);
    } catch {
      // Best effort
    }

    logger.info('Game plan archived via API', {
      gamePlanId,
      teamId: gamePlan.teamId,
      title: gamePlan.title,
    });

    res.json({
      success: true,
      data: { message: `Game plan archived: ${gamePlan.title}` },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to delete gameplan', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to delete gameplan' });
  }
});

// ─── GET /film-reviews ──────────────────────────────────────────────────

router.get('/film-reviews', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const teamId = normalizeString(req.query['teamId']);
    const sport = normalizeString(req.query['sport'])?.toLowerCase();
    const includeArchived = String(req.query['includeArchived'] ?? '').toLowerCase() === 'true';
    const limit = parsePositiveInt(req.query['limit'], 25, 100);

    let candidates: TeamFilmReviewDoc[] = [];

    if (teamId) {
      const teamDoc = await db.collection(TEAMS_COLLECTION).doc(teamId).get();
      if (!teamDoc.exists) {
        res.status(404).json({ success: false, error: `Team ${teamId} not found` });
        return;
      }

      const authorized = await canReadTeamIntelForUser(db, user.uid, teamId, teamDoc.data() ?? {});
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }

      const snap = await db
        .collection(TEAM_FILM_REVIEWS_COLLECTION)
        .where('teamId', '==', teamId)
        .limit(Math.max(limit * 4, 80))
        .get();

      candidates = snap.docs.map((doc) => doc.data() as TeamFilmReviewDoc);
    } else {
      const [updatedBySnap, createdBySnap] = await Promise.all([
        db
          .collection(TEAM_FILM_REVIEWS_COLLECTION)
          .where('updatedBy', '==', user.uid)
          .limit(Math.max(limit * 3, 60))
          .get(),
        db
          .collection(TEAM_FILM_REVIEWS_COLLECTION)
          .where('createdBy', '==', user.uid)
          .limit(Math.max(limit * 3, 60))
          .get(),
      ]);

      const byId = new Map<string, TeamFilmReviewDoc>();
      for (const doc of [...updatedBySnap.docs, ...createdBySnap.docs]) {
        const item = doc.data() as TeamFilmReviewDoc;
        byId.set(item.id, item);
      }
      candidates = [...byId.values()];
    }

    const bucket = req.firebase?.storage?.bucket() ?? getStorage().bucket();
    const filtered = await Promise.all(
      candidates
        .filter((item) => (includeArchived ? true : item.status !== 'archived'))
        .filter((item) => (sport ? item.sport.toLowerCase() === sport : true))
        .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
        .slice(0, limit)
        .map(async (item) => {
          const refreshed = await refreshFilmReviewCloudflareState(item, db);
          return toFilmReviewSummary({
            ...refreshed,
            videoUrl: await resolveFilmReviewVideoUrl(refreshed, bucket),
          });
        })
    );

    res.json({
      success: true,
      data: {
        filmReviews: filtered,
        count: filtered.length,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to list film reviews', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to list film reviews' });
  }
});

// ─── GET /film-reviews/:filmReviewId ───────────────────────────────────

router.get('/film-reviews/:filmReviewId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const filmReviewIdParam = req.params['filmReviewId'];
    const filmReviewId = Array.isArray(filmReviewIdParam)
      ? filmReviewIdParam[0]
      : filmReviewIdParam;
    if (!filmReviewId) {
      res.status(400).json({ success: false, error: 'filmReviewId is required' });
      return;
    }

    const doc = await db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId).get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Film review not found' });
      return;
    }

    const filmReview = doc.data() as TeamFilmReviewDoc;
    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(filmReview.teamId).get();
    const canReadTeam = teamDoc.exists
      ? await canReadTeamIntelForUser(db, user.uid, filmReview.teamId, teamDoc.data() ?? {})
      : false;
    const isOwner = filmReview.createdBy === user.uid || filmReview.updatedBy === user.uid;

    if (!canReadTeam && !isOwner) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const refreshed = await refreshFilmReviewCloudflareState(filmReview, db);
    const bucket = req.firebase?.storage?.bucket() ?? getStorage().bucket();
    res.json({
      success: true,
      data: {
        filmReview: {
          ...refreshed,
          videoUrl: await resolveFilmReviewVideoUrl(refreshed, bucket),
        },
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to load film review', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to load film review' });
  }
});

// ─── POST /film-reviews ─────────────────────────────────────────────────

router.post('/film-reviews', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const payload = req.body as Record<string, unknown>;
    const teamId = normalizeString(payload['teamId']);
    const sport = normalizeString(payload['sport'])?.toLowerCase();
    const title = normalizeString(payload['title']);
    const videoUrl = normalizeString(payload['videoUrl']);
    const storagePath = normalizeString(payload['storagePath']);
    const cloudflareVideoId = normalizeString(payload['cloudflareVideoId']);
    const cloudflareStatus = normalizeString(payload['cloudflareStatus']);
    const readyToStream = normalizeBoolean(payload['readyToStream']);
    const source = normalizeString(payload['source']) ?? 'manual';
    const sourceUrl = normalizeString(payload['sourceUrl']);
    const playlistId = normalizeString(payload['playlistId']) ?? null;
    const playlistName = normalizeString(payload['playlistName']) ?? null;

    if (!teamId || !sport || !title || !videoUrl) {
      res.status(400).json({
        success: false,
        error: 'teamId, sport, title, and videoUrl are required',
      });
      return;
    }

    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(teamId).get();
    if (!teamDoc.exists) {
      res.status(404).json({ success: false, error: `Team ${teamId} not found` });
      return;
    }

    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized to create film reviews' });
      return;
    }

    const now = new Date().toISOString();
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    const docId = `${teamId}_${sport}_${slug || 'film'}_${Date.now()}`;
    let initialDownloadPrewarm: TeamFilmReviewDownloadPrewarm | undefined = cloudflareVideoId
      ? {
          status: 'queued',
          requestedAt: now,
          lastCheckedAt: now,
        }
      : undefined;

    if (cloudflareVideoId) {
      const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
      const apiToken = process.env['CLOUDFLARE_API_TOKEN'];

      if (accountId && apiToken) {
        try {
          const prewarm = await requestCloudflareVideoDownloadRender(
            cloudflareVideoId,
            accountId,
            apiToken
          );
          initialDownloadPrewarm = {
            status: toDownloadPrewarmStatus(prewarm.status),
            requestedAt: initialDownloadPrewarm?.requestedAt ?? now,
            lastCheckedAt: now,
            ...(prewarm.percentComplete !== null
              ? { percentComplete: prewarm.percentComplete }
              : {}),
            ...(prewarm.url ? { mp4Url: prewarm.url } : {}),
          };
        } catch (error) {
          initialDownloadPrewarm = {
            status: 'error',
            requestedAt: initialDownloadPrewarm?.requestedAt ?? now,
            lastCheckedAt: now,
            lastError:
              error instanceof Error ? error.message : 'Cloudflare download prewarm failed',
          };
          logger.warn('Failed to kick off Cloudflare download prewarm for film review', {
            teamId,
            cloudflareVideoId,
            error:
              error instanceof Error ? error.message : 'Cloudflare download prewarm request failed',
          });
        }
      }
    }

    const initialStatus: TeamFilmReviewStatus =
      cloudflareVideoId && readyToStream !== true ? 'processing' : 'ready';

    const aiSeed = buildSyntheticFilmReviewAi({
      id: docId,
      teamId,
      sport,
      title,
      status: initialStatus,
      videoUrl,
      ...(storagePath ? { storagePath } : {}),
      ...(cloudflareVideoId ? { cloudflareVideoId } : {}),
      ...(cloudflareStatus ? { cloudflareStatus } : {}),
      ...(readyToStream !== undefined ? { readyToStream } : {}),
      source,
      schemaVersion: 1,
      createdBy: user.uid,
      updatedBy: user.uid,
      createdAt: now,
      updatedAt: now,
      durationSec: parseSeconds(payload['durationSec']) ?? 0,
    } as TeamFilmReviewDoc);

    const filmReview: TeamFilmReviewDoc = {
      id: docId,
      teamId,
      sport,
      title,
      status: initialStatus,
      videoUrl,
      ...(storagePath ? { storagePath } : {}),
      ...(cloudflareVideoId ? { cloudflareVideoId } : {}),
      ...(cloudflareStatus ? { cloudflareStatus } : {}),
      ...(readyToStream !== undefined ? { readyToStream } : {}),
      ...(normalizeString(payload['thumbnailUrl'])
        ? { thumbnailUrl: normalizeString(payload['thumbnailUrl']) }
        : {}),
      ...(normalizeString(payload['opponentName'])
        ? { opponentName: normalizeString(payload['opponentName']) }
        : {}),
      ...(normalizeString(payload['gameDate'])
        ? { gameDate: normalizeString(payload['gameDate']) }
        : {}),
      ...(playlistId && playlistName ? { playlistId, playlistName } : {}),
      ...(normalizeString(payload['perspective'])
        ? {
            perspective: normalizeString(
              payload['perspective']
            ) as TeamFilmReviewDoc['perspective'],
          }
        : {}),
      ...(parseSeconds(payload['durationSec']) !== null
        ? { durationSec: parseSeconds(payload['durationSec']) as number }
        : {}),
      ...(initialDownloadPrewarm ? { downloadPrewarm: initialDownloadPrewarm } : {}),
      ...aiSeed,
      clips: [],
      annotations: [],
      tags: Array.isArray(payload['tags'])
        ? (payload['tags'] as unknown[])
            .map((value) => String(value).trim())
            .filter((value) => value.length > 0)
        : [],
      source,
      ...(sourceUrl ? { sourceUrl } : {}),
      schemaVersion: 1,
      createdBy: user.uid,
      updatedBy: user.uid,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(docId).set(filmReview);

    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${teamId}`),
        cache.del(`team:film_reviews:${teamId}:${sport}`),
      ]);
    } catch {
      /* best effort */
    }

    const bucket = req.firebase?.storage?.bucket() ?? getStorage().bucket();
    res.status(201).json({
      success: true,
      data: {
        filmReview: {
          ...filmReview,
          videoUrl: await resolveFilmReviewVideoUrl(filmReview, bucket),
        },
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to create film review', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to create film review' });
  }
});

// ─── POST /film-reviews/:filmReviewId/breakdown-import ─────────────────

router.post(
  '/film-reviews/:filmReviewId/breakdown-import',
  appGuard,
  uploadRateLimit,
  agentUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { db } = req.firebase!;
      const filmReviewIdParam = req.params['filmReviewId'];
      const filmReviewId = Array.isArray(filmReviewIdParam)
        ? filmReviewIdParam[0]
        : filmReviewIdParam;
      if (!filmReviewId) {
        res.status(400).json({ success: false, error: 'filmReviewId is required' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No breakdown file provided' });
        return;
      }

      const docRef = db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Film review not found' });
        return;
      }

      const existing = doc.data() as TeamFilmReviewDoc;
      const teamDoc = await db.collection(TEAMS_COLLECTION).doc(existing.teamId).get();
      const canManageTeam = await canManageTeamMutationForUser(
        db,
        user.uid,
        existing.teamId,
        teamDoc.data() ?? {}
      );
      const isOwner = existing.createdBy === user.uid || existing.updatedBy === user.uid;

      if (!canManageTeam && !isOwner) {
        logger.warn('Film review breakdown import forbidden', {
          filmReviewId,
          teamId: existing.teamId,
          userId: user.uid,
        });
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }

      const parsed = await parseHudlBreakdownBuffer({
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sport: existing.sport,
      });

      if (parsed.timeline.length === 0) {
        res.status(400).json({
          success: false,
          error: parsed.warnings[0] ?? 'No playable rows found in breakdown file',
        });
        return;
      }

      const now = new Date().toISOString();
      const bucket = req.firebase?.storage?.bucket() ?? getStorage().bucket();
      const storagePath = AgentMediaLifecycleService.buildStoragePath({
        userId: user.uid,
        mimeType: file.mimetype,
        fileName: file.originalname,
        zone: 'media',
      });

      await AgentMediaLifecycleService.saveBufferAndSignRead({
        bucket,
        storagePath,
        buffer: file.buffer,
        mimeType: file.mimetype,
      });

      const importedDurationSec = parsed.timeline.reduce(
        (max, play) => Math.max(max, play.endSec),
        existing.durationSec ?? 0
      );
      const breakdownSource: TeamFilmReviewBreakdownSource = {
        provider: resolveFilmReviewBreakdownProvider(file.originalname, file.mimetype),
        fileName: file.originalname,
        mimeType: file.mimetype,
        storagePath,
        ...(parsed.sheetName ? { sheetName: parsed.sheetName } : {}),
        rowCount: parsed.rowCount,
        playCount: parsed.timeline.length,
        importedBy: user.uid,
        importedAt: now,
      };

      await docRef.update({
        timeline: parsed.timeline,
        timelineState: 'ready',
        timelineGeneratedAt: now,
        timelineError: null,
        breakdownSource,
        durationSec: Math.max(existing.durationSec ?? 0, importedDurationSec),
        updatedBy: user.uid,
        updatedAt: now,
      });

      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(`intel:team:${existing.teamId}`),
          cache.del(`team:film_reviews:${existing.teamId}:${existing.sport}`),
        ]);
      } catch {
        /* best effort */
      }

      const updated = (await docRef.get()).data() as TeamFilmReviewDoc;
      logger.info('Film review breakdown imported', {
        filmReviewId,
        teamId: existing.teamId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        playCount: parsed.timeline.length,
        rowCount: parsed.rowCount,
      });

      res.json({
        success: true,
        data: {
          filmReview: {
            ...updated,
            videoUrl: await resolveFilmReviewVideoUrl(updated, bucket),
          },
          playCount: parsed.timeline.length,
          rowCount: parsed.rowCount,
          ...(parsed.sheetName ? { sheetName: parsed.sheetName } : {}),
          warnings: parsed.warnings,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const isClientImportError =
        /breakdown imports support|export .* as \.xlsx|no rows|empty|invalid/i.test(error.message);
      logger.error('Failed to import film review breakdown', {
        error: error.message,
        stack: error.stack,
      });
      res.status(isClientImportError ? 400 : 500).json({ success: false, error: error.message });
    }
  }
);

// ─── PATCH /film-reviews/:filmReviewId ─────────────────────────────────

router.patch('/film-reviews/:filmReviewId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const filmReviewIdParam = req.params['filmReviewId'];
    const filmReviewId = Array.isArray(filmReviewIdParam)
      ? filmReviewIdParam[0]
      : filmReviewIdParam;
    if (!filmReviewId) {
      res.status(400).json({ success: false, error: 'filmReviewId is required' });
      return;
    }

    const docRef = db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Film review not found' });
      return;
    }

    const existing = doc.data() as TeamFilmReviewDoc;
    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(existing.teamId).get();
    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      existing.teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized' });
      return;
    }

    const payload = req.body as Record<string, unknown>;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedBy: user.uid, updatedAt: now };
    const nextSport = normalizeString(payload['sport'])?.toLowerCase();
    const isSportChanging = !!nextSport && nextSport !== existing.sport;

    if (typeof payload['title'] === 'string' && payload['title'].trim()) {
      updates['title'] = payload['title'].trim();
    }
    if (nextSport) {
      updates['sport'] = nextSport;
    }
    if (payload['status'] !== undefined) {
      if (!isTeamFilmReviewStatus(payload['status'])) {
        res.status(400).json({ success: false, error: 'Invalid film review status' });
        return;
      }
      updates['status'] = payload['status'];
    }
    if (typeof payload['videoUrl'] === 'string' && payload['videoUrl'].trim()) {
      updates['videoUrl'] = payload['videoUrl'].trim();
    }
    if (typeof payload['storagePath'] === 'string' && payload['storagePath'].trim()) {
      updates['storagePath'] = payload['storagePath'].trim();
    }
    if (typeof payload['thumbnailUrl'] === 'string') {
      updates['thumbnailUrl'] = payload['thumbnailUrl'].trim();
    }
    if (typeof payload['opponentName'] === 'string') {
      updates['opponentName'] = payload['opponentName'].trim();
    }
    if (typeof payload['gameDate'] === 'string') updates['gameDate'] = payload['gameDate'].trim();
    if (Object.prototype.hasOwnProperty.call(payload, 'playlistId')) {
      const playlistId = normalizeString(payload['playlistId']);
      const playlistName = normalizeString(payload['playlistName']);
      updates['playlistId'] = playlistId ?? null;
      updates['playlistName'] = playlistId && playlistName ? playlistName : null;
    }
    if (payload['perspective'] !== undefined) {
      if (!isTeamFilmReviewPerspective(payload['perspective'])) {
        res.status(400).json({ success: false, error: 'Invalid film review perspective' });
        return;
      }
      updates['perspective'] = payload['perspective'];
    }
    if (typeof payload['aiSummary'] === 'string')
      updates['aiSummary'] = payload['aiSummary'].trim();

    const durationSec = parseSeconds(payload['durationSec']);
    if (durationSec !== null) updates['durationSec'] = durationSec;

    if (Array.isArray(payload['keyInsights'])) {
      updates['keyInsights'] = (payload['keyInsights'] as unknown[])
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0);
    }
    if (Array.isArray(payload['tags'])) {
      updates['tags'] = (payload['tags'] as unknown[])
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0);
    }
    if (Array.isArray(payload['timeline'])) {
      const timeline = parseFilmReviewTimelineSegments(
        payload['timeline'],
        nextSport ?? existing.sport
      );
      if (!timeline) {
        res.status(400).json({ success: false, error: 'Invalid film review timeline payload' });
        return;
      }
      updates['timeline'] = timeline;
    }

    if (isSportChanging) {
      updates['timeline'] = [];
      updates['timelineState'] = 'idle';
      updates['timelineGeneratedAt'] = null;
      updates['timelineError'] = null;
    }

    await docRef.update(updates);
    const updated = (await docRef.get()).data() as TeamFilmReviewDoc;

    try {
      const cache = getCacheService();
      const cacheKeys = new Set<string>([
        `intel:team:${existing.teamId}`,
        `team:film_reviews:${existing.teamId}:${existing.sport}`,
      ]);
      if (nextSport) {
        cacheKeys.add(`team:film_reviews:${existing.teamId}:${nextSport}`);
      }
      await Promise.all([...cacheKeys].map((key) => cache.del(key)));
    } catch {
      /* best effort */
    }

    res.json({ success: true, data: { filmReview: updated } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to update film review', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to update film review' });
  }
});

// ─── DELETE /film-reviews/:filmReviewId ────────────────────────────────

router.delete('/film-reviews/:filmReviewId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const filmReviewIdParam = req.params['filmReviewId'];
    const filmReviewId = Array.isArray(filmReviewIdParam)
      ? filmReviewIdParam[0]
      : filmReviewIdParam;
    if (!filmReviewId) {
      res.status(400).json({ success: false, error: 'filmReviewId is required' });
      return;
    }

    const docRef = db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Film review not found' });
      return;
    }

    const filmReview = doc.data() as TeamFilmReviewDoc;
    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(filmReview.teamId).get();
    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      filmReview.teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized' });
      return;
    }

    const now = new Date().toISOString();
    const deleteMetadata = {
      filmReviewId,
      teamId: filmReview.teamId,
      userId: user.uid,
    } as const;

    const failures: FilmReviewDeleteFailure[] = [];
    const cloudflareVideoId = filmReview.cloudflareVideoId?.trim();
    const storagePath = filmReview.storagePath?.trim();

    if (cloudflareVideoId) {
      const failure = await deleteCloudflareFilmReviewVideo(cloudflareVideoId, deleteMetadata);
      if (failure) failures.push(failure);
    }

    if (storagePath) {
      const failure = await deleteFirebaseFilmReviewVideo(
        req.firebase.storage.bucket(),
        storagePath,
        deleteMetadata
      );
      if (failure) failures.push(failure);
    }

    if (failures.length > 0) {
      logger.error('Failed to delete one or more film review media assets', {
        ...deleteMetadata,
        failures,
      });
      res.status(502).json({
        success: false,
        error:
          'Failed to fully delete film review media assets. Nothing was removed from the library.',
        data: {
          failures,
        },
      });
      return;
    }

    await docRef.delete();

    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${filmReview.teamId}`),
        cache.del(`team:film_reviews:${filmReview.teamId}:${filmReview.sport}`),
      ]);
    } catch {
      // best effort
    }

    logger.info('Film review hard deleted', {
      ...deleteMetadata,
      deletedAt: now,
      cloudflareDeleted: !!cloudflareVideoId,
      firebaseDeleted: !!storagePath,
    });

    res.json({ success: true, data: { message: `Film review deleted: ${filmReview.title}` } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to delete film review', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to delete film review' });
  }
});

// ─── POST /film-reviews/:filmReviewId/annotations ─────────────────────

router.post(
  '/film-reviews/:filmReviewId/annotations',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { db } = req.firebase!;
      const filmReviewIdParam = req.params['filmReviewId'];
      const filmReviewId = Array.isArray(filmReviewIdParam)
        ? filmReviewIdParam[0]
        : filmReviewIdParam;
      if (!filmReviewId) {
        res.status(400).json({ success: false, error: 'filmReviewId is required' });
        return;
      }

      const docRef = db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Film review not found' });
        return;
      }

      const existing = doc.data() as TeamFilmReviewDoc;
      const teamDoc = await db.collection(TEAMS_COLLECTION).doc(existing.teamId).get();
      const canManageTeam = await canManageTeamMutationForUser(
        db,
        user.uid,
        existing.teamId,
        teamDoc.data() ?? {}
      );
      const isOwner = existing.createdBy === user.uid || existing.updatedBy === user.uid;
      if (!canManageTeam && !isOwner) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      const note = normalizeString(req.body?.['note']);
      const atSec = parseSeconds(req.body?.['atSec']);
      if (!note || atSec === null) {
        res.status(400).json({ success: false, error: 'note and atSec are required' });
        return;
      }

      const annotation: TeamFilmReviewAnnotation = {
        id: `ann_${Date.now()}_${Math.round(Math.random() * 1000)}`,
        note,
        atSec,
        ...(normalizeString(req.body?.['color'])
          ? { color: normalizeString(req.body?.['color']) }
          : {}),
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      };

      const annotations = [...(existing.annotations ?? []), annotation].sort(
        (a, b) => a.atSec - b.atSec
      );
      await docRef.update({
        annotations,
        updatedBy: user.uid,
        updatedAt: new Date().toISOString(),
      });

      res.json({ success: true, data: { annotations } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to add film review annotation', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to add annotation' });
    }
  }
);

// ─── DELETE /film-reviews/:filmReviewId/annotations/:annotationId ─────

router.delete(
  '/film-reviews/:filmReviewId/annotations/:annotationId',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { db } = req.firebase!;
      const filmReviewIdParam = req.params['filmReviewId'];
      const annotationIdParam = req.params['annotationId'];
      const filmReviewId = Array.isArray(filmReviewIdParam)
        ? filmReviewIdParam[0]
        : filmReviewIdParam;
      const annotationId = Array.isArray(annotationIdParam)
        ? annotationIdParam[0]
        : annotationIdParam;

      if (!filmReviewId || !annotationId) {
        res
          .status(400)
          .json({ success: false, error: 'filmReviewId and annotationId are required' });
        return;
      }

      const docRef = db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Film review not found' });
        return;
      }

      const existing = doc.data() as TeamFilmReviewDoc;
      const teamDoc = await db.collection(TEAMS_COLLECTION).doc(existing.teamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        existing.teamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      const annotations = (existing.annotations ?? []).filter((item) => item.id !== annotationId);
      await docRef.update({
        annotations,
        updatedBy: user.uid,
        updatedAt: new Date().toISOString(),
      });

      res.json({ success: true, data: { annotations } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to delete film review annotation', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to delete annotation' });
    }
  }
);

// ─── POST /film-reviews/:filmReviewId/ai-refresh ───────────────────────

router.post(
  '/film-reviews/:filmReviewId/ai-refresh',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { db } = req.firebase!;
      const filmReviewIdParam = req.params['filmReviewId'];
      const filmReviewId = Array.isArray(filmReviewIdParam)
        ? filmReviewIdParam[0]
        : filmReviewIdParam;
      if (!filmReviewId) {
        res.status(400).json({ success: false, error: 'filmReviewId is required' });
        return;
      }

      const docRef = db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Film review not found' });
        return;
      }

      const existing = doc.data() as TeamFilmReviewDoc;
      const teamDoc = await db.collection(TEAMS_COLLECTION).doc(existing.teamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        existing.teamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      const ai = buildSyntheticFilmReviewAi(existing);
      await docRef.update({
        aiSummary: ai.aiSummary,
        aiTags: ai.aiTags,
        keyInsights: ai.keyInsights,
        updatedBy: user.uid,
        updatedAt: new Date().toISOString(),
        status: 'ready',
      });

      res.json({
        success: true,
        data: {
          aiSummary: ai.aiSummary,
          aiTags: ai.aiTags,
          keyInsights: ai.keyInsights,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to refresh film review AI', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to refresh film review AI' });
    }
  }
);

// ─── POST /film-reviews/:filmReviewId/timeline-generate ─────────────────

router.post(
  '/film-reviews/:filmReviewId/timeline-generate',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { db } = req.firebase!;
      const filmReviewIdParam = req.params['filmReviewId'];
      const filmReviewId = Array.isArray(filmReviewIdParam)
        ? filmReviewIdParam[0]
        : filmReviewIdParam;
      if (!filmReviewId) {
        res.status(400).json({ success: false, error: 'filmReviewId is required' });
        return;
      }

      const docRef = db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Film review not found' });
        return;
      }

      const existing = doc.data() as TeamFilmReviewDoc;
      const payload = req.body as Record<string, unknown>;
      const incomingDurationSec = parseSeconds(payload['durationSec']);
      const durationForGeneration =
        incomingDurationSec !== null && incomingDurationSec > 0
          ? incomingDurationSec
          : (parseSeconds(existing.durationSec) ?? null);
      const teamDoc = await db.collection(TEAMS_COLLECTION).doc(existing.teamId).get();
      const canManageTeam = await canManageTeamMutationForUser(
        db,
        user.uid,
        existing.teamId,
        teamDoc.data() ?? {}
      );
      const isOwner = existing.createdBy === user.uid || existing.updatedBy === user.uid;

      if (!canManageTeam && !isOwner) {
        logger.warn('Film review timeline generation forbidden', {
          filmReviewId,
          teamId: existing.teamId,
          userId: user.uid,
        });
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }

      // Check if already generating
      if (existing.timelineState === 'generating') {
        res.json({
          success: true,
          data: {
            status: 'processing',
            timelineState: 'generating',
            message: 'Timeline generation already in progress',
          },
        });
        return;
      }

      // Update status to generating and trigger async job
      await docRef.update({
        timelineState: 'generating',
        timelineError: null,
        timelineProgress: null,
        ...(durationForGeneration !== null && durationForGeneration > 0
          ? { durationSec: durationForGeneration }
          : {}),
        updatedBy: user.uid,
        updatedAt: new Date().toISOString(),
      });

      const storageBucket = req.firebase?.storage?.bucket() ?? getStorage().bucket();
      const reviewForGeneration: TeamFilmReviewDoc =
        durationForGeneration !== null && durationForGeneration > 0
          ? { ...existing, durationSec: durationForGeneration }
          : existing;

      // Asynchronous timeline job: strict AI-only generation (Gemini Files API).
      setTimeout(async () => {
        try {
          const sourceVideoUrl = await resolveFilmReviewVideoUrl(existing, storageBucket);
          const timeline = await buildAiFilmReviewTimeline(reviewForGeneration, sourceVideoUrl, {
            operationId: filmReviewId,
            userId: user.uid,
            filmReviewId,
            onWindowComplete: async (progress) => {
              const now = new Date().toISOString();
              await docRef.update({
                timeline: progress.timeline,
                timelineState: 'generating',
                timelineProgress: {
                  processedWindowCount: progress.processedWindowCount,
                  totalWindowCount: progress.totalWindows,
                  playCount: progress.playCount,
                  updatedAt: now,
                },
                timelineError: null,
                updatedBy: user.uid,
                updatedAt: now,
              });
            },
          });
          const generationSource = 'gemini_files_api';
          const now = new Date().toISOString();
          const totalWindowCount = computeTimelineWindows(
            Math.floor(reviewForGeneration.durationSec ?? 0)
          ).length;

          await docRef.update({
            timeline,
            timelineState: 'ready',
            timelineGeneratedAt: now,
            timelineProgress: {
              processedWindowCount: totalWindowCount,
              totalWindowCount,
              playCount: timeline.length,
              updatedAt: now,
            },
            timelineError: null,
            updatedBy: user.uid,
            updatedAt: now,
          });

          logger.info('Film review timeline generated successfully', {
            filmReviewId,
            playCount: timeline.length,
            generationSource,
            userId: user.uid,
          });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          logger.error('Failed to generate film review timeline (async)', {
            filmReviewId,
            error: error.message,
          });

          await docRef.update({
            timelineState: 'error',
            timelineError: error.message,
            timelineProgress: null,
            updatedBy: user.uid,
            updatedAt: new Date().toISOString(),
          });
        }
      }, 0);

      res.json({
        success: true,
        data: {
          status: 'queued',
          timelineState: 'generating',
          message: 'Timeline generation started',
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to initiate film review timeline generation', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to generate timeline' });
    }
  }
);

router.patch(
  '/operations-log/scheduled/:taskKey',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      if (!queueService) {
        res.status(503).json({ success: false, error: 'Agent queue not initialized' });
        return;
      }

      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const taskKey = (req.params['taskKey'] as string | undefined)?.trim();
      if (!taskKey) {
        res.status(400).json({ success: false, error: 'Recurring task key is required' });
        return;
      }

      const { title } = req.body as { title?: string };
      const nextTitle = typeof title === 'string' ? title.trim() : '';
      if (!nextTitle) {
        res.status(400).json({ success: false, error: 'Title is required' });
        return;
      }

      if (nextTitle.length > 200) {
        res.status(400).json({ success: false, error: 'Title must be 200 characters or less' });
        return;
      }

      const { db } = req.firebase!;
      const docRef = db.collection(RECURRING_TASKS_COLLECTION).doc(taskKey);
      const snapshot = await docRef.get();
      const data = snapshot.data() as Record<string, unknown> | undefined;

      if (!snapshot.exists || data?.['userId'] !== user.uid) {
        res.status(404).json({ success: false, error: 'Recurring task not found' });
        return;
      }

      const cronExpression = readRecurringTaskString(data, 'cronExpression');
      if (!cronExpression) {
        res.status(409).json({ success: false, error: 'Recurring task schedule is missing' });
        return;
      }

      const timezone = readRecurringTaskString(data, 'timezone') ?? 'UTC';
      const jobName = readRecurringTaskString(data, 'jobName') ?? `recv:${user.uid}:${Date.now()}`;
      const sourceId = resolveRecurringTaskSourceId(data);
      const firstRunAt = parsePendingInitialRunAt(data);
      const existingInitialRunJobId = readRecurringTaskInitialJobId(data);
      const previousTitle = readRecurringTaskString(data, 'actionSummary') ?? 'Scheduled task';

      const previousPayload = buildRecurringTaskPayload(user.uid, previousTitle, sourceId);
      const nextPayload = buildRecurringTaskPayload(user.uid, nextTitle, sourceId);
      const nextDocData: Record<string, unknown> = {
        ...data,
        userId: user.uid,
        actionSummary: nextTitle,
        title: nextTitle,
        cronExpression,
        timezone,
        jobName,
        ...(sourceId ? { sourceId } : {}),
        updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
      };

      const removed = await queueService.removeRecurringJob(taskKey);
      if (!removed) {
        logger.warn('Recurring task rename could not find BullMQ repeatable before re-register', {
          userId: user.uid,
          taskKey,
        });
      }

      let nextKey = taskKey;
      try {
        nextKey = await queueService.enqueueRecurring(
          jobName,
          cronExpression,
          timezone,
          nextPayload,
          firstRunAt
            ? { startDate: new Date(Date.parse(firstRunAt) + 60_000).toISOString() }
            : undefined,
          'production'
        );

        if (firstRunAt) {
          const initialPayload = {
            ...nextPayload,
            operationId: `recurring-initial-${user.uid}-${Date.now()}`,
            context: {
              ...(typeof nextPayload.context === 'object' && nextPayload.context
                ? nextPayload.context
                : {}),
              timezone,
              recurringTaskKey: nextKey,
              recurringInitialRun: true,
            },
          };
          const delayMs = Math.max(0, Date.parse(firstRunAt) - Date.now());
          const nextInitialRunJobId = await queueService.enqueueDelayed(
            initialPayload,
            delayMs,
            'production'
          );
          if (existingInitialRunJobId) {
            await queueService.cancel(existingInitialRunJobId).catch(() => false);
          }
          (nextDocData as Record<string, unknown>)['initialRunJobId'] = nextInitialRunJobId;
          (nextDocData as Record<string, unknown>)['firstRunAt'] = firstRunAt;
        } else {
          if (existingInitialRunJobId) {
            await queueService.cancel(existingInitialRunJobId).catch(() => false);
          }
          nextDocData['initialRunJobId'] = firebaseAdmin.firestore.FieldValue.delete();
          nextDocData['firstRunAt'] = firebaseAdmin.firestore.FieldValue.delete();
        }
      } catch (enqueueErr) {
        try {
          await queueService.enqueueRecurring(
            jobName,
            cronExpression,
            timezone,
            previousPayload,
            firstRunAt
              ? { startDate: new Date(Date.parse(firstRunAt) + 60_000).toISOString() }
              : undefined,
            'production'
          );
        } catch (rollbackErr) {
          logger.error('Failed to roll back recurring task rename after enqueue failure', {
            userId: user.uid,
            taskKey,
            error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
          });
        }

        throw enqueueErr;
      }

      if (nextKey === taskKey) {
        await docRef.set(nextDocData, { merge: true });
      } else {
        const batch = db.batch();
        batch.set(db.collection(RECURRING_TASKS_COLLECTION).doc(nextKey), nextDocData, {
          merge: true,
        });
        batch.delete(docRef);
        await batch.commit();
      }

      logger.info('Recurring task renamed', {
        userId: user.uid,
        taskKey,
        nextKey,
        title: nextTitle,
      });

      res.json({
        success: true,
        data: {
          key: nextKey,
          title: nextTitle,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to rename recurring task', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to rename recurring task' });
    }
  }
);

router.post(
  '/operations-log/scheduled/:taskKey/archive',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      if (!queueService) {
        res.status(503).json({ success: false, error: 'Agent queue not initialized' });
        return;
      }

      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const taskKey = (req.params['taskKey'] as string | undefined)?.trim();
      if (!taskKey) {
        res.status(400).json({ success: false, error: 'Recurring task key is required' });
        return;
      }

      const { db } = req.firebase!;
      const docRef = db.collection(RECURRING_TASKS_COLLECTION).doc(taskKey);
      const snapshot = await docRef.get();
      const data = snapshot.data() as Record<string, unknown> | undefined;

      if (!snapshot.exists || data?.['userId'] !== user.uid) {
        res.status(404).json({ success: false, error: 'Recurring task not found' });
        return;
      }

      const removed = await queueService.removeRecurringJob(taskKey);
      if (!removed) {
        logger.warn('Recurring task archive aborted because BullMQ repeatable key was not found', {
          userId: user.uid,
          taskKey,
        });

        const initialRunJobId = readRecurringTaskInitialJobId(data);
        if (initialRunJobId) {
          await queueService.cancel(initialRunJobId).catch(() => false);
        }
        res.status(409).json({
          success: false,
          error:
            'Recurring task scheduler entry not found. Archive aborted to avoid metadata drift.',
        });
        return;
      }

      await docRef.delete();

      logger.info('Recurring task archived', { userId: user.uid, taskKey });
      res.json({ success: true });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to archive recurring task', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to archive recurring task' });
    }
  }
);

// ─── GET /dashboard ───────────────────────────────────────────────────────

router.get('/dashboard', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const userDoc = await db.collection('Users').doc(user.uid).get();
    const userData = userDoc.data() ?? {};
    const role: string = userData['role'] ?? 'athlete';
    const agentGoals: AgentDashboardGoal[] = userData['agentGoals'] ?? [];

    const appConfig = await getAgentAppConfig(db);
    const dynamicCoordinators = resolveConfiguredCoordinatorsForRole(role, appConfig);
    const suggestedActionsDoc = await db
      .collection('Users')
      .doc(user.uid)
      .collection('agent_suggested_actions')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    const suggestedActionsPayload: Record<string, unknown> | null = suggestedActionsDoc.empty
      ? null
      : (suggestedActionsDoc.docs[0].data() as Record<string, unknown>);

    if (!suggestedActionsPayload) {
      // Fire-and-forget — do NOT block the dashboard response waiting for an LLM call.
      // The client will get an empty suggested actions list on first load and will
      // receive the generated actions on the next dashboard request.
      logger.info('Triggering first-load suggested actions generation in background', {
        userId: user.uid,
        role,
      });
      getGenerationService()
        .generateWeeklySuggestedActions(user.uid, true, db)
        .catch((err) =>
          logger.warn('Failed to generate first-load suggested actions during dashboard request', {
            userId: user.uid,
            error: err instanceof Error ? err.message : String(err),
          })
        );
    }

    const suggestedActionsByCoordinator = new Map<string, readonly ShellActionChip[]>();
    if (suggestedActionsPayload) {
      const generatedCoordinators = Array.isArray(suggestedActionsPayload['coordinators'])
        ? (suggestedActionsPayload['coordinators'] as Array<Record<string, unknown>>)
        : [];

      for (const item of generatedCoordinators) {
        const coordinatorId = String(item['coordinatorId'] ?? '').trim();
        const actions = Array.isArray(item['actions'])
          ? (item['actions'] as ShellActionChip[])
          : [];

        if (coordinatorId && actions.length > 0) {
          suggestedActionsByCoordinator.set(coordinatorId, actions);
        }
      }
    }

    const coordinators = dynamicCoordinators.map((coordinator) => ({
      ...coordinator,
      suggestedActions: suggestedActionsByCoordinator.get(coordinator.id) ?? [],
    }));

    const briefingDoc = await db
      .collection('Users')
      .doc(user.uid)
      .collection('agent_briefings')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    let briefingInsights: ShellBriefingInsight[] = [];
    let briefingPreviewText = '';
    let briefingGeneratedAt: string | null = null;

    if (!briefingDoc.empty) {
      const bData = briefingDoc.docs[0].data();
      if ((bData['insights'] as unknown[])?.length) {
        briefingInsights = bData['insights'] as ShellBriefingInsight[];
      }
      if (bData['previewText']) {
        briefingPreviewText = bData['previewText'] as string;
      }
      briefingGeneratedAt = (bData['generatedAt'] as string) ?? briefingGeneratedAt;
    }

    const playbookDoc = await db
      .collection('Users')
      .doc(user.uid)
      .collection('agent_playbooks')
      .orderBy('generatedAt', 'desc')
      .limit(10)
      .get();

    let playbookItems: ShellWeeklyPlaybookItem[] = [];
    let playbookGeneratedAt: string | null = null;

    const latestRealPlaybook = playbookDoc.docs.find((doc: FirestoreDocLike) => {
      const items = (doc.data()['items'] ?? []) as ShellWeeklyPlaybookItem[];
      return !isLegacyFallbackPlaybook(items);
    });

    if (latestRealPlaybook) {
      const pData = latestRealPlaybook.data();
      playbookItems = (pData['items'] ?? []) as ShellWeeklyPlaybookItem[];
      playbookGeneratedAt = (pData['generatedAt'] as string) ?? null;
    }

    // Safety net for new users who land on /agent with no briefing.
    // This covers the case where onboarding completed without goals set AND
    // the front-end fire-and-forget somehow failed (e.g. nav happened before
    // the HTTP request resolved). force=false means it's a no-op if a briefing
    // was already generated today.
    if (briefingInsights.length === 0) {
      getGenerationService()
        .generateBriefing(user.uid, false, db)
        .catch((err) =>
          logger.warn('Background initial briefing generation failed', {
            userId: user.uid,
            error: err instanceof Error ? err.message : String(err),
          })
        );
    }

    res.json({
      success: true,
      data: {
        briefing: {
          previewText: briefingPreviewText,
          insights: briefingInsights,
          generatedAt: briefingGeneratedAt,
        },
        playbook: {
          ...(latestRealPlaybook ? { id: latestRealPlaybook.id } : {}),
          items: playbookItems,
          goals: agentGoals,
          generatedAt: playbookGeneratedAt,
          canRegenerate: agentGoals.length > 0,
        },
        coordinators,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get agent dashboard', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

// ─── POST /goals ──────────────────────────────────────────────────────────

router.post('/goals', appGuard, validateBody(SetGoalsDto), async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { goals } = req.body as SetGoalsDto;
    const { db } = req.firebase!;

    const plainGoals = goals.map((g) => ({
      id: g.id,
      text: g.text,
      category: g.category,
      ...(g.createdAt ? { createdAt: g.createdAt } : {}),
    }));

    await db
      .collection('Users')
      .doc(user.uid)
      .set(
        { agentGoals: plainGoals, agentGoalsUpdatedAt: new Date().toISOString() },
        { merge: true }
      );

    logger.info('Agent goals updated', { userId: user.uid, goalCount: goals.length });

    // Invalidate the agent context cache so the next AI request sees the new goals.
    contextBuilder?.invalidateContext(user.uid).catch(() => {
      /* non-critical */
    });

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to set agent goals', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to save goals' });
  }
});

// ─── POST /goals/:goalId/complete ─────────────────────────────────────────

router.post(
  '/goals/:goalId/complete',
  appGuard,
  validateBody(CompleteGoalDto),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { goalId } = req.params as { goalId: string };
      const { notes } = req.body as CompleteGoalDto;
      const { db } = req.firebase!;

      logger.info('Complete goal request received', { userId: user.uid, goalId });

      const userRef = db.collection('Users').doc(user.uid);
      const userDoc = await userRef.get();
      const userData = userDoc.data() ?? {};
      const agentGoals: AgentDashboardGoal[] = (userData['agentGoals'] ??
        []) as AgentDashboardGoal[];
      const role = (userData['role'] ?? 'athlete') as string;

      const goal = agentGoals.find((g) => g.id === goalId);
      // Allow completion even if the goal was already removed from agentGoals
      // (e.g. optimistic UI removed it before the request landed).
      // Fall back to the goal_history record if it exists.
      let resolvedGoal = goal;
      if (!resolvedGoal) {
        const histDoc = await userRef.collection('goal_history').doc(goalId).get();
        if (histDoc.exists) {
          resolvedGoal = histDoc.data() as AgentDashboardGoal;
        }
      }
      if (!resolvedGoal) {
        res.status(404).json({ success: false, error: 'Goal not found' });
        return;
      }

      const now = new Date().toISOString();
      const createdAtMs = resolvedGoal.createdAt
        ? new Date(resolvedGoal.createdAt).getTime()
        : Date.now();
      const daysToComplete = Math.max(0, Math.round((Date.now() - createdAtMs) / 86_400_000));

      const completedGoal: CompletedGoalRecord = {
        id: `${goalId}_${Date.now()}`,
        goalId,
        text: resolvedGoal.text,
        category: resolvedGoal.category,
        ...(resolvedGoal.icon ? { icon: resolvedGoal.icon } : {}),
        createdAt: resolvedGoal.createdAt,
        completedAt: now,
        role,
        daysToComplete,
        ...(notes ? { notes } : {}),
      };

      // Mark existing goal_history record as completed (or create one if missing),
      // and remove from active goals atomically.
      const batch = db.batch();
      const histRef = userRef.collection('goal_history').doc(goalId);
      const existingHist = await histRef.get();
      if (existingHist.exists) {
        batch.update(histRef, {
          isCompleted: true,
          completedAt: now,
          daysToComplete,
          ...(notes ? { notes } : {}),
        });
      } else {
        batch.set(histRef, {
          ...completedGoal,
          isCompleted: true,
          firstSeenAt: resolvedGoal.createdAt ?? now,
          lastSeenAt: now,
          playbookCount: 0,
        });
      }
      if (goal) {
        // Only update agentGoals if the goal was still in the active list
        batch.update(userRef, {
          agentGoals: agentGoals.filter((g) => g.id !== goalId),
          agentGoalsUpdatedAt: now,
        });
      }
      await batch.commit();

      // ── Sync isCompleted flag to the active cycle doc ──────────────────
      // Find the latest cycle doc and mark it complete so the audit trail
      // reflects the manual completion.
      try {
        const latestPlaybook = await db
          .collection('Users')
          .doc(user.uid)
          .collection('agent_playbooks')
          .orderBy('generatedAt', 'desc')
          .limit(1)
          .get();
        if (!latestPlaybook.empty) {
          const cycleRef = histRef.collection('cycles').doc(latestPlaybook.docs[0].id);
          const cycleDoc = await cycleRef.get();
          if (cycleDoc.exists) {
            await cycleRef.update({ isCompleted: true, completedAt: now });
          }
        }
      } catch {
        // Non-critical — main goal_history already updated
      }

      logger.info('Agent goal completed', {
        userId: user.uid,
        goalId,
        category: goal?.category,
        role,
        daysToComplete,
      });

      // Invalidate agent context cache — goal is removed from agentGoals.
      contextBuilder?.invalidateContext(user.uid).catch(() => {
        /* non-critical */
      });

      res.json({ success: true, data: { completedGoal } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to complete agent goal', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to complete goal' });
    }
  }
);

// ─── GET /goal-history ────────────────────────────────────────────────────

router.get('/goal-history', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const snapshot = await db
      .collection('Users')
      .doc(user.uid)
      .collection('goal_history')
      .orderBy('lastSeenAt', 'desc')
      .limit(50)
      .get();

    const history = snapshot.docs.map((doc: FirestoreDocLike) => {
      const data = doc.data();
      return {
        ...data,
        // Normalise: records created before auto-archive used 'generatedAt' as lastSeenAt
        lastSeenAt: data['lastSeenAt'] ?? data['completedAt'] ?? data['createdAt'],
      };
    });

    logger.info('Goal history fetched', { userId: user.uid, count: history.length });

    res.json({ success: true, data: { history, totalCompleted: history.length } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch goal history', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to fetch goal history' });
  }
});

// ─── POST /upload ─────────────────────────────────────────────────────────
// Upload non-video attachments (images, PDFs, docs) to Firebase Storage.
// Videos use Cloudflare Stream TUS and bypass this endpoint.
// ThreadId may be null on first message (SSE thread event fires after upload starts).
// Falls back to unbound storage path if threadId unavailable.

router.post(
  '/upload',
  appGuard,
  uploadRateLimit,
  agentUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file provided' });
        return;
      }

      const threadId = (req.body?.threadId as string | undefined) ?? null;
      const bucket = req.firebase.storage.bucket();
      const storagePath = AgentMediaLifecycleService.buildStoragePath({
        userId: user.uid,
        threadId,
        mimeType: file.mimetype,
        fileName: file.originalname,
        zone: 'media',
      });

      const { url: signedUrl, expiresAt } = await AgentMediaLifecycleService.saveBufferAndSignRead({
        bucket,
        storagePath,
        buffer: file.buffer,
        mimeType: file.mimetype,
      });

      logger.info('Agent X file uploaded', {
        userId: user.uid,
        threadId: threadId || 'unbound',
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
        signedUrlExpires: new Date(expiresAt).toISOString(),
      });

      res.json({
        success: true,
        data: {
          url: signedUrl,
          storagePath,
          name: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorCode = (error as ErrorWithCode).code;
      const requestUser = (req as AuthenticatedRequest).user;

      // Normalize multer errors to structured 400s
      if (errorCode === 'LIMIT_FILE_SIZE') {
        logger.warn('File upload size limit exceeded', {
          error: error.message,
          userId: requestUser?.uid,
        });
        res.status(400).json({
          success: false,
          error: 'File exceeds maximum size limit (20 MB)',
          code: 'FILE_TOO_LARGE',
        });
        return;
      }

      if (errorCode === 'LIMIT_UNEXPECTED_FILE') {
        logger.warn('Unexpected file in upload', {
          error: error.message,
          userId: requestUser?.uid,
        });
        res.status(400).json({
          success: false,
          error: 'Unexpected file field',
          code: 'INVALID_FILE_FIELD',
        });
        return;
      }

      logger.error('Agent X file upload failed', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to upload file' });
    }
  }
);

// ─── POST /upload/tmp ────────────────────────────────────────────────────────
// Upload a file to the per-type tmp scratch folder. Tmp files are meant to be
// short-lived: a scheduled backend cleanup removes expired tmp objects.
// Workers write here for scraped / generated assets; the frontend may also
// stage files here before committing them to a thread. Identical auth +
// validation as /upload — only the storage path prefix changes.
router.post(
  '/upload/tmp',
  appGuard,
  uploadRateLimit,
  agentUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file provided' });
        return;
      }

      const threadId = (req.body?.threadId as string | undefined) ?? null;
      const bucket = req.firebase.storage.bucket();
      const storagePath = AgentMediaLifecycleService.buildStoragePath({
        userId: user.uid,
        threadId,
        mimeType: file.mimetype,
        fileName: file.originalname,
        zone: 'tmp',
      });

      const { url: signedUrl } = await AgentMediaLifecycleService.saveBufferAndSignRead({
        bucket,
        storagePath,
        buffer: file.buffer,
        mimeType: file.mimetype,
      });

      logger.info('Agent X tmp file uploaded', {
        userId: user.uid,
        threadId: threadId || 'unbound',
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
      });

      res.json({
        success: true,
        data: {
          url: signedUrl,
          storagePath,
          name: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorCode = (error as ErrorWithCode).code;
      const requestUser = (req as AuthenticatedRequest).user;

      if (errorCode === 'LIMIT_FILE_SIZE') {
        logger.warn('Tmp upload size limit exceeded', { userId: requestUser?.uid });
        res.status(400).json({
          success: false,
          error: 'File exceeds maximum size limit (20 MB)',
          code: 'FILE_TOO_LARGE',
        });
        return;
      }
      if (errorCode === 'LIMIT_UNEXPECTED_FILE') {
        res
          .status(400)
          .json({ success: false, error: 'Unexpected file field', code: 'INVALID_FILE_FIELD' });
        return;
      }

      logger.error('Agent X tmp upload failed', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to upload tmp file' });
    }
  }
);

// ─── POST /upload/promote ─────────────────────────────────────────────────────
// Promote a file from tmp/ to media/ via a server-side GCS copy + delete.
// The calling user must own the file (uid in path must match auth uid) and
// the path must contain /tmp/ — prevents misuse on already-permanent files.
//
// Body: { storagePath: string }
// Returns: { url, storagePath, mimeType, sizeBytes }
router.post('/upload/promote', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { storagePath } = req.body as { storagePath?: unknown };
    if (typeof storagePath !== 'string' || !storagePath.trim()) {
      res.status(400).json({ success: false, error: 'storagePath is required' });
      return;
    }

    const bucket = req.firebase.storage.bucket();
    const promoted = await AgentMediaLifecycleService.promoteTmpObject({
      bucket,
      storagePath,
      userId: user.uid,
    });

    logger.info('Agent X tmp file promoted to media', {
      userId: user.uid,
      from: storagePath,
      to: promoted.storagePath,
    });

    res.json({
      success: true,
      data: {
        url: promoted.url,
        storagePath: promoted.storagePath,
        mimeType: promoted.mimeType,
        sizeBytes: promoted.sizeBytes,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.message === 'Forbidden: file does not belong to this user') {
      res.status(403).json({ success: false, error: error.message });
      return;
    }
    if (error.message === 'storagePath must reference a tmp/ folder') {
      res.status(400).json({ success: false, error: error.message, code: 'NOT_TMP_PATH' });
      return;
    }
    if (error.message === 'Invalid storagePath') {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    if (error.message === 'Source file not found') {
      res.status(404).json({ success: false, error: error.message, code: 'FILE_NOT_FOUND' });
      return;
    }
    logger.error('Agent X promote failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to promote file' });
  }
});

// ─── POST /upload/video ────────────────────────────────────────────────────
// Provision a Firebase Storage v4 signed upload URL for Agent X chat video
// attachments. The browser PUTs directly to GCS (no backend buffering), then
// uses the returned read URL as the attachment URL — which MediaTransportResolver
// already treats as isDirectlyPortable (no Cloudflare re-encoding wait).
//
// Body: { fileName: string, mimeType: string, fileSize: number, threadId?: string, nativeUpload?: boolean }
// Returns: { uploadUrl, readUrl, storagePath, expiresAt }
router.post('/upload/video', appGuard, uploadRateLimit, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { fileName, mimeType, fileSize, threadId, nativeUpload } = req.body as {
      fileName?: unknown;
      mimeType?: unknown;
      fileSize?: unknown;
      threadId?: unknown;
      nativeUpload?: unknown;
    };

    // ── Validate inputs ───────────────────────────────────────────────────
    if (typeof fileName !== 'string' || !fileName.trim()) {
      res.status(400).json({ success: false, error: 'fileName is required' });
      return;
    }
    if (typeof mimeType !== 'string' || !mimeType.startsWith('video/')) {
      res.status(400).json({
        success: false,
        error: 'mimeType must be a video/* MIME type',
        code: 'INVALID_MIME_TYPE',
      });
      return;
    }
    if (typeof fileSize !== 'number' || fileSize <= 0) {
      res.status(400).json({ success: false, error: 'fileSize must be a positive number' });
      return;
    }
    const isNativeUpload = nativeUpload === true;
    if (!isNativeUpload && fileSize >= AGENT_X_VIDEO_CLOUDFLARE_THRESHOLD_BYTES) {
      res.status(413).json({
        success: false,
        error: `Videos ${formatSizeLabel(AGENT_X_VIDEO_CLOUDFLARE_THRESHOLD_BYTES)} and larger must use Cloudflare Stream TUS.`,
        code: 'USE_CLOUDFLARE_TUS',
      });
      return;
    }
    if (fileSize > AGENT_X_FIREBASE_MAX_VIDEO_FILE_SIZE) {
      res.status(400).json({
        success: false,
        error: `File exceeds Firebase video upload limit (${formatSizeLabel(AGENT_X_FIREBASE_MAX_VIDEO_FILE_SIZE)}). Large Agent X videos must use Cloudflare Stream TUS.`,
        code: 'FILE_TOO_LARGE',
      });
      return;
    }

    const resolvedThreadId =
      typeof threadId === 'string' && threadId.trim() ? threadId.trim() : null;

    const bucket = req.firebase.storage.bucket();
    const storagePath = AgentMediaLifecycleService.buildStoragePath({
      userId: user.uid,
      threadId: resolvedThreadId,
      mimeType,
      fileName,
      zone: 'media',
    });
    const storageFile = bucket.file(storagePath) as {
      getSignedUrl: (options: {
        version: 'v4';
        action: 'write' | 'read';
        expires: number;
        contentType?: string;
        extensionHeaders?: Record<string, string>;
      }) => Promise<[string]>;
    };

    const uploadExpiresAtMs = Date.now() + resolveVideoUploadUrlTtlMs(fileSize);
    const readExpiresAtMs = Date.now() + AgentMediaLifecycleService.DEFAULT_SIGNED_URL_TTL_MS;

    const [uploadUrl, readUrl] = await Promise.all([
      getSignedUrlWithTimeout(() =>
        storageFile.getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: uploadExpiresAtMs,
          contentType: mimeType,
        })
      ).then(([url]) => url),
      getSignedUrlWithTimeout(() =>
        storageFile.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: readExpiresAtMs,
        })
      ).then(([url]) => url),
    ]);

    logger.info('Agent X video upload URL provisioned (firebase)', {
      userId: user.uid,
      threadId: resolvedThreadId ?? 'unbound',
      mimeType,
      fileSize,
      nativeUpload: isNativeUpload,
      storagePath,
      uploadExpiresAt: new Date(uploadExpiresAtMs).toISOString(),
      readExpiresAt: new Date(readExpiresAtMs).toISOString(),
      bucketName: bucket.name,
    });

    res.json({
      success: true,
      data: {
        uploadUrl,
        readUrl,
        storagePath,
        expiresAt: new Date(readExpiresAtMs).toISOString(),
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const isTimeout = error.message.includes('timed out');
    logger.error('Agent X video upload provisioning failed', {
      error: error.message,
      stack: error.stack,
      timedOut: isTimeout,
    });
    if (isTimeout) {
      res.status(503).json({
        success: false,
        error: 'Storage service temporarily unavailable. Please try again.',
        code: 'STORAGE_TIMEOUT',
      });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to provision video upload URL' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── Diagram Assets REST CRUD ────────────────────────────────────────────────

router.get('/diagram-assets', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const sport = normalizeDiagramSportFilter(req.query['sport']);
    const kindParam = normalizeString(req.query['kind']);
    const kind = DIAGRAM_ASSET_KIND_VALUES.includes(kindParam as BoardDiagramKind)
      ? (kindParam as BoardDiagramKind)
      : null;
    const limit = parsePositiveInt(req.query['limit'], 50, 100);
    const assetService = new BoardDiagramAssetService(db);

    const diagrams = (await assetService.listByUser(user.uid, limit))
      .filter((asset) => (sport ? normalizeDiagramSportFilter(asset.sport) === sport : true))
      .filter((asset) => (kind ? asset.kind === kind : true))
      .map(toDiagramAssetSummary);

    logger.info('GET /diagram-assets', {
      userId: user.uid,
      sport: sport ?? null,
      kind,
      count: diagrams.length,
    });

    res.json({ success: true, data: { diagrams, count: diagrams.length } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('GET /diagram-assets failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to load diagrams' });
  }
});

router.get('/diagram-assets/:assetId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const assetId = normalizeString(req.params['assetId']);
    if (!assetId) {
      res.status(400).json({ success: false, error: 'assetId is required' });
      return;
    }

    const assetService = new BoardDiagramAssetService(req.firebase!.db);
    const asset = await assetService.getById(assetId, user.uid);
    if (!asset) {
      res.status(404).json({ success: false, error: 'Diagram not found' });
      return;
    }

    res.json({ success: true, data: { diagram: toDiagramAssetDetail(asset) } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('GET /diagram-assets/:assetId failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to load diagram' });
  }
});

router.patch('/diagram-assets/:assetId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const assetId = normalizeString(req.params['assetId']);
    if (!assetId) {
      res.status(400).json({ success: false, error: 'assetId is required' });
      return;
    }

    const parsed = diagramAssetPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }

    let asset: BoardDiagramAsset | null;
    if (parsed.data.sourceLayout) {
      const boardDiagramService = new BoardDiagramService(llmService ?? undefined);
      const sourceLayout = {
        ...parsed.data.sourceLayout,
        sport: normalizeSportId(parsed.data.sourceLayout.sport),
      };
      asset = await boardDiagramService.saveManualEdits(
        {
          assetId,
          userId: user.uid,
          title: parsed.data.title,
          description: parsed.data.description,
          sourceLayout,
        },
        { userId: user.uid, environment: req.isStaging ? 'staging' : 'production' }
      );
    } else {
      const assetService = new BoardDiagramAssetService(req.firebase!.db);
      asset = await assetService.patch(assetId, user.uid, {
        title: parsed.data.title,
        description: parsed.data.description,
      });
    }

    if (!asset) {
      res.status(404).json({ success: false, error: 'Diagram not found' });
      return;
    }

    logger.info('PATCH /diagram-assets/:assetId', {
      userId: user.uid,
      assetId,
      fields: Object.keys(parsed.data),
    });

    res.json({ success: true, data: { diagram: toDiagramAssetDetail(asset) } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('PATCH /diagram-assets/:assetId failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to update diagram' });
  }
});

router.delete('/diagram-assets/:assetId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const assetId = normalizeString(req.params['assetId']);
    if (!assetId) {
      res.status(400).json({ success: false, error: 'assetId is required' });
      return;
    }

    const assetService = new BoardDiagramAssetService(req.firebase!.db);
    const deleted = await assetService.softDelete(assetId, user.uid);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Diagram not found' });
      return;
    }

    logger.info('DELETE /diagram-assets/:assetId', { userId: user.uid, assetId });
    res.json({ success: true, data: { id: assetId, deleted: true } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('DELETE /diagram-assets/:assetId failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to delete diagram' });
  }
});

// TeamPlaybooks REST CRUD
// GET    /playbooks              — list playbooks for a team
// GET    /playbooks/:id          — get full playbook detail
// POST   /playbooks              — create a new playbook
// PATCH  /playbooks/:id          — update playbook metadata
// DELETE /playbooks/:id          — archive a playbook (soft-delete)
// POST   /playbooks/:id/plays    — append a play
// PATCH  /playbooks/:id/plays/:i — update play by index
// DELETE /playbooks/:id/plays/:i — remove play by index
// POST   /playbooks/:id/export-pdf — export current tab/full packet to PDF
// ═══════════════════════════════════════════════════════════════════════════

const TEAM_PLAYBOOKS_COLLECTION = 'TeamPlaybooks';
const TEAM_CALLSHEETS_COLLECTION = 'TeamCallsheets';
const TEAM_PRACTICE_SCRIPTS_COLLECTION = 'TeamPracticeScripts';

/** Title-case every word in a string. */
function titleCaseStr(s: string): string {
  return s.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Title-case every element in a string array (or return []). */
function titleCaseArr(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => titleCaseStr(v));
}

/** Rebuild concept / formation / personnel / category indexes from plays array. */
function buildPlayIndexes(plays: Record<string, unknown>[]): Record<string, string[]> {
  const concepts = new Set<string>();
  const formations = new Set<string>();
  const personnel = new Set<string>();
  const categories = new Set<string>();

  for (const play of plays) {
    const formation = play['formation'];
    const pers = play['personnel'];
    const cat = play['category'];
    const tags = play['conceptTags'];
    if (typeof formation === 'string' && formation.trim()) formations.add(formation.trim());
    if (typeof pers === 'string' && pers.trim()) personnel.add(pers.trim());
    if (typeof cat === 'string' && cat.trim()) categories.add(cat.trim());
    if (Array.isArray(tags)) {
      for (const t of tags) {
        if (typeof t === 'string' && t.trim()) concepts.add(titleCaseStr(t));
      }
    }
  }

  return {
    conceptTagIndex: [...concepts].sort(),
    formationIndex: [...formations].sort(),
    personnelIndex: [...personnel].sort(),
    categoryIndex: [...categories].sort(),
  };
}

const callsheetAiOutputSchema = z.object({
  plays: z.array(
    z.object({
      playName: z.string().min(1),
      score: z.number().min(0).max(100),
      reasoning: z.string().min(1),
    })
  ),
});

const practiceScriptPeriodSchema = z.object({
  id: z.string().trim().optional(),
  label: z.string().trim().min(1),
  clock: z.string().trim().min(1),
  reps: z.number().int().min(0).max(99),
  callType: z.string().trim().min(1),
  playName: z.string().trim().min(1),
  coachingPoint: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const practiceScriptAiOutputSchema = z.object({
  title: z.string().trim().min(1),
  focus: z.string().trim().min(1),
  tempo: z.string().trim().min(1),
  objectives: z.array(z.string().trim().min(1)).max(10).default([]),
  periods: z.array(practiceScriptPeriodSchema).min(6).max(48),
  notes: z.string().trim().optional(),
});

const installPlanOutputSchema = z.object({
  updates: z.array(
    z.object({
      playIndex: z.number().int().min(0),
      installStage: z.enum(['install', 'rep', 'game-ready']),
      reasoning: z.string().min(1),
    })
  ),
});

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function splitSituationTerms(situation: string): string[] {
  return situation
    .split(/[|,]/g)
    .map((part) =>
      part
        .replace(/^[^:]+:\s*/, '')
        .trim()
        .toLowerCase()
    )
    .filter((part) => part.length > 0);
}

function normalizePlayName(play: Record<string, unknown>, fallbackIndex: number): string {
  const name = typeof play['name'] === 'string' ? play['name'].trim() : '';
  if (name.length > 0) return name;
  const title = typeof play['title'] === 'string' ? play['title'].trim() : '';
  if (title.length > 0) return title;
  return `Play ${fallbackIndex + 1}`;
}

function deterministicCallsheetRanking(
  plays: readonly Record<string, unknown>[],
  situation: string
): Array<{ playName: string; score: number; reasoning: string }> {
  const terms = splitSituationTerms(situation);

  return plays
    .map((play, index) => {
      const playName = normalizePlayName(play, index);
      const successRate =
        typeof play['successRate'] === 'number' ? Math.max(0, Math.min(play['successRate'], 1)) : 0;
      const situations = Array.isArray(play['situations'])
        ? play['situations']
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => normalizeToken(entry))
        : [];
      const concepts = Array.isArray(play['conceptTags'])
        ? play['conceptTags']
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => normalizeToken(entry))
        : [];
      const objective =
        typeof play['objective'] === 'string' ? play['objective'].toLowerCase() : '';

      const matches = terms.filter((term) => {
        if (!term) return false;
        return (
          situations.includes(term) ||
          situations.some((value) => value.includes(term)) ||
          concepts.some((value) => value.includes(term)) ||
          objective.includes(term)
        );
      });

      const score = Math.max(0, Math.min(100, Math.round(successRate * 70 + matches.length * 15)));
      const reasoning =
        matches.length > 0
          ? `Matched ${matches.length} situation signal(s): ${matches.join(', ')}.`
          : 'Selected from baseline success and concept fit.';

      return { playName, score, reasoning };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 12);
}

/** Summarize a TeamPlaybooks doc for the list response. */
function toPlaybookSummary(id: string, data: Record<string, unknown>): Record<string, unknown> {
  const plays = Array.isArray(data['plays']) ? (data['plays'] as unknown[]) : [];
  return {
    id,
    teamId: data['teamId'],
    sport: data['sport'],
    name: data['name'],
    title: data['title'],
    season: data['season'],
    source: data['source'],
    sourceUrl: data['sourceUrl'],
    playCount: typeof data['playCount'] === 'number' ? data['playCount'] : plays.length,
    conceptTagCount: Array.isArray(data['conceptTagIndex']) ? data['conceptTagIndex'].length : 0,
    formationCount: Array.isArray(data['formationIndex']) ? data['formationIndex'].length : 0,
    personnelCount: Array.isArray(data['personnelIndex']) ? data['personnelIndex'].length : 0,
    categoryCount: Array.isArray(data['categoryIndex']) ? data['categoryIndex'].length : 0,
    archived: data['archived'] === true,
    updatedAt: data['updatedAt'],
    createdAt: data['createdAt'],
  };
}

function toCallsheetSummary(id: string, data: Record<string, unknown>): Record<string, unknown> {
  const plays = Array.isArray(data['plays']) ? (data['plays'] as unknown[]) : [];
  const groups = Array.isArray(data['groups']) ? (data['groups'] as unknown[]) : [];
  const topPlay =
    plays.find((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Record<string, unknown>;
      const name = normalizeString(candidate['playName']) ?? normalizeString(candidate['name']);
      return Boolean(name);
    }) ?? null;

  return {
    id,
    teamId: normalizeString(data['teamId']),
    playbookId: normalizeString(data['playbookId']),
    sport: normalizeString(data['sport']),
    title: normalizeString(data['title']) ?? 'Untitled Callsheet',
    situation: normalizeString(data['situation']) ?? 'all situations',
    playCount: plays.length,
    groupCount: groups.length,
    topPlayName:
      topPlay && typeof topPlay === 'object'
        ? (normalizeString((topPlay as Record<string, unknown>)['playName']) ??
          normalizeString((topPlay as Record<string, unknown>)['name']))
        : null,
    archived: data['archived'] === true,
    updatedAt: normalizeString(data['updatedAt']),
    createdAt: normalizeString(data['createdAt']),
  };
}

function normalizePracticeScriptPeriods(value: unknown): Array<{
  id: string;
  label: string;
  clock: string;
  reps: number;
  callType: string;
  playName: string;
  coachingPoint?: string;
  notes?: string;
}> {
  if (!Array.isArray(value)) return [];

  const normalized: Array<{
    id: string;
    label: string;
    clock: string;
    reps: number;
    callType: string;
    playName: string;
    coachingPoint?: string;
    notes?: string;
  }> = [];

  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const candidate = entry as Record<string, unknown>;
    const label = normalizeString(candidate['label']) ?? '';
    const clock = normalizeString(candidate['clock']) ?? '';
    const playName = normalizeString(candidate['playName']) ?? '';
    const callType = normalizeString(candidate['callType']) ?? 'Team';
    const repsRaw = Number(candidate['reps']);

    if (!label || !clock || !playName) return;

    normalized.push({
      id: normalizeString(candidate['id']) ?? `period_${index + 1}`,
      label,
      clock,
      reps: Number.isFinite(repsRaw) ? Math.max(0, Math.min(99, Math.round(repsRaw))) : 0,
      callType,
      playName,
      coachingPoint: normalizeString(candidate['coachingPoint']) ?? undefined,
      notes: normalizeString(candidate['notes']) ?? undefined,
    });
  });

  return normalized;
}

function toPracticeScriptSummary(
  id: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const periods = normalizePracticeScriptPeriods(data['periods']);
  const totalReps = periods.reduce((sum, period) => sum + period.reps, 0);
  const displayOrder = Number(data['displayOrder']);

  return {
    id,
    teamId: normalizeString(data['teamId']),
    playbookId: normalizeString(data['playbookId']),
    sport: normalizeString(data['sport']),
    title: normalizeString(data['title']) ?? 'Practice Script',
    focus: normalizeString(data['focus']) ?? 'Weekly install',
    tempo: normalizeString(data['tempo']) ?? 'Game Tempo',
    scriptDate: normalizeString(data['scriptDate']),
    opponent: normalizeString(data['opponent']),
    totalPeriods: periods.length,
    totalReps,
    displayOrder: Number.isFinite(displayOrder) ? displayOrder : undefined,
    archived: data['archived'] === true,
    updatedAt: normalizeString(data['updatedAt']),
    createdAt: normalizeString(data['createdAt']),
  };
}

function buildFallbackPracticeScript(
  playbook: Record<string, unknown>,
  focus: string
): {
  title: string;
  focus: string;
  tempo: string;
  objectives: string[];
  periods: Array<{
    id: string;
    label: string;
    clock: string;
    reps: number;
    callType: string;
    playName: string;
    coachingPoint?: string;
    notes?: string;
  }>;
  notes: string;
} {
  const plays = Array.isArray(playbook['plays'])
    ? (playbook['plays'] as Record<string, unknown>[])
    : [];
  const selected = plays.slice(0, 12);
  const title = `${safeExportText(playbook['name'], 'Practice')} Script`;
  const normalizedFocus = focus.trim() || 'Weekly install and execution';

  const periods = selected.map((play, index) => {
    const playName = normalizePlayName(play, index);
    const coachingPoint = Array.isArray(play['coachingPoints'])
      ? normalizeString(play['coachingPoints'][0])
      : undefined;
    return {
      id: `period_${index + 1}`,
      label: `Period ${index + 1}`,
      clock: `${String(7 + (index % 4)).padStart(2, '0')}:00`,
      reps: index < 4 ? 6 : 4,
      callType: index < 4 ? 'Install' : index < 8 ? 'Team' : 'Situational',
      playName,
      coachingPoint: coachingPoint ?? 'Execute fundamentals with tempo and communication.',
      notes: index % 3 === 0 ? 'Coach script emphasis and substitutions.' : undefined,
    };
  });

  return {
    title,
    focus: normalizedFocus,
    tempo: 'Game Tempo',
    objectives: [
      'Script high-leverage reps for core calls.',
      'Reinforce communication and assignment integrity.',
      'Finish with situational execution under pressure.',
    ],
    periods:
      periods.length > 0
        ? periods
        : [
            {
              id: 'period_1',
              label: 'Period 1',
              clock: '10:00',
              reps: 8,
              callType: 'Install',
              playName: 'Base Install',
              coachingPoint: 'Set baseline alignments and communication.',
            },
          ],
    notes:
      'Coach script generated from current playbook inventory. Adjust personnel and tempo per practice calendar.',
  };
}

function normalizeCallsheetPlays(
  value: unknown
): Array<{ playName: string; score: number; reasoning: string }> {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const candidate = entry as Record<string, unknown>;
      const playName =
        normalizeString(candidate['playName']) ?? normalizeString(candidate['name']) ?? '';
      if (!playName) return null;
      const scoreRaw = Number(candidate['score']);
      const score = Number.isFinite(scoreRaw)
        ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
        : 0;
      const reasoning =
        normalizeString(candidate['reasoning']) ??
        'Selected from baseline success and concept fit.';
      return {
        playName,
        score,
        reasoning,
      };
    })
    .filter((entry): entry is { playName: string; score: number; reasoning: string } =>
      Boolean(entry)
    );
}

function normalizeCallsheetGroups(
  value: unknown,
  plays: readonly { playName: string; score: number; reasoning: string }[]
): Array<{ id: string; name: string; playNames: string[]; order: number }> {
  const playNames = plays
    .map((play) => normalizeString(play.playName) ?? '')
    .filter((playName) => playName.length > 0);
  const validPlayNames = new Set(playNames);
  const groupsSource = Array.isArray(value) ? value : [];

  const normalizedGroups = groupsSource
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const candidate = entry as Record<string, unknown>;
      const groupId = normalizeString(candidate['id']) ?? `group_${index + 1}`;
      const groupName = normalizeString(candidate['name']) ?? `Group ${index + 1}`;
      const rawPlayNames = Array.isArray(candidate['playNames']) ? candidate['playNames'] : [];
      const groupPlayNames = Array.from(
        new Set(
          rawPlayNames
            .map((playName) => normalizeString(playName) ?? '')
            .filter((playName) => playName.length > 0 && validPlayNames.has(playName))
        )
      );

      return {
        id: groupId,
        name: groupName,
        playNames: groupPlayNames,
        order: index,
      };
    })
    .filter((entry): entry is { id: string; name: string; playNames: string[]; order: number } =>
      Boolean(entry)
    );

  if (normalizedGroups.length === 0) {
    if (playNames.length === 0) return [];
    return [
      {
        id: 'group_1',
        name: 'Starter',
        playNames,
        order: 0,
      },
    ];
  }

  const assigned = new Set<string>();
  for (const group of normalizedGroups) {
    for (const playName of group.playNames) {
      assigned.add(playName);
    }
  }

  const unassigned = playNames.filter((playName) => !assigned.has(playName));
  if (unassigned.length > 0) {
    normalizedGroups.push({
      id: `group_${normalizedGroups.length + 1}`,
      name: 'Other Calls',
      playNames: unassigned,
      order: normalizedGroups.length,
    });
  }

  return normalizedGroups;
}

const playbookExportTabSchema = z.enum([
  'plays',
  'install',
  'callsheet',
  'play-script',
  'opponent',
]);

const playbookPdfExportBodySchema = z.object({
  teamId: z.string().trim().min(1),
  sport: z.string().trim().optional(),
  mode: z.enum(['current', 'full']).default('current'),
  activeTab: playbookExportTabSchema.default('plays'),
  callsheetFilters: z.record(z.string(), z.string()).optional(),
  callsheetId: z.string().trim().optional(),
  practiceScriptId: z.string().trim().optional(),
});

function safeExportText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function safeExportStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function formatExportLabel(value: string): string {
  const normalized = safeExportText(value);
  if (!normalized) return '';

  const capitalizeToken = (token: string): string => {
    if (!token) return token;
    if (/^[A-Z0-9]{2,}$/.test(token)) return token;
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  };

  return normalized
    .split(/\s+/)
    .map((word) =>
      word
        .split('-')
        .map((token) => capitalizeToken(token))
        .join('-')
    )
    .join(' ');
}

function sanitizeExportFileBase(value: string): string {
  const cleaned = value
    .replace(/[^\w\s\-().]/g, '')
    .replace(/\.{2,}/g, '.')
    .trim();
  return cleaned.length > 0 ? cleaned : 'playbook-export';
}

function resolvePlaybookSituationText(filters: Record<string, string> | undefined): string {
  if (!filters) return 'all situations';
  const entries = Object.entries(filters)
    .map(([key, value]) => [key.trim(), value.trim()] as const)
    .filter(([, value]) => value.length > 0);
  if (entries.length === 0) return 'all situations';
  return entries.map(([key, value]) => `${key}: ${value}`).join(' | ');
}

function mapGamePlanDocToExportSummary(doc: Record<string, unknown>): {
  readonly title: string;
  readonly opponent: string;
  readonly notes: string;
  readonly plays: readonly string[];
} {
  const title =
    safeExportText(doc['title']) || safeExportText(doc['opponentName']) || 'Untitled game plan';
  const opponent = safeExportText(doc['opponentName'], title);
  const linkedPlays = Array.isArray(doc['linkedPlays']) ? doc['linkedPlays'] : [];
  const plays = linkedPlays
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return '';
      return safeExportText((entry as Record<string, unknown>)['playName']);
    })
    .filter((entry) => entry.length > 0);

  let notes = '';
  if (typeof doc['specialSituations'] === 'string') {
    notes = doc['specialSituations'].trim();
  }
  if (!notes && Array.isArray(doc['customSections']) && doc['customSections'].length > 0) {
    const section = doc['customSections'][0];
    if (section && typeof section === 'object') {
      notes = safeExportText((section as Record<string, unknown>)['content']);
    }
  }

  return {
    title,
    opponent,
    notes,
    plays,
  };
}

function resolveTeamBranding(teamData: Record<string, unknown>): {
  readonly organizationName?: string;
  readonly logoUrl?: string;
  readonly brandPrimaryColor?: string;
} {
  const organizationName =
    safeExportText(teamData['name']) || safeExportText(teamData['displayName']) || undefined;
  const logoUrl =
    safeExportText(teamData['logoUrl']) || safeExportText(teamData['logo']) || undefined;

  let brandPrimaryColor = safeExportText(teamData['primaryColor']);
  if (!brandPrimaryColor && teamData['colors'] && typeof teamData['colors'] === 'object') {
    const colors = teamData['colors'] as Record<string, unknown>;
    brandPrimaryColor = safeExportText(colors['primary']);
  }
  if (!brandPrimaryColor && Array.isArray(teamData['colors'])) {
    brandPrimaryColor = safeExportText(teamData['colors'][0]);
  }

  return {
    ...(organizationName ? { organizationName } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    ...(brandPrimaryColor ? { brandPrimaryColor } : {}),
  };
}

function resolveOrganizationIdFromTeamData(teamData: Record<string, unknown>): string | null {
  const directId =
    safeExportText(teamData['organizationId']) ||
    safeExportText(teamData['organizationID']) ||
    safeExportText(teamData['orgId']);
  if (directId) return directId;

  const organizationValue = teamData['organization'];
  if (organizationValue && typeof organizationValue === 'object') {
    const organization = organizationValue as Record<string, unknown>;
    const nestedId =
      safeExportText(organization['id']) ||
      safeExportText(organization['organizationId']) ||
      safeExportText(organization['orgId']);
    if (nestedId) return nestedId;
  }

  return null;
}

async function resolveExportBranding(
  db: FirestoreReadDb,
  teamData: Record<string, unknown>
): Promise<{
  readonly organizationName?: string;
  readonly logoUrl?: string;
  readonly brandPrimaryColor?: string;
}> {
  const teamBranding = resolveTeamBranding(teamData);
  const organizationId = resolveOrganizationIdFromTeamData(teamData);
  if (!organizationId) return teamBranding;

  try {
    const organizationSnap = await db.collection('Organizations').doc(organizationId).get();
    if (!organizationSnap.exists) return teamBranding;

    const organizationData = (organizationSnap.data() ?? {}) as Record<string, unknown>;
    const orgBranding = resolveTeamBranding(organizationData);
    return {
      organizationName: orgBranding.organizationName ?? teamBranding.organizationName,
      logoUrl: orgBranding.logoUrl ?? teamBranding.logoUrl,
      brandPrimaryColor: orgBranding.brandPrimaryColor ?? teamBranding.brandPrimaryColor,
    };
  } catch {
    return teamBranding;
  }
}

function buildPdfSection(heading: string, ...paragraphs: readonly string[]): string[] {
  const normalized = paragraphs
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  return normalized.length > 0 ? [`## ${heading}`, ...normalized] : [];
}

type PracticeScriptPdfInput = {
  readonly title: string;
  readonly focus: string;
  readonly tempo: string;
  readonly scriptDate?: string;
  readonly opponent?: string;
  readonly objectives: readonly string[];
  readonly periods: readonly {
    readonly label: string;
    readonly clock: string;
    readonly reps: number;
    readonly callType: string;
    readonly playName: string;
    readonly coachingPoint?: string;
    readonly notes?: string;
  }[];
  readonly notes?: string;
};

type CallsheetPdfInput = {
  readonly title: string;
  readonly situation: string;
  readonly notes?: string;
  readonly plays: readonly {
    readonly playName: string;
    readonly score: number;
    readonly reasoning: string;
  }[];
  readonly groups: readonly { readonly name: string; readonly playNames: readonly string[] }[];
};

function buildCallsheetRows(
  callsheet: CallsheetPdfInput | null,
  fallbackRankings: readonly {
    readonly playName: string;
    readonly score: number;
    readonly reasoning: string;
  }[]
): ExportRow[] {
  const sourcePlays = callsheet?.plays?.length ? callsheet.plays : fallbackRankings;
  const playByName = new Map(sourcePlays.map((play) => [play.playName, play] as const));
  const groupedRows = (callsheet?.groups ?? []).flatMap((group) =>
    group.playNames
      .map((playName) => playByName.get(playName))
      .filter(
        (
          play
        ): play is {
          readonly playName: string;
          readonly score: number;
          readonly reasoning: string;
        } => Boolean(play)
      )
      .map((play) => [group.name, play.playName, `${play.score}/100`, play.reasoning] as ExportRow)
  );

  if (groupedRows.length > 0) return groupedRows;

  return sourcePlays.map((play, index) => [
    index < 6 ? 'Primary Menu' : 'Change-Up Menu',
    play.playName,
    `${play.score}/100`,
    play.reasoning,
  ]);
}

function buildPlayInventoryRows(plays: readonly Record<string, unknown>[]): ExportRow[] {
  return plays.map((play, index) => [
    safeExportText(play['name']) || safeExportText(play['title']) || `Play ${index + 1}`,
    safeExportText(play['series']),
    safeExportText(play['formation']),
    safeExportText(play['personnel']),
    formatExportLabel(safeExportText(play['category'])),
    formatExportLabel(safeExportText(play['installStage'], 'install')),
  ]);
}

function buildPlayInventoryColumns(): ExportColumn[] {
  return [
    { key: 'name', label: 'Play', width: 112 },
    { key: 'series', label: 'Series', width: 70 },
    { key: 'formation', label: 'Formation', width: 82 },
    { key: 'personnel', label: 'Personnel', width: 70 },
    { key: 'category', label: 'Category', width: 70 },
    { key: 'installStage', label: 'Stage', width: 58 },
  ];
}

function buildPlaybookPdfPayload(
  playbook: Record<string, unknown>,
  mode: 'current' | 'full',
  activeTab: z.infer<typeof playbookExportTabSchema>,
  callsheetFilters: Record<string, string> | undefined,
  callsheet: CallsheetPdfInput | null,
  practiceScript: PracticeScriptPdfInput | null,
  gamePlans: readonly {
    readonly title: string;
    readonly opponent: string;
    readonly notes: string;
    readonly plays: readonly string[];
  }[]
): {
  readonly title: string;
  readonly description: string;
  readonly columns?: readonly ExportColumn[];
  readonly rows?: readonly ExportRow[];
  readonly bodyParagraphs?: readonly string[];
  readonly bulletPoints?: readonly string[];
  readonly imageUrls?: readonly string[];
} {
  const playbookName =
    safeExportText(playbook['title']) || safeExportText(playbook['name']) || 'Playbook';
  const sport = safeExportText(playbook['sport'], 'sport');
  const formattedSport = formatExportLabel(sport);
  const season = safeExportText(playbook['season']);
  const plays = Array.isArray(playbook['plays'])
    ? (playbook['plays'] as Record<string, unknown>[])
    : [];

  const headerDescription = `${formattedSport}${season ? ` • ${season}` : ''} • ${plays.length} plays`;
  const imageUrls = plays
    .map((play) => safeExportText(play['diagramUrl']))
    .filter((url) => url.length > 0)
    .slice(0, 24);

  const playRows = buildPlayInventoryRows(plays);
  const playColumns = buildPlayInventoryColumns();

  const callsheetSituation = resolvePlaybookSituationText(callsheetFilters);
  const callsheetRankings = deterministicCallsheetRanking(plays, callsheetSituation);
  const scriptPeriods = practiceScript?.periods ?? [];
  const scriptTotalReps = scriptPeriods.reduce((sum, period) => sum + period.reps, 0);

  const callsheetRows = buildCallsheetRows(callsheet, callsheetRankings);
  const callsheetTitle = callsheet?.title ?? 'AI Callsheet';
  const effectiveCallsheetSituation = callsheet?.situation ?? callsheetSituation;

  const callsheetColumns: ExportColumn[] = [
    { key: 'group', label: 'Group', width: 82 },
    { key: 'playName', label: 'Call', width: 120 },
    { key: 'score', label: 'Grade', width: 46 },
    { key: 'reasoning', label: 'Why It Belongs', width: '*' },
  ];

  if (mode === 'full') {
    const installBulletPoints = plays.flatMap((play, index) => {
      const playName =
        safeExportText(play['name']) || safeExportText(play['title']) || `Play ${index + 1}`;
      const installStage = safeExportText(play['installStage'], 'install');
      const coachingPoint = safeExportStringArray(play['coachingPoints'])[0];
      const drill = safeExportStringArray(play['drillProgression'])[0];
      return [
        `**Install:** ${playName} - ${formatExportLabel(installStage)}`,
        coachingPoint ? `**Coaching Point:** ${coachingPoint}` : '',
        drill ? `**Drill Progression:** ${drill}` : '',
      ].filter((line) => line.length > 0);
    });

    const callsheetBullets = callsheetRows.slice(0, 18).map((row) => {
      return `**${row[0]}:** ${row[1]} (${row[2]}) - ${row[3]}`;
    });

    const practiceBullets = scriptPeriods.slice(0, 20).map((period, index) => {
      return `**Script ${index + 1}:** ${period.label} | ${period.clock} | ${period.callType} | ${period.playName}`;
    });

    const gamePlanBullets = gamePlans.flatMap((plan) => {
      const lines = [`**Game Plan:** ${plan.title} vs ${plan.opponent}`];
      if (plan.plays.length > 0) {
        lines.push(`**Assigned Plays:** ${plan.plays.join(', ')}`);
      }
      if (plan.notes) {
        lines.push(`**Notes:** ${plan.notes}`);
      }
      return lines;
    });

    return {
      title: `${playbookName} - Full Packet`,
      description: headerDescription,
      bodyParagraphs: [
        ...buildPdfSection(
          'Overview',
          `${playbookName} has been formatted as a complete coaching packet for sideline, meeting-room, and install use.`
        ),
        ...buildPdfSection(
          'Install Plan',
          `Progression summary across ${plays.length} plays with emphasis on sequencing, coaching points, and drill flow.`
        ),
        ...buildPdfSection(
          'Callsheet',
          `${callsheetTitle} organized for ${effectiveCallsheetSituation}. ${callsheet?.notes ?? ''}`
        ),
        ...buildPdfSection(
          'Practice Script Notes',
          practiceScript
            ? `${practiceScript.title} • ${scriptPeriods.length} periods • ${scriptTotalReps} total reps.`
            : 'No saved practice script selected for this packet.'
        ),
        ...buildPdfSection(
          'Opponent Planning',
          gamePlans.length > 0
            ? `Loaded ${gamePlans.length} active opponent game plan(s) for inclusion in this packet.`
            : 'No active opponent game plans were found for this team and sport.'
        ),
      ],
      columns: playColumns,
      rows: playRows,
      bulletPoints: [
        ...installBulletPoints,
        ...callsheetBullets,
        ...practiceBullets,
        ...gamePlanBullets,
      ],
      imageUrls,
    };
  }

  if (activeTab === 'install') {
    const installRows: ExportRow[] = plays.map((play, index) => [
      safeExportText(play['name']) || safeExportText(play['title']) || `Play ${index + 1}`,
      formatExportLabel(safeExportText(play['installStage'], 'install')),
      safeExportText(play['formation']),
      safeExportText(play['personnel']),
      formatExportLabel(safeExportText(play['category'])),
      safeExportText(play['series']),
    ]);

    return {
      title: `${playbookName} - Install Plan`,
      description: headerDescription,
      bodyParagraphs: [
        ...buildPdfSection(
          'Install Plan Overview',
          `${playbookName} install sequencing for ${formattedSport}${season ? ` • ${season}` : ''}.`
        ),
      ],
      columns: [
        { key: 'name', label: 'Play', width: 128 },
        { key: 'installStage', label: 'Stage', width: 66 },
        { key: 'formation', label: 'Formation', width: 88 },
        { key: 'personnel', label: 'Personnel', width: 78 },
        { key: 'category', label: 'Category', width: 76 },
        { key: 'series', label: 'Series', width: '*' },
      ],
      rows: installRows,
    };
  }

  if (activeTab === 'callsheet') {
    return {
      title: `${playbookName} - ${callsheetTitle}`,
      description: `${headerDescription} • Situation: ${effectiveCallsheetSituation}`,
      bodyParagraphs: [
        ...buildPdfSection(
          'Callsheet Overview',
          `${callsheetTitle} prioritizes the highest-leverage calls for ${effectiveCallsheetSituation}.`,
          callsheet?.notes ?? ''
        ),
      ],
      columns: callsheetColumns,
      rows: callsheetRows,
    };
  }

  if (activeTab === 'play-script') {
    const scriptRows: ExportRow[] = scriptPeriods.map((period, index) => [
      index + 1,
      period.label,
      period.clock,
      period.reps,
      period.callType,
      period.playName,
      period.coachingPoint ?? '',
      period.notes ?? '',
    ]);

    return {
      title: `${playbookName} - Practice Script Callsheet`,
      description: headerDescription,
      bodyParagraphs: [
        ...buildPdfSection(
          'Practice Script Overview',
          practiceScript
            ? `${practiceScript.title} • Focus: ${practiceScript.focus} • Tempo: ${practiceScript.tempo}${practiceScript.scriptDate ? ` • Date: ${practiceScript.scriptDate}` : ''}${practiceScript.opponent ? ` • Opponent: ${practiceScript.opponent}` : ''}`
            : 'No saved script selected. Build or generate a script in the Practice Scripts tab before exporting.'
        ),
        ...buildPdfSection('Script Objectives', ...(practiceScript?.objectives ?? [])),
        ...buildPdfSection('Coach Notes', practiceScript?.notes ?? ''),
      ],
      columns: [
        { key: 'slot', label: '#', width: 24 },
        { key: 'label', label: 'Period', width: 70 },
        { key: 'clock', label: 'Clock', width: 46 },
        { key: 'reps', label: 'Reps', width: 34 },
        { key: 'callType', label: 'Type', width: 60 },
        { key: 'playName', label: 'Call', width: 96 },
        { key: 'coachingPoint', label: 'Coaching Point', width: '*' },
      ],
      rows: scriptRows.map((row) => row.slice(0, 7)),
      imageUrls,
    };
  }

  if (activeTab === 'opponent') {
    const gamePlanRows: ExportRow[] = gamePlans.map((plan) => [
      plan.title,
      plan.opponent,
      plan.plays.join(', '),
      plan.notes,
    ]);
    return {
      title: `${playbookName} - Game Plans`,
      description: `${headerDescription} • ${gamePlans.length} active plan(s)`,
      bodyParagraphs: [
        ...buildPdfSection(
          'Opponent Planning Overview',
          `This packet summarizes the current opponent-specific plans linked to ${playbookName}.`
        ),
      ],
      columns: [
        { key: 'title', label: 'Plan' },
        { key: 'opponent', label: 'Opponent' },
        { key: 'plays', label: 'Assigned Plays' },
        { key: 'notes', label: 'Notes' },
      ],
      rows: gamePlanRows,
    };
  }

  return {
    title: `${playbookName} - Plays`,
    description: headerDescription,
    bodyParagraphs: [
      ...buildPdfSection(
        'Playbook Overview',
        `${playbookName} organized for staff review, install planning, and gameday reference.`
      ),
    ],
    columns: playColumns,
    rows: playRows,
    imageUrls,
  };
}

function buildGamePlanPdfPayload(gamePlan: TeamGamePlanDoc): {
  readonly title: string;
  readonly description: string;
  readonly columns?: readonly ExportColumn[];
  readonly rows?: readonly ExportRow[];
  readonly bodyParagraphs?: readonly string[];
  readonly bulletPoints?: readonly string[];
  readonly imageUrls?: readonly string[];
} {
  const gamePlanData = gamePlan as unknown as Record<string, unknown>;
  const title =
    safeExportText(gamePlanData['title']) ||
    safeExportText(gamePlanData['opponentName']) ||
    'Game Plan';

  const sport = safeExportText(gamePlanData['sport']);
  const formattedSport = formatExportLabel(sport);
  const phase = safeExportText(gamePlanData['phase']);
  const formattedPhase = formatExportLabel(phase);
  const status = safeExportText(gamePlanData['status']);
  const formattedStatus = formatExportLabel(status);
  const gameDate = safeExportText(gamePlanData['gameDate']);
  const season = safeExportText(gamePlanData['season']);

  const descriptionParts = [formattedSport, season, formattedPhase, formattedStatus, gameDate]
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const description = descriptionParts.length > 0 ? descriptionParts.join(' • ') : 'Team game plan';

  const bodyParagraphs: string[] = [
    ...buildPdfSection(
      'Game Plan Overview',
      `${title} has been formatted as a polished staff-ready scouting and strategy document.`
    ),
  ];
  const scoutingReport = safeExportText(gamePlanData['scoutingReport']);
  bodyParagraphs.push(...buildPdfSection('Scouting Report', scoutingReport));

  const identityFocus = safeExportText(gamePlanData['identityFocus']);
  bodyParagraphs.push(...buildPdfSection('Identity Focus', identityFocus));

  const primaryAttackPlan = safeExportText(gamePlanData['primaryAttackPlan']);
  bodyParagraphs.push(...buildPdfSection('Primary Attack Plan', primaryAttackPlan));

  const defensivePriorities = safeExportText(gamePlanData['defensivePriorities']);
  bodyParagraphs.push(...buildPdfSection('Defensive Priorities', defensivePriorities));

  const specialSituations = safeExportText(gamePlanData['specialSituations']);
  bodyParagraphs.push(...buildPdfSection('Special Situations', specialSituations));

  const bulletPoints: string[] = [];

  const sectionBullets = {
    priorities: [] as string[],
    planBlocks: [] as string[],
    halftime: [] as string[],
    adjustmentTriggers: [] as string[],
  };
  const priorities = Array.isArray(gamePlanData['priorities'])
    ? (gamePlanData['priorities'] as unknown[])
    : [];
  for (const entry of priorities) {
    if (!entry || typeof entry !== 'object') continue;
    const priority = entry as Record<string, unknown>;
    const label = safeExportText(priority['title']) || safeExportText(priority['label']);
    const rationale =
      safeExportText(priority['objective']) ||
      safeExportText(priority['content']) ||
      safeExportText(priority['rationale']) ||
      safeExportText(priority['notes']);
    if (label && rationale) sectionBullets.priorities.push(`**Priority:** ${label} — ${rationale}`);
    else if (label) sectionBullets.priorities.push(`**Priority:** ${label}`);
  }

  const planBlocks = Array.isArray(gamePlanData['planBlocks'])
    ? (gamePlanData['planBlocks'] as unknown[])
    : [];
  for (const entry of planBlocks) {
    if (!entry || typeof entry !== 'object') continue;
    const block = entry as Record<string, unknown>;
    const label = safeExportText(block['title']) || safeExportText(block['label']);
    const focus =
      safeExportText(block['content']) ||
      safeExportText(block['objective']) ||
      safeExportText(block['focus']);
    if (label && focus) sectionBullets.planBlocks.push(`**Plan Block:** ${label} — ${focus}`);
    else if (label) sectionBullets.planBlocks.push(`**Plan Block:** ${label}`);
  }

  const halftimePriorities = Array.isArray(gamePlanData['halftimePriorities'])
    ? (gamePlanData['halftimePriorities'] as unknown[])
    : [];
  for (const entry of halftimePriorities) {
    if (typeof entry === 'string') {
      const line = entry.trim();
      if (line) sectionBullets.halftime.push(`**Halftime:** ${line}`);
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const halftime = entry as Record<string, unknown>;
    const label = safeExportText(halftime['label']) || safeExportText(halftime['title']);
    const content = safeExportText(halftime['content']) || safeExportText(halftime['objective']);
    if (label && content) sectionBullets.halftime.push(`**Halftime:** ${label} — ${content}`);
    else if (label) sectionBullets.halftime.push(`**Halftime:** ${label}`);
    else if (content) sectionBullets.halftime.push(`**Halftime:** ${content}`);
  }

  const adjustmentTriggers = Array.isArray(gamePlanData['adjustmentTriggers'])
    ? (gamePlanData['adjustmentTriggers'] as unknown[])
    : [];
  for (const entry of adjustmentTriggers) {
    if (!entry || typeof entry !== 'object') continue;
    const trigger = entry as Record<string, unknown>;
    const condition =
      safeExportText(trigger['trigger']) ||
      safeExportText(trigger['when']) ||
      safeExportText(trigger['condition']);
    const action = safeExportText(trigger['adjustment']) || safeExportText(trigger['response']);
    const diagnosis = safeExportText(trigger['diagnosis']);
    const expectedOutcome = safeExportText(trigger['expectedOutcome']);

    if (condition && action) {
      sectionBullets.adjustmentTriggers.push(`**Adjustment Trigger:** ${condition} -> ${action}`);
    } else if (condition) {
      sectionBullets.adjustmentTriggers.push(`**Adjustment Trigger:** ${condition}`);
    }
    if (diagnosis) {
      sectionBullets.adjustmentTriggers.push(`**Diagnosis:** ${diagnosis}`);
    }
    if (expectedOutcome) {
      sectionBullets.adjustmentTriggers.push(`**Expected Outcome:** ${expectedOutcome}`);
    }
  }

  if (sectionBullets.priorities.length > 0) {
    bulletPoints.push('## Strategic Priorities', ...sectionBullets.priorities);
  }
  if (sectionBullets.planBlocks.length > 0) {
    bulletPoints.push('## Plan Blocks', ...sectionBullets.planBlocks);
  }
  if (sectionBullets.halftime.length > 0) {
    bulletPoints.push('## Halftime Priorities', ...sectionBullets.halftime);
  }
  if (sectionBullets.adjustmentTriggers.length > 0) {
    bulletPoints.push('## Adjustment Triggers', ...sectionBullets.adjustmentTriggers);
  }

  const customSections = Array.isArray(gamePlanData['customSections'])
    ? (gamePlanData['customSections'] as unknown[])
    : [];
  for (const entry of customSections) {
    if (!entry || typeof entry !== 'object') continue;
    const section = entry as Record<string, unknown>;
    const heading =
      safeExportText(section['title']) ||
      safeExportText(section['heading']) ||
      safeExportText(section['key']);
    const content = safeExportText(section['content']);
    bodyParagraphs.push(...buildPdfSection(heading || 'Additional Notes', content));
  }

  const linkedPlays = Array.isArray(gamePlanData['linkedPlays'])
    ? (gamePlanData['linkedPlays'] as unknown[])
    : [];
  const linkedPlayRows: ExportRow[] = [];
  const imageUrls: string[] = [];

  for (const entry of linkedPlays) {
    if (!entry || typeof entry !== 'object') continue;
    const play = entry as Record<string, unknown>;
    const playName = safeExportText(play['playName']) || safeExportText(play['title']) || 'Play';
    const usage = safeExportText(play['usage']);
    const formation = safeExportText(play['formation']);
    const personnel = safeExportText(play['personnel']);
    const situation = safeExportText(play['situation']);
    const notes = safeExportText(play['notes']) || safeExportText(play['reason']);
    linkedPlayRows.push([playName, usage, formation, personnel, situation, notes]);

    const diagramUrl = safeExportText(play['diagramUrl']);
    if (diagramUrl) imageUrls.push(diagramUrl);
  }

  return {
    title,
    description,
    ...(bodyParagraphs.length > 0 ? { bodyParagraphs } : {}),
    ...(bulletPoints.length > 0 ? { bulletPoints } : {}),
    ...(linkedPlayRows.length > 0
      ? {
          columns: [
            { key: 'playName', label: 'Play' },
            { key: 'usage', label: 'Usage' },
            { key: 'formation', label: 'Formation' },
            { key: 'personnel', label: 'Personnel' },
            { key: 'situation', label: 'Situation' },
            { key: 'notes', label: 'Notes' },
          ] as const,
          rows: linkedPlayRows,
        }
      : {}),
    ...(imageUrls.length > 0 ? { imageUrls: [...new Set(imageUrls)].slice(0, 24) } : {}),
  };
}

// ─── GET /playbooks ──────────────────────────────────────────────────────────
router.get('/playbooks', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : null;
    if (!teamId) {
      res.status(400).json({ success: false, error: 'teamId is required' });
      return;
    }

    const sport = normalizeString(req.query['sport'])?.toLowerCase();
    const limit = Math.min(parseInt(String(req.query['limit'] ?? '25'), 10) || 25, 100);
    const includeArchived = req.query['includeArchived'] === 'true';

    const { db } = req.firebase!;
    const teamDoc = await db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists) {
      res.status(404).json({ success: false, error: 'Team not found' });
      return;
    }

    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res
        .status(403)
        .json({ success: false, error: 'Not authorized to view playbooks for this team' });
      return;
    }

    const snap = await db
      .collection(TEAM_PLAYBOOKS_COLLECTION)
      .where('teamId', '==', teamId)
      .limit(limit * 4)
      .get();

    const playbooks = snap.docs
      .map((doc: FirestoreDocLike) => ({ id: doc.id, ...doc.data() }))
      .filter((p: Record<string, unknown>) => includeArchived || p['archived'] !== true)
      .filter((p: Record<string, unknown>) => {
        if (!sport) return true;
        return String(p['sport'] ?? '').toLowerCase() === sport;
      })
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const left = String(a['updatedAt'] ?? a['createdAt'] ?? '');
        const right = String(b['updatedAt'] ?? b['createdAt'] ?? '');
        return left > right ? -1 : 1;
      })
      .slice(0, limit)
      .map((p: Record<string, unknown>) => toPlaybookSummary(String(p['id']), p));

    logger.info('GET /playbooks', { userId: user.uid, teamId, sport, count: playbooks.length });
    res.json({ success: true, data: { playbooks, count: playbooks.length } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('GET /playbooks failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to load playbooks' });
  }
});

// ─── GET /playbooks/:playbookId ──────────────────────────────────────────────
router.get('/playbooks/:playbookId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { playbookId } = req.params as { playbookId: string };
    const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : null;

    const { db } = req.firebase!;
    const doc = await db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId).get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Playbook not found' });
      return;
    }

    const data = doc.data() as Record<string, unknown>;
    const playbookTeamId = String(data['teamId'] ?? '');

    if (teamId && playbookTeamId !== teamId) {
      res.status(403).json({ success: false, error: 'Playbook does not belong to this team' });
      return;
    }

    const teamDoc = await db.collection('Teams').doc(playbookTeamId).get();
    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      playbookTeamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized' });
      return;
    }

    res.json({ success: true, data: { playbook: { id: doc.id, ...data } } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('GET /playbooks/:id failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to load playbook' });
  }
});

// ─── POST /playbooks ─────────────────────────────────────────────────────────
router.post('/playbooks', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const teamId = typeof body['teamId'] === 'string' ? body['teamId'].trim() : '';
    const sport = typeof body['sport'] === 'string' ? body['sport'].trim() : '';
    const name = typeof body['name'] === 'string' ? body['name'].trim() : '';

    if (!teamId) {
      res.status(400).json({ success: false, error: 'teamId is required' });
      return;
    }
    if (!sport) {
      res.status(400).json({ success: false, error: 'sport is required' });
      return;
    }
    if (!name) {
      res.status(400).json({ success: false, error: 'name is required' });
      return;
    }

    const { db } = req.firebase!;
    const teamDoc = await db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists) {
      res.status(404).json({ success: false, error: 'Team not found' });
      return;
    }

    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res
        .status(403)
        .json({ success: false, error: 'Not authorized to create playbooks for this team' });
      return;
    }

    const now = new Date().toISOString();
    const normalizedSport = sport.toLowerCase();
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 40);
    const docId = `${teamId}_${normalizedSport}_${slug}`;
    const docRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(docId);
    const existingDoc = await docRef.get();
    const existingData = existingDoc.exists
      ? ((existingDoc.data() ?? {}) as Record<string, unknown>)
      : null;

    const payload: Record<string, unknown> = {
      id: docId,
      teamId,
      sport: normalizedSport,
      name: titleCaseStr(name),
      plays: [],
      playCount: 0,
      conceptTagIndex: [],
      formationIndex: [],
      personnelIndex: [],
      categoryIndex: [],
      archived: false,
      createdAt:
        typeof existingData?.['createdAt'] === 'string' &&
        existingData['createdAt'].trim().length > 0
          ? existingData['createdAt']
          : now,
      updatedAt: now,
      createdBy:
        typeof existingData?.['createdBy'] === 'string' &&
        existingData['createdBy'].trim().length > 0
          ? existingData['createdBy']
          : user.uid,
      updatedBy: user.uid,
    };

    const season = body['season'];
    const source = body['source'];
    const sourceUrl = body['sourceUrl'];
    if (typeof season === 'string' && season.trim()) payload['season'] = season.trim();
    if (typeof source === 'string' && source.trim()) payload['source'] = source.trim();
    if (typeof sourceUrl === 'string' && sourceUrl.trim()) payload['sourceUrl'] = sourceUrl.trim();

    await docRef.set(payload, { merge: true });

    logger.info('POST /playbooks — upserted', {
      teamId,
      sport: normalizedSport,
      name,
      docId,
      createdBy: user.uid,
      existed: existingDoc.exists,
    });
    res.status(existingDoc.exists ? 200 : 201).json({ success: true, data: { playbook: payload } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('POST /playbooks failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to create playbook' });
  }
});

// ─── PATCH /playbooks/:playbookId ────────────────────────────────────────────
router.patch('/playbooks/:playbookId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { playbookId } = req.params as { playbookId: string };
    const { db } = req.firebase!;

    const docRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Playbook not found' });
      return;
    }

    const existing = doc.data() as Record<string, unknown>;
    const playbookTeamId = String(existing['teamId'] ?? '');

    const teamDoc = await db.collection('Teams').doc(playbookTeamId).get();
    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      playbookTeamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized' });
      return;
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now, updatedBy: user.uid };

    const body = req.body as Record<string, unknown>;
    if (typeof body['name'] === 'string' && body['name'].trim()) {
      updates['name'] = titleCaseStr(body['name']);
    }
    if (typeof body['season'] === 'string') updates['season'] = body['season'].trim();
    if (typeof body['source'] === 'string') updates['source'] = body['source'].trim();
    if (typeof body['sourceUrl'] === 'string') updates['sourceUrl'] = body['sourceUrl'].trim();
    if (typeof body['archived'] === 'boolean') updates['archived'] = body['archived'];

    await docRef.update(updates);

    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${playbookTeamId}`),
        cache.del(`team:playbooks:${playbookTeamId}:${String(existing['sport'] ?? '')}`),
      ]);
    } catch {
      /* best effort */
    }

    logger.info('PATCH /playbooks/:id', {
      playbookId,
      teamId: playbookTeamId,
      updatedBy: user.uid,
    });
    res.json({ success: true, data: { id: playbookId, ...updates } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('PATCH /playbooks/:id failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to update playbook' });
  }
});

// ─── DELETE /playbooks/:playbookId ───────────────────────────────────────────
router.delete('/playbooks/:playbookId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { playbookId } = req.params as { playbookId: string };
    const { db } = req.firebase!;

    const docRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Playbook not found' });
      return;
    }

    const existing = doc.data() as Record<string, unknown>;
    const playbookTeamId = String(existing['teamId'] ?? '');

    const teamDoc = await db.collection('Teams').doc(playbookTeamId).get();
    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      playbookTeamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized' });
      return;
    }

    const now = new Date().toISOString();
    await docRef.update({
      archived: true,
      updatedBy: user.uid,
      updatedAt: now,
      archivedAt: now,
      archivedBy: user.uid,
    });

    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${playbookTeamId}`),
        cache.del(`team:playbooks:${playbookTeamId}:${String(existing['sport'] ?? '')}`),
      ]);
    } catch {
      /* best effort */
    }

    logger.info('DELETE /playbooks/:id', {
      playbookId,
      teamId: playbookTeamId,
      archivedBy: user.uid,
    });
    res.json({ success: true, data: { archived: true } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('DELETE /playbooks/:id failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to delete playbook' });
  }
});

// ─── POST /playbooks/:playbookId/plays ───────────────────────────────────────
router.post('/playbooks/:playbookId/plays', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { playbookId } = req.params as { playbookId: string };
    const { db } = req.firebase!;

    const docRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Playbook not found' });
      return;
    }

    const existing = doc.data() as Record<string, unknown>;
    const playbookTeamId = String(existing['teamId'] ?? '');

    const teamDoc = await db.collection('Teams').doc(playbookTeamId).get();
    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      playbookTeamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const playName = typeof body['name'] === 'string' ? body['name'].trim() : '';
    if (!playName) {
      res.status(400).json({ success: false, error: 'play name is required' });
      return;
    }

    const newPlay: Record<string, unknown> = { name: titleCaseStr(playName) };
    const strFields = [
      'series',
      'category',
      'formation',
      'personnel',
      'downDistance',
      'objective',
      'playBreakdown',
      'installNotes',
      'diagramUrl',
      'videoUrl',
    ] as const;
    for (const field of strFields) {
      if (typeof body[field] === 'string' && (body[field] as string).trim()) {
        newPlay[field] = (body[field] as string).trim();
      }
    }
    const concepts = titleCaseArr(body['conceptTags']);
    if (concepts.length) newPlay['conceptTags'] = concepts;
    const tags = titleCaseArr(body['tags']);
    if (tags.length) newPlay['tags'] = tags;

    // AI-native install layer
    if (
      body['installStage'] === 'install' ||
      body['installStage'] === 'rep' ||
      body['installStage'] === 'game-ready'
    ) {
      newPlay['installStage'] = body['installStage'];
    }
    const coachingPoints = Array.isArray(body['coachingPoints'])
      ? body['coachingPoints']
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          .map((p) => p.trim())
      : [];
    if (coachingPoints.length) newPlay['coachingPoints'] = coachingPoints;

    const commonBusts = Array.isArray(body['commonBusts'])
      ? body['commonBusts']
          .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
          .map((b) => b.trim())
      : [];
    if (commonBusts.length) newPlay['commonBusts'] = commonBusts;

    const correctionCues = Array.isArray(body['correctionCues'])
      ? body['correctionCues']
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
          .map((c) => c.trim())
      : [];
    if (correctionCues.length) newPlay['correctionCues'] = correctionCues;

    const drillProgression = Array.isArray(body['drillProgression'])
      ? body['drillProgression']
          .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
          .map((d) => d.trim())
      : [];
    if (drillProgression.length) newPlay['drillProgression'] = drillProgression;

    // AI-native situation layer
    const situations = Array.isArray(body['situations'])
      ? body['situations']
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim())
      : [];
    if (situations.length) newPlay['situations'] = situations;

    const syncedDiagram = await syncPlaybookDiagramAsset({
      db,
      userId: user.uid,
      sport: String(existing['sport'] ?? ''),
      title: typeof newPlay['name'] === 'string' ? newPlay['name'] : playName,
      description:
        typeof newPlay['playBreakdown'] === 'string'
          ? newPlay['playBreakdown']
          : typeof newPlay['installNotes'] === 'string'
            ? newPlay['installNotes']
            : undefined,
      diagramUrl: typeof newPlay['diagramUrl'] === 'string' ? newPlay['diagramUrl'] : undefined,
      diagramAssetId:
        typeof body['diagramAssetId'] === 'string' ? body['diagramAssetId'] : undefined,
    });
    if (syncedDiagram.diagramUrl) newPlay['diagramUrl'] = syncedDiagram.diagramUrl;
    if (syncedDiagram.diagramAssetId) newPlay['diagramAssetId'] = syncedDiagram.diagramAssetId;

    const plays: Record<string, unknown>[] = [
      ...((existing['plays'] as Record<string, unknown>[]) ?? []),
      newPlay,
    ];
    const now = new Date().toISOString();
    const indexes = buildPlayIndexes(plays);

    await docRef.update({
      plays,
      playCount: plays.length,
      ...indexes,
      updatedAt: now,
      updatedBy: user.uid,
    });

    try {
      const cache = getCacheService();
      await cache.del(`team:playbooks:${playbookTeamId}:${String(existing['sport'] ?? '')}`);
    } catch {
      /* best effort */
    }

    logger.info('POST /playbooks/:id/plays', { playbookId, teamId: playbookTeamId, playName });
    res.status(201).json({ success: true, data: { play: newPlay, playCount: plays.length } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('POST /playbooks/:id/plays failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to add play' });
  }
});

// ─── PATCH /playbooks/:playbookId/plays/:playIndex ───────────────────────────
router.patch(
  '/playbooks/:playbookId/plays/:playIndex',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId, playIndex } = req.params as { playbookId: string; playIndex: string };
      const idx = parseInt(playIndex, 10);
      if (Number.isNaN(idx) || idx < 0) {
        res.status(400).json({ success: false, error: 'Invalid play index' });
        return;
      }

      const { db } = req.firebase!;
      const docRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Playbook not found' });
        return;
      }

      const existing = doc.data() as Record<string, unknown>;
      const plays: Record<string, unknown>[] = [
        ...((existing['plays'] as Record<string, unknown>[]) ?? []),
      ];

      if (idx >= plays.length) {
        res.status(404).json({ success: false, error: 'Play index out of range' });
        return;
      }

      const playbookTeamId = String(existing['teamId'] ?? '');
      const teamDoc = await db.collection('Teams').doc(playbookTeamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        playbookTeamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const updated: Record<string, unknown> = { ...plays[idx] };

      if (typeof body['name'] === 'string' && body['name'].trim())
        updated['name'] = titleCaseStr(body['name']);
      const strFields = [
        'series',
        'category',
        'formation',
        'personnel',
        'downDistance',
        'objective',
        'playBreakdown',
        'installNotes',
        'diagramUrl',
        'videoUrl',
      ] as const;
      for (const field of strFields) {
        if (typeof body[field] === 'string') {
          const trimmed = (body[field] as string).trim();
          if (trimmed.length > 0) updated[field] = trimmed;
          else delete updated[field];
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, 'diagramAssetId')) {
        if (typeof body['diagramAssetId'] === 'string' && body['diagramAssetId'].trim()) {
          updated['diagramAssetId'] = body['diagramAssetId'].trim();
        } else {
          delete updated['diagramAssetId'];
        }
      }
      if (Array.isArray(body['conceptTags']))
        updated['conceptTags'] = titleCaseArr(body['conceptTags']);
      if (Array.isArray(body['tags'])) updated['tags'] = titleCaseArr(body['tags']);

      // AI-native install layer
      if (
        body['installStage'] === 'install' ||
        body['installStage'] === 'rep' ||
        body['installStage'] === 'game-ready'
      ) {
        updated['installStage'] = body['installStage'];
      }
      if (Array.isArray(body['coachingPoints'])) {
        const points = body['coachingPoints']
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          .map((p) => p.trim());
        updated['coachingPoints'] = points;
      }
      if (Array.isArray(body['commonBusts'])) {
        const busts = body['commonBusts']
          .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
          .map((b) => b.trim());
        updated['commonBusts'] = busts;
      }
      if (Array.isArray(body['correctionCues'])) {
        const cues = body['correctionCues']
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
          .map((c) => c.trim());
        updated['correctionCues'] = cues;
      }
      if (Array.isArray(body['drillProgression'])) {
        const drills = body['drillProgression']
          .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
          .map((d) => d.trim());
        updated['drillProgression'] = drills;
      }

      // AI-native situation layer
      if (Array.isArray(body['situations'])) {
        const situs = body['situations']
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim());
        updated['situations'] = situs;
      }

      const syncedDiagram = await syncPlaybookDiagramAsset({
        db,
        userId: user.uid,
        sport: String(existing['sport'] ?? ''),
        title:
          typeof updated['name'] === 'string' && updated['name'].trim().length > 0
            ? updated['name']
            : String(plays[idx]?.['name'] ?? `Play ${idx + 1}`),
        description:
          typeof updated['playBreakdown'] === 'string'
            ? updated['playBreakdown']
            : typeof updated['installNotes'] === 'string'
              ? updated['installNotes']
              : undefined,
        diagramUrl: typeof updated['diagramUrl'] === 'string' ? updated['diagramUrl'] : undefined,
        diagramAssetId:
          typeof updated['diagramAssetId'] === 'string' ? updated['diagramAssetId'] : undefined,
      });
      if (syncedDiagram.diagramUrl) updated['diagramUrl'] = syncedDiagram.diagramUrl;
      if (syncedDiagram.diagramAssetId) updated['diagramAssetId'] = syncedDiagram.diagramAssetId;
      if (!updated['diagramUrl']) delete updated['diagramAssetId'];

      plays[idx] = updated;
      const now = new Date().toISOString();
      const indexes = buildPlayIndexes(plays);

      await docRef.update({
        plays,
        playCount: plays.length,
        ...indexes,
        updatedAt: now,
        updatedBy: user.uid,
      });

      try {
        const cache = getCacheService();
        await cache.del(`team:playbooks:${playbookTeamId}:${String(existing['sport'] ?? '')}`);
      } catch {
        /* best effort */
      }

      logger.info('PATCH /playbooks/:id/plays/:i', { playbookId, idx, teamId: playbookTeamId });
      res.json({ success: true, data: { play: updated } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('PATCH /playbooks/:id/plays/:i failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to update play' });
    }
  }
);

// ─── CALLSHEETS CRUD (persisted callsheet workspace) ───────────────────────

router.get('/playbooks/:playbookId/callsheets', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { playbookId } = req.params as { playbookId: string };
    const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : null;
    if (!teamId) {
      res.status(400).json({ success: false, error: 'teamId is required' });
      return;
    }

    const limit = Math.min(parseInt(String(req.query['limit'] ?? '30'), 10) || 30, 100);
    const includeArchived = req.query['includeArchived'] === 'true';

    const { db } = req.firebase!;

    const playbookDoc = await db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId).get();
    if (!playbookDoc.exists) {
      res.status(404).json({ success: false, error: 'Playbook not found' });
      return;
    }

    const playbookData = (playbookDoc.data() ?? {}) as Record<string, unknown>;
    const playbookTeamId = normalizeString(playbookData['teamId']) ?? '';
    if (!playbookTeamId || playbookTeamId !== teamId) {
      res.status(403).json({ success: false, error: 'Playbook does not belong to this team' });
      return;
    }

    const teamDoc = await db.collection('Teams').doc(teamId).get();
    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized' });
      return;
    }

    const snap = await db
      .collection(TEAM_CALLSHEETS_COLLECTION)
      .where('teamId', '==', teamId)
      .where('playbookId', '==', playbookId)
      .limit(limit * 4)
      .get();

    const callsheets = snap.docs
      .map((doc: FirestoreDocLike) => ({ id: doc.id, ...doc.data() }))
      .filter((doc: Record<string, unknown>) => includeArchived || doc['archived'] !== true)
      .sort((left: Record<string, unknown>, right: Record<string, unknown>) => {
        const l = normalizeString(left['updatedAt']) ?? normalizeString(left['createdAt']) ?? '';
        const r = normalizeString(right['updatedAt']) ?? normalizeString(right['createdAt']) ?? '';
        return l > r ? -1 : 1;
      })
      .slice(0, limit)
      .map((doc: Record<string, unknown>) => toCallsheetSummary(String(doc['id'] ?? ''), doc));

    res.json({ success: true, data: { callsheets, count: callsheets.length } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('GET /playbooks/:id/callsheets failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to load callsheets' });
  }
});

router.get(
  '/playbooks/:playbookId/callsheets/:callsheetId',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId, callsheetId } = req.params as { playbookId: string; callsheetId: string };
      const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : null;
      if (!teamId) {
        res.status(400).json({ success: false, error: 'teamId is required' });
        return;
      }

      const { db } = req.firebase!;
      const callsheetDoc = await db.collection(TEAM_CALLSHEETS_COLLECTION).doc(callsheetId).get();
      if (!callsheetDoc.exists) {
        res.status(404).json({ success: false, error: 'Callsheet not found' });
        return;
      }

      const callsheet = (callsheetDoc.data() ?? {}) as Record<string, unknown>;
      if (normalizeString(callsheet['teamId']) !== teamId) {
        res.status(403).json({ success: false, error: 'Callsheet does not belong to this team' });
        return;
      }
      if (normalizeString(callsheet['playbookId']) !== playbookId) {
        res
          .status(403)
          .json({ success: false, error: 'Callsheet does not belong to this playbook' });
        return;
      }

      const teamDoc = await db.collection('Teams').doc(teamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        teamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      const plays = normalizeCallsheetPlays(callsheet['plays']);
      const groups = normalizeCallsheetGroups(callsheet['groups'], plays);

      res.json({
        success: true,
        data: {
          callsheet: {
            id: callsheetDoc.id,
            ...callsheet,
            plays,
            groups,
          },
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('GET /playbooks/:id/callsheets/:callsheetId failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to load callsheet' });
    }
  }
);

router.post('/playbooks/:playbookId/callsheets', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { playbookId } = req.params as { playbookId: string };
    const body = req.body as Record<string, unknown>;
    const teamId = normalizeString(body['teamId']);
    if (!teamId) {
      res.status(400).json({ success: false, error: 'teamId is required' });
      return;
    }

    const { db } = req.firebase!;
    const playbookDoc = await db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId).get();
    if (!playbookDoc.exists) {
      res.status(404).json({ success: false, error: 'Playbook not found' });
      return;
    }

    const playbook = (playbookDoc.data() ?? {}) as Record<string, unknown>;
    const playbookTeamId = normalizeString(playbook['teamId']) ?? '';
    if (!playbookTeamId || playbookTeamId !== teamId) {
      res.status(403).json({ success: false, error: 'Playbook does not belong to this team' });
      return;
    }

    const teamDoc = await db.collection('Teams').doc(teamId).get();
    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized' });
      return;
    }

    const sport = normalizeString(body['sport']) ?? normalizeString(playbook['sport']) ?? '';
    const situation =
      normalizeString(body['situation']) ??
      resolvePlaybookSituationText(
        typeof body['filters'] === 'object' && body['filters']
          ? (body['filters'] as Record<string, string>)
          : undefined
      );
    const plays = normalizeCallsheetPlays(body['plays']);
    const fallbackPlays = Array.isArray(playbook['plays'])
      ? deterministicCallsheetRanking(
          playbook['plays'] as Record<string, unknown>[],
          situation || 'all situations'
        )
      : [];
    const effectivePlays = plays.length > 0 ? plays : fallbackPlays;
    const groups = normalizeCallsheetGroups(body['groups'], effectivePlays);

    const title =
      normalizeString(body['title']) ??
      `Callsheet ${new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })}`;

    const now = new Date().toISOString();
    const slugSeed = `${title}-${now}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    const docId = `${playbookId}_${slugSeed || 'callsheet'}`;

    const payload: Record<string, unknown> = {
      id: docId,
      teamId,
      playbookId,
      sport,
      title,
      situation: situation || 'all situations',
      filters:
        typeof body['filters'] === 'object' && body['filters']
          ? (body['filters'] as Record<string, unknown>)
          : {},
      plays: effectivePlays,
      groups,
      notes: normalizeString(body['notes']) ?? '',
      source: normalizeString(body['source']) ?? 'agent_x',
      archived: false,
      createdAt: now,
      createdBy: user.uid,
      updatedAt: now,
      updatedBy: user.uid,
    };

    await db.collection(TEAM_CALLSHEETS_COLLECTION).doc(docId).set(payload);
    res.status(201).json({ success: true, data: { callsheet: payload } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('POST /playbooks/:id/callsheets failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to create callsheet' });
  }
});

router.patch(
  '/playbooks/:playbookId/callsheets/:callsheetId',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId, callsheetId } = req.params as { playbookId: string; callsheetId: string };
      const body = req.body as Record<string, unknown>;
      const teamId = normalizeString(body['teamId']);
      if (!teamId) {
        res.status(400).json({ success: false, error: 'teamId is required' });
        return;
      }

      const { db } = req.firebase!;
      const docRef = db.collection(TEAM_CALLSHEETS_COLLECTION).doc(callsheetId);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Callsheet not found' });
        return;
      }

      const existing = (doc.data() ?? {}) as Record<string, unknown>;
      if (normalizeString(existing['teamId']) !== teamId) {
        res.status(403).json({ success: false, error: 'Callsheet does not belong to this team' });
        return;
      }
      if (normalizeString(existing['playbookId']) !== playbookId) {
        res
          .status(403)
          .json({ success: false, error: 'Callsheet does not belong to this playbook' });
        return;
      }

      const teamDoc = await db.collection('Teams').doc(teamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        teamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };
      if (typeof body['title'] === 'string') updates['title'] = body['title'].trim();
      if (typeof body['situation'] === 'string') updates['situation'] = body['situation'].trim();
      if (typeof body['notes'] === 'string') updates['notes'] = body['notes'].trim();
      if (typeof body['archived'] === 'boolean') updates['archived'] = body['archived'];
      if (typeof body['filters'] === 'object' && body['filters'])
        updates['filters'] = body['filters'];

      if (Array.isArray(body['plays'])) {
        updates['plays'] = normalizeCallsheetPlays(body['plays']);
      }

      const effectivePlays = Array.isArray(updates['plays'])
        ? (updates['plays'] as Array<{ playName: string; score: number; reasoning: string }>)
        : normalizeCallsheetPlays(existing['plays']);

      if (Array.isArray(body['groups'])) {
        updates['groups'] = normalizeCallsheetGroups(body['groups'], effectivePlays);
      } else if (Array.isArray(body['plays'])) {
        updates['groups'] = normalizeCallsheetGroups(existing['groups'], effectivePlays);
      }

      await docRef.update(updates);
      res.json({ success: true, data: { id: callsheetId, ...updates } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('PATCH /playbooks/:id/callsheets/:callsheetId failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to update callsheet' });
    }
  }
);

router.delete(
  '/playbooks/:playbookId/callsheets/:callsheetId',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId, callsheetId } = req.params as { playbookId: string; callsheetId: string };
      const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : '';
      if (!teamId) {
        res.status(400).json({ success: false, error: 'teamId is required' });
        return;
      }

      const { db } = req.firebase!;
      const docRef = db.collection(TEAM_CALLSHEETS_COLLECTION).doc(callsheetId);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Callsheet not found' });
        return;
      }

      const existing = (doc.data() ?? {}) as Record<string, unknown>;
      if (normalizeString(existing['teamId']) !== teamId) {
        res.status(403).json({ success: false, error: 'Callsheet does not belong to this team' });
        return;
      }
      if (normalizeString(existing['playbookId']) !== playbookId) {
        res
          .status(403)
          .json({ success: false, error: 'Callsheet does not belong to this playbook' });
        return;
      }

      const teamDoc = await db.collection('Teams').doc(teamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        teamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      await docRef.update({
        archived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: user.uid,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      });
      res.json({ success: true, data: { archived: true } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('DELETE /playbooks/:id/callsheets/:callsheetId failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to delete callsheet' });
    }
  }
);

// ─── POST /playbooks/:playbookId/callsheet-ai ───────────────────────────────
router.post(
  '/playbooks/:playbookId/callsheet-ai',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId } = req.params as { playbookId: string };
      const body = req.body as Record<string, unknown>;
      const teamId = normalizeString(body['teamId']);
      const sport = normalizeString(body['sport']);
      const situation = normalizeString(body['situation']);

      if (!teamId) {
        res.status(400).json({ success: false, error: 'teamId is required' });
        return;
      }
      if (!sport) {
        res.status(400).json({ success: false, error: 'sport is required' });
        return;
      }
      if (!situation) {
        res.status(400).json({ success: false, error: 'situation is required' });
        return;
      }

      const { db } = req.firebase!;
      const playbookRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId);
      const playbookDoc = await playbookRef.get();
      if (!playbookDoc.exists) {
        res.status(404).json({ success: false, error: 'Playbook not found' });
        return;
      }

      const playbook = playbookDoc.data() as Record<string, unknown>;
      const playbookTeamId = String(playbook['teamId'] ?? '');
      if (playbookTeamId !== teamId) {
        res.status(403).json({ success: false, error: 'Playbook does not belong to this team' });
        return;
      }

      const teamDoc = await db.collection(TEAMS_COLLECTION).doc(playbookTeamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        playbookTeamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      const plays = Array.isArray(playbook['plays'])
        ? (playbook['plays'] as Record<string, unknown>[])
        : [];
      if (plays.length === 0) {
        res.json({ success: true, data: { plays: [] } });
        return;
      }

      let ranked = deterministicCallsheetRanking(plays, situation);

      if (llmService) {
        try {
          const llmResult = await llmService.complete(
            [
              {
                role: 'system',
                content:
                  'You are Agent X football/sport strategist. Return strict JSON only. Rank plays for the requested situation using objective, situations, and concept tags. Scores must be 0-100 with concise reasoning.',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  sport,
                  situation,
                  plays: plays.map((play, index) => ({
                    playName: normalizePlayName(play, index),
                    objective: typeof play['objective'] === 'string' ? play['objective'] : '',
                    situations: Array.isArray(play['situations']) ? play['situations'] : [],
                    conceptTags: Array.isArray(play['conceptTags']) ? play['conceptTags'] : [],
                    successRate:
                      typeof play['successRate'] === 'number' ? Number(play['successRate']) : null,
                  })),
                }),
              },
            ],
            {
              tier: 'task_automation',
              temperature: 0.2,
              maxTokens: 1500,
              jsonMode: true,
              outputSchema: {
                name: 'callsheet_ai_rankings',
                schema: callsheetAiOutputSchema,
                strict: true,
              },
            }
          );

          const parsed = callsheetAiOutputSchema.parse(
            llmResult.parsedOutput ??
              (llmResult.content ? JSON.parse(llmResult.content) : { plays: [] })
          );

          const knownNames = new Set(plays.map((play, index) => normalizePlayName(play, index)));
          const aiRanked = parsed.plays
            .filter((entry) => knownNames.has(entry.playName))
            .map((entry) => ({
              playName: entry.playName,
              score: Math.max(0, Math.min(100, Math.round(entry.score))),
              reasoning: entry.reasoning.trim(),
            }))
            .sort((left, right) => right.score - left.score)
            .slice(0, 12);

          if (aiRanked.length > 0) {
            ranked = aiRanked;
          }
        } catch (err) {
          logger.warn('POST /playbooks/:id/callsheet-ai LLM fallback triggered', {
            playbookId,
            teamId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      res.json({ success: true, data: { plays: ranked } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('POST /playbooks/:id/callsheet-ai failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to rank callsheet plays' });
    }
  }
);

// ─── POST /playbooks/:playbookId/generate-install-plan ─────────────────────
router.post(
  '/playbooks/:playbookId/generate-install-plan',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId } = req.params as { playbookId: string };
      const body = req.body as Record<string, unknown>;
      const teamId = normalizeString(body['teamId']);
      const sport = normalizeString(body['sport']);

      if (!teamId) {
        res.status(400).json({ success: false, error: 'teamId is required' });
        return;
      }
      if (!sport) {
        res.status(400).json({ success: false, error: 'sport is required' });
        return;
      }

      const { db } = req.firebase!;
      const playbookRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId);
      const playbookDoc = await playbookRef.get();
      if (!playbookDoc.exists) {
        res.status(404).json({ success: false, error: 'Playbook not found' });
        return;
      }

      const playbook = playbookDoc.data() as Record<string, unknown>;
      const playbookTeamId = String(playbook['teamId'] ?? '');
      if (playbookTeamId !== teamId) {
        res.status(403).json({ success: false, error: 'Playbook does not belong to this team' });
        return;
      }

      const teamDoc = await db.collection(TEAMS_COLLECTION).doc(playbookTeamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        playbookTeamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      const plays = Array.isArray(playbook['plays'])
        ? ([...(playbook['plays'] as Record<string, unknown>[])] as Record<string, unknown>[])
        : [];
      if (plays.length === 0) {
        res.json({ success: true, data: { updates: [] } });
        return;
      }

      let updates: Array<{
        playIndex: number;
        installStage: 'install' | 'rep' | 'game-ready';
        reasoning: string;
      }> = plays.map((play, index) => {
        const complexity =
          (Array.isArray(play['conceptTags']) ? play['conceptTags'].length : 0) +
          (Array.isArray(play['situations']) ? play['situations'].length : 0) +
          (typeof play['objective'] === 'string' && play['objective'].trim().length > 80 ? 1 : 0);

        const installStage =
          complexity >= 4 ? 'install' : complexity >= 2 ? 'rep' : ('game-ready' as const);

        return {
          playIndex: index,
          installStage,
          reasoning:
            installStage === 'install'
              ? 'Higher concept complexity; prioritize teaching reps first.'
              : installStage === 'rep'
                ? 'Moderate complexity; move through controlled repetition.'
                : 'Lower complexity; ready for game-speed execution.',
        };
      });

      if (llmService) {
        try {
          const llmResult = await llmService.complete(
            [
              {
                role: 'system',
                content:
                  'You are Agent X install coordinator. Return strict JSON only. For each play, assign installStage as install, rep, or game-ready based on concept complexity and readiness.',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  sport,
                  plays: plays.map((play, index) => ({
                    playIndex: index,
                    playName: normalizePlayName(play, index),
                    objective: typeof play['objective'] === 'string' ? play['objective'] : '',
                    conceptTags: Array.isArray(play['conceptTags']) ? play['conceptTags'] : [],
                    coachingPoints: Array.isArray(play['coachingPoints'])
                      ? play['coachingPoints']
                      : [],
                    situations: Array.isArray(play['situations']) ? play['situations'] : [],
                    currentStage:
                      play['installStage'] === 'install' ||
                      play['installStage'] === 'rep' ||
                      play['installStage'] === 'game-ready'
                        ? play['installStage']
                        : null,
                  })),
                }),
              },
            ],
            {
              tier: 'task_automation',
              temperature: 0.1,
              maxTokens: 1800,
              jsonMode: true,
              outputSchema: {
                name: 'install_plan_updates',
                schema: installPlanOutputSchema,
                strict: true,
              },
            }
          );

          const parsed = installPlanOutputSchema.parse(
            llmResult.parsedOutput ??
              (llmResult.content ? JSON.parse(llmResult.content) : { updates: [] })
          );

          const aiUpdates = parsed.updates
            .filter((entry) => entry.playIndex >= 0 && entry.playIndex < plays.length)
            .map((entry) => ({
              playIndex: entry.playIndex,
              installStage: entry.installStage,
              reasoning: entry.reasoning.trim(),
            }));

          if (aiUpdates.length > 0) {
            updates = aiUpdates;
          }
        } catch (err) {
          logger.warn('POST /playbooks/:id/generate-install-plan LLM fallback triggered', {
            playbookId,
            teamId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      for (const update of updates) {
        const current = plays[update.playIndex] ?? {};
        plays[update.playIndex] = {
          ...current,
          installStage: update.installStage,
        };
      }

      const now = new Date().toISOString();
      const indexes = buildPlayIndexes(plays);
      await playbookRef.update({
        plays,
        playCount: plays.length,
        ...indexes,
        updatedAt: now,
        updatedBy: user.uid,
      });

      try {
        const cache = getCacheService();
        await cache.del(`team:playbooks:${playbookTeamId}:${String(playbook['sport'] ?? '')}`);
      } catch {
        /* best effort */
      }

      res.json({ success: true, data: { updates } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('POST /playbooks/:id/generate-install-plan failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to generate install plan' });
    }
  }
);

// ─── PRACTICE SCRIPTS CRUD + AI ─────────────────────────────────────────────
router.get(
  '/playbooks/:playbookId/practice-scripts',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId } = req.params as { playbookId: string };
      const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : null;
      if (!teamId) {
        res.status(400).json({ success: false, error: 'teamId is required' });
        return;
      }

      const limit = Math.min(parseInt(String(req.query['limit'] ?? '30'), 10) || 30, 100);
      const includeArchived = req.query['includeArchived'] === 'true';

      const { db } = req.firebase!;
      const playbookDoc = await db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId).get();
      if (!playbookDoc.exists) {
        res.status(404).json({ success: false, error: 'Playbook not found' });
        return;
      }

      const playbookData = (playbookDoc.data() ?? {}) as Record<string, unknown>;
      if ((normalizeString(playbookData['teamId']) ?? '') !== teamId) {
        res.status(403).json({ success: false, error: 'Playbook does not belong to this team' });
        return;
      }

      const teamDoc = await db.collection('Teams').doc(teamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        teamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      const snap = await db
        .collection(TEAM_PRACTICE_SCRIPTS_COLLECTION)
        .where('teamId', '==', teamId)
        .where('playbookId', '==', playbookId)
        .limit(limit * 4)
        .get();

      const scripts = snap.docs
        .map((doc: FirestoreDocLike) => ({ id: doc.id, ...doc.data() }))
        .filter((doc: Record<string, unknown>) => includeArchived || doc['archived'] !== true)
        .sort((left: Record<string, unknown>, right: Record<string, unknown>) => {
          const leftOrder = Number(left['displayOrder']);
          const rightOrder = Number(right['displayOrder']);
          const hasLeftOrder = Number.isFinite(leftOrder);
          const hasRightOrder = Number.isFinite(rightOrder);
          if (hasLeftOrder && hasRightOrder && leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }
          if (hasLeftOrder !== hasRightOrder) return hasLeftOrder ? -1 : 1;

          const l = normalizeString(left['updatedAt']) ?? normalizeString(left['createdAt']) ?? '';
          const r =
            normalizeString(right['updatedAt']) ?? normalizeString(right['createdAt']) ?? '';
          return l > r ? -1 : 1;
        })
        .slice(0, limit)
        .map((doc: Record<string, unknown>) =>
          toPracticeScriptSummary(String(doc['id'] ?? ''), doc)
        );

      res.json({ success: true, data: { scripts, count: scripts.length } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('GET /playbooks/:id/practice-scripts failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to load practice scripts' });
    }
  }
);

router.get(
  '/playbooks/:playbookId/practice-scripts/:scriptId',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId, scriptId } = req.params as { playbookId: string; scriptId: string };
      const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : null;
      if (!teamId) {
        res.status(400).json({ success: false, error: 'teamId is required' });
        return;
      }

      const { db } = req.firebase!;
      const doc = await db.collection(TEAM_PRACTICE_SCRIPTS_COLLECTION).doc(scriptId).get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Practice script not found' });
        return;
      }

      const script = (doc.data() ?? {}) as Record<string, unknown>;
      if ((normalizeString(script['teamId']) ?? '') !== teamId) {
        res.status(403).json({ success: false, error: 'Script does not belong to this team' });
        return;
      }
      if ((normalizeString(script['playbookId']) ?? '') !== playbookId) {
        res.status(403).json({ success: false, error: 'Script does not belong to this playbook' });
        return;
      }

      const teamDoc = await db.collection('Teams').doc(teamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        teamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      const periods = normalizePracticeScriptPeriods(script['periods']);
      const summary = toPracticeScriptSummary(doc.id, script);
      res.json({ success: true, data: { script: { ...summary, ...script, periods } } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('GET /playbooks/:id/practice-scripts/:scriptId failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to load practice script' });
    }
  }
);

router.post(
  '/playbooks/:playbookId/practice-scripts',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId } = req.params as { playbookId: string };
      const body = req.body as Record<string, unknown>;
      const teamId = normalizeString(body['teamId']);
      if (!teamId) {
        res.status(400).json({ success: false, error: 'teamId is required' });
        return;
      }

      const { db } = req.firebase!;
      const playbookDoc = await db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId).get();
      if (!playbookDoc.exists) {
        res.status(404).json({ success: false, error: 'Playbook not found' });
        return;
      }

      const playbook = (playbookDoc.data() ?? {}) as Record<string, unknown>;
      if ((normalizeString(playbook['teamId']) ?? '') !== teamId) {
        res.status(403).json({ success: false, error: 'Playbook does not belong to this team' });
        return;
      }

      const teamDoc = await db.collection('Teams').doc(teamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        teamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      const title = normalizeString(body['title']) ?? 'Practice Script';
      const focus = normalizeString(body['focus']) ?? 'Weekly install and execution';
      const tempo = normalizeString(body['tempo']) ?? 'Game Tempo';
      const periods = normalizePracticeScriptPeriods(body['periods']);
      if (periods.length === 0) {
        res.status(400).json({ success: false, error: 'At least one script period is required' });
        return;
      }

      const now = new Date().toISOString();
      const slugSeed = `${title}-${now}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
      const docId = `${playbookId}_${slugSeed || 'practice-script'}`;

      const payload: Record<string, unknown> = {
        id: docId,
        teamId,
        playbookId,
        sport: normalizeString(playbook['sport']) ?? '',
        title,
        focus,
        tempo,
        scriptDate: normalizeString(body['scriptDate']) ?? undefined,
        opponent: normalizeString(body['opponent']) ?? undefined,
        objectives: safeExportStringArray(body['objectives']),
        periods,
        notes: normalizeString(body['notes']) ?? '',
        source: normalizeString(body['source']) ?? 'coach_manual',
        displayOrder: Number.isFinite(Number(body['displayOrder']))
          ? Number(body['displayOrder'])
          : -Date.now(),
        archived: false,
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      };

      await db.collection(TEAM_PRACTICE_SCRIPTS_COLLECTION).doc(docId).set(payload);
      res.status(201).json({ success: true, data: { script: payload } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('POST /playbooks/:id/practice-scripts failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to create practice script' });
    }
  }
);

router.patch(
  '/playbooks/:playbookId/practice-scripts/:scriptId',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId, scriptId } = req.params as { playbookId: string; scriptId: string };
      const body = req.body as Record<string, unknown>;
      const teamId = normalizeString(body['teamId']);
      if (!teamId) {
        res.status(400).json({ success: false, error: 'teamId is required' });
        return;
      }

      const { db } = req.firebase!;
      const docRef = db.collection(TEAM_PRACTICE_SCRIPTS_COLLECTION).doc(scriptId);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Practice script not found' });
        return;
      }

      const existing = (doc.data() ?? {}) as Record<string, unknown>;
      if ((normalizeString(existing['teamId']) ?? '') !== teamId) {
        res.status(403).json({ success: false, error: 'Script does not belong to this team' });
        return;
      }
      if ((normalizeString(existing['playbookId']) ?? '') !== playbookId) {
        res.status(403).json({ success: false, error: 'Script does not belong to this playbook' });
        return;
      }

      const teamDoc = await db.collection('Teams').doc(teamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        teamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };

      if (typeof body['title'] === 'string') updates['title'] = body['title'].trim();
      if (typeof body['focus'] === 'string') updates['focus'] = body['focus'].trim();
      if (typeof body['tempo'] === 'string') updates['tempo'] = body['tempo'].trim();
      if (typeof body['scriptDate'] === 'string') updates['scriptDate'] = body['scriptDate'].trim();
      if (typeof body['opponent'] === 'string') updates['opponent'] = body['opponent'].trim();
      if (typeof body['notes'] === 'string') updates['notes'] = body['notes'].trim();
      if (typeof body['archived'] === 'boolean') updates['archived'] = body['archived'];
      if (typeof body['displayOrder'] === 'number' && Number.isFinite(body['displayOrder'])) {
        updates['displayOrder'] = body['displayOrder'];
      }
      if (Array.isArray(body['objectives']))
        updates['objectives'] = safeExportStringArray(body['objectives']);
      if (Array.isArray(body['periods']))
        updates['periods'] = normalizePracticeScriptPeriods(body['periods']);

      await docRef.update(updates);
      res.json({ success: true, data: { id: scriptId, ...updates } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('PATCH /playbooks/:id/practice-scripts/:scriptId failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to update practice script' });
    }
  }
);

router.delete(
  '/playbooks/:playbookId/practice-scripts/:scriptId',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId, scriptId } = req.params as { playbookId: string; scriptId: string };
      const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : '';
      if (!teamId) {
        res.status(400).json({ success: false, error: 'teamId is required' });
        return;
      }

      const { db } = req.firebase!;
      const docRef = db.collection(TEAM_PRACTICE_SCRIPTS_COLLECTION).doc(scriptId);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Practice script not found' });
        return;
      }

      const existing = (doc.data() ?? {}) as Record<string, unknown>;
      if ((normalizeString(existing['teamId']) ?? '') !== teamId) {
        res.status(403).json({ success: false, error: 'Script does not belong to this team' });
        return;
      }
      if ((normalizeString(existing['playbookId']) ?? '') !== playbookId) {
        res.status(403).json({ success: false, error: 'Script does not belong to this playbook' });
        return;
      }

      const teamDoc = await db.collection('Teams').doc(teamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        teamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      await docRef.update({
        archived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: user.uid,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      });

      res.json({ success: true, data: { archived: true } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('DELETE /playbooks/:id/practice-scripts/:scriptId failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to delete practice script' });
    }
  }
);

router.post(
  '/playbooks/:playbookId/practice-script-ai',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId } = req.params as { playbookId: string };
      const body = req.body as Record<string, unknown>;
      const teamId = normalizeString(body['teamId']);
      const sport = normalizeString(body['sport']);
      const focus = normalizeString(body['focus']) ?? 'Weekly install and execution';

      if (!teamId) {
        res.status(400).json({ success: false, error: 'teamId is required' });
        return;
      }
      if (!sport) {
        res.status(400).json({ success: false, error: 'sport is required' });
        return;
      }

      const { db } = req.firebase!;
      const playbookRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId);
      const playbookDoc = await playbookRef.get();
      if (!playbookDoc.exists) {
        res.status(404).json({ success: false, error: 'Playbook not found' });
        return;
      }

      const playbook = playbookDoc.data() as Record<string, unknown>;
      const playbookTeamId = normalizeString(playbook['teamId']) ?? '';
      if (playbookTeamId !== teamId) {
        res.status(403).json({ success: false, error: 'Playbook does not belong to this team' });
        return;
      }

      const teamDoc = await db.collection(TEAMS_COLLECTION).doc(playbookTeamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        playbookTeamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      let draft = buildFallbackPracticeScript(playbook, focus);

      if (llmService) {
        try {
          const llmResult = await llmService.complete(
            [
              {
                role: 'system',
                content:
                  'You are Agent X elite practice planner. Return strict JSON only. Build a coach-grade practice script matrix with objective periods, rep counts, and concise coaching points.',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  sport,
                  focus,
                  playbookName: normalizeString(playbook['name']) ?? 'Playbook',
                  plays: Array.isArray(playbook['plays'])
                    ? (playbook['plays'] as Record<string, unknown>[])
                        .slice(0, 25)
                        .map((play, index) => ({
                          playName: normalizePlayName(play, index),
                          installStage:
                            play['installStage'] === 'install' ||
                            play['installStage'] === 'rep' ||
                            play['installStage'] === 'game-ready'
                              ? play['installStage']
                              : null,
                          situations: Array.isArray(play['situations']) ? play['situations'] : [],
                          coachingPoints: Array.isArray(play['coachingPoints'])
                            ? play['coachingPoints']
                            : [],
                        }))
                    : [],
                }),
              },
            ],
            {
              tier: 'task_automation',
              temperature: 0.2,
              maxTokens: 2200,
              jsonMode: true,
              outputSchema: {
                name: 'practice_script_plan',
                schema: practiceScriptAiOutputSchema,
                strict: true,
              },
            }
          );

          const parsed = practiceScriptAiOutputSchema.parse(
            llmResult.parsedOutput ??
              (llmResult.content
                ? JSON.parse(llmResult.content)
                : buildFallbackPracticeScript(playbook, focus))
          );

          draft = {
            title: parsed.title,
            focus: parsed.focus,
            tempo: parsed.tempo,
            objectives: parsed.objectives,
            periods: normalizePracticeScriptPeriods(parsed.periods),
            notes: parsed.notes ?? '',
          };
        } catch (err) {
          logger.warn('POST /playbooks/:id/practice-script-ai LLM fallback triggered', {
            playbookId,
            teamId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      res.json({ success: true, data: draft });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('POST /playbooks/:id/practice-script-ai failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to generate practice script' });
    }
  }
);

// ─── POST /playbooks/:playbookId/export-pdf ───────────────────────────────
router.post('/playbooks/:playbookId/export-pdf', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const parsedBody = playbookPdfExportBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({
        success: false,
        error: parsedBody.error.issues[0]?.message ?? 'Invalid export request payload',
      });
      return;
    }

    const { playbookId } = req.params as { playbookId: string };
    const { teamId, mode, activeTab, callsheetFilters, callsheetId, practiceScriptId } =
      parsedBody.data;
    const { db } = req.firebase!;

    const playbookDoc = await db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId).get();
    if (!playbookDoc.exists) {
      res.status(404).json({ success: false, error: 'Playbook not found' });
      return;
    }

    const playbook = playbookDoc.data() as Record<string, unknown>;
    const playbookTeamId = String(playbook['teamId'] ?? '');
    if (!playbookTeamId || playbookTeamId !== teamId) {
      res.status(403).json({ success: false, error: 'Playbook does not belong to this team' });
      return;
    }

    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(playbookTeamId).get();
    if (!teamDoc.exists) {
      res.status(404).json({ success: false, error: 'Team not found' });
      return;
    }

    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      playbookTeamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized' });
      return;
    }

    const shouldLoadGamePlans = mode === 'full' || activeTab === 'opponent';
    let gamePlans: Array<{
      readonly title: string;
      readonly opponent: string;
      readonly notes: string;
      readonly plays: readonly string[];
    }> = [];

    if (shouldLoadGamePlans) {
      const playbookSport = safeExportText(playbook['sport']);
      const gamePlanSnap = await db
        .collection(TEAM_GAMEPLANS_COLLECTION)
        .where('teamId', '==', playbookTeamId)
        .where('sport', '==', playbookSport)
        .limit(100)
        .get();

      gamePlans = gamePlanSnap.docs
        .map((doc: FirestoreDocLike) => doc.data())
        .filter((doc) => doc['status'] !== 'archived')
        .map((doc) => mapGamePlanDocToExportSummary(doc));
    }

    let callsheet: CallsheetPdfInput | null = null;

    if ((mode === 'full' || activeTab === 'callsheet') && callsheetId) {
      const callsheetDoc = await db.collection(TEAM_CALLSHEETS_COLLECTION).doc(callsheetId).get();

      if (callsheetDoc.exists) {
        const callsheetData = (callsheetDoc.data() ?? {}) as Record<string, unknown>;
        const callsheetPlays = normalizeCallsheetPlays(callsheetData['plays']);
        if (
          normalizeString(callsheetData['teamId']) === teamId &&
          normalizeString(callsheetData['playbookId']) === playbookId &&
          callsheetData['archived'] !== true
        ) {
          callsheet = {
            title: normalizeString(callsheetData['title']) ?? 'Saved Callsheet',
            situation: normalizeString(callsheetData['situation']) ?? 'all situations',
            notes: normalizeString(callsheetData['notes']) ?? undefined,
            plays: callsheetPlays,
            groups: normalizeCallsheetGroups(callsheetData['groups'], callsheetPlays),
          };
        }
      }
    }

    let practiceScript: PracticeScriptPdfInput | null = null;

    if ((mode === 'full' || activeTab === 'play-script') && practiceScriptId) {
      const practiceScriptDoc = await db
        .collection(TEAM_PRACTICE_SCRIPTS_COLLECTION)
        .doc(practiceScriptId)
        .get();

      if (practiceScriptDoc.exists) {
        const scriptData = (practiceScriptDoc.data() ?? {}) as Record<string, unknown>;
        if (
          normalizeString(scriptData['teamId']) === teamId &&
          normalizeString(scriptData['playbookId']) === playbookId &&
          scriptData['archived'] !== true
        ) {
          practiceScript = {
            title: normalizeString(scriptData['title']) ?? 'Practice Script',
            focus: normalizeString(scriptData['focus']) ?? 'Weekly install and execution',
            tempo: normalizeString(scriptData['tempo']) ?? 'Game Tempo',
            scriptDate: normalizeString(scriptData['scriptDate']) ?? undefined,
            opponent: normalizeString(scriptData['opponent']) ?? undefined,
            objectives: safeExportStringArray(scriptData['objectives']),
            periods: normalizePracticeScriptPeriods(scriptData['periods']),
            notes: normalizeString(scriptData['notes']) ?? undefined,
          };
        }
      }
    }

    const payload = buildPlaybookPdfPayload(
      playbook,
      mode,
      activeTab,
      callsheetFilters,
      callsheet,
      practiceScript,
      gamePlans
    );
    const exportService = new ExportService();
    const branding = await resolveExportBranding(
      db as unknown as FirestoreReadDb,
      (teamDoc.data() ?? {}) as Record<string, unknown>
    );

    const pdfBuffer = await exportService.generatePdf({
      ...payload,
      includeTable: !!(payload.columns?.length && payload.rows?.length),
      theme: 'light',
      ...branding,
      brandPrimaryColor: branding.brandPrimaryColor ?? '#111827',
      footerText: `${branding.organizationName ?? 'NXT1'} Coach Packet - Generated by NXT1`,
    });

    const safeBase = sanitizeExportFileBase(
      payload.title || `${safeExportText(playbook['name']) || 'playbook'}-export`
    );
    const fileName = `${safeBase}.pdf`;
    const hash = createHash('md5').update(pdfBuffer).digest('hex').slice(0, 8);
    const timestamp = Date.now();
    const storagePath = `Users/${user.uid}/agent-x/playbooks/exports/${timestamp}-${hash}.pdf`;
    const downloadToken = randomUUID();

    const bucket = req.firebase?.storage?.bucket() ?? getStorage().bucket();
    const file = bucket.file(storagePath);
    await file.save(pdfBuffer, {
      contentType: 'application/pdf',
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        contentDisposition: `attachment; filename="${fileName}"`,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const [exists] = await file.exists();
    if (!exists) {
      res.status(500).json({ success: false, error: 'Export upload verification failed' });
      return;
    }

    const downloadUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      `${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    logger.info('POST /playbooks/:id/export-pdf', {
      playbookId,
      teamId: playbookTeamId,
      mode,
      activeTab,
      callsheetId: callsheetId ?? null,
      practiceScriptId: practiceScriptId ?? null,
      sizeBytes: pdfBuffer.length,
      userId: user.uid,
    });

    res.json({
      success: true,
      data: {
        downloadUrl,
        storagePath,
        fileName,
        mimeType: 'application/pdf',
        format: 'pdf',
        sizeBytes: pdfBuffer.length,
        rowCount: payload.rows?.length ?? 0,
        columnCount: payload.columns?.length ?? 0,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('POST /playbooks/:id/export-pdf failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to export playbook PDF' });
  }
});

// ─── DELETE /playbooks/:playbookId/plays/:playIndex ──────────────────────────
router.delete(
  '/playbooks/:playbookId/plays/:playIndex',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId, playIndex } = req.params as { playbookId: string; playIndex: string };
      const idx = parseInt(playIndex, 10);
      if (Number.isNaN(idx) || idx < 0) {
        res.status(400).json({ success: false, error: 'Invalid play index' });
        return;
      }

      const { db } = req.firebase!;
      const docRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Playbook not found' });
        return;
      }

      const existing = doc.data() as Record<string, unknown>;
      const plays: Record<string, unknown>[] = [
        ...((existing['plays'] as Record<string, unknown>[]) ?? []),
      ];

      if (idx >= plays.length) {
        res.status(404).json({ success: false, error: 'Play index out of range' });
        return;
      }

      const playbookTeamId = String(existing['teamId'] ?? '');
      const teamDoc = await db.collection('Teams').doc(playbookTeamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        playbookTeamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      plays.splice(idx, 1);
      const now = new Date().toISOString();
      const indexes = buildPlayIndexes(plays);

      await docRef.update({
        plays,
        playCount: plays.length,
        ...indexes,
        updatedAt: now,
        updatedBy: user.uid,
      });

      try {
        const cache = getCacheService();
        await cache.del(`team:playbooks:${playbookTeamId}:${String(existing['sport'] ?? '')}`);
      } catch {
        /* best effort */
      }

      logger.info('DELETE /playbooks/:id/plays/:i', { playbookId, idx, teamId: playbookTeamId });
      res.json({ success: true, data: { playCount: plays.length } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('DELETE /playbooks/:id/plays/:i failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to delete play' });
    }
  }
);

export const __dashboardFilmReviewTimelineTestUtils = {
  parseFilmReviewTimelineSegments,
  parseHudlBreakdownBuffer,
  parseAiTimelineSeconds,
  parseAiTimelineResponse,
  buildFallbackTimelineSegments,
  buildFilmReviewTimelineCacheOptions,
} as const;

export default router;
