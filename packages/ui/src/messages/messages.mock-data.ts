/**
 * @fileoverview Mock Messages Data for Development
 * @module @nxt1/ui/messages/mock-data
 *
 * ⚠️ TEMPORARY FILE — Delete when backend is ready
 *
 * Contains fabricated data for Messages feature during development.
 * All data is typed against @nxt1/core interfaces.
 */

import type { Conversation, Message, MessagesFilterId, ConversationParticipant } from '@nxt1/core';
import { USER_ROLES } from '@nxt1/core';

// ============================================
// TIMESTAMP HELPERS
// ============================================

const now = Date.now();

function minutesAgo(minutes: number): string {
  return new Date(now - minutes * 60_000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(now - hours * 3_600_000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(now - days * 86_400_000).toISOString();
}

// ============================================
// MOCK PARTICIPANTS
// ============================================

const MOCK_PARTICIPANTS: Record<string, ConversationParticipant> = {
  currentUser: {
    id: 'current-user',
    name: 'You',
    avatarUrl: 'https://i.pravatar.cc/150?img=68',
    role: 'athlete',
    isOnline: true,
  },
  coachThompson: {
    id: 'coach-thompson',
    name: 'Coach Thompson',
    avatarUrl: 'https://i.pravatar.cc/150?img=12',
    role: 'coach',
    isVerified: true,
    isOnline: true,
    lastSeen: minutesAgo(2),
  },
  coachDavis: {
    id: 'coach-davis',
    name: 'Coach Davis',
    avatarUrl: 'https://i.pravatar.cc/150?img=33',
    role: 'coach',
    isVerified: true,
    isOnline: false,
    lastSeen: hoursAgo(3),
  },
  coachMiller: {
    id: 'coach-miller',
    name: 'Coach Miller',
    avatarUrl: 'https://i.pravatar.cc/150?img=59',
    role: 'recruiter',
    isVerified: true,
    isOnline: false,
    lastSeen: daysAgo(1),
  },
  sarahJohnson: {
    id: 'sarah-johnson',
    name: 'Sarah Johnson',
    avatarUrl: 'https://i.pravatar.cc/150?img=5',
    role: 'athlete',
    isOnline: true,
  },
  marcusWilliams: {
    id: 'marcus-williams',
    name: 'Marcus Williams',
    avatarUrl: 'https://i.pravatar.cc/150?img=8',
    role: 'athlete',
    isOnline: false,
    lastSeen: minutesAgo(45),
  },
  teamRiverside: {
    id: 'team-riverside',
    name: 'Riverside High',
    avatarUrl: 'https://i.pravatar.cc/150?img=45',
    role: 'admin',
    isOnline: true,
  },
  coachReeves: {
    id: 'coach-reeves',
    name: 'Coach Reeves',
    avatarUrl: 'https://i.pravatar.cc/150?img=15',
    role: 'recruiter',
    isVerified: true,
    isOnline: true,
    lastSeen: minutesAgo(10),
  },
  jakePorter: {
    id: 'jake-porter',
    name: 'Jake Porter',
    avatarUrl: 'https://i.pravatar.cc/150?img=11',
    role: 'athlete',
    isOnline: false,
    lastSeen: hoursAgo(6),
  },
  parentSmith: {
    id: 'parent-smith',
    name: 'Mr. Smith',
    avatarUrl: 'https://i.pravatar.cc/150?img=52',
    role: 'parent',
    isOnline: false,
    lastSeen: daysAgo(2),
  },
};

// ============================================
// MOCK CONVERSATIONS
// ============================================

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1',
    type: 'direct',
    title: 'Coach Thompson',
    avatarUrl: MOCK_PARTICIPANTS['coachThompson'].avatarUrl,
    participants: [MOCK_PARTICIPANTS['currentUser'], MOCK_PARTICIPANTS['coachThompson']],
    lastMessage: {
      body: "Your highlight reel from last week was impressive. Let's talk about upcoming showcases.",
      senderName: 'Coach Thompson',
      timestamp: minutesAgo(5),
      isOwn: false,
    },
    unreadCount: 2,
    isPinned: true,
    isOnline: true,
    hasVerifiedParticipant: true,
    createdAt: daysAgo(14),
    updatedAt: minutesAgo(5),
  },
  {
    id: 'conv-2',
    type: 'direct',
    title: 'Coach Davis',
    avatarUrl: MOCK_PARTICIPANTS['coachDavis'].avatarUrl,
    participants: [MOCK_PARTICIPANTS['currentUser'], MOCK_PARTICIPANTS['coachDavis']],
    lastMessage: {
      body: 'Following up on our conversation about your season goals. I think D1 is realistic.',
      senderName: 'Coach Davis',
      timestamp: hoursAgo(2),
      isOwn: false,
    },
    unreadCount: 1,
    hasVerifiedParticipant: true,
    isOnline: false,
    createdAt: daysAgo(30),
    updatedAt: hoursAgo(2),
  },
  {
    id: 'conv-3',
    type: 'team',
    title: 'Riverside High Varsity',
    avatarUrl: MOCK_PARTICIPANTS['teamRiverside'].avatarUrl,
    participants: [
      MOCK_PARTICIPANTS['currentUser'],
      MOCK_PARTICIPANTS['teamRiverside'],
      MOCK_PARTICIPANTS['sarahJohnson'],
      MOCK_PARTICIPANTS['marcusWilliams'],
    ],
    lastMessage: {
      body: 'Practice schedule updated for next week. Check the team calendar.',
      senderName: 'Riverside High',
      timestamp: hoursAgo(5),
      isOwn: false,
    },
    unreadCount: 0,
    isOnline: true,
    createdAt: daysAgo(90),
    updatedAt: hoursAgo(5),
  },
  {
    id: 'conv-4',
    type: 'direct',
    title: 'Sarah Johnson',
    avatarUrl: MOCK_PARTICIPANTS['sarahJohnson'].avatarUrl,
    participants: [MOCK_PARTICIPANTS['currentUser'], MOCK_PARTICIPANTS['sarahJohnson']],
    lastMessage: {
      body: 'Great game yesterday! 🏀 Your three-pointer in the fourth quarter was clutch.',
      senderName: 'Sarah Johnson',
      timestamp: hoursAgo(8),
      isOwn: false,
    },
    unreadCount: 0,
    isOnline: true,
    createdAt: daysAgo(21),
    updatedAt: hoursAgo(8),
  },
  {
    id: 'conv-5',
    type: 'direct',
    title: 'Coach Reeves',
    avatarUrl: MOCK_PARTICIPANTS['coachReeves'].avatarUrl,
    participants: [MOCK_PARTICIPANTS['currentUser'], MOCK_PARTICIPANTS['coachReeves']],
    lastMessage: {
      body: 'We have a spot open at our summer elite camp. Interested?',
      senderName: 'Coach Reeves',
      timestamp: daysAgo(1),
      isOwn: false,
    },
    unreadCount: 1,
    hasVerifiedParticipant: true,
    isOnline: true,
    createdAt: daysAgo(7),
    updatedAt: daysAgo(1),
  },
  {
    id: 'conv-6',
    type: 'direct',
    title: 'Marcus Williams',
    avatarUrl: MOCK_PARTICIPANTS['marcusWilliams'].avatarUrl,
    participants: [MOCK_PARTICIPANTS['currentUser'], MOCK_PARTICIPANTS['marcusWilliams']],
    lastMessage: {
      body: 'Are you going to the combine this weekend?',
      senderName: 'You',
      timestamp: daysAgo(1),
      isOwn: true,
    },
    unreadCount: 0,
    isOnline: false,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(1),
  },
  {
    id: 'conv-7',
    type: 'direct',
    title: 'Coach Miller',
    avatarUrl: MOCK_PARTICIPANTS['coachMiller'].avatarUrl,
    participants: [MOCK_PARTICIPANTS['currentUser'], MOCK_PARTICIPANTS['coachMiller']],
    lastMessage: {
      body: "Thanks for sending over your transcripts. I'll review them this week.",
      senderName: 'Coach Miller',
      timestamp: daysAgo(2),
      isOwn: false,
    },
    unreadCount: 0,
    hasVerifiedParticipant: true,
    isOnline: false,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(2),
  },
  {
    id: 'conv-8',
    type: 'direct',
    title: 'Jake Porter',
    avatarUrl: MOCK_PARTICIPANTS['jakePorter'].avatarUrl,
    participants: [MOCK_PARTICIPANTS['currentUser'], MOCK_PARTICIPANTS['jakePorter']],
    lastMessage: {
      body: 'Yo check out this new training program I found',
      senderName: 'Jake Porter',
      timestamp: daysAgo(3),
      isOwn: false,
    },
    unreadCount: 0,
    isOnline: false,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(3),
  },
  {
    id: 'conv-9',
    type: 'group',
    title: 'Summer Showcase Group',
    avatarUrl: undefined,
    participants: [
      MOCK_PARTICIPANTS['currentUser'],
      MOCK_PARTICIPANTS['sarahJohnson'],
      MOCK_PARTICIPANTS['marcusWilliams'],
      MOCK_PARTICIPANTS['jakePorter'],
    ],
    lastMessage: {
      body: 'Hotel rooms have been booked. See everyone Saturday!',
      senderName: 'Sarah Johnson',
      timestamp: daysAgo(4),
      isOwn: false,
    },
    unreadCount: 0,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(4),
  },
  {
    id: 'conv-10',
    type: 'direct',
    title: 'Mr. Smith',
    avatarUrl: MOCK_PARTICIPANTS['parentSmith'].avatarUrl,
    participants: [MOCK_PARTICIPANTS['currentUser'], MOCK_PARTICIPANTS['parentSmith']],
    lastMessage: {
      body: "Thanks for the update on practice times. We'll be there.",
      senderName: 'Mr. Smith',
      timestamp: daysAgo(5),
      isOwn: false,
    },
    unreadCount: 0,
    isOnline: false,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(5),
  },
];

