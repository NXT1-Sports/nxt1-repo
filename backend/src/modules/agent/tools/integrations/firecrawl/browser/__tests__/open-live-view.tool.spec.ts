/**
 * @fileoverview Unit Tests — OpenLiveViewTool
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/browser
 *
 * Tests the Agent X tool that opens live-view browser sessions. Verifies:
 * - Connected accounts are fetched from Firestore
 * - LiveViewSessionService.startSession() is called with correct args
 * - autoOpenPanel instruction is returned in tool result data
 * - Error handling for missing params, Firestore failures, and session failures
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Firestore ─────────────────────────────────────────────────────────

const mockDocGet = vi.fn();
const mockDoc = vi.fn(() => ({ get: mockDocGet }));
const mockCollection = vi.fn(() => ({ doc: mockDoc }));
const mockGetFirestore = vi.fn(() => ({ collection: mockCollection }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockGetFirestore(),
}));

vi.mock('../../../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { OpenLiveViewTool } from '../open-live-view.tool.js';
import type { LiveViewSessionService, StartLiveViewResult } from '../live-view-session.service.js';
import type { LiveViewSession } from '@nxt1/core';
import type { ToolExecutionContext } from '../../../../base.tool.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-test-123';
const TEST_SESSION_ID = 'session-abc-456';
const TEST_INTERACTIVE_URL = 'https://connect.firecrawl.dev/session/abc';
const TEST_LIVE_VIEW_URL = 'https://liveview.firecrawl.dev/session/abc';
const TEST_URL = 'https://www.hudl.com/profile/12345';
const TEST_CONTEXT = { userId: TEST_USER_ID } satisfies ToolExecutionContext;

function createMockSession(overrides?: Partial<LiveViewSession>): LiveViewSession {
  return {
    sessionId: TEST_SESSION_ID,
    interactiveUrl: TEST_INTERACTIVE_URL,
    liveViewUrl: TEST_LIVE_VIEW_URL,
    requestedUrl: TEST_URL,
    resolvedUrl: TEST_URL,
    destinationTier: 'platform',
    platformKey: 'hudl',
    domainLabel: 'Hudl',
    authStatus: 'authenticated',
    capabilities: {
      canRefresh: true,
      canNavigate: true,
      hasAuthProfile: true,
    },
    createdAt: '2026-04-06T00:00:00.000Z',
    expiresAt: '2026-04-06T00:10:00.000Z',
    ...overrides,
  };
}

function createMockSessionService(
  overrides?: Partial<LiveViewSessionService>
): LiveViewSessionService {
  return {
    startSession: vi.fn().mockResolvedValue({
      session: createMockSession(),
    } satisfies StartLiveViewResult),
    getActiveSession: vi.fn().mockReturnValue(null),
    navigate: vi.fn().mockResolvedValue({ resolvedUrl: TEST_URL }),
    ...overrides,
  } as unknown as LiveViewSessionService;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('OpenLiveViewTool', () => {
  let tool: OpenLiveViewTool;
  let mockService: LiveViewSessionService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: user has a connected Hudl account
    mockDocGet.mockResolvedValue({
      data: () => ({
        connectedAccounts: {
          hudl: { type: 'firecrawl_profile', profileName: 'hudl-user-123', status: 'connected' },
        },
      }),
    });

    mockService = createMockSessionService();
    tool = new OpenLiveViewTool(mockService);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Tool metadata
  // ────────────────────────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('open_live_view');
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

  // ────────────────────────────────────────────────────────────────────────
  // Parameter validation
  // ────────────────────────────────────────────────────────────────────────

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
      expect(mockService.startSession).toHaveBeenCalledWith(
        TEST_USER_ID,
        { url: TEST_URL },
        expect.any(Object)
      );
    });

    it('should reject empty url', async () => {
      const result = await tool.execute({ url: '', userId: TEST_USER_ID });
      expect(result.success).toBe(false);
    });

    it('should reject empty userId', async () => {
      const result = await tool.execute({ url: TEST_URL, userId: '' });
      expect(result.success).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Successful session creation
  // ────────────────────────────────────────────────────────────────────────

  describe('successful execution', () => {
    it('should fetch connected accounts from Firestore', async () => {
      await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });

      expect(mockCollection).toHaveBeenCalledWith('Users');
      expect(mockDoc).toHaveBeenCalledWith(TEST_USER_ID);
      expect(mockDocGet).toHaveBeenCalled();
    });

    it('should call startSession with url and connected accounts', async () => {
      await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });

      expect(mockService.startSession).toHaveBeenCalledWith(
        TEST_USER_ID,
        { url: TEST_URL },
        {
          hudl: { type: 'firecrawl_profile', profileName: 'hudl-user-123', status: 'connected' },
        }
      );
    });

    it('should pass platformKey when provided', async () => {
      await tool.execute({ url: TEST_URL, userId: TEST_USER_ID, platformKey: 'hudl' });

      expect(mockService.startSession).toHaveBeenCalledWith(
        TEST_USER_ID,
        { url: TEST_URL, platformKey: 'hudl' },
        expect.any(Object)
      );
    });

    it('should return autoOpenPanel instruction', async () => {
      const result = await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['autoOpenPanel']).toBeDefined();

      const panel = data['autoOpenPanel'] as Record<string, unknown>;
      expect(panel['type']).toBe('live-view');
      expect(panel['url']).toBe(TEST_INTERACTIVE_URL);
      expect(panel['externalUrl']).toBe(TEST_INTERACTIVE_URL);
      expect(panel['title']).toBe('Hudl');
      expect(panel['session']).toBeDefined();
    });

    it('should include session metadata in response', async () => {
      const result = await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });
      const data = result.data as Record<string, unknown>;

      expect(data['sessionId']).toBe(TEST_SESSION_ID);
      expect(data['url']).toBe(TEST_URL);
      expect(data['domainLabel']).toBe('Hudl');
      expect(data['authStatus']).toBe('authenticated');
      expect(data['destinationTier']).toBe('platform');
      expect(data['expiresAt']).toBeDefined();
    });

    it('should handle user with no connected accounts', async () => {
      mockDocGet.mockResolvedValue({ data: () => ({}) });

      const result = await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });

      expect(result.success).toBe(true);
      expect(mockService.startSession).toHaveBeenCalledWith(TEST_USER_ID, { url: TEST_URL }, {});
    });

    it('should handle user document not found (empty data)', async () => {
      mockDocGet.mockResolvedValue({ data: () => undefined });

      const result = await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });

      expect(result.success).toBe(true);
      expect(mockService.startSession).toHaveBeenCalledWith(TEST_USER_ID, { url: TEST_URL }, {});
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Error handling
  // ────────────────────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should return error when Firestore fetch fails', async () => {
      mockDocGet.mockRejectedValue(new Error('Firestore unavailable'));

      const result = await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Firestore unavailable');
    });

    it('should return error when session creation fails', async () => {
      mockService = createMockSessionService({
        startSession: vi.fn().mockRejectedValue(new Error('FIRECRAWL_API_KEY invalid')),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new OpenLiveViewTool(mockService);

      const result = await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });

      expect(result.success).toBe(false);
      expect(result.error).toBe('FIRECRAWL_API_KEY invalid');
    });

    it('should return generic error for non-Error exceptions', async () => {
      mockService = createMockSessionService({
        startSession: vi.fn().mockRejectedValue('unexpected string error'),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new OpenLiveViewTool(mockService);

      const result = await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to open live view session');
    });

    it('should return error for SSRF-blocked URLs (via session service)', async () => {
      mockService = createMockSessionService({
        startSession: vi.fn().mockRejectedValue(new Error('URL blocked: private IP range')),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new OpenLiveViewTool(mockService);

      const result = await tool.execute({
        url: 'http://169.254.169.254/secrets',
        userId: TEST_USER_ID,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('blocked');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Auth status variants
  // ────────────────────────────────────────────────────────────────────────

  describe('auth status variants', () => {
    it('should return ephemeral status for arbitrary URLs', async () => {
      const ephemeralSession = createMockSession({
        destinationTier: 'arbitrary',
        authStatus: 'ephemeral',
        platformKey: undefined,
        domainLabel: 'example.com',
        capabilities: { canRefresh: true, canNavigate: true, hasAuthProfile: false },
      });

      mockService = createMockSessionService({
        startSession: vi.fn().mockResolvedValue({ session: ephemeralSession }),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new OpenLiveViewTool(mockService);

      const result = await tool.execute({
        url: 'https://www.example.com/page',
        userId: TEST_USER_ID,
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['authStatus']).toBe('ephemeral');
      expect(data['destinationTier']).toBe('arbitrary');
    });

    it('should return expired status when auth profile is stale', async () => {
      const expiredSession = createMockSession({
        authStatus: 'expired',
        capabilities: { canRefresh: true, canNavigate: true, hasAuthProfile: true },
      });

      mockService = createMockSessionService({
        startSession: vi.fn().mockResolvedValue({ session: expiredSession }),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new OpenLiveViewTool(mockService);

      const result = await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['authStatus']).toBe('expired');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Idempotent session reuse
  // ────────────────────────────────────────────────────────────────────────

  describe('idempotent session reuse', () => {
    const activeSession = {
      sessionId: TEST_SESSION_ID,
      userId: TEST_USER_ID,
      interactiveUrl: TEST_INTERACTIVE_URL,
      liveViewUrl: TEST_LIVE_VIEW_URL,
      createdAt: new Date('2026-04-06T00:00:00Z'),
      expiresAt: new Date('2026-04-06T00:10:00Z'),
    };

    it('should reuse active session and navigate instead of creating new one', async () => {
      mockService = createMockSessionService({
        getActiveSession: vi.fn().mockReturnValue(activeSession),
        navigate: vi.fn().mockResolvedValue({ resolvedUrl: 'https://www.espn.com/' }),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new OpenLiveViewTool(mockService);

      const result = await tool.execute({ url: 'https://www.espn.com', userId: TEST_USER_ID });

      expect(result.success).toBe(true);
      expect(mockService.navigate).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        TEST_USER_ID,
        'https://www.espn.com'
      );
      expect(mockService.startSession).not.toHaveBeenCalled();
    });

    it('should return autoOpenPanel with existing interactiveUrl', async () => {
      mockService = createMockSessionService({
        getActiveSession: vi.fn().mockReturnValue(activeSession),
        navigate: vi.fn().mockResolvedValue({ resolvedUrl: 'https://www.espn.com/' }),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new OpenLiveViewTool(mockService);

      const result = await tool.execute({ url: 'https://www.espn.com', userId: TEST_USER_ID });

      const data = result.data as Record<string, unknown>;
      expect(data['reusedExistingSession']).toBe(true);
      expect(data['sessionId']).toBe(TEST_SESSION_ID);

      const panel = data['autoOpenPanel'] as Record<string, unknown>;
      expect(panel['type']).toBe('live-view');
      expect(panel['url']).toBe(TEST_INTERACTIVE_URL);
      expect(panel['externalUrl']).toBe(TEST_INTERACTIVE_URL);
    });

    it('should NOT skip Firestore fetch when no active session', async () => {
      mockService = createMockSessionService({
        getActiveSession: vi.fn().mockReturnValue(null),
      } as unknown as Partial<LiveViewSessionService>);
      tool = new OpenLiveViewTool(mockService);

      await tool.execute({ url: TEST_URL, userId: TEST_USER_ID });

      // startSession should be called (new session path)
      expect(mockService.startSession).toHaveBeenCalled();
      // Firestore should be queried for connected accounts
      expect(mockDocGet).toHaveBeenCalled();
    });

    it('should fall through to create new session when navigate fails on stale session', async () => {
      const closeSession = vi.fn().mockResolvedValue(undefined);
      mockService = createMockSessionService({
        getActiveSession: vi.fn().mockReturnValue(activeSession),
        navigate: vi.fn().mockRejectedValue(new Error('Session expired on Firecrawl')),
        closeSession,
      } as unknown as Partial<LiveViewSessionService>);
      tool = new OpenLiveViewTool(mockService);

      const result = await tool.execute({ url: 'https://www.espn.com', userId: TEST_USER_ID });

      // Navigate failed → stale session cleaned up → new session created
      expect(closeSession).toHaveBeenCalledWith(TEST_SESSION_ID, TEST_USER_ID);
      expect(mockService.startSession).toHaveBeenCalled();
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['reusedExistingSession']).toBeUndefined();
    });
  });
});
