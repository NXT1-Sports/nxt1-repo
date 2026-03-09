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

// ─── Sub-Agent Registry ─────────────────────────────────────────────────────

export const AGENT_DESCRIPTORS: Record<AgentIdentifier, AgentDescriptor> = {
  router: {
    id: 'router',
    name: 'Router',
    description:
      'Master orchestrator that classifies user intent and delegates to the best sub-agent.',
    capabilities: ['intent_classification', 'delegation'],
  },
  scout: {
    id: 'scout',
    name: 'Scout Agent',
    description:
      'Evaluates players, analyzes film, generates scouting reports, and compares prospects.',
    capabilities: [
      'scouting_report',
      'film_analysis',
      'stat_comparison',
      'prospect_ranking',
      'biometric_analysis',
    ],
  },
  recruiter: {
    id: 'recruiter',
    name: 'Recruiter Agent',
    description:
      'Manages recruiting outreach, drafts emails, builds target lists, and tracks responses.',
    capabilities: [
      'email_drafting',
      'coach_outreach',
      'college_search',
      'outreach_planning',
      'response_tracking',
    ],
  },
  creative_director: {
    id: 'creative_director',
    name: 'Creative Director Agent',
    description:
      'Generates graphics, cuts highlight reels, designs promo materials, and manages brand assets.',
    capabilities: [
      'graphic_generation',
      'highlight_reel',
      'promo_design',
      'brand_asset',
      'social_media_content',
    ],
  },
  compliance: {
    id: 'compliance',
    name: 'Compliance Agent',
    description:
      'Enforces NCAA/NAIA/NJCAA recruiting rules, validates contact windows, and flags violations.',
    capabilities: [
      'ncaa_rules',
      'contact_period_check',
      'eligibility_verification',
      'dead_period_enforcement',
    ],
  },
  general: {
    id: 'general',
    name: 'General Agent',
    description:
      'Handles general questions, platform help, and tasks that do not fit a specialized agent.',
    capabilities: ['general_qa', 'platform_help', 'small_talk'],
  },
} as const;

// ─── Model Routing Defaults ─────────────────────────────────────────────────

export const MODEL_ROUTING_DEFAULTS: Record<string, ModelRoutingConfig> = {
  /** Fast intent classification & JSON extraction. */
  fast: { tier: 'fast', maxTokens: 512, temperature: 0 },
  /** Default conversational responses. */
  balanced: { tier: 'balanced', maxTokens: 2048, temperature: 0.7 },
  /** Complex reasoning: scouting evaluations, compliance checks. */
  reasoning: { tier: 'reasoning', maxTokens: 4096, temperature: 0.3 },
  /** Creative generation: email copy, social captions, graphic prompts. */
  creative: { tier: 'creative', maxTokens: 2048, temperature: 0.9 },
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
    minTier: 'premium',
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
    minTier: 'premium',
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
    minTier: 'premium',
    cooldownMs: 604_800_000, // Once per week
    intentTemplate:
      'Generate a comprehensive weekly recap: engagement metrics, recruiting pipeline status, content performance, and recommended next steps.',
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
    toolName: 'send_gmail',
    requiresApproval: true,
    autoApproveOnExpiry: false,
    expiryMs: 86_400_000, // 24 hours
    userPrompt: 'Agent X drafted an email. Review and approve before sending.',
    riskLevel: 'high',
  },
  {
    toolName: 'send_sms',
    requiresApproval: true,
    autoApproveOnExpiry: false,
    expiryMs: 86_400_000,
    userPrompt: 'Agent X drafted a text message. Review before sending.',
    riskLevel: 'high',
  },
  {
    toolName: 'post_to_social',
    requiresApproval: true,
    autoApproveOnExpiry: false,
    expiryMs: 86_400_000,
    userPrompt: 'Agent X created a social media post. Approve before publishing.',
    riskLevel: 'medium',
  },
  {
    toolName: 'update_profile',
    requiresApproval: true,
    autoApproveOnExpiry: true, // Auto-approve after 24h — low risk
    expiryMs: 86_400_000,
    userPrompt: 'Agent X wants to update your profile. Review the changes.',
    riskLevel: 'low',
  },
  {
    toolName: 'delete_content',
    requiresApproval: true,
    autoApproveOnExpiry: false,
    expiryMs: 86_400_000,
    userPrompt: 'Agent X wants to delete content. This cannot be undone.',
    riskLevel: 'critical',
  },
] as const;

// ─── AI Telemetry & Usage Limits ────────────────────────────────────────────

/**
 * Per-tier usage limits for AI operations.
 * Controls how much each subscription tier can consume per day.
 */
export const AGENT_USAGE_LIMITS: readonly AgentUsageLimits[] = [
  {
    tier: 'free',
    maxCallsPerDay: 15,
    maxTokensPerDay: 25_000,
    maxCostPerDay: 0.1,
    allowedModelTiers: ['fast'],
  },
  {
    tier: 'starter',
    maxCallsPerDay: 50,
    maxTokensPerDay: 100_000,
    maxCostPerDay: 0.5,
    allowedModelTiers: ['fast', 'balanced'],
  },
  {
    tier: 'premium',
    maxCallsPerDay: 200,
    maxTokensPerDay: 500_000,
    maxCostPerDay: 2.0,
    allowedModelTiers: ['fast', 'balanced', 'reasoning'],
  },
  {
    tier: 'elite',
    maxCallsPerDay: 1000,
    maxTokensPerDay: 2_000_000,
    maxCostPerDay: 10.0,
    allowedModelTiers: ['fast', 'balanced', 'reasoning', 'creative'],
  },
] as const;

/**
 * Known model pricing (cost per 1M tokens in USD).
 * Used by the TelemetryService to calculate costs.
 * Updated periodically as OpenRouter pricing changes.
 */
export const AGENT_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'anthropic/claude-3.5-sonnet': { input: 3.0, output: 15.0 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
  'openai/gpt-4o': { input: 2.5, output: 10.0 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  'google/gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'meta-llama/llama-3.1-70b': { input: 0.5, output: 0.7 },
} as const;

/** Operation status label update for the new HITL status. */
export const OPERATION_STATUS_LABELS_EXTENDED: Record<string, string> = {
  ...OPERATION_STATUS_LABELS,
  awaiting_approval: 'Waiting for your approval...',
} as const;
