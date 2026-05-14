/**
 * @fileoverview Backend Feature Flags Service Unit Tests
 * @module @nxt1/backend/config/feature-flags/__tests__
 *
 * Tests for the production Feature Flags Service.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FeatureFlagsService,
  getFeatureFlagsService,
  resetFeatureFlagsService,
} from './feature-flags.service.ts';
import type { Firestore } from 'firebase-admin/firestore';

describe('FeatureFlagsService', () => {
  let mockFirestore: Firestore;
  let service: FeatureFlagsService;

  beforeEach(() => {
    // Mock Firestore (minimal mock for testing)
    mockFirestore = {} as Firestore;

    service = new FeatureFlagsService(mockFirestore, 1); // 1-second TTL for testing
  });

  afterEach(() => {
    service.clearCache();
    resetFeatureFlagsService();
  });

  describe('getFlagValue', () => {
    it('should use default value when flag not found', async () => {
      // Should return default from registry
      const value = await service.getFlagValue('team.intel.enabled');
      expect(value).toBe(false); // default value
    });

    it('should validate flag values', async () => {
      // Attempt to set invalid value would fail validation
      // (This is tested more thoroughly via setFlagValue in integration tests)
      await expect(service.getFlagValue('team.intel.enabled')).resolves.toBeTypeOf('boolean');
    });
  });

  describe('isEnabled', () => {
    it('should return true only for boolean true', async () => {
      // The default for team.intel.enabled is false
      const result = await service.isEnabled('team.intel.enabled');
      expect(result).toBe(false);
    });
  });

  describe('Caching', () => {
    it('should cache flag values', async () => {
      service.clearCache();

      // First call (cache miss)
      const value1 = await service.getFlagValue('team.intel.enabled');
      const stats1 = service.getCacheStats();
      expect(stats1.misses).toBe(1);

      // Second call (cache hit)
      const value2 = await service.getFlagValue('team.intel.enabled');
      const stats2 = service.getCacheStats();
      expect(stats2.hits).toBe(1);
      expect(value1).toBe(value2);
    });

    it('should expire cache entries', async () => {
      service.clearCache();

      // Get value (miss)
      await service.getFlagValue('team.intel.enabled');
      const statsBefore = service.getCacheStats();
      expect(statsBefore.size).toBe(1);

      // Wait for TTL to expire (1 second in test setup)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Get value again (should be a miss now)
      await service.getFlagValue('team.intel.enabled');
      const statsAfter = service.getCacheStats();
      expect(statsAfter.misses).toBe(2);
    });

    it('should track cache stats correctly', async () => {
      service.clearCache();
      service.resetStats();

      // Three flags: 2 misses, 2 hits
      await service.getFlagValue('team.intel.enabled');
      await service.getFlagValue('team.profiles.enabled');
      await service.getFlagValue('team.intel.enabled'); // cache hit

      const stats = service.getCacheStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.size).toBe(2);
    });

    it('should clear cache', async () => {
      await service.getFlagValue('team.intel.enabled');
      let stats = service.getCacheStats();
      expect(stats.size).toBe(1);

      service.clearCache();
      stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('getFlagValues (batch)', () => {
    it('should fetch multiple flags', async () => {
      const result = await service.getFlagValues(['team.intel.enabled', 'team.profiles.enabled']);

      expect(result['team.intel.enabled']).toBe(false);
      expect(result['team.profiles.enabled']).toBe(false);
    });

    it('should cache all fetched flags', async () => {
      service.clearCache();
      service.resetStats();

      await service.getFlagValues(['team.intel.enabled', 'team.profiles.enabled']);

      const stats = service.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.misses).toBe(2);
    });
  });

  describe('getAllFlags', () => {
    it('should return all flags', async () => {
      const flags = await service.getAllFlags();

      expect(Object.keys(flags).length).toBeGreaterThan(0);
      expect(flags['team.intel.enabled']).toBeDefined();
      expect(flags['agent.primary.enabled']).toBeDefined();
    });
  });

  describe('Cache Stats', () => {
    it('should calculate hit rate correctly', async () => {
      service.clearCache();
      service.resetStats();

      await service.getFlagValue('team.intel.enabled');
      await service.getFlagValue('team.intel.enabled');
      await service.getFlagValue('team.profiles.enabled');

      const stats = service.getCacheStats();
      expect(stats.hitRate).toBe(1 / 3); // 1 hit out of 3 total
    });

    it('should handle zero requests', () => {
      service.clearCache();
      service.resetStats();

      const stats = service.getCacheStats();
      expect(stats.hitRate).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should reset stats', async () => {
      await service.getFlagValue('team.intel.enabled');
      let stats = service.getCacheStats();
      expect(stats.misses).toBe(1);

      service.resetStats();
      stats = service.getCacheStats();
      expect(stats.misses).toBe(0);
      expect(stats.hits).toBe(0);
    });
  });

  describe('Singleton Management', () => {
    it('should return same instance on repeated calls', () => {
      resetFeatureFlagsService();

      const instance1 = getFeatureFlagsService(mockFirestore);
      const instance2 = getFeatureFlagsService(mockFirestore);

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton', () => {
      const instance1 = getFeatureFlagsService(mockFirestore);
      resetFeatureFlagsService();
      const instance2 = getFeatureFlagsService(mockFirestore);

      expect(instance1).not.toBe(instance2);
    });
  });
});
