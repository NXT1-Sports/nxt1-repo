/**
 * @fileoverview Connected Sources Helpers Unit Tests
 * @module @nxt1/core/profile
 *
 * Pure function tests — no TestBed, no Angular.
 */

import { describe, expect, it } from 'vitest';
import {
  buildLinkSourcesFormData,
  mapToConnectedSources,
  mapConnectedEmailsToLinkSources,
  mapConnectedSourcesToLinkSources,
  mapFirebaseProvidersToLinkSources,
  connectedSourceKey,
  mergeLinkSources,
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
        faviconUrl: 'https://icons.duckduckgo.com/ip3/hudl.com.ico',
        platform: 'hudl',
        profileUrl: 'https://hudl.com/p/1',
        scopeType: undefined,
        scopeId: undefined,
      },
      {
        faviconUrl: 'https://icons.duckduckgo.com/ip3/x.com.ico',
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

describe('buildLinkSourcesFormData', () => {
  it('should map canonical connected sources into link rows', () => {
    const result = buildLinkSourcesFormData({
      connectedSources: [
        {
          platform: 'hudl',
          profileUrl: 'https://hudl.com/p/123',
          scopeType: 'sport',
          scopeId: 'football',
        },
      ],
    });

    expect(result).toEqual({
      links: [
        {
          platform: 'hudl',
          connected: true,
          connectionType: 'link',
          url: 'https://hudl.com/p/123',
          scopeType: 'sport',
          scopeId: 'football',
        },
      ],
    });
  });

  it('should add firebase and email sign-in providers without duplicates', () => {
    const result = buildLinkSourcesFormData({
      firebaseProviders: [{ providerId: 'google.com' }],
      connectedEmails: [
        { provider: 'gmail', isActive: true },
        { provider: 'microsoft', isActive: true },
      ],
    });

    expect(result).toEqual({
      links: [
        {
          platform: 'google',
          connected: true,
          connectionType: 'signin',
          scopeType: 'global',
        },
        {
          platform: 'microsoft',
          connected: true,
          connectionType: 'signin',
          scopeType: 'global',
        },
      ],
    });
  });
});

describe('mapConnectedSourcesToLinkSources', () => {
  it('should preserve scope metadata', () => {
    expect(
      mapConnectedSourcesToLinkSources([
        {
          platform: 'maxpreps',
          profileUrl: 'https://maxpreps.com/team',
          scopeType: 'team',
          scopeId: 'team-1',
        },
      ])
    ).toEqual([
      {
        platform: 'maxpreps',
        connected: true,
        connectionType: 'link',
        url: 'https://maxpreps.com/team',
        scopeType: 'team',
        scopeId: 'team-1',
      },
    ]);
  });
});

describe('mapFirebaseProvidersToLinkSources', () => {
  it('should map supported firebase providers to sign-in links', () => {
    expect(
      mapFirebaseProvidersToLinkSources([
        { providerId: 'google.com' },
        { providerId: 'microsoft.com' },
        { providerId: 'password' },
      ])
    ).toEqual([
      {
        platform: 'google',
        connected: true,
        connectionType: 'signin',
        scopeType: 'global',
      },
      {
        platform: 'microsoft',
        connected: true,
        connectionType: 'signin',
        scopeType: 'global',
      },
    ]);
  });
});

describe('mapConnectedEmailsToLinkSources', () => {
  it('should skip inactive emails and already-connected firebase providers', () => {
    expect(
      mapConnectedEmailsToLinkSources(
        [
          { provider: 'gmail', isActive: true },
          { provider: 'microsoft', isActive: false },
          { provider: 'microsoft', isActive: true },
        ],
        ['google']
      )
    ).toEqual([
      {
        platform: 'microsoft',
        connected: true,
        connectionType: 'signin',
        scopeType: 'global',
      },
    ]);
  });
});

describe('mergeLinkSources', () => {
  it('should preserve separate sign-in and link entries for the same platform', () => {
    expect(
      mergeLinkSources(
        [
          {
            platform: 'google',
            connected: true,
            connectionType: 'signin',
            scopeType: 'global',
          },
        ],
        [
          {
            platform: 'google',
            connected: true,
            connectionType: 'link',
            url: 'https://google.com/profile',
            scopeType: 'global',
          },
        ]
      )
    ).toEqual([
      {
        platform: 'google',
        connected: true,
        connectionType: 'signin',
        scopeType: 'global',
      },
      {
        platform: 'google',
        connected: true,
        connectionType: 'link',
        url: 'https://google.com/profile',
        scopeType: 'global',
      },
    ]);
  });
});
