/**
 * @fileoverview Agentic Engine — Constants
 * @module @nxt1/core/ai
 *
 * Shared constants for the Agent X orchestration engine.
 * Sub-agent descriptors, model routing defaults, guardrail names,
 * tool categories, and job queue configuration.
 *
 * 100% Portable — Zero framework dependencies.
 */

import type {
  AgentDescriptor,
  AgentIdentifier,
  ModelRoutingConfig,
  GuardrailDescriptor,
} from './agent.types';

export const COORDINATOR_AGENT_IDS = [
  'admin_coordinator',
  'brand_coordinator',
  'data_coordinator',
  'strategy_coordinator',
  'recruiting_coordinator',
  'performance_coordinator',
] as const;

export type CoordinatorAgentIdentifier = (typeof COORDINATOR_AGENT_IDS)[number];

// ─── Sub-Agent Registry ─────────────────────────────────────────────────────

export const AGENT_DESCRIPTORS: Record<AgentIdentifier, AgentDescriptor> = {
  router: {
    id: 'router',
    name: 'Chief of Staff',
    description:
      'Master orchestrator that classifies user intent and delegates tasks to the correct AI coordinator.',
    capabilities: ['intent_classification', 'delegation'],
  },
  admin_coordinator: {
    id: 'admin_coordinator',
    name: 'Admin Coordinator',
    icon: 'shield-checkmark',
    description:
      'Handles operational administration, compliance guardrails, scheduling constraints, policy enforcement, and structured workflow governance across Agent X.',
    capabilities: [
      'operations_governance',
      'policy_enforcement',
      'compliance_review',
      'eligibility_verification',
      'visit_scheduling',
      'workflow_administration',
    ],
  },
  brand_coordinator: {
    id: 'brand_coordinator',
    name: 'Brand Coordinator',
    icon: 'color-wand',
    description:
      'Generates graphics, highlight assets, promo materials, social content, and branded creative deliverables for athletes, teams, and programs.',
    capabilities: [
      'graphic_generation',
      'highlight_reel',
      'promo_design',
      'brand_asset',
      'social_media_content',
      'video_editing',
      'nil_branding',
    ],
  },
  data_coordinator: {
    id: 'data_coordinator',
    name: 'Data Coordinator',
    icon: 'server',
    description:
      'Ingests, extracts, and normalizes data from external platforms. Scrapes linked athletic profiles (MaxPreps, Hudl, 247Sports), parses roster pages, resolves player identities, and writes structured data to user profiles and team rosters.',
    capabilities: [
      'profile_scraping',
      'roster_ingestion',
      'data_extraction',
      'identity_resolution',
      'platform_sync',
      'csv_parsing',
      'stat_import',
    ],
  },
  strategy_coordinator: {
    id: 'strategy_coordinator',
    name: 'Strategy Coordinator',
    icon: 'compass',
    description:
      'Drives strategic planning, goal prioritization, and weekly gameplanning for athletes, coaches, and programs. Use ONLY for requests requiring an actual strategic plan, goal breakdown, or weekly priority list. Do NOT use for greetings, identity questions, platform explanations, or general conversation — the Chief of Staff handles those directly.',
    capabilities: [
      'strategic_planning',
      'goal_prioritization',
      'game_planning',
      'sports_guidance',
      'google_workspace',
    ],
  },
  recruiting_coordinator: {
    id: 'recruiting_coordinator',
    name: 'Recruiting Coordinator',
    icon: 'mail',
    description:
      'Manages recruiting outreach, drafts emails to college coaches, builds target lists, tracks responses, and runs outreach campaigns.',
    capabilities: [
      'email_drafting',
      'coach_outreach',
      'college_search',
      'outreach_planning',
      'response_tracking',
      'prospect_management',
      'transfer_portal_search',
    ],
  },
  performance_coordinator: {
    id: 'performance_coordinator',
    name: 'Performance Coordinator',
    icon: 'pulse',
    description:
      'Evaluates players, analyzes film, generates Agent X Intel reports/Intel reports, creates scouting reports, compares prospects, tracks athletic progression, and provides biometric analysis. Use for any request to "write intel", "generate intel", "build a Intel report", or "create an Agent X Intel report" for an athlete or team.',
    capabilities: [
      'scouting_report',
      'film_analysis',
      'stat_comparison',
      'prospect_ranking',
      'biometric_analysis',
      'progression_tracking',
      'opponent_scouting',
      'intel_report',
      'agent_x_intel',
      'athlete_intel_report',
    ],
  },
} as const;

