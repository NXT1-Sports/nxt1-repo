/**
 * @fileoverview Team Film Review - Firestore `TeamFilmReviews` collection document type
 *
 * Stores film review sessions, AI-generated tags, clips, and coach/player annotations.
 * This model powers Agent X Film Review panel workflows.
 */

import type {
  AgentXSelectedContextAnnotationKind,
  AgentXSelectedContextAnnotationBounds,
  AgentXSelectedContextAnnotationPoint,
} from '../../ai/agent-x-context.types';
import type { PortableTimestamp } from '../portable-timestamp.model';

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

export interface TeamFilmReviewSourceVideo {
  readonly id: string;
  readonly order: number;
  readonly videoUrl: string;
  readonly downloadUrl?: string;
  readonly title?: string;
  readonly storagePath?: string;
  readonly cloudflareVideoId?: string;
  readonly cloudflareStatus?: string;
  readonly readyToStream?: boolean;
  readonly thumbnailUrl?: string;
  readonly durationSec?: number;
}

export interface TeamFilmReviewAnnotation {
  readonly id: string;
  readonly note: string;
  readonly atSec: number;
  readonly color?: string;
  readonly createdBy: string;
  readonly createdAt: PortableTimestamp;
}

export interface TeamFilmReviewPlayAnnotation {
  readonly kind: AgentXSelectedContextAnnotationKind;
  readonly bounds: AgentXSelectedContextAnnotationBounds;
  readonly strokeCount: number;
  readonly points?: readonly AgentXSelectedContextAnnotationPoint[];
  readonly strokes?: readonly (readonly AgentXSelectedContextAnnotationPoint[])[];
  readonly activeFromSec?: number;
  readonly activeUntilSec?: number;
}

export type TeamFilmReviewPlayTagValue = string | number | boolean | null;

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
      valueType: 'string',
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
  readonly confidence?: number;
  readonly annotation?: TeamFilmReviewPlayAnnotation | null;
  readonly tags?: Readonly<Record<string, TeamFilmReviewPlayTagValue>>;
}

export interface TeamFilmReviewBreakdownSource {
  readonly provider: 'hudl' | 'csv' | 'manual_import';
  readonly fileName: string;
  readonly mimeType: string;
  readonly storagePath?: string;
  readonly sheetName?: string;
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
  readonly teamId: string;
  readonly name: string;
  readonly parentId?: string | null;
  readonly sortOrder?: number;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly createdAt: PortableTimestamp;
  readonly updatedAt: PortableTimestamp;
}

export interface TeamFilmReviewDoc {
  readonly id: string;
  readonly teamId: string;
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
  /** Upload-time Cloudflare MP4 prewarm state for low-latency analysis */
  readonly downloadPrewarm?: TeamFilmReviewDownloadPrewarm;
  /** Server-side staged export state for large full-game downloads */
  readonly downloadExport?: TeamFilmReviewDownloadExport;
}
