/**
 * @fileoverview Live View Session Service
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/browser
 *
 * Orchestrates live-view browser sessions for the Agent X desktop Command Center.
 * Supports two destination tiers:
 *
 * 1. **Platform (allowlisted)** — A known platform from PLATFORM_REGISTRY.
 *    If the user has a connected Firecrawl profile for that platform, the
 *    session reuses it (authenticated browsing). Otherwise, an ephemeral
 *    session is created.
 *
 * 2. **Arbitrary (validated URL)** — Any HTTP(S) URL that passes SSRF
 *    validation. Always creates an ephemeral session (no auth reuse).
 *
 * This service owns:
 * - Destination resolution (user intent → canonical URL)
 * - Session creation (authenticated via profile or ephemeral)
 * - In-session navigation
 * - Session cleanup
 * - Building the `LiveViewSession` contract for the frontend
 *
 * Security:
 * - All URLs validated via `validateUrl()` for SSRF safety.
 * - Persistent profiles use `saveChanges: true` scoped per-user so logins persist.
 * - Session ownership enforced by caller (route layer checks `user.uid`).
 */

import Firecrawl from '@mendable/firecrawl-js';
import type { ScrapeExecuteResponse } from '@mendable/firecrawl-js';
import { PLATFORM_REGISTRY } from '@nxt1/core/platforms';
import type {
  LiveViewSession,
  LiveViewDestinationTier,
  LiveViewAuthStatus,
  LiveViewSessionCapabilities,
} from '@nxt1/core';
import { FirecrawlProfileService } from './firecrawl-profile.service.js';
import { validateUrl } from '../scraping/url-validator.js';
import { logger } from '../../../../../../utils/logger.js';
import { AgentEngineError } from '../../../../exceptions/agent-engine.error.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StartLiveViewRequest {
  /** The URL the user or agent wants to visit. */
  readonly url: string;
  /** Optional platform key hint (e.g. `'hudl'`) — skips domain-matching. */
  readonly platformKey?: string;
}

export interface StartLiveViewResult {
  /** The full session contract for the frontend. */
  readonly session: LiveViewSession;
}

interface ActiveSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly interactiveUrl: string;
  readonly liveViewUrl?: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/** Action that can be executed in a live-view browser session. */
export interface LiveViewAction {
  readonly type: 'click' | 'type' | 'scroll' | 'wait';
  /** CSS selector for click/type/scroll-to-element. */
  readonly selector?: string;
  /** Text to type (for 'type' actions). */
  readonly text?: string;
  /** Pixels to scroll (for 'scroll' actions without a selector). */
  readonly amount?: number;
  /** Milliseconds to wait (for 'wait' actions, capped at 5000). */
  readonly ms?: number;
}

/** Result of a prompt-based browser interaction. */
export interface LiveViewPromptResult {
  readonly success: boolean;
  /** Natural language response from Firecrawl's AI describing what it did. */
  readonly output: string;
}

export interface LiveViewRequestCookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly expires?: number;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite?: string;
}

export interface LiveViewRequestAuthContext {
  readonly userAgent: string | null;
  readonly referer: string | null;
  readonly origin: string | null;
  readonly cookieHeader: string | null;
  readonly cookies: readonly LiveViewRequestCookie[];
}

export interface LiveViewMediaExtractionResult {
  readonly url: string;
  readonly title: string;
  readonly streams: readonly string[];
  readonly currentSrc: string | null;
  readonly blobSrc: string | null;
  readonly auth: LiveViewRequestAuthContext;
}

export interface LiveViewPlaylistItem {
  readonly index: number;
  readonly itemId: string | null;
  readonly title: string;
  readonly url: string | null;
  readonly durationText: string | null;
  readonly thumbnailUrl: string | null;
  readonly textSnippet: string | null;
  readonly isCurrent: boolean;
}

export interface LiveViewPlaylistExtractionResult {
  readonly url: string;
  readonly title: string;
  readonly playlistTitle: string | null;
  readonly items: readonly LiveViewPlaylistItem[];
  readonly auth: LiveViewRequestAuthContext;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Live-view sessions last 10 minutes (longer than sign-in flows). */
const LIVE_VIEW_TTL_SECONDS = 600;

/**
 * NOTE: We intentionally do NOT pass a `timeout` parameter to Firecrawl's
 * `interact()` calls.  The API expects timeout in **seconds**, but the SDK
 * bug-adds `body.timeout + 5000` as the axios HTTP timeout in milliseconds.
 * Passing 30 (seconds) → axios caps at 5 030 ms (too short).
 * Passing 30 000 (ms) → API rejects as "Bad Request" (30 000 s ≈ 8 hours).
 * Omitting it lets Firecrawl use its server-side default and avoids the SDK bug.
 */

// ─── Service ────────────────────────────────────────────────────────────────

export class LiveViewSessionService {
  private readonly client: Firecrawl;
  private readonly profileService: FirecrawlProfileService;

  /**
   * Track active sessions → userId for ownership enforcement.
   * In a horizontally-scaled deployment this would use Redis.
   */
  private readonly activeSessions = new Map<string, ActiveSession>();

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env['FIRECRAWL_API_KEY'];
    if (!key) {
      throw new AgentEngineError(
        'LIVE_VIEW_CONFIG_MISSING_API_KEY',
        'FIRECRAWL_API_KEY is required. Set it in environment variables or pass it to the constructor.'
      );
    }
    this.client = new Firecrawl({ apiKey: key });
    this.profileService = new FirecrawlProfileService(key);
  }

  private quoteJsString(value: string): string {
    return JSON.stringify(value);
  }

  /**
   * Execute Playwright code in an active scrape interact session.
   * Uses `language: 'node'` (Playwright) — the default for the interact API.
   * The `agent-browser` bash CLI is only available in /v2/browser sessions.
   */
  private async executeBrowserCommand(sessionId: string, code: string): Promise<string> {
    const result: ScrapeExecuteResponse = await this.client.interact(sessionId, {
      code,
    });

    const hiddenError = result.error?.trim();
    if (!result.success || result.killed || (result.exitCode ?? 0) !== 0 || hiddenError) {
      throw new AgentEngineError(
        'LIVE_VIEW_REQUEST_FAILED',
        hiddenError || result.stderr || 'Browser command failed',
        {
          metadata: { sessionId },
        }
      );
    }

    return (result.stdout ?? result.result ?? '').trim();
  }

