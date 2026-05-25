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
  readonly playBreakdown?: string;
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
  playBreakdown: string;
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

export interface CallsheetSummary {
  readonly id: string;
  readonly teamId: string;
  readonly playbookId: string;
  readonly sport: string;
  readonly title: string;
  readonly situation: string;
  readonly playCount: number;
  readonly groupCount?: number;
  readonly topPlayName?: string | null;
  readonly archived?: boolean;
  readonly updatedAt?: string;
  readonly createdAt?: string;
}

export interface CallsheetGroup {
  readonly id: string;
  readonly name: string;
  readonly playNames: readonly string[];
}

export interface CallsheetDetail extends CallsheetSummary {
  readonly filters?: Readonly<Record<string, string>>;
  readonly notes?: string;
  readonly plays?: readonly CallsheetAiPlayRanking[];
  readonly groups?: readonly CallsheetGroup[];
  readonly source?: string;
  readonly updatedBy?: string;
  readonly createdBy?: string;
}

export interface CallsheetsResponse {
  readonly success: boolean;
  readonly data?: {
    readonly callsheets: readonly CallsheetSummary[];
    readonly count: number;
  };
  readonly error?: string;
}

export interface CallsheetDetailResponse {
  readonly success: boolean;
  readonly data?: {
    readonly callsheet: CallsheetDetail;
  };
  readonly error?: string;
}

export interface PracticeScriptPeriod {
  readonly id: string;
  readonly label: string;
  readonly clock: string;
  readonly reps: number;
  readonly callType: string;
  readonly playName: string;
  readonly coachingPoint?: string;
  readonly notes?: string;
}

export interface PracticeScriptSummary {
  readonly id: string;
  readonly teamId: string;
  readonly playbookId: string;
  readonly sport: string;
  readonly title: string;
  readonly focus: string;
  readonly tempo: string;
  readonly scriptDate?: string;
  readonly opponent?: string;
  readonly totalPeriods: number;
  readonly totalReps: number;
  readonly displayOrder?: number;
  readonly archived?: boolean;
  readonly updatedAt?: string;
  readonly createdAt?: string;
}

export interface PracticeScriptDetail extends PracticeScriptSummary {
  readonly objectives?: readonly string[];
  readonly periods?: readonly PracticeScriptPeriod[];
  readonly notes?: string;
  readonly source?: string;
  readonly updatedBy?: string;
  readonly createdBy?: string;
}

export interface PracticeScriptEditForm {
  title: string;
  focus: string;
  tempo: string;
  scriptDate: string;
  opponent: string;
  objectives: string;
  notes: string;
  periods: readonly PracticeScriptPeriod[];
}

export interface PracticeScriptsResponse {
  readonly success: boolean;
  readonly data?: {
    readonly scripts: readonly PracticeScriptSummary[];
    readonly count: number;
  };
  readonly error?: string;
}

export interface PracticeScriptDetailResponse {
  readonly success: boolean;
  readonly data?: {
    readonly script: PracticeScriptDetail;
  };
  readonly error?: string;
}

export interface PracticeScriptAiResponse {
  readonly success: boolean;
  readonly data?: {
    readonly title: string;
    readonly focus: string;
    readonly tempo: string;
    readonly objectives: readonly string[];
    readonly periods: readonly PracticeScriptPeriod[];
    readonly notes?: string;
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

export interface PlaybookPdfExportResponse {
  readonly success: boolean;
  readonly data?: {
    readonly downloadUrl: string;
    readonly storagePath?: string;
    readonly fileName?: string;
    readonly mimeType?: string;
    readonly format?: 'pdf';
    readonly sizeBytes?: number;
    readonly rowCount?: number;
    readonly columnCount?: number;
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

export const EMPTY_NEW_PLAYBOOK: NewPlaybookForm = { name: '', season: '' };
export const EMPTY_EDIT_PLAYBOOK: EditPlaybookForm = { name: '', season: '', source: '' };
export const EMPTY_PLAY_FORM: PlayForm = {
  name: '',
  series: '',
  category: '',
  formation: '',
  personnel: '',
  objective: '',
  playBreakdown: '',
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

export const EMPTY_PRACTICE_SCRIPT_EDIT_FORM: PracticeScriptEditForm = {
  title: '',
  focus: '',
  tempo: '',
  scriptDate: '',
  opponent: '',
  objectives: '',
  notes: '',
  periods: [],
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
