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
  readonly attempts?: number;
  readonly verification?: {
    readonly status: 'verified' | 'ambiguous' | 'failed';
    readonly reason: string;
    readonly currentUrl: string;
    readonly currentTitle: string;
    readonly changedUrl: boolean;
    readonly changedTitle: boolean;
    readonly changedInteractiveSnapshot: boolean;
    readonly changedFullSnapshot: boolean;
  };
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

export interface LiveViewPlaylistExtractionOptions {
  readonly selection?: 'visible' | 'first' | 'last';
  readonly playNumbers?: readonly number[];
}

export interface LiveViewScreenshotViewport {
  readonly width: number;
  readonly height: number;
}

export interface LiveViewScreenshotOptions {
  readonly format?: 'png' | 'jpeg';
  readonly fullPage?: boolean;
  readonly selector?: string | null;
  readonly quality?: number;
  readonly viewport?: LiveViewScreenshotViewport;
}

export interface LiveViewScreenshotResult {
  readonly url: string;
  readonly title: string;
  readonly mimeType: 'image/png' | 'image/jpeg';
  readonly base64: string;
  readonly sizeBytes: number;
  readonly capturedAt: string;
  readonly fullPage: boolean;
  readonly selector: string | null;
  readonly viewport: LiveViewScreenshotViewport | null;
  readonly source: 'firecrawl_interact_playwright';
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Live-view sessions last 10 minutes. */
const LIVE_VIEW_TTL_SECONDS = 600;
const MAX_PROBE_SECTION_CHARS = 20_000;
const MAX_SCREENSHOT_BYTES = 12 * 1024 * 1024;
const LIVE_VIEW_INTERACT_DEADLINE_MS = 45_000;
const LIVE_VIEW_MEDIA_EXTRACT_DEADLINE_MS = 90_000;
const LIVE_VIEW_PLAYLIST_EXTRACT_DEADLINE_MS = 90_000;
const MAX_PROMPT_EXECUTION_RETRIES = 1;

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
  private static readonly REMOTE_SESSION_UNAVAILABLE_MESSAGES = [
    'browser session has been destroyed',
    'session has been destroyed',
    'session expired on firecrawl',
    'session not found',
  ] as const;

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

  private isRemoteSessionUnavailableMessage(message: string): boolean {
    const normalized = message.trim().toLowerCase();
    if (!normalized) return false;

    if (
      LiveViewSessionService.REMOTE_SESSION_UNAVAILABLE_MESSAGES.some((candidate) =>
        normalized.includes(candidate)
      )
    ) {
      return true;
    }

    return normalized.includes('session') && normalized.includes('expired');
  }

  private normalizeSessionExecutionError(
    sessionId: string,
    error: unknown,
    fallbackMessage: string
  ): AgentEngineError {
    if (
      error instanceof AgentEngineError &&
      (error.code === 'LIVE_VIEW_SESSION_EXPIRED' || error.code === 'LIVE_VIEW_SESSION_NOT_FOUND')
    ) {
      return error;
    }

    const message =
      error instanceof Error
        ? error.message.trim() || fallbackMessage
        : String(error || fallbackMessage);

    if (this.isRemoteSessionUnavailableMessage(message)) {
      const hadTrackedSession = this.activeSessions.delete(sessionId);
      logger.warn('[LiveViewSession] Remote session unavailable; purged local session', {
        sessionId,
        hadTrackedSession,
        error: message,
      });
      return new AgentEngineError(
        'LIVE_VIEW_SESSION_EXPIRED',
        'Browser session has expired. Open live view again to continue.',
        {
          cause: error,
          metadata: {
            sessionId,
            remoteError: message,
          },
        }
      );
    }

    if (error instanceof AgentEngineError) {
      return error;
    }

    return new AgentEngineError('LIVE_VIEW_REQUEST_FAILED', message, {
      cause: error,
      metadata: { sessionId },
    });
  }

