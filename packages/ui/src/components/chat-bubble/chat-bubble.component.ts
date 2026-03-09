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

import { Component, ChangeDetectionStrategy, input } from '@angular/core';

/** Visual variant controlling sizing, colors, and border‑radius. */
export type ChatBubbleVariant = 'message' | 'agent-chat' | 'agent-operation' | 'agent-fab';

@Component({
  selector: 'nxt1-chat-bubble',
  standalone: true,
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
      <div class="typing-dots"><span></span><span></span><span></span></div>
    } @else if (isSystem()) {
      <p class="bubble-text bubble-text--system">{{ content() }}</p>
    } @else {
      <p class="bubble-text">{{ content() }}</p>
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
         TYPING DOTS — Shared animation for AI chat
         ============================================ */

      .typing-dots {
        display: flex;
        gap: 4px;
        padding: 2px 0;
      }

      .typing-dots span {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        animation: dotBounce 1.4s ease-in-out infinite;
      }

      .typing-dots span:nth-child(2) {
        animation-delay: 0.2s;
      }

      .typing-dots span:nth-child(3) {
        animation-delay: 0.4s;
      }

      @keyframes dotBounce {
        0%,
        60%,
        100% {
          transform: translateY(0);
          opacity: 0.4;
        }
        30% {
          transform: translateY(-5px);
          opacity: 1;
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
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
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
}
