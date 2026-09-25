/**
 * @fileoverview Agent X Extended Thinking Component
 *
 * Renders the extended thinking tokens emitted by Claude 3.7+ / Gemini 2.5
 * as a collapsible block beneath the assistant message bubble. The block
 * auto-opens the instant streaming starts (pinned to the latest tokens) and
 * auto-collapses the instant streaming finishes, so the transcript stays
 * clean once the model has settled on its answer. The user can still toggle
 * it manually at any time.
 *
 * The component is rendered by `NxtChatBubbleComponent` for
 * `AgentXMessagePart` entries whose `type === 'thinking'`.
 */

import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  input,
  signal,
  computed,
  inject,
  effect,
  viewChild,
} from '@angular/core';
import { HapticsService } from '../../../services/haptics/haptics.service';

/**
 * Pure auto-open/auto-close transition rule, extracted so it's unit-testable
 * without Angular: the block snaps open the instant streaming starts and
 * snaps closed the instant it finishes. Manual toggles between those two
 * edges are left as-is (no transition means no forced change).
 */
export function nextThinkingExpandedState(
  wasStreaming: boolean,
  isStreamingNow: boolean,
  currentExpanded: boolean
): boolean {
  if (isStreamingNow && !wasStreaming) return true;
  if (!isStreamingNow && wasStreaming) return false;
  return currentExpanded;
}

@Component({
  selector: 'nxt1-agent-x-extended-thinking',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ext-thinking" [class.ext-thinking--expanded]="expanded()">
      <!-- Toggle button -->
      <button
        class="ext-thinking__toggle"
        type="button"
        (click)="toggle()"
        [attr.aria-expanded]="expanded()"
        aria-label="Toggle model reasoning"
      >
        @if (isStreaming()) {
          <span class="ext-thinking__pulse" aria-hidden="true"></span>
        }
        <svg
          class="ext-thinking__chevron"
          [class.ext-thinking__chevron--open]="expanded()"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span class="ext-thinking__label">{{ toggleLabel() }}</span>
      </button>

      <!-- Collapsible body -->
      @if (expanded()) {
        <div class="ext-thinking__body" role="region" aria-label="Model reasoning">
          <pre #thinkingPre class="ext-thinking__pre">{{ content() }}</pre>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .ext-thinking {
        font-size: 0.8rem;
        color: var(--ion-color-medium, #92949c);
        border-left: 2px solid var(--ion-color-medium-tint, #c8c9cc);
        margin: 6px 0 2px;
        border-radius: 0 4px 4px 0;
        background: transparent;
        overflow: hidden;
      }

      .ext-thinking__toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px 8px;
        color: inherit;
        font-size: inherit;
        font-family: inherit;
        width: 100%;
        text-align: left;
        user-select: none;

        &:focus-visible {
          outline: 2px solid var(--ion-color-primary, #3880ff);
          outline-offset: 2px;
          border-radius: 2px;
        }
      }

      .ext-thinking__label {
        opacity: 0.7;
        letter-spacing: 0.01em;
      }

      /* Rotating chevron */
      .ext-thinking__chevron {
        flex-shrink: 0;
        transition: transform 200ms ease;
      }

      .ext-thinking__chevron--open {
        transform: rotate(90deg);
      }

      /* Streaming pulse dot */
      .ext-thinking__pulse {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--ion-color-medium, #92949c);
        flex-shrink: 0;
        animation: ext-thinking-pulse 1.4s ease-in-out infinite;
      }

      @keyframes ext-thinking-pulse {
        0%,
        100% {
          opacity: 0.3;
          transform: scale(0.9);
        }
        50% {
          opacity: 1;
          transform: scale(1.1);
        }
      }

      /* Expanded body */
      .ext-thinking__body {
        padding: 4px 8px 8px;
        animation: ext-thinking-slide-in 150ms ease;
      }

      @keyframes ext-thinking-slide-in {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .ext-thinking__pre {
        margin: 0;
        font-family: var(--ion-font-family, system-ui, sans-serif);
        font-size: inherit;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.5;
        opacity: 0.75;
        max-height: 320px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
    `,
  ],
})
export class NxtAgentXExtendedThinkingComponent {
  private readonly haptics = inject(HapticsService);

  /** The accumulated thinking text to display. */
  readonly content = input.required<string>();

  /**
   * True while the model is still emitting thinking tokens (stream in progress).
   * When true: show the pulse indicator and keep the reasoning body open.
   */
  readonly isStreaming = input<boolean>(false);

  private readonly _expanded = signal(false);

  /** User can still toggle manually; auto-open/close only drives the default. */
  readonly expanded = computed(() => this._expanded());

  readonly toggleLabel = computed(() => {
    if (this.isStreaming()) return 'Thinking...';
    return this._expanded() ? 'Hide reasoning' : 'View reasoning';
  });

  /** Scrollable `<pre>` rendered only while expanded — undefined when collapsed. */
  private readonly thinkingPre = viewChild<ElementRef<HTMLElement>>('thinkingPre');

  /** Tracks the previous streaming value to detect start/finish transitions. */
  private wasStreaming = false;

  constructor() {
    // Auto-open the instant streaming starts; auto-close the instant it finishes.
    effect(() => {
      const streaming = this.isStreaming();
      this._expanded.set(nextThinkingExpandedState(this.wasStreaming, streaming, this._expanded()));
      this.wasStreaming = streaming;
    });

    // Keep the reasoning body pinned to the latest streamed tokens.
    effect(() => {
      const el = this.thinkingPre();
      this.content();
      if (el && this.expanded() && this.isStreaming()) {
        el.nativeElement.scrollTop = el.nativeElement.scrollHeight;
      }
    });
  }

  async toggle(): Promise<void> {
    await this.haptics.impact('light');
    this._expanded.update((v) => !v);
  }
}
