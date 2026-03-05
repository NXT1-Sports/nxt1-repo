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
 * All activity items combined and sorted by timestamp (most recent first).
 * NOTE: Inbox/messages content comes from MessagesService via the
 * conversationToActivityItem mapper — not from mock activity data.
 * This only aggregates Agent + Alerts activity items for the "All" tab base.
 */
function getAllItems(): ActivityItem[] {
  const allItems: ActivityItem[] = [...MOCK_AGENT_ITEMS, ...MOCK_ALERTS_ITEMS];
  // Sort by timestamp descending (most recent first)
  return allItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// Individual tab data arrays for reuse

const MOCK_INBOX_ITEMS: ActivityItem[] = [
  // Inbox is now purely messages/conversations (driven by MessagesService).
  // Kept empty — real inbox data comes from conversationToActivityItem mapper.
];

const MOCK_AGENT_ITEMS: ActivityItem[] = [
  {
    id: '9',
    type: 'system',
    tab: 'agent',
    priority: 'normal',
    title: 'Agent X completed your highlight reel',
    body: 'Your basketball highlights have been compiled and are ready to share with recruiters.',
    timestamp: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
    isRead: false,
    metadata: {
      operationType: 'highlight_reel',
      status: 'completed',
    },
  },
  {
    id: '10',
    type: 'system',
    tab: 'agent',
    priority: 'normal',
    title: 'Agent X sent 24 recruiting emails',
    body: 'Outreach completed to every D2 program in Ohio. 3 replies received so far.',
    timestamp: new Date(now - 1000 * 60 * 60 * 4).toISOString(),
    isRead: false,
    metadata: {
      operationType: 'email_outreach',
      emailsSent: 24,
      replies: 3,
    },
  },
  {
    id: '11',
    type: 'system',
    tab: 'agent',
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
    id: '12',
    type: 'system',
    tab: 'agent',
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

const MOCK_ALERTS_ITEMS: ActivityItem[] = [
  {
    id: '4',
    type: 'like',
    tab: 'alerts',
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
    tab: 'alerts',
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
    tab: 'alerts',
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
    tab: 'alerts',
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
  {
    id: '8',
    type: 'like',
    tab: 'alerts',
    priority: 'normal',
    title: 'Coach Wilson liked your highlight reel',
    body: '"Just finished watching @you dominate the paint. This kid is going places! 🚀"',
    timestamp: new Date(now - 1000 * 60 * 45).toISOString(),
    isRead: false,
    source: {
      userId: 'coach-wilson',
      userName: 'Coach Wilson',
      avatarUrl: 'https://i.pravatar.cc/150?img=31',
    },
    metadata: {
      postType: 'video',
      likeCount: 89,
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
  inbox: MOCK_INBOX_ITEMS,
  agent: MOCK_AGENT_ITEMS,
  alerts: MOCK_ALERTS_ITEMS,
};

/**
 * Mock badge counts for each tab.
 * 'all' shows the total unread count across all tabs.
 */
export const MOCK_BADGE_COUNTS: Record<ActivityTabId, number> = {
  get all() {
    return this.inbox + this.agent + this.alerts;
  },
  inbox: 4,
  agent: 2,
  alerts: 4,
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
