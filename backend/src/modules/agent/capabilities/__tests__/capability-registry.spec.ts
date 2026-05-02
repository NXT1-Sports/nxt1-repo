/**
 * @fileoverview Smoke tests for the capability registry.
 * Verifies snapshot caching, version-hash stability, listener notifications,
 * and idempotent auto-refresh start/stop.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/agent-app-config.js', () => ({
  getCachedAgentAppConfig: () => ({
    coordinators: [
      {
        id: 'social',
        name: 'Social',
        description: 'Handles posts and replies. Owns the feed.',
        capabilities: ['post', 'reply'],
      },
    ],
    capabilityCard: { refreshIntervalMs: 50 },
  }),
}));

vi.mock('../../config/coordinator-agent-ids.js', () => ({
  COORDINATOR_AGENT_IDS: ['social'],
}));

vi.mock('@nxt1/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    COORDINATOR_AGENT_IDS: ['social'],
  };
});

const { CapabilityRegistry } = await import('../capability-registry.js');

interface FakeToolRegistry {
  getDefinitions: () => unknown[];
}

function makeToolRegistry(definitions: unknown[]): FakeToolRegistry {
  return {
    getDefinitions: () => definitions,
  };
}

describe('CapabilityRegistry', () => {
  let registry: InstanceType<typeof CapabilityRegistry>;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    registry?.stopAutoRefresh();
    vi.useRealTimers();
  });

  it('refresh() returns a frozen capability card with versionHash', () => {
    const tools = makeToolRegistry([
      {
        name: 'search',
        description: 'Search the web.',
        isMutation: false,
        category: 'data',
      },
    ]);
    registry = new CapabilityRegistry(tools as never);

    const card = registry.refresh();

    expect(card.versionHash).toBeTruthy();
    expect(typeof card.versionHash).toBe('string');
    expect(Object.isFrozen(card)).toBe(true);
    expect(card.compact.tools).toHaveLength(1);
    expect(card.compact.tools[0]?.name).toBe('search');
    expect(card.rendered.compactMarkdown).toContain('search');
  });

  it('versionHash is stable when nothing changes', () => {
    const tools = makeToolRegistry([{ name: 'search', description: 'Search.', isMutation: false }]);
    registry = new CapabilityRegistry(tools as never);

    const a = registry.refresh().versionHash;
    const b = registry.refresh().versionHash;
    expect(a).toBe(b);
  });

  it('versionHash bumps when tool definitions change', () => {
    let defs: { name: string; description: string; isMutation: boolean }[] = [
      { name: 'search', description: 'Search.', isMutation: false },
    ];
    const tools = { getDefinitions: () => defs };
    registry = new CapabilityRegistry(tools as never);

    const a = registry.refresh().versionHash;
    defs = [
      { name: 'search', description: 'Search.', isMutation: false },
      { name: 'send_email', description: 'Send email.', isMutation: true },
    ];
    const b = registry.refresh().versionHash;
    expect(a).not.toBe(b);
  });

  it('subscribe() invokes listener on refresh and returns unsubscribe fn', () => {
    const tools = makeToolRegistry([{ name: 'search', description: 'Search.', isMutation: false }]);
    registry = new CapabilityRegistry(tools as never);

    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);

    registry.refresh();
    registry.refresh();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    registry.refresh();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('startAutoRefresh() is idempotent', () => {
    const tools = makeToolRegistry([{ name: 'search', description: 'Search.', isMutation: false }]);
    registry = new CapabilityRegistry(tools as never);
    const setIntervalSpy = vi.spyOn(global, 'setInterval');

    registry.startAutoRefresh();
    registry.startAutoRefresh();
    registry.startAutoRefresh();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('stopAutoRefresh() clears the timer and allows restart', () => {
    const tools = makeToolRegistry([{ name: 'search', description: 'Search.', isMutation: false }]);
    registry = new CapabilityRegistry(tools as never);
    const setIntervalSpy = vi.spyOn(global, 'setInterval');

    registry.startAutoRefresh();
    registry.stopAutoRefresh();
    registry.startAutoRefresh();

    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
  });
});
