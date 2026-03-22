/**
 * @fileoverview Agent X API Factory Tests
 * @module @nxt1/core/ai
 *
 * Pure Vitest tests for createAgentXApi — no TestBed, no Angular.
 * Covers: sendMessage, getDashboard, setGoals, generatePlaybook,
 * updatePlaybookItemStatus, generateBriefing, getQuickTasks,
 * getHistory, clearHistory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentXApi } from './agent-x.api';
import type { HttpAdapter } from '../api/http-adapter';
import type {
  AgentXChatRequest,
  AgentDashboardData,
  AgentDashboardPlaybook,
  AgentDashboardBriefing,
  ShellWeeklyPlaybookItem,
} from './agent-x.types';
import { AGENT_X_ENDPOINTS } from './agent-x.constants';

function createMockHttp(): HttpAdapter {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

describe('createAgentXApi', () => {
  let http: HttpAdapter;
  let api: ReturnType<typeof createAgentXApi>;
  const baseUrl = '/api/v1';

  beforeEach(() => {
    http = createMockHttp();
    api = createAgentXApi(http, baseUrl);
  });

  // ============================================
  // sendMessage
  // ============================================

  describe('sendMessage', () => {
    const request: AgentXChatRequest = {
      message: 'Help me find D2 schools',
      mode: 'recruiting',
    };

    it('should send message and return response', async () => {
      const mockMessage = { id: '1', role: 'assistant', content: 'Here are D2 schools...' };
      vi.mocked(http.post).mockResolvedValue({
        success: true,
        data: { success: true, message: mockMessage },
      });

      const result = await api.sendMessage(request);

      expect(http.post).toHaveBeenCalledWith(`${baseUrl}${AGENT_X_ENDPOINTS.CHAT}`, request);
      expect(result.success).toBe(true);
      expect(result.message).toEqual(mockMessage);
    });

    it('should return error response on API failure', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: false,
        error: 'Service unavailable',
        errorCode: 'AI_SERVICE_ERROR',
      });

      await expect(api.sendMessage(request)).rejects.toThrow();
    });

    it('should throw on rate limit error', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: false,
        error: 'Rate limit',
        errorCode: 'RATE_LIMIT',
      });

      await expect(api.sendMessage(request)).rejects.toThrow();
    });

    it('should throw on network failure', async () => {
      vi.mocked(http.post).mockRejectedValue(new Error('Network error'));

      await expect(api.sendMessage(request)).rejects.toThrow();
    });
  });

  // ============================================
  // getDashboard
  // ============================================

  describe('getDashboard', () => {
    const mockDashboard: AgentDashboardData = {
      briefing: {
        previewText: 'Your profile got 5 views today.',
        insights: [{ id: '1', text: 'Profile views up 20%', icon: 'trending-up', type: 'success' }],
        generatedAt: '2026-03-15T10:00:00Z',
      },
      playbook: {
        items: [
          {
            id: 'p1',
            weekLabel: 'Week 1',
            title: 'Update highlight reel',
            summary: 'Add latest game footage',
            why: 'Coaches review highlights first when evaluating recruits',
            details: 'Upload 3 new clips from Friday game',
            actionLabel: 'Start',
            status: 'pending',
          },
        ],
        goals: [
          {
            id: 'g1',
            text: 'Get recruited to D2',
            category: 'recruiting',
            createdAt: '2026-03-01',
          },
        ],
        generatedAt: '2026-03-15T08:00:00Z',
        canRegenerate: true,
      },
      activeOperations: [],
      coordinators: [],
    };

    it('should fetch dashboard data', async () => {
      vi.mocked(http.get).mockResolvedValue({
        success: true,
        data: mockDashboard,
      });

      const result = await api.getDashboard();

      expect(http.get).toHaveBeenCalledWith(`${baseUrl}${AGENT_X_ENDPOINTS.DASHBOARD}`);
      expect(result).toEqual(mockDashboard);
    });

    it('should return null on API failure', async () => {
      vi.mocked(http.get).mockResolvedValue({
        success: false,
        error: 'Unauthorized',
      });

      const result = await api.getDashboard();

      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      vi.mocked(http.get).mockRejectedValue(new Error('Network failure'));

      const result = await api.getDashboard();

      expect(result).toBeNull();
    });

    it('should return null when data is missing', async () => {
      vi.mocked(http.get).mockResolvedValue({
        success: true,
      });

      const result = await api.getDashboard();

      expect(result).toBeNull();
    });
  });

  // ============================================
  // setGoals
  // ============================================

  describe('setGoals', () => {
    const goals = [
      { id: 'g1', text: 'Get recruited to D2', category: 'recruiting', createdAt: '2026-03-01' },
      {
        id: 'g2',
        text: 'Improve 40yd dash to 4.5s',
        category: 'performance',
        createdAt: '2026-03-01',
      },
    ];

    it('should set goals and return true on success', async () => {
      vi.mocked(http.post).mockResolvedValue({ success: true });

      const result = await api.setGoals(goals);

      expect(http.post).toHaveBeenCalledWith(`${baseUrl}${AGENT_X_ENDPOINTS.GOALS}`, { goals });
      expect(result).toBe(true);
    });

    it('should return false on API failure', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: false,
        error: 'Validation failed',
      });

      const result = await api.setGoals(goals);

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      vi.mocked(http.post).mockRejectedValue(new Error('Network failure'));

      const result = await api.setGoals(goals);

      expect(result).toBe(false);
    });
  });

  // ============================================
  // generatePlaybook
  // ============================================

  describe('generatePlaybook', () => {
    const mockPlaybook: AgentDashboardPlaybook = {
      items: [
        {
          id: 'p1',
          weekLabel: 'Week 1',
          title: 'Send 10 emails to coaches',
          summary: 'Reach out to target programs',
          why: 'Connecting with coaches increases your chances of getting recruited. Personalize your emails to stand out.',
          details: 'Draft personalized emails to D2 coaches in Ohio',
          actionLabel: 'Draft Emails',
          status: 'pending',
        },
        {
          id: 'p2',
          weekLabel: 'Week 2',
          title: 'Update highlight reel',
          summary: 'Add recent game clips',
          why: 'A strong highlight reel showcases your skills and attracts coach attention. Focus on your best plays.',
          details: 'Select and upload best plays from last 3 games',
          actionLabel: 'Edit Reel',
          status: 'pending',
        },
      ],
      goals: [
        { id: 'g1', text: 'Get recruited to D2', category: 'recruiting', createdAt: '2026-03-01' },
      ],
      generatedAt: '2026-03-15T10:00:00Z',
      canRegenerate: true,
    };

    it('should generate playbook without force flag', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: true,
        data: mockPlaybook,
      });

      const result = await api.generatePlaybook();

      expect(http.post).toHaveBeenCalledWith(`${baseUrl}${AGENT_X_ENDPOINTS.PLAYBOOK_GENERATE}`, {
        force: false,
      });
      expect(result).toEqual(mockPlaybook);
    });

    it('should generate playbook with force flag', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: true,
        data: mockPlaybook,
      });

      const result = await api.generatePlaybook(true);

      expect(http.post).toHaveBeenCalledWith(`${baseUrl}${AGENT_X_ENDPOINTS.PLAYBOOK_GENERATE}`, {
        force: true,
      });
      expect(result).toEqual(mockPlaybook);
    });

    it('should return null on API failure', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: false,
        error: 'No goals set',
      });

      const result = await api.generatePlaybook();

      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      vi.mocked(http.post).mockRejectedValue(new Error('Network failure'));

      const result = await api.generatePlaybook();

      expect(result).toBeNull();
    });
  });

  // ============================================
  // updatePlaybookItemStatus
  // ============================================

  describe('updatePlaybookItemStatus', () => {
    const mockItem: ShellWeeklyPlaybookItem = {
      id: 'wp-1',
      weekLabel: 'Mon',
      title: 'Send emails',
      summary: 'Reach out to coaches',
      why: 'Connecting with coaches increases your chances of getting recruited.',
      details: 'Draft and send emails to 5 coaches',
      actionLabel: 'Send Emails',
      status: 'complete',
    };

    it('should update item status to complete', async () => {
      vi.mocked(http.post).mockResolvedValue({ success: true, data: mockItem });

      const result = await api.updatePlaybookItemStatus('wp-1', 'complete');

      expect(http.post).toHaveBeenCalledWith(
        `${baseUrl}${AGENT_X_ENDPOINTS.PLAYBOOK_ITEM_STATUS}/wp-1/status`,
        { status: 'complete' }
      );
      expect(result).toEqual(mockItem);
    });

    it('should return null on API failure', async () => {
      vi.mocked(http.post).mockResolvedValue({ success: false, error: 'Not found' });

      const result = await api.updatePlaybookItemStatus('wp-999', 'complete');

      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      vi.mocked(http.post).mockRejectedValue(new Error('Network failure'));

      const result = await api.updatePlaybookItemStatus('wp-1', 'in-progress');

      expect(result).toBeNull();
    });

    it('should encode special characters in item ID', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: true,
        data: { ...mockItem, id: 'id/with spaces' },
      });

      await api.updatePlaybookItemStatus('id/with spaces', 'complete');

      expect(http.post).toHaveBeenCalledWith(
        `${baseUrl}${AGENT_X_ENDPOINTS.PLAYBOOK_ITEM_STATUS}/${encodeURIComponent('id/with spaces')}/status`,
        { status: 'complete' }
      );
    });
  });

  // ============================================
  // generateBriefing
  // ============================================

  describe('generateBriefing', () => {
    const mockBriefing: AgentDashboardBriefing = {
      previewText: "Today's focus: recruiting outreach",
      insights: [
        {
          id: 'bi-1',
          text: 'You have 3 coaches to follow up with',
          icon: 'mail-outline',
          type: 'info',
        },
      ],
      generatedAt: '2026-03-20T08:00:00Z',
    };

    it('should generate briefing without force flag', async () => {
      vi.mocked(http.post).mockResolvedValue({ success: true, data: mockBriefing });

      const result = await api.generateBriefing();

      expect(http.post).toHaveBeenCalledWith(`${baseUrl}${AGENT_X_ENDPOINTS.BRIEFING_GENERATE}`, {
        force: false,
      });
      expect(result).toEqual(mockBriefing);
    });

    it('should generate briefing with force flag', async () => {
      vi.mocked(http.post).mockResolvedValue({ success: true, data: mockBriefing });

      const result = await api.generateBriefing(true);

      expect(http.post).toHaveBeenCalledWith(`${baseUrl}${AGENT_X_ENDPOINTS.BRIEFING_GENERATE}`, {
        force: true,
      });
      expect(result).toEqual(mockBriefing);
    });

    it('should return null on API failure', async () => {
      vi.mocked(http.post).mockResolvedValue({ success: false, error: 'Service unavailable' });

      const result = await api.generateBriefing();

      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      vi.mocked(http.post).mockRejectedValue(new Error('Network failure'));

      const result = await api.generateBriefing();

      expect(result).toBeNull();
    });
  });

  // ============================================
  // getQuickTasks
  // ============================================

  describe('getQuickTasks', () => {
    it('should fetch tasks without role filter', async () => {
      const tasks = [{ id: '1', label: 'Find colleges', prompt: 'Help me find colleges' }];
      vi.mocked(http.get).mockResolvedValue({
        success: true,
        data: { tasks },
      });

      const result = await api.getQuickTasks();

      expect(http.get).toHaveBeenCalledWith(`${baseUrl}${AGENT_X_ENDPOINTS.TASKS}`);
      expect(result).toEqual(tasks);
    });

    it('should fetch tasks with role filter', async () => {
      vi.mocked(http.get).mockResolvedValue({
        success: true,
        data: { tasks: [] },
      });

      await api.getQuickTasks('athlete');

      const url = vi.mocked(http.get).mock.calls[0][0];
      expect(url).toContain('role=athlete');
    });

    it('should return empty array on failure', async () => {
      vi.mocked(http.get).mockRejectedValue(new Error('Network failure'));

      const result = await api.getQuickTasks();

      expect(result).toEqual([]);
    });
  });

  // ============================================
  // getHistory
  // ============================================

  describe('getHistory', () => {
    it('should fetch history with default limit', async () => {
      vi.mocked(http.get).mockResolvedValue({
        success: true,
        data: { messages: [], hasMore: false },
      });

      const result = await api.getHistory();

      const url = vi.mocked(http.get).mock.calls[0][0];
      expect(url).toContain('limit=50');
      expect(result).toEqual({ messages: [], hasMore: false });
    });

    it('should pass pagination params', async () => {
      vi.mocked(http.get).mockResolvedValue({
        success: true,
        data: { messages: [], hasMore: false },
      });

      await api.getHistory(10, 'msg-123');

      const url = vi.mocked(http.get).mock.calls[0][0];
      expect(url).toContain('limit=10');
      expect(url).toContain('before=msg-123');
    });

    it('should return empty on failure', async () => {
      vi.mocked(http.get).mockRejectedValue(new Error('Network failure'));

      const result = await api.getHistory();

      expect(result).toEqual({ messages: [], hasMore: false });
    });
  });

  // ============================================
  // clearHistory
  // ============================================

  describe('clearHistory', () => {
    it('should clear history and return true', async () => {
      vi.mocked(http.delete).mockResolvedValue({ success: true });

      const result = await api.clearHistory();

      expect(http.delete).toHaveBeenCalledWith(`${baseUrl}${AGENT_X_ENDPOINTS.CLEAR}`);
      expect(result).toBe(true);
    });

    it('should return false on failure', async () => {
      vi.mocked(http.delete).mockRejectedValue(new Error('Network failure'));

      const result = await api.clearHistory();

      expect(result).toBe(false);
    });
  });
});
