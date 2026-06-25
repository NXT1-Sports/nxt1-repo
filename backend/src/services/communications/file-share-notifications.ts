import type { Firestore } from 'firebase-admin/firestore';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import { dispatch } from './notification.service.js';
import { logger } from '../../utils/logger.js';

export interface NotifyDirectFileShareInput {
  readonly resourceType: 'file' | 'folder';
  readonly resourceId: string;
  readonly resourceName: string;
  readonly teamId?: string;
  readonly organizationId?: string;
  readonly recipientUserId: string;
  readonly sharerUserId: string;
  readonly sharerName?: string | null;
  readonly sharerAvatarUrl?: string | null;
  readonly permission: 'read' | 'write';
}

export interface NotifyDirectFileShareResult {
  readonly dispatched: boolean;
  readonly notificationId: string | null;
}

export async function notifyDirectFileShare(
  db: Firestore,
  input: NotifyDirectFileShareInput
): Promise<NotifyDirectFileShareResult> {
  const sharerName = input.sharerName?.trim() || 'A teammate';
  const resourceName = input.resourceName.trim() || 'Untitled';
  const resourceLabel = input.resourceType === 'folder' ? 'folder' : 'file';
  const permissionLabel = input.permission === 'write' ? 'can edit' : 'can view';
  const type =
    input.resourceType === 'folder'
      ? NOTIFICATION_TYPES.FOLDER_SHARED
      : NOTIFICATION_TYPES.FILE_SHARED;
  const timeBucket = Math.floor(Date.now() / (5 * 60 * 1000));

  try {
    const result = await dispatch(db, {
      userId: input.recipientUserId,
      type,
      title: `${sharerName} shared a ${resourceLabel} with you`,
      body: `${resourceName} - You ${permissionLabel}.`,
      deepLink: '/activity',
      data: {
        entityId: input.resourceId,
        resourceId: input.resourceId,
        resourceType: input.resourceType,
        permission: input.permission,
        ...(input.teamId ? { teamId: input.teamId } : {}),
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      },
      metadata: {
        navigationTarget: 'team-files',
        resourceId: input.resourceId,
        resourceType: input.resourceType,
        permission: input.permission,
        ...(input.teamId ? { teamId: input.teamId } : {}),
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      },
      source: {
        userId: input.sharerUserId,
        userName: sharerName,
        ...(input.sharerAvatarUrl ? { avatarUrl: input.sharerAvatarUrl } : {}),
      },
      idempotencyKey: `direct_share_${input.resourceType}_${input.resourceId}_${input.recipientUserId}_${input.permission}_${timeBucket}`,
    });

    logger.info('[notifyDirectFileShare] Dispatched file-share notification', {
      recipientUserId: input.recipientUserId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      permission: input.permission,
      notificationId: result.notificationId,
    });

    return { dispatched: true, notificationId: result.notificationId };
  } catch (err) {
    logger.error('[notifyDirectFileShare] Failed to dispatch file-share notification', {
      recipientUserId: input.recipientUserId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      permission: input.permission,
      error: err instanceof Error ? err.message : String(err),
    });
    return { dispatched: false, notificationId: null };
  }
}
