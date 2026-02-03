/**
 * @fileoverview Mock Invite Data for Development
 * @module @nxt1/ui/invite/mock-data
 *
 * ⚠️ TEMPORARY FILE - Delete when backend is ready
 *
 * Contains mock data for Invite feature during development phase.
 * All data here is fabricated for UI testing purposes only.
 */

import type {
  InviteStats,
  InviteAchievement,
  InviteItem,
  InviteLink,
  InviteTeam,
  InviteXpTier,
} from '@nxt1/core';

// ============================================
// MOCK XP TIERS
// ============================================

const MOCK_TIERS: InviteXpTier[] = [
  {
    name: 'Rookie',
    minInvites: 0,
    multiplier: 1.0,
    badgeIcon: 'star-outline',
    badgeColor: 'var(--nxt1-color-text-tertiary)',
  },
  {
    name: 'Connector',
    minInvites: 5,
    multiplier: 1.25,
    badgeIcon: 'star-half',
    badgeColor: '#CD7F32',
  },
  { name: 'Networker', minInvites: 15, multiplier: 1.5, badgeIcon: 'star', badgeColor: '#C0C0C0' },
  {
    name: 'Ambassador',
    minInvites: 30,
    multiplier: 1.75,
    badgeIcon: 'trophy',
    badgeColor: '#FFD700',
  },
  { name: 'Legend', minInvites: 50, multiplier: 2.0, badgeIcon: 'diamond', badgeColor: '#B9F2FF' },
];

// ============================================
// MOCK STATS
// ============================================

export const MOCK_INVITE_STATS: InviteStats = {
  totalSent: 23,
  accepted: 12,
  pending: 8,
  totalXp: 1250,
  tier: MOCK_TIERS[2], // Networker
  tierProgress: 53,
  invitesToNextTier: 7,
  streakDays: 5,
  bestStreak: 14,
  weeklyCount: 8,
  monthlyCount: 23,
  conversionRate: 52,
};

// ============================================
// MOCK ACHIEVEMENTS
// ============================================

export const MOCK_INVITE_ACHIEVEMENTS: InviteAchievement[] = [
  {
    id: 'first_invite',
    name: 'First Connection',
    description: 'Send your first invite',
    icon: 'rocket',
    color: 'var(--nxt1-color-primary)',
    xpReward: 50,
    isEarned: true,
    earnedAt: '2024-01-15T10:30:00Z',
  },
  {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    description: 'Use 3 different invite channels',
    icon: 'share-social',
    color: 'var(--nxt1-color-info)',
    xpReward: 100,
    isEarned: true,
    earnedAt: '2024-01-20T14:45:00Z',
  },
  {
    id: 'team_builder',
    name: 'Team Builder',
    description: 'Invite 5 teammates',
    icon: 'people',
    color: 'var(--nxt1-color-success)',
    xpReward: 150,
    isEarned: true,
    earnedAt: '2024-02-01T09:00:00Z',
  },
  {
    id: 'streak_master',
    name: 'Streak Master',
    description: 'Maintain a 7-day invite streak',
    icon: 'flame',
    color: '#FF6B35',
    xpReward: 200,
    isEarned: false,
    progress: 71, // 5/7 days
  },
  {
    id: 'influencer',
    name: 'Influencer',
    description: 'Have 10 invites accepted',
    icon: 'megaphone',
    color: 'var(--nxt1-color-warning)',
    xpReward: 250,
    isEarned: false,
    progress: 100, // 12/10 - earned but not shown yet for effect
  },
  {
    id: 'ambassador',
    name: 'NXT Ambassador',
    description: 'Invite 25 people who join',
    icon: 'ribbon',
    color: '#FFD700',
    xpReward: 500,
    isEarned: false,
    progress: 48, // 12/25
  },
  {
    id: 'viral',
    name: 'Going Viral',
    description: 'Share via all social platforms',
    icon: 'trending-up',
    color: '#E4405F',
    xpReward: 150,
    isEarned: false,
    progress: 60,
  },
  {
    id: 'qr_master',
    name: 'QR Master',
    description: 'Have 5 people join via QR code',
    icon: 'qr-code',
    color: 'var(--nxt1-color-text-primary)',
    xpReward: 100,
    isEarned: false,
    progress: 40, // 2/5
  },
];

// ============================================
// MOCK INVITE HISTORY
// ============================================

const now = Date.now();

