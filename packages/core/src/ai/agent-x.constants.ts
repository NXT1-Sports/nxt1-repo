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
  AgentXAttachmentType,
  ShellCommandCategory,
} from './agent-x.types';

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
    label: 'Discovery',
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
      {
        id: 'cmd-position-board',
        label: 'Position Board',
        subLabel: 'Rank athletes by room or need',
        icon: 'list',
      },
      {
        id: 'cmd-regional-search',
        label: 'Regional Search',
        subLabel: 'Focus on key recruiting territories',
        icon: 'search',
      },
      {
        id: 'cmd-stat-filters',
        label: 'Stat Filters',
        subLabel: 'Surface players by production',
        icon: 'analytics',
      },
      {
        id: 'cmd-new-risers',
        label: 'New Risers',
        subLabel: 'Fast movers worth a fresh look',
        icon: 'trendingUp',
      },
      {
        id: 'cmd-saved-searches',
        label: 'Saved Searches',
        subLabel: 'Reopen your best pipelines quickly',
        icon: 'document',
      },
      {
        id: 'cmd-verified-measurables',
        label: 'Verified Measurables',
        subLabel: 'Filter for confirmed size and testing',
        icon: 'clipboard',
      },
      {
        id: 'cmd-academic-filters',
        label: 'Academic Filters',
        subLabel: 'Find prospects who clear academic bars',
        icon: 'book',
      },
      {
        id: 'cmd-video-ready',
        label: 'Video Ready',
        subLabel: 'Surface athletes with useful film now',
        icon: 'play',
      },
      {
        id: 'cmd-sleepers-board',
        label: 'Sleepers Board',
        subLabel: 'Track underrated names before they pop',
        icon: 'diamond',
      },
      {
        id: 'cmd-transfer-fit-search',
        label: 'Transfer Fit Search',
        subLabel: 'Find portal players by immediate role',
        icon: 'people',
      },
      {
        id: 'cmd-injury-returners',
        label: 'Injury Returners',
        subLabel: 'Spot prospects bouncing back this season',
        icon: 'analytics',
      },
      {
        id: 'cmd-local-targets',
        label: 'Local Targets',
        subLabel: 'Search your region first and faster',
        icon: 'search',
      },
      {
        id: 'cmd-late-bloomers',
        label: 'Late Bloomers',
        subLabel: 'Find upside names still climbing',
        icon: 'trendingUp',
      },
    ],
    scheduledActions: [
      {
        id: 'sched-daily-prospect-scan',
        label: 'Daily Prospect Scan',
        subLabel: 'Surface new prospects matching your criteria',
        icon: 'search',
      },
      {
        id: 'sched-watchlist-update',
        label: 'Weekly Watchlist',
        subLabel: 'Refresh your saved prospect list',
        icon: 'list',
      },
      {
        id: 'sched-portal-alerts',
        label: 'Transfer Portal Alerts',
        subLabel: 'Get notified when new names enter the portal',
        icon: 'trendingUp',
      },
      {
        id: 'sched-region-sweep',
        label: 'Regional Sweep',
        subLabel: 'Scan target regions for missed talent weekly',
        icon: 'analytics',
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
      {
        id: 'cmd-trait-grades',
        label: 'Trait Grades',
        subLabel: 'Break down measurable strengths',
        icon: 'barChart',
      },
      {
        id: 'cmd-projection-summary',
        label: 'Projection Summary',
        subLabel: 'Ceiling, floor, and timeline',
        icon: 'clipboard',
      },
      {
        id: 'cmd-needs-match',
        label: 'Needs Match',
        subLabel: 'See roster fit against team demand',
        icon: 'analytics',
      },
      {
        id: 'cmd-background-notes',
        label: 'Background Notes',
        subLabel: 'Organize intel before offers',
        icon: 'document',
      },
      {
        id: 'cmd-ranking-board',
        label: 'Ranking Board',
        subLabel: 'Stack players into tiers',
        icon: 'list',
      },
      {
        id: 'cmd-athlete-stack',
        label: 'Athlete Stack',
        subLabel: 'Group comparable prospects quickly',
        icon: 'gitCompare',
      },
      {
        id: 'cmd-film-tags',
        label: 'Film Tags',
        subLabel: 'Organize clips by trait and rep type',
        icon: 'play',
      },
      {
        id: 'cmd-athletic-comps',
        label: 'Athletic Comps',
        subLabel: 'Compare movement profiles to similar athletes',
        icon: 'barChart',
      },
      {
        id: 'cmd-grade-sheet',
        label: 'Grade Sheet',
        subLabel: 'Build a clean category-by-category eval',
        icon: 'clipboard',
      },
      {
        id: 'cmd-risk-flags',
        label: 'Risk Flags',
        subLabel: 'Spot concerns before the next move',
        icon: 'shieldCheck',
      },
      {
        id: 'cmd-offer-summary',
        label: 'Offer Summary',
        subLabel: 'Condense why a player is offer-worthy',
        icon: 'document',
      },
      {
        id: 'cmd-live-eval-notes',
        label: 'Live Eval Notes',
        subLabel: 'Log in-person takeaways quickly',
        icon: 'mail',
      },
      {
        id: 'cmd-position-ceiling',
        label: 'Position Ceiling',
        subLabel: 'Project long-term upside by role',
        icon: 'trendingUp',
      },
    ],
    scheduledActions: [
      {
        id: 'sched-eval-batch',
        label: 'Weekly Eval Batch',
        subLabel: 'Generate reports for queued prospects',
        icon: 'clipboard',
      },
      {
        id: 'sched-position-rankings',
        label: 'Position Rankings',
        subLabel: 'Re-rank your board by position bi-weekly',
        icon: 'barChart',
      },
      {
        id: 'sched-film-review',
        label: 'Weekly Film Review',
        subLabel: 'Auto-queue new film for analysis',
        icon: 'play',
      },
      {
        id: 'sched-comparison-refresh',
        label: 'Comparison Refresh',
        subLabel: 'Update side-by-side evals with latest data',
        icon: 'analytics',
      },
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
      {
        id: 'cmd-follow-up-cadence',
        label: 'Follow-Up Cadence',
        subLabel: 'Plan the next touch for each lead',
        icon: 'calendar',
      },
      {
        id: 'cmd-visit-invitations',
        label: 'Visit Invitations',
        subLabel: 'Draft personalized visit outreach',
        icon: 'mail',
      },
      {
        id: 'cmd-coach-notes',
        label: 'Coach Notes',
        subLabel: 'Capture context from each touchpoint',
        icon: 'document',
      },
      {
        id: 'cmd-priority-board',
        label: 'Priority Board',
        subLabel: 'Sort top targets by urgency',
        icon: 'list',
      },
      {
        id: 'cmd-reply-tracker',
        label: 'Reply Tracker',
        subLabel: 'See who responded and who stalled',
        icon: 'analytics',
      },
      {
        id: 'cmd-sequence-builder',
        label: 'Sequence Builder',
        subLabel: 'Design a complete outreach cadence',
        icon: 'mail',
      },
      {
        id: 'cmd-personalization-notes',
        label: 'Personalization Notes',
        subLabel: 'Store details that improve every message',
        icon: 'document',
      },
      {
        id: 'cmd-engagement-score',
        label: 'Engagement Score',
        subLabel: 'See which prospects are leaning in',
        icon: 'analytics',
      },
      {
        id: 'cmd-offer-letter-draft',
        label: 'Offer Letter Draft',
        subLabel: 'Write a cleaner formal outreach note',
        icon: 'mail',
      },
      {
        id: 'cmd-visit-reminders',
        label: 'Visit Reminders',
        subLabel: 'Queue messages ahead of campus visits',
        icon: 'calendar',
      },
      {
        id: 'cmd-parent-outreach',
        label: 'Parent Outreach',
        subLabel: 'Draft respectful family-facing messages',
        icon: 'people',
      },
      {
        id: 'cmd-next-best-action',
        label: 'Next Best Action',
        subLabel: 'Know the right move for each target',
        icon: 'rocket',
      },
      {
        id: 'cmd-pipeline-summary',
        label: 'Pipeline Summary',
        subLabel: 'Condense the whole board into one view',
        icon: 'clipboard',
      },
    ],
    scheduledActions: [
      {
        id: 'sched-email-batch',
        label: 'Weekly Email Batch',
        subLabel: 'Auto-send intro emails to new targets',
        icon: 'mail',
      },
      {
        id: 'sched-follow-up-sweep',
        label: 'Follow-Up Sweep',
        subLabel: "Re-contact prospects who haven't replied",
        icon: 'mail',
      },
      {
        id: 'sched-visit-scheduling',
        label: 'Visit Scheduling',
        subLabel: 'Propose campus visit dates weekly',
        icon: 'calendar',
      },
      {
        id: 'sched-offer-tracker',
        label: 'Offer Tracker',
        subLabel: 'Update offer status and response tracking',
        icon: 'analytics',
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
      {
        id: 'cmd-visit-rules',
        label: 'Visit Rules',
        subLabel: 'Know what is allowed on campus',
        icon: 'school',
      },
      {
        id: 'cmd-transfer-windows',
        label: 'Transfer Windows',
        subLabel: 'Track portal timing by season',
        icon: 'calendar',
      },
      {
        id: 'cmd-communication-log',
        label: 'Communication Log',
        subLabel: 'Audit recruiting touches quickly',
        icon: 'clipboard',
      },
      {
        id: 'cmd-offer-timing',
        label: 'Offer Timing',
        subLabel: 'Check if outreach timing is clean',
        icon: 'analytics',
      },
      {
        id: 'cmd-dead-period-alerts',
        label: 'Dead Period Alerts',
        subLabel: 'Flag dates that change outreach rules',
        icon: 'shieldCheck',
      },
      {
        id: 'cmd-unofficial-visit-check',
        label: 'Unofficial Visit Check',
        subLabel: 'Confirm what is allowed before the trip',
        icon: 'school',
      },
      {
        id: 'cmd-official-visit-check',
        label: 'Official Visit Check',
        subLabel: 'Validate rules for hosted visits',
        icon: 'calendar',
      },
      {
        id: 'cmd-messaging-audit',
        label: 'Messaging Audit',
        subLabel: 'Review if outreach stayed inside policy',
        icon: 'mail',
      },
      {
        id: 'cmd-signing-calendar',
        label: 'Signing Calendar',
        subLabel: 'Track every key compliance date ahead',
        icon: 'calendar',
      },
      {
        id: 'cmd-transfer-rule-check',
        label: 'Transfer Rule Check',
        subLabel: 'Review portal and movement constraints',
        icon: 'shieldCheck',
      },
      {
        id: 'cmd-nil-disclosure',
        label: 'NIL Disclosure',
        subLabel: 'Keep NIL conversations documented correctly',
        icon: 'document',
      },
      {
        id: 'cmd-contact-window',
        label: 'Contact Window',
        subLabel: 'See when coaches can reach out next',
        icon: 'analytics',
      },
      {
        id: 'cmd-document-checklist',
        label: 'Document Checklist',
        subLabel: 'Make sure every required item is covered',
        icon: 'clipboard',
      },
    ],
    scheduledActions: [
      {
        id: 'sched-compliance-check',
        label: 'Weekly Compliance Check',
        subLabel: 'Verify all contact activity is within rules',
        icon: 'shieldCheck',
      },
      {
        id: 'sched-calendar-audit',
        label: 'Calendar Audit',
        subLabel: 'Review upcoming dead periods and windows',
        icon: 'calendar',
      },
      {
        id: 'sched-contact-log',
        label: 'Contact Log Review',
        subLabel: 'Ensure all interactions are documented',
        icon: 'document',
      },
      {
        id: 'sched-nil-updates',
        label: 'NIL Policy Updates',
        subLabel: 'Stay current on state and national NIL rules',
        icon: 'analytics',
      },
    ],
  },
];

