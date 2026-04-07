/**
 * @fileoverview Live View Session Service
 * @module @nxt1/backend/modules/agent/tools/scraping
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
import { PLATFORM_REGISTRY } from '@nxt1/core';
import type {
  LiveViewSession,
  LiveViewDestinationTier,
  LiveViewAuthStatus,
  LiveViewSessionCapabilities,
} from '@nxt1/core';
import { FirecrawlProfileService } from './firecrawl-profile.service.js';
import { validateUrl } from './url-validator.js';
import { logger } from '../../../../utils/logger.js';

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

// ─── Constants ──────────────────────────────────────────────────────────────

/** Live-view sessions last 10 minutes (longer than sign-in flows). */
const LIVE_VIEW_TTL_SECONDS = 600;

/** Firecrawl browserExecute timeout in seconds. */
const BROWSER_EXECUTE_TIMEOUT_SECONDS = 30;

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
      throw new Error(
        'FIRECRAWL_API_KEY is required. Set it in environment variables or pass it to the constructor.'
      );
    }
    this.client = new Firecrawl({ apiKey: key });
    this.profileService = new FirecrawlProfileService(key);
  }

  private quoteShellArg(value: string): string {
    return `'${value.replace(/'/g, `'"'"'`)}'`;
  }

  private async executeBrowserCommand(sessionId: string, code: string): Promise<string> {
    const result: ScrapeExecuteResponse = await this.client.interact(sessionId, {
      code,
      language: 'bash',
      timeout: BROWSER_EXECUTE_TIMEOUT_SECONDS,
    });

    const hiddenError = result.error?.trim();
    if (!result.success || result.killed || (result.exitCode ?? 0) !== 0 || hiddenError) {
      throw new Error(hiddenError || result.stderr || 'Browser command failed');
    }

    return (result.stdout ?? result.result ?? '').trim();
  }

  /**
   * Fully destroy a Firecrawl session — stop the interaction layer AND
   * delete the underlying browser to free the concurrent session slot.
   *
   * `stopInteraction()` alone only detaches the interact layer;
   * `deleteBrowser()` is required to release the browser and its profile lock.
   */
  private async destroySession(sessionId: string): Promise<void> {
    try {
      await this.client.stopInteraction(sessionId);
    } catch {
      /* best-effort */
    }
    try {
      await this.client.deleteBrowser(sessionId);
    } catch {
      /* best-effort */
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
      if (account?.profileName && account.status === 'connected') {
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
        formats: ['markdown'],
        waitFor: 3000,
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
          formats: ['markdown'],
          waitFor: 3000,
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
      throw new Error('Firecrawl scrape did not return a scrapeId — cannot start live view.');
    }

    // Fire an initial interact() call to activate the live-view session
    // and obtain the interactiveLiveViewUrl.
    //
    // If this fails with a profile write-lock (stale session that
    // stopInteraction didn't fully release), retry the entire scrape+interact
    // flow with saveChanges: false so the user isn't blocked.
    let interactiveUrl = '';
    try {
      const initResult: ScrapeExecuteResponse = await this.client.interact(sessionId, {
        code: 'agent-browser wait --load networkidle',
        language: 'bash',
        timeout: BROWSER_EXECUTE_TIMEOUT_SECONDS,
      });
      interactiveUrl = initResult.interactiveLiveViewUrl ?? '';
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
          formats: ['markdown'],
          waitFor: 3000,
          profile: {
            name: resolvedProfileName,
            saveChanges: false,
          },
        });

        const fallbackId = fallbackScrape.metadata?.scrapeId;
        if (!fallbackId) {
          throw new Error('Firecrawl fallback scrape did not return a scrapeId.');
        }

        // Reassign sessionId for the rest of the flow
        sessionId = fallbackId;

        try {
          const fallbackInit: ScrapeExecuteResponse = await this.client.interact(sessionId, {
            code: 'agent-browser wait --load networkidle',
            language: 'bash',
            timeout: BROWSER_EXECUTE_TIMEOUT_SECONDS,
          });
          interactiveUrl = fallbackInit.interactiveLiveViewUrl ?? '';
        } catch (fallbackErr) {
          logger.error('[LiveViewSession] Fallback interact also failed', {
            sessionId,
            error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          });
          await this.destroySession(sessionId);
          throw new Error(
            `Failed to navigate to ${destination.domainLabel}: ${fallbackErr instanceof Error ? fallbackErr.message : 'Navigation timeout'}`
          );
        }
      } else {
        logger.error('[LiveViewSession] Initial interact failed, cleaning up', {
          sessionId,
          url: destination.resolvedUrl,
          error: initErrMsg,
        });
        await this.destroySession(sessionId);
        throw new Error(
          `Failed to navigate to ${destination.domainLabel}: ${initErr instanceof Error ? initErr.message : 'Navigation timeout'}`
        );
      }
    }

    if (!interactiveUrl) {
      // Clean up since we can't present it
      await this.destroySession(sessionId);
      throw new Error(
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
      [
        `agent-browser open ${this.quoteShellArg(validatedUrl)}`,
        'agent-browser wait --load networkidle',
      ].join(' && ')
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
      ['agent-browser reload', 'agent-browser wait --load domcontentloaded'].join(' && ')
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
        throw new Error('Session not found or already expired');
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
   * Extract the current page content from an active live-view session as markdown.
   * Uses Playwright's `page.content()` to grab the DOM, then instructs the page
   * to return a simplified text representation the LLM can consume.
   */
  async extractContent(
    sessionId: string,
    userId: string
  ): Promise<{ url: string; title: string; content: string }> {
    this.assertOwnership(sessionId, userId);

    logger.info('[LiveViewSession] Extracting content', { sessionId });

    const [url, title, content] = await Promise.all([
      this.executeBrowserCommand(sessionId, 'agent-browser get url'),
      this.executeBrowserCommand(sessionId, 'agent-browser get title'),
      this.executeBrowserCommand(sessionId, 'agent-browser snapshot --compact --depth 8'),
    ]);

    return {
      url,
      title,
      content: content.slice(0, 30000),
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
        code = `agent-browser click ${this.quoteShellArg(action.selector ?? '')}`;
        break;
      case 'type':
        code = `agent-browser fill ${this.quoteShellArg(action.selector ?? '')} ${this.quoteShellArg(action.text ?? '')}`;
        break;
      case 'scroll':
        code = action.selector
          ? `agent-browser scrollintoview ${this.quoteShellArg(action.selector)}`
          : `agent-browser scroll ${(action.amount ?? 500) < 0 ? 'up' : 'down'} ${Math.abs(action.amount ?? 500)}`;
        break;
      case 'wait':
        code = `agent-browser wait ${Math.min(action.ms ?? 1000, 5000)}`;
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
      timeout: BROWSER_EXECUTE_TIMEOUT_SECONDS,
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

    throw new Error('No active live view session found. Use open_live_view to start one first.');
  }

  /**
   * Verify that the requesting user owns the session.
   * Throws if the session is unknown or belongs to another user.
   */
  private assertOwnership(sessionId: string, userId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found or already expired');
    }
    if (session.userId !== userId) {
      // Return generic error to prevent session enumeration
      throw new Error('Session not found or already expired');
    }
    if (new Date() > session.expiresAt) {
      this.activeSessions.delete(sessionId);
      throw new Error('Session has expired');
    }
  }
}
