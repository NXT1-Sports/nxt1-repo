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
import { FieldValue } from 'firebase-admin/firestore';
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
  OperationsLogCursor,
  CompletedGoalRecord,
  UniversalFileDoc,
  UniversalPlaybookFilePayload,
} from '@nxt1/core';
import {
  AGENT_X_FIREBASE_MAX_VIDEO_FILE_SIZE,
  AGENT_X_VIDEO_CLOUDFLARE_THRESHOLD_BYTES,
  UNIVERSAL_FILES_COLLECTION,
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
  agentUpload,
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
  ExportService,
  type ExportColumn,
  type ExportRow,
} from '../../modules/agent/services/export.service.js';
import {
  getUniversalCallsheetById,
  getUniversalPracticeScriptById,
  listUniversalGamePlansForTeam,
} from '../../services/team/universal-team-documents.service.js';
import { scheduleUniversalFileSemanticSync } from '../../services/team/universal-file-semantic.service.js';
import { getCacheService } from '../../services/core/cache.service.js';
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

  const timeline = review.sources.map((source, index) => {
    const sourceId = String(source['id'] ?? '').trim();
    const imported = parsedTimeline[index] ?? null;
    const sourceDuration = Number(source['durationSec'] ?? 1);
    const fallbackDuration = Number.isFinite(sourceDuration) ? Math.max(1, sourceDuration) : 1;

    if (!imported) {
      return {
        id: `play-${sourceId || index + 1}`,
        number: index + 1,
        label: String(source['title'] ?? `Clip ${index + 1}`),
        startSec: 0,
        endSec: fallbackDuration,
        sourceId,
      };
    }

    return {
      ...imported,
      id: String(imported['id'] ?? `play-${sourceId || index + 1}`),
      number: index + 1,
      startSec: 0,
      endSec: fallbackDuration,
      sourceId,
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
const TEAMS_COLLECTION = 'Teams' as const;
const MB = 1024 * 1024;
const GB = 1024 * MB;
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
        const page = await jobRepository
          .withDb(db)
          .getByUserPage(user.uid, scanPageSize, jobScanCursor);
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
            prefetchedThreadResult = await activeThreadsPromise;
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
            const snapshot = await recurringTasksPromise;
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
        const threadResult = await activeThreadsPromise;
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
        const snapshot = await recurringTasksPromise;

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

      const { url: signedUrl, expiresAt } = await AgentMediaLifecycleService.saveBufferAndSignRead({
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
        signedUrlExpires: new Date(expiresAt).toISOString(),
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
            url: signedUrl,
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
          url: signedUrl,
          storagePath,
          name: normalizedFile.originalName,
          mimeType: normalizedFile.mimeType,
          sizeBytes: normalizedFile.sizeBytes,
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

      const normalizedFile = normalizeAgentUploadFile(file);
      const threadId = (req.body?.threadId as string | undefined) ?? null;
      const bucket = req.firebase.storage.bucket();
      const storagePath = AgentMediaLifecycleService.buildStoragePath({
        userId: user.uid,
        threadId,
        mimeType: normalizedFile.mimeType,
        fileName: normalizedFile.originalName,
        zone: 'tmp',
      });

      const { url: signedUrl } = await AgentMediaLifecycleService.saveBufferAndSignRead({
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
      });

      res.json({
        success: true,
        data: {
          url: signedUrl,
          storagePath,
          name: normalizedFile.originalName,
          mimeType: normalizedFile.mimeType,
          sizeBytes: normalizedFile.sizeBytes,
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

function buildPlaybookSemanticText(title: string, data: Record<string, unknown>): string {
  const lines = [`Title: ${title}`];

  const season = normalizeString(data['season']);
  if (season) lines.push(`Season: ${season}`);

  const source = normalizeString(data['source']);
  if (source) lines.push(`Source: ${source}`);

  const sourceUrl = normalizeString(data['sourceUrl']);
  if (sourceUrl) lines.push(`Source URL: ${sourceUrl}`);

  const plays = Array.isArray(data['plays']) ? (data['plays'] as Record<string, unknown>[]) : [];
  for (const play of plays.slice(0, 40)) {
    const playName = normalizeString(play['name']) ?? normalizeString(play['title']);
    if (playName) {
      lines.push(`Play: ${playName}`);
    }
    const objective = normalizeString(play['objective']);
    if (objective) {
      lines.push(`Objective: ${objective}`);
    }
    const installNotes = normalizeString(play['installNotes']);
    if (installNotes) {
      lines.push(`Install Notes: ${installNotes}`);
    }
  }

  return lines.join('\n');
}

function toUniversalFileFromTeamPlaybook(
  playbookId: string,
  data: Record<string, unknown>
): UniversalFileDoc<'file'> {
  const title =
    normalizeString(data['title']) ?? normalizeString(data['name']) ?? 'Untitled Playbook';
  const sport = normalizeString(data['sport']) ?? undefined;
  const conceptTagIndex = titleCaseArr(data['conceptTagIndex']);
  const plays = Array.isArray(data['plays'])
    ? (data['plays'] as unknown[] as NonNullable<UniversalPlaybookFilePayload['plays']>)
    : [];
  const createdAt = normalizeString(data['createdAt']) ?? new Date().toISOString();
  const updatedAt = normalizeString(data['updatedAt']) ?? createdAt;
  const archived = data['archived'] === true;
  const playCount =
    typeof data['playCount'] === 'number'
      ? data['playCount']
      : Array.isArray(plays)
        ? plays.length
        : 0;
  const structuredData: UniversalPlaybookFilePayload = {
    name: normalizeString(data['name']) ?? title,
    season: normalizeString(data['season']) ?? undefined,
    source: normalizeString(data['source']) ?? undefined,
    sourceUrl: normalizeString(data['sourceUrl']) ?? undefined,
    playCount,
    archived,
    conceptTagIndex,
    formationIndex: titleCaseArr(data['formationIndex']),
    personnelIndex: titleCaseArr(data['personnelIndex']),
    categoryIndex: titleCaseArr(data['categoryIndex']),
    createdBy: normalizeString(data['createdBy']) ?? undefined,
    updatedBy: normalizeString(data['updatedBy']) ?? undefined,
    plays,
  };
  const textContent = buildPlaybookSemanticText(title, data);

  return {
    id: playbookId,
    teamId: normalizeString(data['teamId']) ?? '',
    type: 'file',
    classification: {
      primary: 'playbook',
      route: 'playbook',
      labels: ['playbook', 'strategy', 'team_document'],
      facets: {
        sourceCollection: TEAM_PLAYBOOKS_COLLECTION,
        archived,
        playCount,
        season: normalizeString(data['season']) ?? undefined,
        source: normalizeString(data['source']) ?? undefined,
      },
    },
    title,
    normalizedTitle: title.toLowerCase(),
    status: archived ? 'archived' : 'ready',
    ...(sport ? { sport } : {}),
    ...(conceptTagIndex.length > 0 ? { tags: conceptTagIndex.slice(0, 25) } : {}),
    summary:
      normalizeString(data['source']) ??
      normalizeString(data['season']) ??
      (playCount > 0 ? `${playCount} plays` : undefined),
    ...(normalizeString(data['createdBy'])
      ? { createdByUserId: normalizeString(data['createdBy']) }
      : {}),
    ...(normalizeString(data['updatedBy'])
      ? { updatedByUserId: normalizeString(data['updatedBy']) }
      : {}),
    semanticSync: { status: 'pending' },
    sourceRef: {
      legacyCollection: TEAM_PLAYBOOKS_COLLECTION,
      legacyId: playbookId,
    },
    payloadKind: 'native',
    payload: {
      content: {
        text: textContent,
        data: structuredData as unknown as Readonly<Record<string, unknown>>,
      },
      structured: {
        structuredData: structuredData as unknown as Readonly<Record<string, unknown>>,
        textContent,
      },
    },
    createdAt,
    updatedAt,
  };
}

async function syncUniversalPlaybookProjection(
  db: NonNullable<Request['firebase']>['db'],
  playbookId: string,
  data: Record<string, unknown>
): Promise<void> {
  const projectedDocument = toUniversalFileFromTeamPlaybook(playbookId, data);
  const projectionRecord = projectedDocument as unknown as Record<string, unknown>;
  await db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .doc(playbookId)
    .set(projectionRecord, {
      mergeFields: Object.keys(projectionRecord),
    });
  scheduleUniversalFileSemanticSync({ db, document: projectedDocument });
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
    await syncUniversalPlaybookProjection(db, docId, payload);

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
    await syncUniversalPlaybookProjection(db, playbookId, { ...existing, ...updates });

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
    await syncUniversalPlaybookProjection(db, playbookId, {
      ...existing,
      archived: true,
      updatedBy: user.uid,
      updatedAt: now,
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
    await syncUniversalPlaybookProjection(db, playbookId, {
      ...existing,
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
      await syncUniversalPlaybookProjection(db, playbookId, {
        ...existing,
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
      gamePlans = (await listUniversalGamePlansForTeam(db, playbookTeamId, 100))
        .filter((doc) => doc.sport === playbookSport)
        .filter((doc) => doc.status !== 'archived')
        .map((doc) => mapGamePlanDocToExportSummary(doc as unknown as Record<string, unknown>));
    }

    let callsheet: CallsheetPdfInput | null = null;

    if ((mode === 'full' || activeTab === 'callsheet') && callsheetId) {
      const callsheetData = await getUniversalCallsheetById(db, callsheetId);

      if (callsheetData) {
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
      const scriptData = await getUniversalPracticeScriptById(db, practiceScriptId);

      if (scriptData) {
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
      await syncUniversalPlaybookProjection(db, playbookId, {
        ...existing,
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

export default router;
