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
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
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
  OperationsLogCursor,
  CompletedGoalRecord,
} from '@nxt1/core';
import {
  AGENT_X_FIREBASE_MAX_VIDEO_FILE_SIZE,
  AGENT_X_VIDEO_CLOUDFLARE_THRESHOLD_BYTES,
  normalizeBaseSportKey,
} from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import { getSignedUrlWithTimeout } from '../../utils/gcs-signed-url.js';
import { upsertTeamFileFromAttachment } from '../../services/team/team-files-index.service.js';
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
  agentSingleFileUpload,
  getAuthUser,
  llmService,
  getGenerationService,
  isLegacyFallbackPlaybook,
  contextBuilder,
} from './shared.js';
import type { AgentJobDocument } from '../../modules/agent/queue/job.repository.js';
import { AgentMediaLifecycleService } from '../../modules/agent/tools/media/agent-media-lifecycle.service.js';
import { canManageTeamMutationForUser } from '../../services/team/team-intel-permissions.js';
import {
  sendAgentXUploadFailureAlert,
  sendAgentXVideoUploadFailureAlert,
} from '../../services/communications/agent-x/agent-x-video-upload-failure-alert.service.js';
import { BoardDiagramAssetService } from '../../modules/agent/tools/integrations/board-diagram/services/board-diagram-asset.service.js';
import {
  BoardDiagramService,
  renderBoardDiagramSvg,
} from '../../modules/agent/tools/integrations/board-diagram/board-diagram.service.js';
import { normalizeSportId } from '../../modules/agent/tools/integrations/play-diagram/sport-normalization.js';
import type {
  BoardDiagramAsset,
  BoardDiagramKind,
} from '../../modules/agent/tools/integrations/board-diagram/shared/board-diagram.types.js';

type TimestampLike = {
  toMillis(): number;
};

