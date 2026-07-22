import { describe, expect, it } from 'vitest';

import { resolveBillableFeature, resolveBillableFeatures } from '../feature-resolution.service.js';

describe('resolveBillableFeatures', () => {
  it('returns all meaningful successful action tools in execution order', () => {
    expect(
      resolveBillableFeatures({
        coordinatorId: 'data_coordinator',
        successfulTools: [
          'delegate_to_coordinator',
          'search_colleges',
          'write_season_stats',
          'write_recruiting_activity',
          'write_intel',
          'write_intel',
          'read_thread_history',
        ],
      })
    ).toEqual(['write-season-stats', 'write-recruiting-activity', 'write-intel']);
  });

  it('does not bill attempted tools when successful tool data has no billable actions', () => {
    expect(
      resolveBillableFeatures({
        feature: 'activity_usage',
        agentTools: ['query_profile', 'write_core_identity', 'write_calendar_events'],
        successfulTools: ['delegate_to_coordinator'],
      })
    ).toEqual(['activity-usage']);
  });

  it('falls back to meaningful attempted tools only when success data is unavailable', () => {
    expect(
      resolveBillableFeatures({
        feature: 'activity_usage',
        agentTools: ['query_profile', 'write_core_identity', 'write_calendar_events'],
      })
    ).toEqual(['write-core-identity', 'write-calendar-events']);
  });

  it('keeps existing fallback semantics as a single-item list', () => {
    expect(
      resolveBillableFeatures({
        feature: 'delegate_to_coordinator',
        coordinatorId: 'brand_coordinator',
      })
    ).toEqual(['brand-coordinator-execution']);
  });
});

describe('resolveBillableFeature', () => {
  it('selects a real action when successfulTools also contains coordinator delegation', () => {
    expect(
      resolveBillableFeature({
        coordinatorId: 'brand_coordinator',
        successfulTools: ['generate_graphic', 'delegate_to_coordinator'],
      })
    ).toBe('generate-graphic');
  });

  it('falls back to coordinator execution when only delegation succeeded', () => {
    expect(
      resolveBillableFeature({
        coordinatorId: 'recruiting_coordinator',
        successfulTools: ['delegate_to_coordinator'],
      })
    ).toBe('recruiting-coordinator-execution');
  });

  it('still skips passive tools when selecting a representative tool', () => {
    expect(
      resolveBillableFeature({
        coordinatorId: 'recruiting_coordinator',
        successfulTools: ['search_colleges', 'send_email', 'read_thread_history'],
      })
    ).toBe('send-email');
  });

  it('treats query_nxt1_data as passive after slug normalization', () => {
    expect(
      resolveBillableFeature({
        feature: 'activity_usage',
        successfulTools: ['query_nxt1_data'],
      })
    ).toBe('activity-usage');
  });

  it('does not bill list_nxt1_data_views when paired with a real action', () => {
    expect(
      resolveBillableFeatures({
        successfulTools: ['list_nxt1_data_views', 'dynamic_export'],
      })
    ).toEqual(['dynamic-export']);
  });

  it('ignores routing tools from attempted agentTools too', () => {
    expect(
      resolveBillableFeature({
        coordinatorId: 'strategy_coordinator',
        agentTools: ['generate_strategy_brief', 'delegate_to_coordinator'],
      })
    ).toBe('generate-strategy-brief');
  });

  it('does not allow an explicit routing feature to override coordinator fallback', () => {
    expect(
      resolveBillableFeature({
        feature: 'delegate_to_coordinator',
        coordinatorId: 'brand_coordinator',
      })
    ).toBe('brand-coordinator-execution');
  });

  it('keeps explicit user-facing features when no representative tool exists', () => {
    expect(
      resolveBillableFeature({
        feature: 'activity_usage',
        successfulTools: ['search_colleges'],
      })
    ).toBe('activity-usage');
  });

  it('uses the first resolved billable action as the representative feature', () => {
    expect(
      resolveBillableFeature({
        successfulTools: ['write_season_stats', 'write_recruiting_activity', 'write_intel'],
      })
    ).toBe('write-season-stats');
  });
});
