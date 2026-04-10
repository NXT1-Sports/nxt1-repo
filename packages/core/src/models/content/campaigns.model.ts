/**
 * @fileoverview Campaigns Model
 * @module @nxt1/core/models
 *
 * Type definitions for email campaigns and recruiting outreach.
 * Extracted from User model for clean separation of concerns.
 * 100% portable - no framework dependencies.
 *
 * Database Collections:
 * - UserCampaigns/{userId}          - Campaign config & templates
 * - Campaigns/{campaignId}          - Individual campaign records
 * - CampaignRecipients/{campaignId}/recipients/{recipientId} - Recipient tracking
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import {
  CAMPAIGN_STATUSES,
  RECIPIENT_STATUSES,
  EMAIL_PROVIDERS,
  TEMPLATE_TYPES,
  CAMPAIGN_LIMITS,
  TEMPLATE_VARIABLES,
} from '../../constants/campaign.constants';

import { CAMPAIGNS_SCHEMA_VERSION } from '../../constants/schema.constants';

import type {
  CampaignStatus,
  RecipientStatus,
  EmailProvider,
  TemplateType,
  TemplateVariable,
} from '../../constants/campaign.constants';

// Re-export for backward compatibility
export {
  CAMPAIGNS_SCHEMA_VERSION,
  CAMPAIGN_STATUSES,
  RECIPIENT_STATUSES,
  EMAIL_PROVIDERS,
  TEMPLATE_TYPES,
  CAMPAIGN_LIMITS,
  TEMPLATE_VARIABLES,
};

export type { CampaignStatus, RecipientStatus, EmailProvider, TemplateType, TemplateVariable };

// ============================================
// EMAIL TEMPLATE
// ============================================

/** Email template */
export interface EmailTemplate {
  id: string;
  userId: string;

  /** Template type */
  type: TemplateType;

  /** Template name */
  name: string;

  /** Email subject (supports variables) */
  subject: string;

  /** Email body (supports variables) */
  body: string;

  /** Is system-provided template */
  isSystem: boolean;

  /** Is user's default for this type */
  isDefault: boolean;

  /** Available variables */
  variables: string[];

  /** Sport this template is for (optional) */
  sportIndex?: number;

  /** Usage count */
  usageCount: number;

  /** Timestamps */
  createdAt: Date | string;
  updatedAt: Date | string;
}

// ============================================
// CAMPAIGN RECIPIENT
// ============================================

/** Campaign recipient (college coach) */
export interface CampaignRecipient {
  id: string;
  campaignId: string;

  /** College info */
  collegeId: string;
  collegeName: string;
  collegeLogoUrl?: string;

  /** Coach info */
  coachName: string;
  coachEmail: string;
  coachTitle?: string;

  /** Delivery status */
  status: RecipientStatus;

  /** Status timestamps */
  sentAt?: Date | string;
  deliveredAt?: Date | string;
  openedAt?: Date | string;
  clickedAt?: Date | string;
  repliedAt?: Date | string;
  bouncedAt?: Date | string;

  /** Open tracking */
  openCount: number;

  /** Click tracking */
  clicks: Array<{
    url: string;
    clickedAt: Date | string;
  }>;

  /** Error message if failed */
  errorMessage?: string;

  /** Personalized variables for this recipient */
  personalizedVars?: Record<string, string>;
}

// ============================================
// CAMPAIGN
// ============================================

/**
 * Campaign record
 * Stored at: Campaigns/{campaignId}
 */
export interface Campaign {
  id: string;
  userId: string;

  /** Campaign name (internal) */
  name: string;

  /** Campaign status */
  status: CampaignStatus;

  /** Email provider used */
  provider: EmailProvider;

  /** From email address */
  fromEmail: string;
  fromName: string;

  /** Reply-to address */
  replyTo?: string;

  /** Email content */
  subject: string;
  body: string;

  /** Template used (if any) */
  templateId?: string;
  templateType?: TemplateType;

  /** Sport this campaign is for */
  sportIndex: number;

  /** Recipient stats */
  recipientStats: {
    total: number;
    pending: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    failed: number;
  };

  /** Calculated rates */
  rates: {
    deliveryRate: number; // delivered / sent
    openRate: number; // opened / delivered
    clickRate: number; // clicked / opened
    replyRate: number; // replied / delivered
    bounceRate: number; // bounced / sent
  };

  /** Scheduling */
  scheduledAt?: Date | string;

  /** Timestamps */
  createdAt: Date | string;
  updatedAt: Date | string;
  sentAt?: Date | string;
  completedAt?: Date | string;

  /** Schema version */
  _schemaVersion: number;
}

// ============================================
// USER CAMPAIGNS CONFIG
// ============================================

/**
 * User campaign configuration
 * Stored at: UserCampaigns/{userId}
 */
export interface UserCampaigns {
  userId: string;

  /** Email templates */
  templates: EmailTemplate[];

  /** Connected email accounts */
  connectedAccounts: {
    gmail?: ConnectedEmailAccount;
    microsoft?: ConnectedEmailAccount;
    yahoo?: ConnectedEmailAccount;
  };

