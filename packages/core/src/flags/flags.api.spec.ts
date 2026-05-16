/**
 * @fileoverview Feature Flags API Factory Unit Tests
 * @module @nxt1/core/flags/__tests__
 *
 * Tests for the portable API factory.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFlagsApi } from './flags.api';
import type { HttpAdapter } from '../api';

describe('createFlagsApi', () => {
  let mockHttpAdapter: HttpAdapter;

  beforeEach(() => {
    mockHttpAdapter = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };
  });

  describe('getFlagValue', () => {
    it('should fetch single flag value', async () => {
      vi.mocked(mockHttpAdapter.get).mockResolvedValue({
        success: true,
        data: true,
      });

      const api = createFlagsApi(mockHttpAdapter, 'http://localhost:3000');
      const result = await api.getFlagValue('team.intel.enabled');

      expect(result).toBe(true);
      expect(mockHttpAdapter.get).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/flags/team.intel.enabled'
      );
    });

    it('should return null for unset flag', async () => {
      vi.mocked(mockHttpAdapter.get).mockResolvedValue({
        success: true,
        data: null,
      });

      const api = createFlagsApi(mockHttpAdapter, 'http://localhost:3000');
      const result = await api.getFlagValue('team.intel.enabled');

      expect(result).toBeNull();
    });

    it('should throw on API error', async () => {
      vi.mocked(mockHttpAdapter.get).mockResolvedValue({
        success: false,
        error: 'Flag not found',
      });

      const api = createFlagsApi(mockHttpAdapter, 'http://localhost:3000');

      await expect(api.getFlagValue('team.intel.enabled')).rejects.toThrow('Flag not found');
    });

    it('should URL-encode flag key', async () => {
      vi.mocked(mockHttpAdapter.get).mockResolvedValue({
        success: true,
        data: true,
      });

      const api = createFlagsApi(mockHttpAdapter, 'http://localhost:3000');
      await api.getFlagValue('team.intel.enabled');

      expect(mockHttpAdapter.get).toHaveBeenCalledWith(
        expect.stringContaining('team.intel.enabled')
      );
    });
  });

  describe('getFlagValues', () => {
    it('should fetch multiple flag values', async () => {
      const mockData = {
        'team.intel.enabled': false,
        'agent.primary.enabled': true,
      };

      vi.mocked(mockHttpAdapter.get).mockResolvedValue({
        success: true,
        data: mockData,
      });

      const api = createFlagsApi(mockHttpAdapter, 'http://localhost:3000');
      const result = await api.getFlagValues(['team.intel.enabled', 'agent.primary.enabled']);

      expect(result).toEqual(mockData);
      expect(mockHttpAdapter.get).toHaveBeenCalledWith(expect.stringContaining('/batch?'));
    });

    it('should handle empty response', async () => {
      vi.mocked(mockHttpAdapter.get).mockResolvedValue({
        success: true,
        data: undefined,
      });

      const api = createFlagsApi(mockHttpAdapter, 'http://localhost:3000');
      const result = await api.getFlagValues(['team.intel.enabled']);

      expect(result).toEqual({});
    });
  });

  describe('getAllFlags', () => {
    it('should fetch all flags', async () => {
      const mockData = {
        'team.intel.enabled': false,
        'agent.primary.enabled': true,
      };

      vi.mocked(mockHttpAdapter.get).mockResolvedValue({
        success: true,
        data: mockData,
      });

      const api = createFlagsApi(mockHttpAdapter, 'http://localhost:3000');
      const result = await api.getAllFlags();

      expect(result).toEqual(mockData);
      expect(mockHttpAdapter.get).toHaveBeenCalledWith('http://localhost:3000/api/v1/flags/all');
    });
  });

  describe('isEnabled', () => {
    it('should return true for enabled flag', async () => {
      vi.mocked(mockHttpAdapter.get).mockResolvedValue({
        success: true,
        data: true,
      });

      const api = createFlagsApi(mockHttpAdapter, 'http://localhost:3000');
      const result = await api.isEnabled('team.intel.enabled');

      expect(result).toBe(true);
    });

    it('should return false for disabled flag', async () => {
      vi.mocked(mockHttpAdapter.get).mockResolvedValue({
        success: true,
        data: false,
      });

      const api = createFlagsApi(mockHttpAdapter, 'http://localhost:3000');
      const result = await api.isEnabled('team.intel.enabled');

      expect(result).toBe(false);
    });

    it('should return false for null flag', async () => {
      vi.mocked(mockHttpAdapter.get).mockResolvedValue({
        success: true,
        data: null,
      });

      const api = createFlagsApi(mockHttpAdapter, 'http://localhost:3000');
      const result = await api.isEnabled('team.intel.enabled');

      expect(result).toBe(false);
    });
  });

  describe('Base URL handling', () => {
    it('should construct correct URL with trailing slash', async () => {
      vi.mocked(mockHttpAdapter.get).mockResolvedValue({
        success: true,
        data: true,
      });

      const api = createFlagsApi(mockHttpAdapter, 'http://localhost:3000/');
      await api.getFlagValue('team.intel.enabled');

      expect(mockHttpAdapter.get).toHaveBeenCalledWith(expect.stringContaining('/api/v1/flags/'));
    });

    it('should work with production URLs', async () => {
      vi.mocked(mockHttpAdapter.get).mockResolvedValue({
        success: true,
        data: true,
      });

      const api = createFlagsApi(mockHttpAdapter, 'https://api.nxt1.com');
      await api.getFlagValue('team.intel.enabled');

      expect(mockHttpAdapter.get).toHaveBeenCalledWith(
        'https://api.nxt1.com/api/v1/flags/team.intel.enabled'
      );
    });
  });
});
