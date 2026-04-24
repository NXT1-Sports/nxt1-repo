/**
 * @fileoverview Unit Tests for Operations Log Helper Functions
 * @module @nxt1/backend/routes/__tests__/operations-log-helpers
 *
 * Pure function tests — no TestBed, no mocks required.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateJobOrigin,
  isScheduledOrigin,
  mapJobStatus,
  inferCategory,
  iconForCategory,
  computeDuration,
  type TimestampLike,
} from '../agent/operations-log.helpers.js';

// ─── validateJobOrigin ──────────────────────────────────────────────────────

describe('validateJobOrigin', () => {
  it.each([
    ['user', 'user'],
    ['system_cron', 'system_cron'],
    ['database_event', 'database_event'],
    ['webhook', 'webhook'],
    ['agent_chain', 'agent_chain'],
  ] as const)('returns "%s" for valid input "%s"', (input, expected) => {
    expect(validateJobOrigin(input)).toBe(expected);
  });

  it('defaults to "user" for unrecognised strings', () => {
    expect(validateJobOrigin('unknown_origin')).toBe('user');
    expect(validateJobOrigin('')).toBe('user');
  });

  it('defaults to "user" for non-string types', () => {
    expect(validateJobOrigin(undefined)).toBe('user');
    expect(validateJobOrigin(null)).toBe('user');
    expect(validateJobOrigin(42)).toBe('user');
    expect(validateJobOrigin(true)).toBe('user');
    expect(validateJobOrigin({})).toBe('user');
  });
});

// ─── isScheduledOrigin ─────────────────────────────────────────────────────

describe('isScheduledOrigin', () => {
  it('returns true for recurring cron jobs', () => {
    expect(isScheduledOrigin('system_cron')).toBe(true);
  });

  it.each(['user', 'database_event', 'webhook', 'agent_chain'] as const)(
    'returns false for non-scheduled origin "%s"',
    (origin) => {
      expect(isScheduledOrigin(origin)).toBe(false);
    }
  );
});

// ─── mapJobStatus ───────────────────────────────────────────────────────────

describe('mapJobStatus', () => {
  it.each([
    ['completed', 'complete'],
    ['failed', 'error'],
    ['cancelled', 'cancelled'],
    ['pending', 'in-progress'],
    ['queued', 'in-progress'],
    ['processing', 'in-progress'],
    ['thinking', 'in-progress'],
    ['acting', 'in-progress'],
  ] as const)('maps "%s" → "%s"', (input, expected) => {
    expect(mapJobStatus(input)).toBe(expected);
  });

  it('maps unknown status to "in-progress"', () => {
    expect(mapJobStatus('some_future_status')).toBe('in-progress');
  });

  it('invokes onUnknown callback for unrecognised statuses', () => {
    const onUnknown = vi.fn();
    mapJobStatus('weird_status', onUnknown);
    expect(onUnknown).toHaveBeenCalledWith('weird_status');
  });

  it('does not invoke onUnknown for known statuses', () => {
    const onUnknown = vi.fn();
    mapJobStatus('completed', onUnknown);
    mapJobStatus('failed', onUnknown);
    mapJobStatus('pending', onUnknown);
    expect(onUnknown).not.toHaveBeenCalled();
  });

  it('handles empty string as unknown', () => {
    expect(mapJobStatus('')).toBe('in-progress');
  });
});

// ─── inferCategory ──────────────────────────────────────────────────────────

describe('inferCategory', () => {
  it.each([
    ['Send email to coaches', 'outreach'],
    ['Generate highlight reel', 'content'],
    ['Review game film', 'film'],
    ['NCAA recruiting camp', 'recruiting'],
    ['Analyze stats report', 'analytics'],
    ['Update my profile bio', 'profile'],
  ] as const)('infers "%s" → "%s"', (intent, expected) => {
    expect(inferCategory(intent)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(inferCategory('SEND EMAIL')).toBe('outreach');
    expect(inferCategory('Generate VIDEO')).toBe('content');
  });

  it('returns "system" when no keywords match', () => {
    expect(inferCategory('Do something generic')).toBe('system');
    expect(inferCategory('')).toBe('system');
  });

  it('returns first-match for overlapping keywords', () => {
    // "coach" is in outreach, "video" is in content → outreach wins (first match)
    expect(inferCategory('Coach me on video editing')).toBe('outreach');
  });
});

// ─── iconForCategory ────────────────────────────────────────────────────────

describe('iconForCategory', () => {
  it.each([
    ['outreach', 'mail'],
    ['content', 'sparkles'],
    ['film', 'videocam'],
    ['recruiting', 'school'],
    ['analytics', 'barChart'],
    ['profile', 'person'],
    ['system', 'settings'],
  ] as const)('returns "%s" for category "%s"', (category, icon) => {
    expect(iconForCategory(category)).toBe(icon);
  });
});

// ─── computeDuration ────────────────────────────────────────────────────────

describe('computeDuration', () => {
  const ts = (ms: number): TimestampLike => ({ toMillis: () => ms });

  it('computes duration between two timestamps', () => {
    expect(computeDuration(ts(0), ts(135_000))).toBe('2m 15s');
  });

  it('formats seconds with leading zero', () => {
    expect(computeDuration(ts(0), ts(62_000))).toBe('1m 02s');
  });

  it('returns "0m 00s" when diff is zero', () => {
    expect(computeDuration(ts(5000), ts(5000))).toBe('0m 00s');
  });

  it('returns "0m 00s" when diff is negative', () => {
    expect(computeDuration(ts(10_000), ts(5_000))).toBe('0m 00s');
  });

  it('returns undefined when createdAt is missing', () => {
    expect(computeDuration(undefined, ts(1000))).toBeUndefined();
  });

  it('returns undefined when completedAt is missing', () => {
    expect(computeDuration(ts(1000), undefined)).toBeUndefined();
    expect(computeDuration(ts(1000), null)).toBeUndefined();
  });

  it('returns undefined when both are missing', () => {
    expect(computeDuration(undefined, undefined)).toBeUndefined();
  });

  it('returns undefined for malformed timestamp objects', () => {
    expect(computeDuration({} as TimestampLike, ts(1000))).toBeUndefined();
    expect(computeDuration(ts(1000), {} as TimestampLike)).toBeUndefined();
  });

  it('returns undefined for non-finite millisecond values', () => {
    expect(computeDuration(ts(NaN), ts(1000))).toBeUndefined();
    expect(computeDuration(ts(1000), ts(Infinity))).toBeUndefined();
  });
});
