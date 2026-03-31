/**
 * @fileoverview Connected Sources Helpers Unit Tests
 * @module @nxt1/core/profile
 *
 * Pure function tests — no TestBed, no Angular.
 */

import { describe, expect, it } from 'vitest';
import {
  mapToConnectedSources,
  connectedSourceKey,
  mergeConnectedSources,
} from './connected-sources.helpers';
import type { ConnectedSource } from '../models/user/user-base.model';

describe('mapToConnectedSources', () => {
  it('should map connected entries with URLs', () => {
    const entries = [
      { platform: 'hudl', connected: true, url: 'https://hudl.com/p/1' },
      { platform: 'twitter', connected: true, url: 'https://twitter.com/user' },
    ];

    const result = mapToConnectedSources(entries);

    expect(result).toEqual([
      {
        platform: 'hudl',
        profileUrl: 'https://hudl.com/p/1',
        scopeType: undefined,
        scopeId: undefined,
      },
      {
        platform: 'twitter',
        profileUrl: 'https://twitter.com/user',
        scopeType: undefined,
        scopeId: undefined,
      },
    ]);
  });

  it('should filter out disconnected entries', () => {
    const entries = [
      { platform: 'hudl', connected: false, url: 'https://hudl.com/p/1' },
      { platform: 'twitter', connected: true, url: 'https://twitter.com/user' },
    ];

    const result = mapToConnectedSources(entries);
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe('twitter');
  });

  it('should filter out entries with empty URLs', () => {
    const entries = [
      { platform: 'hudl', connected: true, url: '' },
      { platform: 'twitter', connected: true, url: '  ' },
      { platform: 'instagram', connected: true, url: 'https://instagram.com/user' },
    ];

    const result = mapToConnectedSources(entries);
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe('instagram');
  });

  it('should handle empty array', () => {
    expect(mapToConnectedSources([])).toEqual([]);
  });

  it('should preserve scopeType and scopeId', () => {
    const entries = [
      {
        platform: 'hudl',
        connected: true,
        url: 'https://hudl.com',
        scopeType: 'sport' as const,
        scopeId: 'football',
      },
    ];

    const result = mapToConnectedSources(entries);
    expect(result[0].scopeType).toBe('sport');
    expect(result[0].scopeId).toBe('football');
  });
});

describe('connectedSourceKey', () => {
  it('should create key with platform and scope', () => {
    const source: ConnectedSource = {
      platform: 'hudl',
      profileUrl: 'https://hudl.com/p/1',
      scopeType: 'sport',
      scopeId: 'football',
    };

    expect(connectedSourceKey(source)).toBe('hudl|sport|football');
  });

  it('should default scopeType to global when undefined', () => {
    const source: ConnectedSource = {
      platform: 'twitter',
      profileUrl: 'https://twitter.com/user',
    };

    expect(connectedSourceKey(source)).toBe('twitter|global|');
  });
});

describe('mergeConnectedSources', () => {
  it('should merge without duplicates', () => {
    const existing: ConnectedSource[] = [
      {
        platform: 'hudl',
        profileUrl: 'https://hudl.com/old',
        scopeType: 'sport',
        scopeId: 'football',
      },
      { platform: 'twitter', profileUrl: 'https://twitter.com/old' },
    ];

    const incoming: ConnectedSource[] = [
      {
        platform: 'hudl',
        profileUrl: 'https://hudl.com/new',
        scopeType: 'sport',
        scopeId: 'football',
      },
      { platform: 'instagram', profileUrl: 'https://instagram.com/new' },
    ];

    const result = mergeConnectedSources(existing, incoming);

    expect(result).toHaveLength(3);
    // hudl should be overwritten by incoming
    const hudl = result.find((s: ConnectedSource) => s.platform === 'hudl');
    expect(hudl?.profileUrl).toBe('https://hudl.com/new');
    // twitter preserved
    expect(result.find((s: ConnectedSource) => s.platform === 'twitter')).toBeDefined();
    // instagram added
    expect(result.find((s: ConnectedSource) => s.platform === 'instagram')).toBeDefined();
  });

  it('should handle empty existing', () => {
    const incoming: ConnectedSource[] = [{ platform: 'hudl', profileUrl: 'https://hudl.com/new' }];

    const result = mergeConnectedSources([], incoming);
    expect(result).toHaveLength(1);
  });

  it('should handle empty incoming', () => {
    const existing: ConnectedSource[] = [{ platform: 'hudl', profileUrl: 'https://hudl.com/old' }];

    const result = mergeConnectedSources(existing, []);
    expect(result).toHaveLength(1);
  });
});