export const COORDINATOR_DESCRIPTORS: Readonly<
  Record<CoordinatorAgentIdentifier, AgentDescriptor>
> = Object.freeze(
  COORDINATOR_AGENT_IDS.reduce(
    (acc, id) => {
      acc[id] = AGENT_DESCRIPTORS[id];
      return acc;
    },
    {} as Record<CoordinatorAgentIdentifier, AgentDescriptor>
  )
);

// ─── Model Routing Defaults ─────────────────────────────────────────────────

export const MODEL_ROUTING_DEFAULTS: Record<string, ModelRoutingConfig> = {
  // ── Text Tiers ──────────────────────────────────────────────────────────
  /** Fast JSON routing & multi-agent dispatching (Planner). */
  routing: { tier: 'routing', maxTokens: 1024, temperature: 0 },
  /** Structured data extraction: HTML → JSON, CSV parsing, schema mapping. */
  extraction: { tier: 'extraction', maxTokens: 4096, temperature: 0 },
  /** Massive-context aggregation: play-by-play, bulk stats, scraping. */
  data_heavy: { tier: 'data_heavy', maxTokens: 8192, temperature: 0 },
  /** Deep analytical evaluation: scout reports, biometrics, progression. */
  evaluator: { tier: 'evaluator', maxTokens: 4096, temperature: 0.3 },
  /** Factual rule validation: NCAA compliance, eligibility, transfer portal. */
  compliance: { tier: 'compliance', maxTokens: 4096, temperature: 0 },
  /** Human-sounding copywriting: recruiting emails, social captions, press. */
  copywriting: { tier: 'copywriting', maxTokens: 2048, temperature: 0.9 },
  /** Creative prompt engineering: text-to-image/video prompt generation. */
  prompt_engineering: { tier: 'prompt_engineering', maxTokens: 2048, temperature: 0.9 },
  /** Lightweight conversational chat: general Q&A, platform help. */
  chat: { tier: 'chat', maxTokens: 2048, temperature: 0.7 },
  /** Temporal orchestration: campaign scheduling, recurring tasks. */
  task_automation: { tier: 'task_automation', maxTokens: 2048, temperature: 0.3 },

  // ── Media Tiers ─────────────────────────────────────────────────────────
  /** Image creation: brand graphics, scout report visuals, promo art. */
  image_generation: { tier: 'image_generation', maxTokens: 4096, temperature: 0.7 },
  /** Video creation: highlight reels, commitment announcements. */
  video_generation: { tier: 'video_generation', maxTokens: 4096, temperature: 0.7 },
  /** Image/document understanding: OCR, stat sheet reading, film stills. */
  vision_analysis: { tier: 'vision_analysis', maxTokens: 4096, temperature: 0 },
  /** Audio understanding: game broadcasts, interview clips, coach calls. */
  audio_analysis: { tier: 'audio_analysis', maxTokens: 4096, temperature: 0 },
  /** Text-to-speech: AI sportscaster voiceovers, highlight narration. */
  voice_generation: { tier: 'voice_generation', maxTokens: 1024, temperature: 0.5 },
  /** AI music: hype beats, highlight reel background tracks. */
  music_generation: { tier: 'music_generation', maxTokens: 1024, temperature: 0.7 },

  // ── Utility Tiers ──────────────────────────────────────────────────────
  /** Text-to-vector embedding for semantic search. */
  embedding: { tier: 'embedding', maxTokens: 0, temperature: 0 },
  /** Content safety classification: prompt injection, toxic content. */
  moderation: { tier: 'moderation', maxTokens: 512, temperature: 0 },
} as const;

// ─── Guardrail Descriptors ──────────────────────────────────────────────────

