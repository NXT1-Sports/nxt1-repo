/**
 * @fileoverview Integration tests for the firebase_mutate handler scope verification
 * and mutation schema layer (verifySignedScopeEnvelope, FirebaseMcpMutateResultSchema).
 *
 * The MCP server runs as a subprocess and cannot be unit-tested through the
 * stdio transport. These tests validate the shared cryptographic and schema
 * primitives that the server uses to enforce security.
 */
import { describe, it, expect } from 'vitest';
import {
  createSignedScopeEnvelope,
  verifySignedScopeEnvelope,
  FirebaseMcpMutateResultSchema,
  FirebaseMcpMutateToolArgsSchema,
  type FirebaseMcpScope,
} from '../shared.js';

const TEST_SECRET = 'test-secret-key-32-chars-minimum!!';

function makeScope(overrides?: Partial<FirebaseMcpScope>): FirebaseMcpScope {
  return {
    userId: 'user-abc',
    teamIds: [],
    organizationIds: [],
    ...overrides,
  };
}

// ── Scope envelope sign / verify ─────────────────────────────────────────────

describe('createSignedScopeEnvelope + verifySignedScopeEnvelope', () => {
  it('round-trips a minimal scope', () => {
    const scope = makeScope();
    const envelope = createSignedScopeEnvelope(scope, TEST_SECRET);
    const verified = verifySignedScopeEnvelope(envelope, TEST_SECRET);
    expect(verified.userId).toBe('user-abc');
    expect(verified.teamIds).toEqual([]);
  });

  it('round-trips a scope with teamIds', () => {
    const scope = makeScope({ teamIds: ['team-1', 'team-2'], defaultTeamId: 'team-1' });
    const envelope = createSignedScopeEnvelope(scope, TEST_SECRET);
    const verified = verifySignedScopeEnvelope(envelope, TEST_SECRET);
    expect(verified.teamIds).toEqual(['team-1', 'team-2']);
    expect(verified.defaultTeamId).toBe('team-1');
  });

  it('throws on wrong secret', () => {
    const scope = makeScope();
    const envelope = createSignedScopeEnvelope(scope, TEST_SECRET);
    expect(() => verifySignedScopeEnvelope(envelope, 'wrong-secret')).toThrow();
  });

  it('throws on tampered signature', () => {
    const scope = makeScope();
    const envelope = createSignedScopeEnvelope(scope, TEST_SECRET);
    const tampered = { ...envelope, signature: `${envelope.signature}X` };
    expect(() => verifySignedScopeEnvelope(tampered, TEST_SECRET)).toThrow();
  });

  it('throws on tampered userId inside scope', () => {
    const scope = makeScope();
    const envelope = createSignedScopeEnvelope(scope, TEST_SECRET);
    const tampered = {
      ...envelope,
      scope: { ...envelope.scope, userId: 'attacker-id' },
    };
    expect(() => verifySignedScopeEnvelope(tampered, TEST_SECRET)).toThrow();
  });

  it('is deterministic — same scope + secret yields same envelope', () => {
    const scope = makeScope({ teamIds: ['t-1'] });
    const e1 = createSignedScopeEnvelope(scope, TEST_SECRET);
    const e2 = createSignedScopeEnvelope(scope, TEST_SECRET);
    expect(e1.signature).toBe(e2.signature);
  });

  it('different userId produces different signature', () => {
    const e1 = createSignedScopeEnvelope(makeScope({ userId: 'alice' }), TEST_SECRET);
    const e2 = createSignedScopeEnvelope(makeScope({ userId: 'bob' }), TEST_SECRET);
    expect(e1.signature).not.toBe(e2.signature);
  });
});

// ── FirebaseMcpMutateToolArgsSchema validation ───────────────────────────────

describe('FirebaseMcpMutateToolArgsSchema', () => {
  it('accepts a valid delete request', () => {
    const scope = makeScope();
    const envelope = createSignedScopeEnvelope(scope, TEST_SECRET);

    const result = FirebaseMcpMutateToolArgsSchema.safeParse({
      scopeEnvelope: envelope,
      operation: 'delete',
      collection: 'Awards',
      documentId: 'award-123',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a valid update request with patch', () => {
    const scope = makeScope();
    const envelope = createSignedScopeEnvelope(scope, TEST_SECRET);

    const result = FirebaseMcpMutateToolArgsSchema.safeParse({
      scopeEnvelope: envelope,
      operation: 'update',
      collection: 'Rankings',
      documentId: 'rank-456',
      patch: { rank: 15, stars: 4 },
    });

    expect(result.success).toBe(true);
  });

  it('rejects missing scopeEnvelope', () => {
    const result = FirebaseMcpMutateToolArgsSchema.safeParse({
      operation: 'delete',
      collection: 'Awards',
      documentId: 'award-1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid operation', () => {
    const scope = makeScope();
    const envelope = createSignedScopeEnvelope(scope, TEST_SECRET);

    const result = FirebaseMcpMutateToolArgsSchema.safeParse({
      scopeEnvelope: envelope,
      operation: 'insert',
      collection: 'Awards',
      documentId: 'award-1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty documentId', () => {
    const scope = makeScope();
    const envelope = createSignedScopeEnvelope(scope, TEST_SECRET);

    const result = FirebaseMcpMutateToolArgsSchema.safeParse({
      scopeEnvelope: envelope,
      operation: 'delete',
      collection: 'Awards',
      documentId: '',
    });
    expect(result.success).toBe(false);
  });
});

// ── FirebaseMcpMutateResultSchema ────────────────────────────────────────────

describe('FirebaseMcpMutateResultSchema', () => {
  it('accepts a success result', () => {
    const r = FirebaseMcpMutateResultSchema.safeParse({
      collection: 'Awards',
      documentId: 'award-1',
      operation: 'delete',
      success: true,
      message: 'Document deleted.',
    });
    expect(r.success).toBe(true);
  });

  it('accepts a failure result without message', () => {
    const r = FirebaseMcpMutateResultSchema.safeParse({
      collection: 'Rankings',
      documentId: 'rank-1',
      operation: 'update',
      success: false,
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing collection', () => {
    const r = FirebaseMcpMutateResultSchema.safeParse({
      documentId: 'doc-1',
      operation: 'delete',
      success: true,
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid operation in result', () => {
    const r = FirebaseMcpMutateResultSchema.safeParse({
      collection: 'Awards',
      documentId: 'doc-1',
      operation: 'upsert',
      success: true,
    });
    expect(r.success).toBe(false);
  });
});
