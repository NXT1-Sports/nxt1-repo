/**
 * @fileoverview Unit tests for Release Notes API Factory
 * @module @nxt1/core/release-notes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReleaseNotesApi } from '../release-notes.api';
import type { HttpAdapter } from '../../api/http-adapter';
import type {
  SystemReleaseNote,
  LatestReleaseNoteResponse,
  ReleaseNotesHistoryResponse,
} from '../release-notes.types';

describe('createReleaseNotesApi', () => {
  let mockHttp: HttpAdapter;
  const baseUrl = 'https://api.nxt1sports.com/api/v1';

  const mockReleaseNote: SystemReleaseNote = {
    id: 'v1.98.0',
    version: '1.98.0',
    title: 'Agent X Film Review & Speed Boosts',
    summary:
      'Analyze game film faster with automated breakdown tools and high-speed video processing.',
    releaseDate: '2026-08-17T00:00:00.000Z',
    categories: {
      features: ['Automated film breakdown in Agent X', 'New interactive playbook drills'],
      enhancements: ['50% faster video timeline loading', 'Refreshed modal animations'],
      fixes: ['Resolved push notification deep-link routing on iOS'],
    },
    badgeTag: 'v1.98.0',
    ctaLabel: 'Explore Film Review',
    ctaRoute: '/film-review',
    isPublished: true,
  };

  beforeEach(() => {
    mockHttp = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
    } as unknown as HttpAdapter;
  });

  describe('getLatest()', () => {
    it('returns the latest release note when published', async () => {
      const mockResponse: LatestReleaseNoteResponse = {
        success: true,
        data: mockReleaseNote,
      };
      vi.mocked(mockHttp.get).mockResolvedValueOnce(mockResponse);

      const api = createReleaseNotesApi(mockHttp, baseUrl);
      const result = await api.getLatest();

      expect(mockHttp.get).toHaveBeenCalledWith(
        'https://api.nxt1sports.com/api/v1/system/release-notes/latest'
      );
      expect(result).toEqual(mockReleaseNote);
    });

    it('returns null when no release note is published', async () => {
      const mockResponse: LatestReleaseNoteResponse = {
        success: true,
        data: null,
      };
      vi.mocked(mockHttp.get).mockResolvedValueOnce(mockResponse);

      const api = createReleaseNotesApi(mockHttp, baseUrl);
      const result = await api.getLatest();

      expect(result).toBeNull();
    });

    it('throws when API returns failure', async () => {
      const mockResponse: LatestReleaseNoteResponse = {
        success: false,
        data: null,
        error: 'System error',
      };
      vi.mocked(mockHttp.get).mockResolvedValueOnce(mockResponse);

      const api = createReleaseNotesApi(mockHttp, baseUrl);
      await expect(api.getLatest()).rejects.toThrow('System error');
    });
  });

  describe('getHistory()', () => {
    it('returns paginated release notes history', async () => {
      const mockResponse: ReleaseNotesHistoryResponse = {
        success: true,
        data: [mockReleaseNote],
        nextCursor: null,
        hasMore: false,
      };
      vi.mocked(mockHttp.get).mockResolvedValueOnce(mockResponse);

      const api = createReleaseNotesApi(mockHttp, baseUrl);
      const result = await api.getHistory({ limit: 10 });

      expect(mockHttp.get).toHaveBeenCalledWith(
        'https://api.nxt1sports.com/api/v1/system/release-notes/history',
        { params: { limit: 10 } }
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0].version).toBe('1.98.0');
    });

    it('throws when history fetch fails', async () => {
      vi.mocked(mockHttp.get).mockResolvedValueOnce({
        success: false,
        data: [],
        error: 'Database unavailable',
      });

      const api = createReleaseNotesApi(mockHttp, baseUrl);
      await expect(api.getHistory()).rejects.toThrow('Database unavailable');
    });
  });
});
