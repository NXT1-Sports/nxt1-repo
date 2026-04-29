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

interface LiveViewProbeResult {
  readonly url: string;
  readonly title: string;
  readonly interactiveSnapshot: string;
  readonly fullSnapshot: string;
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
const MIN_PROMPT_OUTPUT_CHARS_FOR_CONFIDENCE = 140;
const MAX_PROBE_SECTION_CHARS = 20_000;

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

    const stdoutLength = typeof result.stdout === 'string' ? result.stdout.length : 0;
    const resultType = Array.isArray(result.result) ? 'array' : typeof result.result;
    logger.info('[LiveViewSession] Browser command response', {
      sessionId,
      success: result.success,
      exitCode: result.exitCode ?? null,
      killed: result.killed === true,
      stdoutLength,
      resultType,
      ...(typeof result.result === 'string' ? { resultLength: result.result.length } : {}),
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

  /**
   * Execute a natural language prompt in the browser using Firecrawl's AI mode.
   * This is more reliable than code-based extraction for complex tasks like
   * extracting media URLs, as the AI can reason about the page and handle
   * edge cases intelligently.
   */
  private async executeBrowserPrompt(sessionId: string, prompt: string): Promise<string> {
    const result: ScrapeExecuteResponse = await this.client.interact(sessionId, {
      prompt,
    });

    logger.info('[LiveViewSession] Browser prompt response', {
      sessionId,
      success: result.success,
      exitCode: result.exitCode ?? null,
      killed: result.killed === true,
      ...(typeof result.stdout === 'string' ? { stdoutLength: result.stdout.length } : {}),
      ...(typeof result.result === 'string' ? { resultLength: result.result.length } : {}),
    });

    const hiddenError = result.error?.trim();
    if (!result.success || result.killed || (result.exitCode ?? 0) !== 0 || hiddenError) {
      throw new AgentEngineError(
        'LIVE_VIEW_REQUEST_FAILED',
        hiddenError || result.stderr || 'Browser prompt execution failed',
        {
          metadata: { sessionId },
        }
      );
    }

    return (result.stdout ?? result.result ?? '').trim();
  }

  /**
   * Extract URLs matching media patterns from natural language text.
   * Handles both direct URLs and markdown-formatted links.
   */
  private extractUrlsFromText(text: string, patterns: RegExp[] = []): string[] {
    if (!text) return [];

    // Default patterns for common media types
    const defaultPatterns = [
      /https?:\/\/[^\s<>"{}|\\^`\[\]]*\.(?:m3u8|mp4|ts|webm|mkv|mov|mpd|aac|wav|mp3)(?:[?#][^\s<>"{}|\\^`\[\]]*)?/gi,
    ];

    const allPatterns = patterns.length > 0 ? [...patterns, ...defaultPatterns] : defaultPatterns;

    const urls = new Set<string>();

    // Extract URLs directly
    for (const pattern of allPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const url = match[0].trim();
        if (url && url.length > 10) {
          urls.add(url);
        }
      }
    }

    // Extract from markdown links: [text](url)
    const markdownPattern = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/gi;
    let mdMatch;
    while ((mdMatch = markdownPattern.exec(text)) !== null) {
      const url = mdMatch[2].trim();
      if (url && (url.includes('.m3u8') || url.includes('.mp4') || url.includes('.ts'))) {
        urls.add(url);
      }
    }

    // Extract from plain "URL: " or "Stream: " patterns
    const labelPattern = /(?:url|stream|link|src):\s*([^\s\n]+\.(?:m3u8|mp4|ts|mpd)(?:[?#][^\s\n]*)?)/gi;
    let labelMatch;
    while ((labelMatch = labelPattern.exec(text)) !== null) {
      const url = labelMatch[1].trim();
      if (url) {
        urls.add(url);
      }
    }

    return Array.from(urls).filter((url) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });
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

    for (const candidate of Array.from(new Set(candidates)).filter((value) => value.length > 0)) {
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

  private parseProbeOutput(stdout: string): LiveViewProbeResult {
    const lines = stdout.split('\n');
    const urlLine = lines.find((line) => line.startsWith('URL:'));
    const titleLine = lines.find((line) => line.startsWith('TITLE:'));
    const interactiveStart = lines.indexOf('---INTERACTIVE---');
    const fullStart = lines.indexOf('---FULL---');

    const interactiveLines =
      interactiveStart >= 0
        ? lines.slice(interactiveStart + 1, fullStart >= 0 ? fullStart : undefined)
        : [];
    const fullLines = fullStart >= 0 ? lines.slice(fullStart + 1) : [];

    return {
      url: urlLine ? urlLine.slice('URL:'.length).trim() : '',
      title: titleLine ? titleLine.slice('TITLE:'.length).trim() : '',
      interactiveSnapshot: interactiveLines.join('\n').trim().slice(0, MAX_PROBE_SECTION_CHARS),
      fullSnapshot: fullLines.join('\n').trim().slice(0, MAX_PROBE_SECTION_CHARS),
    };
  }

  private async collectInteractiveProbe(sessionId: string): Promise<LiveViewProbeResult | null> {
    const bashCommand =
      'agent-browser wait --load networkidle || true; ' +
      'echo "URL:$(agent-browser get url)" && ' +
      'echo "TITLE:$(agent-browser get title)" && ' +
      'echo "---INTERACTIVE---" && ' +
      'agent-browser snapshot -i || true && ' +
      'echo "---FULL---" && ' +
      'agent-browser snapshot || true';

    const result: ScrapeExecuteResponse = await this.client.interact(sessionId, {
      code: bashCommand,
      language: 'bash' as Parameters<typeof this.client.interact>[1]['language'],
    });

    if (!result.success) return null;

    const stdout = (result.stdout ?? '').trim();
    if (!stdout) return null;

    return this.parseProbeOutput(stdout);
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

    try {
      const probe = await this.collectInteractiveProbe(sessionId);
      if (probe) {
        const sections: string[] = [];
        if (probe.interactiveSnapshot) {
          sections.push(`Interactive elements:\n${probe.interactiveSnapshot}`);
        }
        if (probe.fullSnapshot) {
          sections.push(`Full accessibility snapshot:\n${probe.fullSnapshot}`);
        }

        const content = sections.join('\n\n').trim();
        if (probe.url && content) {
          logger.info('[LiveViewSession] Bash extraction succeeded', {
            sessionId,
            url: probe.url,
            contentLength: content.length,
            interactiveLength: probe.interactiveSnapshot.length,
            fullLength: probe.fullSnapshot.length,
          });
          return { url: probe.url, title: probe.title, content: content.slice(0, 30_000) };
        }
      }

      logger.warn(
        '[LiveViewSession] Bash extraction returned empty output, falling back to AI prompt',
        {
          sessionId,
          reason: 'interactive probe was empty',
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

    logger.info('[LiveViewSession] Extracting media via AI prompt', { sessionId });

    /**
     * Use Firecrawl's AI-driven prompt mode for reliable extraction.
     * This is more robust than blindly polling the Performance API because:
     * - AI can reason about the page structure
     * - Handles edge cases (consent dialogs, lazy loading, etc.)
     * - Returns actual URLs instead of blob references
     * - No arbitrary 20-second timeout
     * - Explains what it found if extraction fails
     */
    const extractionPrompt = `
You are analyzing a web page with video/media content. Your task is to extract the actual streaming URLs.

INSTRUCTIONS:
1. Ensure any video players on the page are started/activated (click play if needed, wait for content to load)
2. Check the browser's Network tab (via Performance API) for actual stream URLs
3. Look for patterns like .m3u8, .mp4, .ts, .webm, or manifest URLs
4. Check <video> tags for <source src="..."> or direct currentSrc
5. Report ALL media URLs you find

IMPORTANT: Return ONLY the actual stream/manifest URLs (not blob: references or player UI URLs).

RESPONSE FORMAT:
For each media URL found, include it as a clickable link or plain URL:
- Direct URLs: https://example.com/stream.m3u8
- Or formatted as: [Stream URL](https://example.com/stream.m3u8)

Also include any supplementary info that helps understand the media structure:
- Player type detected (e.g., HLS, DASH, progressive download)
- Whether video is currently playing
- Any auth headers or cookies needed

If no media URLs found, explain what you checked and why.
`;

    try {
      const rawResult = await this.executeBrowserPrompt(sessionId, extractionPrompt);

      logger.info('[LiveViewSession] AI extraction response', {
        sessionId,
        responseLength: rawResult.length,
      });

      // Extract actual media URLs from the AI response
      const streams = this.extractUrlsFromText(rawResult);

      if (streams.length === 0) {
        throw new AgentEngineError(
          'LIVE_VIEW_REQUEST_FAILED',
          `No media URLs detected. AI analysis: ${rawResult.substring(0, 500)}`,
          { metadata: { sessionId } }
        );
      }

      // Try to collect page metadata and cookies via simple code execution
      let metadata: {
        url?: string;
        title?: string;
        userAgent?: string | null;
        cookies?: unknown;
      } = {};

      try {
        const metadataCode = `
const metadata = {
  url: location.href,
  title: document.title,
  userAgent: navigator.userAgent,
};
const cookies = await page.context().cookies();
JSON.stringify({ ...metadata, cookies });
`;
        const metadataRaw = await this.executeBrowserCommand(sessionId, metadataCode);
        metadata = this.parseBrowserJson<typeof metadata>(
          metadataRaw,
          sessionId,
          'Could not extract page metadata'
        );
      } catch (err) {
        // Metadata collection is optional; continue with what we have
        logger.warn('[LiveViewSession] Could not extract page metadata', {
          sessionId,
          error: err instanceof Error ? err.message : 'unknown',
        });
      }

      const cookies = Array.isArray(metadata.cookies)
        ? metadata.cookies
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

      const referer = (metadata.url as string) ?? null;
      const origin = this.resolveOrigin(metadata.url as string);
      const cookieHeader = this.buildCookieHeader(cookies);

      logger.info('[LiveViewSession] Media extracted via AI', {
        sessionId,
        url: metadata.url,
        title: metadata.title,
        streamCount: streams.length,
        cookieCount: cookies.length,
      });

      return {
        url: (metadata.url as string) ?? '',
        title: (metadata.title as string) ?? '',
        streams,
        currentSrc: null, // Not used in prompt mode
        blobSrc: null, // Not used in prompt mode
        auth: {
          userAgent:
            typeof metadata.userAgent === 'string' ? metadata.userAgent : null,
          referer,
          origin,
          cookieHeader,
          cookies,
        },
      };
    } catch (error) {
      // If AI-prompt fails, provide helpful error
      if (error instanceof AgentEngineError) {
        throw error;
      }

      throw new AgentEngineError(
        'LIVE_VIEW_REQUEST_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to extract media URLs. Ensure a video player is visible and playing.',
        { metadata: { sessionId } }
      );
    }
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

    logger.info('[LiveViewSession] Extracting playlist via AI', {
      sessionId,
      maxItems: boundedMaxItems,
    });

    /**
     * Use AI to extract playlist items. This is more reliable than complex
     * DOM traversal because AI can understand the semantic structure of
     * the page, handle variations in layouts, and identify clips intelligently.
     */
    const playlistPrompt = `
You are analyzing a page with a playlist or collection of video/media clips.

Your task: Extract information about ALL the clips/videos visible on this page.

For each clip/video, gather:
1. Title or name of the clip
2. Direct URL to the clip (if clickable/navigable)
3. Duration (if visible)
4. Thumbnail image URL (if available)
5. Any identifiable ID or metadata attribute

IMPORTANT: 
- Include up to ${boundedMaxItems} items
- Extract ACTUAL clip/video URLs, not just player frame URLs
- If clips are in a carousel or lazy-loaded, try to capture what's visible
- Return as a structured list with clear labels for each field

Response format:
For each clip, provide:
- Title: [clip title]
- URL: [URL to clip or navigation link]
- Duration: [HH:MM:SS or similar, if visible]
- Thumbnail: [image URL if available]
---

If it's a single-clip page (not a playlist), say so explicitly.
`;

    try {
      const rawResult = await this.executeBrowserPrompt(sessionId, playlistPrompt);

      logger.info('[LiveViewSession] AI playlist response', {
        sessionId,
        responseLength: rawResult.length,
      });

      // Parse the AI response to extract items
      const items = this.parsePlaylistFromResponse(rawResult);

      if (items.length === 0) {
        throw new AgentEngineError(
          'LIVE_VIEW_REQUEST_FAILED',
          `No playlist clips detected. AI analysis: ${rawResult.substring(0, 500)}`,
          { metadata: { sessionId } }
        );
      }

      // Try to collect page metadata and cookies via simple code execution
      let metadata: {
        url?: string;
        title?: string;
        playlistTitle?: string | null;
        userAgent?: string | null;
        cookies?: unknown;
      } = {};

      try {
        const metadataCode = `
const metadata = {
  url: location.href,
  title: document.title,
  playlistTitle: document.querySelector('[data-playlist-title], .playlist-title, .queue-title')?.textContent || null,
  userAgent: navigator.userAgent,
};
const cookies = await page.context().cookies();
JSON.stringify({ ...metadata, cookies });
`;
        const metadataRaw = await this.executeBrowserCommand(sessionId, metadataCode);
        metadata = this.parseBrowserJson<typeof metadata>(
          metadataRaw,
          sessionId,
          'Could not extract playlist metadata'
        );
      } catch (err) {
        logger.warn('[LiveViewSession] Could not extract playlist metadata', {
          sessionId,
          error: err instanceof Error ? err.message : 'unknown',
        });
      }

      const cookies = Array.isArray(metadata.cookies)
        ? metadata.cookies
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

      const referer = (metadata.url as string) ?? null;
      const origin = this.resolveOrigin(metadata.url as string);
      const cookieHeader = this.buildCookieHeader(cookies);

      logger.info('[LiveViewSession] Playlist extracted via AI', {
        sessionId,
        url: metadata.url,
        title: metadata.title,
        itemCount: items.length,
        cookieCount: cookies.length,
      });

      return {
        url: (metadata.url as string) ?? '',
        title: (metadata.title as string) ?? '',
        playlistTitle:
          typeof metadata.playlistTitle === 'string' && metadata.playlistTitle.trim().length > 0
            ? metadata.playlistTitle.trim()
            : null,
        items,
        auth: {
          userAgent:
            typeof metadata.userAgent === 'string' ? metadata.userAgent : null,
          referer,
          origin,
          cookieHeader,
          cookies,
        },
      };
    } catch (error) {
      if (error instanceof AgentEngineError) {
        throw error;
      }

      throw new AgentEngineError(
        'LIVE_VIEW_REQUEST_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to extract playlist items. Ensure a playlist or clip collection is visible.',
        { metadata: { sessionId } }
      );
    }
  }

  /**
   * Parse AI-generated playlist response to extract structured clip items.
   * Handles various response formats (labeled lists, markdown, etc.)
   */
  private parsePlaylistFromResponse(
    response: string
  ): Array<{
    index: number;
    itemId: string | null;
    title: string;
    url: string | null;
    durationText: string | null;
    thumbnailUrl: string | null;
    textSnippet: string | null;
    isCurrent: boolean;
  }> {
    const items: Array<{
      index: number;
      itemId: string | null;
      title: string;
      url: string | null;
      durationText: string | null;
      thumbnailUrl: string | null;
      textSnippet: string | null;
      isCurrent: boolean;
    }> = [];

    // Split response by common delimiters (---, ===, numbered items, etc.)
    const itemBlocks = response
      .split(/(?:---|===|##\s+Item|\d+\.|Clip\s+\d+)/i)
      .filter((block) => block.trim().length > 10);

    for (let i = 0; i < itemBlocks.length && items.length < 100; i++) {
      const block = itemBlocks[i];

      // Extract title
      const titleMatch = block.match(/title\s*[:=]\s*\[?([^\]\n]+)\]?/i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // Extract URL
      const urlMatch = block.match(/url\s*[:=]\s*(https?:\/\/[^\s\n\]]+)/i);
      const url = urlMatch ? urlMatch[1].trim() : null;

      // Extract duration
      const durationMatch = block.match(/duration\s*[:=]\s*(\d{1,2}:\d{2}(?::\d{2})?|\d+\s*(?:sec|min|ms))/i);
      const durationText = durationMatch ? durationMatch[1].trim() : null;

      // Extract thumbnail URL
      const thumbnailMatch = block.match(/thumbnail\s*[:=]\s*(https?:\/\/[^\s\n\]]+)/i);
      const thumbnailUrl = thumbnailMatch ? thumbnailMatch[1].trim() : null;

      if (title || url) {
        items.push({
          index: items.length + 1,
          itemId: null,
          title: title || 'Untitled clip',
          url,
          durationText,
          thumbnailUrl,
          textSnippet: block.substring(0, 100),
          isCurrent: false,
        });
      }
    }

    return items;
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

    let prompt: string;

    switch (action.type) {
      case 'click': {
        const target = action.selector
          ? `matching selector "${action.selector}"`
          : 'visible on this page';
        prompt = `Click on the interactive element ${target}. If you cannot find it, describe what you attempted.`;
        break;
      }

      case 'type': {
        const target = action.selector
          ? `matching selector "${action.selector}"`
          : 'currently focused';
        const text = action.text ?? '';
        prompt = `Type the text "${text}" into the input field ${target}. Confirm when complete.`;
        break;
      }

      case 'scroll': {
        if (action.selector) {
          prompt = `Scroll the element matching selector "${action.selector}" into view. Wait for any content to load.`;
        } else {
          const amount = Math.max(action.amount ?? 500, 100);
          prompt = `Scroll down the page by approximately ${amount} pixels. Wait for content to load if needed.`;
        }
        break;
      }

      case 'wait': {
        const ms = Math.min(action.ms ?? 1000, 5000);
        prompt = `Wait ${ms} milliseconds for the page to update or content to load. Then describe the current state.`;
        break;
      }

      default:
        return {
          success: false,
          message: `Unknown action type: ${(action as { type: string }).type}`,
        };
    }

    try {
      const result = await this.executeBrowserPrompt(sessionId, prompt);

      logger.info('[LiveViewSession] Action completed via AI', {
        sessionId,
        actionType: action.type,
        resultLength: result.length,
      });

      return { success: true, message: result };
    } catch (error) {
      logger.error('[LiveViewSession] Action failed', {
        sessionId,
        actionType: action.type,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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

    if (output.length > 0 && output.length < MIN_PROMPT_OUTPUT_CHARS_FOR_CONFIDENCE) {
      try {
        const probe = await this.collectInteractiveProbe(sessionId);
        if (probe && (probe.interactiveSnapshot || probe.fullSnapshot)) {
          const sections = [
            probe.interactiveSnapshot
              ? `Interactive snapshot:\n${probe.interactiveSnapshot}`
              : '',
            probe.fullSnapshot ? `Full snapshot:\n${probe.fullSnapshot}` : '',
          ].filter((section) => section.length > 0);

          if (sections.length > 0) {
            const enrichedOutput = `${output}\n\nPage grounding details:\n${sections.join('\n\n')}`;
            logger.info('[LiveViewSession] Prompt output enriched with deterministic probe', {
              sessionId,
              outputLength: output.length,
              enrichedLength: enrichedOutput.length,
            });
            return { success: true, output: enrichedOutput.slice(0, 30_000) };
          }
        }
      } catch (err) {
        logger.warn('[LiveViewSession] Prompt probe enrichment failed', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

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
