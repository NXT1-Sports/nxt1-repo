/**
 * @fileoverview Firecrawl Persistent Profile Service
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Manages persistent browser profiles for the Connected Accounts "Sign In" flow.
 * Uses Firecrawl's Persistent Profiles to save authenticated browser sessions
 * (cookies, localStorage, IndexedDB) so Agent X can reuse them for autonomous
 * background tasks without re-authentication.
 *
 * Key flows:
 * 1. `startSignInSession(userId, platform, loginUrl)` — Creates a Firecrawl
 *    scrape + interact session with a persistent profile, returns the
 *    `interactiveLiveViewUrl` for the frontend to embed.
 * 2. `completeSignInSession(sessionId)` — Deletes the browser session, which
 *    triggers Firecrawl to save the browser state to the profile.
 * 3. `generateProfileName(userId, platform)` — Deterministic profile name
 *    for a given user + platform combination.
 *
 * Security:
 * - Profile names are deterministic and cannot be guessed by other users.
 * - Session state is stored entirely on Firecrawl's infrastructure.
 * - NXT1 backend never stores raw cookies or passwords.
 * - Mutual-exclusion is enforced by Firecrawl (409 on concurrent savers).
 */

import Firecrawl from '@mendable/firecrawl-js';
import { logger } from '../../../../utils/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FirecrawlSignInSession {
  /** Firecrawl browser session ID — used to complete or cancel the session. */
  readonly sessionId: string;
  /** Embeddable URL where the user can interact with the browser session. */
  readonly interactiveLiveViewUrl: string;
  /** Read-only live view URL for debugging/monitoring. */
  readonly liveViewUrl: string;
  /** The persistent profile name tied to this session. */
  readonly profileName: string;
}

export interface FirecrawlProfileStatus {
  /** Whether the profile's session is still authenticated. */
  readonly authenticated: boolean;
  /** Page title returned by the probe scrape. */
  readonly pageTitle: string;
  /** The URL the browser ended up on (detects login redirects). */
  readonly finalUrl: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Session TTL: 5 minutes is plenty for a login flow. */
const SESSION_TTL_SECONDS = 300;

/**
 * Patterns that indicate the browser landed on a login/auth page
 * rather than an authenticated dashboard. Used to detect expired profiles.
 */
const LOGIN_PAGE_INDICATORS = [
  'log in',
  'login',
  'sign in',
  'signin',
  'sign up',
  'create account',
  'forgot password',
  'enter your password',
  'two-factor',
  'verification code',
] as const;

// ─── Service ────────────────────────────────────────────────────────────────

export class FirecrawlProfileService {
  private readonly client: Firecrawl;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env['FIRECRAWL_API_KEY'];
    if (!key) {
      throw new Error(
        'FIRECRAWL_API_KEY is required. Set it in environment variables or pass it to the constructor.'
      );
    }
    this.client = new Firecrawl({ apiKey: key });
  }

  // ─── Profile Name Generation ──────────────────────────────────────────

  /**
   * Generate a deterministic Firecrawl profile name for a user + platform.
   * Format: `nxt1_{env}_{userId}_{platform}`
   *
   * The name is capped at 128 characters (Firecrawl limit).
   */
  generateProfileName(userId: string, platform: string): string {
    const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'stg';
    const name = `nxt1_${env}_${userId}_${platform}`;
    return name.slice(0, 128);
  }

  // ─── Sign-In Session Management ───────────────────────────────────────

