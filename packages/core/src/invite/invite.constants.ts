/**
 * @fileoverview Invite Constants
 * @module @nxt1/core/invite
 * @version 1.0.0
 *
 * Configuration constants for Invite feature.
 * 100% portable - no platform dependencies.
 */

import type {
  InviteChannel,
  InviteChannelConfig,
  InviteRewardTier,
  InviteAchievement,
  InviteType,
} from './invite.types';

// ============================================
// INVITE CHANNELS CONFIGURATION
// ============================================

/**
 * All available invite channels with their configurations.
 * Order determines display order in the UI.
 */
export const INVITE_CHANNELS: readonly InviteChannelConfig[] = [
  {
    id: 'sms',
    label: 'Messages',
    icon: 'chatbubble',
    color: 'var(--nxt1-color-success)',
    isNative: true,
    platforms: ['ios', 'android'],
    description: 'Send via text message',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: 'logo-whatsapp',
    color: '#25D366',
    isNative: true,
    platforms: ['ios', 'android', 'web'],
    description: 'Share via WhatsApp',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: 'logo-instagram',
    color: '#E4405F',
    isNative: true,
    platforms: ['ios', 'android'],
    description: 'Share to Stories or DM',
  },
  {
    id: 'twitter',
    label: 'X / Twitter',
    icon: 'logo-twitter',
    color: '#000000',
    isNative: true,
    platforms: ['ios', 'android', 'web'],
    description: 'Tweet or DM',
  },
  {
    id: 'messenger',
    label: 'Messenger',
    icon: 'logo-facebook',
    color: '#0084FF',
    isNative: true,
    platforms: ['ios', 'android', 'web'],
    description: 'Send via Messenger',
  },
  {
    id: 'email',
    label: 'Email',
    icon: 'mail',
    color: 'var(--nxt1-color-primary)',
    isNative: true,
    platforms: ['ios', 'android', 'web'],
    description: 'Send email invite',
  },
  {
    id: 'copy_link',
    label: 'Copy Link',
    icon: 'link',
    color: 'var(--nxt1-color-text-secondary)',
    isNative: false,
    platforms: ['ios', 'android', 'web'],
    description: 'Copy to clipboard',
  },
  {
    id: 'qr_code',
    label: 'QR Code',
    icon: 'qr-code',
    color: 'var(--nxt1-color-text-primary)',
    isNative: false,
    platforms: ['ios', 'android', 'web'],
    description: 'Show scannable code',
  },
  {
    id: 'contacts',
    label: 'Contacts',
    icon: 'people',
    color: 'var(--nxt1-color-info)',
    isNative: true,
    platforms: ['ios', 'android'],
    description: 'Pick from contacts',
  },
  {
    id: 'airdrop',
    label: 'AirDrop',
    icon: 'share',
    color: 'var(--nxt1-color-primary)',
    isNative: true,
    platforms: ['ios'],
    description: 'Share nearby',
  },
] as const;

/**
 * Default channel for quick share.
 */
export const INVITE_DEFAULT_CHANNEL: InviteChannel = 'copy_link';

// ============================================
// REWARD TIERS CONFIGURATION
// ============================================

/**
 * Reward tiers for invite milestones.
 * @deprecated XP system not active — tiers retained for future use.
 */
export const INVITE_XP_TIERS: readonly InviteRewardTier[] = [
  {
    name: 'Rookie',
    minInvites: 0,
    badgeIcon: 'star-outline',
    badgeColor: 'var(--nxt1-color-text-tertiary)',
  },
  {
    name: 'Connector',
    minInvites: 5,
    badgeIcon: 'star-half',
    badgeColor: '#CD7F32', // Bronze
  },
  {
    name: 'Networker',
    minInvites: 15,
    badgeIcon: 'star',
    badgeColor: '#C0C0C0', // Silver
  },
  {
    name: 'Ambassador',
    minInvites: 30,
    badgeIcon: 'trophy',
    badgeColor: '#FFD700', // Gold
  },
  {
    name: 'Legend',
    minInvites: 50,
    badgeIcon: 'diamond',
    badgeColor: '#B9F2FF', // Diamond
  },
] as const;

// ============================================
// ACHIEVEMENTS CONFIGURATION
// ============================================

/**
 * All possible invite achievements.
 * Unlocked based on various milestones.
 */
export const INVITE_ACHIEVEMENTS: readonly Omit<
  InviteAchievement,
  'isEarned' | 'progress' | 'earnedAt'
>[] = [
  {
    id: 'first_invite',
    name: 'First Connection',
    description: 'Send your first invite',
    icon: 'rocket',
    color: 'var(--nxt1-color-primary)',
  },
  {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    description: 'Use 3 different invite channels',
    icon: 'share-social',
    color: 'var(--nxt1-color-info)',
  },
  {
    id: 'team_builder',
    name: 'Team Builder',
    description: 'Invite 5 teammates',
    icon: 'people',
    color: 'var(--nxt1-color-success)',
  },
  {
    id: 'streak_master',
    name: 'Streak Master',
    description: 'Maintain a 7-day invite streak',
    icon: 'flame',
    color: '#FF6B35',
  },
  {
    id: 'influencer',
    name: 'Influencer',
    description: 'Have 10 invites accepted',
    icon: 'megaphone',
    color: 'var(--nxt1-color-warning)',
  },
  {
    id: 'ambassador',
    name: 'NXT Ambassador',
    description: 'Invite 25 people who join',
    icon: 'ribbon',
    color: '#FFD700',
  },
  {
    id: 'viral',
    name: 'Going Viral',
    description: 'Share via all social platforms',
    icon: 'trending-up',
    color: '#E4405F',
  },
  {
    id: 'qr_master',
    name: 'QR Master',
    description: 'Have 5 people join via QR code',
    icon: 'qr-code',
    color: 'var(--nxt1-color-text-primary)',
  },
] as const;

