/**
 * @fileoverview Smoke tests for the tool-loop detector.
 * Verifies signature determinism, threshold-based lockout, advisory
 * generation, and operationId-scoped release.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/agent-app-config.js', () => ({
  getCachedAgentAppConfig: () => ({
    primary: {
      toolLoopDetector: { enabled: true, windowSize: 5, threshold: 3 },
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