  /**
   * Start an interactive browser session for a user to sign in to a platform.
   *
   * 1. Creates a Firecrawl browser session with a persistent profile.
   * 2. Navigates the browser to the platform's login URL.
   * 3. Returns the `interactiveLiveViewUrl` for the frontend to embed.
   *
   * @param userId - The authenticated NXT1 user ID.
   * @param platform - Platform identifier (e.g., 'hudl_signin', 'twitter_signin').
   * @param loginUrl - The platform's login page URL.
   * @returns Session details including the embeddable interactive URL.
   */
  async startSignInSession(
    userId: string,
    platform: string,
    loginUrl: string,
    isMobile = false
  ): Promise<FirecrawlSignInSession> {
    const profileName = this.generateProfileName(userId, platform);

    logger.info('[FirecrawlProfile] Starting sign-in session', {
      userId,
      platform,
      profileName,
      loginUrl,
    });

    // Create a browser session with the persistent profile.
    // Firecrawl will restore previously saved cookies/localStorage if the profile exists.
    const browserResult = await this.client.browser({
      ttl: SESSION_TTL_SECONDS,
      streamWebView: true,
      profile: {
        name: profileName,
        saveChanges: true,
      },
    });

    if (!browserResult.success || !browserResult.id) {
      throw new Error(
        `Firecrawl failed to create browser session: ${browserResult.error ?? 'Unknown error'}`
      );
    }

    const sessionId = browserResult.id;

    // ── Mobile viewport resize (per Firecrawl Support guidance) ─────────
    // The interactive live-view stream defaults to a desktop-sized VNC canvas.
    // To get a true mobile stream we MUST resize the viewport in a **separate,
    // first** browserExecute call *before* navigating. This gives Firecrawl's
    // streaming infrastructure time to resize the VNC canvas to the new
    // dimensions. The subsequent navigation call then loads the page into the
    // already-mobile-sized stream so it fills the iframe edge-to-edge.
    //
    // Reference: https://docs.firecrawl.dev/features/interact
    // "Use the code parameter on your first interact call to set the viewport…
    //  The interactiveLiveViewUrl stream will reflect the new size."
    if (isMobile) {
      const mobileUA =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
        'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

      await this.client.browserExecute(sessionId, {
        code: [
          // Resize the VNC stream to iPhone 15 Pro dimensions
          `await page.setViewportSize({ width: 393, height: 852 });`,
          // Set mobile User-Agent so the server responds with its mobile layout
          `await page.context().setExtraHTTPHeaders({ 'User-Agent': ${JSON.stringify(mobileUA)} });`,
        ].join('\n'),
        language: 'node',
        timeout: 10,
      });

      logger.info('[FirecrawlProfile] Mobile viewport applied', {
        sessionId,
        viewport: '393x852',
      });
    }

    // ── Navigate to the login page ──────────────────────────────────────
    // This is either the second call (mobile, after resize) or the first
    // call (desktop). The Playwright `page` object persists across calls
    // within the same session, so the viewport/UA set above carry over.
    await this.client.browserExecute(sessionId, {
      code: `await page.goto(${JSON.stringify(loginUrl)}, { waitUntil: "domcontentloaded" });`,
      language: 'node',
      timeout: 30,
    });

    const interactiveLiveViewUrl = browserResult.interactiveLiveViewUrl ?? '';
    const liveViewUrl = browserResult.liveViewUrl ?? '';

    if (!interactiveLiveViewUrl) {
      // Clean up the session since we can't present it to the user
      try {
        await this.client.deleteBrowser(sessionId);
      } catch {
        // Best-effort cleanup
      }
      throw new Error(
        'Firecrawl did not return an interactive live view URL. Cannot proceed with sign-in.'
      );
    }

    logger.info('[FirecrawlProfile] Sign-in session started', {
      userId,
      platform,
      profileName,
      sessionId,
      hasLiveView: !!liveViewUrl,
      hasInteractiveLiveView: !!interactiveLiveViewUrl,
    });

    return {
      sessionId,
      interactiveLiveViewUrl,
      liveViewUrl,
      profileName,
    };
  }

  /**
   * Complete a sign-in session by deleting the Firecrawl browser session.
   * When `saveChanges: true` was set, deleting the session triggers Firecrawl
   * to persist the browser state (cookies, localStorage) to the profile.
   *
   * @param sessionId - The browser session ID from `startSignInSession`.
   */
  async completeSignInSession(sessionId: string): Promise<void> {
    logger.info('[FirecrawlProfile] Completing sign-in session', { sessionId });

    await this.client.deleteBrowser(sessionId);

    logger.info('[FirecrawlProfile] Sign-in session saved', { sessionId });
  }

  /**
   * Probe whether a persistent profile is still authenticated by doing a
   * quick headless scrape of a known authenticated URL. If the page redirects
   * to a login form, the session has expired.
   *
   * @param userId - The NXT1 user ID.
   * @param platform - Platform identifier.
   * @param checkUrl - A URL that requires authentication (e.g., dashboard).
   * @returns Profile status indicating if the session is still valid.
   */
  async probeProfileStatus(
    userId: string,
    platform: string,
    checkUrl: string
  ): Promise<FirecrawlProfileStatus> {
    const profileName = this.generateProfileName(userId, platform);

    logger.info('[FirecrawlProfile] Probing profile status', {
      userId,
      platform,
      profileName,
      checkUrl,
    });

    const result = await this.client.scrape(checkUrl, {
      formats: ['markdown'],
      timeout: 15_000,
      profile: {
        name: profileName,
        saveChanges: false, // Read-only probe — don't lock the profile
      },
    } as Record<string, unknown>);

    const markdown = (result.markdown ?? '').toLowerCase();
    const title = result.metadata?.title ?? '';
    const finalUrl = ((result.metadata as Record<string, unknown>)?.['url'] as string) ?? checkUrl;

    // Check if the page looks like a login form
    const isLoginPage = LOGIN_PAGE_INDICATORS.some(
      (indicator) => markdown.includes(indicator) || title.toLowerCase().includes(indicator)
    );

    logger.info('[FirecrawlProfile] Profile probe complete', {
      profileName,
      authenticated: !isLoginPage,
      title,
      finalUrl,
    });

    return {
      authenticated: !isLoginPage,
      pageTitle: title,
      finalUrl,
    };
  }
}
