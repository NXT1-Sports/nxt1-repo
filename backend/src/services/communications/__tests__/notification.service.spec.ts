import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import { dispatch, dispatchToMany } from '../notification.service.js';

interface RecordedWrite {
  readonly path: string;
  readonly data: Record<string, unknown>;
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

function createMockFirestore(): {
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

  const db = {
    batch: vi.fn(() => batch),
    collection: vi.fn((name: string) => ({
      doc: (id: string) => createMockDocRef(`${name}/${id}`),
    })),
  } as unknown as Firestore;

  return { db, writes };
}

describe('notification.service billing activity mapping', () => {
  it.each([
    NOTIFICATION_TYPES.CREDITS_ADDED,
    NOTIFICATION_TYPES.PAYMENT_FAILED,
    NOTIFICATION_TYPES.ORG_WALLET_REFILLED,
  ])('writes %s as an announcement activity item', async (type) => {
    const { db, writes } = createMockFirestore();

    await dispatch(db, {
      userId: 'user_123',
      type,
      title: 'Billing notice',
      body: 'Body copy',
      source: { userName: 'NXT1 Billing' },
    });

    const activityWrite = writes.find((write) => write.path.includes('/activity/'));

    expect(activityWrite).toBeDefined();
    expect(activityWrite?.data.type).toBe('announcement');
    expect(activityWrite?.data.tab).toBe('alerts');
  });

  it.each([NOTIFICATION_TYPES.EMAIL_OPENED, NOTIFICATION_TYPES.LINK_CLICKED])(
    'writes %s as an update activity item',
    async (type) => {
      const { db, writes } = createMockFirestore();

      await dispatch(db, {
        userId: 'user_123',
        type,
        title: 'Email engagement',
        body: 'A recipient engaged with your email.',
        source: { userName: 'Email analytics' },
      });

      const activityWrite = writes.find((write) => write.path.includes('/activity/'));

      expect(activityWrite).toBeDefined();
      expect(activityWrite?.data.type).toBe('update');
      expect(activityWrite?.data.tab).toBe('alerts');
    }
  );
});

describe('dispatchToMany', () => {
  it('scopes explicit idempotency keys per recipient so push docs are not overwritten', async () => {
    const { db, writes } = createMockFirestore();

    await dispatchToMany(db, ['coach_1', 'admin_1'], {
      type: NOTIFICATION_TYPES.TEAM_JOIN_REQUEST,
      title: 'Ava requested to join Varsity',
      body: 'Tap to review and approve the request.',
      data: { teamId: 'team_1' },
      idempotencyKey: 'team_joined_team_1_athlete_1_pending',
    });

    const notificationWrites = writes.filter((write) => write.path.startsWith('Notifications/'));

    expect(notificationWrites).toHaveLength(2);
    expect(notificationWrites.map((write) => write.path)).toEqual(
      expect.arrayContaining([
        'Notifications/team_joined_team_1_athlete_1_pending_coach_1',
        'Notifications/team_joined_team_1_athlete_1_pending_admin_1',
      ])
    );
    expect(notificationWrites.map((write) => write.data.userId)).toEqual(
      expect.arrayContaining(['coach_1', 'admin_1'])
    );
  });
});
