/**
 * @fileoverview Agent X Constants
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * Configuration constants for Agent X AI assistant.
 * 100% portable - no platform dependencies.
 */

import type { AgentXConfig, AgentXModeConfig, AgentXQuickTask } from './agent-x.types';

// ============================================
// CONFIGURATION
// ============================================

/**
 * Default Agent X configuration.
 */
export const AGENT_X_CONFIG: AgentXConfig = {
  /** Keep last 20 messages for context */
  maxHistoryLength: 20,
  /** 1000 character input limit */
  maxInputLength: 1000,
  /** 30 second timeout */
  timeoutMs: 30_000,
  /** Enable typing dots animation */
  enableTypingAnimation: true,
  /** Rotating welcome titles */
  welcomeTitles: [
    'What can I help with?',
    'Ready to assist you',
    'Ask me anything',
    'Your AI recruiting assistant',
  ],
  /** Rotate title every 4 seconds */
  titleRotationMs: 4000,
} as const;

// ============================================
// MODE CONFIGURATIONS
// ============================================

/**
 * Available Agent X modes with display configuration.
 */
export const AGENT_X_MODES: readonly AgentXModeConfig[] = [
  {
    id: 'highlights',
    label: 'Highlights',
    description: 'AI-powered highlight reel creation and analysis',
  },
  {
    id: 'graphics',
    label: 'Graphics',
    description: 'Generate professional sports graphics',
  },
  {
    id: 'recruiting',
    label: 'Recruiting',
    description: 'College matching and recruiting guidance',
  },
  {
    id: 'evaluation',
    label: 'Evaluation',
    description: 'Performance analysis and skill evaluation',
  },
] as const;

/**
 * Default selected mode.
 */
export const AGENT_X_DEFAULT_MODE = 'highlights' as const;

// ============================================
// QUICK TASKS BY CATEGORY
// ============================================

/**
 * Quick tasks for athletes.
 */
export const ATHLETE_QUICK_TASKS: readonly AgentXQuickTask[] = [
  {
    id: 'college-match',
    title: 'Find My Best College Matches',
    description: 'Get personalized college recommendations',
    icon: 'school-outline',
    prompt: 'Help me find college programs that match my athletic profile and academic goals.',
    category: 'athlete',
  },
  {
    id: 'improve-profile',
    title: 'Improve My Profile',
    description: 'Get tips to stand out to recruiters',
    icon: 'person-outline',
    prompt:
      'Analyze my profile and give me specific tips to make it more attractive to college coaches.',
    category: 'athlete',
  },
  {
    id: 'draft-email',
    title: 'Draft Recruiting Email',
    description: 'Create a professional outreach email',
    icon: 'mail-outline',
    prompt: 'Help me write a professional email to introduce myself to college coaches.',
    category: 'athlete',
  },
  {
    id: 'recruiting-timeline',
    title: 'My Recruiting Timeline',
    description: 'Create a personalized action plan',
    icon: 'stats-chart-outline',
    prompt: 'Create a recruiting timeline and action plan based on my graduation year.',
    category: 'athlete',
  },
] as const;

/**
 * Quick tasks for coaches.
 */
export const COACH_QUICK_TASKS: readonly AgentXQuickTask[] = [
  {
    id: 'find-recruits',
    title: 'Find Top Recruits',
    description: 'Discover athletes for your program',
    icon: 'search-outline',
    prompt: 'Help me find top recruits that would be a good fit for my team.',
    category: 'coach',
  },
  {
    id: 'team-analytics',
    title: 'Team Analytics',
    description: 'Analyze your roster and needs',
    icon: 'stats-chart-outline',
    prompt: 'Analyze my team roster and help identify areas where we need to recruit.',
    category: 'coach',
  },
  {
    id: 'recruiting-strategy',
    title: 'Recruiting Strategy',
    description: 'Build an effective recruiting plan',
    icon: 'football-outline',
    prompt: 'Help me develop a comprehensive recruiting strategy for the upcoming season.',
    category: 'coach',
  },
  {
    id: 'prospect-evaluation',
    title: 'Evaluate Prospects',
    description: 'Get AI-powered prospect insights',
    icon: 'people-outline',
    prompt: 'Help me evaluate and compare prospects I am considering for recruitment.',
    category: 'coach',
  },
] as const;

/**
 * Quick tasks for college programs.
 */
export const COLLEGE_QUICK_TASKS: readonly AgentXQuickTask[] = [
  {
    id: 'roster-needs',
    title: 'Roster Analysis',
    description: 'Identify gaps in your roster',
    icon: 'people-outline',
    prompt: 'Analyze our current roster and help identify position needs for next season.',
    category: 'college',
  },
  {
    id: 'transfer-portal',
    title: 'Transfer Portal Search',
    description: 'Find transfer candidates',
    icon: 'search-outline',
    prompt: 'Help me find transfer portal candidates that fit our program needs.',
    category: 'college',
  },
  {
    id: 'scholarship-planning',
    title: 'Scholarship Planning',
    description: 'Optimize scholarship allocation',
    icon: 'school-outline',
    prompt: 'Help me plan our scholarship allocation for the upcoming recruiting class.',
    category: 'college',
  },
  {
    id: 'compliance-check',
    title: 'Compliance Assistant',
    description: 'NCAA compliance guidance',
    icon: 'checkmark-circle-outline',
    prompt: 'Help me understand NCAA recruiting rules and ensure compliance.',
    category: 'college',
  },
] as const;

/**
 * All quick tasks combined.
 */
export const ALL_QUICK_TASKS: readonly AgentXQuickTask[] = [
  ...ATHLETE_QUICK_TASKS,
  ...COACH_QUICK_TASKS,
  ...COLLEGE_QUICK_TASKS,
] as const;

// ============================================
// API CONFIGURATION
// ============================================

/**
 * Agent X API endpoints (relative to base URL).
 */
export const AGENT_X_ENDPOINTS = {
  /** Chat completion endpoint */
  CHAT: '/api/v1/agent-x/chat',
  /** Get quick tasks endpoint */
  TASKS: '/api/v1/agent-x/tasks',
  /** Get conversation history */
  HISTORY: '/api/v1/agent-x/history',
  /** Clear conversation */
  CLEAR: '/api/v1/agent-x/clear',
} as const;

/**
 * Rate limiting configuration.
 */
export const AGENT_X_RATE_LIMITS = {
  /** Free tier: requests per minute */
  FREE_RPM: 5,
  /** Premium tier: requests per minute */
  PREMIUM_RPM: 30,
  /** Free tier: requests per day */
  FREE_RPD: 50,
  /** Premium tier: requests per day */
  PREMIUM_RPD: 500,
} as const;
