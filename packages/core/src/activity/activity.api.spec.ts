/**
 * @fileoverview Activity API Factory Tests
 * @module @nxt1/core/activity
 *
 * Pure Vitest tests for createActivityApi — no TestBed, no Angular.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActivityApi } from './activity.api';
import type { HttpAdapter } from '../api/http-adapter';

function createMockHttp(): HttpAdapter {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

describe('createActivityApi', () => {
  let http: HttpAdapter;
  let api: ReturnType<typeof createActivityApi>;

  beforeEach(() => {
    http = createMockHttp();
    api = createActivityApi(http, '/api/v1');
  });

  // ============================================
  // getFeed
  // ============================================

  describe('getFeed', () => {
    it('should fetch feed without filters', async () => {
      const mockResponse = {
        success: true,
        items: [{ id: '1', title: 'Test', type: 'like', tab: 'alerts' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasMore: false },
        badges: { all: 1, inbox: 0, agent: 0, alerts: 1 },
      };
      vi.mocked(http.get).mockResolvedValue(mockResponse);

      const result = await api.getFeed();

      expect(http.get).toHaveBeenCalledWith('/api/v1/activity/feed');
      expect(result).toEqual(mockResponse);
    });

    it('should throw on API error', async () => {
      vi.mocked(http.get).mockResolvedValue({
        success: false,
        error: 'Server error',
      });

      await expect(api.getFeed()).rejects.toThrow();
    });

    it('should wrap network errors in NxtApiError', async () => {
      vi.mocked(http.get).mockRejectedValue(new Error('Network failure'));

      await expect(api.getFeed()).rejects.toThrow('Network failure');
    });
  });

  // ============================================
  // getItem
  // ============================================

  describe('getItem', () => {
    it('should fetch a single item by ID', async () => {
      const item = { id: '42', title: 'Test', type: 'like', tab: 'alerts' };
      vi.mocked(http.get).mockResolvedValue({ success: true, data: item });

      const result = await api.getItem('42');

      expect(http.get).toHaveBeenCalledWith('/api/v1/activity/42');
      expect(result).toEqual(item);
    });

    it('should return null when item not found', async () => {
      vi.mocked(http.get).mockResolvedValue({ success: false, error: 'Not found' });

      const result = await api.getItem('missing');

      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      vi.mocked(http.get).mockRejectedValue(new Error('Network error'));

      const result = await api.getItem('42');

      expect(result).toBeNull();
    });
  });

  // ============================================
  // markRead
  // ============================================

  describe('markRead', () => {
    it('should post IDs to mark read endpoint', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: true,
        count: 2,
        badges: { all: 3, inbox: 1, agent: 1, alerts: 1 },
      });

      const result = await api.markRead(['id1', 'id2']);

      expect(http.post).toHaveBeenCalledWith('/api/v1/activity/read', { ids: ['id1', 'id2'] });
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });

    it('should throw on failure', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: false,
        error: 'Failed',
      });

      await expect(api.markRead(['id1'])).rejects.toThrow('Failed');
    });
  });

  // ============================================
  // markAllRead
  // ============================================

  describe('markAllRead', () => {
    it('should post tab to mark-all-read endpoint', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: true,
        count: 5,
        badges: { all: 0, inbox: 0, agent: 0, alerts: 0 },
      });

      const result = await api.markAllRead('alerts');

      expect(http.post).toHaveBeenCalledWith('/api/v1/activity/read-all', { tab: 'alerts' });
      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // getBadges
  // ============================================

  describe('getBadges', () => {
    it('should return badge counts per tab', async () => {
      const badges = { all: 10, inbox: 3, agent: 2, alerts: 5 };
      vi.mocked(http.get).mockResolvedValue({ success: true, badges });

      const result = await api.getBadges();

      expect(http.get).toHaveBeenCalledWith('/api/v1/activity/badges');
      expect(result).toEqual(badges);
    });

    it('should throw when badges missing', async () => {
      vi.mocked(http.get).mockResolvedValue({ success: true });

      await expect(api.getBadges()).rejects.toThrow('Failed to fetch badges');
    });
  });

  // ============================================
  // getSummary
  // ============================================

  describe('getSummary', () => {
    it('should return activity summary', async () => {
      const summary = {
        totalUnread: 10,
        badges: { all: 10, inbox: 3, agent: 2, alerts: 5 },
        lastActivity: '2026-03-01T12:00:00Z',
      };
      vi.mocked(http.get).mockResolvedValue({ success: true, data: summary });

      const result = await api.getSummary();

      expect(http.get).toHaveBeenCalledWith('/api/v1/activity/summary');
      expect(result).toEqual(summary);
    });

    it('should throw when data missing', async () => {
      vi.mocked(http.get).mockResolvedValue({ success: false, error: 'Unauthorized' });

      await expect(api.getSummary()).rejects.toThrow('Unauthorized');
    });
  });

  // ============================================
  // archive
  // ============================================

  describe('archive', () => {
    it('should post IDs to archive endpoint', async () => {
      vi.mocked(http.post).mockResolvedValue({ success: true, count: 3 });

      const result = await api.archive(['a', 'b', 'c']);

      expect(http.post).toHaveBeenCalledWith('/api/v1/activity/archive', { ids: ['a', 'b', 'c'] });
      expect(result).toEqual({ success: true, count: 3 });
    });

    it('should throw on failure', async () => {
      vi.mocked(http.post).mockResolvedValue({ success: false, error: 'Forbidden' });

      await expect(api.archive(['a'])).rejects.toThrow('Forbidden');
    });
  });

  // ============================================
  // restore
  // ============================================

  describe('restore', () => {
    it('should post IDs to restore endpoint', async () => {
      vi.mocked(http.post).mockResolvedValue({ success: true, count: 1 });

      const result = await api.restore(['a']);

      expect(http.post).toHaveBeenCalledWith('/api/v1/activity/archive/restore', { ids: ['a'] });
      expect(result).toEqual({ success: true, count: 1 });
    });

    it('should throw on failure', async () => {
      vi.mocked(http.post).mockResolvedValue({ success: false, error: 'Not found' });

      await expect(api.restore(['x'])).rejects.toThrow('Not found');
    });
  });
});
