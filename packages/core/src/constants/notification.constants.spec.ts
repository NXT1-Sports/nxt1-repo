import { describe, expect, it } from 'vitest';
import { NOTIFICATION_COLLECTIONS } from './notification.constants';

describe('NOTIFICATION_COLLECTIONS', () => {
  it('uses the canonical uppercase Notifications collection for the push queue', () => {
    expect(NOTIFICATION_COLLECTIONS.NOTIFICATIONS).toBe('Notifications');
  });

  it('does not point the push queue at the legacy lowercase notifications collection', () => {
    expect(NOTIFICATION_COLLECTIONS.NOTIFICATIONS).not.toBe('notifications');
  });
});
