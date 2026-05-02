/**
 * @fileoverview Unit Tests — Live View Control Tools
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/browser
 *
 * Tests for NavigateLiveViewTool, InteractWithLiveViewTool, ReadLiveViewTool,
 * and CloseLiveViewTool. Verifies:
 * - Parameter validation (missing sessionId, userId)
 * - Successful delegation to LiveViewSessionService methods
 * - Error handling for service failures
 * - Correct metadata (name, category, allowedAgents, isMutation)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { NavigateLiveViewTool } from '../navigate-live-view.tool.js';
import { InteractWithLiveViewTool } from '../interact-with-live-view.tool.js';
import { ReadLiveViewTool } from '../read-live-view.tool.js';
import { ExtractLiveViewMediaTool } from '../extract-live-view-media.tool.js';
import { ExtractLiveViewPlaylistTool } from '../extract-live-view-playlist.tool.js';
import { CloseLiveViewTool } from '../close-live-view.tool.js';
import type { LiveViewSessionService } from '../live-view-session.service.js';
import type { ToolExecutionContext } from '../../../../base.tool.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-test-123';
const TEST_SESSION_ID = 'session-abc-456';
const TEST_URL = 'https://www.hudl.com/login';
const TEST_CONTEXT = { userId: TEST_USER_ID } satisfies ToolExecutionContext;

function createMockService(overrides?: Partial<LiveViewSessionService>): LiveViewSessionService {
  return {
    navigate: vi.fn().mockResolvedValue({ resolvedUrl: TEST_URL }),
    extractContent: vi.fn().mockResolvedValue({
      url: TEST_URL,
      title: 'Hudl Login',
      content: 'Welcome to Hudl. Sign in to continue.',
    }),
    extractMedia: vi.fn().mockResolvedValue({
      url: TEST_URL,
      title: 'Hudl Film',
      streams: ['https://stream.example.com/master.m3u8'],
      currentSrc: 'blob:https://www.hudl.com/123',
      blobSrc: 'blob:https://www.hudl.com/123',
      auth: {
        userAgent: 'Mozilla/5.0 Test Browser',
        referer: TEST_URL,
        origin: 'https://www.hudl.com',
        cookieHeader: 'session=abc123; access=xyz456',
        cookies: [
          {
            name: 'session',
            value: 'abc123',
            domain: '.hudl.com',
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'None',
          },
        ],
      },
    }),
    extractPlaylist: vi.fn().mockResolvedValue({
      url: TEST_URL,
      title: 'Hudl Playlist',
      playlistTitle: 'Top 10 Clips',
      items: [
        {
          index: 1,
          itemId: 'clip-1',
          title: 'Clip 1',
          url: 'https://www.hudl.com/video/clip-1',
          durationText: '00:12',
          thumbnailUrl: 'https://images.example.com/clip-1.jpg',
          textSnippet: '1st quarter touchdown',
          isCurrent: true,
        },
        {
          index: 2,
          itemId: 'clip-2',
          title: 'Clip 2',
          url: 'https://www.hudl.com/video/clip-2',
          durationText: '00:08',
          thumbnailUrl: 'https://images.example.com/clip-2.jpg',
          textSnippet: 'red zone catch',
          isCurrent: false,
        },
      ],
      auth: {
        userAgent: 'Mozilla/5.0 Test Browser',
        referer: TEST_URL,
        origin: 'https://www.hudl.com',
        cookieHeader: 'session=abc123; access=xyz456',
        cookies: [
          {
            name: 'session',
            value: 'abc123',
            domain: '.hudl.com',
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'None',
          },
        ],
      },
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

    it('should have system category', () => {
      expect(tool.category).toBe('system');
    });

    it('should be allowed for all agents via wildcard', () => {
      expect(tool.allowedAgents).toEqual(['*']);
    });

    it('should require only url in the tool schema', () => {
      expect(tool.parameters.safeParse({}).success).toBe(false);
      expect(tool.parameters.safeParse({ url: TEST_URL }).success).toBe(true);
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

    it('should accept userId from execution context', async () => {
      const result = await tool.execute({ url: TEST_URL }, TEST_CONTEXT);
      expect(result.success).toBe(true);
      expect(service.navigate).toHaveBeenCalledWith(TEST_SESSION_ID, TEST_USER_ID, TEST_URL);
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

    it('should not require userId in the tool schema', () => {
      expect(tool.parameters.safeParse({}).success).toBe(true);
    });
  });

  describe('parameter validation', () => {
    it('should reject missing userId', async () => {
      const result = await tool.execute({ sessionId: TEST_SESSION_ID });
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });

    it('should accept userId from execution context', async () => {
      const result = await tool.execute({}, TEST_CONTEXT);
      expect(result.success).toBe(true);
      expect(service.extractContent).toHaveBeenCalledWith(TEST_SESSION_ID, TEST_USER_ID);
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

// ─── ExtractLiveViewMediaTool ─────────────────────────────────────────────

describe('ExtractLiveViewMediaTool', () => {
  let tool: ExtractLiveViewMediaTool;
  let service: LiveViewSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createMockService();
    tool = new ExtractLiveViewMediaTool(service);
  });

  it('should have correct name', () => {
    expect(tool.name).toBe('extract_live_view_media');
  });

  it('should reject missing userId', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('userId');
  });

  it('should accept userId from execution context', async () => {
    const result = await tool.execute({}, TEST_CONTEXT);

    expect(result.success).toBe(true);
    expect(service.extractMedia).toHaveBeenCalledWith(TEST_SESSION_ID, TEST_USER_ID);
  });

  it('should call extractMedia with the resolved session', async () => {
    const result = await tool.execute({ userId: TEST_USER_ID });

    expect(result.success).toBe(true);
    expect(service.resolveSessionId).toHaveBeenCalledWith(null, TEST_USER_ID);
    expect(service.extractMedia).toHaveBeenCalledWith(TEST_SESSION_ID, TEST_USER_ID);
    expect((result.data as Record<string, unknown>)['primaryStream']).toBe(
      'https://stream.example.com/master.m3u8'
    );
    expect((result.data as Record<string, unknown>)['auth']).toEqual({
      cookieHeader: 'session=abc123; access=xyz456',
      cookieCount: 1,
      cookies: [
        {
          name: 'session',
          value: 'abc123',
          domain: '.hudl.com',
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'None',
        },
      ],
      userAgent: 'Mozilla/5.0 Test Browser',
      referer: TEST_URL,
      origin: 'https://www.hudl.com',
      recommendedHeaders: {
        Cookie: 'session=abc123; access=xyz456',
        'User-Agent': 'Mozilla/5.0 Test Browser',
        Referer: TEST_URL,
        Origin: 'https://www.hudl.com',
      },
    });
    expect((result.data as Record<string, unknown>)['mediaArtifact']).toEqual(
      expect.objectContaining({
        sourceType: 'hls_manifest',
        transportReadiness: 'download_required',
        analysisReady: false,
        recommendedNextAction: 'call_apify_actor',
      })
    );
  });

  it('should surface extraction failures', async () => {
    service = createMockService({
      extractMedia: vi.fn().mockRejectedValue(new Error('No network media streams were detected')),
    } as unknown as Partial<LiveViewSessionService>);
    tool = new ExtractLiveViewMediaTool(service);

    const result = await tool.execute({ userId: TEST_USER_ID });

    expect(result.success).toBe(false);
    expect(result.error).toBe('No network media streams were detected');
  });
});

describe('ExtractLiveViewPlaylistTool', () => {
  let tool: ExtractLiveViewPlaylistTool;
  let service: LiveViewSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createMockService();
    tool = new ExtractLiveViewPlaylistTool(service);
  });

  it('should have correct name', () => {
    expect(tool.name).toBe('extract_live_view_playlist');
  });

  it('should reject missing userId', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('userId');
  });

  it('should extract playlist items with the resolved session', async () => {
    const result = await tool.execute({ maxItems: 10, userId: TEST_USER_ID });

    expect(result.success).toBe(true);
    expect(service.resolveSessionId).toHaveBeenCalledWith(null, TEST_USER_ID);
    expect(service.extractPlaylist).toHaveBeenCalledWith(TEST_SESSION_ID, TEST_USER_ID, 10);
    const data = result.data as Record<string, unknown>;
    expect(data['playlistTitle']).toBe('Top 10 Clips');
    expect(data['itemCount']).toBe(2);
    expect(data['apifyHints']).toEqual({
      sourceUrls: ['https://www.hudl.com/video/clip-1', 'https://www.hudl.com/video/clip-2'],
      headers: {
        Cookie: 'session=abc123; access=xyz456',
        'User-Agent': 'Mozilla/5.0 Test Browser',
        Referer: TEST_URL,
        Origin: 'https://www.hudl.com',
      },
      cookies: [
        {
          name: 'session',
          value: 'abc123',
          domain: '.hudl.com',
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'None',
        },
      ],
    });
    expect(data['mediaArtifacts']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'playlist',
          transportReadiness: 'download_required',
          recommendedNextAction: 'call_apify_actor',
          analysisReady: false,
        }),
      ])
    );
  });

  it('should surface playlist extraction failures', async () => {
    service = createMockService({
      extractPlaylist: vi
        .fn()
        .mockRejectedValue(new Error('No playlist clips or linked video items were detected')),
    } as unknown as Partial<LiveViewSessionService>);
    tool = new ExtractLiveViewPlaylistTool(service);

    const result = await tool.execute({ userId: TEST_USER_ID });

    expect(result.success).toBe(false);
    expect(result.error).toBe('No playlist clips or linked video items were detected');
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

    it('should require only prompt in the tool schema', () => {
      expect(tool.parameters.safeParse({}).success).toBe(false);
      expect(tool.parameters.safeParse({ prompt: 'Click the Login button' }).success).toBe(true);
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

    it('should accept userId from execution context', async () => {
      const result = await tool.execute({ prompt: 'Click the Login button' }, TEST_CONTEXT);
      expect(result.success).toBe(true);
      expect(service.executePrompt).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        TEST_USER_ID,
        'Click the Login button'
      );
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

    it('should not require userId in the tool schema', () => {
      expect(tool.parameters.safeParse({}).success).toBe(true);
    });
  });

  describe('parameter validation', () => {
    it('should reject missing userId', async () => {
      const result = await tool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });

    it('should accept userId from execution context', async () => {
      const result = await tool.execute({ sessionId: TEST_SESSION_ID }, TEST_CONTEXT);
      expect(result.success).toBe(true);
      expect(service.closeSession).toHaveBeenCalledWith(TEST_SESSION_ID, TEST_USER_ID);
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