  private buildCookieHeader(cookies: readonly LiveViewRequestCookie[]): string | null {
    if (cookies.length === 0) return null;

    return cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .filter((value) => value.trim().length > 0)
      .join('; ');
  }

  private resolveOrigin(url: string | undefined): string | null {
    if (!url) return null;

    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  }

  private parseBrowserJson<T>(raw: string, sessionId: string, failureMessage: string): T {
    const candidates: string[] = [];
    const trimmed = raw.trim();
    if (trimmed) {
      candidates.push(trimmed);
    }

    const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      candidates.push(fencedMatch[1].trim());
    }

    const objectMatch = raw.match(/(\{[\s\S]*\})/);
    if (objectMatch?.[1]) {
      candidates.push(objectMatch[1].trim());
    }

    const arrayMatch = raw.match(/(\[[\s\S]*\])/);
    if (arrayMatch?.[1]) {
      candidates.push(arrayMatch[1].trim());
    }

    let lastError: unknown;

    for (const candidate of [...new Set(candidates)].filter((value) => value.length > 0)) {
      try {
        return JSON.parse(candidate) as T;
      } catch (err) {
        lastError = err;

        const repaired = candidate
          .replace(/^\uFEFF/, '')
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/,\s*([}\]])/g, '$1');

        if (repaired !== candidate) {
          try {
            return JSON.parse(repaired) as T;
          } catch (repairErr) {
            lastError = repairErr;
          }
        }
      }
    }

    logger.error('[LiveViewSession] Failed to parse browser JSON', {
      sessionId,
      error: lastError instanceof Error ? lastError.message : String(lastError ?? 'Unknown error'),
      rawPreview: raw.slice(0, 350),
    });

    throw new AgentEngineError('LIVE_VIEW_REQUEST_FAILED', failureMessage, {
      metadata: { sessionId },
    });
  }

  /**
   * Fully destroy a Firecrawl scrape-based session.
   *
   * Per the Firecrawl Interact docs (https://docs.firecrawl.dev/features/interact),
   * `DELETE /v2/scrape/{scrapeId}/interact` is the correct endpoint to stop
   * the session and release the concurrent browser slot.  The SDK wraps this
   * as `stopInteraction()`.
   *
   * Note: `deleteBrowser()` maps to `DELETE /v2/browser/{id}` which is a
   * **different** API for sessions created via `POST /v2/browser`.  Calling it
   * on scrape-based sessions is a no-op at best and may hold zombie locks.
   */
  private async destroySession(sessionId: string): Promise<void> {
    try {
      await this.client.stopInteraction(sessionId);
      logger.info('[LiveViewSession] stopInteraction succeeded', { sessionId });
    } catch (err) {
      logger.warn('[LiveViewSession] stopInteraction failed (best-effort)', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ─── Destination Resolution ───────────────────────────────────────────

  /**
   * Resolve a destination URL and determine its trust tier.
   * If a `platformKey` is provided, looks it up directly.
   * Otherwise, tries to match the URL's domain to a known platform.
   *
   * @returns An object with the resolved URL, tier, and optional platform key.
   */
  private resolveDestination(request: StartLiveViewRequest): {
    resolvedUrl: string;
    tier: LiveViewDestinationTier;
    platformKey?: string;
    domainLabel: string;
  } {
    // Validate the URL for SSRF safety first
    const validatedUrl = validateUrl(request.url);
    const parsed = new URL(validatedUrl);
    const hostname = parsed.hostname.toLowerCase();

    // If an explicit platform key was provided, use it
    if (request.platformKey) {
      const platformDef = PLATFORM_REGISTRY.find((p) => p.platform === request.platformKey);
      if (platformDef) {
        return {
          resolvedUrl: validatedUrl,
          tier: 'platform',
          platformKey: platformDef.platform,
          domainLabel: platformDef.label,
        };
      }
    }

    // Try to match hostname to a known platform
    for (const def of PLATFORM_REGISTRY) {
      if (!def.loginUrl) continue;
      try {
        const platformHost = new URL(def.loginUrl).hostname.toLowerCase();
        // Match base domain (e.g. 'hudl.com' matches 'www.hudl.com')
        const baseDomain = platformHost.replace(/^www\./, '');
        if (hostname === baseDomain || hostname.endsWith(`.${baseDomain}`)) {
          return {
            resolvedUrl: validatedUrl,
            tier: 'platform',
            platformKey: def.platform,
            domainLabel: def.label,
          };
        }
      } catch {
        // Skip malformed loginUrl entries
      }
    }

    // Arbitrary validated URL — extract a readable domain label
    const domainLabel =
      hostname
        .replace(/^www\./, '')
        .split('.')
        .slice(0, -1)
        .join('.') || hostname;

    return {
      resolvedUrl: validatedUrl,
      tier: 'arbitrary',
      domainLabel: domainLabel.charAt(0).toUpperCase() + domainLabel.slice(1),
    };
  }

  // ─── Session Lifecycle ────────────────────────────────────────────────

  /**
   * Start a live-view browser session.
   *
   * 1. Resolves the destination (tier + optional platform).
   * 2. Checks for a saved Firecrawl profile if tier is `platform`.
   * 3. Creates a Firecrawl browser session (authenticated or ephemeral).
   * 4. Navigates to the destination URL.
   * 5. Returns the full `LiveViewSession` contract.
   */
  async startSession(
    userId: string,
    request: StartLiveViewRequest,
    connectedAccounts?: Record<string, { profileName?: string; status?: string }>
  ): Promise<StartLiveViewResult> {
    const destination = this.resolveDestination(request);

    logger.info('[LiveViewSession] Starting session', {
      userId,
      requestedUrl: request.url,
      resolvedUrl: destination.resolvedUrl,
      tier: destination.tier,
      platformKey: destination.platformKey,
    });

    // Auto-close existing sessions for this user to prevent quota exhaustion
    await this.closeAllUserSessions(userId);

    // Determine auth strategy
    let authStatus: LiveViewAuthStatus = 'ephemeral';
    let profileName: string | undefined;

    if (destination.tier === 'platform' && destination.platformKey && connectedAccounts) {
      const account = connectedAccounts[destination.platformKey];
      if (account?.profileName && (account.status === 'active' || account.status === 'connected')) {
        profileName = account.profileName;
        authStatus = 'authenticated';
        logger.info('[LiveViewSession] Using authenticated profile', {
          userId,
          platformKey: destination.platformKey,
          profileName,
        });
      }
    }

    // Build persistent profile — uses connected account name when available,
    // otherwise a dynamic per-user name so manual logins persist across sessions.
    const resolvedProfileName =
      profileName ??
      `nxt1-${userId}${destination.platformKey ? `-${destination.platformKey}` : ''}`;

    // Create a Firecrawl session via the Scrape + Interact workflow.
    // `scrape()` opens the URL in a remote browser and returns a scrapeId.
    // `interact()` then resumes the session for AI-driven or code-based actions.
    //
    // If the profile is locked by a stale session (e.g. after server restart),
    // we fall back to saveChanges: false so we can still open the session.
    let scrapeResult: { metadata?: { scrapeId?: string } };
    try {
      scrapeResult = await this.client.scrape(destination.resolvedUrl, {
        profile: {
          name: resolvedProfileName,
          saveChanges: true,
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('Another session is currently writing')) {
        logger.warn(
          '[LiveViewSession] Profile locked by stale session, retrying with saveChanges: false',
          {
            userId,
            profileName: resolvedProfileName,
          }
        );
        scrapeResult = await this.client.scrape(destination.resolvedUrl, {
          profile: {
            name: resolvedProfileName,
            saveChanges: false,
          },
        });
      } else {
        throw err;
      }
    }

    let sessionId = scrapeResult.metadata?.scrapeId;
    if (!sessionId) {
      throw new AgentEngineError(
        'LIVE_VIEW_REQUEST_FAILED',
        'Firecrawl scrape did not return a scrapeId — cannot start live view.'
      );
    }

    // Fire an initial interact() call to activate the live-view session
    // and obtain the interactiveLiveViewUrl.
    //
    // Per the Firecrawl Interact docs, the scrape interact API accepts either:
    //   - `prompt` for AI-driven actions
    //   - `code` for Playwright-based control
    //
    // We use a simple fast javascript code snippet to acquire the session quickly.
    // (The `agent-browser` bash CLI is only available in /v2/browser sessions.)
    //
    // If this fails with a profile write-lock (stale session that
    // stopInteraction didn't fully release), retry the entire scrape+interact
    // flow with saveChanges: false so the user isn't blocked.
    let interactiveUrl: string | undefined;
    let liveViewUrl: string | undefined;
    try {
      const initResult: ScrapeExecuteResponse = await this.client.interact(sessionId, {
        code: "return 'desktop-session-initialized';",
      });
      interactiveUrl = initResult.interactiveLiveViewUrl ?? '';
      liveViewUrl = initResult.liveViewUrl ?? '';

      // Log the exact URL and its origin so we can verify the frontend whitelist
      logger.info('[LiveViewSession] interact() returned interactiveLiveViewUrl', {
        sessionId,
        interactiveUrl,
        origin: interactiveUrl ? new URL(interactiveUrl).origin : 'N/A',
        liveViewUrl: liveViewUrl || 'N/A',
      });
    } catch (initErr) {
      const initErrMsg = initErr instanceof Error ? initErr.message : String(initErr);

      // Profile lock on interact() — the old session wasn't fully released.
      // Tear down this scrape and retry with saveChanges: false.
      if (initErrMsg.includes('Another session is currently writing')) {
        logger.warn(
          '[LiveViewSession] interact() hit profile lock, retrying with saveChanges: false',
          {
            sessionId,
            userId,
            profileName: resolvedProfileName,
          }
        );
        await this.destroySession(sessionId);

        const fallbackScrape = await this.client.scrape(destination.resolvedUrl, {
          profile: {
            name: resolvedProfileName,
            saveChanges: false,
          },
        });

        const fallbackId = fallbackScrape.metadata?.scrapeId;
        if (!fallbackId) {
          throw new AgentEngineError(
            'LIVE_VIEW_REQUEST_FAILED',
            'Firecrawl fallback scrape did not return a scrapeId.',
            { cause: initErr }
          );
        }

        // Reassign sessionId for the rest of the flow
        sessionId = fallbackId;

        try {
          const fallbackInit: ScrapeExecuteResponse = await this.client.interact(sessionId, {
            code: "return 'desktop-session-initialized';",
          });
          interactiveUrl = fallbackInit.interactiveLiveViewUrl ?? '';
          liveViewUrl = fallbackInit.liveViewUrl ?? '';

          logger.info('[LiveViewSession] Fallback interact() returned interactiveLiveViewUrl', {
            sessionId,
            interactiveUrl,
            origin: interactiveUrl ? new URL(interactiveUrl).origin : 'N/A',
            liveViewUrl: liveViewUrl || 'N/A',
          });
        } catch (fallbackErr) {
          logger.error('[LiveViewSession] Fallback interact also failed', {
            sessionId,
            error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          });
          await this.destroySession(sessionId);
          throw new AgentEngineError(
            'LIVE_VIEW_REQUEST_FAILED',
            `Failed to navigate to ${destination.domainLabel}: ${fallbackErr instanceof Error ? fallbackErr.message : 'Navigation timeout'}`,
            { cause: fallbackErr }
          );
        }
      } else {
        logger.error('[LiveViewSession] Initial interact failed, cleaning up', {
          sessionId,
          url: destination.resolvedUrl,
          error: initErrMsg,
        });
        await this.destroySession(sessionId);
        throw new AgentEngineError(
          'LIVE_VIEW_REQUEST_FAILED',
          `Failed to navigate to ${destination.domainLabel}: ${initErr instanceof Error ? initErr.message : 'Navigation timeout'}`,
          { cause: initErr }
        );
      }
    }

    if (!interactiveUrl) {
      // Clean up since we can't present it
      await this.destroySession(sessionId);
      throw new AgentEngineError(
        'LIVE_VIEW_REQUEST_FAILED',
        'Firecrawl did not return an interactive live view URL. Cannot start live view.'
      );
    }

    // If we attempted auth reuse, verify it actually worked
    if (authStatus === 'authenticated') {
      try {
        const probe = await this.profileService.probeProfileStatus(
          userId,
          destination.platformKey!,
          destination.resolvedUrl
        );
        if (!probe.authenticated) {
          authStatus = 'expired';
          logger.warn('[LiveViewSession] Auth profile expired', {
            userId,
            platformKey: destination.platformKey,
            sessionId,
          });
        }
      } catch {
        // Probe failure doesn't kill the session — degrade to expired
        authStatus = 'expired';
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + LIVE_VIEW_TTL_SECONDS * 1000);

    // Track active session
    this.activeSessions.set(sessionId, {
      sessionId,
      userId,
      interactiveUrl,
      ...(liveViewUrl ? { liveViewUrl } : {}),
      createdAt: now,
      expiresAt,
    });

    const capabilities: LiveViewSessionCapabilities = {
      canRefresh: true,
      canNavigate: true,
      hasAuthProfile: authStatus === 'authenticated',
    };

    const session: LiveViewSession = {
      sessionId,
      interactiveUrl,
      ...(liveViewUrl ? { liveViewUrl } : {}),
      requestedUrl: request.url,
      resolvedUrl: destination.resolvedUrl,
      destinationTier: destination.tier,
      platformKey: destination.platformKey,
      domainLabel: destination.domainLabel,
      authStatus,
      capabilities,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    logger.info('[LiveViewSession] Session started', {
      sessionId,
      userId,
      tier: destination.tier,
      authStatus,
      platformKey: destination.platformKey,
      expiresAt: expiresAt.toISOString(),
    });

    return { session };
  }

  /**
   * Navigate an active session to a new URL.
   */
  async navigate(sessionId: string, userId: string, url: string): Promise<{ resolvedUrl: string }> {
    this.assertOwnership(sessionId, userId);
    const validatedUrl = validateUrl(url);

    logger.info('[LiveViewSession] Navigating', { sessionId, url: validatedUrl });

    await this.executeBrowserCommand(
      sessionId,
      `await page.goto(${this.quoteJsString(validatedUrl)}, { waitUntil: 'networkidle' });`
    );

    return { resolvedUrl: validatedUrl };
  }

  /**
   * Refresh the current page in an active session.
   */
  async refresh(sessionId: string, userId: string): Promise<void> {
    this.assertOwnership(sessionId, userId);

    logger.info('[LiveViewSession] Refreshing', { sessionId });

    await this.executeBrowserCommand(
      sessionId,
      `await page.reload({ waitUntil: 'domcontentloaded' });`
    );
  }

  /**
   * Close a live-view session and clean up Firecrawl resources.
   * If the sessionId is tracked locally, validates ownership first.
   * If not tracked (e.g. after server restart), attempts best-effort cleanup.
   */
  async closeSession(sessionId: string, userId: string): Promise<void> {
    const tracked = this.activeSessions.get(sessionId);

    if (tracked) {
      // Validate ownership for tracked sessions
      if (tracked.userId !== userId) {
        throw new AgentEngineError(
          'LIVE_VIEW_SESSION_NOT_FOUND',
          'Session not found or already expired'
        );
      }
      this.activeSessions.delete(sessionId);
    }

    logger.info('[LiveViewSession] Closing session', { sessionId, userId, tracked: !!tracked });

    await this.destroySession(sessionId);

    logger.info('[LiveViewSession] Session closed', { sessionId });
  }

  /**
   * Check if a session is still tracked (not expired or closed).
   */
  isSessionActive(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    if (new Date() > session.expiresAt) {
      this.activeSessions.delete(sessionId);
      return false;
    }
    return true;
  }

  /**
   * Extract the current page content from an active live-view session.
   *
   * Uses the `agent-browser` bash CLI pre-installed in Firecrawl's interact
   * sandbox. A single bash call retrieves URL, title, and full accessibility
   * tree snapshot without any Playwright code written by us and at 2 credits/min
   * (code-only mode) instead of 7 credits/min (AI prompt mode).
   *
   * Falls back to the AI prompt approach if the bash call fails, and to a
   * static error string if both fail.
   */
  async extractContent(
    sessionId: string,
    userId: string
  ): Promise<{ url: string; title: string; content: string }> {
    this.assertOwnership(sessionId, userId);

    logger.info('[LiveViewSession] Extracting content', { sessionId });

    // Primary: single bash call — agent-browser CLI (2 credits/min, no Playwright code from us).
    // The echo prefixes let us parse URL and TITLE reliably from stdout regardless of
    // page title content. The snapshot command dumps the full accessibility tree.
    const BASH_CMD =
      'echo "URL:$(agent-browser get url)" && ' +
      'echo "TITLE:$(agent-browser get title)" && ' +
      'echo "---CONTENT---" && ' +
      'agent-browser snapshot';

    try {
      const bashResult: ScrapeExecuteResponse = await this.client.interact(sessionId, {
        code: BASH_CMD,
        language: 'bash' as Parameters<typeof this.client.interact>[1]['language'],
      });

      const stdout = bashResult.stdout?.trim() ?? '';
      if (bashResult.success && stdout) {
        const lines = stdout.split('\n');
        const urlLine = lines.find((l) => l.startsWith('URL:'));
        const titleLine = lines.find((l) => l.startsWith('TITLE:'));
        const contentStart = lines.indexOf('---CONTENT---');
        const contentLines = contentStart >= 0 ? lines.slice(contentStart + 1) : [];

        const url = urlLine ? urlLine.slice('URL:'.length).trim() : '';
        const title = titleLine ? titleLine.slice('TITLE:'.length).trim() : '';
        const content = contentLines.join('\n').trim();

        if (url && content) {
          logger.info('[LiveViewSession] Bash extraction succeeded', {
            sessionId,
            url,
            contentLength: content.length,
          });
          return { url, title, content: content.slice(0, 30_000) };
        }
      }

      logger.warn(
        '[LiveViewSession] Bash extraction returned empty output, falling back to AI prompt',
        {
          sessionId,
          exitCode: bashResult.exitCode,
          stderr: bashResult.stderr?.slice(0, 200),
        }
      );
    } catch (err) {
      logger.warn('[LiveViewSession] Bash extraction threw, falling back to AI prompt', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Fallback: AI prompt extraction (7 credits/min — used only when bash fails).
    // Firecrawl reads the live accessibility tree and rendered content, handling
    // heavy SPAs (Hudl, MaxPreps, etc.) where raw HTML is useless.
    const url = await this.executeBrowserCommand(sessionId, 'page.url()').catch(() => '');
    const title = await this.executeBrowserCommand(sessionId, 'await page.title()').catch(() => '');

    let content = '';
    try {
      const result: ScrapeExecuteResponse = await this.client.interact(sessionId, {
        prompt:
          'Extract all visible text content from this page. Include headings, data tables, ' +
          'stats, play-by-play data, labels, navigation items, and any other readable text. ' +
          'Return the raw text content organized by section — do not summarize or interpret, ' +
          'just extract what is visible on screen.',
      });

      if (result.success && result.output) {
        content = result.output.trim();
        logger.info('[LiveViewSession] AI prompt extraction succeeded', {
          sessionId,
          contentLength: content.length,
        });
      }
    } catch (err) {
      logger.warn('[LiveViewSession] AI prompt extraction failed', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (!content) {
      content = '(Page content could not be extracted — the page may still be loading)';
    }

    return { url, title, content: content.slice(0, 30_000) };
  }

  /**
   * Extract real media URLs from the current live-view session using the
   * browser's own Performance API rather than DOM blob URLs.
   */
  async extractMedia(sessionId: string, userId: string): Promise<LiveViewMediaExtractionResult> {
    this.assertOwnership(sessionId, userId);

    logger.info('[LiveViewSession] Extracting media', { sessionId });

    const extractionCode = `
  (async () => {
  const browserResult = await page.evaluate(async () => {
  const MEDIA_PATTERN = /\\.(m3u8|mp4|ts|mpd)(?:$|[?#])/i;

  function normalizeUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function dedupe(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function collectResourceUrls() {
    return dedupe(
      performance
        .getEntriesByType('resource')
        .map((entry) => normalizeUrl(entry && 'name' in entry ? entry.name : ''))
        .filter((value) => MEDIA_PATTERN.test(value))
    );
  }

  async function tryStartPlayback(video) {
    if (!video) return;
    try {
      video.muted = true;
      const playResult = video.play?.();
      if (playResult && typeof playResult.then === 'function') {
        await playResult.catch(() => undefined);
      }
    } catch {}
  }

  function clickPlaybackCandidates() {
    const selectors = [
      'video',
      '[aria-label*="play" i]',
      '[title*="play" i]',
      '.play-button',
      '.vjs-big-play-button',
      '.jw-icon-playback',
      '[data-testid*="play" i]',
      '[class*="play" i]',
    ];

    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      for (const element of elements.slice(0, 5)) {
        if (element instanceof HTMLElement) {
          try {
            element.click();
          } catch {}
        }
      }
    }
  }

  const video = document.querySelector('video');
  await tryStartPlayback(video);
  clickPlaybackCandidates();

  const deadline = Date.now() + 20_000;
  let streams = collectResourceUrls();

  while (streams.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    streams = collectResourceUrls();
  }

  const currentSrc = normalizeUrl(video?.currentSrc);
  const blobSrc = currentSrc.startsWith('blob:') ? currentSrc : null;

  return {
    url: location.href,
    title: document.title,
    streams,
    currentSrc: currentSrc || null,
    blobSrc,
  };
});

const cookies = await page.context().cookies();
const userAgent = await page.evaluate(() => navigator.userAgent);

return JSON.stringify({
  ...browserResult,
  userAgent,
  cookies: cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: Number.isFinite(cookie.expires) ? cookie.expires : undefined,
    httpOnly: Boolean(cookie.httpOnly),
    secure: Boolean(cookie.secure),
    sameSite: cookie.sameSite ?? undefined,
  })),
});
})()`;

    const rawResult = await this.executeBrowserCommand(sessionId, extractionCode);

    const parsed = this.parseBrowserJson<{
      url?: string;
      title?: string;
      streams?: unknown;
      currentSrc?: string | null;
      blobSrc?: string | null;
      userAgent?: string | null;
      cookies?: unknown;
    }>(rawResult, sessionId, 'Live view media extraction returned invalid JSON.');

    const streams = Array.isArray(parsed.streams)
      ? [...new Set(parsed.streams.filter((value): value is string => typeof value === 'string'))]
      : [];

    const cookies = Array.isArray(parsed.cookies)
      ? parsed.cookies
          .filter(
            (
              value
            ): value is {
              name: string;
              value: string;
              domain: string;
              path: string;
              expires?: number;
              httpOnly?: boolean;
              secure?: boolean;
              sameSite?: string;
            } =>
              !!value &&
              typeof value === 'object' &&
              typeof (value as Record<string, unknown>)['name'] === 'string' &&
              typeof (value as Record<string, unknown>)['value'] === 'string' &&
              typeof (value as Record<string, unknown>)['domain'] === 'string' &&
              typeof (value as Record<string, unknown>)['path'] === 'string'
          )
          .map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            ...(typeof cookie.expires === 'number' ? { expires: cookie.expires } : {}),
            httpOnly: cookie.httpOnly === true,
            secure: cookie.secure === true,
            ...(typeof cookie.sameSite === 'string' ? { sameSite: cookie.sameSite } : {}),
          }))
      : [];

    const referer = parsed.url ?? null;
    const origin = this.resolveOrigin(parsed.url);
    const cookieHeader = this.buildCookieHeader(cookies);

    if (streams.length === 0 && !parsed.currentSrc) {
      throw new AgentEngineError(
        'LIVE_VIEW_REQUEST_FAILED',
        'No network media streams were detected in the active live view. Start playback in the visible player and try again.',
        { metadata: { sessionId, url: parsed.url } }
      );
    }

    logger.info('[LiveViewSession] Media extracted', {
      sessionId,
      url: parsed.url,
      streamCount: streams.length,
      hasCurrentSrc: !!parsed.currentSrc,
      hasBlobSrc: !!parsed.blobSrc,
      cookieCount: cookies.length,
    });

    return {
      url: parsed.url ?? '',
      title: parsed.title ?? '',
      streams,
      currentSrc: parsed.currentSrc ?? null,
      blobSrc: parsed.blobSrc ?? null,
      auth: {
        userAgent: typeof parsed.userAgent === 'string' ? parsed.userAgent : null,
        referer,
        origin,
        cookieHeader,
        cookies,
      },
    };
  }

  /**
   * Extract playlist entries and clip URLs from the current live-view page.
   * This is used for batch film workflows so the agent does not have to open
   * each clip manually before dispatching download and analysis jobs.
   */
  async extractPlaylist(
    sessionId: string,
    userId: string,
    maxItems: number = 25
  ): Promise<LiveViewPlaylistExtractionResult> {
    this.assertOwnership(sessionId, userId);

    const boundedMaxItems = Math.min(Math.max(Math.trunc(maxItems) || 25, 1), 100);

    logger.info('[LiveViewSession] Extracting playlist', {
      sessionId,
      maxItems: boundedMaxItems,
    });

    const extractionCode = `
  (async () => {
  const browserResult = await page.evaluate(async (limit) => {
  const ITEM_ID_KEYS = ['clipId', 'videoId', 'itemId', 'playlistId', 'id', 'contentId'];
  const URL_HINT_PATTERN = /(clip|clips|video|videos|playlist|playlists|highlight|film)/i;
  const TEXT_HINT_PATTERN = /(clip|play|video|highlight|film)/i;
  const DURATION_PATTERN = /\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\b/;
  const PLAYLIST_HINT_PATTERN = /(playlist|queue|filmstrip|rail|clips|highlights|videos)/i;

  function normalizeText(value) {
    return typeof value === 'string' ? value.replace(/\\s+/g, ' ').trim() : '';
  }

  function toAbsoluteUrl(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return new URL(trimmed, window.location.href).toString();
    } catch {
      return null;
    }
  }

  function collectTextParts(element) {
    const values = [
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('data-title'),
      element.getAttribute('data-name'),
      element.getAttribute('data-testid'),
    ];

    const selectors = ['[aria-label]', '[title]', '[data-title]', '[data-name]', 'img[alt]', 'time'];
    for (const selector of selectors) {
      for (const node of Array.from(element.querySelectorAll(selector)).slice(0, 8)) {
        values.push(
          node.getAttribute('aria-label') ||
            node.getAttribute('title') ||
            node.getAttribute('data-title') ||
            node.getAttribute('data-name') ||
            node.getAttribute('alt') ||
            node.textContent
        );
      }
    }

    values.push(element.textContent);

    return [...new Set(values.map(normalizeText).filter(Boolean))];
  }

  function pickTitle(parts) {
    const filtered = parts.filter((value) => value.length >= 3 && value.length <= 180);
    const nonDuration = filtered.filter((value) => !DURATION_PATTERN.test(value));
    const preferred = nonDuration.find((value) => value.split(' ').length >= 2) || nonDuration[0];
    return preferred || filtered[0] || '';
  }

  function pickDuration(parts) {
    for (const value of parts) {
      const match = value.match(DURATION_PATTERN);
      if (match) return match[0];
    }
    return null;
  }

  function pickThumbnail(element) {
    const image = element.querySelector('img, source, video');
    if (image instanceof HTMLImageElement) {
      return toAbsoluteUrl(image.currentSrc || image.src);
    }
    if (image instanceof HTMLSourceElement) {
      return toAbsoluteUrl(image.src);
    }
    if (image instanceof HTMLVideoElement) {
      return toAbsoluteUrl(image.poster || image.currentSrc || image.src);
    }

    const styled = Array.from(element.querySelectorAll('*')).find((node) => {
      if (!(node instanceof HTMLElement)) return false;
      const background = window.getComputedStyle(node).backgroundImage;
      return typeof background === 'string' && background.includes('url(');
    });
    if (styled instanceof HTMLElement) {
      const background = window.getComputedStyle(styled).backgroundImage;
      const match = background.match(/url\\(["']?(.*?)["']?\\)/);
      return toAbsoluteUrl(match && match[1] ? match[1] : '');
    }

    return null;
  }

  function elementHintsMatch(element) {
    const attrs = [
      element.getAttribute('class'),
      element.getAttribute('id'),
      element.getAttribute('data-testid'),
      element.getAttribute('aria-label'),
      element.getAttribute('role'),
    ]
      .map(normalizeText)
      .filter(Boolean)
      .join(' ');
    return PLAYLIST_HINT_PATTERN.test(attrs);
  }

  function isInsidePlaylistRegion(element) {
    let current = element;
    let depth = 0;
    while (current && depth < 6) {
      if (elementHintsMatch(current)) return true;
      current = current.parentElement;
      depth += 1;
    }
    return false;
  }

  function pickUrl(element) {
    const directCandidates = [
      element.getAttribute('href'),
      element.getAttribute('data-url'),
      element.getAttribute('data-href'),
      element.getAttribute('data-video-url'),
      element.getAttribute('data-clip-url'),
    ];

    const anchor = element instanceof HTMLAnchorElement ? element : element.closest('a[href]');
    if (anchor instanceof HTMLAnchorElement) {
      directCandidates.unshift(anchor.getAttribute('href'));
    }

    const nestedAnchor = element.querySelector('a[href]');
    if (nestedAnchor instanceof HTMLAnchorElement) {
      directCandidates.push(nestedAnchor.getAttribute('href'));
    }

    for (const candidate of directCandidates) {
      const absolute = toAbsoluteUrl(candidate || '');
      if (absolute) return absolute;
    }

    return null;
  }

  function pickItemId(element, url) {
    for (const key of ITEM_ID_KEYS) {
      const dataValue = element.dataset?.[key];
      if (normalizeText(dataValue)) return normalizeText(dataValue);
    }

    const attrCandidates = ['data-clip-id', 'data-video-id', 'data-item-id', 'data-id'];
    for (const attr of attrCandidates) {
      const attrValue = element.getAttribute(attr);
      if (normalizeText(attrValue)) return normalizeText(attrValue);
    }

    if (url) {
      try {
        const parsedUrl = new URL(url, window.location.href);
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
        for (let index = 0; index < pathSegments.length - 1; index += 1) {
          const segment = (pathSegments[index] || '').toLowerCase();
          if (segment === 'clip' || segment === 'clips' || segment === 'video' || segment === 'videos') {
            const nextSegment = normalizeText(pathSegments[index + 1]);
            if (nextSegment) return nextSegment;
          }
        }
      } catch {}
    }

    return null;
  }

  function isCurrent(element, url) {
    if (element.getAttribute('aria-current') === 'true') return true;
    const classes = normalizeText(element.getAttribute('class')).toLowerCase();
    if (/(active|selected|current)/.test(classes)) return true;
    return Boolean(url && url === window.location.href);
  }

  function buildCandidate(element) {
    const textParts = collectTextParts(element);
    const title = pickTitle(textParts);
    const durationText = pickDuration(textParts);
    const url = pickUrl(element);
    const thumbnailUrl = pickThumbnail(element);
    const textSnippet = textParts.find((value) => value !== title && value !== durationText) || null;
    const playlistRegion = isInsidePlaylistRegion(element);
    const linkHint = Boolean(url && URL_HINT_PATTERN.test(url));
    const textHint = Boolean(title && TEXT_HINT_PATTERN.test(title));

    let score = 0;
    if (playlistRegion) score += 2;
    if (url) score += 2;
    if (title) score += 1;
    if (durationText) score += 1;
    if (thumbnailUrl) score += 1;
    if (linkHint || textHint) score += 1;

    return {
      score,
      item: {
        itemId: pickItemId(element, url),
        title: title || textSnippet || 'Untitled clip',
        url,
        durationText,
        thumbnailUrl,
        textSnippet,
        isCurrent: isCurrent(element, url),
      },
    };
  }

  const containerSelectors = [
    '[aria-label*="playlist" i]',
    '[aria-label*="clips" i]',
    '[aria-label*="videos" i]',
    '[data-testid*="playlist" i]',
    '[data-testid*="clip" i]',
    '[data-testid*="video" i]',
    '[role="list"]',
    '[role="grid"]',
    '[class*="playlist"]',
    '[class*="filmstrip"]',
    '[class*="queue"]',
    '[class*="rail"]',
  ];

  const containers = [];
  for (const selector of containerSelectors) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      if (element instanceof HTMLElement && !containers.includes(element)) {
        containers.push(element);
      }
    }
  }

  const rawCandidates = [];
  const elementSelector = 'a[href], button, [role="link"], [role="button"], li, article, [role="listitem"], [data-testid], [class]';

  for (const container of containers) {
    for (const element of Array.from(container.querySelectorAll(elementSelector)).slice(0, 200)) {
      if (element instanceof HTMLElement) rawCandidates.push(element);
    }
  }

  if (rawCandidates.length === 0) {
    for (const element of Array.from(document.querySelectorAll('a[href], button, [role="link"], [role="button"]')).slice(0, 250)) {
      if (element instanceof HTMLElement) rawCandidates.push(element);
    }
  }

  const seen = new Set();
  const items = [];

  for (const element of rawCandidates) {
    const candidate = buildCandidate(element);
    if (candidate.score < 4) continue;
    if (!candidate.item.url && !candidate.item.itemId) continue;

    const key = candidate.item.url || candidate.item.itemId || candidate.item.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(candidate.item);
  }

  const ranked = items
    .sort((left, right) => {
      if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
      if (Boolean(left.url) !== Boolean(right.url)) return left.url ? -1 : 1;
      return left.title.localeCompare(right.title);
    })
    .slice(0, limit)
    .map((item, index) => ({
      index: index + 1,
      ...item,
    }));

  const playlistTitleCandidates = [
    ...containers.flatMap((container) => [
      container.getAttribute('aria-label'),
      container.getAttribute('title'),
      container.previousElementSibling?.textContent,
      container.parentElement?.querySelector('h1, h2, h3')?.textContent,
    ]),
    document.querySelector('h1')?.textContent,
    document.querySelector('h2')?.textContent,
  ]
    .map(normalizeText)
    .filter(Boolean);

  return {
    url: window.location.href,
    title: document.title,
    playlistTitle: playlistTitleCandidates[0] || null,
    items: ranked,
  };
}, ${boundedMaxItems});

const cookies = await page.context().cookies();
const userAgent = await page.evaluate(() => navigator.userAgent);

return JSON.stringify({
  ...browserResult,
  userAgent,
  cookies: cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: Number.isFinite(cookie.expires) ? cookie.expires : undefined,
    httpOnly: Boolean(cookie.httpOnly),
    secure: Boolean(cookie.secure),
    sameSite: cookie.sameSite ?? undefined,
  })),
});
})()`;

    const rawResult = await this.executeBrowserCommand(sessionId, extractionCode);

    const parsed = this.parseBrowserJson<{
      url?: string;
      title?: string;
      playlistTitle?: string | null;
      items?: unknown;
      userAgent?: string | null;
      cookies?: unknown;
    }>(rawResult, sessionId, 'Live view playlist extraction returned invalid JSON.');

    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter(
            (
              value
            ): value is {
              index: number;
              itemId?: string | null;
              title?: string;
              url?: string | null;
              durationText?: string | null;
              thumbnailUrl?: string | null;
              textSnippet?: string | null;
              isCurrent?: boolean;
            } =>
              !!value &&
              typeof value === 'object' &&
              typeof (value as Record<string, unknown>)['index'] === 'number' &&
              typeof (value as Record<string, unknown>)['title'] === 'string'
          )
          .map((item) => ({
            index: item.index,
            itemId: typeof item.itemId === 'string' ? item.itemId : null,
            title: item.title?.trim() || 'Untitled clip',
            url: typeof item.url === 'string' ? item.url : null,
            durationText: typeof item.durationText === 'string' ? item.durationText : null,
            thumbnailUrl: typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : null,
            textSnippet: typeof item.textSnippet === 'string' ? item.textSnippet : null,
            isCurrent: item.isCurrent === true,
          }))
      : [];

    const cookies = Array.isArray(parsed.cookies)
      ? parsed.cookies
          .filter(
            (
              value
            ): value is {
              name: string;
              value: string;
              domain: string;
              path: string;
              expires?: number;
              httpOnly?: boolean;
              secure?: boolean;
              sameSite?: string;
            } =>
              !!value &&
              typeof value === 'object' &&
              typeof (value as Record<string, unknown>)['name'] === 'string' &&
              typeof (value as Record<string, unknown>)['value'] === 'string' &&
              typeof (value as Record<string, unknown>)['domain'] === 'string' &&
              typeof (value as Record<string, unknown>)['path'] === 'string'
          )
          .map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            ...(typeof cookie.expires === 'number' ? { expires: cookie.expires } : {}),
            httpOnly: cookie.httpOnly === true,
            secure: cookie.secure === true,
            ...(typeof cookie.sameSite === 'string' ? { sameSite: cookie.sameSite } : {}),
          }))
      : [];

    if (items.length === 0) {
      throw new AgentEngineError(
        'LIVE_VIEW_REQUEST_FAILED',
        'No playlist clips or linked video items were detected in the active live view.',
        { metadata: { sessionId, url: parsed.url } }
      );
    }

    const referer = parsed.url ?? null;
    const origin = this.resolveOrigin(parsed.url);
    const cookieHeader = this.buildCookieHeader(cookies);

    logger.info('[LiveViewSession] Playlist extracted', {
      sessionId,
      url: parsed.url,
      itemCount: items.length,
      cookieCount: cookies.length,
    });

    return {
      url: parsed.url ?? '',
      title: parsed.title ?? '',
      playlistTitle:
        typeof parsed.playlistTitle === 'string' && parsed.playlistTitle.trim().length > 0
          ? parsed.playlistTitle.trim()
          : null,
      items,
      auth: {
        userAgent: typeof parsed.userAgent === 'string' ? parsed.userAgent : null,
        referer,
        origin,
        cookieHeader,
        cookies,
      },
    };
  }

  /**
   * Execute a browser action (click, type, scroll, etc.) in an active session.
   * Runs Playwright code directly on the session's page.
   */
  async executeAction(
    sessionId: string,
    userId: string,
    action: LiveViewAction
  ): Promise<{ success: boolean; message: string }> {
    this.assertOwnership(sessionId, userId);

    logger.info('[LiveViewSession] Executing action', { sessionId, action: action.type });

    let code: string;
    switch (action.type) {
      case 'click':
        code = `await page.click(${this.quoteJsString(action.selector ?? '')});`;
        break;
      case 'type':
        code = `await page.fill(${this.quoteJsString(action.selector ?? '')}, ${this.quoteJsString(action.text ?? '')});`;
        break;
      case 'scroll':
        code = action.selector
          ? `await page.locator(${this.quoteJsString(action.selector)}).scrollIntoViewIfNeeded();`
          : `await page.mouse.wheel(0, ${action.amount ?? 500});`;
        break;
      case 'wait':
        code = `await page.waitForTimeout(${Math.min(action.ms ?? 1000, 5000)});`;
        break;
      default:
        return {
          success: false,
          message: `Unknown action type: ${(action as { type: string }).type}`,
        };
    }

    await this.executeBrowserCommand(sessionId, code);

    return { success: true, message: `Action "${action.type}" completed` };
  }

  /**
   * Execute a natural-language prompt in an active live-view session.
   *
   * Uses Firecrawl's native AI-driven interaction mode: the prompt is sent
   * directly to Firecrawl, which uses its own LLM + accessibility tree to
   * find elements, click, type, scroll, and extract data — no CSS selectors
   * or element refs needed.
   *
   * This is the **preferred** interaction method over `executeAction()`.
   */
  async executePrompt(
    sessionId: string,
    userId: string,
    prompt: string
  ): Promise<LiveViewPromptResult> {
    this.assertOwnership(sessionId, userId);

    logger.info('[LiveViewSession] Executing prompt', {
      sessionId,
      prompt: prompt.slice(0, 200),
    });

    // Use the SDK's interact() method which natively supports the `prompt` parameter.
    // This calls POST /v2/scrape/{scrapeId}/interact — the correct endpoint for
    // AI-driven interactions: https://docs.firecrawl.dev/features/interact
    const result: ScrapeExecuteResponse = await this.client.interact(sessionId, {
      prompt,
    });

    if (!result.success) {
      const errorMsg = result.error?.trim() || result.stderr?.trim() || 'Prompt execution failed';
      logger.warn('[LiveViewSession] Prompt failed', { sessionId, error: errorMsg });
      return { success: false, output: errorMsg };
    }

    const output = (result.output ?? result.stdout ?? result.result ?? '').trim();

    logger.info('[LiveViewSession] Prompt completed', {
      sessionId,
      outputLength: output.length,
    });

    return { success: true, output: output || 'Action completed successfully.' };
  }

  // ─── Internal Helpers ─────────────────────────────────────────────────

  /**
   * Get the full active session object for a user.
   * Returns the most recently created non-expired session, or null.
   */
  getActiveSession(userId: string): ActiveSession | null {
    const now = new Date();
    let best: ActiveSession | null = null;

    for (const session of this.activeSessions.values()) {
      if (session.userId !== userId) continue;
      if (now > session.expiresAt) {
        this.activeSessions.delete(session.sessionId);
        continue;
      }
      if (!best || session.createdAt > best.createdAt) {
        best = session;
      }
    }

    return best;
  }

  /**
   * Get the active session ID for a user.
   * Returns the most recently created non-expired session, or null.
   */
  getActiveSessionForUser(userId: string): string | null {
    return this.getActiveSession(userId)?.sessionId ?? null;
  }

  /**
   * Close all currently tracked sessions for a user (best-effort).
   *
   * We only destroy sessions we can attribute to the requesting user. Firecrawl's
   * browser listing does not expose user ownership metadata, so deleting every
   * remote session would incorrectly kill other users' live views.
   */
  async closeAllUserSessions(userId: string): Promise<number> {
    const localIds = new Set<string>();
    for (const [id, session] of this.activeSessions.entries()) {
      if (session.userId === userId) localIds.add(id);
    }

    let closed = 0;
    for (const id of localIds) {
      try {
        await this.destroySession(id);
        closed++;
      } catch (err) {
        logger.warn('[LiveViewSession] Best-effort cleanup failed', {
          sessionId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      this.activeSessions.delete(id);
    }

    if (localIds.size > 0) {
      logger.info('[LiveViewSession] Closed all user sessions', {
        userId,
        localTracked: localIds.size,
        totalAttempted: localIds.size,
        closed,
      });
    }

    return closed;
  }

  /**
   * Resolve a sessionId — if provided and valid, return it. If not provided
   * or invalid, look up the user's active session. Throws if none found.
   */
  resolveSessionId(sessionId: string | undefined | null, userId: string): string {
    // If a sessionId was provided and it's tracked, use it
    if (sessionId && this.activeSessions.has(sessionId)) {
      return sessionId;
    }

    // Fall back to user lookup
    const resolved = this.getActiveSessionForUser(userId);
    if (resolved) {
      if (sessionId && sessionId !== resolved) {
        logger.warn('[LiveViewSession] Provided sessionId not found, resolved from userId', {
          providedSessionId: sessionId,
          resolvedSessionId: resolved,
          userId,
        });
      }
      return resolved;
    }

    throw new AgentEngineError(
      'LIVE_VIEW_SESSION_NOT_FOUND',
      'No active live view session found. Use open_live_view to start one first.'
    );
  }

  /**
   * Verify that the requesting user owns the session.
   * Throws if the session is unknown or belongs to another user.
   */
  private assertOwnership(sessionId: string, userId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new AgentEngineError(
        'LIVE_VIEW_SESSION_NOT_FOUND',
        'Session not found or already expired'
      );
    }
    if (session.userId !== userId) {
      // Return generic error to prevent session enumeration
      throw new AgentEngineError(
        'LIVE_VIEW_SESSION_NOT_FOUND',
        'Session not found or already expired'
      );
    }
    if (new Date() > session.expiresAt) {
      this.activeSessions.delete(sessionId);
      throw new AgentEngineError('LIVE_VIEW_SESSION_EXPIRED', 'Session has expired');
    }
  }
}
