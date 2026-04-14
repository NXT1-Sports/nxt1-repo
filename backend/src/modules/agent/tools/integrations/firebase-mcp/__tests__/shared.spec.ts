import { describe, expect, it } from 'vitest';
import {
  createSignedScopeEnvelope,
  decodeCursor,
  encodeCursor,
  normalizeViewLimit,
  verifySignedScopeEnvelope,
} from '../shared.js';

describe('Firebase MCP shared helpers', () => {
  it('signs and verifies trusted scope envelopes', () => {
    const secret = 'test-secret';
    const envelope = createSignedScopeEnvelope(
      {
        userId: 'user_123',
        teamIds: ['team_b', 'team_a', 'team_a'],
        organizationIds: ['org_b', 'org_a', 'org_a'],
        threadId: 'thread_456',
        sessionId: 'session_789',
      },
      secret
    );

    expect(verifySignedScopeEnvelope(envelope, secret)).toEqual({
      userId: 'user_123',
      teamIds: ['team_a', 'team_b'],
      organizationIds: ['org_a', 'org_b'],
      threadId: 'thread_456',
      sessionId: 'session_789',
    });
  });

  it('rejects tampered scope envelopes', () => {
    const secret = 'test-secret';
    const envelope = createSignedScopeEnvelope({ userId: 'user_123' }, secret);

    expect(() =>
      verifySignedScopeEnvelope(
        {
          ...envelope,
          scope: { userId: 'attacker_999' },
        },
        secret
      )
    ).toThrow('Invalid Firebase MCP scope signature');
  });

  it('encodes and decodes cursors', () => {
    const cursor = encodeCursor('2026-04-13T19:00:00.000Z');
    expect(decodeCursor(cursor)).toBe('2026-04-13T19:00:00.000Z');
  });

  it('clamps view limits into the supported range', () => {
    expect(normalizeViewLimit(undefined)).toBe(10);
    expect(normalizeViewLimit(0)).toBe(1);
    expect(normalizeViewLimit(500)).toBe(50);
    expect(normalizeViewLimit(12)).toBe(12);
  });
});
