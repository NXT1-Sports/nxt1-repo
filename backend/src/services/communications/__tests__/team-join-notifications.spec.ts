import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import {
  notifyMembershipApproved,
  notifyMembershipRemoved,
  notifyTeamJoined,
} from '../team-join-notifications.js';

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

interface RecordedWrite {
  readonly path: string;
  readonly data: Record<string, unknown>;
}

type CollectionData = Record<string, Record<string, unknown>>;

interface QueryFilter {
  readonly field: string;
  readonly value: unknown;
}

function createMockDocRef(path: string) {
  const id = path.split('/').pop() ?? path;

  return {
    id,
    path,
    collection: (name: string) => ({
      doc: (childId: string) => createMockDocRef(`${path}/${name}/${childId}`),
    }),
  };
}

function createDocSnapshot(id: string, data: Record<string, unknown> | undefined) {
  return {
    id,
    exists: data !== undefined,
    data: () => data,
  };
}

function createMockFirestore(collections: Record<string, CollectionData>): {
  readonly db: Firestore;
  readonly writes: RecordedWrite[];
} {
  const writes: RecordedWrite[] = [];
  const batch = {
    set: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: ref.path, data });
    }),
    commit: vi.fn().mockResolvedValue(undefined),
  };

  const createQuery = (collectionName: string, filters: readonly QueryFilter[] = []) => ({
    doc: (id: string) => ({
      ...createMockDocRef(`${collectionName}/${id}`),
      get: vi.fn().mockResolvedValue(createDocSnapshot(id, collections[collectionName]?.[id])),
    }),
    where: (field: string, _op: string, value: unknown) =>
      createQuery(collectionName, [...filters, { field, value }]),
    get: vi.fn().mockResolvedValue({
      docs: Object.entries(collections[collectionName] ?? {})
        .filter(([, data]) => filters.every((filter) => data[filter.field] === filter.value))
        .map(([id, data]) => createDocSnapshot(id, data)),
    }),
  });

  const db = {
    batch: vi.fn(() => batch),
    collection: vi.fn((name: string) => createQuery(name)),
  } as unknown as Firestore;

  return { db, writes };
}

describe('notifyTeamJoined', () => {
  it('notifies org admins and active team managers when a member requests to join', async () => {
    const { db, writes } = createMockFirestore({
      Teams: {
        team_1: {
          organizationId: 'org_1',
          createdBy: 'creator_coach',
          teamName: 'Varsity',
        },
      },
      Organizations: {
        org_1: {
          admins: [{ userId: 'org_admin' }, { userId: 'athlete_1' }],
          ownerId: 'org_owner',
        },
      },
      RosterEntries: {
        coach_entry: {
          teamId: 'team_1',
          userId: 'team_coach',
          role: 'coach',
          status: 'active',
        },
        inactive_coach_entry: {
          teamId: 'team_1',
          userId: 'inactive_coach',
          role: 'coach',
          status: 'inactive',
        },
        athlete_entry: {
          teamId: 'team_1',
          userId: 'existing_athlete',
          role: 'athlete',
          status: 'active',
        },
      },
    });

    const result = await notifyTeamJoined(db, {
      teamId: 'team_1',
      teamName: 'Varsity',
      organizationId: 'org_1',
      joinerUid: 'athlete_1',
      joinerName: 'Ava Runner',
      pending: true,
    });

    const notificationWrites = writes.filter((write) => write.path.startsWith('Notifications/'));

    expect(result.recipientCount).toBe(4);
    expect(result.dispatchedCount).toBe(4);
    expect(notificationWrites.map((write) => write.data.userId)).toEqual(
      expect.arrayContaining(['org_admin', 'org_owner', 'team_coach', 'creator_coach'])
    );
    expect(notificationWrites.map((write) => write.data.userId)).not.toContain('athlete_1');
    expect(notificationWrites.map((write) => write.data.userId)).not.toContain('inactive_coach');
    expect(notificationWrites.map((write) => write.data.userId)).not.toContain('existing_athlete');
    expect(notificationWrites.map((write) => write.path)).toEqual(
      expect.arrayContaining([
        'Notifications/team_joined_team_1_athlete_1_pending_team_coach',
        'Notifications/team_joined_team_1_athlete_1_pending_creator_coach',
      ])
    );
    expect(notificationWrites[0]?.data).toMatchObject({
      type: NOTIFICATION_TYPES.TEAM_JOIN_REQUEST,
      title: 'Ava Runner requested to join Varsity',
      data: {
        type: NOTIFICATION_TYPES.TEAM_JOIN_REQUEST,
        deepLink: '/activity?manageMembersTeamId=team_1&filter=pending',
        teamId: 'team_1',
        manageMembersTeamId: 'team_1',
        manageMembersFilter: 'pending',
      },
    });

    const activityWrite = writes.find((write) => write.path.includes('/activity/'));
    expect(activityWrite?.data).toMatchObject({
      deepLink: '/activity?manageMembersTeamId=team_1&filter=pending',
      metadata: {
        navigationTarget: 'manage-members',
        teamId: 'team_1',
        initialFilter: 'pending',
      },
    });
  });
});

