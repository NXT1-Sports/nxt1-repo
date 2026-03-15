/**
 * @fileoverview Agent X Constants
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * Configuration constants for Agent X AI assistant.
 * 100% portable - no platform dependencies.
 */

import type {
  AgentXConfig,
  AgentXModeConfig,
  AgentXQuickTask,
  ShellCommandCategory,
  ShellBriefingInsight,
  ShellWeeklyPlaybookItem,
  ShellActiveOperation,
  ShellContentForRole,
} from './agent-x.types';
import { isTeamRole, USER_ROLES } from '../constants/user.constants';

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
// SHELL CONTENT BY ROLE CATEGORY
// ============================================

/**
 * Shell coordinator categories for ATHLETE-based roles (athlete, parent).
 * Displayed in the 2×2 grid on the Agent X command center.
 */
export const ATHLETE_COORDINATORS: readonly ShellCommandCategory[] = [
  {
    id: 'coord-recruiting',
    label: 'Recruiting Coordinator',
    icon: 'graduationCap',
    description:
      "I'm your Recruiting Coordinator. I help you find the right programs, draft coach outreach, and stay on top of your recruiting timeline.",
    commands: [
      {
        id: 'cmd-colleges',
        label: 'Find Programs',
        subLabel: 'Matched to your GPA & film',
        icon: 'search',
      },
      { id: 'cmd-email', label: 'Draft Coach Email', subLabel: 'Templates ready', icon: 'mail' },
      {
        id: 'cmd-timeline',
        label: 'My Timeline',
        subLabel: 'Next: NCAA Dead Period',
        icon: 'calendar',
      },
      {
        id: 'cmd-eligibility',
        label: 'Eligibility Check',
        subLabel: 'Verify NCAA/NAIA status',
        icon: 'shieldCheck',
      },
    ],
  },
  {
    id: 'coord-media',
    label: 'Media Coordinator',
    icon: 'sparkles',
    description:
      "I'm your Media Coordinator. I can help you create posts, build highlight reels, and develop your brand strategy.",
    commands: [
      { id: 'cmd-post', label: 'Create Post', subLabel: 'Trending: #GameDay', icon: 'plus' },
      {
        id: 'cmd-highlight',
        label: 'Highlight Reel',
        subLabel: 'New clips ready',
        icon: 'videocam',
      },
      {
        id: 'cmd-brand',
        label: 'Brand Strategy',
        subLabel: 'AI-powered growth plan',
        icon: 'rocket',
      },
    ],
  },
  {
    id: 'coord-scout',
    label: 'Scout Coordinator',
    icon: 'barChart',
    description:
      "I'm your Scout Coordinator. I generate scout reports, analyze game film, and track your stat trends over time.",
    commands: [
      { id: 'cmd-scout', label: 'Scout Report', subLabel: 'Updated recently', icon: 'clipboard' },
      { id: 'cmd-analyze', label: 'Analyze Film', subLabel: 'Upload Hudl link', icon: 'play' },
      {
        id: 'cmd-trends',
        label: 'Stat Trends',
        subLabel: 'Week-over-week growth',
        icon: 'trendingUp',
      },
    ],
  },
  {
    id: 'coord-academics',
    label: 'Academics Coordinator',
    icon: 'book',
    description:
      "I'm your Academics Coordinator. I help you track your GPA, check eligibility requirements, and find test prep resources.",
    commands: [
      {
        id: 'cmd-gpa',
        label: 'GPA Tracker',
        subLabel: 'Keep eligibility current',
        icon: 'clipboard',
      },
      {
        id: 'cmd-eligibility-check',
        label: 'Eligibility',
        subLabel: 'NCAA/NAIA status',
        icon: 'shieldCheck',
      },
      { id: 'cmd-test-prep', label: 'Test Prep', subLabel: 'SAT/ACT resources', icon: 'document' },
    ],
  },
];

/**
 * Shell coordinator categories for TEAM-based roles (coach, director).
 * Coach/director users see team management, roster, and scouting tools
 * instead of the athlete-centric recruiting/academics coordinators.
 */
