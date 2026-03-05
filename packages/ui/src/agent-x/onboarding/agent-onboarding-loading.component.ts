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
  OnInit,
  OnDestroy,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AGENT_LOADING_MESSAGES, AGENT_LOADING_MESSAGE_INTERVAL } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'nxt1-agent-onboarding-loading',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <section class="loading-container" [attr.data-testid]="testIds.LOADING_STEP">
      <!-- Animated core -->
      <div class="loading-core">
        <div class="core-ring core-ring--1"></div>
        <div class="core-ring core-ring--2"></div>
        <div class="core-ring core-ring--3"></div>
        <div class="core-center">
          @if (isComplete()) {
            <nxt1-icon name="checkmark" [size]="32" className="core-icon core-icon--done" />
          } @else {
            <nxt1-icon name="flash" [size]="32" className="core-icon" />
          }
        </div>
      </div>

      <!-- Message -->
      <p
        class="loading-message"
        [class.loading-message--done]="isComplete()"
        [attr.data-testid]="testIds.LOADING_MESSAGE"
      >
        {{ currentMessage() }}
      </p>

      <!-- Progress bar -->
      <div class="progress-track" [attr.data-testid]="testIds.LOADING_PROGRESS">
        <div class="progress-fill" [style.width.%]="progressPercent()"></div>
      </div>

      <!-- Step indicators -->
      <div class="step-dots">
        @for (msg of messages; track $index) {
          <div
            class="step-dot"
            [class.step-dot--active]="$index <= currentIndex()"
            [class.step-dot--current]="$index === currentIndex()"
          ></div>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 60vh;
        padding: var(--nxt1-spacing-xl) var(--nxt1-spacing-lg);
        text-align: center;
      }

      /* Animated core */
      .loading-core {
        position: relative;
        width: 140px;
        height: 140px;
        margin-bottom: var(--nxt1-spacing-xl);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .core-ring {
        position: absolute;
        border-radius: 50%;
        border: 2px solid transparent;
      }

      .core-ring--1 {
        width: 140px;
        height: 140px;
        border-top-color: var(--nxt1-color-primary);
        border-right-color: rgba(204, 255, 0, 0.3);
        animation: spin 2s linear infinite;
      }

      .core-ring--2 {
        width: 110px;
        height: 110px;
        border-bottom-color: var(--nxt1-color-primary);
        border-left-color: rgba(204, 255, 0, 0.2);
        animation: spin 1.5s linear infinite reverse;
      }

      .core-ring--3 {
        width: 80px;
        height: 80px;
        border-top-color: rgba(204, 255, 0, 0.5);
        animation: spin 3s linear infinite;
      }

      .core-center {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1;
        box-shadow: 0 0 40px rgba(204, 255, 0, 0.3);
      }

      .core-icon {
        color: var(--nxt1-color-bg-primary);
      }

      .core-icon--done {
        animation: scale-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
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

      /* Message */
      .loading-message {
        font-size: var(--nxt1-fontSize-lg, 18px);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-xl);
        min-height: 28px;
        transition: all 0.3s ease;
      }

      .loading-message--done {
        color: var(--nxt1-color-primary);
        font-weight: 700;
        font-size: var(--nxt1-fontSize-xl, 22px);
      }

      /* Progress bar */
      .progress-track {
        width: 100%;
        max-width: 320px;
        height: 4px;
        border-radius: 2px;
        background: var(--nxt1-color-surface-200);
        overflow: hidden;
        margin-bottom: var(--nxt1-spacing-lg);
      }

      .progress-fill {
        height: 100%;
        border-radius: 2px;
        background: var(--nxt1-color-primary);
        transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* Step dots */
      .step-dots {
        display: flex;
        gap: 8px;
      }

      .step-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-200);
        transition: all 0.3s ease;
      }

      .step-dot--active {
        background: var(--nxt1-color-primary);
      }

      .step-dot--current {
        width: 18px;
        border-radius: 3px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentOnboardingLoadingComponent implements OnInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly testIds = TEST_IDS.AGENT_ONBOARDING;
  protected readonly messages = AGENT_LOADING_MESSAGES;

  /** Emitted when loading animation is complete */
  readonly loadingComplete = output<void>();

  // Internal state
  protected readonly currentIndex = signal(0);
  protected readonly isComplete = signal(false);

  protected readonly currentMessage = computed(
    () => this.messages[this.currentIndex()] ?? this.messages[this.messages.length - 1]
  );

  protected readonly progressPercent = computed(
    () => ((this.currentIndex() + 1) / this.messages.length) * 100
  );

  private intervalRef?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.intervalRef = setInterval(() => {
      const next = this.currentIndex() + 1;
      if (next < this.messages.length) {
        this.currentIndex.set(next);
      } else {
        this.clearInterval();
        this.isComplete.set(true);
        // Wait a beat, then emit complete
        setTimeout(() => this.loadingComplete.emit(), 800);
      }
    }, AGENT_LOADING_MESSAGE_INTERVAL);
  }

  ngOnDestroy(): void {
    this.clearInterval();
  }

  private clearInterval(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = undefined;
    }
  }
}
