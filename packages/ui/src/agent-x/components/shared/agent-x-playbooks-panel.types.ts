import type { TeamGamePlanDoc } from '@nxt1/core';

export interface PlaybookSummary {
  readonly id: string;
  readonly teamId: string;
  readonly sport: string;
  readonly name: string;
  readonly title?: string;
  readonly season?: string;
  readonly source?: string;
  readonly sourceUrl?: string;
  readonly playCount?: number;
  readonly updatedAt?: string;
  readonly createdAt?: string;
  readonly archived?: boolean;
}

export interface PlaybookPlay {
  readonly id?: string;
  readonly name?: string;
  readonly title?: string;
  readonly series?: string;
  readonly category?: string;
  readonly formation?: string;
  readonly personnel?: string;
  readonly downDistance?: string;
  readonly objective?: string;
  readonly installNotes?: string;
  readonly tags?: readonly string[];
  readonly conceptTags?: readonly string[];
  readonly diagramUrl?: string;
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

export interface PlaybookDetail extends PlaybookSummary {
  readonly plays?: readonly PlaybookPlay[];
  readonly conceptTagIndex?: readonly string[];
  readonly formationIndex?: readonly string[];
  readonly personnelIndex?: readonly string[];
  readonly categoryIndex?: readonly string[];
  readonly createdBy?: string;
  readonly updatedBy?: string;
}

export interface PlaybooksResponse {
  readonly success: boolean;
  readonly data?: { readonly playbooks: readonly PlaybookSummary[]; readonly count: number };
  readonly error?: string;
}

export interface PlaybookDetailResponse {
  readonly success: boolean;
  readonly data?: { readonly playbook: PlaybookDetail };
  readonly error?: string;
}

export interface MutationResponse {
  readonly success: boolean;
  readonly data?: Record<string, unknown>;
  readonly error?: string;
}

export interface GameplansResponse {
  readonly success: boolean;
  readonly data?: {
    readonly gamePlans: readonly Pick<
      TeamGamePlanDoc,
      'id' | 'teamId' | 'sport' | 'title' | 'opponentName' | 'updatedAt' | 'createdAt'
    >[];
    readonly count: number;
  };
  readonly error?: string;
}

export interface GamePlanDetailResponse {
  readonly success: boolean;
  readonly data?: {
    readonly gamePlan: TeamGamePlanDoc;
  };
  readonly error?: string;
}

export interface UploadAttachmentResponse {
  readonly success: boolean;
  readonly data?: {
    readonly url: string;
    readonly storagePath?: string;
    readonly name?: string;
    readonly mimeType?: string;
    readonly sizeBytes?: number;
  };
  readonly error?: string;
}

export interface NewPlaybookForm {
  name: string;
  sport: string;
  season: string;
}

export interface EditPlaybookForm {
  name: string;
  season: string;
  source: string;
}

export interface PlayForm {
  name: string;
  series: string;
  category: string;
  formation: string;
  personnel: string;
  objective: string;
  installNotes: string;
  conceptTags: string;
  diagramUrl: string;
  installStage: 'install' | 'rep' | 'game-ready' | '';
  coachingPoints: string;
  commonBusts: string;
  correctionCues: string;
  drillProgression: string;
  situations: string;
}

export interface CallsheetAiPlayRanking {
  readonly playName: string;
  readonly score: number;
  readonly reasoning: string;
}

export interface CallsheetAiResponse {
  readonly success: boolean;
  readonly data?: {
    readonly plays: readonly CallsheetAiPlayRanking[];
  };
  readonly error?: string;
}

export interface InstallPlanUpdate {
  readonly playIndex: number;
  readonly installStage: 'install' | 'rep' | 'game-ready';
  readonly reasoning: string;
}

export interface GenerateInstallPlanResponse {
  readonly success: boolean;
  readonly data?: {
    readonly updates: readonly InstallPlanUpdate[];
  };
  readonly error?: string;
}

export interface GamePlan {
  readonly id: string;
  readonly teamId: string;
  readonly sport: string;
  readonly opponent: string;
  readonly plays: string[];
  readonly notes?: string;
  readonly title?: string;
  readonly updatedAt?: string;
  readonly createdAt?: string;
}

export const EMPTY_NEW_PLAYBOOK: NewPlaybookForm = { name: '', sport: '', season: '' };
export const EMPTY_EDIT_PLAYBOOK: EditPlaybookForm = { name: '', season: '', source: '' };
export const EMPTY_PLAY_FORM: PlayForm = {
  name: '',
  series: '',
  category: '',
  formation: '',
  personnel: '',
  objective: '',
  installNotes: '',
  conceptTags: '',
  diagramUrl: '',
  installStage: '',
  coachingPoints: '',
  commonBusts: '',
  correctionCues: '',
  drillProgression: '',
  situations: '',
};

export function toTitleCase(str: string): string {
  return str.trim().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .map(toTitleCase);
}
