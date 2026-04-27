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
        data: { operationId: 'playbook-op-1' },
      });
      vi.mocked(http.get).mockResolvedValue({
        success: true,
        data: {
          status: 'completed',
          result: { data: { playbook: mockPlaybook } },
        },
      });

      const result = await api.generatePlaybook();

      expect(http.post).toHaveBeenCalledWith(`${baseUrl}${AGENT_X_ENDPOINTS.PLAYBOOK_GENERATE}`, {
        force: false,
      });
      expect(vi.mocked(http.get).mock.calls[0]?.[0]).toMatch(
        new RegExp(
          `^${baseUrl}${AGENT_X_ENDPOINTS.PLAYBOOK_GENERATE_STATUS}/playbook-op-1\\?_=\\d+$`
        )
      );
      expect(result).toEqual(mockPlaybook);
    });

    it('should generate playbook with force flag', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: true,
        data: { operationId: 'playbook-op-2' },
      });
      vi.mocked(http.get).mockResolvedValue({
        success: true,
        data: {
          status: 'completed',
          result: { data: { playbook: mockPlaybook } },
        },
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

    it('should return null when queued playbook generation fails during polling', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: true,
        data: { operationId: 'playbook-op-failed' },
      });
      vi.mocked(http.get).mockResolvedValue({
        success: true,
        data: { status: 'failed', error: 'Generation failed' },
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
  // resolveApproval
  // ============================================

  describe('resolveApproval', () => {
    it('should resolve an approval with edited tool input', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: true,
        data: {
          decision: 'approved',
          resumed: true,
          operationId: 'op-123',
          threadId: 'thread-123',
        },
      });

      const result = await api.resolveApproval('approval-123', 'approved', {
        toEmail: 'coach@example.com',
        subject: 'Updated subject',
      });

      expect(http.post).toHaveBeenCalledWith(
        `${baseUrl}${AGENT_X_ENDPOINTS.APPROVALS}/${encodeURIComponent('approval-123')}/resolve`,
        {
          decision: 'approved',
          toolInput: {
            toEmail: 'coach@example.com',
            subject: 'Updated subject',
          },
        }
      );
      expect(result).toEqual({
        decision: 'approved',
        resumed: true,
        operationId: 'op-123',
        threadId: 'thread-123',
      });
    });

    it('should return null when approval resolution fails', async () => {
      vi.mocked(http.post).mockResolvedValue({ success: false, error: 'Conflict' });

      const result = await api.resolveApproval('approval-123', 'rejected');

      expect(result).toBeNull();
    });
  });

  // ============================================
  // resumeYieldedJob
  // ============================================

  describe('resumeYieldedJob', () => {
    it('should resume a yielded job with user input', async () => {
      vi.mocked(http.post).mockResolvedValue({
        success: true,
        data: {
          resumed: true,
          jobId: 'job-123',
          operationId: 'op-456',
          threadId: 'thread-123',
        },
      });

      const result = await api.resumeYieldedJob('op-original', 'My top choice is Stanford.');

      expect(http.post).toHaveBeenCalledWith(
        `${baseUrl}${AGENT_X_ENDPOINTS.RESUME_JOB}/${encodeURIComponent('op-original')}`,
        {
          response: 'My top choice is Stanford.',
        }
      );
      expect(result).toEqual({
        resumed: true,
        jobId: 'job-123',
        operationId: 'op-456',
        threadId: 'thread-123',
      });
    });

    it('should return null when yielded job resumption fails', async () => {
      vi.mocked(http.post).mockResolvedValue({ success: false, error: 'Conflict' });

      const result = await api.resumeYieldedJob('op-original', 'Answer');

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
  // getThreadMessages
  // ============================================

  describe('getThreadMessages', () => {
    it('should fetch thread messages with default limit', async () => {
      vi.mocked(http.get).mockResolvedValue({
        success: true,
        data: {
          items: [
            {
              id: 'm-1',
              threadId: 'thread-123',
              userId: 'user-123',
              role: 'user',
              content: 'hello',
              origin: 'user',
              createdAt: '2026-04-13T10:00:00.000Z',
            },
          ],
          hasMore: true,
          nextCursor: '2026-04-13T10:00:00.000Z',
        },
      });

      const result = await api.getThreadMessages('thread-123');

      expect(http.get).toHaveBeenCalledWith(
        `${baseUrl}${AGENT_X_ENDPOINTS.THREAD_MESSAGES}/${encodeURIComponent('thread-123')}/messages?limit=50`
      );
      expect(result).toEqual({
        messages: [
          {
            id: 'm-1',
            threadId: 'thread-123',
            userId: 'user-123',
            role: 'user',
            content: 'hello',
            origin: 'user',
            createdAt: '2026-04-13T10:00:00.000Z',
          },
        ],
        hasMore: true,
        nextCursor: '2026-04-13T10:00:00.000Z',
      });
    });

    it('should include the before cursor when provided', async () => {
      vi.mocked(http.get).mockResolvedValue({
        success: true,
        data: {
          items: [],
          hasMore: false,
        },
      });

      await api.getThreadMessages('thread-123', 200, '2026-04-13T10:00:00.000Z');

      expect(http.get).toHaveBeenCalledWith(
        `${baseUrl}${AGENT_X_ENDPOINTS.THREAD_MESSAGES}/${encodeURIComponent('thread-123')}/messages?limit=200&before=${encodeURIComponent('2026-04-13T10:00:00.000Z')}`
      );
    });

    it('should return null when the API response is unsuccessful', async () => {
      vi.mocked(http.get).mockResolvedValue({ success: false, error: 'Not found' });

      const result = await api.getThreadMessages('thread-123');

      expect(result).toBeNull();
    });
  });

  // ============================================
  // streamMessage (SSE parser)
  // ============================================

  describe('streamMessage', () => {
    beforeEach(() => {
      vi.unstubAllGlobals();
    });

    it('should parse thread, title_updated, operation, progress, delta, and done SSE events', async () => {
      const frames = [
        'event: thread\ndata: {"threadId":"thread-123","operationId":"op-123"}\n\n',
        'event: title_updated\ndata: {"threadId":"thread-123","title":"Updated title"}\n\n',
        'event: operation\ndata: {"threadId":"thread-123","status":"awaiting_approval","operationId":"op-123"}\n\n',
        'event: progress\ndata: {"type":"progress_subphase","operationId":"op-123","message":"Analyzing your request..."}\n\n',
        'event: delta\ndata: {"content":"Hello"}\n\n',
        'event: done\ndata: {"threadId":"thread-123","status":"awaiting_approval"}\n\n',
      ].join('');

      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(frames));
          controller.close();
        },
      });

      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(body, { status: 200, statusText: 'OK' }));
      vi.stubGlobal('fetch', fetchMock);

      const callbacks = {
        onThread: vi.fn(),
        onTitleUpdated: vi.fn(),
        onOperation: vi.fn(),
        onProgress: vi.fn(),
        onDelta: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      };

      api.streamMessage({ message: 'hello', mode: 'recruiting' }, callbacks, 'token-123', baseUrl);

      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}${AGENT_X_ENDPOINTS.CHAT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: 'Bearer token-123',
        },
        body: JSON.stringify({ message: 'hello', mode: 'recruiting' }),
        signal: expect.any(AbortSignal),
      });

      expect(callbacks.onThread).toHaveBeenCalledWith({
        threadId: 'thread-123',
        operationId: 'op-123',
      });
      expect(callbacks.onTitleUpdated).toHaveBeenCalledWith({
        threadId: 'thread-123',
        title: 'Updated title',
      });
      expect(callbacks.onOperation).toHaveBeenCalledWith({
        threadId: 'thread-123',
        status: 'awaiting_approval',
        operationId: 'op-123',
      });
      expect(callbacks.onProgress).toHaveBeenCalledWith({
        type: 'progress_subphase',
        operationId: 'op-123',
        message: 'Analyzing your request...',
      });
      expect(callbacks.onDelta).toHaveBeenCalledWith({ content: 'Hello' });
      expect(callbacks.onDone).toHaveBeenCalledWith({
        threadId: 'thread-123',
        status: 'awaiting_approval',
      });
      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it('should surface structured HTTP errors when SSE handshake fails', async () => {
      const errorResponse = {
        error: 'Insufficient wallet balance',
        code: 'AGENT_BILLING_LOW_BALANCE',
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        statusText: 'Payment Required',
        json: async () => errorResponse,
      });
      vi.stubGlobal('fetch', fetchMock);

      const callbacks = {
        onDelta: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      };

      api.streamMessage(
        { message: 'run expensive task', mode: 'recruiting' },
        callbacks,
        'token-123',
        baseUrl
      );

      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(callbacks.onError).toHaveBeenCalledWith({
        error: 'Insufficient wallet balance',
        status: 402,
        code: 'AGENT_BILLING_LOW_BALANCE',
      });
      expect(callbacks.onDone).not.toHaveBeenCalled();
    });

    it('should parse stream_replaced SSE events', async () => {
      const frames =
        'event: stream_replaced\n' +
        'data: {"operationId":"op-123","replacedByStreamId":"op-123:new","reason":"replaced","timestamp":"2026-01-01T00:00:00.000Z"}\n\n';

      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(frames));
          controller.close();
        },
      });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(body, { status: 200, statusText: 'OK' }))
      );

      const callbacks = {
        onDelta: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
        onStreamReplaced: vi.fn(),
      };

      api.streamMessage({ message: 'hello', mode: 'recruiting' }, callbacks, 'token-123', baseUrl);

      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(callbacks.onStreamReplaced).toHaveBeenCalledWith({
        operationId: 'op-123',
        replacedByStreamId: 'op-123:new',
        reason: 'replaced',
        timestamp: '2026-01-01T00:00:00.000Z',
      });
      expect(callbacks.onDone).not.toHaveBeenCalled();
      expect(callbacks.onError).not.toHaveBeenCalled();
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
