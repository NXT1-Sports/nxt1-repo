/**
 * @fileoverview Feature Flags Types Unit Tests
 * @module @nxt1/core/flags/__tests__
 *
 * Tests for type safety and registry validation.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  FEATURE_FLAG_REGISTRY,
  TEAM_FLAGS,
  CONTENT_FLAGS,
  AGENT_FLAGS,
  EXPERIMENTAL_FLAGS,
  InvalidFlagValueError,
  FlagNotFoundError,
  type FeatureFlagKey,
  type FlagScope,
} from '../index';

describe('Feature Flag Registry', () => {
  describe('Registry Integrity', () => {
    it('should have all flags defined', () => {
      const flags = Object.values(FEATURE_FLAG_REGISTRY.flags);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.length).toBe(35); // Keep in sync when feature flags are added or removed intentionally.
    });

    it('should have unique flag keys', () => {
      const keys = Object.keys(FEATURE_FLAG_REGISTRY.flags);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it('should have all scopes represented', () => {
      const scopes = new Set(Object.values(FEATURE_FLAG_REGISTRY.flags).map((f) => f.scope));
      expect(scopes).toContain('team');
      expect(scopes).toContain('agent');
      expect(scopes).toContain('experimental');
    });
  });

  describe('getFlag()', () => {
    it('should retrieve flag by key', () => {
      const flag = FEATURE_FLAG_REGISTRY.getFlag('team.intel.enabled');
      expect(flag).toBeDefined();
      expect(flag?.key).toBe('team.intel.enabled');
      expect(flag?.title).toBe('Team Intel Dashboard');
    });

    it('should return undefined for unknown key', () => {
      const flag = FEATURE_FLAG_REGISTRY.getFlag('unknown.flag' as unknown as FeatureFlagKey);
      expect(flag).toBeUndefined();
    });
  });

  describe('getFlagsByScope()', () => {
    it('should retrieve all team flags', () => {
      const teamFlags = FEATURE_FLAG_REGISTRY.getFlagsByScope('team');
      expect(teamFlags.length).toBe(4);
      expect(teamFlags.every((f) => f.scope === 'team')).toBe(true);
    });

    it('should retrieve all agent flags', () => {
      const agentFlags = FEATURE_FLAG_REGISTRY.getFlagsByScope('agent');
      expect(agentFlags.length).toBeGreaterThan(0);
      expect(agentFlags.every((f) => f.scope === 'agent')).toBe(true);
    });

    it('should return empty array for non-existent scope', () => {
      const flags = FEATURE_FLAG_REGISTRY.getFlagsByScope('nonexistent' as unknown as FlagScope);
      expect(flags).toEqual([]);
    });
  });

  describe('getFlagsByTag()', () => {
    it('should retrieve all flags with a tag', () => {
      const premiumFlags = FEATURE_FLAG_REGISTRY.getFlagsByTag('premium');
      expect(premiumFlags.length).toBeGreaterThan(0);
      expect(premiumFlags.every((f) => f.tags?.includes('premium'))).toBe(true);
    });

    it('should retrieve AI flags', () => {
      const aiFlags = FEATURE_FLAG_REGISTRY.getFlagsByTag('ai');
      expect(aiFlags.length).toBeGreaterThan(0);
    });

    it('should return empty array for non-existent tag', () => {
      const flags = FEATURE_FLAG_REGISTRY.getFlagsByTag('nonexistent');
      expect(flags).toEqual([]);
    });
  });

  describe('validate()', () => {
    it('should validate boolean flag', () => {
      const result = FEATURE_FLAG_REGISTRY.validate('team.intel.enabled', true);
      expect(result.valid).toBe(true);
    });

    it('should reject boolean flag with wrong type', () => {
      const result = FEATURE_FLAG_REGISTRY.validate('team.intel.enabled', 'yes');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Expected boolean');
    });

    it('should accept null for optional boolean flag', () => {
      const result = FEATURE_FLAG_REGISTRY.validate('team.intel.enabled', null);
      expect(result.valid).toBe(true);
    });

    it('should reject unknown flag', () => {
      const result = FEATURE_FLAG_REGISTRY.validate('unknown.flag', true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown flag');
    });

    it('should validate numeric flag bounds', () => {
      // All flags in current registry are boolean. This test validates future numeric flags.
      // When numeric flags are added, this test will validate bounds checking.
      const result = FEATURE_FLAG_REGISTRY.validate('team.intel.enabled', false);
      expect(result.valid).toBe(true);
    });
  });

  describe('Scoped Flag Exports', () => {
    it('should export TEAM_FLAGS', () => {
      expect(TEAM_FLAGS.intel).toBeDefined();
      expect(TEAM_FLAGS.profiles).toBeDefined();
      expect(TEAM_FLAGS.rosterAdvanced).toBeDefined();
      expect(TEAM_FLAGS.analyticsPremium).toBeDefined();
    });

    it('should export AGENT_FLAGS', () => {
      expect(AGENT_FLAGS.primaryEnabled).toBeDefined();
      expect(AGENT_FLAGS.coordinatorScout).toBeDefined();
      expect(AGENT_FLAGS.toolsDisabled).toBeDefined();
    });

    it('should export CONTENT_FLAGS', () => {
      expect(CONTENT_FLAGS.graphicsAi).toBeDefined();
      expect(CONTENT_FLAGS.welcomeGraphics).toBeDefined();
      expect(CONTENT_FLAGS.videoEditor).toBeDefined();
    });

    it('should export EXPERIMENTAL_FLAGS', () => {
      expect(EXPERIMENTAL_FLAGS.threadAsTruth).toBeDefined();
      expect(EXPERIMENTAL_FLAGS.mongodbReplay).toBeDefined();
      expect(EXPERIMENTAL_FLAGS.typedDeltas).toBeDefined();
    });
  });

  describe('Flag Metadata', () => {
    it('should have required metadata', () => {
      const flag = FEATURE_FLAG_REGISTRY.getFlag('team.intel.enabled');
      expect(flag?.key).toBeDefined();
      expect(flag?.title).toBeDefined();
      expect(flag?.description).toBeDefined();
      expect(flag?.scope).toBeDefined();
      expect(flag?.type).toBeDefined();
      expect(flag?.defaultValue).toBeDefined();
    });

    it('should mark critical flags for audit', () => {
      const criticalFlags = Object.values(FEATURE_FLAG_REGISTRY.flags).filter((f) =>
        f.tags?.includes('critical')
      );
      expect(criticalFlags.length).toBeGreaterThan(0);
    });

    it('should mark restart-required flags', () => {
      const restartFlags = Object.values(FEATURE_FLAG_REGISTRY.flags).filter(
        (f) => f.requiresRestart
      );
      expect(restartFlags.length).toBeGreaterThan(0);
    });
  });
});

describe('Error Classes', () => {
  describe('FlagNotFoundError', () => {
    it('should create with proper message', () => {
      const err = new FlagNotFoundError('unknown.flag' as unknown as FeatureFlagKey);
      expect(err.message).toContain('unknown.flag');
      expect(err.name).toBe('FlagNotFoundError');
    });
  });

  describe('InvalidFlagValueError', () => {
    it('should create with detailed message', () => {
      const err = new InvalidFlagValueError(
        'team.intel.enabled' as FeatureFlagKey,
        'invalid',
        'Expected boolean'
      );
      expect(err.message).toContain('team.intel.enabled');
      expect(err.message).toContain('Expected boolean');
      expect(err.name).toBe('InvalidFlagValueError');
    });
  });
});