// ============================================
// MOCK THREAD MESSAGES
// ============================================

export const MOCK_THREAD_MESSAGES: Record<string, Message[]> = {
  'conv-1': [
    {
      id: 'msg-1-1',
      conversationId: 'conv-1',
      sender: MOCK_PARTICIPANTS['currentUser'],
      body: 'Hi Coach, thanks for reaching out! I uploaded some new highlights last week.',
      timestamp: daysAgo(2),
      status: 'read',
      isOwn: true,
    },
    {
      id: 'msg-1-2',
      conversationId: 'conv-1',
      sender: MOCK_PARTICIPANTS['coachThompson'],
      body: 'I saw them! Your footwork has improved significantly. The 40-yard drill especially.',
      timestamp: daysAgo(2),
      status: 'read',
    },
    {
      id: 'msg-1-3',
      conversationId: 'conv-1',
      sender: MOCK_PARTICIPANTS['currentUser'],
      body: "Thanks! I've been working with a speed coach twice a week.",
      timestamp: daysAgo(1),
      status: 'read',
      isOwn: true,
    },
    {
      id: 'msg-1-4',
      conversationId: 'conv-1',
      sender: MOCK_PARTICIPANTS['coachThompson'],
      body: 'It shows. There are a couple of showcases coming up in March that I think would be great exposure for you.',
      timestamp: hoursAgo(3),
      status: 'read',
    },
    {
      id: 'msg-1-5',
      conversationId: 'conv-1',
      sender: MOCK_PARTICIPANTS['coachThompson'],
      body: "Your highlight reel from last week was impressive. Let's talk about upcoming showcases.",
      timestamp: minutesAgo(5),
      status: 'delivered',
    },
  ],
  'conv-2': [
    {
      id: 'msg-2-1',
      conversationId: 'conv-2',
      sender: MOCK_PARTICIPANTS['coachDavis'],
      body: 'Hey, I wanted to follow up on our conversation from the camp last month.',
      timestamp: daysAgo(3),
      status: 'read',
    },
    {
      id: 'msg-2-2',
      conversationId: 'conv-2',
      sender: MOCK_PARTICIPANTS['currentUser'],
      body: "Of course! I've been thinking about the goals we discussed.",
      timestamp: daysAgo(3),
      status: 'read',
      isOwn: true,
    },
    {
      id: 'msg-2-3',
      conversationId: 'conv-2',
      sender: MOCK_PARTICIPANTS['coachDavis'],
      body: "Good. With your current trajectory and the work you're putting in, I think D1 programs will be very interested.",
      timestamp: daysAgo(2),
      status: 'read',
    },
    {
      id: 'msg-2-4',
      conversationId: 'conv-2',
      sender: MOCK_PARTICIPANTS['coachDavis'],
      body: 'Following up on our conversation about your season goals. I think D1 is realistic.',
      timestamp: hoursAgo(2),
      status: 'delivered',
    },
  ],
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get mock conversations filtered by tab, with optional search.
 */
export function getMockConversations(
  filter: MessagesFilterId,
  query: string = '',
  page: number = 1,
  pageSize: number = 20
): { conversations: Conversation[]; total: number; hasMore: boolean } {
  let filtered = [...MOCK_CONVERSATIONS];

  // Apply filter
  switch (filter) {
    case 'unread':
      filtered = filtered.filter((c) => c.unreadCount > 0);
      break;
    case 'all':
    default:
      break;
  }

  // Apply search
  if (query.trim().length > 0) {
    const lowerQuery = query.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.title.toLowerCase().includes(lowerQuery) ||
        c.lastMessage?.body.toLowerCase().includes(lowerQuery)
    );
  }

  // Sort: pinned first, then by updatedAt
  filtered.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const paginated = filtered.slice(start, start + pageSize);

  return {
    conversations: paginated,
    total,
    hasMore: start + pageSize < total,
  };
}

/**
 * Get mock messages for a thread.
 */
export function getMockThreadMessages(conversationId: string): Message[] {
  return MOCK_THREAD_MESSAGES[conversationId] ?? [];
}

/**
 * Get total unread count across all conversations.
 */
export function getMockUnreadCount(): number {
  return MOCK_CONVERSATIONS.reduce((sum, c) => sum + c.unreadCount, 0);
}

/**
 * Get the count of conversations matching a filter.
 */
export function getMockFilterCount(filter: MessagesFilterId): number {
  return getMockConversations(filter).total;
}
