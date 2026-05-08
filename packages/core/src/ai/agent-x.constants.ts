/**
 * @fileoverview Agent X Constants
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * Configuration constants for Agent X AI assistant.
 * 100% portable - no platform dependencies.
 */

import type { AgentXConfig, AgentXModeConfig, AgentXAttachmentType } from './agent-x.types';

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
  /** Submit a semantic thread action (ask_user reply / approval decision) */
  THREAD_ACTIONS: '/agent-x/threads',
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
