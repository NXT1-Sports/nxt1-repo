/**
 * @fileoverview Agent X Onboarding Type Definitions
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * Pure TypeScript types for the Agent X onboarding flow.
 * 100% portable — works on web, mobile, and backend.
 *
 * Flow:
 * 1. Welcome — "Let's get your agent started"
 * 2. Program Search — Search/create/claim a program (coaches)
 * 3. Goals — Set 2 goals for Agent X (predefined + custom)
 * 4. Connections — Add connections (shared component)
 * 5. Loading — Sleek boot-up animation → Agent X shell
 */

// ============================================
// STEP TYPES
// ============================================

/**
 * Agent onboarding step identifiers.
 */
export type AgentOnboardingStepId =
  | 'welcome'
  | 'program-search'
  | 'goals'
  | 'connections'
  | 'loading';

/**
 * Step configuration for display and navigation.
 */
export interface AgentOnboardingStep {
  /** Unique step identifier */
  readonly id: AgentOnboardingStepId;
  /** Display title */
  readonly title: string;
  /** Short subtitle / description */
  readonly subtitle: string;
  /** Step order (0-indexed) */
  readonly order: number;
  /** Whether the step can be skipped */
  readonly skippable: boolean;
}

// ============================================
// PROGRAM SEARCH TYPES
// ============================================

/**
 * Program search result from backend.
 */
export interface AgentProgramResult {
  /** Program/team ID */
  readonly id: string;
  /** Program name (e.g., "Lincoln High School") */
  readonly name: string;
  /** Sport name */
  readonly sport?: string;
  /** Team type (High School, Club, etc.) */
  readonly teamType?: string;
  /** State/Region */
  readonly state?: string;
  /** City */
  readonly city?: string;
  /** Team logo URL */
  readonly logoUrl?: string | null;
  /** Primary team color */
  readonly primaryColor?: string;
  /** Whether program is already claimed */
  readonly isClaimed?: boolean;
  /** Slug for team page */
  readonly slug?: string;
}

/**
 * Coach role within a program.
 */
export type CoachProgramRole =
  | 'head-coach'
  | 'assistant-coach'
  | 'coordinator'
  | 'position-coach'
  | 'strength-coach'
  | 'recruiting-coordinator';

/**
 * Coach role display configuration.
 */
export interface CoachRoleOption {
  /** Role identifier */
  readonly id: CoachProgramRole;
  /** Display label */
  readonly label: string;
  /** Icon name (Ionicons) */
  readonly icon: string;
}

/**
 * Program action after search — create new or claim existing.
 */
export type ProgramAction = 'claim' | 'create';

/**
 * Selected program data from the search step.
 */
export interface SelectedProgramData {
  /** The action taken */
  readonly action: ProgramAction;
  /** Selected or newly created program */
  readonly program: AgentProgramResult;
  /** Coach's role in the program */
  readonly role: CoachProgramRole;
}

// ============================================
// GOALS TYPES
// ============================================

/**
 * A goal the user sets for Agent X.
 */
export interface AgentGoal {
  /** Unique goal identifier */
  readonly id: string;
  /** Goal text */
  readonly text: string;
  /** Whether this is a predefined or custom goal */
  readonly type: 'predefined' | 'custom';
  /** Icon name */
  readonly icon?: string;
  /** Category for the goal */
  readonly category?: AgentGoalCategory;
}

/**
 * Goal categories for grouping.
 */
export type AgentGoalCategory =
  | 'recruiting'
  | 'analytics'
  | 'content'
  | 'communication'
  | 'scouting'
  | 'development';

// ============================================
// CONNECTIONS TYPES
// ============================================

/**
 * A connection suggestion or search result.
 */
export interface AgentConnection {
  /** User ID */
  readonly id: string;
  /** Display name */
  readonly displayName: string;
  /** Profile image URL */
  readonly profileImg?: string | null;
  /** User role (athlete, coach, etc.) */
  readonly role?: string;
  /** Sport */
  readonly sport?: string;
  /** Team name */
  readonly teamName?: string;
  /** Whether already connected */
  readonly isConnected?: boolean;
}

// ============================================
// ONBOARDING STATE
// ============================================

/**
 * Overall agent onboarding state snapshot.
 */
export interface AgentOnboardingState {
  /** Current step */
  readonly currentStep: AgentOnboardingStepId;
  /** Current step index (0-based) */
  readonly currentStepIndex: number;
  /** Total steps */
  readonly totalSteps: number;
  /** Whether onboarding is complete */
  readonly isComplete: boolean;
  /** Whether currently loading/transitioning */
  readonly isLoading: boolean;
  /** Selected program data (coach flow) */
  readonly programData: SelectedProgramData | null;
  /** Selected goals (max 2) */
  readonly goals: readonly AgentGoal[];
  /** Added connections */
  readonly connections: readonly AgentConnection[];
  /** Error state */
  readonly error: string | null;
}

/**
 * Agent onboarding completion payload sent to backend.
 */
export interface AgentOnboardingPayload {
  /** Selected program (coaches) */
  readonly program?: SelectedProgramData;
  /** Selected goals */
  readonly goals: readonly AgentGoal[];
  /** Connection user IDs */
  readonly connectionIds: readonly string[];
  /** Timestamp of completion */
  readonly completedAt: string;
}
