/**
 * @fileoverview Invite Type Definitions
 * @module @nxt1/core/invite
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Invite feature.
 * 100% portable - works on web, mobile, and backend.
 *
 * Features:
 * - Multiple invite channels (SMS, Email, Social, QR, Link)
 * - Gamified XP rewards
 * - Team invitations
 * - Referral tracking
 * - Achievement badges
 */

// ============================================
// INVITE CHANNEL TYPES
// ============================================

/**
 * Invite channel identifiers.
 * Each represents a method of sending invites.
 */
export type InviteChannel =
  | 'sms'
  | 'email'
  | 'whatsapp'
  | 'messenger'
  | 'instagram'
  | 'twitter'
  | 'copy_link'
  | 'qr_code'
  | 'contacts'
  | 'airdrop';

/**
 * Configuration for an invite channel.
 */
export interface InviteChannelConfig {
  /** Unique channel identifier */
  readonly id: InviteChannel;
  /** Display label */
  readonly label: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Brand color (CSS variable or hex) */
  readonly color: string;
  /** Whether this channel is native (uses device APIs) */
  readonly isNative: boolean;
  /** Platform availability */
  readonly platforms: readonly ('web' | 'ios' | 'android')[];
  /** XP reward for using this channel */
  readonly xpReward: number;
  /** Description text */
  readonly description?: string;
}

// ============================================
// INVITE TYPES
// ============================================

/**
 * Type of invitation being sent.
 */
export type InviteType =
  | 'general' // General app invite
  | 'team' // Invite to join a team
  | 'profile' // Share profile
  | 'event' // Invite to event
  | 'recruit' // Recruiting interest
  | 'referral'; // Referral program

/**
 * Status of a sent invite.
 */
export type InviteStatus =
  | 'pending' // Invite sent, awaiting action
  | 'viewed' // Recipient viewed the invite
  | 'accepted' // Recipient signed up
  | 'declined' // Recipient declined
  | 'expired'; // Invite expired

// ============================================
// INVITE ITEM TYPES
// ============================================

/**
 * Recipient information for an invite.
 */
export interface InviteRecipient {
  /** Recipient identifier (phone, email, or user ID) */
  readonly id: string;
  /** Display name */
  readonly name?: string;
  /** Phone number (for SMS/WhatsApp) */
  readonly phone?: string;
  /** Email address */
  readonly email?: string;
  /** Avatar URL */
  readonly avatarUrl?: string;
  /** Whether this is a contact from device */
  readonly isContact?: boolean;
}

/**
 * Individual invite record.
 */
export interface InviteItem {
  /** Unique invite ID */
  readonly id: string;
  /** Type of invite */
  readonly type: InviteType;
  /** Channel used to send */
  readonly channel: InviteChannel;
  /** Current status */
  readonly status: InviteStatus;
  /** Recipient information */
  readonly recipient: InviteRecipient;
  /** Sender user ID */
  readonly senderId: string;
  /** Team ID (if team invite) */
  readonly teamId?: string;
  /** Team name (if team invite) */
  readonly teamName?: string;
  /** Custom message included */
  readonly message?: string;
  /** Referral code */
  readonly referralCode: string;
  /** XP earned for this invite (reserved for future use) */
  readonly xpEarned?: number;
  /** Creation timestamp */
  readonly createdAt: string;
  /** Last update timestamp */
  readonly updatedAt: string;
  /** Expiration timestamp */
  readonly expiresAt?: string;
}

// ============================================
// INVITE STATS & GAMIFICATION
// ============================================

/**
 * XP reward tier based on invite performance.
 */
export interface InviteXpTier {
  /** Tier name */
  readonly name: string;
  /** Minimum invites to reach tier */
  readonly minInvites: number;
  /** XP multiplier for this tier */
  readonly multiplier: number;
  /** Badge icon */
  readonly badgeIcon: string;
  /** Badge color */
  readonly badgeColor: string;
}

/**
 * User's invite statistics.
 */
export interface InviteStats {
  /** Total invites sent */
  readonly totalSent: number;
  /** Invites accepted */
  readonly accepted: number;
  /** Invites pending */
  readonly pending: number;
  /** Current streak days */
  readonly streakDays: number;
  /** Best streak ever */
  readonly bestStreak: number;
  /** Weekly invite count */
  readonly weeklyCount: number;
  /** Monthly invite count */
  readonly monthlyCount: number;
  /** Conversion rate (accepted/sent %) */
  readonly conversionRate: number;
}

/**
 * Achievement badge for invite milestones.
 */
