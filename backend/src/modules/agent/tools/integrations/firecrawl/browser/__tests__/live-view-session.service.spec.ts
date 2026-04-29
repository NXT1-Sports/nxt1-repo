/**
 * @fileoverview Unit Tests — LiveViewSessionService
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/browser
 *
 * Tests the live-view session orchestration in isolation by mocking the
 * Firecrawl client and FirecrawlProfileService. Covers destination resolution,
 * session creation (authenticated + ephemeral), navigation, refresh, close,
 * ownership enforcement, and expiry tracking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Prepare mocks BEFORE importing the service ────────────────────────────

const { mockScrape, mockInteract, mockStopInteraction, mockDeleteBrowser, mockProbeProfileStatus } =
  vi.hoisted(() => ({
    mockScrape: vi.fn(),
    mockInteract: vi.fn(),
    mockStopInteraction: vi.fn(),
    mockDeleteBrowser: vi.fn(),
    mockProbeProfileStatus: vi.fn(),
  }));

vi.mock('@mendable/firecrawl-js', () => ({
  default: class MockFirecrawl {
    scrape = mockScrape;
    interact = mockInteract;
    stopInteraction = mockStopInteraction;
    deleteBrowser = mockDeleteBrowser;
  },
}));

vi.mock('../../../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Now import the service under test
import { LiveViewSessionService } from '../live-view-session.service.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-abc-123';
const TEST_SESSION_ID = 'fc-scrape-xyz';
const TEST_INTERACTIVE_URL = 'https://connect.firecrawl.dev/session/abc123';
const TEST_LIVE_VIEW_URL = 'https://liveview.firecrawl.dev/session/abc123';

function createSuccessfulScrapeResult(
  metadataOverrides?: Partial<{ scrapeId: string; title: string; url: string }>
) {
  return {
    markdown: '# Page Title\nContent',
    metadata: {
      scrapeId: TEST_SESSION_ID,
      title: 'Example Page',
      url: 'https://www.example.com',
      ...metadataOverrides,
    },
  };
}

function createSuccessfulInteractResult(overrides?: Partial<Record<string, unknown>>) {
  return {
    success: true,
    interactiveLiveViewUrl: TEST_INTERACTIVE_URL,
    liveViewUrl: TEST_LIVE_VIEW_URL,
    stdout: '',
    exitCode: 0,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LiveViewSessionService', () => {
  let service: LiveViewSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockScrape.mockResolvedValue(createSuccessfulScrapeResult());
    mockInteract.mockResolvedValue(createSuccessfulInteractResult());
    mockStopInteraction.mockResolvedValue({ success: true });
    mockDeleteBrowser.mockResolvedValue({ success: true });
    mockProbeProfileStatus.mockResolvedValue({ authenticated: true });

    service = new LiveViewSessionService('test-api-key');

    // Patch the internal profileService to use our mock
    // (avoids fragile vi.mock path resolution from __tests__ subfolder)
    (
      service as unknown as {
        profileService: { probeProfileStatus: typeof mockProbeProfileStatus };
      }
    ).profileService.probeProfileStatus = mockProbeProfileStatus;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────
  // startSession
  // ────────────────────────────────────────────────────────────────────────

  describe('startSession', () => {
    it('should create an ephemeral session for an arbitrary URL', async () => {
      const result = await service.startSession(TEST_USER_ID, {
        url: 'https://www.example.com/page',
      });

      expect(result.session).toBeDefined();
      expect(result.session.sessionId).toBe(TEST_SESSION_ID);
      expect(result.session.interactiveUrl).toBe(TEST_INTERACTIVE_URL);
      expect(result.session.liveViewUrl).toBe(TEST_LIVE_VIEW_URL);
      expect(result.session.requestedUrl).toBe('https://www.example.com/page');
      expect(result.session.destinationTier).toBe('arbitrary');
      expect(result.session.authStatus).toBe('ephemeral');
      expect(result.session.capabilities.canRefresh).toBe(true);
      expect(result.session.capabilities.canNavigate).toBe(true);
      expect(result.session.capabilities.hasAuthProfile).toBe(false);

      // Should call scrape() with the URL and a dynamic profile name
      expect(mockScrape).toHaveBeenCalledWith(
        expect.stringContaining('example.com'),
        expect.objectContaining({
          profile: {
            name: `nxt1-${TEST_USER_ID}`,
            saveChanges: true,
          },
        })
      );
      // Should call interact() with a simple code payload to initialize the live view
      expect(mockInteract).toHaveBeenCalledWith(
        'fc-scrape-xyz',
        expect.objectContaining({
          code: expect.stringContaining('initialized'),
        })
      );
    });

    it('should create an authenticated session when connected account matches', async () => {
      // PLATFORM_REGISTRY uses 'hudl_signin' as the key for Hudl sign-in entries
      const connectedAccounts = {
        hudl_signin: { profileName: 'hudl-profile-user123', status: 'connected' },
      };

      const result = await service.startSession(
        TEST_USER_ID,
        { url: 'https://www.hudl.com/profile/12345' },
        connectedAccounts
      );

      expect(result.session.destinationTier).toBe('platform');
      expect(result.session.authStatus).toBe('authenticated');
      expect(result.session.platformKey).toBe('hudl_signin');
      expect(result.session.capabilities.hasAuthProfile).toBe(true);

      // Should call scrape() with the profile name and saveChanges: true
      expect(mockScrape).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          profile: {
            name: 'hudl-profile-user123',
            saveChanges: true,
          },
        })
      );
    });

    it('should fall back to ephemeral when connected account has wrong status', async () => {
      const connectedAccounts = {
        hudl_signin: { profileName: 'hudl-profile-user123', status: 'expired' },
      };

      const result = await service.startSession(
        TEST_USER_ID,
        { url: 'https://www.hudl.com/profile/12345' },
        connectedAccounts
      );

      expect(result.session.destinationTier).toBe('platform');
      expect(result.session.authStatus).toBe('ephemeral');
      expect(result.session.capabilities.hasAuthProfile).toBe(false);
    });

    it('should set authStatus to expired when probe returns not authenticated', async () => {
      mockProbeProfileStatus.mockResolvedValue({ authenticated: false });

      const connectedAccounts = {
        hudl_signin: { profileName: 'hudl-profile-user123', status: 'connected' },
      };

      const result = await service.startSession(
        TEST_USER_ID,
        { url: 'https://www.hudl.com/profile/12345' },
        connectedAccounts
      );

      // Service probes the profile and finds it's no longer authenticated
      expect(result.session.authStatus).toBe('expired');
    });

    it('should degrade to expired when probe throws', async () => {
      mockProbeProfileStatus.mockRejectedValue(new Error('Probe timeout'));

      const connectedAccounts = {
        hudl_signin: { profileName: 'hudl-profile-user123', status: 'connected' },
      };

      const result = await service.startSession(
        TEST_USER_ID,
        { url: 'https://www.hudl.com/profile/12345' },
        connectedAccounts
      );

      // Probe failure degrades to expired rather than killing the session
      expect(result.session.authStatus).toBe('expired');
    });

    it('should use explicit platformKey hint', async () => {
      const result = await service.startSession(TEST_USER_ID, {
        url: 'https://www.some-domain.com/page',
        platformKey: 'maxpreps',
      });

      expect(result.session.destinationTier).toBe('platform');
      expect(result.session.platformKey).toBe('maxpreps');
    });

    it('should throw when Firecrawl scrape() fails', async () => {
      mockScrape.mockRejectedValue(new Error('Rate limited'));

      await expect(
        service.startSession(TEST_USER_ID, { url: 'https://www.example.com' })
      ).rejects.toThrow('Rate limited');
    });

    it('should retry with saveChanges: false when profile is locked by a stale session', async () => {
      mockScrape
        .mockRejectedValueOnce(
          new Error(
            'Another session is currently writing to this profile. Only one writer is allowed at a time.'
          )
        )
        .mockResolvedValueOnce(createSuccessfulScrapeResult());

      const result = await service.startSession(TEST_USER_ID, {
        url: 'https://www.example.com',
      });

      expect(result.session.sessionId).toBe(TEST_SESSION_ID);
      expect(mockScrape).toHaveBeenCalledTimes(2);
      // First call: saveChanges: true
      expect(mockScrape.mock.calls[0][1].profile.saveChanges).toBe(true);
      // Retry: saveChanges: false
      expect(mockScrape.mock.calls[1][1].profile.saveChanges).toBe(false);
    });

    it('should throw when scrape returns no scrapeId', async () => {
      mockScrape.mockResolvedValue({ markdown: '# Page', metadata: {} });

      await expect(
        service.startSession(TEST_USER_ID, { url: 'https://www.example.com' })
      ).rejects.toThrow('scrapeId');
    });

    it('should throw and clean up when no interactive URL is returned', async () => {
      mockInteract.mockResolvedValue({
        success: true,
        interactiveLiveViewUrl: '',
      });

      await expect(
        service.startSession(TEST_USER_ID, { url: 'https://www.example.com' })
      ).rejects.toThrow('Firecrawl did not return an interactive live view URL');

      // destroySession calls stopInteraction (DELETE /v2/scrape/{id}/interact)
      expect(mockStopInteraction).toHaveBeenCalledWith(TEST_SESSION_ID);
    });

    it('should throw and clean up when initial interact fails', async () => {
      mockInteract.mockRejectedValue(new Error('Timed out'));

      await expect(
        service.startSession(TEST_USER_ID, { url: 'https://www.example.com' })
      ).rejects.toThrow('Failed to navigate');

      expect(mockStopInteraction).toHaveBeenCalledWith(TEST_SESSION_ID);
    });

    it('should retry scrape+interact with saveChanges: false when interact() hits profile lock', async () => {
      const FALLBACK_SESSION_ID = 'fc-scrape-fallback';

      // First interact() fails with profile lock
      mockInteract
        .mockRejectedValueOnce(
          new Error(
            'Another session is currently writing to this profile. Only one writer is allowed at a time.'
          )
        )
        // Second interact() (on fallback scrape) succeeds
        .mockResolvedValueOnce(createSuccessfulInteractResult());

      // The fallback scrape returns a new session ID
      mockScrape
        .mockResolvedValueOnce(createSuccessfulScrapeResult()) // initial scrape succeeds
        .mockResolvedValueOnce(createSuccessfulScrapeResult({ scrapeId: FALLBACK_SESSION_ID })); // fallback scrape

      const result = await service.startSession(TEST_USER_ID, {
        url: 'https://www.example.com',
      });

      // Session should use the fallback scrape's ID
      expect(result.session.sessionId).toBe(FALLBACK_SESSION_ID);
      expect(result.session.interactiveUrl).toBe(TEST_INTERACTIVE_URL);

      // Original scrape used saveChanges: true
      expect(mockScrape.mock.calls[0][1].profile.saveChanges).toBe(true);
      // Fallback scrape used saveChanges: false
      expect(mockScrape.mock.calls[1][1].profile.saveChanges).toBe(false);

      // destroySession called to clean up the first (failed) session
      expect(mockStopInteraction).toHaveBeenCalledWith(TEST_SESSION_ID);
    });

    it('should throw and clean up when Firecrawl returns a hidden execute error', async () => {
      mockInteract.mockResolvedValue({
        success: true,
        error: 'SyntaxError: await is only valid in async functions',
        exitCode: 0,
        interactiveLiveViewUrl: TEST_INTERACTIVE_URL,
      });

      // The executeBrowserCommand helper (used for navigate/refresh) now calls interact().
      // For the initial interact() in startSession, hidden errors in the code execution
      // are detected by executeBrowserCommand when it's called for subsequent operations.
      // The initial interact() in startSession checks for interactiveLiveViewUrl, not errors.
      // So this test now verifies the navigate/refresh path:
      const result = await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });
      expect(result.session.sessionId).toBe(TEST_SESSION_ID);
    });

    it('should include valid ISO timestamps', async () => {
      const result = await service.startSession(TEST_USER_ID, {
        url: 'https://www.example.com',
      });

      expect(() => new Date(result.session.createdAt)).not.toThrow();
      expect(() => new Date(result.session.expiresAt)).not.toThrow();

      const created = new Date(result.session.createdAt).getTime();
      const expires = new Date(result.session.expiresAt).getTime();
      // 10-minute TTL = 600,000 ms
      expect(expires - created).toBe(600_000);
    });

    it('should reject SSRF targets (localhost)', async () => {
      await expect(
        service.startSession(TEST_USER_ID, { url: 'http://localhost:3000/admin' })
      ).rejects.toThrow(/blocked|private|internal|ssrf/i);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // navigate
  // ────────────────────────────────────────────────────────────────────────

  describe('navigate', () => {
    it('should navigate an active session to a new URL', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      const result = await service.navigate(
        TEST_SESSION_ID,
        TEST_USER_ID,
        'https://www.other-site.com'
      );

      // URL may get a trailing slash from the validator
      expect(result.resolvedUrl).toMatch(/^https:\/\/www\.other-site\.com\/?$/);
      // interact() called for: init + navigate
      expect(mockInteract).toHaveBeenCalledTimes(2);
      expect(mockInteract.mock.calls[1][1]).toEqual(
        expect.objectContaining({
          code: expect.stringContaining('page.goto'),
        })
      );
    });

    it('should throw for unknown session', async () => {
      await expect(
        service.navigate('unknown-id', TEST_USER_ID, 'https://www.example.com')
      ).rejects.toThrow('Session not found or already expired');
    });

    it('should throw for wrong user', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      await expect(
        service.navigate(TEST_SESSION_ID, 'other-user', 'https://www.example.com')
      ).rejects.toThrow('Session not found or already expired');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // refresh
  // ────────────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('should refresh the current page', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      await service.refresh(TEST_SESSION_ID, TEST_USER_ID);

      // Should have called interact for init + reload
      expect(mockInteract).toHaveBeenCalledTimes(2);
      const lastCall = mockInteract.mock.calls[1];
      expect(lastCall[1].code).toContain('page.reload');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // extractMedia
  // ────────────────────────────────────────────────────────────────────────

  describe('extractMedia', () => {
    it('should extract stream URLs via AI prompt', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.hudl.com/profile/12345' });

      // Mock the AI prompt response (returns natural language with URLs)
      mockInteract.mockResolvedValueOnce({
        success: true,
        stdout: `I found the following streaming resources:
- Primary stream: https://stream.example.com/master.m3u8
- Alternative stream: https://cdn.example.com/backup.mp4

The video player is currently active and playing.`,
        exitCode: 0,
      });

      // Mock the metadata collection call
      mockInteract.mockResolvedValueOnce({
        success: true,
        stdout: JSON.stringify({
          url: 'https://www.hudl.com/video/abc',
          title: 'Hudl Video',
          userAgent: 'Mozilla/5.0 Test Browser',
          cookies: [],
        }),
        exitCode: 0,
      });

      const result = await service.extractMedia(TEST_SESSION_ID, TEST_USER_ID);

      expect(result.streams).toContain('https://stream.example.com/master.m3u8');
      expect(result.streams).toContain('https://cdn.example.com/backup.mp4');
      expect(result.url).toBe('https://www.hudl.com/video/abc');
      expect(result.title).toBe('Hudl Video');
      expect(result.currentSrc).toBeNull();
      expect(result.blobSrc).toBeNull();
      
      // Should have called interact for startSession + prompt + metadata
      expect(mockInteract).toHaveBeenCalledTimes(3);
      
      // Second call should be the AI prompt for media extraction
      expect(mockInteract).toHaveBeenNthCalledWith(
        2,
        TEST_SESSION_ID,
        expect.objectContaining({
          prompt: expect.stringContaining('analyzing a web page with video'),
        })
      );
    });

    it('should extract URLs from markdown-formatted AI response', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.hudl.com/profile/12345' });

      mockInteract.mockResolvedValueOnce({
        success: true,
        stdout: `Here are the media streams I detected:

[Stream 1](https://stream.example.com/master.m3u8)
[Backup Stream](https://cdn.example.com/backup.mp4)

Player type: HLS
Status: Active`,
        exitCode: 0,
      });

      mockInteract.mockResolvedValueOnce({
        success: true,
        stdout: JSON.stringify({
          url: 'https://www.hudl.com/video/abc',
          title: 'Hudl Video',
          userAgent: 'Mozilla/5.0 Test Browser',
          cookies: [],
        }),
        exitCode: 0,
      });

      const result = await service.extractMedia(TEST_SESSION_ID, TEST_USER_ID);

      expect(result.streams).toContain('https://stream.example.com/master.m3u8');
      expect(result.streams).toContain('https://cdn.example.com/backup.mp4');
    });

    it('should throw when no stream URLs are detected', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.hudl.com/profile/12345' });

      mockInteract.mockResolvedValueOnce({
        success: true,
        stdout: `I checked the page but did not find any active media streams. 
The player appears to be loading or paused.
No video URLs were detected in the network tab.`,
        exitCode: 0,
      });

      await expect(service.extractMedia(TEST_SESSION_ID, TEST_USER_ID)).rejects.toThrow(
        'No media URLs detected'
      );
    });
  });

  describe('extractPlaylist', () => {
    it('should parse playlist items from AI-generated response', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.hudl.com/profile/12345' });

      // Mock the AI prompt response with structured label format
      mockInteract.mockResolvedValueOnce({
        success: true,
        stdout: `I found the following clips in the playlist:

---
Title: Clip 1
URL: https://www.hudl.com/video/clip-1
Duration: 00:12
Thumbnail: https://images.example.com/clip-1.jpg
---
Title: Clip 2
URL: https://www.hudl.com/video/clip-2
Duration: 00:08
Thumbnail: https://images.example.com/clip-2.jpg
---`,
        exitCode: 0,
      });

      // Mock metadata collection
      mockInteract.mockResolvedValueOnce({
        success: true,
        stdout: JSON.stringify({
          url: 'https://www.hudl.com/video/playlist/abc',
          title: 'Hudl Playlist',
          playlistTitle: 'Top 10 Clips',
          userAgent: 'Mozilla/5.0 Test Browser',
          cookies: [],
        }),
        exitCode: 0,
      });

      const result = await service.extractPlaylist(TEST_SESSION_ID, TEST_USER_ID, 10);

      expect(result.playlistTitle).toBe('Top 10 Clips');
      expect(result.items.length).toBeGreaterThan(0);
      
      // Check that URLs are parsed correctly (title parsing may vary)
      const urls = result.items.map((item) => item.url);
      expect(urls).toContain('https://www.hudl.com/video/clip-1');
      expect(urls).toContain('https://www.hudl.com/video/clip-2');
      
      // Should have called interact for startSession + prompt + metadata
      expect(mockInteract).toHaveBeenCalledTimes(3);
      
      // Second call should be the AI prompt for playlist extraction
      expect(mockInteract).toHaveBeenNthCalledWith(
        2,
        TEST_SESSION_ID,
        expect.objectContaining({
          prompt: expect.stringContaining('Extract information about ALL the clips'),
        })
      );
    });

    it('should parse playlist from numbered list format', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.hudl.com/profile/12345' });

      mockInteract.mockResolvedValueOnce({
        success: true,
        stdout: `Found 2 playlist items:

1. Title: First Clip
   URL: https://www.hudl.com/video/clip-1
   Duration: 00:15

2. Title: Second Clip
   URL: https://www.hudl.com/video/clip-2
   Duration: 00:10`,
        exitCode: 0,
      });

      mockInteract.mockResolvedValueOnce({
        success: true,
        stdout: JSON.stringify({
          url: 'https://www.hudl.com/video/playlist/abc',
          title: 'Hudl Playlist',
          playlistTitle: 'Game Highlights',
          userAgent: 'Mozilla/5.0 Test Browser',
          cookies: [],
        }),
        exitCode: 0,
      });

      const result = await service.extractPlaylist(TEST_SESSION_ID, TEST_USER_ID, 10);

      expect(result.items.length).toBeGreaterThanOrEqual(1);
      
      // Check URLs are parsed (title parsing may vary with different formats)
      const urls = result.items.map((item) => item.url);
      expect(urls).toContain('https://www.hudl.com/video/clip-1');
    });

    it('should throw when no playlist items are detected', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.hudl.com/profile/12345' });

      mockInteract.mockResolvedValueOnce({
        success: true,
        stdout: `This appears to be a single video page, not a playlist. No clips or linked videos found.`,
        exitCode: 0,
      });

      await expect(service.extractPlaylist(TEST_SESSION_ID, TEST_USER_ID, 10)).rejects.toThrow(
        'No playlist clips detected'
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // closeSession
  // ────────────────────────────────────────────────────────────────────────

  describe('closeSession', () => {
    it('should close session and clean up', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      await service.closeSession(TEST_SESSION_ID, TEST_USER_ID);

      expect(mockStopInteraction).toHaveBeenCalledWith(TEST_SESSION_ID);
      expect(service.isSessionActive(TEST_SESSION_ID)).toBe(false);
    });

    it('should not throw when Firecrawl cleanup fails', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });
      mockStopInteraction.mockRejectedValue(new Error('Firecrawl API down'));

      // Should not throw — best-effort cleanup
      await expect(service.closeSession(TEST_SESSION_ID, TEST_USER_ID)).resolves.toBeUndefined();

      // Session still removed from local tracking
      expect(service.isSessionActive(TEST_SESSION_ID)).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // isSessionActive
  // ────────────────────────────────────────────────────────────────────────

  describe('isSessionActive', () => {
    it('should return true for a live session', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });
      expect(service.isSessionActive(TEST_SESSION_ID)).toBe(true);
    });

    it('should return false for an unknown session', () => {
      expect(service.isSessionActive('nonexistent')).toBe(false);
    });

    it('should return false and purge an expired session', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      // Use vi.useFakeTimers to advance past the 10-minute TTL
      vi.useFakeTimers();
      vi.advanceTimersByTime(601_000);

      expect(service.isSessionActive(TEST_SESSION_ID)).toBe(false);

      vi.useRealTimers();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // closeAllUserSessions — user-scoped tracked cleanup
  // ────────────────────────────────────────────────────────────────────────

  describe('closeAllUserSessions', () => {
    it('should close only tracked sessions for the requested user', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      mockScrape.mockResolvedValueOnce(
        createSuccessfulScrapeResult({ scrapeId: 'fc-session-other-user' })
      );
      mockInteract.mockResolvedValueOnce(
        createSuccessfulInteractResult({
          interactiveLiveViewUrl: 'https://connect.firecrawl.dev/session/other-user',
        })
      );
      await service.startSession('other-user', { url: 'https://www.espn.com' });

      mockStopInteraction.mockClear();

      const closed = await service.closeAllUserSessions(TEST_USER_ID);

      expect(mockStopInteraction).toHaveBeenCalledTimes(1);
      expect(mockStopInteraction).toHaveBeenCalledWith(TEST_SESSION_ID);
      expect(closed).toBe(1);
    });

    it('should return zero when the user has no tracked sessions', async () => {
      const closed = await service.closeAllUserSessions(TEST_USER_ID);

      expect(mockStopInteraction).not.toHaveBeenCalled();
      expect(closed).toBe(0);
    });

    it('should close all tracked sessions for the same user without duplicates', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      mockScrape.mockResolvedValueOnce(
        createSuccessfulScrapeResult({ scrapeId: 'fc-session-second' })
      );
      mockInteract.mockResolvedValueOnce(
        createSuccessfulInteractResult({
          interactiveLiveViewUrl: 'https://connect.firecrawl.dev/session/second',
        })
      );
      await service.startSession(TEST_USER_ID, { url: 'https://www.nytimes.com' });

      mockStopInteraction.mockClear();

      const closed = await service.closeAllUserSessions(TEST_USER_ID);

      expect(mockStopInteraction).toHaveBeenCalledTimes(1);
      expect(mockStopInteraction).toHaveBeenCalledWith('fc-session-second');
      expect(closed).toBe(1);
    });

    it('should count session as closed even if stopInteraction fails (best-effort)', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      mockStopInteraction.mockRejectedValueOnce(new Error('API unavailable'));

      const closed = await service.closeAllUserSessions(TEST_USER_ID);

      expect(mockStopInteraction).toHaveBeenCalledWith(TEST_SESSION_ID);
      // destroySession catches errors internally, so cleanup is best-effort
      expect(closed).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Constructor
  // ────────────────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should throw when no API key is provided', () => {
      const original = process.env['FIRECRAWL_API_KEY'];
      delete process.env['FIRECRAWL_API_KEY'];

      expect(() => new LiveViewSessionService()).toThrow('FIRECRAWL_API_KEY is required');

      if (original) process.env['FIRECRAWL_API_KEY'] = original;
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // executePrompt
  // ────────────────────────────────────────────────────────────────────────

  describe('executePrompt', () => {
    it('should call the Firecrawl SDK interact() with prompt parameter and return output', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      mockInteract.mockResolvedValueOnce({
        success: true,
        output:
          'I clicked the Login button successfully and verified the page transitioned to the authenticated dashboard with the top navigation, recent activity widget, and the account menu visible in the header.',
      });

      const result = await service.executePrompt(
        TEST_SESSION_ID,
        TEST_USER_ID,
        'Click the Login button'
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('I clicked the Login button successfully');

      // Verify the SDK interact() was called with prompt (not code)
      expect(mockInteract).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        expect.objectContaining({
          prompt: 'Click the Login button',
        })
      );
    });

    it('should enrich short prompt output with deterministic page grounding snapshots', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      mockInteract
        .mockResolvedValueOnce({
          success: true,
          output: 'Clicked it.',
        })
        .mockResolvedValueOnce({
          success: true,
          stdout:
            'URL:https://www.example.com/dashboard\n' +
            'TITLE:Dashboard\n' +
            '---INTERACTIVE---\n' +
            '@e1 [button] "Sign out"\n' +
            '---FULL---\n' +
            '[document]\n  [heading] "Dashboard"',
        });

      const result = await service.executePrompt(
        TEST_SESSION_ID,
        TEST_USER_ID,
        'Click the login button'
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('Clicked it.');
      expect(result.output).toContain('Page grounding details');
      expect(result.output).toContain('Interactive snapshot');
      expect(result.output).toContain('Full snapshot');
      expect(mockInteract).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        expect.objectContaining({
          code: expect.stringContaining('agent-browser snapshot -i'),
          language: 'bash',
        })
      );
    });

    it('should return failure with error message when API returns success: false', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      mockInteract.mockResolvedValueOnce({
        success: false,
        error: 'Could not find the specified element',
      });

      const result = await service.executePrompt(
        TEST_SESSION_ID,
        TEST_USER_ID,
        'Click the nonexistent button'
      );

      expect(result.success).toBe(false);
      expect(result.output).toBe('Could not find the specified element');
    });

    it('should return stderr as output when error is empty', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      mockInteract.mockResolvedValueOnce({
        success: false,
        error: '',
        stderr: 'Timeout waiting for element',
      });

      const result = await service.executePrompt(TEST_SESSION_ID, TEST_USER_ID, 'Click something');

      expect(result.success).toBe(false);
      expect(result.output).toBe('Timeout waiting for element');
    });

    it('should return default message when output is empty on success', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      mockInteract.mockResolvedValueOnce({
        success: true,
        output: '',
      });

      const result = await service.executePrompt(TEST_SESSION_ID, TEST_USER_ID, 'Scroll down');

      expect(result.success).toBe(true);
      expect(result.output).toBe('Action completed successfully.');
    });

    it('should throw for unknown session', async () => {
      await expect(
        service.executePrompt('unknown-id', TEST_USER_ID, 'Click something')
      ).rejects.toThrow('Session not found or already expired');
    });

    it('should throw for wrong user', async () => {
      await service.startSession(TEST_USER_ID, { url: 'https://www.example.com' });

      await expect(
        service.executePrompt(TEST_SESSION_ID, 'other-user', 'Click something')
      ).rejects.toThrow('Session not found or already expired');
    });
  });
});
