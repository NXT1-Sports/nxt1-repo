import type { PortableTimestamp } from '../portable-timestamp.model';
import type { TeamFilmReviewDoc, TeamFilmReviewStatus } from './team-film-review.model';
import type { TeamGamePlanDoc, TeamGamePlanStatus } from './team-gameplan.model';

export type TeamFileKind = 'image' | 'video' | 'pdf' | 'csv' | 'doc' | 'app';

export type TeamFileOrigin = 'files_upload' | 'agent_chat_input' | 'agent_chat_output';

export type TeamFileStatus = 'processing' | 'ready' | 'archived';

export interface TeamFileFolderDoc {
  readonly id: string;
  readonly teamId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly parentId?: string | null;
  readonly sortOrder: number;
  readonly createdByUserId: string;
  readonly createdAt: PortableTimestamp;
  readonly updatedAt: PortableTimestamp;
}

export const UNIVERSAL_FILES_COLLECTION = 'UniversalFiles' as const;

export type UniversalFileType =
  | 'file'
  | 'film_review'
  | 'game_plan'
  | 'playbook'
  | 'callsheet'
  | 'practice_script';

export type UniversalFileStatus = TeamFileStatus | TeamFilmReviewStatus | TeamGamePlanStatus;

export type UniversalFileSemanticSyncStatus = 'pending' | 'synced' | 'failed' | 'skipped';
export type UniversalFilePayloadKind = 'native' | 'pointer';
export type UniversalPointerBackedFileType = 'film_review' | 'playbook';
export type UniversalNativeFileType = Exclude<UniversalFileType, UniversalPointerBackedFileType>;

export interface UniversalFileSemanticSync {
  readonly status: UniversalFileSemanticSyncStatus;
  readonly documentId?: string;
  readonly syncedAt?: PortableTimestamp;
  readonly error?: string | null;
}

export interface UniversalFileSourceReference {
  readonly legacyCollection?: string;
  readonly legacyId?: string;
  readonly sourceThreadId?: string;
  readonly sourceMessageId?: string;
  readonly sourceOperationId?: string;
}

export interface UniversalFilePointerPreview {
  readonly title?: string;
  readonly summary?: string;
  readonly status?: UniversalFileStatus;
  readonly sport?: string;
  readonly tags?: readonly string[];
  readonly thumbnailUrl?: string;
}

export interface UniversalFilePointerPayload {
  readonly documentId: string;
  readonly collectionName: string;
  readonly preview?: UniversalFilePointerPreview;
}

export interface UniversalBinaryFilePayload {
  readonly mimeType: string;
  readonly kind: TeamFileKind;
  readonly origin: TeamFileOrigin;
  readonly sizeBytes: number;
  readonly url: string;
  readonly storagePath?: string;
  readonly cloudflareVideoId?: string;
  readonly cloudflareStatus?: string;
  readonly readyToStream?: boolean;
  readonly thumbnailUrl?: string;
  readonly platform?: string;
  readonly profileUrl?: string;
  readonly faviconUrl?: string;
}

export type UniversalFilmReviewPayload = Omit<
  TeamFilmReviewDoc,
  | 'id'
  | 'teamId'
  | 'sport'
  | 'title'
  | 'status'
  | 'tags'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>;

export type UniversalGamePlanPayload = Omit<
  TeamGamePlanDoc,
  | 'id'
  | 'teamId'
  | 'sport'
  | 'title'
  | 'status'
  | 'tags'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>;

export interface UniversalPlaybookFilePlay {
  readonly id?: string;
  readonly name?: string;
  readonly title?: string;
  readonly series?: string;
  readonly category?: string;
  readonly playType?: string;
  readonly formation?: string;
  readonly personnel?: string;
  readonly downDistance?: string;
  readonly objective?: string;
  readonly playBreakdown?: string;
  readonly installNotes?: string;
  readonly tags?: readonly string[];
  readonly conceptTags?: readonly string[];
  readonly diagramUrl?: string;
  readonly diagramAssetId?: string;
  readonly videoUrl?: string;
  readonly installUrl?: string;
  readonly installStage?: 'install' | 'rep' | 'game-ready';
  readonly coachingPoints?: readonly string[];
  readonly commonBusts?: readonly string[];
  readonly correctionCues?: readonly string[];
  readonly drillProgression?: readonly string[];
  readonly situations?: readonly string[];
  readonly successRate?: number;
  readonly typicalGain?: number;
  readonly strengths?: readonly string[];
}

