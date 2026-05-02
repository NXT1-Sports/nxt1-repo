/**
 * @fileoverview Smoke tests for the tool-loop detector.
 * Verifies signature determinism, threshold-based lockout, advisory
 * generation, and operationId-scoped release.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/agent-app-config.js', () => ({
  getCachedAgentAppConfig: () => ({
    primary: {
      toolLoopDetector: { enabled: true, windowSize: 5, threshold: 3, emptyThreshold: 4 },
    },
  }),
}));

const { ToolLoopDetector } = await import('../tool-loop-detector.service.js');

describe('ToolLoopDetector', () => {
  let detector: InstanceType<typeof ToolLoopDetector>;

  beforeEach(() => {
    detector = new ToolLoopDetector();
  });

  afterEach(() => {
    detector.release('op-1');
  });

  it('signature is deterministic for identical args', () => {
    const a = ToolLoopDetector.signature('search', '{"q":"foo"}');
    const b = ToolLoopDetector.signature('search', '{"q":"foo"}');
    expect(a).toBe(b);
    expect(a).toContain('search::');
  });

  it('signature differs for different args', () => {
    const a = ToolLoopDetector.signature('search', '{"q":"foo"}');
    const b = ToolLoopDetector.signature('search', '{"q":"bar"}');
    expect(a).not.toBe(b);
  });

  it('does not lock out below threshold', () => {
    const r1 = detector.record('op-1', 'search', '{"q":"x"}', 'failure');
    const r2 = detector.record('op-1', 'search', '{"q":"x"}', 'failure');
    expect(r1.advisory).toBeNull();
    expect(r2.advisory).toBeNull();
    expect(detector.checkLockout('op-1', 'search')).toBeNull();
  });

  it('locks tool on threshold-th repeated failure and emits advisory', () => {
    detector.record('op-1', 'search', '{"q":"x"}', 'failure');
    detector.record('op-1', 'search', '{"q":"x"}', 'failure');
    const result = detector.record('op-1', 'search', '{"q":"x"}', 'failure');

    expect(result.advisory).toContain('search');
    expect(result.advisory).toContain('locked');

    const lockoutMsg = detector.checkLockout('op-1', 'search');
    expect(lockoutMsg).toContain('tool_loop_aborted');
    expect(lockoutMsg).toContain('search');
  });

  it('success resets the failure counter for that signature', () => {
    detector.record('op-1', 'search', '{"q":"x"}', 'failure');
    detector.record('op-1', 'search', '{"q":"x"}', 'failure');
    detector.record('op-1', 'search', '{"q":"x"}', 'success');
    const result = detector.record('op-1', 'search', '{"q":"x"}', 'failure');
    expect(result.advisory).toBeNull();
    expect(detector.checkLockout('op-1', 'search')).toBeNull();
  });

  // ── Empty result spiral detection ─────────────────────────────────────────

  it('does not fire empty advisory below emptyThreshold', () => {
    const r1 = detector.record('op-1', 'query', '{"collection":"A"}', 'empty');
    const r2 = detector.record('op-1', 'query', '{"collection":"B"}', 'empty');
    const r3 = detector.record('op-1', 'query', '{"collection":"C"}', 'empty');
    expect(r1.advisory).toBeNull();
    expect(r2.advisory).toBeNull();
    expect(r3.advisory).toBeNull();
  });

  it('fires one-shot empty advisory at emptyThreshold (different args)', () => {
    detector.record('op-1', 'query', '{"collection":"A"}', 'empty');
    detector.record('op-1', 'query', '{"collection":"B"}', 'empty');
    detector.record('op-1', 'query', '{"collection":"C"}', 'empty');
    const r4 = detector.record('op-1', 'query', '{"collection":"D"}', 'empty');
    expect(r4.advisory).toContain('SYSTEM NOTICE');
    expect(r4.advisory).toContain('query');
    expect(r4.advisory).toContain('STOP searching');

    // One-shot: a fifth empty call should NOT re-fire the advisory
    const r5 = detector.record('op-1', 'query', '{"collection":"E"}', 'empty');
    expect(r5.advisory).toBeNull();
  });

  it('non-empty success resets the empty counter', () => {
    detector.record('op-1', 'query', '{"collection":"A"}', 'empty');
    detector.record('op-1', 'query', '{"collection":"B"}', 'empty');
    detector.record('op-1', 'query', '{"collection":"C"}', 'empty');
    // Non-empty success resets the counter
    detector.record('op-1', 'query', '{"collection":"D"}', 'success');
    // Counter starts fresh — no advisory yet
    const r = detector.record('op-1', 'query', '{"collection":"E"}', 'empty');
    expect(r.advisory).toBeNull();
  });

  it('empty spiral is scoped per operationId', () => {
    for (let i = 0; i < 4; i++) {
      detector.record('op-1', 'query', `{"collection":"${i}"}`, 'empty');
    }
    // op-2 started fresh — no advisory for it
    const r = detector.record('op-2', 'query', '{"collection":"X"}', 'empty');
    expect(r.advisory).toBeNull();
  });

  it('lockout is scoped per operationId', () => {
    detector.record('op-1', 'search', '{"q":"x"}', 'failure');
    detector.record('op-1', 'search', '{"q":"x"}', 'failure');
    detector.record('op-1', 'search', '{"q":"x"}', 'failure');
    expect(detector.checkLockout('op-1', 'search')).not.toBeNull();
    expect(detector.checkLockout('op-2', 'search')).toBeNull();
  });

  it('release clears state for the given operation', () => {
    detector.record('op-1', 'search', '{"q":"x"}', 'failure');
    detector.record('op-1', 'search', '{"q":"x"}', 'failure');
    detector.record('op-1', 'search', '{"q":"x"}', 'failure');
    expect(detector.checkLockout('op-1', 'search')).not.toBeNull();
    detector.release('op-1');
    expect(detector.checkLockout('op-1', 'search')).toBeNull();
  });

  it('returns null advisory and no lockout when operationId is undefined', () => {
    const r = detector.record(undefined, 'search', '{"q":"x"}', 'failure');
    expect(r.advisory).toBeNull();
    expect(detector.checkLockout(undefined, 'search')).toBeNull();
  });
});
