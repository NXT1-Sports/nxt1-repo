/**
 * @fileoverview Team Film Tracking - portable telemetry contracts
 *
 * Stores versioned player, ball, official, and playing-surface telemetry
 * generated from Agent X Film Review sources. This file is pure TypeScript and
 * intentionally contains no browser, Node.js, Firebase, or framework imports.
 */

import type { PortableTimestamp } from '../portable-timestamp.model';
import { getPositionsForSport, normalizeBaseSportKey } from '../../constants/sport.constants';

export type TeamFilmTrackingStatus =
  | 'not_tracked'
  | 'queued'
  | 'processing'
  | 'ready'
  | 'limited'
  | 'failed'
  | 'cancelled';

export type TeamFilmTrackingCapability =
  | 'none'
  | 'detection_only'
  | 'tracked_image_space'
  | 'calibrated_surface'
  | 'identified_roster'
  | 'metric_ready';

export type TeamFilmTrackingMode = 'draft' | 'metric';

export type TeamFilmTrackingScope = 'play' | 'selected_plays' | 'timeline' | 'full_video';

export type TeamFilmTrackingSurfaceType =
  | 'field'
  | 'court'
  | 'rink'
  | 'diamond'
  | 'mat'
  | 'pool'
  | 'track'
  | 'unknown';

export type TeamFilmTrackingEntityKind = 'player' | 'official' | 'ball' | 'coach' | 'other';

export type TeamFilmTrackingTeamSide = 'home' | 'away' | 'official' | 'unknown';

export type TeamFilmTrackingEvidenceSource =
  | 'model'
  | 'roster'
  | 'timeline_tag'
  | 'coach_confirmed'
  | 'manual_import';

export interface TeamFilmTrackingNormalizedPoint {
  readonly x: number;
  readonly y: number;
}

export interface TeamFilmTrackingNormalizedBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface TeamFilmTrackingSurfacePoint {
  readonly x: number;
  readonly y: number;
  readonly unit: 'yard' | 'meter' | 'foot' | 'normalized';
}

export interface TeamFilmTrackingTimeRange {
  readonly startSec: number;
  readonly endSec: number;
}

export interface TeamFilmTrackingCandidate {
  readonly value: string;
  readonly confidence: number;
  readonly source: TeamFilmTrackingEvidenceSource;
  readonly evidence?: string;
}

export interface TeamFilmTrackingModelBundle {
  readonly id: string;
  readonly version: string;
  readonly detector?: string;
  readonly tracker?: string;
  readonly jerseyOcr?: string;
  readonly calibration?: string;
  readonly positionInferencer?: string;
  readonly containerDigest?: string;
}

export interface TeamFilmTrackingManifestPointer {
  readonly manifestStoragePath: string;
  readonly manifestSha256?: string;
  readonly generatedAt?: PortableTimestamp;
  readonly expiresAt?: PortableTimestamp;
}

export interface TeamFilmTrackingProgress {
  readonly status: TeamFilmTrackingStatus;
  readonly processedWindowCount: number;
  readonly totalWindowCount: number;
  readonly processedFrameCount?: number;
  readonly totalFrameCount?: number;
  readonly percentComplete?: number;
  readonly statusMessage?: string;
  readonly updatedAt: PortableTimestamp;
}

export interface TeamFilmTrackingChunkDescriptor {
  readonly id: string;
  readonly storagePath: string;
  readonly sha256?: string;
  readonly timeRange: TeamFilmTrackingTimeRange;
  readonly frameCount: number;
  readonly compressedByteSize?: number;
}

export interface TeamFilmTrackingCalibration {
  readonly surfaceType: TeamFilmTrackingSurfaceType;
  readonly coordinateUnit: TeamFilmTrackingSurfacePoint['unit'];
  readonly homography?: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  readonly residualError?: number;
  readonly residualUnit?: TeamFilmTrackingSurfacePoint['unit'];
  readonly confidence: number;
  readonly landmarks?: readonly TeamFilmTrackingCandidate[];
}

export interface TeamFilmTrackedEntitySummary {
  readonly trackId: string;
  readonly kind: TeamFilmTrackingEntityKind;
  readonly teamSide?: TeamFilmTrackingTeamSide;
  readonly teamCandidates?: readonly TeamFilmTrackingCandidate[];
  readonly jerseyCandidates?: readonly TeamFilmTrackingCandidate[];
  readonly positionCandidates?: readonly TeamFilmTrackingCandidate[];
  readonly roleCandidates?: readonly TeamFilmTrackingCandidate[];
  readonly rosterCandidates?: readonly TeamFilmTrackingCandidate[];
  readonly firstSeenSec: number;
  readonly lastSeenSec: number;
  readonly visibilityRatio?: number;
  readonly confidence: number;
}

export interface TeamFilmTrackedEntityObservation {
  readonly trackId: string;
  readonly kind: TeamFilmTrackingEntityKind;
  readonly teamSide?: TeamFilmTrackingTeamSide;
  readonly bounds?: TeamFilmTrackingNormalizedBounds;
  readonly center?: TeamFilmTrackingNormalizedPoint;
  readonly surfacePoint?: TeamFilmTrackingSurfacePoint;
  readonly speedMph?: number;
  readonly accelerationMps2?: number;
  readonly confidence: number;
}

export interface TeamFilmTrackingFrame {
  readonly frameIndex: number;
  readonly timestampSec: number;
  readonly calibration?: TeamFilmTrackingCalibration;
  readonly entities: readonly TeamFilmTrackedEntityObservation[];
}