export interface UniversalPlaybookFilePayload {
  readonly name?: string;
  readonly season?: string;
  readonly source?: string;
  readonly sourceUrl?: string;
  readonly playCount?: number;
  readonly archived?: boolean;
  readonly conceptTagIndex?: readonly string[];
  readonly formationIndex?: readonly string[];
  readonly personnelIndex?: readonly string[];
  readonly categoryIndex?: readonly string[];
  readonly createdBy?: string;
  readonly updatedBy?: string;
  readonly plays?: readonly UniversalPlaybookFilePlay[];
}

export interface UniversalCallsheetFilePayload {
  readonly playbookId?: string;
  readonly situation?: string;
  readonly filters?: Readonly<Record<string, unknown>>;
  readonly playCount?: number;
  readonly groupCount?: number;
  readonly topPlayName?: string | null;
  readonly archived?: boolean;
  readonly notes?: string;
  readonly source?: string;
  readonly plays?: readonly TeamCallsheetPlay[];
  readonly groups?: readonly {
    readonly id: string;
    readonly name: string;
    readonly playNames: readonly string[];
    readonly order?: number;
  }[];
}

export interface UniversalPracticeScriptFilePayload {
  readonly playbookId?: string;
  readonly focus?: string;
  readonly tempo?: string;
  readonly scriptDate?: string;
  readonly opponent?: string;
  readonly objectives?: readonly string[];
  readonly notes?: string;
  readonly source?: string;
  readonly displayOrder?: number;
  readonly archived?: boolean;
  readonly periods?: readonly {
    readonly id: string;
    readonly label: string;
    readonly clock: string;
    readonly reps: number;
    readonly callType: string;
    readonly playName: string;
    readonly coachingPoint?: string;
    readonly notes?: string;
  }[];
}

export interface UniversalFilePayloadMap {
  readonly file: UniversalBinaryFilePayload;
  readonly film_review: UniversalFilmReviewPayload;
  readonly game_plan: UniversalGamePlanPayload;
  readonly playbook: UniversalPlaybookFilePayload;
  readonly callsheet: UniversalCallsheetFilePayload;
  readonly practice_script: UniversalPracticeScriptFilePayload;
}

export interface TeamCallsheetPlay {
  readonly playName: string;
  readonly score: number;
  readonly reasoning: string;
}

export interface TeamCallsheetGroup {
  readonly id: string;
  readonly name: string;
  readonly playNames: readonly string[];
  readonly order?: number;
}

export interface TeamCallsheetDoc {
  readonly id: string;
  readonly teamId: string;
  readonly playbookId: string;
  readonly sport?: string;
  readonly title: string;
  readonly situation?: string;
  readonly filters?: Readonly<Record<string, unknown>>;
  readonly plays?: readonly TeamCallsheetPlay[];
  readonly groups?: readonly TeamCallsheetGroup[];
  readonly notes?: string;
  readonly source?: string;
  readonly archived?: boolean;
  readonly createdAt: PortableTimestamp;
  readonly createdBy?: string;
  readonly updatedAt: PortableTimestamp;
  readonly updatedBy?: string;
}

export interface TeamPracticeScriptPeriod {
  readonly id: string;
  readonly label: string;
  readonly clock: string;
  readonly reps: number;
  readonly callType: string;
  readonly playName: string;
  readonly coachingPoint?: string;
  readonly notes?: string;
}

export interface TeamPracticeScriptDoc {
  readonly id: string;
  readonly teamId: string;
  readonly playbookId: string;
  readonly sport?: string;
  readonly title: string;
  readonly focus?: string;
  readonly tempo?: string;
  readonly scriptDate?: string;
  readonly opponent?: string;
  readonly objectives?: readonly string[];
  readonly periods?: readonly TeamPracticeScriptPeriod[];
  readonly notes?: string;
  readonly source?: string;
  readonly displayOrder?: number;
  readonly archived?: boolean;
  readonly createdAt: PortableTimestamp;
  readonly createdBy?: string;
  readonly updatedAt: PortableTimestamp;
  readonly updatedBy?: string;
}

export interface UniversalFileDocBase<TType extends UniversalFileType = UniversalFileType> {
  readonly id: string;
  readonly teamId: string;
  readonly type: TType;
  readonly title: string;
  readonly normalizedTitle: string;
  readonly status: UniversalFileStatus;
  readonly sport?: string;
  readonly summary?: string;
  readonly tags?: readonly string[];
  readonly folderId?: string | null;
  readonly thumbnailUrl?: string;
  readonly ownerUserId?: string;
  readonly createdByUserId?: string;
  readonly updatedByUserId?: string;
  readonly semanticSync?: UniversalFileSemanticSync;
  readonly sourceRef?: UniversalFileSourceReference;
  readonly createdAt: PortableTimestamp;
  readonly updatedAt: PortableTimestamp;
  readonly lastSeenAt?: PortableTimestamp;
}