export const TEAM_COORDINATORS: readonly ShellCommandCategory[] = [
  {
    id: 'coord-roster',
    label: 'Roster Manager',
    icon: 'people',
    description:
      "I'm your Roster Manager. I help you manage your roster, identify gaps, and build your depth chart.",
    commands: [
      { id: 'cmd-roster', label: 'View Roster', subLabel: 'Manage team athletes', icon: 'people' },
      {
        id: 'cmd-add-athlete',
        label: 'Add Athlete',
        subLabel: 'Invite or create profile',
        icon: 'personAdd',
      },
      {
        id: 'cmd-roster-gaps',
        label: 'Roster Gaps',
        subLabel: 'AI-identified needs',
        icon: 'analytics',
      },
      { id: 'cmd-depth-chart', label: 'Depth Chart', subLabel: 'Position analysis', icon: 'list' },
    ],
  },
  {
    id: 'coord-scouting',
    label: 'Scouting Coordinator',
    icon: 'search',
    description:
      "I'm your Scouting Coordinator. I help you discover recruits, manage your prospect board, and generate AI evaluations.",
    commands: [
      {
        id: 'cmd-find-recruits',
        label: 'Find Recruits',
        subLabel: 'Search athlete database',
        icon: 'search',
      },
      {
        id: 'cmd-prospect-board',
        label: 'Prospect Board',
        subLabel: 'Tracked prospects',
        icon: 'clipboard',
      },
      {
        id: 'cmd-evaluate',
        label: 'Evaluate Prospect',
        subLabel: 'AI scout report',
        icon: 'barChart',
      },
    ],
  },
  {
    id: 'coord-team-media',
    label: 'Media Coordinator',
    icon: 'sparkles',
    description:
      "I'm your Media Coordinator. I help you create team posts, generate branded graphics, and compile highlight reels.",
    commands: [
      { id: 'cmd-team-post', label: 'Team Post', subLabel: 'Share team updates', icon: 'plus' },
      {
        id: 'cmd-team-graphics',
        label: 'Team Graphics',
        subLabel: 'Branded visuals',
        icon: 'image',
      },
      {
        id: 'cmd-team-highlight',
        label: 'Team Highlights',
        subLabel: 'Compile reels',
        icon: 'videocam',
      },
    ],
  },
  {
    id: 'coord-recruiting',
    label: 'Recruiting Coordinator',
    icon: 'graduationCap',
    description:
      "I'm your Recruiting Coordinator. I help you build recruiting plans, draft outreach, and manage compliance.",
    commands: [
      {
        id: 'cmd-recruiting-plan',
        label: 'Recruiting Plan',
        subLabel: 'Build season strategy',
        icon: 'calendar',
      },
      {
        id: 'cmd-contact-recruits',
        label: 'Contact Recruits',
        subLabel: 'Draft outreach messages',
        icon: 'mail',
      },
      {
        id: 'cmd-target-class',
        label: 'Target Class',
        subLabel: 'Set class targets',
        icon: 'people',
      },
      {
        id: 'cmd-compliance',
        label: 'Compliance Check',
        subLabel: 'NCAA/NAIA contact rules',
        icon: 'shieldCheck',
      },
    ],
  },
];

/**
 * Shell coordinator categories for RECRUITER role.
 * Recruiter users see prospect discovery and evaluation tools.
 */
export const RECRUITER_COORDINATORS: readonly ShellCommandCategory[] = [
  {
    id: 'coord-prospect-search',
    label: 'Prospect Search',
    icon: 'search',
    description:
      "I'm your Prospect Search coordinator. I help you search athletes, explore the transfer portal, and discover hidden gems.",
    commands: [
      {
        id: 'cmd-search-athletes',
        label: 'Search Athletes',
        subLabel: 'Filter by position & stats',
        icon: 'search',
      },
      {
        id: 'cmd-transfer-portal',
        label: 'Transfer Portal',
        subLabel: 'Available transfers',
        icon: 'people',
      },
      {
        id: 'cmd-hidden-gems',
        label: 'Hidden Gems',
        subLabel: 'AI-discovered talent',
        icon: 'diamond',
      },
    ],
  },
  {
    id: 'coord-evaluation',
    label: 'Evaluation Center',
    icon: 'barChart',
    description:
      "I'm your Evaluation Center coordinator. I generate scout reports, run side-by-side comparisons, and analyze game film.",
    commands: [
      {
        id: 'cmd-scout-report',
        label: 'Scout Reports',
        subLabel: 'AI evaluations',
        icon: 'clipboard',
      },
      {
        id: 'cmd-compare',
        label: 'Compare Athletes',
        subLabel: 'Side-by-side analysis',
        icon: 'gitCompare',
      },
      { id: 'cmd-film-review', label: 'Film Review', subLabel: 'Analyze game film', icon: 'play' },
    ],
  },
  {
    id: 'coord-outreach',
    label: 'Outreach Coordinator',
    icon: 'mail',
    description:
      "I'm your Outreach Coordinator. I help you draft outreach messages, plan scholarship allocations, and manage your recruiting pipeline.",
    commands: [
      {
        id: 'cmd-draft-offer',
        label: 'Draft Outreach',
        subLabel: 'Contact athletes',
        icon: 'mail',
      },
      {
        id: 'cmd-scholarship',
        label: 'Scholarship Planning',
        subLabel: 'Allocation analysis',
        icon: 'school',
      },
      {
        id: 'cmd-pipeline',
        label: 'Recruiting Pipeline',
        subLabel: 'Track prospects',
        icon: 'funnel',
      },
    ],
  },
  {
    id: 'coord-compliance',
    label: 'Compliance',
    icon: 'shieldCheck',
    description:
      "I'm your Compliance coordinator. I help you navigate contact rules, verify eligibility, and stay current on NIL guidelines.",
    commands: [
      {
        id: 'cmd-contact-rules',
        label: 'Contact Rules',
        subLabel: 'Dead period checks',
        icon: 'calendar',
      },
      {
        id: 'cmd-eligibility-verify',
        label: 'Eligibility',
        subLabel: 'Verify prospect eligibility',
        icon: 'checkmarkCircle',
      },
      {
        id: 'cmd-nil-rules',
        label: 'NIL Guidelines',
        subLabel: 'Current regulations',
        icon: 'document',
      },
    ],
  },
];

