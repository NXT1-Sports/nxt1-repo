/**
 * @fileoverview Team Film Review - Firestore `TeamFilmReviews` collection document type
 *
 * Stores film review sessions, AI-generated tags, clips, and coach/player annotations.
 * This model powers Agent X Film Review panel workflows.
 */

import type {
  AgentXSelectedContextAnnotationBounds,
  AgentXSelectedContextAnnotationPoint,
} from '../../ai/agent-x-context.types';
import type { PortableTimestamp } from '../portable-timestamp.model';
import type {
  TeamFilmTrackingCapability,
  TeamFilmTrackingCorrection,
  TeamFilmTrackingManifestPointer,
  TeamFilmTrackingProgress,
  TeamFilmTrackingStatus,
} from './team-film-tracking.model';

export type TeamFilmReviewStatus = 'draft' | 'processing' | 'ready' | 'archived';

export type TeamFilmReviewTimelineState = 'idle' | 'generating' | 'ready' | 'error';

export type TeamFilmReviewDownloadPrewarmStatus =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'error'
  | 'unknown';

export type TeamFilmReviewDownloadExportStatus = 'queued' | 'processing' | 'ready' | 'error';

export type TeamFilmReviewDownloadExportFormat = 'mp4' | 'zip';

export type TeamFilmReviewPerspective = 'own_team' | 'opponent' | 'neutral';

export type TeamFilmReviewTagCategory =
  | 'offense'
  | 'defense'
  | 'transition'
  | 'set_piece'
  | 'execution'
  | 'decision'
  | 'momentum'
  | 'custom';

export interface TeamFilmReviewTimelineTag {
  readonly id: string;
  readonly label: string;
  readonly category: TeamFilmReviewTagCategory;
  readonly startSec: number;
  readonly endSec: number;
  readonly confidence?: number;
  readonly notes?: string;
}

export interface TeamFilmReviewClip {
  readonly id: string;
  readonly title: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly summary?: string;
  readonly score?: number;
}

export type TeamFilmReviewUploadMode = 'single_video' | 'batch_clips' | 'full_footage';

export type TeamFilmReviewCameraAngle = 'wide' | 'tight' | 'unknown';

export type TeamFilmReviewCameraAngleDetectionSource =
  | 'filename'
  | 'manual'
  | 'backend'
  | 'unknown';

export interface TeamFilmReviewSourceAngleMetadata {
  readonly cameraAngle?: TeamFilmReviewCameraAngle;
  readonly angleGroupId?: string;
  readonly angleDetectionSource?: TeamFilmReviewCameraAngleDetectionSource;
}

export interface TeamFilmReviewSourceVideo extends TeamFilmReviewSourceAngleMetadata {
  readonly id: string;
  readonly order: number;
  readonly fileId?: string | null;
  readonly videoUrl: string;
  readonly downloadUrl?: string;
  readonly title?: string;
  readonly storagePath?: string;
  readonly cloudflareVideoId?: string;
  readonly cloudflareStatus?: string;
  readonly readyToStream?: boolean;
  readonly thumbnailUrl?: string;
  readonly durationSec?: number;
  readonly trackingStatus?: TeamFilmTrackingStatus;
  readonly trackingCapability?: TeamFilmTrackingCapability;
  readonly trackingManifest?: TeamFilmTrackingManifestPointer;
  readonly trackingProgress?: TeamFilmTrackingProgress | null;
}

const TEAM_FILM_REVIEW_WIDE_ANGLE_TOKENS = new Set(['wide', 'w', 'endzone', 'end', 'ez', 'all22']);

const TEAM_FILM_REVIEW_TIGHT_ANGLE_TOKENS = new Set([
  'tight',
  't',
  'sideline',
  'side',
  'sl',
  'box',
]);

