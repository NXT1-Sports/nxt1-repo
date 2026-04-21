import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUsageApi } from './usage.api';
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

describe('createUsageApi', () => {
  let http: HttpAdapter;
  let api: ReturnType<typeof createUsageApi>;

  beforeEach(() => {
    http = createMockHttp();
    api = createUsageApi(http, '/api/v1');
  });

  describe('deleteBudget', () => {
    it('should delete an organization budget via DELETE with interval query params', async () => {
      vi.mocked(http.delete).mockResolvedValue({ success: true });

      await api.deleteBudget({
        organizationId: 'org_123',
        budgetInterval: 'weekly',
      });

      expect(http.delete).toHaveBeenCalledWith('/api/v1/billing/budget/org/org_123', {
        params: {
          budgetInterval: 'weekly',
        },
      });
    });

    it('should throw when the budget delete fails', async () => {
      vi.mocked(http.delete).mockResolvedValue({
        success: false,
        error: 'Delete failed',
      });

      await expect(
        api.deleteBudget({
          organizationId: 'org_123',
          budgetInterval: 'monthly',
        })
      ).rejects.toThrow('Delete failed');
    });
  });

  describe('deleteTeamBudget', () => {
    it('should delete a team budget via DELETE with interval query params', async () => {
      vi.mocked(http.delete).mockResolvedValue({ success: true });

      await api.deleteTeamBudget('org_123', 'team_456', {
        budgetInterval: 'daily',
      });

      expect(http.delete).toHaveBeenCalledWith('/api/v1/billing/budget/org/org_123/team/team_456', {
        params: {
          budgetInterval: 'daily',
        },
      });
    });
  });
});
