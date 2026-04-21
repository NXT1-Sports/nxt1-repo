/**
 * @fileoverview Firecrawl Persistent Profile Service
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Manages persistent browser profiles for the Connected Accounts "Sign In" flow.
 * Uses Firecrawl profiles to save authenticated browser sessions so Agent X can
 * reuse them for autonomous background tasks without re-authentication.
 */

import Firecrawl from '@mendable/firecrawl-js';
import type { ScrapeExecuteResponse } from '@mendable/firecrawl-js';
import { logger } from '../../../../utils/logger.js';

export interface FirecrawlSignInSession {
  readonly sessionId: string;
  readonly interactiveLiveViewUrl: string;
  readonly liveViewUrl: string;
  readonly profileName: string;
}

export interface FirecrawlProfileStatus {
  readonly authenticated: boolean;
  readonly pageTitle: string;
  readonly finalUrl: string;
}

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

  generateProfileName(userId: string, platform: string): string {
    const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'stg';
    const name = `nxt1_${env}_${userId}_${platform}`;
    return name.slice(0, 128);
  }

  private async stopInteractiveSession(sessionId: string): Promise<void> {
    await this.client.stopInteraction(sessionId);
  }

  private buildMobileLayoutCommand(): string {
    return [
      `const style = document.createElement('style');`,
      `style.textContent = 'html, body { width: 393px !important; min-width: 393px !important; margin: 0 auto !important; zoom: 3.2 !important; overflow-x: hidden !important; background-color: #000; }';`,
      `document.documentElement.appendChild(style);`,
      `return 'mobile-layout-applied';`,
    ].join('\n');
  }

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
      isMobile,
    });

    const scrapeResult = await this.client.scrape(loginUrl, {
      profile: {
        name: profileName,
        saveChanges: true,
      },
    } as Record<string, unknown>);

    const sessionId = scrapeResult.metadata?.scrapeId;
    if (!sessionId) {
      throw new Error('Firecrawl scrape did not return a scrapeId. Cannot proceed with sign-in.');
    }

    const initResult: ScrapeExecuteResponse = isMobile
      ? await this.client.interact(sessionId, {
          code: this.buildMobileLayoutCommand(),
        })
      : await this.client.interact(sessionId, {
          // Send a fast no-op script instead of an LLM prompt to acquire the session URL instantly
          code: `return 'desktop-session-initialized';`,
        });

    if (isMobile) {
      logger.info('[FirecrawlProfile] Mobile inverted CSS scale applied', { sessionId });
    }

    const interactiveLiveViewUrl = initResult.interactiveLiveViewUrl ?? '';
    const liveViewUrl = initResult.liveViewUrl ?? '';

    if (!interactiveLiveViewUrl) {
      try {
        await this.stopInteractiveSession(sessionId);
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

  async completeSignInSession(sessionId: string): Promise<void> {
    logger.info('[FirecrawlProfile] Completing sign-in session', { sessionId });

    await this.stopInteractiveSession(sessionId);

    logger.info('[FirecrawlProfile] Sign-in session saved', { sessionId });
  }

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
        saveChanges: false,
      },
    } as Record<string, unknown>);

    const markdown = (result.markdown ?? '').toLowerCase();
    const title = result.metadata?.title ?? '';
    const finalUrl = ((result.metadata as Record<string, unknown>)?.['url'] as string) ?? checkUrl;
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
