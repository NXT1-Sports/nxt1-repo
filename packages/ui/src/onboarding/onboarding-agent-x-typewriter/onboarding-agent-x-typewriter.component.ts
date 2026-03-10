/**
 * @fileoverview OnboardingAgentXTypewriterComponent
 * @module @nxt1/ui/onboarding
 * @version 1.0.0
 *
 * Displays an Agent X-branded typewriter message below the logo
 * during each onboarding step. Creates a guided, AI-host feel
 * without requiring free-text chat.
 *
 * Features:
 * - Character-by-character typewriter animation
 * - Blinking cursor during and after typing
 * - SSR-safe (renders full text on server)
 * - Auto-replays when message changes (step transitions)
 * - Accessible with aria-live for screen readers
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  signal,
  effect,
  inject,
  PLATFORM_ID,
  OnDestroy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '../../agent-x/fab/agent-x-logo.constants';

/** Typing speed in milliseconds per character */
const TYPING_SPEED_MS = 28;

/** Cache of messages that have already been animated in this session */
const SEEN_TYPED_MESSAGES = new Set<string>();

@Component({
  selector: 'nxt1-onboarding-agent-x-typewriter',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="nxt1-agent-x-typewriter"
      [class.nxt1-agent-x-typewriter--left]="alignment() === 'left'"
      data-testid="agent-x-typewriter"
      role="status"
      aria-live="polite"
    >
      <div class="nxt1-agent-x-label-row">
        @if (showLogo()) {
          <svg
            class="nxt1-agent-x-logo-icon"
            viewBox="0 0 612 792"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="10"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path [attr.d]="agentLogoPath" />
            <polygon [attr.points]="agentLogoPolygon" />
          </svg>
        }
        <span class="nxt1-agent-x-label">Agent X</span>
      </div>
      <span class="nxt1-agent-x-text">{{ displayedText() }}</span>
      <span class="nxt1-agent-x-cursor" [class.typing]="isTyping()">|</span>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .nxt1-agent-x-typewriter {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        margin-top: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-2, 8px) 0;
        text-align: center;
        min-height: 4.75rem;
        max-height: 4.75rem;
        overflow: hidden;
      }

      .nxt1-agent-x-typewriter--left {
        align-items: flex-start;
        text-align: left;
        max-height: none;
      }

      .nxt1-agent-x-label-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-agent-x-logo-icon {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .nxt1-agent-x-typewriter--left .nxt1-agent-x-logo-icon {
        width: 28px;
        height: 28px;
        color: var(--nxt1-color-text-primary, #000);
      }

      .nxt1-agent-x-typewriter--left .nxt1-agent-x-label {
        color: var(--nxt1-color-text-primary, #000);
      }

      .nxt1-agent-x-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .nxt1-agent-x-text {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: 400;
        line-height: 1.35;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        max-width: 340px;
        min-height: 3.1rem;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .nxt1-agent-x-typewriter--left .nxt1-agent-x-text {
        max-width: none;
        min-height: auto;
        display: block;
        -webkit-line-clamp: unset;
        -webkit-box-orient: unset;
        overflow: visible;
      }

      .nxt1-agent-x-cursor {
        display: inline;
        font-weight: 300;
        color: var(--nxt1-color-primary, #ccff00);
        animation: blink 0.8s step-end infinite;
      }

      .nxt1-agent-x-cursor.typing {
        animation: none;
        opacity: 1;
      }

      @keyframes blink {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingAgentXTypewriterComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  /** The full message to type out */
  readonly message = input.required<string>();

  /** Layout alignment — 'center' (default) or 'left' */
  readonly alignment = input<'center' | 'left'>('center');

  /** Whether to show the Agent X logo icon next to the label */
  readonly showLogo = input(false);

  /** Agent X logo SVG data */
  protected readonly agentLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentLogoPolygon = AGENT_X_LOGO_POLYGON;

  /** Currently displayed (partially typed) text */
  readonly displayedText = signal('');

  /** Whether the typewriter is actively typing */
  readonly isTyping = signal(false);

  /** Timer reference for cleanup */
  private typingTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // Browser: animate typewriter on each message change
      effect((onCleanup) => {
        const msg = this.message();
        this.renderMessage(msg);

        onCleanup(() => this.clearTimer());
      });
    } else {
      // SSR: show full text immediately (no animation)
      effect(() => {
        this.displayedText.set(this.message());
      });
    }
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  /** Render message with animate-once behavior */
  private renderMessage(text: string): void {
    if (!text?.trim()) {
      this.clearTimer();
      this.displayedText.set('');
      this.isTyping.set(false);
      return;
    }

    if (SEEN_TYPED_MESSAGES.has(text)) {
      this.clearTimer();
      this.displayedText.set(text);
      this.isTyping.set(false);
      return;
    }

    this.startTyping(text);
  }

  /**
   * Start the typewriter animation for a given message.
   */
  private startTyping(text: string): void {
    this.clearTimer();
    this.displayedText.set('');
    this.isTyping.set(true);

    let index = 0;

    this.typingTimer = setInterval(() => {
      if (index < text.length) {
        this.displayedText.set(text.slice(0, index + 1));
        index++;
      } else {
        SEEN_TYPED_MESSAGES.add(text);
        this.isTyping.set(false);
        this.clearTimer();
      }
    }, TYPING_SPEED_MS);
  }

  /** Clear the typing interval timer */
  private clearTimer(): void {
    if (this.typingTimer !== null) {
      clearInterval(this.typingTimer);
      this.typingTimer = null;
    }
  }
}
