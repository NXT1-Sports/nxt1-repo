/**
 * @fileoverview Unit Tests — Live View Control Tools
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Tests for NavigateLiveViewTool, InteractWithLiveViewTool, ReadLiveViewTool,
 * and CloseLiveViewTool. Verifies:
 * - Parameter validation (missing sessionId, userId)
 * - Successful delegation to LiveViewSessionService methods
 * - Error handling for service failures
 * - Correct metadata (name, category, allowedAgents, isMutation)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { NavigateLiveViewTool } from '../navigate-live-view.tool.js';
import { InteractWithLiveViewTool } from '../interact-with-live-view.tool.js';
import { ReadLiveViewTool } from '../read-live-view.tool.js';
import { CloseLiveViewTool } from '../close-live-view.tool.js';
import type { LiveViewSessionService } from '../live-view-session.service.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-test-123';
const TEST_SESSION_ID = 'session-abc-456';
const TEST_URL = 'https://www.hudl.com/login';

function createMockService(overrides?: Partial<LiveViewSessionService>): LiveViewSessionService {
  return {
    navigate: vi.fn().mockResolvedValue({ resolvedUrl: TEST_URL }),
    extractContent: vi.fn().mockResolvedValue({
      url: TEST_URL,
      title: 'Hudl Login',
      content: 'Welcome to Hudl. Sign in to continue.',
    }),
    executeAction: vi.fn().mockResolvedValue({ success: true, message: 'Action completed' }),
    executePrompt: vi
      .fn()
      .mockResolvedValue({ success: true, output: 'I clicked the button successfully.' }),
    closeSession: vi.fn().mockResolvedValue(undefined),
    closeAllUserSessions: vi.fn().mockResolvedValue(0),
    resolveSessionId: vi.fn().mockReturnValue(TEST_SESSION_ID),
    getActiveSession: vi.fn().mockReturnValue(null),
    getActiveSessionForUser: vi.fn().mockReturnValue(null),
    ...overrides,
  } as unknown as LiveViewSessionService;
}

// ─── NavigateLiveViewTool ───────────────────────────────────────────────────

describe('NavigateLiveViewTool', () => {
  let tool: NavigateLiveViewTool;
  let service: LiveViewSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createMockService();
    tool = new NavigateLiveViewTool(service);
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('navigate_live_view');
    });

    it('should not be a mutation', () => {
      expect(tool.isMutation).toBe(false);
    });

    it('should have analytics category', () => {
      expect(tool.category).toBe('analytics');
    });

    it('should be allowed for all 5 coordinators', () => {
      expect(tool.allowedAgents).toContain('data_coordinator');
      expect(tool.allowedAgents).toContain('performance_coordinator');
      expect(tool.allowedAgents).toContain('recruiting_coordinator');
      expect(tool.allowedAgents).toContain('general');
      expect(tool.allowedAgents).toContain('brand_media_coordinator');
    });

    it('should require url and userId', () => {
      expect(tool.parameters.required).toEqual(['url', 'userId']);
    });
  });

  describe('parameter validation', () => {
    it('should reject missing url', async () => {
      const result = await tool.execute({ userId: TEST_USER_ID });
      expect(result.success).toBe(false);
      expect(result.error).toContain('url');
    });

    it('should reject missing userId', async () => {
      const result = await tool.execute({ url: TEST_URL });
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });
  });

  describe('successful execution', () => {
    it('should call resolveSessionId and then navigate', async () => {
      await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });
      expect(service.resolveSessionId).toHaveBeenCalledWith(null, TEST_USER_ID);
      expect(service.navigate).toHaveBeenCalledWith(TEST_SESSION_ID, TEST_USER_ID, TEST_URL);
    });

    it('should pass explicit sessionId to resolveSessionId', async () => {
      await tool.execute({ sessionId: TEST_SESSION_ID, url: TEST_URL, userId: TEST_USER_ID });
      expect(service.resolveSessionId).toHaveBeenCalledWith(TEST_SESSION_ID, TEST_USER_ID);
    });

    it('should return success with navigatedTo URL', async () => {
      const result = await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['navigatedTo']).toBe(TEST_URL);
      expect(data['sessionId']).toBe(TEST_SESSION_ID);
    });
  });

  describe('error handling', () => {
    it('should return error when navigation fails', async () => {
      service = createMockService({
        navigate: vi.fn().mockRejectedValue(new Error('Session expired')),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new NavigateLiveViewTool(service);

      const result = await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Session expired');
    });

    it('should return generic error for non-Error exceptions', async () => {
      service = createMockService({
        navigate: vi.fn().mockRejectedValue('unexpected'),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new NavigateLiveViewTool(service);

      const result = await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to navigate');
    });

    it('should return error when no active session found', async () => {
      service = createMockService({
        resolveSessionId: vi.fn().mockImplementation(() => {
          throw new Error(
            'No active live view session found. Use open_live_view to start one first.'
          );
        }),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new NavigateLiveViewTool(service);

      const result = await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active live view session');
    });
  });
});

// ─── ReadLiveViewTool ───────────────────────────────────────────────────────

describe('ReadLiveViewTool', () => {
  let tool: ReadLiveViewTool;
  let service: LiveViewSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createMockService();
    tool = new ReadLiveViewTool(service);
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('read_live_view');
    });

    it('should not be a mutation', () => {
      expect(tool.isMutation).toBe(false);
    });

    it('should require only userId', () => {
      expect(tool.parameters.required).toEqual(['userId']);
    });
  });

  describe('parameter validation', () => {
    it('should reject missing userId', async () => {
      const result = await tool.execute({ sessionId: TEST_SESSION_ID });
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });
  });

  describe('successful execution', () => {
    it('should call resolveSessionId then extractContent', async () => {
      await tool.execute({ userId: TEST_USER_ID });
      expect(service.resolveSessionId).toHaveBeenCalledWith(null, TEST_USER_ID);
      expect(service.extractContent).toHaveBeenCalledWith(TEST_SESSION_ID, TEST_USER_ID);
    });

    it('should return page content in data', async () => {
      const result = await tool.execute({ userId: TEST_USER_ID });
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['url']).toBe(TEST_URL);
      expect(data['title']).toBe('Hudl Login');
      expect(data['content']).toContain('Welcome to Hudl');
      expect(data['sessionId']).toBe(TEST_SESSION_ID);
    });
  });

  describe('error handling', () => {
    it('should return error when extraction fails', async () => {
      service = createMockService({
        extractContent: vi.fn().mockRejectedValue(new Error('Session not found')),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new ReadLiveViewTool(service);

      const result = await tool.execute({ userId: TEST_USER_ID });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Session not found');
    });
  });
});

// ─── InteractWithLiveViewTool ───────────────────────────────────────────────

describe('InteractWithLiveViewTool', () => {
  let tool: InteractWithLiveViewTool;
  let service: LiveViewSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createMockService();
    tool = new InteractWithLiveViewTool(service);
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('interact_with_live_view');
    });

    it('should be a mutation', () => {
      expect(tool.isMutation).toBe(true);
    });

    it('should require prompt and userId', () => {
      expect(tool.parameters.required).toEqual(['prompt', 'userId']);
    });
  });

  describe('parameter validation', () => {
    it('should reject missing prompt', async () => {
      const result = await tool.execute({ userId: TEST_USER_ID });
      expect(result.success).toBe(false);
      expect(result.error).toContain('prompt');
    });

    it('should reject missing userId', async () => {
      const result = await tool.execute({ prompt: 'Click the Login button' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });
  });

  describe('session resolution', () => {
    it('should auto-resolve sessionId via resolveSessionId', async () => {
      await tool.execute({
        prompt: 'Click the Login button',
        userId: TEST_USER_ID,
      });
      expect(service.resolveSessionId).toHaveBeenCalledWith(null, TEST_USER_ID);
    });

    it('should pass explicit sessionId to resolveSessionId', async () => {
      await tool.execute({
        sessionId: 'explicit-id',
        prompt: 'Click the Login button',
        userId: TEST_USER_ID,
      });
      expect(service.resolveSessionId).toHaveBeenCalledWith('explicit-id', TEST_USER_ID);
    });

    it('should return error when no active session found', async () => {
      service = createMockService({
        resolveSessionId: vi.fn(() => {
          throw new Error('No active live view session found');
        }),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new InteractWithLiveViewTool(service);

      const result = await tool.execute({
        prompt: 'Click the Login button',
        userId: TEST_USER_ID,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active live view session');
    });
  });

  describe('successful execution', () => {
    it('should call executePrompt with the natural language prompt', async () => {
      const result = await tool.execute({
        prompt: 'Click the Continue with Google button',
        userId: TEST_USER_ID,
      });

      expect(result.success).toBe(true);
      expect(service.executePrompt).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        TEST_USER_ID,
        'Click the Continue with Google button'
      );
    });

    it('should return Firecrawl AI output in data', async () => {
      const result = await tool.execute({
        prompt: 'Click the Login button',
        userId: TEST_USER_ID,
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['sessionId']).toBe(TEST_SESSION_ID);
      expect(data['output']).toBe('I clicked the button successfully.');
      expect(data['message']).toContain('Interaction completed');
    });
  });

  describe('error handling', () => {
    it('should return failure when prompt execution fails', async () => {
      service = createMockService({
        executePrompt: vi.fn().mockResolvedValue({
          success: false,
          output: 'Could not find the specified element on the page',
        }),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new InteractWithLiveViewTool(service);

      const result = await tool.execute({
        prompt: 'Click on a nonexistent button',
        userId: TEST_USER_ID,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Could not find the specified element on the page');
      const data = result.data as Record<string, unknown>;
      expect(data['message']).toContain('Interaction failed');
    });

    it('should return error when executePrompt throws', async () => {
      service = createMockService({
        executePrompt: vi.fn().mockRejectedValue(new Error('Session expired')),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new InteractWithLiveViewTool(service);

      const result = await tool.execute({
        prompt: 'Click the Login button',
        userId: TEST_USER_ID,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session expired');
    });
  });
});

// ─── CloseLiveViewTool ──────────────────────────────────────────────────────

describe('CloseLiveViewTool', () => {
  let tool: CloseLiveViewTool;
  let service: LiveViewSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createMockService();
    tool = new CloseLiveViewTool(service);
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('close_live_view');
    });

    it('should be a mutation', () => {
      expect(tool.isMutation).toBe(true);
    });

    it('should require only userId', () => {
      expect(tool.parameters.required).toEqual(['userId']);
    });
  });

  describe('parameter validation', () => {
    it('should reject missing userId', async () => {
      const result = await tool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });
  });

  describe('close specific session (sessionId provided)', () => {
    it('should call sessionService.closeSession with provided sessionId', async () => {
      await tool.execute({ sessionId: TEST_SESSION_ID, userId: TEST_USER_ID });
      expect(service.closeSession).toHaveBeenCalledWith(TEST_SESSION_ID, TEST_USER_ID);
    });

    it('should return success message with sessionId', async () => {
      const result = await tool.execute({ sessionId: TEST_SESSION_ID, userId: TEST_USER_ID });
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['sessionId']).toBe(TEST_SESSION_ID);
      expect(data['message']).toContain('closed');
    });

    it('should return error when close specific session fails', async () => {
      service = createMockService({
        closeSession: vi.fn().mockRejectedValue(new Error('Session not found')),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new CloseLiveViewTool(service);

      const result = await tool.execute({ sessionId: TEST_SESSION_ID, userId: TEST_USER_ID });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Session not found');
    });
  });

  describe('close all sessions (no sessionId)', () => {
    it('should call closeAllUserSessions when no sessionId', async () => {
      service = createMockService({
        closeAllUserSessions: vi.fn().mockResolvedValue(2),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new CloseLiveViewTool(service);

      const result = await tool.execute({ userId: TEST_USER_ID });
      expect(result.success).toBe(true);
      expect(service.closeAllUserSessions).toHaveBeenCalledWith(TEST_USER_ID);
      const data = result.data as Record<string, unknown>;
      expect(data['closed']).toBe(2);
      expect(data['message']).toContain('Closed 2');
    });

    it('should report no sessions when none found', async () => {
      service = createMockService({
        closeAllUserSessions: vi.fn().mockResolvedValue(0),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new CloseLiveViewTool(service);

      const result = await tool.execute({ userId: TEST_USER_ID });
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['closed']).toBe(0);
      expect(data['message']).toContain('No active');
    });

    it('should return error when closeAllUserSessions throws', async () => {
      service = createMockService({
        closeAllUserSessions: vi.fn().mockRejectedValue(new Error('Cleanup failed')),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new CloseLiveViewTool(service);

      const result = await tool.execute({ userId: TEST_USER_ID });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cleanup failed');
    });
  });
});