export type UniversalNativeFileDoc<TType extends UniversalFileType = UniversalFileType> =
  UniversalFileDocBase<TType> & {
    readonly payloadKind: 'native';
    readonly payload: UniversalFilePayloadMap[TType];
  };

export type UniversalPointerFileDoc<
  TType extends UniversalPointerBackedFileType = UniversalPointerBackedFileType,
> = UniversalFileDocBase<TType> & {
  readonly payloadKind: 'pointer';
  readonly payload: UniversalFilePointerPayload;
};

export type UniversalFileDoc<TType extends UniversalFileType = UniversalFileType> =
  TType extends UniversalPointerBackedFileType
    ? UniversalNativeFileDoc<TType> | UniversalPointerFileDoc<TType>
    : UniversalNativeFileDoc<TType>;

export interface CreateUniversalPointerFileInput<
  TType extends UniversalPointerBackedFileType = UniversalPointerBackedFileType,
> extends UniversalFileDocBase<TType> {
  readonly payload: UniversalFilePointerPayload;
}

export function createUniversalPointerFile<
  TType extends UniversalPointerBackedFileType = UniversalPointerBackedFileType,
>(input: CreateUniversalPointerFileInput<TType>): UniversalPointerFileDoc<TType> {
  return {
    ...input,
    payloadKind: 'pointer',
  };
}

