/**
 * @fileoverview Shared Chat Bubble Component
 * @module @nxt1/ui/components/chat-bubble
 * @version 1.0.0
 *
 * Renders the bubble shape, colors, text, and typing indicator
 * for all chat contexts: DM/group messaging, Agent X main chat,
 * Agent X operation bottom‑sheet, and Agent X FAB panel.
 *
 * Each consumer still owns its own row layout, avatars, sender name,
 * and meta overlays — those are projected via `<ng-content />`.
 *
 * ⭐ SHARED — Works on web and mobile ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import type { AgentXToolStep, AgentXRichCard, AgentXMessagePart } from '@nxt1/core/ai';
import { AgentXToolStepsComponent } from '../../agent-x/agent-x-tool-steps.component';
import { AgentXPlannerCardComponent } from '../../agent-x/agent-x-planner-card.component';
import { AgentXDataTableCardComponent } from '../../agent-x/agent-x-data-table-card.component';
import {
  AgentXConfirmationCardComponent,
  type ConfirmationActionEvent,
} from '../../agent-x/agent-x-confirmation-card.component';
import { AgentXCitationsCardComponent } from '../../agent-x/agent-x-citations-card.component';
import {
  AgentXParameterFormCardComponent,
  type ParameterFormSubmitEvent,
} from '../../agent-x/agent-x-parameter-form-card.component';
import {
  AgentXDraftCardComponent,
  type DraftSubmittedEvent,
} from '../../agent-x/agent-x-draft-card.component';
import { AgentXProfileCardComponent } from '../../agent-x/agent-x-profile-card.component';
import { AgentXFilmTimelineCardComponent } from '../../agent-x/agent-x-film-timeline-card.component';
import {
  AgentXBillingActionCardComponent,
  type BillingActionResolvedEvent,
} from '../../agent-x/agent-x-billing-action-card.component';
import { NxtMarkdownComponent } from '../markdown/markdown.component';

/** Visual variant controlling sizing, colors, and border‑radius. */
export type ChatBubbleVariant = 'message' | 'agent-chat' | 'agent-operation' | 'agent-fab';