type NormalizedAgentUpload = {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly originalName: string;
  readonly sizeBytes: number;
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

const OPERATIONS_LOG_DEPENDENCY_TIMEOUT_MS = process.env['NODE_ENV'] === 'test' ? 25 : 5_000;

function applyNoStoreHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

async function withOperationsLogDependencyTimeout<T>(
  promise: Promise<T>,
  label: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${OPERATIONS_LOG_DEPENDENCY_TIMEOUT_MS}ms`));
    }, OPERATIONS_LOG_DEPENDENCY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function detectAgentUploadMultipartBoundary(buffer: Buffer): string | null {
  const newlineIndex = buffer.indexOf('\n');
  if (newlineIndex <= 2) return null;

  const firstLine = buffer.subarray(0, newlineIndex).toString('utf8').replace(/\r$/, '').trim();

  return firstLine.startsWith('--') ? firstLine : null;
}

function tryExtractNestedMultipartUpload(params: {
  readonly buffer: Buffer;
  readonly fallbackMimeType: string;
  readonly fallbackOriginalName: string;
}): NormalizedAgentUpload | null {
  const boundaryLine = detectAgentUploadMultipartBoundary(params.buffer);
  if (!boundaryLine) return null;

  const text = params.buffer.toString('latin1');
  const boundaryToken = boundaryLine.replace(/^--/, '');
  const parts = text.split(`--${boundaryToken}`);
  if (parts.length < 3) return null;

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r?\n/, '');
    if (!part || part === '--' || /^--\r?\n?$/.test(part)) continue;

    const separator = part.indexOf('\r\n\r\n');
    const separatorLength = separator >= 0 ? 4 : 0;
    const fallbackSeparator = separator >= 0 ? separator : part.indexOf('\n\n');
    if (fallbackSeparator < 0) continue;

    const headerBlock = part.slice(0, fallbackSeparator);
    if (!/content-type:\s*image\//i.test(headerBlock)) continue;

    const contentStart = fallbackSeparator + (separator >= 0 ? separatorLength : 2);
    let content = part.slice(contentStart);
    content = content.replace(/\r?\n--$/, '');
    content = content.replace(/\r?\n$/, '');

    const buffer = Buffer.from(content, 'latin1');
    const mimeTypeMatch = headerBlock.match(/content-type:\s*([^\r\n;]+)/i);
    const nameMatch = headerBlock.match(/filename="([^"]+)"/i);

    return {
      buffer,
      mimeType: mimeTypeMatch?.[1]?.trim().toLowerCase() || params.fallbackMimeType,
      originalName: nameMatch?.[1]?.trim() || params.fallbackOriginalName,
      sizeBytes: buffer.byteLength,
    };
  }

  return null;
}

function normalizeAgentUploadFile(file: Express.Multer.File): NormalizedAgentUpload {
  const extracted = tryExtractNestedMultipartUpload({
    buffer: file.buffer,
    fallbackMimeType: file.mimetype,
    fallbackOriginalName: file.originalname,
  });

  return (
    extracted ?? {
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      sizeBytes: file.size,
    }
  );
}

function parseTimelineSecond(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const mmSsMatch = trimmed.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (mmSsMatch) {
    const minutes = Number(mmSsMatch[1]);
    const seconds = Number(mmSsMatch[2]);
    if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
      return Math.max(0, minutes * 60 + seconds);
    }
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
}

function normalizeTimelineLabel(label: unknown, sport: string, index: number): string {
  const normalized = typeof label === 'string' ? label.trim() : '';
  if (!normalized) {
    return `Sequence ${index + 1}`;
  }

  if (sport.trim().toLowerCase() === 'football') {
    return `Sequence ${index + 1}`;
  }

  return normalized;
}

function parseAiTimelineResponseForTests(
  rawContent: string,
  durationSec: number,
  sport: string
): Array<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const container = parsed as Record<string, unknown>;
  const candidates = Array.isArray(container['timeline'])
    ? (container['timeline'] as unknown[])
    : Array.isArray(container['plays'])
      ? (container['plays'] as unknown[])
      : [];

  const safeDuration = Math.max(1, Number.isFinite(durationSec) ? durationSec : 1);
  const results: Array<Record<string, unknown>> = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const item = candidates[index];
    if (!item || typeof item !== 'object') continue;

    const record = item as Record<string, unknown>;
    const startRaw = record['startSec'] ?? record['start'];
    const endRaw = record['endSec'] ?? record['end'];
    const startSec = parseTimelineSecond(startRaw);
    const endSec = parseTimelineSecond(endRaw);
    if (startSec === null || endSec === null) continue;

    const boundedStart = Math.min(startSec, safeDuration);
    const boundedEnd = Math.min(Math.max(endSec, boundedStart + 0.1), safeDuration);

    results.push({
      id: `play-${index + 1}`,
      number: index + 1,
      label: normalizeTimelineLabel(record['label'], sport, index),
      startSec: boundedStart,
      endSec: boundedEnd,
      confidence:
        typeof record['confidence'] === 'number' && Number.isFinite(record['confidence'])
          ? record['confidence']
          : typeof record['confidenceScore'] === 'number' &&
              Number.isFinite(record['confidenceScore'])
            ? record['confidenceScore']
            : 0.75,
    });
  }

  return results;
}

function buildFallbackTimelineSegmentsForTests(
  durationSec: number
): Array<Record<string, unknown>> {
  const safeDuration = Math.max(1, Math.floor(durationSec));
  const blockSize = 60;
  const segments: Array<Record<string, unknown>> = [];

  let cursor = 0;
  let index = 1;
  while (cursor < safeDuration) {
    const end = Math.min(safeDuration, cursor + blockSize);
    segments.push({
      id: `play-${index}`,
      number: index,
      label: `Sequence ${index}`,
      startSec: cursor,
      endSec: end,
    });
    cursor = end;
    index += 1;
  }

  return segments;
}

function parseFilmReviewTimelineSegmentsForTests(
  timeline: readonly unknown[],
  sport: string
): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];

  for (let index = 0; index < timeline.length; index += 1) {
    const entry = timeline[index];
    if (!entry || typeof entry !== 'object') continue;

    const item = entry as Record<string, unknown>;
    const startSec = parseTimelineSecond(item['startSec']);
    const endSec = parseTimelineSecond(item['endSec']);
    if (startSec === null || endSec === null) continue;

    const annotationInput =
      item['annotation'] && typeof item['annotation'] === 'object'
        ? (item['annotation'] as Record<string, unknown>)
        : null;
    const strokes = Array.isArray(annotationInput?.['strokes'])
      ? (annotationInput?.['strokes'] as unknown[])
      : [];
    const points = strokes.flatMap((stroke) =>
      Array.isArray(stroke)
        ? stroke
            .filter((point) => point && typeof point === 'object')
            .map((point) => {
              const value = point as Record<string, unknown>;
              return {
                x: Number(value['x'] ?? 0),
                y: Number(value['y'] ?? 0),
              };
            })
        : []
    );

    const annotation = annotationInput
      ? {
          kind: typeof annotationInput['kind'] === 'string' ? annotationInput['kind'] : 'freehand',
          activeFromSec: parseTimelineSecond(annotationInput['activeFromSec']) ?? startSec,
          activeUntilSec: parseTimelineSecond(annotationInput['activeUntilSec']) ?? endSec,
          strokeCount: strokes.length,
          points,
        }
      : undefined;

    results.push({
      id: `play-${index + 1}`,
      number: index + 1,
      label: normalizeTimelineLabel(item['label'], sport, index),
      startSec,
      endSec,
      ...(annotation ? { annotation } : {}),
    });
  }

  return results;
}

function normalizeImportedBreakdownTimelineForTests(
  review: {
    readonly uploadMode: string;
    readonly sources: ReadonlyArray<Record<string, unknown>>;
    readonly timeline: ReadonlyArray<Record<string, unknown>>;
  },
  parsedTimeline: ReadonlyArray<Record<string, unknown>>,
  parsedWarnings: readonly string[]
): {
  readonly timeline: ReadonlyArray<Record<string, unknown>>;
  readonly warnings: readonly string[];
} {
  if (review.uploadMode !== 'batch_clips' || review.sources.length <= 1) {
    return { timeline: parsedTimeline, warnings: parsedWarnings };
  }

  const sourceGroups = Array.from(
    review.sources
      .reduce((groups, source, index) => {
        const angleGroupId = String(source['angleGroupId'] ?? '').trim();
        const sourceId = String(source['id'] ?? '').trim();
        const groupKey = angleGroupId || sourceId || `source-index:${index}`;
        const group = groups.get(groupKey) ?? [];
        group.push(source);
        groups.set(groupKey, group);
        return groups;
      }, new Map<string, Record<string, unknown>[]>())
      .values()
  );

  const timeline = sourceGroups.map((sources, index) => {
    const primarySource =
      sources.find((source) => String(source['cameraAngle'] ?? '').trim() === 'wide') ??
      (sources[0] as Record<string, unknown>);
    const sourceId = String(primarySource['id'] ?? '').trim();
    const sourceIds = [
      ...new Set(sources.map((source) => String(source['id'] ?? '').trim())),
    ].filter((value) => value.length > 0);
    const imported = parsedTimeline[index] ?? null;
    const sourceDurations = sources
      .map((source) => Number(source['durationSec'] ?? Number.NaN))
      .filter((value) => Number.isFinite(value));
    const fallbackDuration = Math.max(1, ...sourceDurations, 1);

    if (!imported) {
      return {
        id: `play-${sourceId || index + 1}`,
        number: index + 1,
        label: String(primarySource['title'] ?? `Clip ${index + 1}`),
        startSec: 0,
        endSec: fallbackDuration,
        sourceId,
        sourceIds,
      };
    }

    return {
      ...imported,
      id: String(imported['id'] ?? `play-${sourceId || index + 1}`),
      number: index + 1,
      startSec: 0,
      endSec: fallbackDuration,
      sourceId,
      sourceIds,
    };
  });

  return {
    timeline,
    warnings: [...parsedWarnings],
  };
}

export const __dashboardFilmReviewTimelineTestUtils = {
  normalizeAgentUploadFile,
  parseAiTimelineResponse: parseAiTimelineResponseForTests,
  buildFallbackTimelineSegments: buildFallbackTimelineSegmentsForTests,
  buildFilmReviewTimelineCacheOptions: (userId: string, filmReviewId: string) => ({
    userId,
    contextCacheScopeId: `film-review:${filmReviewId}`,
    enableContextCache: true,
  }),
  parseFilmReviewTimelineSegments: parseFilmReviewTimelineSegmentsForTests,
  normalizeImportedBreakdownTimeline: normalizeImportedBreakdownTimelineForTests,
} as const;

const router = Router();
const RECURRING_TASKS_COLLECTION = 'RecurringTasks' as const;
const MB = 1024 * 1024;
const GB = 1024 * MB;
const AGENT_X_VIDEO_THUMBNAIL_MAX_BYTES = 5 * MB;
const VIDEO_UPLOAD_URL_TTL_MS_SMALL = 30 * 60 * 1000;
const VIDEO_UPLOAD_URL_TTL_MS_MEDIUM = 60 * 60 * 1000;
const VIDEO_UPLOAD_URL_TTL_MS_LARGE = 120 * 60 * 1000;

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

function buildOperationsLogStableKey(
  entry: Pick<OperationLogEntry, 'threadId' | 'operationId' | 'id'>
): string {
  const threadId = entry.threadId?.trim();
  if (threadId) {
    return `thread:${threadId}`;
  }

  const operationId = entry.operationId?.trim();
  if (operationId) {
    return `operation:${operationId}`;
  }

  return `entry:${entry.id}`;
}

function compareOperationsLogEntries(
  a: Pick<OperationLogEntry, 'timestamp' | 'threadId' | 'operationId' | 'id'>,
  b: Pick<OperationLogEntry, 'timestamp' | 'threadId' | 'operationId' | 'id'>
): number {
  const timeA = Date.parse(a.timestamp);
  const timeB = Date.parse(b.timestamp);
  const normalizedTimeA = Number.isFinite(timeA) ? timeA : 0;
  const normalizedTimeB = Number.isFinite(timeB) ? timeB : 0;

  if (normalizedTimeA !== normalizedTimeB) {
    return normalizedTimeB - normalizedTimeA;
  }

  return buildOperationsLogStableKey(b).localeCompare(buildOperationsLogStableKey(a));
}

function encodeOperationsLogCursor(
  entry: Pick<OperationLogEntry, 'timestamp' | 'threadId' | 'operationId' | 'id'>
): string {
  const payload: OperationsLogCursor = {
    v: 1,
    timestamp: entry.timestamp,
    stableKey: buildOperationsLogStableKey(entry),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeOperationsLogCursor(cursor: unknown): OperationsLogCursor | null {
  if (typeof cursor !== 'string' || cursor.trim().length === 0) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    ) as Partial<OperationsLogCursor>;
    if (decoded.v !== 1) return null;
    if (typeof decoded.timestamp !== 'string' || decoded.timestamp.trim().length === 0) {
      return null;
    }
    if (typeof decoded.stableKey !== 'string' || decoded.stableKey.trim().length === 0) {
      return null;
    }

    return {
      v: 1,
      timestamp: decoded.timestamp,
      stableKey: decoded.stableKey,
    };
  } catch {
    return null;
  }
}

function filterOperationsAfterCursor(
  entries: readonly OperationLogEntry[],
  cursor: OperationsLogCursor | null
): readonly OperationLogEntry[] {
  if (!cursor) {
    return entries;
  }

  const cursorTime = Date.parse(cursor.timestamp);
  const normalizedCursorTime = Number.isFinite(cursorTime) ? cursorTime : 0;

  return entries.filter((entry) => {
    const entryTime = Date.parse(entry.timestamp);
    const normalizedEntryTime = Number.isFinite(entryTime) ? entryTime : 0;
    if (normalizedEntryTime < normalizedCursorTime) {
      return true;
    }
    if (normalizedEntryTime > normalizedCursorTime) {
      return false;
    }

    return buildOperationsLogStableKey(entry).localeCompare(cursor.stableKey) < 0;
  });
}

function splitOperationsLogEntries(entries: readonly OperationLogEntry[]): {
  readonly scheduled: readonly OperationLogEntry[];
  readonly history: readonly OperationLogEntry[];
} {
  const scheduled: OperationLogEntry[] = [];
  const history: OperationLogEntry[] = [];

  for (const entry of entries) {
    if (entry.isScheduled === true) {
      scheduled.push(entry);
    } else {
      history.push(entry);
    }
  }

  scheduled.sort(compareOperationsLogEntries);
  history.sort(compareOperationsLogEntries);

  return { scheduled, history };
}

function countOperationsLogJobHistoryCandidates(
  jobs: readonly AgentJobDocument[],
  options: {
    readonly activeThreadIds: ReadonlySet<string>;
    readonly threadFilterIsAuthoritative: boolean;
    readonly activeRecurringTaskKeys: ReadonlySet<string>;
    readonly activeRecurringSourceIds: ReadonlySet<string>;
  }
): number {
  const seenThreadIds = new Set<string>();
  let count = 0;

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

    if (operationId.startsWith('playbook-') || jobMode === 'playbook') {
      continue;
    }

    if (parentOperationId) {
      continue;
    }

    const intent = (job['intent'] as string) ?? '';
    if (!intent) {
      continue;
    }

    const threadId = (job['threadId'] as string) ?? undefined;
    if (threadId) {
      if (options.threadFilterIsAuthoritative && !options.activeThreadIds.has(threadId)) {
        continue;
      }

      if (seenThreadIds.has(threadId)) {
        continue;
      }

      seenThreadIds.add(threadId);
    }

    const jobOrigin = validateJobOrigin(job['origin']);
    if (
      shouldHideRecurringExecutionJob({
        origin: jobOrigin,
        recurringTaskKey:
          typeof job['recurringTaskKey'] === 'string' ? (job['recurringTaskKey'] as string) : null,
        threadId,
        context: jobContext,
        activeRecurringTaskKeys: options.activeRecurringTaskKeys,
        activeRecurringSourceIds: options.activeRecurringSourceIds,
      })
    ) {
      continue;
    }

    if (isScheduledOrigin(jobOrigin)) {
      continue;
    }

    count += 1;
  }

  return count;
}

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
    applyNoStoreHeaders(res);

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
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 50;
    const cursor = decodeOperationsLogCursor(req.query['cursor']);

    const { db } = req.firebase!;

    const scanPageSize = Math.max(limit * 3, 60);
    const maxScanPages = 6;
    const jobs: AgentJobDocument[] = [];
    let sourceHasMore = true;
    let jobScanCursor: string | undefined;

    const activeThreadsPromise = chatService
      ? chatService.getUserThreads({
          userId: user.uid,
          archived: false,
          limit: Math.min(scanPageSize, 100),
        })
      : null;

    const recurringTasksPromise = db
      .collection(RECURRING_TASKS_COLLECTION)
      .where('userId', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    let prefetchedThreadResult: Awaited<
      ReturnType<NonNullable<typeof chatService>['getUserThreads']>
    > | null = null;
    let threadPrefetchFailed = false;
    let prefetchedRecurringSnapshot: {
      empty: boolean;
      docs: FirestoreDocLike[];
    } | null = null;
    let recurringPrefetchFailed = false;

    for (let pageIndex = 0; pageIndex < maxScanPages && sourceHasMore; pageIndex += 1) {
      try {
        const page = await withOperationsLogDependencyTimeout(
          jobRepository.withDb(db).getByUserPage(user.uid, scanPageSize, jobScanCursor),
          'agentJobs operations-log page query'
        );
        jobs.push(...page.jobs);
        sourceHasMore = page.hasMore;
        jobScanCursor = page.nextCreatedAt;
      } catch (queryErr) {
        const msg = queryErr instanceof Error ? queryErr.message : String(queryErr);
        logger.warn('agentJobs paged query failed — composite index may not be deployed', {
          userId: user.uid,
          error: msg,
        });
        sourceHasMore = false;
      }

      if (!cursor) {
        if (activeThreadsPromise && !prefetchedThreadResult && !threadPrefetchFailed) {
          try {
            prefetchedThreadResult = await withOperationsLogDependencyTimeout(
              activeThreadsPromise,
              'Mongo active threads query'
            );
          } catch (threadErr) {
            threadPrefetchFailed = true;
            logger.warn('Failed to fetch active threads for operations log filtering', {
              userId: user.uid,
              error: threadErr instanceof Error ? threadErr.message : String(threadErr),
            });
          }
        }

        if (!prefetchedRecurringSnapshot && !recurringPrefetchFailed) {
          try {
            const snapshot = await withOperationsLogDependencyTimeout(
              recurringTasksPromise,
              'Firestore recurring tasks query'
            );
            prefetchedRecurringSnapshot = {
              empty: snapshot.empty,
              docs: snapshot.docs as FirestoreDocLike[],
            };
          } catch (recurringErr) {
            recurringPrefetchFailed = true;
            logger.warn('Failed to prefetch recurring tasks for operations log filtering', {
              userId: user.uid,
              error: recurringErr instanceof Error ? recurringErr.message : String(recurringErr),
            });
          }
        }

        if (!threadPrefetchFailed && !recurringPrefetchFailed) {
          const earlyActiveThreadIds = new Set<string>();
          const earlyThreadTitleById = new Map<string, string>();
          const earlyThreadFilterIsAuthoritative = !(prefetchedThreadResult?.hasMore ?? false);

          for (const thread of prefetchedThreadResult?.items ?? []) {
            if (!thread.id) continue;
            earlyActiveThreadIds.add(thread.id);
            earlyThreadTitleById.set(thread.id, thread.title);
          }

          const earlyActiveRecurringTaskKeys = new Set<string>();
          const earlyActiveRecurringSourceIds = new Set<string>();
          for (const doc of prefetchedRecurringSnapshot?.docs ?? []) {
            earlyActiveRecurringTaskKeys.add(doc.id);
            const data = doc.data();
            const sourceId = resolveRecurringTaskSourceId(data);
            if (sourceId) {
              earlyActiveRecurringSourceIds.add(sourceId);
            }
          }

          const candidateCount = countOperationsLogJobHistoryCandidates(jobs, {
            activeThreadIds: earlyActiveThreadIds,
            threadFilterIsAuthoritative: earlyThreadFilterIsAuthoritative,
            activeRecurringTaskKeys: earlyActiveRecurringTaskKeys,
            activeRecurringSourceIds: earlyActiveRecurringSourceIds,
          });

          if (candidateCount >= limit + 1) {
            break;
          }
        }
      }
    }

    let activeThreads: Awaited<
      ReturnType<NonNullable<typeof chatService>['getUserThreads']>
    >['items'] = [];
    const activeThreadIds = new Set<string>();
    const threadTitleById = new Map<string, string>();
    // Track whether the thread query fully covered the active thread set. When
    // false (query failed or truncated), fall back to lenient filtering so
    // older valid sessions are not hidden from pagination.
    let threadFilterIsAuthoritative = false;

    if (prefetchedThreadResult) {
      activeThreads = prefetchedThreadResult.items ?? [];
      threadFilterIsAuthoritative = !prefetchedThreadResult.hasMore;

      for (const thread of activeThreads) {
        if (!thread.id) continue;
        activeThreadIds.add(thread.id);
        threadTitleById.set(thread.id, thread.title);
      }

      if (prefetchedThreadResult.hasMore) {
        logger.info('Operations log thread augmentation truncated — consider increasing limit', {
          userId: user.uid,
          displayedCount: activeThreads.length,
          limit,
        });
      }
    } else if (activeThreadsPromise && !threadPrefetchFailed) {
      try {
        const threadResult = await withOperationsLogDependencyTimeout(
          activeThreadsPromise,
          'Mongo active threads query'
        );
        activeThreads = threadResult.items ?? [];
        threadFilterIsAuthoritative = !threadResult.hasMore;

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

    if (prefetchedRecurringSnapshot) {
      recurringTasksSnapshot = prefetchedRecurringSnapshot;
      for (const doc of recurringTasksSnapshot.docs) {
        activeRecurringTaskKeys.add(doc.id);
        const data = doc.data();
        const sourceId = resolveRecurringTaskSourceId(data);
        if (sourceId) activeRecurringSourceIds.add(sourceId);
      }
    } else if (!recurringPrefetchFailed) {
      try {
        const snapshot = await withOperationsLogDependencyTimeout(
          recurringTasksPromise,
          'Firestore recurring tasks query'
        );

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
        // Only apply when the active-thread query was exhaustive; truncated
        // thread pages cannot safely be treated as the full active set.
        if (threadFilterIsAuthoritative && !activeThreadIds.has(threadId)) continue;

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
          ? ((await withOperationsLogDependencyTimeout(
              queueService.getAllRepeatableJobs() as Promise<RepeatableJobDescriptor[]>,
              'BullMQ repeatable jobs query'
            )) as RepeatableJobDescriptor[])
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
              ? await withOperationsLogDependencyTimeout(
                  queueService.getJobStatus(initialRunJobId),
                  'BullMQ initial job status query'
                ).catch(() => null)
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

    const { scheduled, history } = splitOperationsLogEntries(entries);
    const cursorFilteredHistory = filterOperationsAfterCursor(history, cursor);
    const pagedHistory = cursorFilteredHistory.slice(0, limit + 1);
    const hasMore = pagedHistory.length > limit;
    const data = hasMore ? pagedHistory.slice(0, limit) : pagedHistory;
    const nextCursor = hasMore ? encodeOperationsLogCursor(data[data.length - 1]!) : undefined;

    logger.info('Operations log fetched', {
      userId: user.uid,
      historyCount: data.length,
      scheduledCount: scheduled.length,
      hasMore,
    });
    res.json({
      success: true,
      data,
      scheduled,
      pageInfo: {
        hasMore,
        ...(nextCursor ? { nextCursor } : {}),
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get operations log', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get operations log' });
  }
});

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
        updatedAt: FieldValue.serverTimestamp(),
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
          nextDocData['initialRunJobId'] = FieldValue.delete();
          nextDocData['firstRunAt'] = FieldValue.delete();
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
  agentSingleFileUpload,
  async (req: Request, res: Response) => {
    let alertUserId: string | null = null;
    let alertTeamId: string | null = null;
    let alertThreadId: string | null = null;
    let alertFileName: string | null = null;
    let alertMimeType: string | null = null;
    let alertFileSizeBytes: number | null = null;
    let alertStoragePath: string | null = null;

    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      alertUserId = user.uid;

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file provided' });
        return;
      }

      const normalizedFile = normalizeAgentUploadFile(file);
      const threadId = (req.body?.threadId as string | undefined) ?? null;
      const teamId =
        typeof req.body?.teamId === 'string' && req.body.teamId.trim().length > 0
          ? req.body.teamId.trim()
          : null;
      const sport =
        typeof req.body?.sport === 'string' && req.body.sport.trim().length > 0
          ? req.body.sport.trim()
          : undefined;
      alertThreadId = threadId;
      alertTeamId = teamId;
      alertFileName = normalizedFile.originalName;
      alertMimeType = normalizedFile.mimeType;
      alertFileSizeBytes = normalizedFile.sizeBytes;
      if (teamId) {
        const teamDoc = await req.firebase.db.collection('Teams').doc(teamId).get();
        if (!teamDoc.exists) {
          res.status(404).json({ success: false, error: 'Team not found' });
          return;
        }

        const authorized = await canManageTeamMutationForUser(
          req.firebase.db,
          user.uid,
          teamId,
          teamDoc.data() ?? {}
        );
        if (!authorized) {
          res.status(403).json({ success: false, error: 'Forbidden' });
          return;
        }
      }
      const bucket = req.firebase.storage.bucket();
      const storagePath = AgentMediaLifecycleService.buildStoragePath({
        userId: user.uid,
        threadId,
        mimeType: normalizedFile.mimeType,
        fileName: normalizedFile.originalName,
        zone: 'media',
      });
      alertStoragePath = storagePath;

      const { url: durableUrl } = await AgentMediaLifecycleService.saveBufferAndSignRead({
        bucket,
        storagePath,
        buffer: normalizedFile.buffer,
        mimeType: normalizedFile.mimeType,
      });

      logger.info('Agent X file uploaded', {
        userId: user.uid,
        threadId: threadId || 'unbound',
        mimeType: normalizedFile.mimeType,
        sizeBytes: normalizedFile.sizeBytes,
        storagePath,
        urlKind: 'firebase-download-token',
      });

      if (teamId) {
        await upsertTeamFileFromAttachment({
          db: req.firebase.db,
          teamId,
          userId: user.uid,
          origin: 'files_upload',
          sport,
          sourceThreadId: threadId ?? undefined,
          attachment: {
            id: createHash('sha1')
              .update(`${storagePath}:${normalizedFile.sizeBytes}:${normalizedFile.mimeType}`)
              .digest('hex'),
            url: durableUrl,
            storagePath,
            name: normalizedFile.originalName,
            mimeType: normalizedFile.mimeType,
            type: normalizedFile.mimeType.startsWith('image/')
              ? 'image'
              : normalizedFile.mimeType === 'application/pdf'
                ? 'pdf'
                : normalizedFile.mimeType === 'text/csv' ||
                    normalizedFile.mimeType.includes('spreadsheet') ||
                    normalizedFile.mimeType.includes('excel')
                  ? 'csv'
                  : 'doc',
            sizeBytes: normalizedFile.sizeBytes,
          },
        });
      }

      res.json({
        success: true,
        data: {
          url: durableUrl,
          storagePath,
          name: normalizedFile.originalName,
          mimeType: normalizedFile.mimeType,
          sizeBytes: normalizedFile.sizeBytes,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Agent X file upload failed', { error: error.message, stack: error.stack });
      await sendAgentXUploadFailureAlert({
        stage: 'firebase_file_upload_failed',
        error: error.message,
        userId: alertUserId ?? req.user?.uid ?? null,
        teamId: alertTeamId,
        threadId: alertThreadId,
        fileName: alertFileName,
        mimeType: alertMimeType,
        fileSizeBytes: alertFileSizeBytes,
        storagePath: alertStoragePath,
        requestPath: req.originalUrl,
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent'],
        details: error.stack ?? null,
      });
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
  agentSingleFileUpload,
  async (req: Request, res: Response) => {
    let alertUserId: string | null = null;
    let alertThreadId: string | null = null;
    let alertFileName: string | null = null;
    let alertMimeType: string | null = null;
    let alertFileSizeBytes: number | null = null;
    let alertStoragePath: string | null = null;

    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      alertUserId = user.uid;

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file provided' });
        return;
      }

      const normalizedFile = normalizeAgentUploadFile(file);
      const threadId = (req.body?.threadId as string | undefined) ?? null;
      alertThreadId = threadId;
      alertFileName = normalizedFile.originalName;
      alertMimeType = normalizedFile.mimeType;
      alertFileSizeBytes = normalizedFile.sizeBytes;
      const bucket = req.firebase.storage.bucket();
      const storagePath = AgentMediaLifecycleService.buildStoragePath({
        userId: user.uid,
        threadId,
        mimeType: normalizedFile.mimeType,
        fileName: normalizedFile.originalName,
        zone: 'tmp',
      });
      alertStoragePath = storagePath;

      const { url: durableUrl } = await AgentMediaLifecycleService.saveBufferAndSignRead({
        bucket,
        storagePath,
        buffer: normalizedFile.buffer,
        mimeType: normalizedFile.mimeType,
      });

      logger.info('Agent X tmp file uploaded', {
        userId: user.uid,
        threadId: threadId || 'unbound',
        mimeType: normalizedFile.mimeType,
        sizeBytes: normalizedFile.sizeBytes,
        storagePath,
        urlKind: 'firebase-download-token',
      });

      res.json({
        success: true,
        data: {
          url: durableUrl,
          storagePath,
          name: normalizedFile.originalName,
          mimeType: normalizedFile.mimeType,
          sizeBytes: normalizedFile.sizeBytes,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Agent X tmp upload failed', { error: error.message, stack: error.stack });
      await sendAgentXUploadFailureAlert({
        stage: 'firebase_tmp_upload_failed',
        error: error.message,
        userId: alertUserId ?? req.user?.uid ?? null,
        threadId: alertThreadId,
        fileName: alertFileName,
        mimeType: alertMimeType,
        fileSizeBytes: alertFileSizeBytes,
        storagePath: alertStoragePath,
        requestPath: req.originalUrl,
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent'],
        details: error.stack ?? null,
      });
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
  let alertUserId: string | null = null;
  let alertStoragePath: string | null = null;
  let alertPromotedStoragePath: string | null = null;

  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    alertUserId = user.uid;

    const { storagePath } = req.body as { storagePath?: unknown };
    if (typeof storagePath !== 'string' || !storagePath.trim()) {
      res.status(400).json({ success: false, error: 'storagePath is required' });
      return;
    }
    alertStoragePath = storagePath.trim();

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
    alertPromotedStoragePath = promoted.storagePath;

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
    await sendAgentXUploadFailureAlert({
      stage: 'firebase_tmp_promote_failed',
      error: error.message,
      userId: alertUserId ?? req.user?.uid ?? null,
      storagePath: alertStoragePath,
      promotedStoragePath: alertPromotedStoragePath,
      requestPath: req.originalUrl,
      contentType: req.headers['content-type'],
      userAgent: req.headers['user-agent'],
      details: error.stack ?? null,
    });
    res.status(500).json({ success: false, error: 'Failed to promote file' });
  }
});

// ─── POST /upload/video ────────────────────────────────────────────────────
// Provision a Firebase Storage v4 signed upload URL for Agent X chat video
// attachments. The browser PUTs directly to GCS (no backend buffering), then
// uses the returned read URL as the attachment URL — which MediaTransportResolver
// already treats as isDirectlyPortable (no Cloudflare re-encoding wait).
//
// Body: { fileName: string, mimeType: string, fileSize: number, threadId?: string, nativeUpload?: boolean, purpose?: 'video_thumbnail' }
// Returns: { uploadUrl, readUrl, storagePath, expiresAt }
router.post('/upload/video', appGuard, async (req: Request, res: Response) => {
  let alertThreadId: string | null = null;
  let alertFileName: string | null = null;
  let alertMimeType: string | null = null;
  let alertFileSizeBytes: number | null = null;
  let alertNativeUpload: boolean | null = null;

  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { fileName, mimeType, fileSize, threadId, nativeUpload, purpose } = req.body as {
      fileName?: unknown;
      mimeType?: unknown;
      fileSize?: unknown;
      threadId?: unknown;
      nativeUpload?: unknown;
      purpose?: unknown;
    };

    // ── Validate inputs ───────────────────────────────────────────────────
    if (typeof fileName !== 'string' || !fileName.trim()) {
      res.status(400).json({ success: false, error: 'fileName is required' });
      return;
    }
    const uploadPurpose = purpose === 'video_thumbnail' ? 'video_thumbnail' : 'video';
    if (purpose !== undefined && purpose !== 'video_thumbnail') {
      res.status(400).json({ success: false, error: 'Unsupported upload purpose' });
      return;
    }
    if (
      typeof mimeType !== 'string' ||
      (uploadPurpose === 'video' ? !mimeType.startsWith('video/') : mimeType !== 'image/jpeg')
    ) {
      res.status(400).json({
        success: false,
        error:
          uploadPurpose === 'video_thumbnail'
            ? 'mimeType must be image/jpeg for video thumbnails'
            : 'mimeType must be a video/* MIME type',
        code: 'INVALID_MIME_TYPE',
      });
      return;
    }
    if (typeof fileSize !== 'number' || fileSize <= 0) {
      res.status(400).json({ success: false, error: 'fileSize must be a positive number' });
      return;
    }
    const isNativeUpload = nativeUpload === true;
    if (
      uploadPurpose === 'video_thumbnail' &&
      (fileSize > AGENT_X_VIDEO_THUMBNAIL_MAX_BYTES || fileSize <= 0)
    ) {
      res.status(400).json({
        success: false,
        error: `Thumbnail exceeds upload limit (${formatSizeLabel(AGENT_X_VIDEO_THUMBNAIL_MAX_BYTES)}).`,
        code: 'FILE_TOO_LARGE',
      });
      return;
    }
    if (
      uploadPurpose === 'video' &&
      !isNativeUpload &&
      fileSize >= AGENT_X_VIDEO_CLOUDFLARE_THRESHOLD_BYTES
    ) {
      res.status(413).json({
        success: false,
        error: `Videos ${formatSizeLabel(AGENT_X_VIDEO_CLOUDFLARE_THRESHOLD_BYTES)} and larger must use Cloudflare Stream TUS.`,
        code: 'USE_CLOUDFLARE_TUS',
      });
      return;
    }
    if (uploadPurpose === 'video' && fileSize > AGENT_X_FIREBASE_MAX_VIDEO_FILE_SIZE) {
      res.status(400).json({
        success: false,
        error: `File exceeds Firebase video upload limit (${formatSizeLabel(AGENT_X_FIREBASE_MAX_VIDEO_FILE_SIZE)}). Large Agent X videos must use Cloudflare Stream TUS.`,
        code: 'FILE_TOO_LARGE',
      });
      return;
    }

    const resolvedThreadId =
      typeof threadId === 'string' && threadId.trim() ? threadId.trim() : null;

    alertThreadId = resolvedThreadId;
    alertFileName = fileName;
    alertMimeType = mimeType;
    alertFileSizeBytes = fileSize;
    alertNativeUpload = isNativeUpload;

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
    // Read URL is a temporary signed URL valid for 7 days — long enough for any
    // downstream processing. The client should call /upload/promote after the
    // upload completes to obtain a permanent Firebase download-token URL.
    const readExpiresAtMs = Date.now() + 7 * 24 * 60 * 60 * 1000;

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
      uploadPurpose,
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

    await sendAgentXVideoUploadFailureAlert({
      stage: 'firebase_provision_failed',
      error: error.message,
      userId: req.user?.uid ?? null,
      threadId: alertThreadId,
      fileName: alertFileName,
      mimeType: alertMimeType,
      fileSizeBytes: alertFileSizeBytes,
      nativeUpload: alertNativeUpload ?? undefined,
      errorCode: isTimeout ? 'STORAGE_TIMEOUT' : null,
      details: error.stack ?? null,
      requestPath: req.originalUrl,
      contentType: req.headers['content-type'],
      userAgent: req.headers['user-agent'],
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

export default router;
