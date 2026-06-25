import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_COLLECTIONS,
  NOTIFICATION_DEEP_LINKS,
  NOTIFICATION_TYPE_CATEGORY,
  NOTIFICATION_TYPE_TAB,
  isHighPriorityNotification,
} from './notification.constants';

describe('NOTIFICATION_COLLECTIONS', () => {
  it('uses the canonical uppercase Notifications collection for the push queue', () => {
    expect(NOTIFICATION_COLLECTIONS.NOTIFICATIONS).toBe('Notifications');
  });

  it('does not point the push queue at the legacy lowercase notifications collection', () => {
    expect(NOTIFICATION_COLLECTIONS.NOTIFICATIONS).not.toBe('notifications');
  });
});

describe('wallet-empty notification metadata', () => {
  it('maps personal and org wallet-empty alerts to billing and alerts', () => {
    expect(NOTIFICATION_TYPE_CATEGORY['wallet_empty']).toBe('billing');
    expect(NOTIFICATION_TYPE_CATEGORY['org_wallet_empty']).toBe('billing');
    expect(NOTIFICATION_TYPE_TAB['wallet_empty']).toBe('alerts');
    expect(NOTIFICATION_TYPE_TAB['org_wallet_empty']).toBe('alerts');
  });

  it('routes wallet-empty alerts into the usage overview', () => {
    expect(NOTIFICATION_DEEP_LINKS['wallet_empty']).toBe('/usage?section=overview');
    expect(NOTIFICATION_DEEP_LINKS['org_wallet_empty']).toBe('/usage?section=overview');
  });

  it('treats wallet-empty alerts as high priority', () => {
    expect(isHighPriorityNotification('wallet_empty')).toBe(true);
    expect(isHighPriorityNotification('org_wallet_empty')).toBe(true);
  });
});

describe('file-share notification metadata', () => {
  it('maps file and folder shares to content alerts', () => {
    expect(NOTIFICATION_TYPE_CATEGORY['file_shared']).toBe('content');
    expect(NOTIFICATION_TYPE_CATEGORY['folder_shared']).toBe('content');
    expect(NOTIFICATION_TYPE_TAB['file_shared']).toBe('alerts');
    expect(NOTIFICATION_TYPE_TAB['folder_shared']).toBe('alerts');
  });

  it('routes file and folder share alerts into activity', () => {
    expect(NOTIFICATION_DEEP_LINKS['file_shared']).toBe('/activity');
    expect(NOTIFICATION_DEEP_LINKS['folder_shared']).toBe('/activity');
  });
});