export const GUARDRAIL_DESCRIPTORS: readonly GuardrailDescriptor[] = [
  {
    name: 'ncaa_compliance',
    description: 'Blocks outreach actions during NCAA dead periods and enforces contact rules.',
    phase: 'pre_tool',
  },
  {
    name: 'anti_hallucination',
    description:
      'Rejects LLM outputs that reference stats or records not found in the verified database.',
    phase: 'post_response',
  },
  {
    name: 'tone_enforcement',
    description: 'Ensures agent responses maintain the professional NXT1 brand voice.',
    phase: 'post_response',
  },
  {
    name: 'pii_protection',
    description:
      'Strips or redacts personally identifiable information before external tool calls.',
    phase: 'pre_tool',
  },
  {
    name: 'rate_limit',
    description: 'Enforces per-user rate limits based on subscription tier.',
    phase: 'pre_tool',
  },
] as const;

// ─── Job Queue ──────────────────────────────────────────────────────────────

export const AGENT_JOB_CONFIG = {
  /** Redis queue name for agent operations. */
  QUEUE_NAME: 'agent-x-operations',
  /** Max concurrent workers per instance. */
  CONCURRENCY: 5,
  /** Maximum time (ms) a single operation can run before timeout. */
  JOB_TIMEOUT_MS: 120_000,
  /** Maximum retry attempts for failed jobs. */
  MAX_RETRIES: 2,
  /** Backoff delay (ms) between retries. */
  RETRY_DELAY_MS: 3_000,
} as const;

// ─── Operation Status Labels (for UI) ───────────────────────────────────────

export const OPERATION_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  thinking: 'Thinking...',
  acting: 'Taking action...',
  paused: 'Paused',
  awaiting_approval: 'Waiting for your approval...',
  awaiting_input: 'Waiting for your response...',
  streaming_result: 'Wrapping up...',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
} as const;

// ─── Trigger Rules (Autonomous Wake-Ups) ────────────────────────────────────

import type { AgentTriggerRule } from './agent.types';

/**
 * Registry of all system triggers that can autonomously wake Agent X
 * for a user without them opening the app.
 */