  /** Default send settings */
  defaults: {
    provider: EmailProvider;
    fromName: string;
    replyTo?: string;
    signature?: string;
  };

  /** Questionnaires completed (for college forms) */
  completedQuestionnaires: string[];

  /** Camps/events registered for */
  completedCamps: string[];

  /** Campaign history (last 100 IDs for quick access) */
  recentCampaignIds: string[];

  /** Aggregate stats */
  stats: {
    totalCampaignsSent: number;
    totalEmailsSent: number;
    totalOpens: number;
    totalReplies: number;
    avgOpenRate: number;
    avgReplyRate: number;
    lastCampaignAt?: Date | string;
  };

  /** Daily/monthly limits */
  limits: {
    dailySent: number;
    dailyLimit: number;
    monthlySent: number;
    monthlyLimit: number;
    lastResetAt: Date | string;
  };

  /** Timestamps */
  createdAt: Date | string;
  updatedAt: Date | string;

  /** Schema version */
  _schemaVersion: number;
}

export interface ConnectedEmailAccount {
  email: string;
  provider: EmailProvider;

  /** OAuth tokens (encrypted) */
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date | string;

  /** Account status */
  isActive: boolean;
  lastUsedAt?: Date | string;
  lastErrorAt?: Date | string;
  lastError?: string;

  /** Connection timestamp */
  connectedAt: Date | string;
}

// ============================================
// TYPE GUARDS
// ============================================

export function isCampaignSent(campaign: Campaign): boolean {
  return campaign.status === 'sent';
}

export function isCampaignActive(campaign: Campaign): boolean {
  return campaign.status === 'sending' || campaign.status === 'scheduled';
}

export function isRecipientEngaged(recipient: CampaignRecipient): boolean {
  return (
    recipient.status === 'opened' ||
    recipient.status === 'clicked' ||
    recipient.status === 'replied'
  );
}

export function hasConnectedEmail(config: UserCampaigns): boolean {
  const { connectedAccounts } = config;
  return !!(
    connectedAccounts.gmail?.isActive ||
    connectedAccounts.microsoft?.isActive ||
    connectedAccounts.yahoo?.isActive
  );
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

export function createDefaultUserCampaigns(userId: string): UserCampaigns {
  const now = new Date().toISOString();
  return {
    userId,
    templates: [],
    connectedAccounts: {},
    defaults: {
      provider: 'system',
      fromName: '',
    },
    completedQuestionnaires: [],
    completedCamps: [],
    recentCampaignIds: [],
    stats: {
      totalCampaignsSent: 0,
      totalEmailsSent: 0,
      totalOpens: 0,
      totalReplies: 0,
      avgOpenRate: 0,
      avgReplyRate: 0,
    },
    limits: {
      dailySent: 0,
      dailyLimit: 0, // Set based on plan
      monthlySent: 0,
      monthlyLimit: 0, // Set based on plan
      lastResetAt: now,
    },
    createdAt: now,
    updatedAt: now,
    _schemaVersion: CAMPAIGNS_SCHEMA_VERSION,
  };
}

export function createDefaultCampaign(userId: string, sportIndex: number): Partial<Campaign> {
  const now = new Date().toISOString();
  return {
    userId,
    name: '',
    status: 'draft',
    provider: 'system',
    fromEmail: '',
    fromName: '',
    subject: '',
    body: '',
    sportIndex,
    recipientStats: {
      total: 0,
      pending: 0,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      bounced: 0,
      failed: 0,
    },
    rates: {
      deliveryRate: 0,
      openRate: 0,
      clickRate: 0,
      replyRate: 0,
      bounceRate: 0,
    },
    createdAt: now,
    updatedAt: now,
    _schemaVersion: CAMPAIGNS_SCHEMA_VERSION,
  };
}

export function createDefaultTemplate(userId: string, type: TemplateType): Partial<EmailTemplate> {
  const now = new Date().toISOString();
  return {
    userId,
    type,
    name: '',
    subject: '',
    body: '',
    isSystem: false,
    isDefault: false,
    variables: ['{{firstName}}', '{{lastName}}', '{{sport}}', '{{position}}', '{{school}}'],
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================
// CAMPAIGN LIMITS HELPER
// ============================================

export function getCampaignLimits(): { daily: number; monthly: number } {
  return CAMPAIGN_LIMITS.free;
}

/**
 * Replace template variables with actual values
 */
export function interpolateTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface CreateCampaignRequest {
  userId: string;
  name: string;
  templateId?: string;
  subject: string;
  body: string;
  sportIndex: number;
  recipientIds: string[]; // College IDs
  scheduledAt?: Date | string;
}

export interface SendCampaignRequest {
  campaignId: string;
  userId: string;
}

export interface CampaignAnalyticsResponse {
  campaign: Campaign;
  recipients: CampaignRecipient[];
  timeline: Array<{
    date: string;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
  }>;
}

export interface ConnectEmailRequest {
  userId: string;
  provider: EmailProvider;
  authCode: string;
  redirectUri: string;
}

export interface SaveTemplateRequest {
  userId: string;
  template: Partial<EmailTemplate>;
}