export interface TeamFilmTrackingPlayMetricSummary {
  readonly playId?: string;
  readonly timeRange: TeamFilmTrackingTimeRange;
  readonly capability: TeamFilmTrackingCapability;
  readonly topSpeedTrackId?: string;
  readonly topSpeedMph?: number;
  readonly formationLabel?: string;
  readonly frontLabel?: string;
  readonly coverageLabel?: string;
  readonly confidence: number;
}

export interface TeamFilmTrackingManifest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly filmReviewId: string;
  readonly sourceId?: string;
  readonly sport: string;
  readonly surfaceType: TeamFilmTrackingSurfaceType;
  readonly status: TeamFilmTrackingStatus;
  readonly capability: TeamFilmTrackingCapability;
  readonly mode: TeamFilmTrackingMode;
  readonly sourceContentHash?: string;
  readonly modelBundle: TeamFilmTrackingModelBundle;
  readonly generatedAt: PortableTimestamp;
  readonly timeRange: TeamFilmTrackingTimeRange;
  readonly fps?: number;
  readonly totalFrameCount?: number;
  readonly chunks: readonly TeamFilmTrackingChunkDescriptor[];
  readonly tracks: readonly TeamFilmTrackedEntitySummary[];
  readonly playMetrics?: readonly TeamFilmTrackingPlayMetricSummary[];
  readonly correctionRevision?: number;
}

export interface TeamFilmTrackingCorrection {
  readonly id: string;
  readonly trackId: string;
  readonly field:
    | 'team'
    | 'jersey'
    | 'position'
    | 'role'
    | 'roster'
    | 'track_merge'
    | 'track_split';
  readonly value?: string | null;
  readonly previousValue?: string | null;
  readonly source: 'coach_confirmed';
  readonly createdBy: string;
  readonly createdAt: PortableTimestamp;
  readonly revision: number;
}

export interface SportTrackingAdapter {
  readonly sport: string;
  readonly aliases: readonly string[];
  readonly surfaceType: TeamFilmTrackingSurfaceType;
  readonly supportedCapabilities: readonly TeamFilmTrackingCapability[];
  readonly canonicalPositions: readonly string[];
  readonly tacticalRoles: readonly string[];
  readonly landmarks: readonly string[];
  readonly zones: readonly string[];
  readonly metrics: readonly string[];
}

export const TEAM_FILM_TRACKING_GENERIC_ADAPTER: SportTrackingAdapter = {
  sport: 'generic',
  aliases: ['unknown', 'other'],
  surfaceType: 'unknown',
  supportedCapabilities: ['detection_only', 'tracked_image_space'],
  canonicalPositions: [],
  tacticalRoles: ['player', 'official', 'ball'],
  landmarks: [],
  zones: [],
  metrics: ['visibility', 'track_continuity'],
} as const;

export const TEAM_FILM_TRACKING_FOOTBALL_ADAPTER: SportTrackingAdapter = {
  sport: 'football',
  aliases: ['american_football', 'flag_football'],
  surfaceType: 'field',
  supportedCapabilities: [
    'detection_only',
    'tracked_image_space',
    'calibrated_surface',
    'identified_roster',
    'metric_ready',
  ],
  canonicalPositions: getPositionsForSport('football'),
  tacticalRoles: [
    'passer',
    'ball_carrier',
    'pass_catcher',
    'primary_defender',
    'edge_rusher',
    'interior_rusher',
    'run_blocker',
    'coverage_defender',
  ],
  landmarks: ['sideline', 'yard_line', 'hash_mark', 'line_of_scrimmage', 'first_down', 'end_zone'],
  zones: ['backfield', 'box', 'slot', 'numbers', 'sideline', 'red_zone', 'end_zone'],
  metrics: [
    'speed',
    'distance_covered',
    'route_depth',
    'separation',
    'cushion',
    'time_to_pressure',
    'box_count',
  ],
} as const;

export const TEAM_FILM_TRACKING_BASKETBALL_ADAPTER: SportTrackingAdapter = {
  sport: 'basketball',
  aliases: ['basketball_mens', 'basketball_womens'],
  surfaceType: 'court',
  supportedCapabilities: [
    'detection_only',
    'tracked_image_space',
    'calibrated_surface',
    'identified_roster',
    'metric_ready',
  ],
  canonicalPositions: getPositionsForSport('basketball'),
  tacticalRoles: [
    'ball_handler',
    'screener',
    'roller',
    'shooter',
    'primary_defender',
    'help_defender',
    'rim_protector',
  ],
  landmarks: ['sideline', 'baseline', 'center_circle', 'paint', 'three_point_arc', 'basket'],
  zones: ['paint', 'corner', 'wing', 'slot', 'top', 'backcourt', 'frontcourt'],
  metrics: ['speed', 'spacing', 'shot_contest_distance', 'screen_angle', 'paint_touch'],
} as const;

export const TEAM_FILM_TRACKING_ADAPTERS = [
  TEAM_FILM_TRACKING_FOOTBALL_ADAPTER,
  TEAM_FILM_TRACKING_BASKETBALL_ADAPTER,
  TEAM_FILM_TRACKING_GENERIC_ADAPTER,
] as const;

export function resolveTeamFilmTrackingAdapter(sport: string): SportTrackingAdapter {
  const normalizedSport = normalizeBaseSportKey(sport);
  return (
    TEAM_FILM_TRACKING_ADAPTERS.find(
      (adapter) =>
        adapter.sport === normalizedSport ||
        adapter.aliases.some((alias) => alias === normalizedSport)
    ) ?? TEAM_FILM_TRACKING_GENERIC_ADAPTER
  );
}
