/**
 * @fileoverview Agent X Onboarding Constants
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * Configuration constants for the Agent X onboarding flow.
 * 100% portable — no platform dependencies.
 */

import type {
  AgentOnboardingStep,
  AgentGoal,
  CoachRoleOption,
  AgentGoalCategory,
} from './agent-onboarding.types';

// ============================================
// STEP CONFIGURATION
// ============================================

/**
 * All onboarding steps in order.
 */
export const AGENT_ONBOARDING_STEPS: readonly AgentOnboardingStep[] = [
  {
    id: 'welcome',
    title: "Let's Get Your Agent Started",
    subtitle: "Agent X is your AI-powered command center. Let's set it up.",
    order: 0,
    skippable: false,
  },
  {
    id: 'program-search',
    title: 'Find Your Program',
    subtitle: 'Search for your team or create a new one.',
    order: 1,
    skippable: false,
  },
  {
    id: 'goals',
    title: 'Set Your Goals',
    subtitle: 'What should Agent X focus on? Pick up to two.',
    order: 2,
    skippable: false,
  },
  {
    id: 'connections',
    title: 'Add Connections',
    subtitle: 'Build your network so Agent X can work smarter.',
    order: 3,
    skippable: true,
  },
  {
    id: 'loading',
    title: 'Initializing Agent X',
    subtitle: 'Setting up your personalized AI assistant...',
    order: 4,
    skippable: false,
  },
] as const;

/**
 * Maximum number of goals a user can select.
 */
export const AGENT_MAX_GOALS = 2;

/**
 * Minimum number of goals required to proceed.
 */
export const AGENT_MIN_GOALS = 1;

// ============================================
// COACH ROLE OPTIONS
// ============================================

/**
 * Available coach roles within a program.
 */
export const COACH_ROLE_OPTIONS: readonly CoachRoleOption[] = [
  {
    id: 'head-coach',
    label: 'Head Coach',
    icon: 'trophy-outline',
  },
  {
    id: 'assistant-coach',
    label: 'Assistant Coach',
    icon: 'people-outline',
  },
  {
    id: 'coordinator',
    label: 'Coordinator',
    icon: 'git-network-outline',
  },
  {
    id: 'position-coach',
    label: 'Position Coach',
    icon: 'body-outline',
  },
  {
    id: 'strength-coach',
    label: 'Strength & Conditioning',
    icon: 'barbell-outline',
  },
  {
    id: 'recruiting-coordinator',
    label: 'Recruiting Coordinator',
    icon: 'search-outline',
  },
] as const;

// ============================================
// PREDEFINED GOALS
// ============================================

/**
 * Goal categories with display metadata.
 */
export const AGENT_GOAL_CATEGORIES: readonly {
  id: AgentGoalCategory;
  label: string;
  icon: string;
}[] = [
  { id: 'recruiting', label: 'Recruiting', icon: 'search-outline' },
  { id: 'analytics', label: 'Analytics', icon: 'stats-chart-outline' },
  { id: 'content', label: 'Content', icon: 'image-outline' },
  { id: 'communication', label: 'Communication', icon: 'mail-outline' },
  { id: 'scouting', label: 'Scouting', icon: 'eye-outline' },
  { id: 'development', label: 'Development', icon: 'fitness-outline' },
] as const;

/**
 * Predefined goals for coaches.
 */
export const COACH_PREDEFINED_GOALS: readonly AgentGoal[] = [
  {
    id: 'recruit-top-talent',
    text: 'Find and recruit top talent for my program',
    type: 'predefined',
    icon: 'search-outline',
    category: 'recruiting',
  },
  {
    id: 'automate-outreach',
    text: 'Automate recruiting emails and outreach',
    type: 'predefined',
    icon: 'mail-outline',
    category: 'communication',
  },
  {
    id: 'analyze-opponents',
    text: 'Analyze opponents and game film',
    type: 'predefined',
    icon: 'videocam-outline',
    category: 'analytics',
  },
  {
    id: 'create-graphics',
    text: 'Create professional recruiting graphics',
    type: 'predefined',
    icon: 'image-outline',
    category: 'content',
  },
  {
    id: 'scout-prospects',
    text: 'Scout and evaluate prospective athletes',
    type: 'predefined',
    icon: 'eye-outline',
    category: 'scouting',
  },
  {
    id: 'track-roster',
    text: 'Track roster development and player progress',
    type: 'predefined',
    icon: 'trending-up-outline',
    category: 'development',
  },
  {
    id: 'manage-schedule',
    text: 'Manage team schedule and logistics',
    type: 'predefined',
    icon: 'calendar-outline',
    category: 'development',
  },
  {
    id: 'build-brand',
    text: 'Build program brand and social presence',
    type: 'predefined',
    icon: 'megaphone-outline',
    category: 'content',
  },
] as const;

/**
 * Predefined goals for athletes.
 */
export const ATHLETE_PREDEFINED_GOALS: readonly AgentGoal[] = [
  {
    id: 'get-recruited',
    text: 'Get recruited by college programs',
    type: 'predefined',
    icon: 'school-outline',
    category: 'recruiting',
  },
  {
    id: 'create-highlights',
    text: 'Create standout highlight reels',
    type: 'predefined',
    icon: 'film-outline',
    category: 'content',
  },
  {
    id: 'connect-coaches',
    text: 'Connect with college coaches',
    type: 'predefined',
    icon: 'people-outline',
    category: 'communication',
  },
  {
    id: 'track-progress',
    text: 'Track my athletic development',
    type: 'predefined',
    icon: 'trending-up-outline',
    category: 'development',
  },
  {
    id: 'build-profile',
    text: 'Build a professional athlete profile',
    type: 'predefined',
    icon: 'person-outline',
    category: 'content',
  },
  {
    id: 'find-colleges',
    text: 'Find colleges that match my goals',
    type: 'predefined',
    icon: 'compass-outline',
    category: 'recruiting',
  },
] as const;

// ============================================
// LOADING MESSAGES
// ============================================

/**
 * Sequential loading messages shown during the boot-up animation.
 */
export const AGENT_LOADING_MESSAGES: readonly string[] = [
  'Initializing Agent X...',
  'Analyzing your goals...',
  'Configuring AI models...',
  'Loading recruiting database...',
  'Calibrating sport intelligence...',
  'Building your personalized dashboard...',
  'Agent X is ready.',
] as const;

/**
 * Loading message interval in milliseconds.
 */
export const AGENT_LOADING_MESSAGE_INTERVAL = 800;

/**
 * Total loading duration in milliseconds.
 */
export const AGENT_LOADING_TOTAL_DURATION = 5600;

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Agent onboarding API endpoints.
 */
export const AGENT_ONBOARDING_ENDPOINTS = {
  /** Complete onboarding */
  COMPLETE: '/api/v1/agent-x/onboarding/complete',
  /** Check onboarding status */
  STATUS: '/api/v1/agent-x/onboarding/status',
  /** Search programs */
  SEARCH_PROGRAMS: '/api/v1/team/search',
  /** Create program */
  CREATE_PROGRAM: '/api/v1/team/create',
  /** Claim program */
  CLAIM_PROGRAM: '/api/v1/team/claim',
  /** Search connections */
  SEARCH_CONNECTIONS: '/api/v1/users/search',
  /** Get suggested connections */
  SUGGESTED_CONNECTIONS: '/api/v1/users/suggestions',
} as const;