// ============================================
// INVITE TYPE CONFIGURATION
// ============================================

/**
 * Configuration for each invite type.
 */
export const INVITE_TYPE_CONFIG: Record<
  InviteType,
  {
    label: string;
    icon: string;
    defaultMessage: string;
    color: string;
  }
> = {
  general: {
    label: 'Invite to NXT',
    icon: 'person-add',
    defaultMessage: 'Join me on NXT — the sports intelligence platform!',
    color: 'var(--nxt1-color-primary)',
  },
  team: {
    label: 'Team Invite',
    icon: 'people',
    defaultMessage: 'Join our team on NXT!',
    color: 'var(--nxt1-color-success)',
  },
  profile: {
    label: 'Share Profile',
    icon: 'person-circle',
    defaultMessage: 'Check out my athletic profile!',
    color: 'var(--nxt1-color-info)',
  },
  event: {
    label: 'Event Invite',
    icon: 'calendar',
    defaultMessage: "You're invited to our event!",
    color: 'var(--nxt1-color-warning)',
  },
  recruit: {
    label: 'Recruiting Interest',
    icon: 'trophy',
    defaultMessage: 'A coach wants to connect with you!',
    color: '#FFD700',
  },
  referral: {
    label: 'Referral',
    icon: 'gift',
    defaultMessage: 'Sign up with my referral code for bonus XP!',
    color: 'var(--nxt1-color-error)',
  },
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

/**
 * UI configuration constants.
 */
export const INVITE_UI_CONFIG = {
  /** Max recipients for bulk invite */
  maxBulkRecipients: 50,
  /** Max message length */
  maxMessageLength: 280,
  /** Invite link expiration (days) */
  linkExpirationDays: 30,
  /** Show confetti on milestone */
  showConfetti: true,
  /** Quick share channels (shown first) */
  quickShareChannels: ['sms', 'whatsapp', 'copy_link'] as InviteChannel[],
  /** Social channels for grid */
  socialChannels: ['instagram', 'twitter', 'messenger', 'email'] as InviteChannel[],
} as const;

// ============================================
// API ENDPOINTS
// ============================================

/**
 * API endpoint paths.
 */
export const INVITE_API_ENDPOINTS = {
  /** Generate invite link */
  GENERATE_LINK: '/invite/link',
  /** Send invite */
  SEND: '/invite/send',
  /** Bulk send invites */
  SEND_BULK: '/invite/send-bulk',
  /** Get invite history */
  HISTORY: '/invite/history',
  /** Get invite stats */
  STATS: '/invite/stats',
  /** Get achievements */
  ACHIEVEMENTS: '/invite/achievements',
  /** Validate referral code */
  VALIDATE_CODE: '/invite/validate',
  /** Accept invite */
  ACCEPT: '/invite/accept',
  /** Get team members to invite */
  TEAM_MEMBERS: '/invite/team/:teamId/members',
} as const;

// ============================================
// CACHE CONFIGURATION
// ============================================

/**
 * Cache keys for invite data.
 */
export const INVITE_CACHE_KEYS = {
  /** Stats cache key */
  STATS: 'invite:stats',
  /** Achievements cache key */
  ACHIEVEMENTS: 'invite:achievements',
  /** History cache key prefix */
  HISTORY_PREFIX: 'invite:history:',
  /** Link cache key */
  LINK: 'invite:link',
} as const;

/**
 * Cache TTL values (in milliseconds).
 */
export const INVITE_CACHE_TTL = {
  /** Stats: 5 minutes */
  STATS: 300_000,
  /** Achievements: 15 minutes */
  ACHIEVEMENTS: 900_000,
  /** History: 2 minutes */
  HISTORY: 120_000,
  /** Link: 1 hour */
  LINK: 3_600_000,
} as const;

// ============================================
// EMPTY STATE MESSAGES
// ============================================

/**
 * Empty state configurations.
 */
export const INVITE_EMPTY_STATES = {
  noHistory: {
    title: 'No invites yet',
    message: 'Start sharing NXT with friends and teammates to earn XP!',
    icon: 'person-add-outline',
    ctaLabel: 'Send First Invite',
  },
  noTeam: {
    title: 'Join a team first',
    message: 'Create or join a team to invite teammates.',
    icon: 'people-outline',
    ctaLabel: 'Find Teams',
  },
  noContacts: {
    title: 'No contacts found',
    message: 'Allow access to contacts or enter details manually.',
    icon: 'person-outline',
    ctaLabel: 'Enter Manually',
  },
} as const;
