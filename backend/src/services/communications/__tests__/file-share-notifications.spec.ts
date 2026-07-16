import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import { notifyDirectFileShare } from '../file-share-notifications.js';
import { dispatch } from '../notification.service.js';

vi.mock('../notification.service.js', () => ({
  dispatch: vi.fn().mockResolvedValue({ activityId: 'activity-1', notificationId: 'notif-1' }),
}));

describe('notifyDirectFileShare', () => {
  beforeEach(() => {
    vi.mocked(dispatch).mockClear();
  });

  it('dispatches file share notifications with file metadata', async () => {
    const result = await notifyDirectFileShare({} as Firestore, {
      resourceType: 'file',
      resourceId: 'file-123',
      resourceName: 'Scout Report',
      teamId: 'team-123',
      organizationId: 'org-123',
      recipientUserId: 'user-2',
      sharerUserId: 'owner-1',
      sharerName: 'Coach Carter',
      sharerAvatarUrl: 'https://example.com/avatar.jpg',
      permission: 'write',
    });

    expect(result).toEqual({ dispatched: true, notificationId: 'notif-1' });
    expect(dispatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-2',
        type: NOTIFICATION_TYPES.FILE_SHARED,
        title: 'Coach Carter shared a file with you',
        body: 'Scout Report - You can edit.',
        deepLink: '/activity',
        source: expect.objectContaining({
          userId: 'owner-1',
          userName: 'Coach Carter',
          avatarUrl: 'https://example.com/avatar.jpg',
        }),
        metadata: expect.objectContaining({
          resourceId: 'file-123',
          resourceType: 'file',
          permission: 'write',
          navigationTarget: 'team-files',
        }),
        data: expect.objectContaining({
          entityId: 'file-123',
          resourceId: 'file-123',
          resourceType: 'file',
          permission: 'write',
          teamId: 'team-123',
          organizationId: 'org-123',
        }),
      })
    );
  });

  it('uses the folder notification type and fallback sharer label', async () => {
    await notifyDirectFileShare({} as Firestore, {
      resourceType: 'folder',
      resourceId: 'folder-123',
      resourceName: 'Playbooks',
      recipientUserId: 'user-2',
      sharerUserId: 'owner-1',
      permission: 'read',
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-2',
        type: NOTIFICATION_TYPES.FOLDER_SHARED,
        title: 'A teammate shared a folder with you',
        body: 'Playbooks - You can view.',
      })
    );
  });
});
