/**
 * @fileoverview Crashlytics Adapter Unit Tests
 * @module @nxt1/core/crashlytics
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createNoOpCrashlyticsAdapter,
  createMemoryCrashlyticsAdapter,
} from './crashlytics-adapter';
import {
  CRASH_KEYS,
  isSensitiveKey,
  maskSensitiveData,
  getSeverityForStatus,
} from './crashlytics.constants';

describe('createNoOpCrashlyticsAdapter', () => {
  it('should initialize without errors', async () => {
    const adapter = createNoOpCrashlyticsAdapter();
    await expect(adapter.initialize()).resolves.not.toThrow();
  });

  it('should report not enabled', async () => {
    const adapter = createNoOpCrashlyticsAdapter();
    await adapter.initialize();
    expect(await adapter.isEnabled()).toBe(false);
  });

  it('should be ready after initialization', async () => {
    const adapter = createNoOpCrashlyticsAdapter();
    await adapter.initialize();
    expect(adapter.isReady()).toBe(true);
  });

  it('should handle setUserId without error', async () => {
    const adapter = createNoOpCrashlyticsAdapter();
    await adapter.initialize();
    await expect(adapter.setUserId('user123')).resolves.not.toThrow();
  });

  it('should handle recordException without error', async () => {
    const adapter = createNoOpCrashlyticsAdapter();
    await adapter.initialize();
    await expect(adapter.recordException({ message: 'Test error' })).resolves.not.toThrow();
  });

  it('should log in debug mode', async () => {
    const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {
      /* no-op for test */
    });
    const adapter = createNoOpCrashlyticsAdapter();
    await adapter.initialize({ debug: true });

    await adapter.setUserId('user123');

    expect(consoleSpy).toHaveBeenCalledWith('[Crashlytics:NoOp] setUserId:', 'user123');
    consoleSpy.mockRestore();
  });
});

describe('createMemoryCrashlyticsAdapter', () => {
  let adapter: ReturnType<typeof createMemoryCrashlyticsAdapter>;

  beforeEach(async () => {
    adapter = createMemoryCrashlyticsAdapter();
    await adapter.initialize({ enabled: true });
  });

  it('should initialize with enabled=true', async () => {
    expect(await adapter.isEnabled()).toBe(true);
  });

  it('should record exceptions', async () => {
    await adapter.recordException({ message: 'Test error', code: 'TEST_001' });

    const exceptions = adapter.getRecordedExceptions();
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].message).toBe('Test error');
    expect(exceptions[0].code).toBe('TEST_001');
  });

  it('should record errors with severity', async () => {
    const error = new Error('Test JS error');
    await adapter.recordError(error, 'warning');

    const exceptions = adapter.getRecordedExceptions();
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].severity).toBe('warning');
  });

  it('should track breadcrumbs', async () => {
    await adapter.addBreadcrumb({
      type: 'navigation',
      message: 'Navigated to /home',
    });

    const breadcrumbs = adapter.getRecordedBreadcrumbs();
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0].type).toBe('navigation');
    expect(breadcrumbs[0].timestamp).toBeDefined();
  });

  it('should track simple logs', async () => {
    await adapter.log('User clicked button');

    const breadcrumbs = adapter.getRecordedBreadcrumbs();
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0].type).toBe('console');
    expect(breadcrumbs[0].message).toBe('User clicked button');
  });

  it('should set and get custom keys', async () => {
    await adapter.setCustomKey('user_role', 'athlete');
    await adapter.setCustomKey('is_premium', true);
    await adapter.setCustomKey('level', 42);

    const keys = adapter.getRecordedCustomKeys();
    expect(keys['user_role']).toBe('athlete');
    expect(keys['is_premium']).toBe(true);
    expect(keys['level']).toBe(42);
  });

  it('should set multiple custom keys at once', async () => {
    await adapter.setCustomKeys({
      user_role: 'coach',
      team_id: 'team123',
    });

    const keys = adapter.getRecordedCustomKeys();
    expect(keys['user_role']).toBe('coach');
    expect(keys['team_id']).toBe('team123');
  });

  it('should set and clear user', async () => {
    await adapter.setUser({
      userId: 'user456',
      email: 'test@example.com',
      displayName: 'Test User',
    });

    expect(adapter.getCurrentUser()).toEqual({
      userId: 'user456',
      email: 'test@example.com',
      displayName: 'Test User',
    });

    await adapter.clearUser();
    expect(adapter.getCurrentUser()).toBeNull();
  });

  it('should clear all data', async () => {
    await adapter.recordException({ message: 'Error' });
    await adapter.addBreadcrumb({ type: 'ui', message: 'Click' });
    await adapter.setCustomKey('key', 'value');

    adapter.clear();

    expect(adapter.getRecordedExceptions()).toHaveLength(0);
    expect(adapter.getRecordedBreadcrumbs()).toHaveLength(0);
    expect(adapter.getRecordedCustomKeys()).toEqual({});
  });

  it('should not record when disabled', async () => {
    await adapter.setEnabled(false);
    await adapter.recordException({ message: 'Should not record' });

    expect(adapter.getRecordedExceptions()).toHaveLength(0);
  });
});

