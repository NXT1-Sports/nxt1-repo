import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';
import { NxtOverlayService } from '@nxt1/ui/components/overlay';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { PerformanceService } from '../../../core/services/infrastructure/performance.service';
import { environment } from '../../../../environments/environment';
import {
  AgentXDesktopReviewPromptComponent,
  type AgentXDesktopReviewPromptCloseEvent,
} from '../components/agent-x-desktop-review-prompt.component';

const PROMPT_VERSION = 'agent-x-desktop-review-v1';
const PROMPT_DELAY_MS = 1800;
const PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const LOCAL_STORAGE_PREFIX = 'nxt1:agent-x:desktop-review';

let promptedThisSession = false;

export const __agentXDesktopReviewPromptServiceTestUtils = {
  resetSessionPromptState(): void {
    promptedThisSession = false;
  },
} as const;

interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

interface ReviewPromptState {
  readonly submittedAt?: string;
  readonly snoozedUntil?: string;
}

@Injectable({ providedIn: 'root' })
export class AgentXDesktopReviewPromptService {
  private readonly overlay = inject(NxtOverlayService);
  private readonly http = inject(HttpClient);
  private readonly platform = inject(NxtPlatformService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger = inject(NxtLoggingService).child('AgentXDesktopReviewPromptService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PerformanceService);

  async maybePrompt(
    user:
      | {
          readonly uid?: string;
          readonly hasCompletedOnboarding?: boolean;
        }
      | null
      | undefined
  ): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || promptedThisSession) {
      return;
    }

    if (!this.platform.isDesktop() || !user?.uid || !user.hasCompletedOnboarding) {
      return;
    }

    const storedState = this.readPromptState(user.uid);
    if (storedState?.submittedAt || this.isSnoozed(storedState)) {
      return;
    }

    promptedThisSession = true;
    this.logger.info('Scheduling desktop Agent X review prompt', {
      userId: user.uid,
      promptVersion: PROMPT_VERSION,
    });
    this.breadcrumb.trackStateChange('agent-x-desktop-review:scheduled', {
      promptVersion: PROMPT_VERSION,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, PROMPT_DELAY_MS));

    if (!this.platform.isDesktop() || this.overlay.isOpen()) {
      this.logger.info('Skipping desktop Agent X review prompt open', {
        userId: user.uid,
        promptVersion: PROMPT_VERSION,
        desktop: this.platform.isDesktop(),
        overlayOpen: this.overlay.isOpen(),
      });
      return;
    }

    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_DESKTOP_REVIEW_PROMPT_VIEWED, {
      promptVersion: PROMPT_VERSION,
      surface: 'desktop_web',
    });
    this.breadcrumb.trackStateChange('agent-x-desktop-review:opened', {
      promptVersion: PROMPT_VERSION,
      surface: 'desktop_web',
    });

    const ref = this.overlay.open<
      AgentXDesktopReviewPromptComponent,
      AgentXDesktopReviewPromptCloseEvent
    >({
      component: AgentXDesktopReviewPromptComponent,
      inputs: {
        submitReview: (rating: number, reviewText: string) =>
          this.submitReview(user.uid as string, rating, reviewText),
      },
      size: 'lg',
      maxWidth: '680px',
      showCloseButton: true,
      backdropDismiss: true,
      ariaLabel: 'Share a quick review of Agent X',
    });

    const result = await ref.closed;
    const outcome = result.data as AgentXDesktopReviewPromptCloseEvent | undefined;
    if (outcome?.action === 'submitted') {
      this.writePromptState(user.uid, { submittedAt: new Date().toISOString() });
      return;
    }

    const snoozedUntil = new Date(Date.now() + PROMPT_SNOOZE_MS).toISOString();
    this.writePromptState(user.uid, { snoozedUntil });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_DESKTOP_REVIEW_PROMPT_DISMISSED, {
      promptVersion: PROMPT_VERSION,
      surface: 'desktop_web',
      reason: outcome?.action ?? result.reason,
    });
    this.breadcrumb.trackStateChange('agent-x-desktop-review:dismissed', {
      promptVersion: PROMPT_VERSION,
      reason: outcome?.action ?? result.reason,
    });
  }

  private async submitReview(userId: string, rating: number, reviewText: string): Promise<void> {
    const normalizedText = reviewText.trim();

    try {
      await this.performance.trace(
        TRACE_NAMES.AGENT_X_DESKTOP_REVIEW_SUBMIT,
        async () => {
          const response = await firstValueFrom(
            this.http.post<ApiResponse<{ delivered: boolean }>>(
              `${environment.apiURL}/agent-x/reviews`,
              {
                rating,
                reviewText: normalizedText,
                promptVersion: PROMPT_VERSION,
                surface: 'desktop_web',
                pageUrl: window.location.href,
              }
            )
          );

          if (!response.success || response.data?.delivered !== true) {
            throw new Error(response.error ?? 'Review could not be delivered right now');
          }
        },
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'agent_x',
            surface: 'desktop_web',
            prompt_version: PROMPT_VERSION,
          },
          metrics: {
            review_length: normalizedText.length,
          },
        }
      );

      this.logger.info('Agent X desktop review submitted', {
        userId,
        rating,
        promptVersion: PROMPT_VERSION,
        textLength: normalizedText.length,
      });
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_DESKTOP_REVIEW_PROMPT_SUBMITTED, {
        rating,
        promptVersion: PROMPT_VERSION,
        surface: 'desktop_web',
        textLength: normalizedText.length,
      });
      this.breadcrumb.trackFormSubmit('agent-x-desktop-review', true, {
        rating,
        promptVersion: PROMPT_VERSION,
        textLength: normalizedText.length,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to send review');
      this.logger.error('Agent X desktop review submission failed', err, {
        userId,
        rating,
        promptVersion: PROMPT_VERSION,
        textLength: normalizedText.length,
      });
      this.breadcrumb.trackStateChange('agent-x-desktop-review:submission_failed', {
        rating,
        promptVersion: PROMPT_VERSION,
        textLength: normalizedText.length,
      });
      throw err;
    }
  }

  private readPromptState(userId: string): ReviewPromptState | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    try {
      const raw = localStorage.getItem(this.buildStorageKey(userId));
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as ReviewPromptState;
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }

  private writePromptState(userId: string, state: ReviewPromptState): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      localStorage.setItem(this.buildStorageKey(userId), JSON.stringify(state));
    } catch {
      // Non-blocking local prompt state only.
    }
  }

  private isSnoozed(state: ReviewPromptState | null): boolean {
    if (!state?.snoozedUntil) {
      return false;
    }

    const snoozedUntilMs = Date.parse(state.snoozedUntil);
    return Number.isFinite(snoozedUntilMs) && snoozedUntilMs > Date.now();
  }

  private buildStorageKey(userId: string): string {
    return `${LOCAL_STORAGE_PREFIX}:${PROMPT_VERSION}:${userId}`;
  }
}