export const AGENT_TRIGGER_RULES: readonly AgentTriggerRule[] = [
  {
    type: 'profile_view',
    name: 'Coach/Scout Profile View',
    description: "A coach or scout viewed the athlete's profile. Agent drafts a follow-up.",
    enabled: true,
    cooldownMs: 3_600_000, // 1 hour — don't spam for repeat views
    intentTemplate:
      '{{viewerName}} ({{viewerRole}}) from {{viewerOrg}} viewed your profile. Draft a personalized follow-up if appropriate.',
    defaultPriority: 'high',
  },
  {
    type: 'new_follower',
    name: 'New Follower',
    description: 'Someone followed the athlete on NXT1.',
    enabled: true,
    cooldownMs: 300_000, // 5 minutes
    intentTemplate: '{{followerName}} followed you. Analyze who they are and suggest an action.',
    defaultPriority: 'normal',
  },
  {
    type: 'stat_update',
    name: 'External Stat Update',
    description: 'Stats changed on an external source (MaxPreps, Hudl, etc.).',
    enabled: true,
    cooldownMs: 86_400_000, // 24 hours
    intentTemplate:
      'New stats detected on {{source}} for {{sport}}. Review and update profile if the numbers improved.',
    defaultPriority: 'normal',
  },
  {
    type: 'college_interest',
    name: 'College Program Interest',
    description: 'A college program expressed interest (campus visit invite, questionnaire, etc.).',
    enabled: true,
    cooldownMs: 0, // Always process immediately
    intentTemplate:
      '{{collegeName}} ({{division}}) showed interest: {{interestType}}. Draft a response and update recruiting board.',
    defaultPriority: 'critical',
  },
  {
    type: 'daily_briefing',
    name: 'Daily Briefing',
    description: 'Scheduled: compile overnight activity into a morning briefing.',
    enabled: true,
    cooldownMs: 86_400_000, // Once per day
    intentTemplate:
      'Generate the daily briefing for today. Summarize profile views, new followers, recruiting updates, and suggest actions.',
    defaultPriority: 'normal',
  },
  {
    type: 'weekly_recap',
    name: 'Weekly Recap',
    description: 'Scheduled: compile weekly stats, engagement, and recruiting progress.',
    enabled: true,
    cooldownMs: 604_800_000, // Once per week
    intentTemplate:
      'Generate a comprehensive weekly recap for this user. Use your available tools to gather all relevant data before writing the summary. ' +
      'Steps: ' +
      '1. Call get_agent_job_history to retrieve the last 7 days of completed agent jobs — list what was accomplished. ' +
      '2. Call get_profile_analytics to fetch profile views, video views, and engagement counts for the past 7 days. ' +
      '3. Call get_recruiting_pipeline to retrieve active contacts, schools being tracked, and any new offer or interest signals. ' +
      '4. Call get_recent_posts to summarize content published this week and its engagement performance. ' +
      '5. If the user has a schedule or calendar, call get_upcoming_events to surface relevant upcoming dates. ' +
      "6. Review the user's stated goals (agentGoals) and note progress toward each. " +
      'After gathering data, compile a structured weekly recap that includes: ' +
      '(a) what Agent X accomplished this week, ' +
      '(b) key metrics and results (views, engagement, recruiting movements), ' +
      '(c) content performance highlights, ' +
      '(d) recruiting pipeline status, ' +
      "(e) 2–3 recommended next steps for next week tailored to the user's role and sport. " +
      'Be specific and data-driven. Reference actual numbers. Keep the tone encouraging and action-oriented.',
    defaultPriority: 'normal',
  },
  {
    type: 'recruiting_window',
    name: 'Recruiting Window Change',
    description: "An NCAA recruiting period opened or closed for the athlete's sport and division.",
    enabled: true,
    cooldownMs: 0,
    intentTemplate:
      'The {{period}} period for {{division}} {{sport}} has {{action}}. Update the recruiting strategy and notify if outreach is now allowed.',
    defaultPriority: 'high',
  },
  {
    type: 'coach_reply',
    name: 'Coach Email Reply',
    description: 'A coach replied to a recruiting email sent by Agent X.',
    enabled: true,
    cooldownMs: 0, // Always process immediately
    intentTemplate:
      'Coach {{coachName}} from {{collegeName}} replied to your recruiting email. Analyze the reply sentiment and draft a follow-up.',
    defaultPriority: 'critical',
  },
  {
    type: 'content_milestone',
    name: 'Content Milestone',
    description: 'A post or highlight reached a significant view/like milestone.',
    enabled: true,
    cooldownMs: 3_600_000, // 1 hour
    intentTemplate:
      'Your {{contentType}} "{{contentTitle}}" hit {{milestone}} {{metricType}}. Generate a celebratory post and suggest sharing with target coaches.',
    defaultPriority: 'low',
  },
  {
    type: 'stale_profile',
    name: 'Stale Profile Reminder',
    description: "The athlete hasn't updated their profile in a configurable number of days.",
    enabled: true,
    cooldownMs: 604_800_000, // Once per week max
    intentTemplate:
      "Your profile hasn't been updated in {{daysSinceUpdate}} days. Review what's outdated and suggest specific improvements.",
    defaultPriority: 'low',
  },
  {
    type: 'subscription_change',
    name: 'Subscription Change',
    description: 'User upgraded or downgraded their subscription plan.',
    enabled: true,
    cooldownMs: 0,
    intentTemplate:
      'Subscription changed from {{oldTier}} to {{newTier}}. Update available features and suggest newly unlocked capabilities.',
    defaultPriority: 'normal',
  },
  {
    type: 'daily_sync_complete',
    name: 'Daily Sync Complete',
    description:
      'The nightly background scraper detected changes on an external platform (MaxPreps, Hudl, etc.).',
    enabled: true,
    cooldownMs: 86_400_000, // Once per day
    intentTemplate:
      'Daily sync on {{source}} for {{sport}} detected changes: {{totalChanges}} updates ({{statsUpdated}} stat changes, {{newCategoriesAdded}} new categories, {{newRecruitingActivities}} recruiting activities, {{newScheduleEvents}} schedule events, {{newVideos}} new videos). Review the delta report and take proactive actions — update the briefing, notify the athlete, and suggest outreach if stats improved.',
    defaultPriority: 'normal',
  },
] as const;

