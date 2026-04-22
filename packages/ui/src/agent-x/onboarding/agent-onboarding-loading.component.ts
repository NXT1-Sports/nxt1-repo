/**
 * @fileoverview Agent Onboarding Loading Step
 * @module @nxt1/ui/agent-x/onboarding
 * @version 1.0.0
 *
 * Sleek loading/boot-up animation shown after onboarding is complete.
 * Sequential messages with progress bar, then transitions to Agent X shell.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  output,
  input,
  effect,
  OnInit,
  OnDestroy,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AGENT_LOADING_MESSAGES, AGENT_LOADING_MESSAGE_INTERVAL } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../components/icon/icon.component';
import { AgentOnboardingOrbComponent } from './agent-onboarding-orb.component';

@Component({
  selector: 'nxt1-agent-onboarding-loading',
  standalone: true,
  imports: [NxtIconComponent, AgentOnboardingOrbComponent],
  template: `
    <section class="loading-container" [attr.data-testid]="testIds.LOADING_STEP">
      <div class="loading-panel">
        <div class="loading-visual">
          <nxt1-agent-onboarding-orb class="loading-orb" size="lg" />

          @if (isComplete()) {
            <div class="completion-badge">
              <nxt1-icon
                name="checkmark"
                [size]="28"
                className="completion-icon completion-icon--done"
              />
            </div>
          }
        </div>

        <div class="loading-copy">
          <p
            class="loading-message"
            [class.loading-message--done]="isComplete()"
            [attr.data-testid]="testIds.LOADING_MESSAGE"
          >
            {{ currentMessage() }}
          </p>

          <p class="loading-caption" [class.loading-caption--waiting]="isWaitingForReady()">
            @if (isComplete()) {
              Your Agent X command center is ready.
            } @else if (isWaitingForReady()) {
              Wrapping up your first personalized update.
            } @else {
              Building a personalized starting point from your profile and activity.
            }
          </p>
        </div>

        <div class="progress-track" [attr.data-testid]="testIds.LOADING_PROGRESS">
          <div class="progress-fill" [style.width.%]="progressPercent()"></div>
        </div>

        <div class="step-dots">
          @for (msg of messages; track $index) {
            <div
              class="step-dot"
              [class.step-dot--active]="$index <= currentIndex()"
              [class.step-dot--current]="$index === currentIndex()"
            ></div>
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;

        --_loading-panel-gap: var(--nxt1-spacing-6);
        --_loading-copy-gap: var(--nxt1-spacing-2);
        --_loading-progress-width: min(100%, 22rem);
        --_loading-dot-size: var(--nxt1-spacing-2);
        --_loading-dot-active-width: var(--nxt1-spacing-5);
      }

      .loading-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100%;
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-6);
      }

      .loading-panel {
        width: min(100%, 32rem);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--_loading-panel-gap);
        text-align: center;
      }

      .loading-visual {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 11rem;
      }

      .loading-orb {
        transform: scale(1.18);
        transform-origin: center;
      }

      .completion-badge {
        position: absolute;
        right: calc(50% - var(--nxt1-spacing-6));
        bottom: calc(var(--nxt1-spacing-2) * -1);
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-12);
        border-radius: var(--nxt1-borderRadius-full);
        border: 2px solid var(--nxt1-color-bg-primary);
        background: var(--nxt1-color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--nxt1-glow-sm);
      }

      .completion-icon {
        color: var(--nxt1-color-bg-primary);
      }

      .completion-icon--done {
        animation: scale-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .loading-copy {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--_loading-copy-gap);
      }

      @keyframes scale-pop {
        0% {
          transform: scale(0);
        }
        70% {
          transform: scale(1.2);
        }
        100% {
          transform: scale(1);
        }
      }

      .loading-message {
        max-width: 30rem;
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
        letter-spacing: var(--nxt1-letterSpacing-tight);
        color: var(--nxt1-color-text-primary);
        text-wrap: balance;
        transition:
          color var(--nxt1-duration-normal) var(--nxt1-easing-inOut),
          transform var(--nxt1-duration-normal) var(--nxt1-easing-inOut);
      }

      .loading-message--done {
        color: var(--nxt1-color-primary);
        transform: translateY(calc(var(--nxt1-spacing-1) * -1));
      }

      .loading-caption {
        max-width: 26rem;
        margin: 0;
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-snug);
        color: var(--nxt1-color-text-tertiary);
        text-wrap: pretty;
        transition: color var(--nxt1-duration-normal) var(--nxt1-easing-inOut);
      }

      .loading-caption--waiting {
        color: var(--nxt1-color-text-secondary);
      }

      .progress-track {
        width: var(--_loading-progress-width);
        height: var(--nxt1-spacing-1);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-200);
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        border-radius: inherit;
        background: var(--nxt1-color-primary);
        box-shadow: var(--nxt1-glow-sm);
        transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .step-dots {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .step-dot {
        width: var(--_loading-dot-size);
        height: var(--_loading-dot-size);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-200);
        transition:
          width var(--nxt1-duration-normal) var(--nxt1-easing-inOut),
          background-color var(--nxt1-duration-normal) var(--nxt1-easing-inOut);
      }

      .step-dot--active {
        background: var(--nxt1-color-primary);
      }

      .step-dot--current {
        width: var(--_loading-dot-active-width);
      }

      @media (max-width: 768px) {
        :host {
          --_loading-panel-gap: var(--nxt1-spacing-5);
          --_loading-dot-active-width: var(--nxt1-spacing-4);
        }

        .loading-container {
          padding: var(--nxt1-spacing-6) var(--nxt1-spacing-4);
        }

        .loading-visual {
          min-height: 9.5rem;
        }

        .loading-orb {
          transform: scale(1.06);
        }

        .loading-message {
          font-size: var(--nxt1-fontSize-lg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentOnboardingLoadingComponent implements OnInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly testIds = TEST_IDS.AGENT_ONBOARDING;
  protected readonly messages = AGENT_LOADING_MESSAGES;

  /** Allows a parent flow to block completion until async work is actually done. */
  readonly readyToComplete = input(true);

  /** Message shown while the animation is done but the async onboarding work is still running. */
  readonly waitingMessage = input('Finalizing your first personalized Agent X update...');

  /** Final message shown once the loader can complete. */
  readonly completionMessage = input('Agent X is ready.');

  /** Emitted when loading animation is complete */
  readonly loadingComplete = output<void>();

  // Internal state
  protected readonly currentIndex = signal(0);
  protected readonly isComplete = signal(false);
  protected readonly sequenceFinished = signal(false);
  protected readonly isWaitingForReady = computed(
    () => this.sequenceFinished() && !this.readyToComplete() && !this.isComplete()
  );

  protected readonly currentMessage = computed(() => {
    if (this.isComplete()) {
      return this.completionMessage();
    }

    if (this.isWaitingForReady()) {
      return this.waitingMessage();
    }

    return this.messages[this.currentIndex()] ?? this.messages[this.messages.length - 1];
  });

  protected readonly progressPercent = computed(() => {
    if (this.sequenceFinished()) {
      return 100;
    }

    return ((this.currentIndex() + 1) / this.messages.length) * 100;
  });

  private intervalRef?: ReturnType<typeof setInterval>;
  private completionTimeoutRef?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      if (this.sequenceFinished() && this.readyToComplete() && !this.isComplete()) {
        this.completeLoading();
      }
    });
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.intervalRef = setInterval(() => {
      const next = this.currentIndex() + 1;
      if (next < this.messages.length) {
        this.currentIndex.set(next);
      } else {
        this.clearInterval();
        this.sequenceFinished.set(true);
        if (this.readyToComplete()) {
          this.completeLoading();
        }
      }
    }, AGENT_LOADING_MESSAGE_INTERVAL);
  }

  ngOnDestroy(): void {
    this.clearInterval();
    this.clearCompletionTimeout();
  }

  private clearInterval(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = undefined;
    }
  }

  private clearCompletionTimeout(): void {
    if (this.completionTimeoutRef) {
      clearTimeout(this.completionTimeoutRef);
      this.completionTimeoutRef = undefined;
    }
  }

  private completeLoading(): void {
    if (this.isComplete()) return;

    this.isComplete.set(true);
    this.clearCompletionTimeout();
    this.completionTimeoutRef = setTimeout(() => this.loadingComplete.emit(), 800);
  }
}
