/**
 * @fileoverview Campaign Constants
 * @module @nxt1/core/constants
 *
 * Constants for email campaigns and recruiting outreach.
 * Extracted from campaigns.model.ts for proper separation of concerns.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// CAMPAIGN STATUSES
// ============================================

export const CAMPAIGN_STATUSES = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  SENDING: 'sending',
  SENT: 'sent',
  PAUSED: 'paused',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[keyof typeof CAMPAIGN_STATUSES];

export const RECIPIENT_STATUSES = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  OPENED: 'opened',
  CLICKED: 'clicked',
  REPLIED: 'replied',
  BOUNCED: 'bounced',
  UNSUBSCRIBED: 'unsubscribed',
  FAILED: 'failed',
} as const;

export type RecipientStatus = (typeof RECIPIENT_STATUSES)[keyof typeof RECIPIENT_STATUSES];

export const EMAIL_PROVIDERS = {
  GMAIL: 'gmail',
  MICROSOFT: 'microsoft',
  YAHOO: 'yahoo',
  SYSTEM: 'system',
} as const;

export type EmailProvider = (typeof EMAIL_PROVIDERS)[keyof typeof EMAIL_PROVIDERS];

export const TEMPLATE_TYPES = {
  INTRODUCTION: 'introduction',
  FOLLOW_UP: 'follow-up',
  THANK_YOU: 'thank-you',
  HIGHLIGHT: 'highlight',
  CAMP_INVITE: 'camp-invite',
  VISIT_REQUEST: 'visit-request',
  CUSTOM: 'custom',
} as const;

export type TemplateType = (typeof TEMPLATE_TYPES)[keyof typeof TEMPLATE_TYPES];

// ============================================
// CAMPAIGN LIMITS (by plan)
// ============================================

export const CAMPAIGN_LIMITS = {
  free: { daily: 0, monthly: 0 },
  starter: { daily: 10, monthly: 100 },
  pro: { daily: 50, monthly: 500 },
  elite: { daily: 200, monthly: 2000 },
  team: { daily: 500, monthly: 5000 },
} as const;

// ============================================
// TEMPLATE VARIABLES
// ============================================

/** Available template variables */
export const TEMPLATE_VARIABLES = {
  // User info
  '{{firstName}}': 'Your first name',
  '{{lastName}}': 'Your last name',
  '{{fullName}}': 'Your full name',
  '{{email}}': 'Your email address',
  '{{phone}}': 'Your phone number',

  // Sport info
  '{{sport}}': 'Your sport',
  '{{position}}': 'Your position',
  '{{positions}}': 'All your positions',
  '{{classOf}}': 'Graduation year',

  // School info
  '{{school}}': 'Your high school name',
  '{{city}}': 'Your city',
  '{{state}}': 'Your state',

  // Stats
  '{{gpa}}': 'Your GPA',
  '{{height}}': 'Your height',
  '{{weight}}': 'Your weight',

  // Links
  '{{profileUrl}}': 'Link to your NXT1 profile',
  '{{highlightUrl}}': 'Link to your highlight video',

  // Recipient info
  '{{coachName}}': "Coach's name",
  '{{collegeName}}': 'College name',
  '{{collegeCity}}': 'College city',
  '{{collegeState}}': 'College state',
} as const;

export type TemplateVariable = keyof typeof TEMPLATE_VARIABLES;