/**
 * Default trigger preferences for a new user.
 * Autonomous is OFF by default — user must opt-in.
 */
export const DEFAULT_TRIGGER_PREFERENCES = {
  autonomousEnabled: false,
  disabledTriggers: [] as string[],
  quietHours: undefined,
} as const;

// ─── Human-in-the-Loop Approval Policies ────────────────────────────────────

import type { AgentApprovalPolicy, AgentUsageLimits } from './agent.types';

/**
 * Defines which tools require user approval before execution.
 * Tools NOT listed here are auto-approved (read-only / low-risk).
 */
export const AGENT_APPROVAL_POLICIES: readonly AgentApprovalPolicy[] = [
  {
    toolName: 'send_email',
    requiresApproval: true,
    autoApproveOnExpiry: false,
    expiryMs: 86_400_000, // 24 hours
    riskLevel: 'high',
  },
  {
    toolName: 'send_sms',
    requiresApproval: true,
    autoApproveOnExpiry: false,
    expiryMs: 86_400_000,
    riskLevel: 'high',
  },
  {
    toolName: 'post_to_social',
    requiresApproval: true,
    autoApproveOnExpiry: false,
    expiryMs: 86_400_000,
    riskLevel: 'medium',
  },
  {
    toolName: 'update_profile',
    requiresApproval: true,
    autoApproveOnExpiry: true, // Auto-approve after 24h — low risk
    expiryMs: 86_400_000,
    riskLevel: 'low',
  },
  {
    toolName: 'delete_content',
    requiresApproval: true,
    autoApproveOnExpiry: false,
    expiryMs: 86_400_000,
    riskLevel: 'critical',
  },
] as const;

// ─── AI Telemetry & Usage Limits ────────────────────────────────────────────

/**
 * Default usage limits for AI operations.
 * No subscription tiers exist yet — all users get the same generous limits
 * with access to every model tier. When subscriptions are introduced,
 * expand this back into a per-tier array.
 */
export const AGENT_USAGE_LIMITS: readonly AgentUsageLimits[] = [
  {
    tier: 'default',
    maxCallsPerDay: 1000,
    maxTokensPerDay: 2_000_000,
    maxCostPerDay: 10.0,
    allowedModelTiers: [
      'routing',
      'extraction',
      'data_heavy',
      'evaluator',
      'compliance',
      'copywriting',
      'prompt_engineering',
      'chat',
      'task_automation',
      'image_generation',
      'video_generation',
      'vision_analysis',
      'audio_analysis',
      'voice_generation',
      'music_generation',
      'embedding',
      'moderation',
    ],
  },
] as const;

/**
 * Known model pricing (cost per 1M tokens in USD).
 * Used by the TelemetryService to calculate costs.
 * Updated periodically as OpenRouter pricing changes.
 */
export const AGENT_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'anthropic/claude-sonnet-4': { input: 3.0, output: 15.0 },
  'anthropic/claude-haiku-4-5': { input: 0.8, output: 4.0 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
  'openai/gpt-4o': { input: 2.5, output: 10.0 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  'google/gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'google/gemini-3-pro-image-preview': { input: 1.25, output: 5.0 },
  'meta-llama/llama-3.1-70b': { input: 0.5, output: 0.7 },
  'meta-llama/llama-guard-3-8b': { input: 0.2, output: 0.2 },
  'minimax/minimax-m2.7': { input: 0.3, output: 1.2 },
  'openai/text-embedding-3-small': { input: 0.02, output: 0.0 },
  'qwen/qwen3.6-plus': { input: 0.4, output: 1.2 },
} as const;

/** @deprecated Use OPERATION_STATUS_LABELS directly — all statuses are now included. */
export const OPERATION_STATUS_LABELS_EXTENDED: Record<string, string> = {
  ...OPERATION_STATUS_LABELS,
} as const;
