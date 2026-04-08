/**
 * @fileoverview Live View Session Service
 * @module @nxt1/ui/agent-x
 *
 * Frontend orchestration service for the Agent X desktop live-view panel.
 * Owns the lifecycle of interactive browser sessions:
 *
 * 1. Start a session via backend API (returns LiveViewSession contract)
 * 2. Navigate within an active session
 * 3. Refresh the current page
 * 4. Close and clean up
 *
 * Separated from the shell component to keep the shell thin and testable.
 * The shell component binds to signals from this service.
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { LiveViewSession } from '@nxt1/core';
import { AGENT_X_ENDPOINTS } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';
import { AGENT_X_API_BASE_URL } from './agent-x-job.service';
import { NxtLoggingService } from '../services/logging';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { PERFORMANCE_ADAPTER } from '../services/performance';
import { NxtToastService } from '../services/toast';

// ─── Types ──────────────────────────────────────────────────────────────────

interface LiveViewApiResponse<T = LiveViewSession> {
  readonly success: boolean;
  readonly error?: string;
  readonly data?: T;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class LiveViewSessionService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('LiveViewSessionService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PERFORMANCE_ADAPTER, { optional: true });

  // ─── State ──────────────────────────────────────────────────────────────

  private readonly _activeSession = signal<LiveViewSession | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  /** The currently active live-view session, or null. */
  readonly activeSession = computed(() => this._activeSession());
  /** Whether a session operation (start/navigate/refresh) is in progress. */
  readonly loading = computed(() => this._loading());
  /** Last error message from a session operation. */
  readonly error = computed(() => this._error());
  /** Whether any session is currently active. */
  readonly hasActiveSession = computed(() => this._activeSession() !== null);

  /**
   * Externally signal that a live-view session is being prepared (e.g. the
   * backend tool has started but hasn't returned a session yet). The header
   * button observes `loading()` to show a spinner.
   */
  setLoading(value: boolean): void {
    this._loading.set(value);
  }

  // ─── Session Lifecycle ────────────────────────────────────────────────

  /**
   * Start a new live-view session.
   *
   * @param url - The destination URL to open.
   * @param platformKey - Optional platform hint to skip domain matching.
   * @returns The LiveViewSession contract on success, or null on failure.
   */
  async startSession(url: string, platformKey?: string): Promise<LiveViewSession | null> {
    this._loading.set(true);
    this._error.set(null);
    this.logger.info('Starting live view session', { url, platformKey });
    this.breadcrumb.trackStateChange('live-view: starting', { url, platformKey });

    const trace = await this.performance?.startTrace(TRACE_NAMES.LIVE_VIEW_SESSION_START);
    await trace?.putAttribute(ATTRIBUTE_NAMES.FEATURE_NAME, 'live-view');

    try {
      const response = await firstValueFrom(
        this.http.post<LiveViewApiResponse>(
          `${this.apiBaseUrl}${AGENT_X_ENDPOINTS.LIVE_VIEW_START}`,
          { url, ...(platformKey ? { platformKey } : {}) }
        )
      );

      if (!response.success || !response.data) {
        const errorMsg = response.error ?? 'Failed to start live view';
        this.logger.error('Backend rejected live view start', undefined, { url, error: errorMsg });
        this.handleError(errorMsg);
        await trace?.putAttribute('success', 'false');
        return null;
      }

      const session = response.data;
      this._activeSession.set(session);

      this.logger.info('Live view session started', {
        sessionId: session.sessionId,
        tier: session.destinationTier,
        authStatus: session.authStatus,
        domainLabel: session.domainLabel,
      });

      await trace?.putAttribute('success', 'true');
      await trace?.putAttribute('tier', session.destinationTier);
      await trace?.putAttribute('auth_status', session.authStatus);

      this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_SESSION_STARTED, {
        destination_tier: session.destinationTier,
        auth_status: session.authStatus,
        platform_key: session.platformKey ?? 'none',
        domain: session.domainLabel,
      });

      if (session.authStatus === 'authenticated') {
        this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_AUTH_REUSED, {
          platform_key: session.platformKey ?? 'none',
        });
      } else if (session.authStatus === 'expired') {
        this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_AUTH_EXPIRED, {
          platform_key: session.platformKey ?? 'none',
        });
        this.toast.warning('Your saved login has expired. You may need to reconnect this account.');
      }

      this.breadcrumb.trackStateChange('live-view: started', {
        sessionId: session.sessionId,
        tier: session.destinationTier,
      });

      return session;
    } catch (err) {
      // Extract a user-friendly message from HttpErrorResponse or plain Error
      const httpErr = err as { error?: { error?: string | { message?: string } }; status?: number };
      const serverMsg =
        typeof httpErr?.error?.error === 'string'
          ? httpErr.error.error
          : (httpErr?.error?.error as { message?: string })?.message;
      const message =
        httpErr?.status === 408
          ? 'Live view is taking too long to start. Please try again.'
          : (serverMsg ?? (err instanceof Error ? err.message : 'Failed to start live view'));
      this.logger.error('Live view start failed', { error: err }, { url });
      this.handleError(message);
      this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_SESSION_FAILED, {
        url,
        error: message,
      });
      await trace?.putAttribute('success', 'false');
      return null;
    } finally {
      this._loading.set(false);
      await trace?.stop();
    }
  }

  /**
   * Navigate the active session to a new URL.
   */
  async navigate(url: string): Promise<boolean> {
    const session = this._activeSession();
    if (!session) {
      this.logger.warn('Cannot navigate — no active session');
      return false;
    }

    this._loading.set(true);
    this._error.set(null);
    this.logger.info('Navigating live view', { sessionId: session.sessionId, url });

    const trace = await this.performance?.startTrace(TRACE_NAMES.LIVE_VIEW_NAVIGATE);

    try {
      const response = await firstValueFrom(
        this.http.post<LiveViewApiResponse<{ resolvedUrl: string }>>(
          `${this.apiBaseUrl}${AGENT_X_ENDPOINTS.LIVE_VIEW_NAVIGATE}`,
          { sessionId: session.sessionId, url }
        )
      );

      if (!response.success) {
        this.handleError(response.error ?? 'Navigation failed');
        return false;
      }

      this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_NAVIGATED, {
        session_id: session.sessionId,
        url,
      });
      await trace?.putAttribute('success', 'true');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Navigation failed';
      this.logger.error('Live view navigation failed', err, { sessionId: session.sessionId, url });

      // Session expired or not found — clean up local state
      if (message.includes('not found') || message.includes('expired')) {
        this._activeSession.set(null);
        this.toast.warning('Live view session has expired. Please start a new one.');
      } else {
        this.handleError(message);
      }

      await trace?.putAttribute('success', 'false');
      return false;
    } finally {
      this._loading.set(false);
      await trace?.stop();
    }
  }

  /**
   * Refresh the current page in the active session.
   */
  async refresh(): Promise<boolean> {
    const session = this._activeSession();
    if (!session) return false;

    this.logger.info('Refreshing live view', { sessionId: session.sessionId });

    const trace = await this.performance?.startTrace(TRACE_NAMES.LIVE_VIEW_REFRESH);

    try {
      const response = await firstValueFrom(
        this.http.post<LiveViewApiResponse<void>>(
          `${this.apiBaseUrl}${AGENT_X_ENDPOINTS.LIVE_VIEW_REFRESH}`,
          { sessionId: session.sessionId }
        )
      );

      if (!response.success) {
        this.handleError(response.error ?? 'Refresh failed');
        return false;
      }

      this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_REFRESHED, {
        session_id: session.sessionId,
      });
      await trace?.putAttribute('success', 'true');
      return true;
    } catch (err) {
      this.logger.error('Live view refresh failed', err, { sessionId: session.sessionId });
      await trace?.putAttribute('success', 'false');
      return false;
    } finally {
      await trace?.stop();
    }
  }

  /**
   * Close the active session and clean up backend resources.
   */
  async closeSession(): Promise<void> {
    const session = this._activeSession();
    if (!session) return;

    this.logger.info('Closing live view session', { sessionId: session.sessionId });
    this.breadcrumb.trackStateChange('live-view: closing', { sessionId: session.sessionId });

    const trace = await this.performance?.startTrace(TRACE_NAMES.LIVE_VIEW_SESSION_CLOSE);

    // Clear local state immediately (optimistic)
    this._activeSession.set(null);
    this._error.set(null);

    try {
      await firstValueFrom(
        this.http.post<LiveViewApiResponse<void>>(
          `${this.apiBaseUrl}${AGENT_X_ENDPOINTS.LIVE_VIEW_CLOSE}`,
          { sessionId: session.sessionId }
        )
      );

      this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_SESSION_CLOSED, {
        session_id: session.sessionId,
        destination_tier: session.destinationTier,
      });

      this.logger.info('Live view session closed', { sessionId: session.sessionId });
      await trace?.putAttribute('success', 'true');
    } catch (err) {
      // Best-effort — session is already cleared locally
      this.logger.warn('Live view close error (best-effort)', {
        sessionId: session.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      await trace?.putAttribute('success', 'false');
    } finally {
      await trace?.stop();
    }
  }

  /**
   * Open a session from a backend-provided `LiveViewSession` contract
   * (used when auto-open instructions arrive via SSE).
   */
  adoptSession(session: LiveViewSession): void {
    this._activeSession.set(session);
    this._loading.set(false);
    this._error.set(null);
    this.logger.info('Adopted live view session from backend', {
      sessionId: session.sessionId,
      tier: session.destinationTier,
    });
    this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_AUTO_OPENED, {
      session_id: session.sessionId,
      destination_tier: session.destinationTier,
      platform_key: session.platformKey ?? 'none',
    });
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private handleError(message: string): void {
    this._error.set(message);
    if (message.includes('Another session') || message.includes('active')) {
      this.toast.warning('Another session is currently active. Please try again shortly.');
    } else if (message.includes('Too many') || message.includes('429')) {
      this.toast.warning('Too many active sessions. Please wait a moment.');
    } else {
      this.toast.error(message);
    }
  }
}