export interface InviteAchievement {
  /** Achievement ID */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Description */
  readonly description: string;
  /** Icon name */
  readonly icon: string;
  /** Badge color */
  readonly color: string;
  /** XP reward */
  readonly xpReward: number;
  /** Whether user has earned this */
  readonly isEarned: boolean;
  /** Progress (0-100) if not earned */
  readonly progress?: number;
  /** Timestamp when earned */
  readonly earnedAt?: string;
}

// ============================================
// TEAM INVITE TYPES
// ============================================

/**
 * Team information for team invites.
 */
export interface InviteTeam {
  /** Team ID */
  readonly id: string;
  /** Team name */
  readonly name: string;
  /** Team logo URL */
  readonly logoUrl?: string;
  /** Sport type */
  readonly sport: string;
  /** Team level (varsity, JV, etc.) */
  readonly level?: string;
  /** Member count */
  readonly memberCount: number;
  /** Team code for joining */
  readonly teamCode?: string;
}

/**
 * Bulk invite request for teams.
 */
export interface TeamBulkInviteRequest {
  /** Team ID */
  readonly teamId: string;
  /** Recipients to invite */
  readonly recipients: readonly InviteRecipient[];
  /** Channel to use */
  readonly channel: InviteChannel;
  /** Custom message */
  readonly message?: string;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

/**
 * Request to send a single invite.
 */
export interface SendInviteRequest {
  /** Invite type */
  readonly type: InviteType;
  /** Channel to use */
  readonly channel: InviteChannel;
  /** Recipient(s) */
  readonly recipients: readonly InviteRecipient[];
  /** Team ID (if team invite) */
  readonly teamId?: string;
  /** Custom message */
  readonly message?: string;
}

/**
 * Response from sending invite(s).
 */
export interface SendInviteResponse {
  /** Whether successful */
  readonly success: boolean;
  /** Created invites */
  readonly invites: readonly InviteItem[];
  /** Total XP earned (reserved for future use) */
  readonly xpEarned?: number;
  /** New achievements unlocked */
  readonly newAchievements?: readonly InviteAchievement[];
  /** Error message (if failed) */
  readonly error?: string;
}

/**
 * Filter options for invite history.
 */
export interface InviteFilter {
  /** Filter by type */
  readonly type?: InviteType;
  /** Filter by channel */
  readonly channel?: InviteChannel;
  /** Filter by status */
  readonly status?: InviteStatus;
  /** Filter by team */
  readonly teamId?: string;
  /** Start date */
  readonly since?: string;
  /** End date */
  readonly until?: string;
  /** Page number */
  readonly page?: number;
  /** Items per page */
  readonly limit?: number;
}

/**
 * Paginated invite history response.
 */
export interface InviteHistoryResponse {
  /** Success flag */
  readonly success: boolean;
  /** Invite items */
  readonly items: readonly InviteItem[];
  /** Pagination info */
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly hasMore: boolean;
  };
}

/**
 * Invite link/share data.
 */
export interface InviteLink {
  /** Full invite URL */
  readonly url: string;
  /** Short URL (for sharing) */
  readonly shortUrl: string;
  /** Referral code */
  readonly referralCode: string;
  /** QR code data URL */
  readonly qrCodeDataUrl?: string;
  /** Expiration date */
  readonly expiresAt?: string;
  /** Team code (for team invites — used at accept time to join the roster) */
  readonly teamCode?: string;
  /** Human-readable team name (for team invites — display only) */
  readonly teamName?: string;
}

// ============================================
// UI STATE TYPES
// ============================================

/**
 * Invite feature UI state.
 */
export interface InviteState {
  /** Current invite type context */
  readonly inviteType: InviteType;
  /** Selected team (for team invites) */
  readonly selectedTeam: InviteTeam | null;
  /** Selected recipients */
  readonly selectedRecipients: readonly InviteRecipient[];
  /** Custom message */
  readonly message: string;
  /** Generated invite link */
  readonly inviteLink: InviteLink | null;
  /** User's invite stats */
  readonly stats: InviteStats | null;
  /** User's achievements */
  readonly achievements: readonly InviteAchievement[];
  /** Recent invite history */
  readonly history: readonly InviteItem[];
  /** Loading states */
  readonly isLoading: boolean;
  readonly isSending: boolean;
  readonly isLoadingStats: boolean;
  /** Error state */
  readonly error: string | null;
}

// ============================================
// CONTACT TYPES
// ============================================

/**
 * Device contact for contact picker.
 */
export interface DeviceContact {
  /** Contact ID from device */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Phone numbers */
  readonly phones: readonly string[];
  /** Email addresses */
  readonly emails: readonly string[];
  /** Photo URL */
  readonly photoUrl?: string;
  /** Whether already on platform */
  readonly isOnPlatform?: boolean;
}
