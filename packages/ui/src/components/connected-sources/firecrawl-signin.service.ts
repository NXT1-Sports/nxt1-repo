/**
 * @fileoverview Firecrawl Sign-In Service
 * @module @nxt1/ui/components/connected-sources
 * @version 1.0.0
 *
 * Frontend service orchestrating the Firecrawl Persistent Profile sign-in flow.
 * When a user wants to "Sign In" to a third-party platform (Hudl, X, MaxPreps),
 * this service:
 *
 * 1. Calls the backend to start a Firecrawl interactive browser session.
 * 2. Opens a modal/overlay with the embedded interactive live view iframe.
 * 3. When the user completes login and clicks "Done", calls the backend
 *    to stop the session (saving the profile) and stores the reference.
 *
 * ⭐ WEB ONLY — Uses NxtOverlayService (not available on mobile) ⭐
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AGENT_X_API_BASE_URL } from '../../agent-x/agent-x-job.service';
import { NxtLoggingService } from '../../services/logging';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtToastService } from '../../services/toast';
import { NxtOverlayService } from '../overlay/overlay.service';
import { FirecrawlSignInModalComponent } from './firecrawl-signin-modal.component';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FirecrawlSignInRequest {
  readonly platform: string;
  readonly label: string;
  readonly loginUrl: string;
}

interface StartSessionResponse {
  readonly success: boolean;
  readonly error?: string;
  readonly data?: {
    readonly sessionId: string;
    readonly interactiveLiveViewUrl: string;
    readonly liveViewUrl: string;
    readonly profileName: string;
  };
}

interface CompleteSessionResponse {
  readonly success: boolean;
  readonly error?: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class FirecrawlSignInService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;
  private readonly overlay = inject(NxtOverlayService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('FirecrawlSignInService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  // ─── State ──────────────────────────────────────────────────────────────

  private readonly _loading = signal(false);
  private readonly _activePlatform = signal<string | null>(null);

  readonly loading = computed(() => this._loading());
  readonly activePlatform = computed(() => this._activePlatform());

  // ─── Main Flow ──────────────────────────────────────────────────────────

  /**
   * Launch the full Firecrawl sign-in flow for a platform:
   * 1. Call backend to start interactive session
   * 2. Open overlay with embedded browser iframe
   * 3. Wait for user to complete login and click "Done"
   * 4. Call backend to stop session and save profile
   *
   * @returns true if the sign-in was completed successfully
   */
  async launchSignIn(request: FirecrawlSignInRequest): Promise<boolean> {
    this._loading.set(true);
    this._activePlatform.set(request.platform);
    this.logger.info('Starting Firecrawl sign-in', {
      platform: request.platform,
      label: request.label,
    });
    this.breadcrumb.trackStateChange('firecrawl-signin:starting', {
      platform: request.platform,
    });

    try {
      // Step 1: Start the interactive browser session on the backend
      const session = await this.startSession(request.platform);
      if (!session) {
        this._loading.set(false);
        this._activePlatform.set(null);
        return false;
      }

      this._loading.set(false);

      // Step 2: Show the interactive browser modal
      const completed = await this.showInteractiveModal(
        request.label,
        session.interactiveLiveViewUrl
      );

      if (!completed) {
        this.logger.info('User cancelled Firecrawl sign-in', {
          platform: request.platform,
        });
        // Best-effort cleanup — release the browser session so it doesn't leak until TTL
        this.cancelSession(session.sessionId).catch(() => {});
        this._activePlatform.set(null);
        return false;
      }

      // Step 3: Complete the session (save profile + store in DB)
      this._loading.set(true);
      const success = await this.completeSession(
        session.sessionId,
        request.platform,
        session.profileName
      );

      if (success) {
        this.toast.success(`${request.label} connected successfully`);
        this.analytics?.trackEvent(APP_EVENTS.LINK_SOURCE_CONNECTED, {
          source_platform: request.platform,
          mode: 'signin',
          method: 'firecrawl',
          status: 'success',
        });
        this.breadcrumb.trackStateChange('firecrawl-signin:completed', {
          platform: request.platform,
        });
      }

      return success;
    } catch (err) {
      this.logger.error('Firecrawl sign-in failed', err, {
        platform: request.platform,
      });
      this.toast.error(`Failed to connect ${request.label}. Please try again.`);
      return false;
    } finally {
      this._loading.set(false);
      this._activePlatform.set(null);
    }
  }

  // ─── Backend API Calls ────────────────────────────────────────────────

  private async startSession(platform: string): Promise<StartSessionResponse['data'] | null> {
    try {
      const response = await firstValueFrom(
        this.http.post<StartSessionResponse>(`${this.baseUrl}/firecrawl/session/start`, {
          platform,
        })
      );

      if (!response.success || !response.data) {
        const errorMsg = response.error ?? 'Failed to start session';
        this.logger.error('Backend rejected session start', undefined, {
          platform,
          error: errorMsg,
        });

        if (errorMsg.includes('Another session')) {
          this.toast.warning(
            'Another sign-in session is active. Please wait a moment and try again.'
          );
        } else {
          this.toast.error(errorMsg);
        }
        return null;
      }

      this.logger.info('Firecrawl session started', {
        platform,
        sessionId: response.data.sessionId,
      });
      return response.data;
    } catch (err: unknown) {
      this.logger.error('Failed to start Firecrawl session', err, { platform });

      // Extract error message from HTTP error response body when available
      const httpError = err as { error?: { error?: string }; status?: number };
      const serverMsg = httpError?.error?.error;

      if (httpError?.status === 429 || serverMsg?.includes('Too many')) {
        this.toast.warning('Too many active sessions. Please wait a moment and try again.');
      } else if (httpError?.status === 409 || serverMsg?.includes('Another session')) {
        this.toast.warning(
          'Another sign-in session is active. Please wait a moment and try again.'
        );
      } else {
        this.toast.error(serverMsg ?? 'Unable to start sign-in session. Please try again.');
      }
      return null;
    }
  }

  private async completeSession(
    sessionId: string,
    platform: string,
    profileName: string
  ): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.post<CompleteSessionResponse>(`${this.baseUrl}/firecrawl/session/complete`, {
          sessionId,
          platform,
          profileName,
        })
      );

      if (!response.success) {
        this.logger.error('Backend rejected session complete', undefined, {
          sessionId,
          platform,
          error: response.error,
        });
        return false;
      }

      return true;
    } catch (err) {
      this.logger.error('Failed to complete Firecrawl session', err, {
        sessionId,
        platform,
      });
      return false;
    }
  }

  /**
   * Best-effort cancel — tells the backend to destroy the browser session
   * without saving the profile. Fire-and-forget; errors are swallowed.
   */
  private async cancelSession(sessionId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post<{ success: boolean }>(`${this.baseUrl}/firecrawl/session/cancel`, {
          sessionId,
        })
      );
      this.logger.info('Firecrawl session cancelled', { sessionId });
    } catch {
      // Best-effort — session will expire via TTL anyway
    }
  }

  // ─── Modal ────────────────────────────────────────────────────────────

  private async showInteractiveModal(
    platformLabel: string,
    interactiveLiveViewUrl: string
  ): Promise<boolean> {
    const ref = this.overlay.open<FirecrawlSignInModalComponent, { completed: boolean }>({
      component: FirecrawlSignInModalComponent,
      inputs: {
        platformLabel,
        interactiveLiveViewUrl,
      },
      size: 'full',
      backdropDismiss: false,
      escDismiss: false,
      showCloseButton: false,
      ariaLabel: `Sign in to ${platformLabel}`,
      panelClass: 'nxt1-firecrawl-signin-overlay',
    });

    const result = await ref.closed;
    return result.data?.completed ?? false;
  }
}