export const MOCK_INVITE_HISTORY: InviteItem[] = [
  {
    id: 'inv_1',
    type: 'team',
    channel: 'sms',
    status: 'accepted',
    recipient: {
      id: 'rec_1',
      name: 'Marcus Johnson',
      phone: '+1 (555) 123-4567',
      avatarUrl: 'https://i.pravatar.cc/150?img=12',
    },
    senderId: 'user_1',
    teamId: 'team_1',
    teamName: 'Riverside Eagles',
    referralCode: 'NXT-ABC123',
    xpEarned: 50,
    createdAt: new Date(now - 1000 * 60 * 30).toISOString(), // 30 min ago
    updatedAt: new Date(now - 1000 * 60 * 15).toISOString(),
  },
  {
    id: 'inv_2',
    type: 'general',
    channel: 'whatsapp',
    status: 'pending',
    recipient: {
      id: 'rec_2',
      name: 'Sarah Chen',
      phone: '+1 (555) 234-5678',
    },
    senderId: 'user_1',
    referralCode: 'NXT-DEF456',
    xpEarned: 25,
    createdAt: new Date(now - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    updatedAt: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'inv_3',
    type: 'team',
    channel: 'email',
    status: 'accepted',
    recipient: {
      id: 'rec_3',
      name: 'Alex Williams',
      email: 'alex.w@school.edu',
      avatarUrl: 'https://i.pravatar.cc/150?img=33',
    },
    senderId: 'user_1',
    teamId: 'team_1',
    teamName: 'Riverside Eagles',
    referralCode: 'NXT-GHI789',
    xpEarned: 50,
    createdAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    updatedAt: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
  },
  {
    id: 'inv_4',
    type: 'general',
    channel: 'instagram',
    status: 'viewed',
    recipient: {
      id: 'rec_4',
      name: 'Jordan Taylor',
    },
    senderId: 'user_1',
    referralCode: 'NXT-JKL012',
    xpEarned: 30,
    createdAt: new Date(now - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    updatedAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: 'inv_5',
    type: 'profile',
    channel: 'copy_link',
    status: 'accepted',
    recipient: {
      id: 'rec_5',
      name: 'Coach Thompson',
      email: 'thompson@university.edu',
      avatarUrl: 'https://i.pravatar.cc/150?img=60',
    },
    senderId: 'user_1',
    referralCode: 'NXT-MNO345',
    xpEarned: 35,
    createdAt: new Date(now - 1000 * 60 * 60 * 72).toISOString(), // 3 days ago
    updatedAt: new Date(now - 1000 * 60 * 60 * 48).toISOString(),
  },
];

// ============================================
// MOCK INVITE LINK
// ============================================

export const MOCK_INVITE_LINK: InviteLink = {
  url: 'https://nxt.com/join/NXT-ABC123?ref=user_1',
  shortUrl: 'nxt.link/ABC123',
  referralCode: 'NXT-ABC123',
  qrCodeDataUrl:
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjIwIiB5PSIyMCIgd2lkdGg9IjE2MCIgaGVpZ2h0PSIxNjAiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSI0MCIgeT0iNDAiIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNjAiIHk9IjYwIiB3aWR0aD0iODAiIGhlaWdodD0iODAiIGZpbGw9IiMwMDAiLz48cmVjdCB4PSI4MCIgeT0iODAiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgZmlsbD0iI2NjZmYwMCIvPjwvc3ZnPg==',
  expiresAt: new Date(now + 1000 * 60 * 60 * 24 * 30).toISOString(), // 30 days
};

// ============================================
// MOCK TEAMS
// ============================================

export const MOCK_TEAMS: InviteTeam[] = [
  {
    id: 'team_1',
    name: 'Riverside Eagles',
    logoUrl: 'https://i.pravatar.cc/150?img=68',
    sport: 'Basketball',
    level: 'Varsity',
    memberCount: 15,
    teamCode: 'EAGLES2024',
  },
  {
    id: 'team_2',
    name: 'Metro Thunder',
    logoUrl: 'https://i.pravatar.cc/150?img=69',
    sport: 'Football',
    level: 'JV',
    memberCount: 32,
    teamCode: 'THUNDER24',
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get mock stats for development.
 */
export function getMockInviteStats(): InviteStats {
  return MOCK_INVITE_STATS;
}

/**
 * Get mock achievements with optional filter.
 */
export function getMockAchievements(earnedOnly?: boolean): InviteAchievement[] {
  if (earnedOnly) {
    return MOCK_INVITE_ACHIEVEMENTS.filter((a) => a.isEarned);
  }
  return MOCK_INVITE_ACHIEVEMENTS;
}

/**
 * Get mock invite history.
 */
export function getMockInviteHistory(
  page: number = 1,
  limit: number = 10
): { items: InviteItem[]; hasMore: boolean; total: number } {
  const start = (page - 1) * limit;
  const end = start + limit;
  const items = MOCK_INVITE_HISTORY.slice(start, end);

  return {
    items,
    hasMore: end < MOCK_INVITE_HISTORY.length,
    total: MOCK_INVITE_HISTORY.length,
  };
}

/**
 * Get mock invite link.
 */
export function getMockInviteLink(): InviteLink {
  return MOCK_INVITE_LINK;
}

/**
 * Get mock teams for team invite.
 */
export function getMockTeams(): InviteTeam[] {
  return MOCK_TEAMS;
}