function tokenizeFilmReviewAngleFileName(fileName: string): readonly string[] {
  return fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function normalizeFilmReviewAngleGroupKey(tokens: readonly string[]): string | null {
  const value = tokens
    .join('-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return value.length > 0 ? value : null;
}

function resolveFilmReviewAngleFromTokens(tokens: readonly string[]): TeamFilmReviewCameraAngle {
  const hasWide = tokens.some((token) => TEAM_FILM_REVIEW_WIDE_ANGLE_TOKENS.has(token));
  const hasTight = tokens.some((token) => TEAM_FILM_REVIEW_TIGHT_ANGLE_TOKENS.has(token));

  if (hasWide === hasTight) return 'unknown';
  return hasWide ? 'wide' : 'tight';
}

export function buildTeamFilmReviewSourceAngleMetadata(
  fileNames: readonly string[]
): readonly TeamFilmReviewSourceAngleMetadata[] {
  const detections = fileNames.map((fileName) => {
    const tokens = tokenizeFilmReviewAngleFileName(fileName);
    const cameraAngle = resolveFilmReviewAngleFromTokens(tokens);
    const groupTokens = tokens.filter(
      (token) =>
        !TEAM_FILM_REVIEW_WIDE_ANGLE_TOKENS.has(token) &&
        !TEAM_FILM_REVIEW_TIGHT_ANGLE_TOKENS.has(token)
    );

    return {
      cameraAngle,
      angleGroupKey: normalizeFilmReviewAngleGroupKey(groupTokens),
    };
  });

  const groupAngles = new Map<string, Set<TeamFilmReviewCameraAngle>>();
  for (const detection of detections) {
    if (detection.cameraAngle === 'unknown' || !detection.angleGroupKey) continue;
    const angles = groupAngles.get(detection.angleGroupKey) ?? new Set<TeamFilmReviewCameraAngle>();
    angles.add(detection.cameraAngle);
    groupAngles.set(detection.angleGroupKey, angles);
  }

  return detections.map((detection) => {
    if (detection.cameraAngle === 'unknown') {
      return { cameraAngle: 'unknown', angleDetectionSource: 'unknown' };
    }

    const angles = detection.angleGroupKey ? groupAngles.get(detection.angleGroupKey) : null;
    return {
      cameraAngle: detection.cameraAngle,
      angleDetectionSource: 'filename',
      ...(detection.angleGroupKey && angles && angles.size > 1
        ? { angleGroupId: `angle-${detection.angleGroupKey}` }
        : {}),
    };
  });
}

export interface TeamFilmReviewAnnotation {
  readonly id: string;
  readonly note: string;
  readonly atSec: number;
  readonly color?: string;
  readonly createdBy: string;
  readonly createdAt: PortableTimestamp;
}

export type TeamFilmReviewDrawAnnotationKind = 'freehand' | 'square' | 'circle';

interface TeamFilmReviewTimedPlayEffectBase {
  readonly bounds: AgentXSelectedContextAnnotationBounds;
  readonly activeFromSec?: number;
  readonly activeUntilSec?: number;
  /** Set only for a drawing hydrated from the UniversalFiles sidecar. */
  readonly drawingId?: string;
  readonly drawingRevision?: number;
}

export interface TeamFilmReviewDrawAnnotation extends TeamFilmReviewTimedPlayEffectBase {
  readonly kind: TeamFilmReviewDrawAnnotationKind;
  readonly strokeCount: number;
  readonly points?: readonly AgentXSelectedContextAnnotationPoint[];
  readonly strokes?: readonly (readonly AgentXSelectedContextAnnotationPoint[])[];
}

export interface TeamFilmReviewTextAnnotation extends TeamFilmReviewTimedPlayEffectBase {
  readonly kind: 'text';
  readonly text: string;
}

export type TeamFilmReviewPlayAnnotation =
  | TeamFilmReviewDrawAnnotation
  | TeamFilmReviewTextAnnotation;

export type TeamFilmReviewDrawingKind = TeamFilmReviewDrawAnnotationKind | 'text';

interface TeamFilmReviewDrawingBase extends TeamFilmReviewTimedPlayEffectBase {
  readonly id: string;
  readonly playId: string;
  readonly sourceId?: string;
  readonly kind: TeamFilmReviewDrawingKind;
  readonly revision: number;
  readonly createdBy: string;
  readonly createdAt: PortableTimestamp;
  readonly updatedBy: string;
  readonly updatedAt: PortableTimestamp;
}

/**
 * Durable visual drawing stored in
 * UniversalFiles/{fileId}/filmReviewAnnotations/{annotationId}.
 * Freehand geometry is deliberately flat because Firestore forbids nested arrays.
 */
export interface TeamFilmReviewFreehandDrawing extends TeamFilmReviewDrawingBase {
  readonly kind: 'freehand';
  readonly strokeCount: number;
  readonly points: readonly AgentXSelectedContextAnnotationPoint[];
  readonly strokeStartIndexes: readonly number[];
}

export interface TeamFilmReviewShapeDrawing extends TeamFilmReviewDrawingBase {
  readonly kind: 'square' | 'circle';
  readonly strokeCount: number;
}

export interface TeamFilmReviewTextDrawing extends TeamFilmReviewDrawingBase {
  readonly kind: 'text';
  readonly text: string;
}

export type TeamFilmReviewDrawing =
  | TeamFilmReviewFreehandDrawing
  | TeamFilmReviewShapeDrawing
  | TeamFilmReviewTextDrawing;

export type TeamFilmReviewPlayTagValue = string | number | boolean | null;

export interface TeamFilmReviewPlayTagProvenance {
  readonly origin: 'agent_x' | 'manual' | 'import';
  readonly confidence?: number;
  readonly evidence?: string;
  readonly operationId?: string;
  readonly updatedAt?: PortableTimestamp;
}

export type TeamFilmReviewSourceBreakdownPatchTagValue = Exclude<TeamFilmReviewPlayTagValue, null>;

export type TeamFilmReviewSportTagValueType = 'string' | 'number' | 'enum' | 'boolean';

export type TeamFilmReviewSportTagColumnWidth = 'compact' | 'regular' | 'wide';

export interface TeamFilmReviewSportTagDefinition {
  readonly id: string;
  readonly label: string;
  readonly valueType: TeamFilmReviewSportTagValueType;
  readonly options?: readonly string[];
  readonly width?: TeamFilmReviewSportTagColumnWidth;
  readonly description?: string;
}

export const TEAM_FILM_REVIEW_FALLBACK_PLAY_TAG_SCHEMA = [
  {
    id: 'phase',
    label: 'PHASE',
    valueType: 'string',
    width: 'regular',
    description: 'Game phase or possession context.',
  },
  {
    id: 'action',
    label: 'ACTION',
    valueType: 'string',
    width: 'wide',
    description: 'Primary action that defines the play.',
  },
  {
    id: 'location',
    label: 'LOCATION',
    valueType: 'string',
    width: 'regular',
    description: 'Where the sequence happens on the field or court.',
  },
  {
    id: 'result',
    label: 'RESULT',
    valueType: 'string',
    width: 'regular',
    description: 'Outcome of the sequence.',
  },
  {
    id: 'advantage',
    label: 'ADV',
    valueType: 'string',
    width: 'compact',
    description: 'Advantage or efficiency marker for the sequence.',
  },
] as const satisfies readonly TeamFilmReviewSportTagDefinition[];

export const TEAM_FILM_REVIEW_SPORT_PLAY_TAG_SCHEMAS = {
  football: [
    {
      id: 'odk',
      label: 'ODK',
      valueType: 'enum',
      options: ['O', 'D', 'K'],
      width: 'compact',
      description: 'Side of the ball or special teams unit.',
    },
    {
      id: 'down',
      label: 'DN',
      valueType: 'number',
      width: 'compact',
      description: 'Down number.',
    },
    {
      id: 'distance',
      label: 'DIST',
      valueType: 'number',
      width: 'compact',
      description: 'Yards to gain.',
    },
    {
      id: 'yardLine',
      label: 'YARD LN',
      valueType: 'string',
      width: 'compact',
      description: 'Field position at snap or kick.',
    },
    {
      id: 'hash',
      label: 'HASH',
      valueType: 'enum',
      options: ['L', 'M', 'R'],
      width: 'compact',
      description: 'Ball location by hash.',
    },
    {
      id: 'offForm',
      label: 'OFF FORM',
      valueType: 'string',
      width: 'wide',
      description: 'Offensive formation or shell.',
    },
    {
      id: 'offStr',
      label: 'OFF STR',
      valueType: 'string',
      width: 'compact',
      description: 'Offensive strength call.',
    },
    {
      id: 'backfield',
      label: 'BACKFIELD',
      valueType: 'string',
      width: 'regular',
      description: 'Backfield set or motion picture.',
    },
    {
      id: 'offPlay',
      label: 'OFF PLAY',
      valueType: 'string',
      width: 'wide',
      description: 'Named concept or play call.',
    },
    {
      id: 'playType',
      label: 'PLAY TYPE',
      valueType: 'string',
      width: 'regular',
      description: 'Run, pass, kick, return, and similar buckets.',
    },
    {
      id: 'playDir',
      label: 'PLAY DIR',
      valueType: 'string',
      width: 'compact',
      description: 'Directional intent of the play.',
    },
    {
      id: 'result',
      label: 'RESULT',
      valueType: 'string',
      width: 'regular',
      description: 'Outcome of the play.',
    },
    {
      id: 'gainLoss',
      label: 'GN/LS',
      valueType: 'number',
      width: 'compact',
      description: 'Yardage gain or loss.',
    },
    {
      id: 'eff',
      label: 'EFF',
      valueType: 'enum',
      options: ['Y', 'N'],
      width: 'compact',
      description: 'Efficiency marker.',
    },
    {
      id: 'defFront',
      label: 'DEF FRONT',
      valueType: 'string',
      width: 'regular',
      description: 'Defensive front or box picture.',
    },
    {
      id: 'defStr',
      label: 'DEF STR',
      valueType: 'string',
      width: 'compact',
      description: 'Defensive strength call.',
    },
    {
      id: 'blitz',
      label: 'BLITZ',
      valueType: 'string',
      width: 'compact',
      description: 'Pressure indicator.',
    },
    {
      id: 'coverage',
      label: 'COVERAGE',
      valueType: 'string',
      width: 'wide',
      description: 'Coverage family or shell.',
    },
    {
      id: 'quarter',
      label: 'QTR',
      valueType: 'string',
      width: 'compact',
      description: 'Quarter or period bucket.',
    },
  ],
  basketball: [
    { id: 'period', label: 'PERIOD', valueType: 'string', width: 'compact' },
    { id: 'clock', label: 'CLOCK', valueType: 'string', width: 'compact' },
    {
      id: 'possession',
      label: 'POSS',
      valueType: 'enum',
      options: ['O', 'D'],
      width: 'compact',
    },
    { id: 'transition', label: 'TRANS', valueType: 'string', width: 'compact' },
    { id: 'setName', label: 'SET', valueType: 'string', width: 'regular' },
    { id: 'action', label: 'ACTION', valueType: 'string', width: 'wide' },
    { id: 'shotType', label: 'SHOT', valueType: 'string', width: 'regular' },
    { id: 'result', label: 'RESULT', valueType: 'string', width: 'regular' },
    { id: 'points', label: 'PTS', valueType: 'number', width: 'compact' },
    { id: 'coverage', label: 'COVERAGE', valueType: 'string', width: 'regular' },
  ],
  baseball: [
    { id: 'inning', label: 'INN', valueType: 'number', width: 'compact' },
    { id: 'half', label: 'HALF', valueType: 'enum', options: ['TOP', 'BOT'], width: 'compact' },
    { id: 'outs', label: 'OUTS', valueType: 'number', width: 'compact' },
    { id: 'count', label: 'COUNT', valueType: 'string', width: 'compact' },
    { id: 'runners', label: 'RUNNERS', valueType: 'string', width: 'regular' },
    { id: 'pitchType', label: 'PITCH', valueType: 'string', width: 'regular' },
    { id: 'location', label: 'ZONE', valueType: 'string', width: 'compact' },
    { id: 'battedBall', label: 'CONTACT', valueType: 'string', width: 'regular' },
    { id: 'result', label: 'RESULT', valueType: 'string', width: 'regular' },
    { id: 'rbi', label: 'RBI', valueType: 'number', width: 'compact' },
  ],
  softball: [
    { id: 'inning', label: 'INN', valueType: 'number', width: 'compact' },
    { id: 'half', label: 'HALF', valueType: 'enum', options: ['TOP', 'BOT'], width: 'compact' },
    { id: 'outs', label: 'OUTS', valueType: 'number', width: 'compact' },
    { id: 'count', label: 'COUNT', valueType: 'string', width: 'compact' },
    { id: 'runners', label: 'RUNNERS', valueType: 'string', width: 'regular' },
    { id: 'pitchType', label: 'PITCH', valueType: 'string', width: 'regular' },
    { id: 'location', label: 'ZONE', valueType: 'string', width: 'compact' },
    { id: 'battedBall', label: 'CONTACT', valueType: 'string', width: 'regular' },
    { id: 'result', label: 'RESULT', valueType: 'string', width: 'regular' },
    { id: 'rbi', label: 'RBI', valueType: 'number', width: 'compact' },
  ],
  soccer: [
    { id: 'half', label: 'HALF', valueType: 'string', width: 'compact' },
    { id: 'minute', label: 'MIN', valueType: 'number', width: 'compact' },
    { id: 'phase', label: 'PHASE', valueType: 'string', width: 'regular' },
    { id: 'zone', label: 'ZONE', valueType: 'string', width: 'compact' },
    { id: 'action', label: 'ACTION', valueType: 'string', width: 'wide' },
    { id: 'channel', label: 'CHANNEL', valueType: 'string', width: 'regular' },
    { id: 'service', label: 'SERVICE', valueType: 'string', width: 'regular' },
    { id: 'result', label: 'RESULT', valueType: 'string', width: 'regular' },
    { id: 'chanceQuality', label: 'CHANCE', valueType: 'string', width: 'compact' },
  ],
  lacrosse: [
    { id: 'quarter', label: 'QTR', valueType: 'string', width: 'compact' },
    {
      id: 'possession',
      label: 'POSS',
      valueType: 'enum',
      options: ['O', 'D'],
      width: 'compact',
    },
    { id: 'phase', label: 'PHASE', valueType: 'string', width: 'regular' },
    { id: 'formation', label: 'FORM', valueType: 'string', width: 'regular' },
    { id: 'action', label: 'ACTION', valueType: 'string', width: 'wide' },
    { id: 'shotType', label: 'SHOT', valueType: 'string', width: 'regular' },
    { id: 'result', label: 'RESULT', valueType: 'string', width: 'regular' },
    { id: 'clearRide', label: 'CLR/RIDE', valueType: 'string', width: 'regular' },
  ],
  volleyball: [
    { id: 'set', label: 'SET', valueType: 'number', width: 'compact' },
    { id: 'rotation', label: 'ROT', valueType: 'number', width: 'compact' },
    { id: 'phase', label: 'PHASE', valueType: 'string', width: 'regular' },
    { id: 'serveType', label: 'SERVE', valueType: 'string', width: 'regular' },
    { id: 'playType', label: 'PLAY TYPE', valueType: 'string', width: 'regular' },
    { id: 'attackZone', label: 'ATT ZONE', valueType: 'string', width: 'regular' },
    { id: 'result', label: 'RESULT', valueType: 'string', width: 'regular' },
    { id: 'rallyLength', label: 'RALLY', valueType: 'number', width: 'compact' },
  ],
  wrestling: [
    { id: 'period', label: 'PERIOD', valueType: 'string', width: 'compact' },
    { id: 'position', label: 'POSITION', valueType: 'string', width: 'regular' },
    { id: 'action', label: 'ACTION', valueType: 'string', width: 'wide' },
    { id: 'scoreChange', label: 'PTS', valueType: 'number', width: 'compact' },
    { id: 'result', label: 'RESULT', valueType: 'string', width: 'regular' },
  ],
  hockey: [
    { id: 'period', label: 'PERIOD', valueType: 'string', width: 'compact' },
    {
      id: 'phase',
      label: 'PHASE',
      valueType: 'string',
      width: 'regular',
      description: 'Rush, forecheck, power play, penalty kill, or settled zone.',
    },
    { id: 'zone', label: 'ZONE', valueType: 'string', width: 'compact' },
    { id: 'action', label: 'ACTION', valueType: 'string', width: 'wide' },
    { id: 'shotType', label: 'SHOT', valueType: 'string', width: 'regular' },
    { id: 'result', label: 'RESULT', valueType: 'string', width: 'regular' },
    { id: 'manSituation', label: 'MAN', valueType: 'string', width: 'compact' },
  ],
  field_hockey: [
    { id: 'period', label: 'PERIOD', valueType: 'string', width: 'compact' },
    { id: 'phase', label: 'PHASE', valueType: 'string', width: 'regular' },
    { id: 'zone', label: 'ZONE', valueType: 'string', width: 'compact' },
    { id: 'action', label: 'ACTION', valueType: 'string', width: 'wide' },
    { id: 'service', label: 'SERVICE', valueType: 'string', width: 'regular' },
    { id: 'result', label: 'RESULT', valueType: 'string', width: 'regular' },
    { id: 'advantage', label: 'ADV', valueType: 'string', width: 'compact' },
  ],
  generic: TEAM_FILM_REVIEW_FALLBACK_PLAY_TAG_SCHEMA,
} as const satisfies Record<string, readonly TeamFilmReviewSportTagDefinition[]>;

export type TeamFilmReviewSportTagSchemaKey = keyof typeof TEAM_FILM_REVIEW_SPORT_PLAY_TAG_SCHEMAS;

const TEAM_FILM_REVIEW_SPORT_TAG_SCHEMA_ALIASES: Record<string, TeamFilmReviewSportTagSchemaKey> = {
  american_football: 'football',
  flag_football: 'football',
  boys_lacrosse: 'lacrosse',
  girls_lacrosse: 'lacrosse',
  men_s_lacrosse: 'lacrosse',
  women_s_lacrosse: 'lacrosse',
  ice_hockey: 'hockey',
};

export function resolveTeamFilmReviewSportTagSchemaKey(
  sport?: string | null
): TeamFilmReviewSportTagSchemaKey {
  const normalizedSport = (sport ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalizedSport) return 'generic';

  if (
    Object.prototype.hasOwnProperty.call(TEAM_FILM_REVIEW_SPORT_PLAY_TAG_SCHEMAS, normalizedSport)
  ) {
    return normalizedSport as TeamFilmReviewSportTagSchemaKey;
  }

  const aliased = TEAM_FILM_REVIEW_SPORT_TAG_SCHEMA_ALIASES[normalizedSport];
  if (aliased) return aliased;

  const heuristicKeys = [
    'football',
    'basketball',
    'baseball',
    'softball',
    'soccer',
    'lacrosse',
    'volleyball',
    'wrestling',
    'field_hockey',
    'hockey',
  ] as const satisfies readonly TeamFilmReviewSportTagSchemaKey[];

  const heuristicMatch = heuristicKeys.find((key) => normalizedSport.includes(key));
  return heuristicMatch ?? 'generic';
}

export function getTeamFilmReviewSportTagDefinitions(
  sport?: string | null
): readonly TeamFilmReviewSportTagDefinition[] {
  const schemaKey = resolveTeamFilmReviewSportTagSchemaKey(sport);
  return TEAM_FILM_REVIEW_SPORT_PLAY_TAG_SCHEMAS[schemaKey];
}

export interface TeamFilmReviewPlaySegment {
  readonly id: string;
  readonly number: number;
  readonly label: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly sourceId?: string;
  readonly sourceIds?: readonly string[];
  readonly confidence?: number;
  readonly annotation?: TeamFilmReviewPlayAnnotation | null;
  readonly annotations?: readonly TeamFilmReviewPlayAnnotation[] | null;
  readonly tags?: Readonly<Record<string, TeamFilmReviewPlayTagValue>>;
  readonly tagProvenance?: Readonly<Record<string, TeamFilmReviewPlayTagProvenance>>;
}

export type TeamFilmReviewResolvedTeamSide = 'our' | 'opponent' | 'unknown';

export type TeamFilmReviewRowOwnershipKind =
  | 'offense_defense'
  | 'possession'
  | 'at_bat'
  | 'special_teams'
  | 'neutral'
  | 'unknown';

export type TeamFilmReviewRowOwnershipConfidence = 'verified' | 'inferred' | 'ambiguous';

export type TeamFilmReviewGameSide = 'home' | 'away';

export interface TeamFilmReviewRowOwnership {
  readonly rowId: string;
  readonly sportSchemaKey: TeamFilmReviewSportTagSchemaKey;
  readonly rowKind: TeamFilmReviewRowOwnershipKind;
  readonly actionTeam: TeamFilmReviewResolvedTeamSide;
  readonly offenseTeam: TeamFilmReviewResolvedTeamSide;
  readonly defenseTeam: TeamFilmReviewResolvedTeamSide;
  readonly offensiveTagsDescribe: TeamFilmReviewResolvedTeamSide;
  readonly defensiveTagsDescribe: TeamFilmReviewResolvedTeamSide;
  readonly specialTeamsDescribe: TeamFilmReviewResolvedTeamSide;
  readonly confidence: TeamFilmReviewRowOwnershipConfidence;
  readonly reason: string;
  readonly requiredClarification?: string;
}

export interface ResolveTeamFilmReviewRowOwnershipInput {
  readonly sport?: string | null;
  readonly perspective?: TeamFilmReviewPerspective | null;
  readonly row: TeamFilmReviewPlaySegment;
  readonly ourTeamGameSide?: TeamFilmReviewGameSide | null;
}

function getTagValue(
  tags: Readonly<Record<string, TeamFilmReviewPlayTagValue>> | undefined,
  tagId: string
): TeamFilmReviewPlayTagValue | undefined {
  if (!tags) return undefined;
  if (Object.prototype.hasOwnProperty.call(tags, tagId)) return tags[tagId];
  const normalizedTagId = tagId.toLowerCase();
  const matchingKey = Object.keys(tags).find((key) => key.toLowerCase() === normalizedTagId);
  return matchingKey ? tags[matchingKey] : undefined;
}

function normalizeTagString(value: TeamFilmReviewPlayTagValue | undefined): string | null {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function resolveExplicitTeamSide(
  value: TeamFilmReviewPlayTagValue | undefined
): TeamFilmReviewResolvedTeamSide | null {
  const normalized = normalizeTagString(value)
    ?.replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) return null;

  if (['our', 'ours', 'us', 'self', 'team', 'own', 'own_team', 'home_team'].includes(normalized)) {
    return 'our';
  }
  if (
    ['opponent', 'opp', 'opposing', 'them', 'their', 'theirs', 'away_team'].includes(normalized)
  ) {
    return 'opponent';
  }
  return null;
}

function oppositeTeamSide(side: TeamFilmReviewResolvedTeamSide): TeamFilmReviewResolvedTeamSide {
  if (side === 'our') return 'opponent';
  if (side === 'opponent') return 'our';
  return 'unknown';
}

function ownershipResult(input: {
  readonly row: TeamFilmReviewPlaySegment;
  readonly sportSchemaKey: TeamFilmReviewSportTagSchemaKey;
  readonly rowKind: TeamFilmReviewRowOwnershipKind;
  readonly actionTeam: TeamFilmReviewResolvedTeamSide;
  readonly offenseTeam?: TeamFilmReviewResolvedTeamSide;
  readonly defenseTeam?: TeamFilmReviewResolvedTeamSide;
  readonly specialTeamsDescribe?: TeamFilmReviewResolvedTeamSide;
  readonly confidence: TeamFilmReviewRowOwnershipConfidence;
  readonly reason: string;
  readonly requiredClarification?: string;
}): TeamFilmReviewRowOwnership {
  const offenseTeam = input.offenseTeam ?? input.actionTeam;
  const defenseTeam = input.defenseTeam ?? oppositeTeamSide(offenseTeam);
  const specialTeamsDescribe = input.specialTeamsDescribe ?? 'unknown';

  return {
    rowId: input.row.id,
    sportSchemaKey: input.sportSchemaKey,
    rowKind: input.rowKind,
    actionTeam: input.actionTeam,
    offenseTeam,
    defenseTeam,
    offensiveTagsDescribe: offenseTeam,
    defensiveTagsDescribe: defenseTeam,
    specialTeamsDescribe,
    confidence: input.confidence,
    reason: input.reason,
    ...(input.requiredClarification ? { requiredClarification: input.requiredClarification } : {}),
  };
}

function resolveExplicitOwnership(input: {
  readonly row: TeamFilmReviewPlaySegment;
  readonly sportSchemaKey: TeamFilmReviewSportTagSchemaKey;
}): TeamFilmReviewRowOwnership | null {
  const tags = input.row.tags;
  const actionTeam =
    resolveExplicitTeamSide(getTagValue(tags, 'teamSide')) ??
    resolveExplicitTeamSide(getTagValue(tags, 'possSide')) ??
    resolveExplicitTeamSide(getTagValue(tags, 'possessionTeam')) ??
    resolveExplicitTeamSide(getTagValue(tags, 'actionTeam')) ??
    resolveExplicitTeamSide(getTagValue(tags, 'team'));

  if (!actionTeam) return null;

  const offenseTeam = resolveExplicitTeamSide(getTagValue(tags, 'offenseTeam')) ?? actionTeam;
  const defenseTeam =
    resolveExplicitTeamSide(getTagValue(tags, 'defenseTeam')) ?? oppositeTeamSide(offenseTeam);

  return ownershipResult({
    row: input.row,
    sportSchemaKey: input.sportSchemaKey,
    rowKind: 'possession',
    actionTeam,
    offenseTeam,
    defenseTeam,
    confidence: 'verified',
    reason: 'Resolved from explicit team/possession ownership tags on the row.',
  });
}

function resolveOffenseDefenseCode(
  value: TeamFilmReviewPlayTagValue | undefined
): 'O' | 'D' | 'K' | null {
  const normalized = normalizeTagString(value)?.toUpperCase();
  if (normalized === 'O' || normalized === 'OFFENSE') return 'O';
  if (normalized === 'D' || normalized === 'DEFENSE') return 'D';
  if (normalized === 'K' || normalized === 'ST' || normalized === 'SPECIAL_TEAMS') return 'K';
  return null;
}

function resolvePerspectivePrimaryTeam(
  perspective: TeamFilmReviewPerspective | null | undefined
): TeamFilmReviewResolvedTeamSide {
  if (perspective === 'own_team') {
    return 'our';
  }
  return 'unknown';
}

function resolveFootballOwnership(input: {
  readonly perspective?: TeamFilmReviewPerspective | null;
  readonly row: TeamFilmReviewPlaySegment;
  readonly sportSchemaKey: TeamFilmReviewSportTagSchemaKey;
}): TeamFilmReviewRowOwnership | null {
  const odk = resolveOffenseDefenseCode(getTagValue(input.row.tags, 'odk'));
  const primaryTeam = resolvePerspectivePrimaryTeam(input.perspective);
  if (odk === 'O') {
    if (primaryTeam === 'unknown') {
      return ownershipResult({
        row: input.row,
        sportSchemaKey: input.sportSchemaKey,
        rowKind: 'offense_defense',
        actionTeam: 'unknown',
        offenseTeam: 'unknown',
        defenseTeam: 'unknown',
        confidence: 'ambiguous',
        reason:
          'Football ODK identifies offense versus defense, but the breakdown focus team is not confirmed so the offense cannot be mapped to our team or the scouting target.',
        requiredClarification:
          'Which team is this ODK keyed to: our team, the scouting target, or the other team in the film?',
      });
    }
    return ownershipResult({
      row: input.row,
      sportSchemaKey: input.sportSchemaKey,
      rowKind: 'offense_defense',
      actionTeam: primaryTeam,
      offenseTeam: primaryTeam,
      defenseTeam: oppositeTeamSide(primaryTeam),
      confidence: 'verified',
      reason:
        'Football ODK=O means the confirmed review focus is on our offense; offensive tags describe us and defensive tags describe the opponent.',
    });
  }
  if (odk === 'D') {
    if (primaryTeam === 'unknown') {
      return ownershipResult({
        row: input.row,
        sportSchemaKey: input.sportSchemaKey,
        rowKind: 'offense_defense',
        actionTeam: 'unknown',
        offenseTeam: 'unknown',
        defenseTeam: 'unknown',
        confidence: 'ambiguous',
        reason:
          'Football ODK identifies defense versus offense, but the breakdown focus team is not confirmed so the defense cannot be mapped to our team or the scouting target.',
        requiredClarification:
          'Which team is this ODK keyed to: our team, the scouting target, or the other team in the film?',
      });
    }
    return ownershipResult({
      row: input.row,
      sportSchemaKey: input.sportSchemaKey,
      rowKind: 'offense_defense',
      actionTeam: oppositeTeamSide(primaryTeam),
      offenseTeam: oppositeTeamSide(primaryTeam),
      defenseTeam: primaryTeam,
      confidence: 'verified',
      reason:
        'Football ODK=D means the confirmed review focus is on our defense; offensive tags describe the opponent and defensive tags describe us.',
    });
  }
  if (odk === 'K') {
    return ownershipResult({
      row: input.row,
      sportSchemaKey: input.sportSchemaKey,
      rowKind: 'special_teams',
      actionTeam: 'unknown',
      offenseTeam: 'unknown',
      defenseTeam: 'unknown',
      specialTeamsDescribe: 'unknown',
      confidence: 'verified',
      reason:
        'Football ODK=K is special teams and should not be mixed into offense or defense tendency buckets.',
    });
  }
  return null;
}

function resolvePossessionCodeOwnership(input: {
  readonly perspective?: TeamFilmReviewPerspective | null;
  readonly row: TeamFilmReviewPlaySegment;
  readonly sportSchemaKey: TeamFilmReviewSportTagSchemaKey;
}): TeamFilmReviewRowOwnership | null {
  const possession = resolveOffenseDefenseCode(getTagValue(input.row.tags, 'possession'));
  const primaryTeam = resolvePerspectivePrimaryTeam(input.perspective);
  if (possession === 'O') {
    if (primaryTeam === 'unknown') {
      return ownershipResult({
        row: input.row,
        sportSchemaKey: input.sportSchemaKey,
        rowKind: 'possession',
        actionTeam: 'unknown',
        offenseTeam: 'unknown',
        defenseTeam: 'unknown',
        confidence: 'ambiguous',
        reason:
          'This possession code identifies who has the ball, but the breakdown focus team is not confirmed so possession cannot be mapped to our team or the scouting target.',
        requiredClarification:
          'Which team is this possession code keyed to: our team, the scouting target, or the other team in the film?',
      });
    }
    return ownershipResult({
      row: input.row,
      sportSchemaKey: input.sportSchemaKey,
      rowKind: 'possession',
      actionTeam: primaryTeam,
      offenseTeam: primaryTeam,
      defenseTeam: oppositeTeamSide(primaryTeam),
      confidence: 'verified',
      reason: 'Possession=O means our team has the ball; action/offensive tags describe us.',
    });
  }
  if (possession === 'D') {
    if (primaryTeam === 'unknown') {
      return ownershipResult({
        row: input.row,
        sportSchemaKey: input.sportSchemaKey,
        rowKind: 'possession',
        actionTeam: 'unknown',
        offenseTeam: 'unknown',
        defenseTeam: 'unknown',
        confidence: 'ambiguous',
        reason:
          'This possession code identifies the defending side, but the breakdown focus team is not confirmed so defense cannot be mapped to our team or the scouting target.',
        requiredClarification:
          'Which team is this possession code keyed to: our team, the scouting target, or the other team in the film?',
      });
    }
    return ownershipResult({
      row: input.row,
      sportSchemaKey: input.sportSchemaKey,
      rowKind: 'possession',
      actionTeam: oppositeTeamSide(primaryTeam),
      offenseTeam: oppositeTeamSide(primaryTeam),
      defenseTeam: primaryTeam,
      confidence: 'verified',
      reason: 'Possession=D means the opponent has the ball and our team is defending.',
    });
  }
  return null;
}

function resolveBaseballOwnership(input: {
  readonly row: TeamFilmReviewPlaySegment;
  readonly sportSchemaKey: TeamFilmReviewSportTagSchemaKey;
  readonly ourTeamGameSide?: TeamFilmReviewGameSide | null;
}): TeamFilmReviewRowOwnership | null {
  const half = normalizeTagString(getTagValue(input.row.tags, 'half'))?.toUpperCase();
  const battingGameSide =
    half === 'TOP' ? 'away' : half === 'BOT' || half === 'BOTTOM' ? 'home' : null;
  if (!battingGameSide) return null;

  if (!input.ourTeamGameSide) {
    return ownershipResult({
      row: input.row,
      sportSchemaKey: input.sportSchemaKey,
      rowKind: 'at_bat',
      actionTeam: 'unknown',
      offenseTeam: 'unknown',
      defenseTeam: 'unknown',
      confidence: 'ambiguous',
      reason:
        'Baseball/softball half-inning identifies home/away batting side, but our team home/away side is not known.',
      requiredClarification: 'Is our team home or away for this game?',
    });
  }

  const offenseTeam = battingGameSide === input.ourTeamGameSide ? 'our' : 'opponent';
  return ownershipResult({
    row: input.row,
    sportSchemaKey: input.sportSchemaKey,
    rowKind: 'at_bat',
    actionTeam: offenseTeam,
    offenseTeam,
    defenseTeam: oppositeTeamSide(offenseTeam),
    confidence: 'verified',
    reason: `Baseball/softball ${half} half means the ${battingGameSide} team is batting; our team is ${input.ourTeamGameSide}.`,
  });
}

export function resolveTeamFilmReviewRowOwnership(
  input: ResolveTeamFilmReviewRowOwnershipInput
): TeamFilmReviewRowOwnership {
  const sportSchemaKey = resolveTeamFilmReviewSportTagSchemaKey(input.sport);
  const explicit = resolveExplicitOwnership({ row: input.row, sportSchemaKey });
  if (explicit) return explicit;

  const sportResolved =
    sportSchemaKey === 'football'
      ? resolveFootballOwnership({
          row: input.row,
          sportSchemaKey,
          perspective: input.perspective,
        })
      : sportSchemaKey === 'basketball' || sportSchemaKey === 'lacrosse'
        ? resolvePossessionCodeOwnership({
            row: input.row,
            sportSchemaKey,
            perspective: input.perspective,
          })
        : sportSchemaKey === 'baseball' || sportSchemaKey === 'softball'
          ? resolveBaseballOwnership({
              row: input.row,
              sportSchemaKey,
              ourTeamGameSide: input.ourTeamGameSide,
            })
          : null;

  if (sportResolved) return sportResolved;

  return ownershipResult({
    row: input.row,
    sportSchemaKey,
    rowKind: 'unknown',
    actionTeam: 'unknown',
    offenseTeam: 'unknown',
    defenseTeam: 'unknown',
    confidence: 'ambiguous',
    reason: 'No reliable sport-specific or explicit team ownership tag was present on this row.',
    requiredClarification:
      'Identify which row field maps this sport breakdown to our team versus the opponent before generating ownership-sensitive reports.',
  });
}

export interface TeamFilmReviewSourceBreakdownCreateRow {
  readonly number: number;
  readonly label: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly confidence?: number;
}

export interface TeamFilmReviewSourceBreakdownPatch {
  readonly sourceId: string;
  readonly rowId: string;
  readonly tags?: Readonly<Record<string, TeamFilmReviewSourceBreakdownPatchTagValue>>;
  readonly clearTagIds?: readonly string[];
  readonly tagProvenance?: Readonly<Record<string, TeamFilmReviewPlayTagProvenance>>;
  readonly createIfMissing?: TeamFilmReviewSourceBreakdownCreateRow;
}

export type TeamFilmReviewSourceBreakdownPatchErrorCode =
  | 'REVISION_CONFLICT'
  | 'DUPLICATE_PATCH'
  | 'AMBIGUOUS_ROW'
  | 'ROW_NOT_FOUND'
  | 'SOURCE_NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'INVALID_PATCH'
  | 'INVALID_TAG_ID'
  | 'INVALID_TAG_VALUE';

export class TeamFilmReviewSourceBreakdownPatchError extends Error {
  constructor(
    readonly code: TeamFilmReviewSourceBreakdownPatchErrorCode,
    message: string,
    readonly currentRevision?: number
  ) {
    super(message);
    this.name = 'TeamFilmReviewSourceBreakdownPatchError';
  }
}

export function isTeamFilmReviewSportTagValueValid(
  definition: TeamFilmReviewSportTagDefinition,
  value: TeamFilmReviewPlayTagValue
): boolean {
  if (definition.valueType === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (definition.valueType === 'boolean') return typeof value === 'boolean';
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  return definition.valueType !== 'enum' || definition.options?.includes(value) === true;
}

function validateCreateRow(row: TeamFilmReviewSourceBreakdownCreateRow, rowId: string): void {
  if (!Number.isInteger(row.number) || row.number < 1) {
    throw new TeamFilmReviewSourceBreakdownPatchError(
      'INVALID_PATCH',
      `Breakdown row ${rowId} must have a positive integer number.`
    );
  }
  if (!row.label.trim() || !Number.isFinite(row.startSec) || row.startSec < 0) {
    throw new TeamFilmReviewSourceBreakdownPatchError(
      'INVALID_PATCH',
      `Breakdown row ${rowId} has invalid creation metadata.`
    );
  }
  if (!Number.isFinite(row.endSec) || row.endSec <= row.startSec) {
    throw new TeamFilmReviewSourceBreakdownPatchError(
      'INVALID_PATCH',
      `Breakdown row ${rowId} must end after it starts.`
    );
  }
  if (row.confidence !== undefined && (!Number.isFinite(row.confidence) || row.confidence < 0)) {
    throw new TeamFilmReviewSourceBreakdownPatchError(
      'INVALID_PATCH',
      `Breakdown row ${rowId} has invalid confidence.`
    );
  }
}

export function getTeamFilmReviewRevision(review: TeamFilmReviewDoc): number {
  return Number.isInteger(review.reviewRevision) && (review.reviewRevision ?? 0) >= 0
    ? (review.reviewRevision ?? 0)
    : 0;
}

export function mergeTeamFilmReviewSourceBreakdownPatches(input: {
  readonly review: TeamFilmReviewDoc;
  readonly patches: readonly TeamFilmReviewSourceBreakdownPatch[];
  readonly expectedRevision?: number;
}): TeamFilmReviewDoc {
  const currentRevision = getTeamFilmReviewRevision(input.review);
  if (input.expectedRevision !== undefined && input.expectedRevision !== currentRevision) {
    throw new TeamFilmReviewSourceBreakdownPatchError(
      'REVISION_CONFLICT',
      `Film review revision conflict: expected ${input.expectedRevision}, found ${currentRevision}.`,
      currentRevision
    );
  }
  if (input.patches.length === 0) {
    throw new TeamFilmReviewSourceBreakdownPatchError(
      'INVALID_PATCH',
      'At least one source breakdown patch is required.'
    );
  }

  const definitions = new Map(
    getTeamFilmReviewSportTagDefinitions(input.review.sport).map((definition) => [
      definition.id,
      definition,
    ])
  );
  const sourceIds = new Set((input.review.sources ?? []).map((source) => source.id));
  const targetKeys = new Set<string>();
  const timeline = [...(input.review.timeline ?? [])];

  for (const patch of input.patches) {
    const sourceId = patch.sourceId.trim();
    const rowId = patch.rowId.trim();
    if (!sourceId || !rowId) {
      throw new TeamFilmReviewSourceBreakdownPatchError(
        'INVALID_PATCH',
        'Every source breakdown patch requires sourceId and rowId.'
      );
    }
    if (!sourceIds.has(sourceId)) {
      throw new TeamFilmReviewSourceBreakdownPatchError(
        'SOURCE_NOT_FOUND',
        `Film review source ${sourceId} was not found.`
      );
    }

    const targetKey = `${sourceId}\u0000${rowId}`;
    if (targetKeys.has(targetKey)) {
      throw new TeamFilmReviewSourceBreakdownPatchError(
        'DUPLICATE_PATCH',
        `Duplicate source breakdown patch for ${sourceId}/${rowId}.`
      );
    }
    targetKeys.add(targetKey);

    const tags = patch.tags ?? {};
    const clearTagIds = patch.clearTagIds ?? [];
    const clearTagIdSet = new Set(clearTagIds);
    if (clearTagIdSet.size !== clearTagIds.length) {
      throw new TeamFilmReviewSourceBreakdownPatchError(
        'INVALID_PATCH',
        `Patch for ${sourceId}/${rowId} contains duplicate clearTagIds.`
      );
    }
    if (Object.keys(tags).length === 0 && clearTagIds.length === 0) {
      throw new TeamFilmReviewSourceBreakdownPatchError(
        'INVALID_PATCH',
        `Patch for ${sourceId}/${rowId} does not update or clear any tags.`
      );
    }

    for (const [tagId, value] of [
      ...Object.entries(tags),
      ...clearTagIds.map((tagId) => [tagId, undefined] as const),
    ]) {
      const definition = definitions.get(tagId);
      if (!definition) {
        throw new TeamFilmReviewSourceBreakdownPatchError(
          'INVALID_TAG_ID',
          `Tag ${tagId} is not valid for ${input.review.sport || 'this film review'}.`
        );
      }
      if (Object.prototype.hasOwnProperty.call(tags, tagId) && clearTagIdSet.has(tagId)) {
        throw new TeamFilmReviewSourceBreakdownPatchError(
          'INVALID_PATCH',
          `Tag ${tagId} cannot be updated and cleared in the same patch.`
        );
      }
      if (value !== undefined && !isTeamFilmReviewSportTagValueValid(definition, value)) {
        throw new TeamFilmReviewSourceBreakdownPatchError(
          'INVALID_TAG_VALUE',
          `Value for tag ${tagId} is invalid for ${definition.valueType}.`
        );
      }
    }

    const provenance = patch.tagProvenance ?? {};
    for (const [tagId, tagProvenance] of Object.entries(provenance)) {
      if (!Object.prototype.hasOwnProperty.call(tags, tagId)) {
        throw new TeamFilmReviewSourceBreakdownPatchError(
          'INVALID_PATCH',
          `Provenance for ${tagId} requires a tag update in the same patch.`
        );
      }
      if (
        tagProvenance.confidence !== undefined &&
        (!Number.isFinite(tagProvenance.confidence) ||
          tagProvenance.confidence < 0 ||
          tagProvenance.confidence > 1)
      ) {
        throw new TeamFilmReviewSourceBreakdownPatchError(
          'INVALID_PATCH',
          `Provenance confidence for ${tagId} is invalid.`
        );
      }
    }

    const matchingIndexes = timeline.flatMap((row, index) =>
      row.id === rowId && row.sourceId === sourceId ? [index] : []
    );
    if (matchingIndexes.length > 1) {
      throw new TeamFilmReviewSourceBreakdownPatchError(
        'AMBIGUOUS_ROW',
        `Multiple breakdown rows match ${sourceId}/${rowId}.`
      );
    }

    let targetIndex = matchingIndexes[0];
    if (targetIndex === undefined) {
      if (!patch.createIfMissing) {
        throw new TeamFilmReviewSourceBreakdownPatchError(
          'ROW_NOT_FOUND',
          `Breakdown row ${sourceId}/${rowId} was not found.`
        );
      }
      validateCreateRow(patch.createIfMissing, rowId);
      targetIndex = timeline.length;
      timeline.push({
        id: rowId,
        sourceId,
        ...patch.createIfMissing,
      });
    }

    const existing = timeline[targetIndex]!;
    const nextTags = { ...(existing.tags ?? {}), ...tags };
    const nextProvenance = { ...(existing.tagProvenance ?? {}), ...provenance };
    for (const tagId of clearTagIds) {
      delete nextTags[tagId];
      delete nextProvenance[tagId];
    }
    timeline[targetIndex] = {
      ...existing,
      tags: nextTags,
      tagProvenance: Object.keys(nextProvenance).length > 0 ? nextProvenance : undefined,
    };
  }

  return {
    ...input.review,
    timeline,
    reviewRevision: currentRevision + 1,
  };
}

export interface TeamFilmReviewBreakdownSource {
  readonly provider: 'hudl' | 'csv' | 'manual_import';
  readonly fileName: string;
  readonly mimeType: string;
  readonly storagePath?: string;
  readonly sheetName?: string;
  /** Imported headers that do not map to the built-in sport schema. */
  readonly customColumns?: readonly TeamFilmReviewSportTagDefinition[];
  readonly rowCount: number;
  readonly playCount: number;
  readonly importedBy: string;
  readonly importedAt: PortableTimestamp;
}

export interface TeamFilmReviewDownloadPrewarm {
  readonly requestedAt?: PortableTimestamp;
  readonly lastCheckedAt?: PortableTimestamp;
  readonly status: TeamFilmReviewDownloadPrewarmStatus;
  readonly percentComplete?: number;
  readonly mp4Url?: string;
  readonly lastError?: string;
}

export interface TeamFilmReviewDownloadExport {
  readonly requestedAt?: PortableTimestamp;
  readonly startedAt?: PortableTimestamp;
  readonly completedAt?: PortableTimestamp;
  readonly lastCheckedAt?: PortableTimestamp;
  readonly status: TeamFilmReviewDownloadExportStatus;
  readonly percentComplete?: number;
  readonly format?: TeamFilmReviewDownloadExportFormat;
  readonly fileName?: string;
  readonly storagePath?: string;
  readonly contentType?: string;
  readonly byteSize?: number;
  readonly lastError?: string;
}

export interface TeamFilmReviewTimelineProgress {
  readonly processedWindowCount: number;
  readonly totalWindowCount: number;
  readonly playCount: number;
  readonly updatedAt: PortableTimestamp;
}

export interface TeamFilmReviewPlaylistDoc {
  readonly id: string;
  readonly teamId?: string;
  readonly name: string;
  readonly parentId?: string | null;
  readonly sortOrder?: number;
  readonly readAccessKeys?: readonly string[];
  readonly writeAccessKeys?: readonly string[];
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly createdAt: PortableTimestamp;
  readonly updatedAt: PortableTimestamp;
}

export interface TeamFilmReviewDoc {
  readonly id: string;
  readonly teamId?: string;
  readonly organizationId?: string;
  readonly fileId?: string | null;
  readonly sport: string;
  readonly title: string;
  readonly status: TeamFilmReviewStatus;
  readonly uploadMode?: TeamFilmReviewUploadMode;
  readonly perspective?: TeamFilmReviewPerspective;
  readonly gameDate?: string;
  readonly opponentName?: string;
  readonly playlistId?: string | null;
  readonly playlistName?: string | null;
  readonly videoUrl: string;
  readonly sources?: readonly TeamFilmReviewSourceVideo[];
  readonly storagePath?: string;
  readonly cloudflareVideoId?: string;
  readonly cloudflareStatus?: string;
  readonly readyToStream?: boolean;
  readonly thumbnailUrl?: string;
  readonly durationSec?: number;
  readonly aiSummary?: string;
  readonly aiTags?: readonly TeamFilmReviewTimelineTag[];
  readonly clips?: readonly TeamFilmReviewClip[];
  readonly annotations?: readonly TeamFilmReviewAnnotation[];
  readonly keyInsights?: readonly string[];
  readonly tags?: readonly string[];
  readonly source: string;
  readonly sourceUrl?: string;
  readonly schemaVersion: number;
  /** Optimistic revision for lossless breakdown patch writes; legacy documents default to 0. */
  readonly reviewRevision?: number;
  readonly readAccessKeys?: readonly string[];
  readonly writeAccessKeys?: readonly string[];
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly createdAt: PortableTimestamp;
  readonly updatedAt: PortableTimestamp;
  /** Timeline generation state */
  readonly timelineState?: TeamFilmReviewTimelineState;
  /** Auto-generated play segments from video */
  readonly timeline?: readonly TeamFilmReviewPlaySegment[];
  /** Original spreadsheet/breakdown used to populate timeline rows */
  readonly breakdownSource?: TeamFilmReviewBreakdownSource;
  /** When timeline was last generated */
  readonly timelineGeneratedAt?: PortableTimestamp;
  /** Error message if timeline generation failed */
  readonly timelineError?: string | null;
  /** Windowed AI generation progress for long full-game timeline jobs */
  readonly timelineProgress?: TeamFilmReviewTimelineProgress | null;
  /** Player/environment tracking state for the primary film source. */
  readonly trackingStatus?: TeamFilmTrackingStatus;
  readonly trackingCapability?: TeamFilmTrackingCapability;
  readonly trackingManifest?: TeamFilmTrackingManifestPointer;
  readonly trackingProgress?: TeamFilmTrackingProgress | null;
  readonly trackingModelBundleVersion?: string;
  readonly trackingSourceContentHash?: string;
  readonly trackingCorrectionRevision?: number;
  readonly trackingCorrections?: readonly TeamFilmTrackingCorrection[];
  readonly trackingError?: string | null;
  /** Upload-time Cloudflare MP4 prewarm state for low-latency analysis */
  readonly downloadPrewarm?: TeamFilmReviewDownloadPrewarm;
  /** Server-side staged export state for large full-game downloads */
  readonly downloadExport?: TeamFilmReviewDownloadExport;
}

export interface NormalizeTeamFilmReviewGroupedTimelineResult {
  readonly review: TeamFilmReviewDoc;
  readonly changed: boolean;
}

function resolveTeamFilmReviewSourceGroupKey(
  source: TeamFilmReviewSourceVideo,
  index: number
): string {
  const angleGroupId = source.angleGroupId?.trim();
  if (angleGroupId) return `angle:${angleGroupId}`;

  const sourceId = source.id.trim();
  return sourceId ? `source:${sourceId}` : `source-index:${index}`;
}

function groupTeamFilmReviewSourcesByPlay(
  sources: readonly TeamFilmReviewSourceVideo[]
): readonly (readonly TeamFilmReviewSourceVideo[])[] {
  const groups = new Map<string, TeamFilmReviewSourceVideo[]>();

  sources.forEach((source, index) => {
    const groupKey = resolveTeamFilmReviewSourceGroupKey(source, index);
    const group = groups.get(groupKey) ?? [];
    group.push(source);
    groups.set(groupKey, group);
  });

  return [...groups.values()];
}

function selectPrimaryTeamFilmReviewSource(
  sources: readonly TeamFilmReviewSourceVideo[]
): TeamFilmReviewSourceVideo {
  return (
    sources.find((source) => source.cameraAngle === 'wide') ??
    (sources[0] as TeamFilmReviewSourceVideo)
  );
}

function resolveTeamFilmReviewSourceIds(
  sources: readonly TeamFilmReviewSourceVideo[]
): readonly string[] {
  return [...new Set(sources.map((source) => source.id.trim()).filter(Boolean))];
}

function resolveTeamFilmReviewGroupDurationSec(
  sources: readonly TeamFilmReviewSourceVideo[]
): number {
  const durations = sources
    .map((source) => source.durationSec)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return Math.max(1, ...durations, 1);
}

export function normalizeTeamFilmReviewGroupedTimeline(
  review: TeamFilmReviewDoc
): NormalizeTeamFilmReviewGroupedTimelineResult {
  const sources = review.sources ?? [];
  const timeline = review.timeline ?? [];
  if (review.uploadMode !== 'batch_clips' || sources.length <= 1 || timeline.length <= 1) {
    return { review, changed: false };
  }

  const sourceGroups = groupTeamFilmReviewSourcesByPlay(sources);
  if (!sourceGroups.some((group) => group.length > 1) || sourceGroups.length >= timeline.length) {
    return { review, changed: false };
  }

  const timelineBySourceId = new Map(
    timeline.flatMap((play) => {
      const sourceIds = play.sourceIds?.length
        ? play.sourceIds
        : play.sourceId
          ? [play.sourceId]
          : [];
      return sourceIds
        .map((sourceId) => sourceId.trim())
        .filter((sourceId) => sourceId.length > 0)
        .map((sourceId) => [sourceId, play] as const);
    })
  );

  const normalizedTimeline = sourceGroups.map((group, index) => {
    const primarySource = selectPrimaryTeamFilmReviewSource(group);
    const sourceIds = resolveTeamFilmReviewSourceIds(group);
    const existing = sourceIds
      .map((sourceId) => timelineBySourceId.get(sourceId))
      .find((play): play is TeamFilmReviewPlaySegment => !!play);
    const durationSec = resolveTeamFilmReviewGroupDurationSec(group);

    return {
      ...(existing ?? {
        id: `play-${primarySource.id}`,
        label: primarySource.title?.trim() || `Clip ${index + 1}`,
        startSec: 0,
        endSec: durationSec,
      }),
      number: index + 1,
      sourceId: primarySource.id,
      sourceIds,
    };
  });

  return {
    review: {
      ...review,
      timeline: normalizedTimeline,
    },
    changed: true,
  };
}
