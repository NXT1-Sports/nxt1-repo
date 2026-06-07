import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import { notifyMembershipApproved, notifyTeamJoined } from '../team-join-notifications.js';

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
        deepLink: '/team/team_1',
        teamId: 'team_1',
        approvedBy: 'coach_1',
      },
    });
    expect(activityWrite?.data).toMatchObject({
      title: "You're on Varsity",
      body: 'Your request to join Varsity was accepted.',
      deepLink: '/team/team_1',
      source: { teamName: 'Varsity' },
    });
  });
});