/**
 * Daily briefing insights for ATHLETE-based roles.
 */
export const ATHLETE_BRIEFING_INSIGHTS: readonly ShellBriefingInsight[] = [
  {
    id: 'bi-1',
    text: 'Your Scout Report was updated with new metrics from your last synced game film.',
    icon: 'clipboard',
    type: 'success',
  },
  {
    id: 'bi-2',
    text: '3 college programs viewed your profile this week. Two are D-I schools.',
    icon: 'eye',
    type: 'info',
  },
  {
    id: 'bi-3',
    text: 'Your GPA data is 30 days old. Sync your academic portal to stay current.',
    icon: 'alertCircle',
    type: 'warning',
  },
];

/**
 * Daily briefing insights for TEAM-based roles (coach, director).
 */
export const TEAM_BRIEFING_INSIGHTS: readonly ShellBriefingInsight[] = [
  {
    id: 'bi-1',
    text: 'Your team roster has 3 athletes with incomplete profiles. Nudge them to update.',
    icon: 'people',
    type: 'warning',
  },
  {
    id: 'bi-2',
    text: '5 new prospect recommendations match your recruiting criteria this week.',
    icon: 'search',
    type: 'info',
  },
  {
    id: 'bi-3',
    text: 'Team performance analytics updated — season averages across 12 tracked athletes.',
    icon: 'trendingUp',
    type: 'success',
  },
];

/**
 * Daily briefing insights for RECRUITER role.
 */
export const RECRUITER_BRIEFING_INSIGHTS: readonly ShellBriefingInsight[] = [
  {
    id: 'bi-1',
    text: '7 new athletes match your program criteria. Review the prospect board.',
    icon: 'search',
    type: 'info',
  },
  {
    id: 'bi-2',
    text: '2 prospects you contacted responded. Check your messages.',
    icon: 'mail',
    type: 'success',
  },
  {
    id: 'bi-3',
    text: 'NCAA dead period starts next week. Plan your outreach accordingly.',
    icon: 'alertCircle',
    type: 'warning',
  },
];

/**
 * Briefing preview text by role category.
 */
export const BRIEFING_PREVIEW_TEXT = {
  athlete:
    "I've reviewed your latest data, including {count} new updates to your profile and Scout Report.",
  team: "I've reviewed your team's latest data, including {count} updates to your roster and scouting pipeline.",
  recruiter:
    "I've reviewed your pipeline, including {count} new prospect updates and program matches.",
} as const;

/**
 * Weekly playbook items for ATHLETE-based roles.
 */
export const ATHLETE_WEEKLY_PLAYBOOK: readonly ShellWeeklyPlaybookItem[] = [
  {
    id: 'wp-1',
    weekLabel: 'Mon',
    title: 'Finalize Recruiting Storyline',
    summary: 'Align your profile, headline metrics, and highlight context for recruiters.',
    details:
      'Agent X prepared a recruiting narrative from your latest film, stats, and profile views.',
    actionLabel: 'Review Draft',
    status: 'in-progress',
    goal: { id: 'goal-1', label: 'D1 Recruitment' },
  },
  {
    id: 'wp-2',
    weekLabel: 'Wed',
    title: 'Publish Midweek Performance Post',
    summary: 'Share your latest clip + stat proof point to keep momentum.',
    details: 'Agent X generated copy and media options optimized for engagement windows.',
    actionLabel: 'Publish Post',
    status: 'pending',
    goal: { id: 'goal-2', label: 'Grow Brand' },
  },
  {
    id: 'goal-setup',
    weekLabel: '',
    title: 'Set Up Goals',
    summary: 'Tell Agent X your season goals so your weekly playbook stays on target.',
    details: 'Agent X will personalize your weekly priorities based on your goals.',
    actionLabel: 'Set Up Goals',
    status: 'pending',
  },
];

/**
 * Weekly playbook items for TEAM-based roles (coach, director).
 */
