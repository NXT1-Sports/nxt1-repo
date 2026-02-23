/**
 * @fileoverview Mock Activity Data for Development
 * @module @nxt1/ui/activity/mock-data
 *
 * ⚠️ TEMPORARY FILE - Delete when backend is ready
 *
 * Contains dummy data for Activity feature during development phase.
 * All data here is fabricated for UI testing purposes only.
 */

import type { ActivityItem, ActivityTabId } from '@nxt1/core';

const now = Date.now();

/**
 * Mock activity items for each tab
 */
/**
 * All items combined and sorted by timestamp (most recent first).
 * This is computed from all other tabs.
 */
function getAllItems(): ActivityItem[] {
  const allItems: ActivityItem[] = [
    ...MOCK_NOTIFICATIONS_ITEMS,
    ...MOCK_DEALS_ITEMS,
    ...MOCK_MENTIONS_ITEMS,
    ...MOCK_SYSTEM_ITEMS,
    ...MOCK_UPDATES_ITEMS,
  ];
  // Sort by timestamp descending (most recent first)
  return allItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// Individual tab data arrays for reuse

const MOCK_NOTIFICATIONS_ITEMS: ActivityItem[] = [
  {
    id: '4',
    type: 'like',
    tab: 'notifications',
    priority: 'normal',
    title: 'Sarah Johnson liked your post',
    body: '"Amazing performance at the championship game! 🏀"',
    timestamp: new Date(now - 1000 * 60 * 10).toISOString(),
    isRead: false,
    source: {
      userId: 'sarah-johnson',
      userName: 'Sarah Johnson',
      avatarUrl: 'https://i.pravatar.cc/150?img=25',
    },
    metadata: {
      postType: 'video',
      likeCount: 127,
    },
  },
  {
    id: '5',
    type: 'comment',
    tab: 'notifications',
    priority: 'normal',
    title: 'Marcus Brown commented on your video',
    body: 'Those handles are next level! Keep grinding 💪',
    timestamp: new Date(now - 1000 * 60 * 30).toISOString(),
    isRead: false,
    source: {
      userId: 'marcus-brown',
      userName: 'Marcus Brown',
      avatarUrl: 'https://i.pravatar.cc/150?img=52',
    },
  },
  {
    id: '6',
    type: 'follow',
    tab: 'notifications',
    priority: 'normal',
    title: 'Coach Martinez started following you',
    body: 'Head Coach at UCLA - Division I Basketball',
    timestamp: new Date(now - 1000 * 60 * 60).toISOString(),
    isRead: false,
    source: {
      userId: 'coach-martinez',
      userName: 'Coach Martinez',
      avatarUrl: 'https://i.pravatar.cc/150?img=68',
    },
    metadata: {
      school: 'UCLA',
      sport: 'Basketball',
    },
  },
  {
    id: '7',
    type: 'mention',
    tab: 'notifications',
    priority: 'normal',
    title: 'You were tagged in a post',
    body: 'Tyler mentioned you: "Congrats to @you on making All-State! Well deserved 👏"',
    timestamp: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
    isRead: true,
    source: {
      userId: 'tyler',
      userName: 'Tyler',
      avatarUrl: 'https://i.pravatar.cc/150?img=14',
    },
  },
];

const MOCK_DEALS_ITEMS: ActivityItem[] = [
  {
    id: '8',
    type: 'deal',
    tab: 'deals',
    priority: 'normal',
    title: '50% Off Premium Recruiting Package',
    body: 'Upgrade your profile with unlimited highlight videos and advanced analytics. Limited time offer!',
    timestamp: new Date(now - 1000 * 60 * 60 * 4).toISOString(),
    isRead: false,
    metadata: {
      discount: '50%',
      expiresIn: '2 days',
      originalPrice: '$99.99',
      salePrice: '$49.99',
    },
  },
  {
    id: '9',
    type: 'deal',
    tab: 'deals',
    priority: 'normal',
    title: 'Free Training Session with Pro Coach',
    body: 'Get a 1-on-1 virtual training session when you upgrade to Pro this week.',
    timestamp: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
    isRead: false,
    metadata: {
      value: '$150',
      expiresIn: '6 days',
    },
  },
];

const MOCK_MENTIONS_ITEMS: ActivityItem[] = [
  {
    id: '10',
    type: 'mention',
    tab: 'mentions',
    priority: 'normal',
    title: 'Coach Wilson mentioned you in a post',
    body: '"Just finished watching @you dominate the paint. This kid is going places! 🚀"',
    timestamp: new Date(now - 1000 * 60 * 45).toISOString(),
    isRead: false,
    source: {
      userId: 'coach-wilson',
      userName: 'Coach Wilson',
      avatarUrl: 'https://i.pravatar.cc/150?img=31',
    },
    metadata: {
      postType: 'text',
      likeCount: 89,
    },
  },
  {
    id: '11',
    type: 'mention',
    tab: 'mentions',
    priority: 'normal',
    title: 'Tagged in team highlight reel',
    body: 'Riverside Eagles posted a video featuring you',
    timestamp: new Date(now - 1000 * 60 * 60 * 6).toISOString(),
    isRead: true,
    source: {
      teamId: 'riverside-eagles',
      teamName: 'Riverside Eagles',
      teamLogoUrl: 'https://i.pravatar.cc/150?img=40',
    },
  },
];

const MOCK_SYSTEM_ITEMS: ActivityItem[] = [
  {
    id: '12',
    type: 'system',
    tab: 'system',
    priority: 'normal',
    title: 'Your profile is now 95% complete',
    body: 'Add your SAT/ACT scores to reach 100% and increase your visibility to recruiters.',
    timestamp: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
    isRead: false,
    metadata: {
      completionPercent: 95,
      missingFields: ['test_scores'],
    },
  },
  {
    id: '13',
    type: 'system',
    tab: 'system',
    priority: 'normal',
    title: 'Weekly stats summary ready',
    body: 'Your profile received 127 views and 23 new followers this week.',
    timestamp: new Date(now - 1000 * 60 * 60 * 24 * 2).toISOString(),
    isRead: true,
    metadata: {
      views: 127,
      followers: 23,
      engagement: '+15%',
    },
  },
];

const MOCK_UPDATES_ITEMS: ActivityItem[] = [
  {
    id: '14',
    type: 'update',
    tab: 'updates',
    priority: 'normal',
    title: 'New Feature: AI Profile Assistant',
    body: 'Our new AI assistant can help you optimize your profile, write better bios, and more!',
    timestamp: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
    isRead: false,
    metadata: {
      version: '2.5.0',
      isNew: true,
    },
  },
  {
    id: '15',
    type: 'update',
    tab: 'updates',
    priority: 'normal',
    title: 'NXT1 Mobile App Update Available',
    body: 'Version 2.5.0 includes performance improvements and new recruiting tools.',
    timestamp: new Date(now - 1000 * 60 * 60 * 24 * 3).toISOString(),
    isRead: true,
    metadata: {
      version: '2.5.0',
      size: '45 MB',
    },
  },
];

/**
 * Mock activity items for each tab.
 * 'all' tab aggregates items from all other tabs sorted by timestamp.
 */
export const MOCK_ACTIVITY_DATA: Record<ActivityTabId, ActivityItem[]> = {
  get all() {
    return getAllItems();
  },
  notifications: MOCK_NOTIFICATIONS_ITEMS,
  deals: MOCK_DEALS_ITEMS,
  mentions: MOCK_MENTIONS_ITEMS,
  system: MOCK_SYSTEM_ITEMS,
  updates: MOCK_UPDATES_ITEMS,
};

/**
 * Mock badge counts for each tab.
 * 'all' shows the total unread count across all tabs.
 */
export const MOCK_BADGE_COUNTS: Record<ActivityTabId, number> = {
  get all() {
    return this.notifications + this.deals + this.mentions + this.system + this.updates;
  },
  notifications: 3,
  deals: 2,
  mentions: 1,
  system: 1,
  updates: 1,
};

/**
 * Generate mock items for a specific tab with pagination
 */
export function getMockActivityItems(
  tab: ActivityTabId,
  page: number = 1,
  limit: number = 20
): ActivityItem[] {
  const items = MOCK_ACTIVITY_DATA[tab] || [];
  const start = (page - 1) * limit;
  const end = start + limit;
  return items.slice(start, end);
}

/**
 * Get total count for a tab
 */
export function getMockItemCount(tab: ActivityTabId): number {
  return MOCK_ACTIVITY_DATA[tab]?.length || 0;
}

/**
 * Get unread count for a tab
 */
export function getMockUnreadCount(tab: ActivityTabId): number {
  const items = MOCK_ACTIVITY_DATA[tab] || [];
  return items.filter((item) => !item.isRead).length;
}