export function toUniversalFileFromTeamFilmReview(
  review: TeamFilmReviewDoc
): UniversalNativeFileDoc<'film_review'> {
  return {
    id: review.id,
    teamId: review.teamId,
    type: 'film_review',
    title: review.title,
    normalizedTitle: review.title.trim().toLowerCase(),
    status: review.status,
    sport: review.sport,
    summary: review.aiSummary,
    tags: review.tags,
    thumbnailUrl: review.thumbnailUrl,
    createdByUserId: review.createdBy,
    updatedByUserId: review.updatedBy,
    semanticSync: { status: 'pending' },
    sourceRef: {
      legacyCollection: 'TeamFilmReviews',
      legacyId: review.id,
    },
    payloadKind: 'native',
    payload: {
      uploadMode: review.uploadMode,
      perspective: review.perspective,
      gameDate: review.gameDate,
      opponentName: review.opponentName,
      playlistId: review.playlistId,
      playlistName: review.playlistName,
      videoUrl: review.videoUrl,
      sources: review.sources,
      storagePath: review.storagePath,
      cloudflareVideoId: review.cloudflareVideoId,
      cloudflareStatus: review.cloudflareStatus,
      readyToStream: review.readyToStream,
      thumbnailUrl: review.thumbnailUrl,
      durationSec: review.durationSec,
      aiSummary: review.aiSummary,
      aiTags: review.aiTags,
      clips: review.clips,
      annotations: review.annotations,
      keyInsights: review.keyInsights,
      source: review.source,
      sourceUrl: review.sourceUrl,
      schemaVersion: review.schemaVersion,
      timelineState: review.timelineState,
      timeline: review.timeline,
      breakdownSource: review.breakdownSource,
      timelineGeneratedAt: review.timelineGeneratedAt,
      timelineError: review.timelineError,
      timelineProgress: review.timelineProgress,
      downloadPrewarm: review.downloadPrewarm,
      downloadExport: review.downloadExport,
    },
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

export function toUniversalFileFromTeamFilmReviewAsPointer(
  review: TeamFilmReviewDoc
): UniversalPointerFileDoc<'film_review'> {
  return createUniversalPointerFile({
    id: review.id,
    teamId: review.teamId,
    type: 'film_review',
    title: review.title,
    normalizedTitle: review.title.trim().toLowerCase(),
    status: review.status,
    sport: review.sport,
    summary: review.aiSummary,
    tags: review.tags,
    thumbnailUrl: review.thumbnailUrl,
    createdByUserId: review.createdBy,
    updatedByUserId: review.updatedBy,
    semanticSync: { status: 'pending' },
    sourceRef: {
      legacyCollection: 'TeamFilmReviews',
      legacyId: review.id,
    },
    payload: {
      documentId: review.id,
      collectionName: 'TeamFilmReviews',
      preview: {
        title: review.title,
        summary: review.aiSummary,
        status: review.status,
        sport: review.sport,
        tags: review.tags,
        thumbnailUrl: review.thumbnailUrl,
      },
    },
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  });
}

export function toUniversalFileFromTeamGamePlan(
  gamePlan: TeamGamePlanDoc
): UniversalNativeFileDoc<'game_plan'> {
  return {
    id: gamePlan.id,
    teamId: gamePlan.teamId,
    type: 'game_plan',
    title: gamePlan.title,
    normalizedTitle: gamePlan.title.trim().toLowerCase(),
    status: gamePlan.status,
    sport: gamePlan.sport,
    summary: gamePlan.scoutingReport ?? gamePlan.primaryAttackPlan,
    tags: gamePlan.tags,
    createdByUserId: gamePlan.createdBy,
    updatedByUserId: gamePlan.updatedBy,
    semanticSync: { status: 'pending' },
    sourceRef: {
      legacyCollection: 'TeamGamePlans',
      legacyId: gamePlan.id,
    },
    payloadKind: 'native',
    payload: {
      phase: gamePlan.phase,
      season: gamePlan.season,
      division: gamePlan.division,
      gameDate: gamePlan.gameDate,
      opponentId: gamePlan.opponentId,
      opponentName: gamePlan.opponentName,
      ownTeamColor: gamePlan.ownTeamColor,
      opponentTeamColor: gamePlan.opponentTeamColor,
      perspectiveTeam: gamePlan.perspectiveTeam,
      identityFocus: gamePlan.identityFocus,
      primaryAttackPlan: gamePlan.primaryAttackPlan,
      defensivePriorities: gamePlan.defensivePriorities,
      specialSituations: gamePlan.specialSituations,
      openingScript: gamePlan.openingScript,
      strengthsWeaknesses: gamePlan.strengthsWeaknesses,
      priorities: gamePlan.priorities,
      planBlocks: gamePlan.planBlocks,
      adjustmentTriggers: gamePlan.adjustmentTriggers,
      halftimePriorities: gamePlan.halftimePriorities,
      customSections: gamePlan.customSections,
      linkedPlays: gamePlan.linkedPlays,
      linkedPlaybookIds: gamePlan.linkedPlaybookIds,
      scoutingReport: gamePlan.scoutingReport,
      source: gamePlan.source,
      sourceUrl: gamePlan.sourceUrl,
      schemaVersion: gamePlan.schemaVersion,
    },
    createdAt: gamePlan.createdAt,
    updatedAt: gamePlan.updatedAt,
  };
}

export function toUniversalFileFromTeamCallsheet(
  callsheet: TeamCallsheetDoc
): UniversalNativeFileDoc<'callsheet'> {
  return {
    id: callsheet.id,
    teamId: callsheet.teamId,
    type: 'callsheet',
    title: callsheet.title,
    normalizedTitle: callsheet.title.trim().toLowerCase(),
    status: callsheet.archived ? 'archived' : 'ready',
    sport: callsheet.sport,
    summary: callsheet.notes ?? callsheet.situation,
    createdByUserId: callsheet.createdBy,
    updatedByUserId: callsheet.updatedBy,
    semanticSync: { status: 'pending' },
    sourceRef: {
      legacyCollection: 'TeamCallsheets',
      legacyId: callsheet.id,
    },
    payloadKind: 'native',
    payload: {
      playbookId: callsheet.playbookId,
      situation: callsheet.situation,
      filters: callsheet.filters,
      playCount: callsheet.plays?.length,
      groupCount: callsheet.groups?.length,
      topPlayName: callsheet.plays?.[0]?.playName ?? null,
      archived: callsheet.archived,
      notes: callsheet.notes,
      source: callsheet.source,
      plays: callsheet.plays,
      groups: callsheet.groups,
    },
    createdAt: callsheet.createdAt,
    updatedAt: callsheet.updatedAt,
  };
}

export function toUniversalFileFromTeamPracticeScript(
  script: TeamPracticeScriptDoc
): UniversalNativeFileDoc<'practice_script'> {
  return {
    id: script.id,
    teamId: script.teamId,
    type: 'practice_script',
    title: script.title,
    normalizedTitle: script.title.trim().toLowerCase(),
    status: script.archived ? 'archived' : 'ready',
    sport: script.sport,
    summary: script.notes ?? script.focus,
    createdByUserId: script.createdBy,
    updatedByUserId: script.updatedBy,
    semanticSync: { status: 'pending' },
    sourceRef: {
      legacyCollection: 'TeamPracticeScripts',
      legacyId: script.id,
    },
    payloadKind: 'native',
    payload: {
      playbookId: script.playbookId,
      focus: script.focus,
      tempo: script.tempo,
      scriptDate: script.scriptDate,
      opponent: script.opponent,
      objectives: script.objectives,
      notes: script.notes,
      source: script.source,
      displayOrder: script.displayOrder,
      archived: script.archived,
      periods: script.periods,
    },
    createdAt: script.createdAt,
    updatedAt: script.updatedAt,
  };
}