@Component({
  selector: 'nxt1-chat-bubble',
  standalone: true,
  imports: [
    AgentXToolStepsComponent,
    AgentXPlannerCardComponent,
    AgentXDataTableCardComponent,
    AgentXConfirmationCardComponent,
    AgentXCitationsCardComponent,
    AgentXParameterFormCardComponent,
    AgentXDraftCardComponent,
    AgentXProfileCardComponent,
    AgentXFilmTimelineCardComponent,
    AgentXBillingActionCardComponent,
    NxtMarkdownComponent,
  ],
  host: {
    '[class.variant-message]': 'variant() === "message"',
    '[class.variant-agent-chat]': 'variant() === "agent-chat"',
    '[class.variant-agent-operation]': 'variant() === "agent-operation"',
    '[class.variant-agent-fab]': 'variant() === "agent-fab"',
    '[class.own]': 'isOwn()',
    '[class.is-error]': 'isError()',
    '[class.is-system]': 'isSystem()',
    '[class.is-first]': 'isFirstInGroup()',
    '[class.is-last]': 'isLastInGroup()',
  },
  template: `
    @if (isTyping()) {
      <div class="typing-shimmer">
        <svg class="typing-shimmer__icon" viewBox="0 0 16 16" fill="none">
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            stroke-width="2"
            stroke-dasharray="28"
            stroke-dashoffset="8"
            stroke-linecap="round"
          />
        </svg>
        <span class="typing-shimmer__text">Thinking…</span>
      </div>
    } @else if (isSystem()) {
      <p class="bubble-text bubble-text--system">{{ content() }}</p>
    } @else if (parts().length) {
      <!-- ═══ INTERLEAVED PARTS (Copilot-style: text → tools → text → card) ═══ -->
      @for (part of parts(); track $index) {
        @switch (part.type) {
          @case ('text') {
            @if (isOwn()) {
              <p class="bubble-text">{{ part.content }}</p>
            } @else {
              <nxt1-markdown [content]="part.content" />
            }
          }
          @case ('tool-steps') {
            <nxt1-agent-x-tool-steps [steps]="part.steps" />
          }
          @case ('card') {
            @if (part.card.type === 'planner') {
              <nxt1-agent-x-planner-card
                [card]="part.card"
                (itemToggled)="plannerItemToggled.emit($event)"
              />
            } @else if (part.card.type === 'data-table') {
              <nxt1-agent-x-data-table-card [card]="part.card" />
            } @else if (part.card.type === 'confirmation') {
              <nxt1-agent-x-confirmation-card
                [card]="part.card"
                (actionSelected)="confirmationAction.emit($event)"
              />
            } @else if (part.card.type === 'citations') {
              <nxt1-agent-x-citations-card
                [card]="part.card"
                (citationClicked)="citationClicked.emit($event)"
              />
            } @else if (part.card.type === 'parameter-form') {
              <nxt1-agent-x-parameter-form-card
                [card]="part.card"
                (formSubmitted)="parameterFormSubmitted.emit($event)"
              />
            } @else if (part.card.type === 'draft') {
              <nxt1-agent-x-draft-card
                [card]="part.card"
                (draftSubmitted)="draftSubmitted.emit($event)"
              />
            } @else if (part.card.type === 'profile') {
              <nxt1-agent-x-profile-card
                [card]="part.card"
                (profileClicked)="profileClicked.emit($event)"
              />
            } @else if (part.card.type === 'film-timeline') {
              <nxt1-agent-x-film-timeline-card
                [card]="part.card"
                (markerClicked)="filmMarkerClicked.emit($event)"
              />
            } @else if (part.card.type === 'billing-action') {
              <nxt1-agent-x-billing-action-card
                [card]="part.card"
                (actionResolved)="billingActionResolved.emit($event)"
              />
            } @else {
              <div class="card-fallback">
                <span class="card-fallback__icon">⚠️</span>
                <span class="card-fallback__text">Unsupported card type: {{ part.card.type }}</span>
              </div>
            }
          }
          @case ('image') {
            <div class="bubble-media">
              <img
                [src]="part.url"
                [alt]="part.alt || 'Generated image'"
                class="bubble-img"
                loading="lazy"
              />
            </div>
          }
          @case ('video') {
            <div class="bubble-media">
              <video
                [src]="part.url"
                class="bubble-video"
                controls
                playsinline
                preload="metadata"
              ></video>
            </div>
          }
        }
      }
    } @else {
      <!-- ═══ LEGACY FLAT LAYOUT (history messages without parts) ═══ -->
      @if (steps().length) {
        <nxt1-agent-x-tool-steps [steps]="steps()" />
      }
      @if (content()) {
        @if (isOwn()) {
          <p class="bubble-text">{{ content() }}</p>
        } @else {
          <nxt1-markdown [content]="content()" />
        }
      }
      @if (imageUrl()) {
        <div class="bubble-media">
          <img
            [src]="imageUrl()"
            [alt]="content() || 'Generated image'"
            class="bubble-img"
            loading="lazy"
          />
        </div>
      } @else if (videoUrl()) {
        <div class="bubble-media">
          <video
            [src]="videoUrl()"
            class="bubble-video"
            controls
            playsinline
            preload="metadata"
          ></video>
        </div>
      }
      @for (card of cards(); track $index) {
        @if (card.type === 'planner') {
          <nxt1-agent-x-planner-card
            [card]="card"
            (itemToggled)="plannerItemToggled.emit($event)"
          />
        } @else if (card.type === 'data-table') {
          <nxt1-agent-x-data-table-card [card]="card" />
        } @else if (card.type === 'confirmation') {
          <nxt1-agent-x-confirmation-card
            [card]="card"
            (actionSelected)="confirmationAction.emit($event)"
          />
        } @else if (card.type === 'citations') {
          <nxt1-agent-x-citations-card
            [card]="card"
            (citationClicked)="citationClicked.emit($event)"
          />
        } @else if (card.type === 'parameter-form') {
          <nxt1-agent-x-parameter-form-card
            [card]="card"
            (formSubmitted)="parameterFormSubmitted.emit($event)"
          />
        } @else if (card.type === 'draft') {
          <nxt1-agent-x-draft-card [card]="card" (draftSubmitted)="draftSubmitted.emit($event)" />
        } @else if (card.type === 'profile') {
          <nxt1-agent-x-profile-card [card]="card" (profileClicked)="profileClicked.emit($event)" />
        } @else if (card.type === 'film-timeline') {
          <nxt1-agent-x-film-timeline-card
            [card]="card"
            (markerClicked)="filmMarkerClicked.emit($event)"
          />
        } @else if (card.type === 'billing-action') {
          <nxt1-agent-x-billing-action-card
            [card]="card"
            (actionResolved)="billingActionResolved.emit($event)"
          />
        } @else {
          <div class="card-fallback">
            <span class="card-fallback__icon">⚠️</span>
            <span class="card-fallback__text">Unsupported card type: {{ card.type }}</span>
          </div>
        }
      }
    }
    <ng-content />
  `,
  styles: [
    `
      /* ============================================
         BASE — All variants
         ============================================ */

      :host {
        display: block;
        position: relative;
        max-width: 100%;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      .bubble-text {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
      }

      /* ============================================
         TYPING INDICATOR — Copilot-style shimmer
         ============================================ */

      .typing-shimmer {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2px 0;
      }

      .typing-shimmer__icon {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        color: var(--nxt1-color-primary, #ccff00);
        animation: typingSpin 1s linear infinite;
      }

      .typing-shimmer__text {
        font-size: 0.8125rem;
        font-weight: 500;
        background: linear-gradient(
          90deg,
          var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4)) 0%,
          var(--nxt1-color-text, rgba(255, 255, 255, 0.87)) 50%,
          var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4)) 100%
        );
        background-size: 200% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: typingShimmer 2s linear infinite;
      }

      @keyframes typingSpin {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes typingShimmer {
        to {
          background-position: 200% center;
        }
      }

      /* ── Card fallback ── */

      .card-fallback {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--nxt1-color-surface-variant, rgba(255, 255, 255, 0.05));
        font-size: 0.8125rem;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
      }

      .card-fallback__icon {
        font-size: 1rem;
      }

      @media (prefers-reduced-motion: reduce) {
        .typing-shimmer__icon {
          animation: none;
        }
        .typing-shimmer__text {
          animation: none;
          color: var(--nxt1-color-text-secondary);
          background: none;
          -webkit-background-clip: unset;
          background-clip: unset;
        }
      }

      /* ============================================
         VARIANT: message (DM / group messaging)
         ============================================ */

      :host(.variant-message) {
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-spacing-5);
      }

      :host(.variant-message) .bubble-text {
        font-size: var(--nxt1-fontSize-base);
        line-height: 1.45;
      }

      /* Own (user) bubble */
      :host(.variant-message.own) {
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #000000);
        border-bottom-right-radius: var(--nxt1-spacing-1);
      }

      :host(.variant-message.own.is-first) {
        border-top-right-radius: var(--nxt1-spacing-5);
      }

      :host(.variant-message.own.is-last) {
        border-bottom-right-radius: var(--nxt1-spacing-5);
      }

      /* Other (received) bubble */
      :host(.variant-message:not(.own)) {
        background: var(--nxt1-color-surface-300, #222222);
        color: var(--nxt1-color-text-primary, #ffffff);
        border-bottom-left-radius: var(--nxt1-spacing-1);
      }

      :host(.variant-message:not(.own).is-first) {
        border-top-left-radius: var(--nxt1-spacing-5);
      }

      :host(.variant-message:not(.own).is-last) {
        border-bottom-left-radius: var(--nxt1-spacing-5);
      }

      /* Failed state */
      :host(.variant-message.is-error) {
        opacity: 0.7;
      }

      :host(.variant-message.own.is-error) {
        background: var(--nxt1-color-error);
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      /* ============================================
         VARIANT: agent-chat (main Agent X shell)
         ============================================ */

      :host(.variant-agent-chat) {
        padding: 0.875rem 1rem;
        border-radius: 16px;
      }

      :host(.variant-agent-chat) .bubble-text {
        font-size: 0.9375rem;
        line-height: 1.5;
      }

      :host(.variant-agent-chat.own) {
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        border-bottom-right-radius: 4px;
      }

      :host(.variant-agent-chat:not(.own)) {
        background: var(--agent-surface, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--agent-border, rgba(255, 255, 255, 0.08));
        color: var(--agent-text-primary, #ffffff);
        border-bottom-left-radius: 4px;
      }

      :host(.variant-agent-chat.is-error) {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
      }

      :host(.variant-agent-chat) .typing-dots {
        padding: 4px 0;
      }

      :host(.variant-agent-chat) .typing-dots span {
        width: 8px;
        height: 8px;
        background: var(--agent-text-muted, rgba(255, 255, 255, 0.5));
      }

      /* ============================================
         VARIANT: agent-operation (bottom-sheet chat)
         ============================================ */

      :host(.variant-agent-operation) {
        padding: 10px 14px;
        border-radius: 14px;
      }

      :host(.variant-agent-operation) .bubble-text {
        font-size: 14px;
        line-height: 1.5;
      }

      :host(.variant-agent-operation.own) {
        background: var(--nxt1-color-surface-400, #2a2a2a);
        color: var(--nxt1-color-text-primary, #fff);
        border-bottom-right-radius: 4px;
      }

      :host(.variant-agent-operation:not(.own)) {
        background: transparent;
        border: none;
        color: var(--op-text, var(--nxt1-color-text-primary, #fff));
        border-radius: 0;
        padding: 0;
      }

      :host(.variant-agent-operation.is-system) {
        background: transparent;
        padding: 6px 12px;
      }

      :host(.variant-agent-operation) .bubble-text--system {
        font-size: 12px;
        color: var(--op-text-muted, var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5)));
        text-align: center;
        font-style: italic;
      }

      :host(.variant-agent-operation.is-error) {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
      }

      :host(.variant-agent-operation) .typing-dots span {
        background: var(--op-text-muted, var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5)));
      }

      /* ============================================
         VARIANT: agent-fab (web FAB chat panel)
         ============================================ */

      :host(.variant-agent-fab) {
        padding: 10px 14px;
        border-radius: var(--nxt1-ui-radius-xl, 16px);
      }

      :host(.variant-agent-fab) .bubble-text {
        font-size: 13px;
        line-height: 1.55;
      }

      :host(.variant-agent-fab.own) {
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--panel-text-inverse, var(--nxt1-color-text-onPrimary, #0a0a0a));
        border-bottom-right-radius: var(--nxt1-ui-radius-sm, 4px);
      }

      :host(.variant-agent-fab:not(.own)) {
        background: var(--panel-surface, var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03)));
        border: 1px solid var(--panel-border, var(--nxt1-glass-border, rgba(255, 255, 255, 0.08)));
        color: var(--panel-text, var(--nxt1-color-text-primary, #ffffff));
        border-bottom-left-radius: var(--nxt1-ui-radius-sm, 4px);
      }

      :host(.variant-agent-fab.is-error) {
        background: var(--panel-error-bg, rgba(239, 68, 68, 0.1));
        border-color: var(--panel-error-border, rgba(239, 68, 68, 0.3));
      }

      :host(.variant-agent-fab) .typing-dots span {
        background: var(
          --panel-text-muted,
          var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45))
        );
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */

      /* ============================================
         MEDIA — Image / Video rendered below text
         ============================================ */

      .bubble-media {
        margin-top: 0.75rem;
        border-radius: 12px;
        overflow: hidden;
      }

      .bubble-img {
        display: block;
        width: 100%;
        max-width: 320px;
        height: auto;
        border-radius: 12px;
        object-fit: cover;
      }

      .bubble-video {
        display: block;
        width: 100%;
        max-width: 320px;
        border-radius: 12px;
      }

      :host(.own) .bubble-img,
      :host(.own) .bubble-video {
        max-width: 240px;
      }

      :host(.variant-agent-fab) .bubble-img,
      :host(.variant-agent-fab) .bubble-video {
        max-width: 260px;
      }

      @media (prefers-reduced-motion: reduce) {
        .typing-dots span {
          animation: none;
          opacity: 0.5;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtChatBubbleComponent {
  /** Visual variant controlling sizing, colors, and border‑radius. */
  readonly variant = input<ChatBubbleVariant>('message');

  /** Whether this is the current user's own message. */
  readonly isOwn = input(false);

  /** The text content to display. */
  readonly content = input('');

  /** Optional image URL to display above the text content. */
  readonly imageUrl = input<string | undefined>(undefined);

  /** Optional video URL to display above the text content. */
  readonly videoUrl = input<string | undefined>(undefined);

  /** Show typing indicator dots instead of text. */
  readonly isTyping = input(false);

  /** Error state. */
  readonly isError = input(false);

  /** System message (agent‑operation variant). */
  readonly isSystem = input(false);

  /** First message in a consecutive group (message variant). */
  readonly isFirstInGroup = input(true);

  /** Last message in a consecutive group (message variant). */
  readonly isLastInGroup = input(true);

  /** Inline tool execution steps shown above text (Copilot-style). */
  readonly steps = input<readonly AgentXToolStep[]>([]);

  /** Rich cards rendered below text content. */
  readonly cards = input<readonly AgentXRichCard[]>([]);

  /** Ordered message parts for Copilot-style interleaved rendering. */
  readonly parts = input<readonly AgentXMessagePart[]>([]);

  /** Emitted when a planner card item is toggled. */
  readonly plannerItemToggled = output<string>();

  /** Emitted when a confirmation card action is selected. */
  readonly confirmationAction = output<ConfirmationActionEvent>();

  /** Emitted when a citation pill is clicked (sends citation ID). */
  readonly citationClicked = output<string>();

  /** Emitted when a parameter form card is submitted. */
  readonly parameterFormSubmitted = output<ParameterFormSubmitEvent>();

  /** Emitted when a draft card is approved and sent. */
  readonly draftSubmitted = output<DraftSubmittedEvent>();

  /** Emitted when a profile card "View Profile" is clicked (sends userId). */
  readonly profileClicked = output<string>();

  /** Emitted when a film timeline marker is clicked (sends timeMs). */
  readonly filmMarkerClicked = output<number>();

  /** Emitted when a billing action card CTA is resolved. */
  readonly billingActionResolved = output<BillingActionResolvedEvent>();
}