  private async withInteractionDeadline<T>(
    sessionId: string,
    label: string,
    run: () => Promise<T>,
    deadlineMs: number = LIVE_VIEW_INTERACT_DEADLINE_MS
  ): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new AgentEngineError(
            'LIVE_VIEW_REQUEST_TIMEOUT',
            `${label} did not finish within ${Math.round(deadlineMs / 1000)} seconds. Try a smaller, more specific live-view action.`,
            { metadata: { sessionId, deadlineMs } }
          )
        );
      }, deadlineMs);
    });

    try {
      return await Promise.race([run(), timeout]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  /**
   * Execute Playwright code in an active scrape interact session.
   * Uses `language: 'node'` (Playwright) — the default for the interact API.
   * The `agent-browser` bash CLI is only available in /v2/browser sessions.
   */
  private async executeBrowserCommand(sessionId: string, code: string): Promise<string> {
    try {
      const result: ScrapeExecuteResponse = await this.withInteractionDeadline(
        sessionId,
        'Browser command',
        () =>
          this.client.interact(sessionId, {
            code,
          })
      );

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

      return this.resolveInteractText(result);
    } catch (error) {
      throw this.normalizeSessionExecutionError(sessionId, error, 'Browser command failed');
    }
  }

  /**
   * Firecrawl may return content on different channels (`stdout`, `output`, `result`).
   * Prefer the first non-empty channel to avoid dropping valid responses.
   */
  private resolveInteractText(result: ScrapeExecuteResponse): string {
    const candidates: unknown[] = [
      result.stdout,
      (result as ScrapeExecuteResponse & { output?: unknown }).output,
      result.result,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const text = candidate.trim();
        if (text.length > 0) {
          return text;
        }
      }
    }

    for (const candidate of candidates) {
      if (candidate && typeof candidate === 'object') {
        try {
          const json = JSON.stringify(candidate);
          if (json.length > 0) {
            return json;
          }
        } catch {
          // Ignore non-serializable objects.
        }
      }
    }

    return '';
  }

  /**
   * Execute a natural language prompt in the browser using Firecrawl's AI mode.
   * This is more reliable than code-based extraction for complex tasks like
   * extracting media URLs, as the AI can reason about the page and handle
   * edge cases intelligently.
   */
  private async executeBrowserPrompt(
    sessionId: string,
    prompt: string,
    deadlineMs: number = LIVE_VIEW_INTERACT_DEADLINE_MS
  ): Promise<string> {
    try {
      const result: ScrapeExecuteResponse = await this.withInteractionDeadline(
        sessionId,
        'Browser interaction',
        () =>
          this.client.interact(sessionId, {
            prompt,
          }),
        deadlineMs
      );

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

      return this.resolveInteractText(result);
    } catch (error) {
      throw this.normalizeSessionExecutionError(
        sessionId,
        error,
        'Browser prompt execution failed'
      );
    }
  }

  /**
   * Extract URLs matching media patterns from natural language text.
   * Handles both direct URLs and markdown-formatted links.
   */
  private extractUrlsFromText(text: string, patterns: RegExp[] = []): string[] {
    if (!text) return [];

    // Default patterns for common media types
    const defaultPatterns = [
      /https?:\/\/[^\s<>"{}|\\^`[\]]*\.(?:m3u8|mp4|ts|webm|mkv|mov|mpd|aac|wav|mp3)(?:[?#][^\s<>"{}|\\^`[\]]*)?/gi,
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
    const labelPattern =
      /(?:url|stream|link|src):\s*([^\s\n]+\.(?:m3u8|mp4|ts|mpd)(?:[?#][^\s\n]*)?)/gi;
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
    const validatedUrl = validateUrl(request.url, { allowSocialMedia: true });
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
      } else if (/do not support this site|we do not support this site/i.test(errMsg)) {
        throw new AgentEngineError(
          'LIVE_VIEW_REQUEST_FAILED',
          `Live view is not available for ${destination.domainLabel} with the current browser provider.`,
          { cause: err }
        );
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
    const validatedUrl = validateUrl(url, { allowSocialMedia: true });

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

  private normalizeScreenshotOptions(options?: LiveViewScreenshotOptions): Required<
    Pick<LiveViewScreenshotOptions, 'format' | 'fullPage'>
  > & {
    readonly selector: string | null;
    readonly quality: number | null;
    readonly viewport: LiveViewScreenshotViewport | null;
  } {
    const format = options?.format === 'jpeg' ? 'jpeg' : 'png';
    const selector = options?.selector?.trim() ? options.selector.trim().slice(0, 512) : null;
    const quality =
      format === 'jpeg' ? Math.max(1, Math.min(Math.round(options?.quality ?? 82), 100)) : null;
    const rawViewport = options?.viewport;
    const viewport = rawViewport
      ? {
          width: Math.max(320, Math.min(Math.round(rawViewport.width), 3840)),
          height: Math.max(240, Math.min(Math.round(rawViewport.height), 2160)),
        }
      : null;

    return {
      format,
      fullPage: options?.fullPage === true,
      selector,
      quality,
      viewport,
    };
  }

  async captureScreenshot(
    sessionId: string,
    userId: string,
    options?: LiveViewScreenshotOptions
  ): Promise<LiveViewScreenshotResult> {
    this.assertOwnership(sessionId, userId);

    const normalized = this.normalizeScreenshotOptions(options);
    const payload = JSON.stringify(normalized);

    logger.info('[LiveViewSession] Capturing screenshot', {
      sessionId,
      format: normalized.format,
      fullPage: normalized.fullPage,
      hasSelector: !!normalized.selector,
      viewport: normalized.viewport,
    });

    const code = `
var options = ${payload};
if (options.viewport) {
  await page.setViewportSize(options.viewport);
}
await page.waitForLoadState('networkidle').catch(() => undefined);
const target = options.selector ? await page.$(options.selector) : null;
if (options.selector && !target) {
  throw new Error('No element matched selector: ' + options.selector);
}
const screenshotOptions = { type: options.format };
if (!options.selector) {
  screenshotOptions.fullPage = options.fullPage === true;
}
if (options.format === 'jpeg' && typeof options.quality === 'number') {
  screenshotOptions.quality = options.quality;
}
const buffer = target
  ? await target.screenshot(screenshotOptions)
  : await page.screenshot(screenshotOptions);
const viewport = await page.viewportSize();
const response = {
  url: page.url(),
  title: await page.title(),
  mimeType: options.format === 'jpeg' ? 'image/jpeg' : 'image/png',
  base64: buffer.toString('base64'),
  sizeBytes: buffer.length,
  capturedAt: new Date().toISOString(),
  fullPage: options.selector ? false : options.fullPage === true,
  selector: options.selector ?? null,
  viewport: viewport ? { width: viewport.width, height: viewport.height } : null,
  source: 'firecrawl_interact_playwright',
};
JSON.stringify(response);
`;

    const raw = await this.executeBrowserCommand(sessionId, code);
    const result = this.parseBrowserJson<LiveViewScreenshotResult>(
      raw,
      sessionId,
      'Firecrawl screenshot capture returned an unreadable response'
    );

    if (!result.base64 || result.sizeBytes <= 0) {
      throw new AgentEngineError(
        'LIVE_VIEW_REQUEST_FAILED',
        'Firecrawl screenshot capture returned an empty image',
        { metadata: { sessionId } }
      );
    }

    if (result.sizeBytes > MAX_SCREENSHOT_BYTES) {
      throw new AgentEngineError(
        'LIVE_VIEW_REQUEST_FAILED',
        'Live view screenshot exceeded the maximum supported size. Retry with fullPage=false or a smaller viewport.',
        { metadata: { sessionId, sizeBytes: result.sizeBytes } }
      );
    }

    logger.info('[LiveViewSession] Screenshot captured', {
      sessionId,
      url: result.url,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      fullPage: result.fullPage,
      selector: result.selector,
    });

    return result;
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
      const rawResult = await this.executeBrowserPrompt(
        sessionId,
        extractionPrompt,
        LIVE_VIEW_MEDIA_EXTRACT_DEADLINE_MS
      );

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
JSON.stringify(await (async () => ({
  url: page.url(),
  title: await page.title(),
  userAgent: await page.evaluate(() => navigator.userAgent),
  cookies: await page.context().cookies(),
}))());
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
        currentSrc: null,
        blobSrc: null,
        auth: {
          userAgent: typeof metadata.userAgent === 'string' ? metadata.userAgent : null,
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
    maxItems: number = 5,
    options: LiveViewPlaylistExtractionOptions = {}
  ): Promise<LiveViewPlaylistExtractionResult> {
    this.assertOwnership(sessionId, userId);

    const boundedMaxItems = Math.min(Math.max(Math.trunc(maxItems) || 5, 1), 25);
    const selection = options.selection ?? 'visible';
    const playNumbers = Array.from(
      new Set(
        (options.playNumbers ?? [])
          .map((value) => Math.trunc(value))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    ).slice(0, 25);

    logger.info('[LiveViewSession] Extracting playlist via AI', {
      sessionId,
      maxItems: boundedMaxItems,
      selection,
      playNumbers,
    });

    const browserItems = await this.extractPlaylistRowsViaBrowser(sessionId, boundedMaxItems, {
      selection,
      playNumbers,
    });

    /**
     * Use AI to extract playlist items. This is more reliable than complex
     * DOM traversal because AI can understand the semantic structure of
     * the page, handle variations in layouts, and identify clips intelligently.
     */
    const playlistPrompt = `
You are analyzing a page with a playlist or collection of video/media clips.

Your task: Extract information about the current bounded subset of clips/videos visible on this page.

Target subset: ${
      playNumbers.length > 0
        ? `plays ${playNumbers.join(', ')}`
        : selection === 'last'
          ? `the last ${boundedMaxItems} loaded playlist rows`
          : selection === 'first'
            ? `the first ${boundedMaxItems} loaded playlist rows`
            : `up to ${boundedMaxItems} currently visible playlist rows`
    }.

For each clip/video, gather:
1. Title or name of the clip
2. Direct URL to the clip (if clickable/navigable)
3. Duration (if visible)
4. Thumbnail image URL (if available)
5. Any identifiable ID or metadata attribute

IMPORTANT: 
- Include up to ${boundedMaxItems} items
- Use bounded scrolling only if needed to reveal the requested target subset
- Do NOT enumerate or analyze the entire playlist when a small subset was requested
- Extract ACTUAL clip/video URLs, not just player frame URLs
- If clips are in a carousel or lazy-loaded, capture only what's currently visible or already loaded
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
      const rawResult =
        browserItems.length > 0
          ? browserItems
              .map((item) => {
                const parts = [
                  `- Title: ${item.title}`,
                  `- URL: ${item.url ?? ''}`,
                  `- Duration: ${item.durationText ?? ''}`,
                  `- Thumbnail: ${item.thumbnailUrl ?? ''}`,
                ];
                return parts.join('\n');
              })
              .join('\n---\n')
          : await this.executeBrowserPrompt(
              sessionId,
              playlistPrompt,
              LIVE_VIEW_PLAYLIST_EXTRACT_DEADLINE_MS
            );

      logger.info('[LiveViewSession] AI playlist response', {
        sessionId,
        responseLength: rawResult.length,
      });

      // Parse the AI response to extract items
      let items =
        browserItems.length > 0
          ? browserItems
          : this.parsePlaylistFromResponse(rawResult, boundedMaxItems);

      if (items.length > 0) {
        items = await this.hydratePlaylistItemsWithPlayableUrls(sessionId, items, boundedMaxItems);
      }

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
JSON.stringify(await (async () => ({
  url: page.url(),
  title: await page.title(),
  playlistTitle: await page.evaluate(() => {
    const el = document.querySelector('[data-playlist-title], .playlist-title, .queue-title');
    return el?.textContent?.trim() || null;
  }),
  userAgent: await page.evaluate(() => navigator.userAgent),
  cookies: await page.context().cookies(),
}))());
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
          userAgent: typeof metadata.userAgent === 'string' ? metadata.userAgent : null,
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

  private async extractPlaylistRowsViaBrowser(
    sessionId: string,
    maxItems: number,
    options: Required<LiveViewPlaylistExtractionOptions>
  ): Promise<LiveViewPlaylistItem[]> {
    const targetDescription =
      Array.isArray(options.playNumbers) && options.playNumbers.length > 0
        ? `plays ${options.playNumbers.join(', ')}`
        : options.selection === 'last'
          ? `the last ${maxItems} loaded playlist rows`
          : options.selection === 'first'
            ? `the first ${maxItems} loaded playlist rows`
            : `up to ${maxItems} currently visible playlist rows`;

    const prompt = `You are operating inside a sports film playlist view (Hudl-like UI).

Target subset: ${targetDescription}.

Goal:
- Extract playlist rows for ONLY the bounded target subset.
- If URL is missing for a requested row, click that row, wait for player update, then extract the best playable media URL from video/source/network evidence.
- Use bounded scrolling only when required to reach the target subset.
- Never enumerate the full playlist if a bounded subset is requested.

Return format requirements:
- Return ONLY strict JSON.
- JSON shape must be:
{
  "items": [
    {
      "index": 0,
      "itemId": "play-101" | null,
      "title": "Play #101",
      "url": "https://..." | null,
      "durationText": "00:12" | null,
      "thumbnailUrl": "https://..." | null,
      "textSnippet": "short evidence text",
      "isCurrent": false
    }
  ]
}
- Include at most ${maxItems} items.
- If no items are found, return {"items": []}.
- Do not include markdown fences.`;

    try {
      const raw = await this.executeBrowserPrompt(
        sessionId,
        prompt,
        LIVE_VIEW_PLAYLIST_EXTRACT_DEADLINE_MS
      );
      const jsonItems = this.parsePlaylistItemsFromJsonResponse(raw, maxItems);
      if (jsonItems.length > 0) {
        return jsonItems;
      }

      return this.parsePlaylistFromResponse(raw, maxItems);
    } catch (err) {
      logger.warn('[LiveViewSession] Browser playlist row extraction failed; falling back to AI', {
        sessionId,
        error: err instanceof Error ? err.message : 'unknown',
      });
      return [];
    }
  }

  private async hydratePlaylistItemsWithPlayableUrls(
    sessionId: string,
    items: readonly LiveViewPlaylistItem[],
    maxItems: number
  ): Promise<LiveViewPlaylistItem[]> {
    const boundedMaxItems = Math.min(Math.max(Math.trunc(maxItems) || 5, 1), 25);
    const unresolved = items
      .filter(
        (item) => !item.url && (typeof item.itemId === 'string' || item.title.trim().length > 0)
      )
      .slice(0, boundedMaxItems);

    if (unresolved.length === 0) {
      return items.slice(0, boundedMaxItems).map((item, index) => ({ ...item, index }));
    }

    const payload = JSON.stringify({
      targets: unresolved.map((item) => ({
        index: item.index,
        itemId: item.itemId,
        title: item.title,
      })),
    });

    const code = `
JSON.stringify(await page.evaluate(async (options) => {
  const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const extractPlayNumber = (text) => {
    const match = text.match(/\\b(?:play\\s*#?|#)\\s*(\\d{1,4})\\b/i);
    return match ? Number(match[1]) : null;
  };
  const readPlayableUrl = () => {
    const video = document.querySelector('video');
    if (video instanceof HTMLVideoElement) {
      const directSrc = normalize(video.currentSrc || video.src || '');
      if (directSrc && !directSrc.startsWith('blob:')) return directSrc;
      for (const source of Array.from(video.querySelectorAll('source[src]'))) {
        if (!(source instanceof HTMLSourceElement)) continue;
        const sourceSrc = normalize(source.src || '');
        if (sourceSrc && !sourceSrc.startsWith('blob:')) return sourceSrc;
      }
    }

    const perf = Array.from(performance.getEntriesByType('resource'))
      .map((entry) => normalize(entry.name || ''))
      .filter((url) => /\\.(m3u8|mp4|webm|mpd)(?:$|[?#])/i.test(url));
    return perf.length > 0 ? perf[perf.length - 1] : null;
  };

  const candidates = Array.from(
    document.querySelectorAll('[role="row"], [role="listitem"], tr, li, button, a, [tabindex], div')
  ).filter((element) => element instanceof HTMLElement && visible(element));

  const updates = [];

  for (const target of options.targets || []) {
    const targetPlayNumber =
      typeof target.itemId === 'string' && /play-(\\d+)/i.test(target.itemId)
        ? Number(target.itemId.match(/play-(\\d+)/i)?.[1] || NaN)
        : extractPlayNumber(String(target.title || ''));

    let chosen = null;
    let bestScore = -1;

    for (const element of candidates) {
      const text = normalize(element.innerText || element.textContent || '');
      if (!text) continue;

      let score = 0;
      const playNumber = extractPlayNumber(text);
      if (targetPlayNumber && playNumber === targetPlayNumber) score += 5;
      if (typeof target.title === 'string' && target.title.length > 0) {
        const condensedTitle = normalize(target.title).toLowerCase();
        if (condensedTitle.length > 0 && text.toLowerCase().includes(condensedTitle)) score += 3;
      }
      if (/play\\s*#|odk|qtr|result|rush|pass|kick|punt/i.test(text)) score += 1;

      if (score > bestScore) {
        bestScore = score;
        chosen = element;
      }
    }

    if (!(chosen instanceof HTMLElement) || bestScore < 1) continue;

    try {
      chosen.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    } catch {
      // no-op
    }

    try {
      const clickable =
        chosen.closest('a,button,[role="button"]') ||
        chosen.querySelector('a,button,[role="button"]') ||
        chosen;
      clickable.click();
    } catch {
      // no-op
    }

    await sleep(900);

    const playableUrl = readPlayableUrl();
    const snippet = normalize(chosen.innerText || chosen.textContent || '').slice(0, 280);

    updates.push({
      index: typeof target.index === 'number' ? Math.max(0, Math.trunc(target.index)) : null,
      itemId: typeof target.itemId === 'string' ? target.itemId : null,
      title: typeof target.title === 'string' ? target.title : null,
      url: playableUrl,
      textSnippet: snippet || null,
      isCurrent: /\\b(current|selected|active|playing)\\b/i.test(snippet),
    });
  }

  return { updates };
}, ${payload}));
`;

    try {
      const raw = await this.executeBrowserCommand(sessionId, code);
      const parsed = this.parseBrowserJson<{
        updates?: Array<{
          index: number | null;
          itemId: string | null;
          title: string | null;
          url: string | null;
          textSnippet?: string | null;
          isCurrent?: boolean;
        }>;
      }>(raw, sessionId, 'Could not hydrate playlist media URLs from browser playback state');

      const updates = Array.isArray(parsed.updates) ? parsed.updates : [];
      if (updates.length === 0) {
        return items.slice(0, boundedMaxItems).map((item, index) => ({ ...item, index }));
      }

      const byIndex = new Map<number, (typeof updates)[number]>();
      const byItemId = new Map<string, (typeof updates)[number]>();
      for (const update of updates) {
        if (typeof update.index === 'number' && Number.isFinite(update.index)) {
          byIndex.set(Math.trunc(update.index), update);
        }
        if (typeof update.itemId === 'string' && update.itemId.trim().length > 0) {
          byItemId.set(update.itemId, update);
        }
      }

      return items.slice(0, boundedMaxItems).map((item, index) => {
        const update =
          byIndex.get(item.index) ?? (item.itemId ? byItemId.get(item.itemId) : undefined);
        const hydratedUrl =
          typeof update?.url === 'string' && update.url.trim().length > 0
            ? update.url.trim()
            : item.url;
        const hydratedSnippet =
          typeof update?.textSnippet === 'string' && update.textSnippet.trim().length > 0
            ? update.textSnippet.trim()
            : item.textSnippet;

        return {
          ...item,
          index,
          url: hydratedUrl ?? null,
          textSnippet: hydratedSnippet ?? null,
          isCurrent: update?.isCurrent === true ? true : item.isCurrent,
        };
      });
    } catch (err) {
      logger.warn(
        '[LiveViewSession] Playlist media URL hydration failed; continuing with extracted rows',
        {
          sessionId,
          error: err instanceof Error ? err.message : 'unknown',
        }
      );
      return items.slice(0, boundedMaxItems).map((item, index) => ({ ...item, index }));
    }
  }

  private parsePlaylistItemsFromJsonResponse(
    response: string,
    maxItems: number
  ): LiveViewPlaylistItem[] {
    const boundedMaxItems = Math.min(Math.max(Math.trunc(maxItems) || 5, 1), 25);

    const sanitizeItems = (items: unknown): LiveViewPlaylistItem[] => {
      if (!Array.isArray(items)) return [];

      const sanitized: LiveViewPlaylistItem[] = [];
      for (const [index, item] of items.entries()) {
        if (!item || typeof item !== 'object') continue;

        const record = item as Record<string, unknown>;
        const titleValue =
          typeof record['title'] === 'string' && record['title'].trim().length > 0
            ? record['title'].trim()
            : null;
        const urlValue =
          typeof record['url'] === 'string' && record['url'].trim().length > 0
            ? record['url'].trim()
            : null;

        if (!titleValue && !urlValue) continue;

        sanitized.push({
          index:
            typeof record['index'] === 'number' && Number.isFinite(record['index'])
              ? Math.max(0, Math.trunc(record['index']))
              : index,
          itemId:
            typeof record['itemId'] === 'string' && record['itemId'].trim().length > 0
              ? record['itemId'].trim()
              : null,
          title: titleValue ?? 'Untitled clip',
          url: urlValue,
          durationText:
            typeof record['durationText'] === 'string' && record['durationText'].trim().length > 0
              ? record['durationText'].trim()
              : null,
          thumbnailUrl:
            typeof record['thumbnailUrl'] === 'string' && record['thumbnailUrl'].trim().length > 0
              ? record['thumbnailUrl'].trim()
              : null,
          textSnippet:
            typeof record['textSnippet'] === 'string' && record['textSnippet'].trim().length > 0
              ? record['textSnippet'].trim().slice(0, 280)
              : null,
          isCurrent: record['isCurrent'] === true,
        });
      }

      return sanitized
        .sort((a, b) => a.index - b.index)
        .slice(0, boundedMaxItems)
        .map((item, index) => ({ ...item, index }));
    };

    const parseCandidate = (candidate: string): LiveViewPlaylistItem[] => {
      try {
        const parsed = JSON.parse(candidate) as { items?: unknown };
        return sanitizeItems(parsed.items ?? []);
      } catch {
        return [];
      }
    };

    const trimmed = response.trim();
    const direct = parseCandidate(trimmed);
    if (direct.length > 0) return direct;

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      const fenced = parseCandidate(fencedMatch[1]);
      if (fenced.length > 0) return fenced;
    }

    const objectMatch = trimmed.match(/\{[\s\S]*"items"[\s\S]*\}/);
    if (objectMatch?.[0]) {
      const fromObject = parseCandidate(objectMatch[0]);
      if (fromObject.length > 0) return fromObject;
    }

    return [];
  }

  /**
   * Parse AI-generated playlist response to extract structured clip items.
   * Handles various response formats (labeled lists, markdown, etc.)
   */
  private parsePlaylistFromResponse(
    response: string,
    maxItems: number
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
    const hudlRows = this.parseHudlPlayRowsFromResponse(response, maxItems);
    if (hudlRows.length > 0) return hudlRows;

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

    const boundedMaxItems = Math.min(Math.max(Math.trunc(maxItems) || 5, 1), 25);

    for (let i = 0; i < itemBlocks.length && items.length < boundedMaxItems; i++) {
      const block = itemBlocks[i];

      // Extract title
      const titleMatch = block.match(/title\s*[:=]\s*\[?([^\]\n]+)\]?/i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // Extract URL
      const urlMatch = block.match(/url\s*[:=]\s*(https?:\/\/[^\s\n\]]+)/i);
      const url = urlMatch ? urlMatch[1].trim() : null;

      // Extract duration
      const durationMatch = block.match(
        /duration\s*[:=]\s*(\d{1,2}:\d{2}(?::\d{2})?|\d+\s*(?:sec|min|ms))/i
      );
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

  private parseHudlPlayRowsFromResponse(
    response: string,
    maxItems: number
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
    const boundedMaxItems = Math.min(Math.max(Math.trunc(maxItems) || 5, 1), 25);
    const normalized = response.replace(/\\n/g, '\n');
    const playMatches = Array.from(normalized.matchAll(/PLAY\s*#\s*(\d{1,4})/gi));
    if (playMatches.length === 0) return [];

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
    const seen = new Set<number>();

    for (const [matchIndex, match] of playMatches.entries()) {
      const playNumber = Number(match[1]);
      if (!Number.isFinite(playNumber) || seen.has(playNumber)) continue;
      seen.add(playNumber);

      const start = match.index ?? 0;
      const nextStart = playMatches[matchIndex + 1]?.index ?? start + 500;
      const snippet = normalized
        .slice(start, Math.min(nextStart, start + 500))
        .replace(/["'`]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const urlMatch = snippet.match(/https?:\/\/[^\s\]"'<>]+/i);
      const durationMatch = snippet.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
      const thumbnailMatch = snippet.match(
        /https?:\/\/[^\s\]"'<>]+\.(?:png|jpe?g|webp)(?:[?#][^\s\]"'<>]+)?/i
      );

      items.push({
        index: items.length,
        itemId: `play-${playNumber}`,
        title: `Play #${playNumber}`,
        url: urlMatch?.[0] ?? null,
        durationText: durationMatch?.[0] ?? null,
        thumbnailUrl: thumbnailMatch?.[0] ?? null,
        textSnippet: snippet.slice(0, 240),
        isCurrent: /\b(current|selected|active|playing)\b/i.test(snippet),
      });
    }

    return items.slice(-boundedMaxItems).map((item, index) => ({
      ...item,
      index,
    }));
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

    const beforeProbe = await this.collectInteractiveProbeWithTolerance(sessionId, 'preflight');

    const deterministicScroll = await this.tryDeterministicScrollPrompt(sessionId, prompt);
    if (deterministicScroll) {
      return deterministicScroll;
    }

    let finalOutput = '';
    let verification: {
      readonly status: 'verified' | 'ambiguous' | 'failed';
      readonly reason: string;
      readonly currentUrl: string;
      readonly currentTitle: string;
      readonly changedUrl: boolean;
      readonly changedTitle: boolean;
      readonly changedInteractiveSnapshot: boolean;
      readonly changedFullSnapshot: boolean;
    } | null = null;
    let attempts = 0;

    for (let attempt = 1; attempt <= MAX_PROMPT_EXECUTION_RETRIES + 1; attempt++) {
      attempts = attempt;

      let result: ScrapeExecuteResponse;
      try {
        result = await this.client.interact(sessionId, {
          prompt,
        });
      } catch (error) {
        throw this.normalizeSessionExecutionError(sessionId, error, 'Prompt execution failed');
      }

      if (!result.success) {
        const errorMsg = result.error?.trim() || result.stderr?.trim() || 'Prompt execution failed';
        const normalizedError = this.normalizeSessionExecutionError(
          sessionId,
          new AgentEngineError('LIVE_VIEW_REQUEST_FAILED', errorMsg, {
            metadata: { sessionId },
          }),
          'Prompt execution failed'
        );
        if (normalizedError.code === 'LIVE_VIEW_SESSION_EXPIRED') {
          throw normalizedError;
        }
        logger.warn('[LiveViewSession] Prompt failed', { sessionId, error: errorMsg, attempt });
        return { success: false, output: errorMsg, attempts: attempt };
      }

      const output = (result.output ?? result.stdout ?? result.result ?? '').trim();
      finalOutput = output || 'Action completed successfully.';

      const afterProbe = await this.collectInteractiveProbeWithTolerance(
        sessionId,
        `postflight_attempt_${attempt}`
      );
      verification = this.verifyPromptExecution({
        prompt,
        output,
        before: beforeProbe,
        after: afterProbe,
      });

      if (verification.status === 'verified') {
        logger.info('[LiveViewSession] Prompt completed with verified page-state change', {
          sessionId,
          attempt,
          reason: verification.reason,
          changedUrl: verification.changedUrl,
          changedTitle: verification.changedTitle,
          changedInteractiveSnapshot: verification.changedInteractiveSnapshot,
          changedFullSnapshot: verification.changedFullSnapshot,
        });
        return {
          success: true,
          output: this.summarizeVerification(finalOutput, verification),
          attempts: attempt,
          verification,
        };
      }

      if (attempt <= MAX_PROMPT_EXECUTION_RETRIES) {
        logger.warn('[LiveViewSession] Prompt verification ambiguous; retrying', {
          sessionId,
          attempt,
          reason: verification.reason,
        });
      }
    }

    logger.warn('[LiveViewSession] Prompt finished without verifiable page-state change', {
      sessionId,
      attempts,
      reason: verification?.reason,
    });

    return {
      success: false,
      output: this.summarizeVerification(finalOutput, verification, { failed: true }),
      attempts,
      verification: verification ?? {
        status: 'failed',
        reason: 'No observable page-state change detected after prompt execution.',
        currentUrl: '',
        currentTitle: '',
        changedUrl: false,
        changedTitle: false,
        changedInteractiveSnapshot: false,
        changedFullSnapshot: false,
      },
    };
  }

  private shouldUseDeterministicScroll(prompt: string): boolean {
    const normalized = prompt.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!/\bscroll\b/.test(normalized)) return false;

    const compoundAction = /\b(click|type|write|press|submit|send|select|choose|open)\b/.test(
      normalized
    );
    if (compoundAction) return false;

    return /\b(bottom|top|end|last|first|all the way)\b/.test(normalized);
  }

  private resolveDeterministicScrollDirection(prompt: string): 'bottom' | 'top' | 'down' | 'up' {
    const normalized = prompt.toLowerCase().replace(/\s+/g, ' ').trim();
    if (/\b(bottom|end|last clips?|last plays?|last rows?)\b/.test(normalized)) return 'bottom';
    if (/\b(top|beginning|first clips?|first plays?|first rows?)\b/.test(normalized)) return 'top';
    if (/\b(up|previous)\b/.test(normalized)) return 'up';
    return 'down';
  }

  private async tryDeterministicScrollPrompt(
    sessionId: string,
    prompt: string
  ): Promise<LiveViewPromptResult | null> {
    if (!this.shouldUseDeterministicScroll(prompt)) return null;
    const direction = this.resolveDeterministicScrollDirection(prompt);

    const payload = JSON.stringify({ direction });
    const code = `
JSON.stringify(await (async () => {
  const options = ${payload};
  const normalize = (value) => String(value || '').replace(/ +/g, ' ').trim();
  const visible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const pageTextPattern = /\b(playlist|clip|clips|play|plays|qtr|odk|result|hudl|video|library)\b/i;
  const candidates = Array.from(document.querySelectorAll('*')).filter((element) => {
    if (!(element instanceof HTMLElement) || !visible(element)) return false;
    if (element.scrollHeight <= element.clientHeight + 120) return false;
    const label = normalize([
      element.getAttribute('aria-label'),
      element.getAttribute('role'),
      element.className,
      element.id,
      element.innerText?.slice(0, 1200),
    ].join(' '));
    return pageTextPattern.test(label);
  });
  const scrollContainer = candidates.sort((a, b) => {
    const aRoom = a.scrollHeight - a.clientHeight;
    const bRoom = b.scrollHeight - b.clientHeight;
    return bRoom - aRoom;
  })[0] || document.scrollingElement || document.documentElement;
  const before = {
    scrollTop: Math.round(scrollContainer.scrollTop || 0),
    scrollHeight: Math.round(scrollContainer.scrollHeight || 0),
    clientHeight: Math.round(scrollContainer.clientHeight || 0),
  };
  const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
  const step = Math.max(600, Math.round((scrollContainer.clientHeight || window.innerHeight || 800) * 0.85));
  if (options.direction === 'bottom') {
    scrollContainer.scrollTop = maxScrollTop;
  } else if (options.direction === 'top') {
    scrollContainer.scrollTop = 0;
  } else if (options.direction === 'up') {
    scrollContainer.scrollTop = Math.max(0, before.scrollTop - step);
  } else {
    scrollContainer.scrollTop = Math.min(maxScrollTop, before.scrollTop + step);
  }
  scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
  await page.waitForTimeout(650);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const after = {
    scrollTop: Math.round(scrollContainer.scrollTop || 0),
    scrollHeight: Math.round(scrollContainer.scrollHeight || 0),
    clientHeight: Math.round(scrollContainer.clientHeight || 0),
  };
  return {
    direction: options.direction,
    url: page.url(),
    title: await page.title(),
    before,
    after,
    snapshot: normalize(document.body?.innerText || '').slice(0, 5000),
  };
})());
`;

    try {
      const raw = await this.executeBrowserCommand(sessionId, code);
      const result = this.parseBrowserJson<{
        direction?: string;
        url?: string;
        title?: string;
        before?: { scrollTop?: number; scrollHeight?: number; clientHeight?: number };
        after?: { scrollTop?: number; scrollHeight?: number; clientHeight?: number };
        snapshot?: string;
      }>(raw, sessionId, 'Deterministic scroll returned an unreadable response');

      const beforeTop = result.before?.scrollTop ?? 0;
      const afterTop = result.after?.scrollTop ?? 0;
      const output = [
        `Deterministic scroll completed (${direction}).`,
        result.url ? `Current URL: ${result.url}` : '',
        result.title ? `Current title: ${result.title}` : '',
        `Scroll position changed from ${beforeTop} to ${afterTop}.`,
        result.snapshot ? `Current visible page text snapshot:\n${result.snapshot}` : '',
      ]
        .filter((part) => part.length > 0)
        .join('\n');

      logger.info('[LiveViewSession] Deterministic scroll completed', {
        sessionId,
        direction,
        beforeTop,
        afterTop,
      });

      return { success: true, output: output.slice(0, 30_000), attempts: 1 };
    } catch (err) {
      logger.warn('[LiveViewSession] Deterministic scroll failed; falling back to prompt mode', {
        sessionId,
        direction,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async collectInteractiveProbeWithTolerance(
    sessionId: string,
    phase: string
  ): Promise<LiveViewProbeResult | null> {
    try {
      return await this.collectInteractiveProbe(sessionId);
    } catch (error) {
      logger.warn('[LiveViewSession] Probe collection failed (non-fatal)', {
        sessionId,
        phase,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private verifyPromptExecution(input: {
    prompt: string;
    output: string;
    before: LiveViewProbeResult | null;
    after: LiveViewProbeResult | null;
  }): {
    status: 'verified' | 'ambiguous' | 'failed';
    reason: string;
    currentUrl: string;
    currentTitle: string;
    changedUrl: boolean;
    changedTitle: boolean;
    changedInteractiveSnapshot: boolean;
    changedFullSnapshot: boolean;
  } {
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

    const beforeUrl = normalize(input.before?.url ?? '');
    const afterUrl = normalize(input.after?.url ?? '');
    const beforeTitle = normalize(input.before?.title ?? '');
    const afterTitle = normalize(input.after?.title ?? '');
    const beforeInteractive = normalize(input.before?.interactiveSnapshot ?? '');
    const afterInteractive = normalize(input.after?.interactiveSnapshot ?? '');
    const beforeFull = normalize(input.before?.fullSnapshot ?? '');
    const afterFull = normalize(input.after?.fullSnapshot ?? '');

    const changedUrl = Boolean(afterUrl) && (!beforeUrl || beforeUrl !== afterUrl);
    const changedTitle = Boolean(afterTitle) && (!beforeTitle || beforeTitle !== afterTitle);
    const changedInteractiveSnapshot =
      Boolean(afterInteractive) && (!beforeInteractive || beforeInteractive !== afterInteractive);
    const changedFullSnapshot = Boolean(afterFull) && (!beforeFull || beforeFull !== afterFull);

    const outputSignal = normalize(input.output);
    const successVerb =
      /\b(clicked|typed|selected|submitted|opened|closed|navigated|scrolled|updated|changed|completed)\b/.test(
        outputSignal
      );

    const hasProbeData = Boolean(afterUrl || afterTitle || afterInteractive || afterFull);
    const hadPreflightProbeData = Boolean(
      beforeUrl || beforeTitle || beforeInteractive || beforeFull
    );

    if (
      changedUrl ||
      changedTitle ||
      changedInteractiveSnapshot ||
      changedFullSnapshot ||
      (!hadPreflightProbeData && hasProbeData && successVerb)
    ) {
      return {
        status: 'verified',
        reason: 'Observed deterministic page-state change after prompt execution.',
        currentUrl: input.after?.url ?? '',
        currentTitle: input.after?.title ?? '',
        changedUrl,
        changedTitle,
        changedInteractiveSnapshot,
        changedFullSnapshot,
      };
    }

    if (!hasProbeData && successVerb) {
      return {
        status: 'verified',
        reason:
          'Provider reported successful action and probe snapshots were unavailable; accepting provider signal.',
        currentUrl: input.after?.url ?? '',
        currentTitle: input.after?.title ?? '',
        changedUrl,
        changedTitle,
        changedInteractiveSnapshot,
        changedFullSnapshot,
      };
    }

    return {
      status: 'ambiguous',
      reason:
        'Prompt execution returned success but no deterministic page-state change was observed. Retry recommended.',
      currentUrl: input.after?.url ?? '',
      currentTitle: input.after?.title ?? '',
      changedUrl,
      changedTitle,
      changedInteractiveSnapshot,
      changedFullSnapshot,
    };
  }

  private summarizeVerification(
    output: string,
    verification: {
      status: 'verified' | 'ambiguous' | 'failed';
      reason: string;
      currentUrl: string;
      currentTitle: string;
    } | null,
    options?: { failed?: boolean }
  ): string {
    if (!verification) return output || 'Action completed.';

    const statusLabel =
      verification.status === 'verified' ? 'VERIFIED' : options?.failed ? 'FAILED' : 'AMBIGUOUS';

    const parts = [
      output || 'Action completed.',
      '',
      `Verification: ${statusLabel}`,
      verification.reason,
    ];
    if (verification.currentUrl) parts.push(`Current URL: ${verification.currentUrl}`);
    if (verification.currentTitle) parts.push(`Current title: ${verification.currentTitle}`);
    return parts.join('\n').slice(0, 30_000);
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
