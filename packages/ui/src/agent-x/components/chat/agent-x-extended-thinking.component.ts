/**
 * @fileoverview Agent X Extended Thinking Component
 *
 * Renders the extended thinking tokens emitted by Claude 3.7+ / Gemini 2.5
 * as a collapsible block beneath the assistant message bubble.  During
 * streaming the block shows a pulsing indicator on a collapsed toggle that
 * the user can expand when they want to inspect the reasoning.
 *
 * The component is rendered by `NxtChatBubbleComponent` for
 * `AgentXMessagePart` entries whose `type === 'thinking'`.
 */

import { Component, ChangeDetectionStrategy, input, signal, computed, inject } from '@angular/core';
import { HapticsService } from '../../../services/haptics/haptics.service';

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
          <pre class="ext-thinking__pre">{{ content() }}</pre>
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
   * When true: show pulse indicator while leaving the reasoning body collapsed.
   */
  readonly isStreaming = input<boolean>(false);

  private readonly _expanded = signal(false);

  /** Expanded state is always user-controlled so streaming starts collapsed. */
  readonly expanded = computed(() => this._expanded());

  readonly toggleLabel = computed(() => {
    if (this.isStreaming()) return 'Thinking...';
    return this._expanded() ? 'Hide reasoning' : 'View reasoning';
  });

  async toggle(): Promise<void> {
    await this.haptics.impact('light');
    this._expanded.update((v) => !v);
  }
}