// ============================================
// FILE ATTACHMENT CONSTANTS
// ============================================

/**
 * Allowed MIME types for Agent X file attachments.
 */
export const AGENT_X_ALLOWED_MIME_TYPES: readonly string[] = [
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  // Videos
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-ms-wmv',
  'video/webm',
  'video/3gpp',
  'video/3gpp2',
  // Documents
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

/** Maximum number of attachments per message. */
export const AGENT_X_MAX_ATTACHMENTS = 5;

/** Maximum single file size in bytes (20 MB) for non-video files. */
export const AGENT_X_MAX_FILE_SIZE = 20 * 1024 * 1024;

/** Maximum single video file size in bytes (500 MB) — videos upload directly to Firebase Storage. */
export const AGENT_X_MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024;

/**
 * Resolve a MIME type to the high-level `AgentXAttachmentType`.
 */
export function resolveAttachmentType(mimeType: string): AgentXAttachmentType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'text/csv' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
    return 'csv';
  return 'doc';
}

// ============================================
// API CONFIGURATION
// ============================================

/**
 * Agent X API endpoints (relative to base URL).
 */
export const AGENT_X_REQUEST_HEADERS = {
  /** Explicit frontend app origin used when backend is behind a proxy. */
  APP_BASE_URL: 'x-nxt1-app-base-url',
} as const;