describe('notifyMembershipApproved', () => {
  it('notifies the approved athlete that the team accepted them', async () => {
    const { db, writes } = createMockFirestore({
      Teams: {
        team_1: {
          teamName: 'Varsity',
        },
      },
    });

    const result = await notifyMembershipApproved(db, {
      teamId: 'team_1',
      userId: 'athlete_1',
      approvedBy: 'coach_1',
    });

    const notificationWrite = writes.find((write) => write.path.startsWith('Notifications/'));
    const activityWrite = writes.find((write) =>
      write.path.startsWith('Users/athlete_1/activity/')
    );

    expect(result).toMatchObject({
      dispatched: true,
      notificationId: 'team_membership_approved_team_1_athlete_1',
    });
    expect(notificationWrite?.data).toMatchObject({
      userId: 'athlete_1',
      type: NOTIFICATION_TYPES.TEAM_MEMBER_JOINED,
      title: "You're on Varsity",
      body: 'Your request to join Varsity was accepted.',
      data: {
        type: NOTIFICATION_TYPES.TEAM_MEMBER_JOINED,
        deepLink: '',
        teamId: 'team_1',
        approvedBy: 'coach_1',
      },
    });
    expect(activityWrite?.data).toMatchObject({
      title: "You're on Varsity",
      body: 'Your request to join Varsity was accepted.',
      deepLink: '',
      source: { teamName: 'Varsity' },
    });
  });
});

describe('notifyMembershipRemoved', () => {
  it('notifies the removed member and the team creator on admin removal', async () => {
    const { db, writes } = createMockFirestore({
      Teams: {
        team_1: {
          teamName: 'Varsity',
          createdBy: 'owner_1',
        },
      },
    });

    const result = await notifyMembershipRemoved(db, {
      teamId: 'team_1',
      userId: 'athlete_1',
      removedBy: 'coach_1',
      memberName: 'Ava Runner',
    });

    const notificationWrites = writes.filter((write) => write.path.startsWith('Notifications/'));

    expect(result).toEqual({ removedUserNotified: true, managerNotified: true });
    expect(notificationWrites.map((write) => write.data.userId)).toEqual(
      expect.arrayContaining(['athlete_1', 'owner_1'])
    );
    expect(notificationWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'athlete_1',
            type: NOTIFICATION_TYPES.TEAM_MEMBER_LEFT,
            title: 'You were removed from Varsity',
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'owner_1',
            type: NOTIFICATION_TYPES.TEAM_MEMBER_LEFT,
            title: 'A member was removed from your team',
          }),
        }),
      ])
    );
  });

  it('notifies only the team creator when a member leaves on their own', async () => {
    const { db, writes } = createMockFirestore({
      Teams: {
        team_1: {
          teamName: 'Varsity',
          createdBy: 'owner_1',
        },
      },
    });

    const result = await notifyMembershipRemoved(db, {
      teamId: 'team_1',
      userId: 'athlete_1',
      removedBy: 'athlete_1',
      memberName: 'Ava Runner',
    });

    const notificationWrites = writes.filter((write) => write.path.startsWith('Notifications/'));

    expect(result).toEqual({ removedUserNotified: false, managerNotified: true });
    expect(notificationWrites.map((write) => write.data.userId)).toEqual(['owner_1']);
    expect(notificationWrites[0]?.data).toMatchObject({
      type: NOTIFICATION_TYPES.TEAM_MEMBER_LEFT,
      title: 'A member left your team',
      body: 'Ava Runner left Varsity.',
    });
  });

  it('dispatches TEAM_MEMBER_LEFT only to Teams.createdBy when athlete self-removes via a fallback-resolved teamId', async () => {
    // Simulates the scenario where the athlete's sports[n].team had no teamId
    // (only name + organizationId) and the teamId was recovered via
    // resolvePreviousTeamIdFromRoster() before calling notifyMembershipRemoved.
    const { db, writes } = createMockFirestore({
      Teams: {
        fallback_team_1: {
          teamName: 'Varsity Basketball',
          createdBy: 'director_uid',
        },
      },
    });

    const result = await notifyMembershipRemoved(db, {
      teamId: 'fallback_team_1',
      userId: 'athlete_uid',
      removedBy: 'athlete_uid', // self-leave
      memberName: 'Jordan Smith',
    });

    const notificationWrites = writes.filter((w) => w.path.startsWith('Notifications/'));

    expect(result).toEqual({ removedUserNotified: false, managerNotified: true });
    expect(notificationWrites).toHaveLength(1);
    expect(notificationWrites[0]?.data).toMatchObject({
      userId: 'director_uid',
      type: NOTIFICATION_TYPES.TEAM_MEMBER_LEFT,
      title: 'A member left your team',
      body: 'Jordan Smith left Varsity Basketball.',
    });
    // Athlete must NOT receive a notification for their own self-leave
    expect(notificationWrites.map((w) => w.data.userId)).not.toContain('athlete_uid');
  });

  it('does not notify active team directors when a member leaves on their own unless they created the team', async () => {
    const { db, writes } = createMockFirestore({
      Teams: {
        team_1: {
          teamName: 'Varsity',
          createdBy: 'owner_1',
        },
      },
      RosterEntries: {
        director_entry: {
          teamId: 'team_1',
          userId: 'director_1',
          role: 'director',
          status: 'active',
        },
        athlete_entry: {
          teamId: 'team_1',
          userId: 'athlete_1',
          role: 'athlete',
          status: 'active',
        },
      },
    });

    const result = await notifyMembershipRemoved(db, {
      teamId: 'team_1',
      userId: 'athlete_1',
      removedBy: 'athlete_1',
      memberName: 'Ava Runner',
    });

    const notificationWrites = writes.filter((write) => write.path.startsWith('Notifications/'));

    expect(result).toEqual({ removedUserNotified: false, managerNotified: true });
    expect(notificationWrites.map((write) => write.data.userId)).toEqual(['owner_1']);
    expect(notificationWrites).toHaveLength(1);
    expect(notificationWrites[0]?.data).toMatchObject({
      userId: 'owner_1',
      type: NOTIFICATION_TYPES.TEAM_MEMBER_LEFT,
      title: 'A member left your team',
      body: 'Ava Runner left Varsity.',
    });
  });
});