describe('CRASH_KEYS', () => {
  it('should have user context keys', () => {
    expect(CRASH_KEYS.USER_ROLE).toBe('user_role');
    expect(CRASH_KEYS.USER_ID).toBe('user_id');
    expect(CRASH_KEYS.SUBSCRIPTION_TIER).toBe('subscription_tier');
  });

  it('should have app context keys', () => {
    expect(CRASH_KEYS.APP_VERSION).toBe('app_version');
    expect(CRASH_KEYS.ENVIRONMENT).toBe('environment');
  });

  it('should have session context keys', () => {
    expect(CRASH_KEYS.SCREEN_NAME).toBe('screen_name');
    expect(CRASH_KEYS.PREVIOUS_SCREEN).toBe('previous_screen');
  });
});

describe('isSensitiveKey', () => {
  it('should identify sensitive keys', () => {
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('userPassword')).toBe(true);
    expect(isSensitiveKey('api_key')).toBe(true);
    expect(isSensitiveKey('authorization')).toBe(true);
    expect(isSensitiveKey('access_token')).toBe(true);
  });

  it('should allow non-sensitive keys', () => {
    expect(isSensitiveKey('username')).toBe(false);
    expect(isSensitiveKey('email')).toBe(false);
    expect(isSensitiveKey('screen_name')).toBe(false);
    expect(isSensitiveKey('user_role')).toBe(false);
  });
});

describe('maskSensitiveData', () => {
  it('should mask sensitive values', () => {
    const data = {
      username: 'john',
      password: 'secret123',
      api_key: 'abc123',
    };

    const masked = maskSensitiveData(data);

    expect(masked.username).toBe('john');
    expect(masked.password).toBe('[REDACTED]');
    expect(masked.api_key).toBe('[REDACTED]');
  });

  it('should mask nested sensitive values', () => {
    const data = {
      user: {
        name: 'john',
        credentials: {
          password: 'secret',
        },
      },
    };

    const masked = maskSensitiveData(data);

    expect((masked.user as Record<string, unknown>)['name']).toBe('john');
    expect(
      ((masked.user as Record<string, unknown>)['credentials'] as Record<string, unknown>)[
        'password'
      ]
    ).toBe('[REDACTED]');
  });
});

describe('getSeverityForStatus', () => {
  it('should map 4xx to warning', () => {
    expect(getSeverityForStatus(400)).toBe('warning');
    expect(getSeverityForStatus(401)).toBe('warning');
    expect(getSeverityForStatus(403)).toBe('warning');
    expect(getSeverityForStatus(429)).toBe('warning');
  });

  it('should map 404 to info', () => {
    expect(getSeverityForStatus(404)).toBe('info');
  });

  it('should map 5xx to error', () => {
    expect(getSeverityForStatus(500)).toBe('error');
    expect(getSeverityForStatus(502)).toBe('error');
    expect(getSeverityForStatus(503)).toBe('error');
  });

  it('should handle unknown status codes', () => {
    expect(getSeverityForStatus(418)).toBe('warning'); // I'm a teapot
    expect(getSeverityForStatus(599)).toBe('error');
    expect(getSeverityForStatus(200)).toBe('info');
  });
});