export const TEAM_WEEKLY_PLAYBOOK: readonly ShellWeeklyPlaybookItem[] = [
  {
    id: 'wp-1',
    weekLabel: 'Mon',
    title: 'Review Roster Updates',
    summary: 'Check athlete profiles for new film, stats, and academic changes.',
    details: 'Agent X flagged 3 athletes with profile updates that need your review.',
    actionLabel: 'Review Roster',
    status: 'in-progress',
    goal: { id: 'goal-1', label: 'Team Management' },
  },
  {
    id: 'wp-2',
    weekLabel: 'Wed',
    title: 'Scouting Pipeline Check',
    summary: 'Review new prospect matches and update your recruiting board.',
    details: 'Agent X identified 5 new prospects that match your open roster needs.',
    actionLabel: 'View Prospects',
    status: 'pending',
    goal: { id: 'goal-2', label: 'Recruiting' },
  },
  {
    id: 'wp-3',
    weekLabel: 'Fri',
    title: 'Publish Team Update',
    summary: 'Share team highlights and achievements from the week.',
    details: 'Agent X compiled your team performance highlights into a shareable post.',
    actionLabel: 'Publish Update',
    status: 'pending',
    goal: { id: 'goal-3', label: 'Team Brand' },
  },
  {
    id: 'goal-setup',
    weekLabel: '',
    title: 'Set Season Goals',
    summary: 'Tell Agent X your team goals so your weekly playbook stays on target.',
    details:
      'Agent X will personalize your weekly priorities based on recruiting targets and season objectives.',
    actionLabel: 'Set Up Goals',
    status: 'pending',
  },
];

/**
 * Active operations mock data for ATHLETE-based roles.
 */
export const ATHLETE_ACTIVE_OPERATIONS: readonly ShellActiveOperation[] = [
  { id: 'op-1', label: 'Analyzing game film...', progress: 45, icon: 'play', status: 'processing' },
  { id: 'op-2', label: 'Recruiter emails sent', progress: 100, icon: 'mail', status: 'complete' },
  { id: 'op-3', label: 'Highlight reel export', progress: 62, icon: 'videocam', status: 'error' },
];

/**
 * Active operations mock data for TEAM-based roles (coach, director).
 */
export const TEAM_ACTIVE_OPERATIONS: readonly ShellActiveOperation[] = [
  {
    id: 'op-1',
    label: 'Syncing roster profiles...',
    progress: 65,
    icon: 'people',
    status: 'processing',
  },
  {
    id: 'op-2',
    label: 'Prospect report generated',
    progress: 100,
    icon: 'clipboard',
    status: 'complete',
  },
];

/**
 * Resolve the correct coordinators, briefing, playbook, and operations for a given user role.
 * Central dispatcher — components call this once instead of duplicating role logic.
 */
export function getShellContentForRole(role: string | null | undefined): ShellContentForRole {
  const isTeam = isTeamRole(role);
  const isRecruiterRole = role === USER_ROLES.RECRUITER;

  return {
    coordinators: isTeam
      ? TEAM_COORDINATORS
      : isRecruiterRole
        ? RECRUITER_COORDINATORS
        : ATHLETE_COORDINATORS,
    briefingInsights: isTeam
      ? TEAM_BRIEFING_INSIGHTS
      : isRecruiterRole
        ? RECRUITER_BRIEFING_INSIGHTS
        : ATHLETE_BRIEFING_INSIGHTS,
    briefingPreviewText: isTeam
      ? BRIEFING_PREVIEW_TEXT.team
      : isRecruiterRole
        ? BRIEFING_PREVIEW_TEXT.recruiter
        : BRIEFING_PREVIEW_TEXT.athlete,
    weeklyPlaybook: isTeam ? TEAM_WEEKLY_PLAYBOOK : ATHLETE_WEEKLY_PLAYBOOK,
    activeOperations: isTeam ? TEAM_ACTIVE_OPERATIONS : ATHLETE_ACTIVE_OPERATIONS,
  };
}

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

// ============================================
// CACHE CONFIGURATION
// ============================================

/**
 * Cache key prefixes for Agent X.
 */
export const AGENT_X_CACHE_KEYS = {
  /** Conversation history cache prefix */
  HISTORY: 'agent-x:history:',
  /** Quick tasks cache key */
  TASKS: 'agent-x:tasks:',
  /** User session cache */
  SESSION: 'agent-x:session:',
} as const;

/**
 * Cache TTL values (in milliseconds).
 */
export const AGENT_X_CACHE_TTL = {
  /** History: 1 minute (frequently updated) */
  HISTORY: 60_000,
  /** Tasks: 15 minutes (rarely changes per role) */
  TASKS: 15 * 60_000,
  /** Session: 5 minutes */
  SESSION: 5 * 60_000,
} as const;