export const AGENT_X_ENDPOINTS = {
  /** Chat completion endpoint */
  CHAT: '/agent-x/chat',
  /** Bind a completed background upload to a persisted user message. */
  MESSAGE_ATTACHMENT_SYNC: '/agent-x/messages/attachments/sync',
  /** Resume a yielded job with user input */
  RESUME_JOB: '/agent-x/resume-job',
  /** Upload file attachment for chat (images, docs, PDFs — non-video) */
  UPLOAD: '/agent-x/upload',
  /** Provision a Cloudflare Stream TUS direct upload URL for video files (highlight posts only) */
  CLOUDFLARE_DIRECT_URL: '/upload/cloudflare/direct-url',
  /** Provision a Firebase Storage signed upload URL for Agent X chat video attachments */
  VIDEO_UPLOAD_PROVISION: '/agent-x/upload/video',
  /** Upload a file to the temporary scratch folder (worker output, staged uploads, scraped assets) */
  UPLOAD_TMP: '/agent-x/upload/tmp',
  /** Promote a file from the tmp folder to permanent media storage (copy + delete original) */
  UPLOAD_PROMOTE: '/agent-x/upload/promote',
  /** Get conversation history */
  HISTORY: '/agent-x/history',
  /** Get role-filtered quick tasks */
  TASKS: '/agent-x/tasks',
  /** Clear conversation */
  CLEAR: '/agent-x/clear',
  /** Aggregated dashboard (briefing + playbook + operations) */
  DASHBOARD: '/agent-x/dashboard',
  /** Set or update user goals */
  GOALS: '/agent-x/goals',
  /** Generate or regenerate the weekly playbook */
  PLAYBOOK_GENERATE: '/agent-x/playbook/generate',
  /** Poll status of an asynchronous playbook generation operation */
  PLAYBOOK_GENERATE_STATUS: '/agent-x/playbook/generate/status',
  /** Update the status of a single playbook item */
  PLAYBOOK_ITEM_STATUS: '/agent-x/playbook/item',
  /** Generate or refresh the AI daily briefing */
  BRIEFING_GENERATE: '/agent-x/briefing/generate',
  /** Operations activity log (paginated job history) */
  OPERATIONS_LOG: '/agent-x/operations-log',
  /** Get messages for a specific thread */
  THREAD_MESSAGES: '/agent-x/threads',
  /** Message-level actions base path */
  MESSAGES: '/agent-x/messages',
  /** System health probe (unauthenticated, cached) */
  HEALTH: '/agent-x/health',
  /** Start a live-view browser session */
  LIVE_VIEW_START: '/agent-x/live-view/start',
  /** Navigate a live-view session to a new URL */
  LIVE_VIEW_NAVIGATE: '/agent-x/live-view/navigate',
  /** Refresh the active live-view session page */
  LIVE_VIEW_REFRESH: '/agent-x/live-view/refresh',
  /** Close and clean up a live-view session */
  LIVE_VIEW_CLOSE: '/agent-x/live-view/close',
  /** Approval request resolution base path */
  APPROVALS: '/agent-x/approvals',
  /** Mark an active goal as complete (POST /:goalId/complete) */
  GOAL_COMPLETE: '/agent-x/goals',
  /** Paginated history of completed goals */
  GOAL_HISTORY: '/agent-x/goal-history',
  /**
   * Resolve pending attachment stubs after upload completes.
   * `POST /agent-x/chat/pending-attachments/:operationId`
   */
  PENDING_ATTACHMENTS_RESOLVE: '/agent-x/chat/pending-attachments',
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
