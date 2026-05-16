/**
 * @fileoverview Team Game Plan — Firestore `TeamGamePlans` collection document type
 *
 * Stores matchup-specific or situational strategy documents for any sport.
 * This is distinct from `TeamPlaybooks`, which stores reusable play inventory.
 * A game plan answers: what are we emphasizing for this opponent / game / phase?
 */

import type { PortableTimestamp } from '../portable-timestamp.model';

export type TeamGamePlanStatus = 'draft' | 'active' | 'archived';

export type TeamGamePlanPhase = 'pregame' | 'in-game' | 'postgame' | 'scouting';

export type TeamGamePlanPerspective = 'own' | 'opponent' | 'neutral';

export type TeamGamePlanPriorityKind =
  | 'offense'
  | 'defense'
  | 'execution'
  | 'special_teams'
  | 'transition'
  | 'set_piece'
  | 'custom';

export type TeamGamePlanDomain =
  | 'offense'
  | 'defense'
  | 'transition'
  | 'special_situations'
  | 'set_piece'
  | 'execution'
  | 'mentality'
  | 'communication';

export type TeamGamePlanMoment =
  | 'pregame'
  | 'opening_phase'
  | 'mid_game'
  | 'end_game'
  | 'timeout'
  | 'halftime'
  | 'two_minute'
  | 'overtime'
  | 'postgame';

export type TeamGamePlanPriorityLevel = 'must_win' | 'high' | 'medium' | 'low';

export type TeamGamePlanEvidenceType = 'video' | 'diagram' | 'stat' | 'note';

export type TeamGamePlanUrlProvider = 'hudl' | 'youtube' | 'vimeo' | 'internal' | 'custom';

export interface TeamGamePlanAdjustmentTrigger {
  readonly trigger: string;
  readonly diagnosis?: string;
  readonly adjustment: string;
  readonly validationWindow?: string;
  readonly expectedOutcome?: string;
  readonly tags?: readonly string[];
}

export interface TeamGamePlanPriority {
  readonly kind: TeamGamePlanPriorityKind;
  readonly label: string;
  readonly content: string;
}

export interface TeamGamePlanSection {
  readonly key: string;
  readonly title: string;
  readonly content: string;
  readonly order?: number;
  readonly tags?: readonly string[];
}

export interface TeamGamePlanUrl {
  readonly label: string;
  readonly url: string;
  readonly type: 'diagram' | 'video' | 'install' | 'scouting_cutup' | 'other';
  readonly provider?: TeamGamePlanUrlProvider;
}

export interface TeamGamePlanStrengthWeaknessItem {
  readonly id: string;
  readonly side: 'own' | 'opponent';
  readonly type: 'strength' | 'weakness';
  readonly label: string;
  readonly impactLevel: TeamGamePlanPriorityLevel;
  readonly actionPlan?: string;
  readonly evidence?: {
    readonly type: TeamGamePlanEvidenceType;
    readonly note?: string;
    readonly url?: string;
  };
  readonly tags?: readonly string[];
}

export interface TeamGamePlanMomentPriority {
  readonly id: string;
  readonly domain: TeamGamePlanDomain;
  readonly moment: TeamGamePlanMoment;
  readonly level: TeamGamePlanPriorityLevel;
  readonly title: string;
  readonly objective: string;
  readonly successMetric?: string;
  readonly ownerRole?: string;
  readonly tags?: readonly string[];
}

export interface TeamGamePlanBlock {
  readonly id: string;
  readonly domain: TeamGamePlanDomain;
  readonly moment?: TeamGamePlanMoment;
  readonly title: string;
  readonly content: string;
  readonly order: number;
  readonly tags?: readonly string[];
}

export interface TeamGamePlanPlayReference {
  readonly playbookId?: string;
  readonly playId?: string;
  readonly playName: string;
  readonly usage?: string;
  readonly diagramUrl?: string;
  readonly videoUrl?: string;
  readonly installUrl?: string;
  readonly scoutingCutupUrl?: string;
  readonly urls?: readonly TeamGamePlanUrl[];
  readonly notes?: string;
}

export interface TeamGamePlanDoc {
  readonly id: string;
  readonly teamId: string;
  readonly sport: string;
  readonly title: string;
  readonly phase: TeamGamePlanPhase;
  readonly status: TeamGamePlanStatus;
  readonly season?: string;
  readonly division?: string;
  readonly gameDate?: string;
  readonly opponentId?: string;
  readonly opponentName?: string;
  readonly ownTeamColor?: string;
  readonly opponentTeamColor?: string;
  readonly perspectiveTeam?: TeamGamePlanPerspective;
  readonly identityFocus?: string;
  readonly primaryAttackPlan?: string;
  readonly defensivePriorities?: string;
  readonly specialSituations?: string;
  readonly openingScript?: readonly string[];
  readonly strengthsWeaknesses?: readonly TeamGamePlanStrengthWeaknessItem[];
  readonly priorities?: readonly TeamGamePlanMomentPriority[];
  readonly planBlocks?: readonly TeamGamePlanBlock[];
  readonly adjustmentTriggers?: readonly TeamGamePlanAdjustmentTrigger[];
  readonly halftimePriorities?: readonly TeamGamePlanPriority[];
  readonly customSections?: readonly TeamGamePlanSection[];
  readonly linkedPlays?: readonly TeamGamePlanPlayReference[];
  readonly tags?: readonly string[];
  readonly linkedPlaybookIds?: readonly string[];
  readonly source: string;
  readonly sourceUrl?: string;
  readonly schemaVersion: number;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly createdAt: PortableTimestamp;
  readonly updatedAt: PortableTimestamp;
}
