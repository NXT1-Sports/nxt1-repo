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

import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  computed,
  inject,
  input,
  output,
  type AfterViewChecked,
} from '@angular/core';
import type { AgentXToolStep, AgentXRichCard, AgentXMessagePart } from '@nxt1/core/ai';
import { AgentXToolStepsComponent } from '../../agent-x/components/shared/agent-x-tool-steps.component';
import {
  AgentXBillingActionCardComponent,
  type BillingActionResolvedEvent,
} from '../../agent-x/components/cards/agent-x-billing-action-card.component';
import {
  AgentXConnectAccountCardComponent,
  type ConnectAccountCardActionEvent,
} from '../../agent-x/components/cards/agent-x-connect-account-card.component';
import {
  AgentXConnectPlatformCardComponent,
  type ConnectPlatformCardActionEvent,
} from '../../agent-x/components/cards/agent-x-connect-platform-card.component';
import { NxtIconComponent } from '../icon/icon.component';
import {
  NxtMarkdownComponent,
  type MarkdownMediaRequestedEvent,
} from '../markdown/markdown.component';
import { NxtAgentXExtendedThinkingComponent } from '../../agent-x/components/chat/agent-x-extended-thinking.component';
import { buildAgentCardThemeStyle } from '../../agent-x/types/agent-x-agent-presentation';
import { NxtLoggingService } from '../../services/logging';

const CHAT_BUBBLE_VIDEO_POSTER_MAX_EDGE_PX = 640;

function resolveChatBubbleVideoPosterDimensions(
  sourceWidth: number,
  sourceHeight: number
): { width: number; height: number } {
  const width = Math.max(1, Math.round(sourceWidth || 320));
  const height = Math.max(1, Math.round(sourceHeight || 180));
  const maxEdge = Math.max(width, height);
  if (maxEdge <= CHAT_BUBBLE_VIDEO_POSTER_MAX_EDGE_PX) {
    return { width, height };
  }

  const scale = CHAT_BUBBLE_VIDEO_POSTER_MAX_EDGE_PX / maxEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readVideoPartThumbnailUrl(part: AgentXMessagePart): string | null {
  if (part.type !== 'video') return null;
  const value = (part as { readonly thumbnailUrl?: string }).thumbnailUrl;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Visual variant controlling sizing, colors, and border‑radius. */
export type ChatBubbleVariant = 'message' | 'agent-chat' | 'agent-operation' | 'agent-fab';

export interface ChatBubbleMediaRequestedEvent {
  readonly url: string;
  readonly type: 'image' | 'video';
  readonly alt?: string;
  readonly poster?: string;
}

@Component({
  selector: 'nxt1-chat-bubble',
  standalone: true,
  imports: [
    AgentXToolStepsComponent,
    AgentXBillingActionCardComponent,
    AgentXConnectAccountCardComponent,
    AgentXConnectPlatformCardComponent,
    NxtIconComponent,
    NxtMarkdownComponent,
    NxtAgentXExtendedThinkingComponent,
  ],
  host: {
    '[class.variant-message]': 'variant() === "message"',
    '[class.variant-agent-chat]': 'variant() === "agent-chat"',
    '[class.variant-agent-operation]': 'variant() === "agent-operation"',
    '[class.variant-agent-fab]': 'variant() === "agent-fab"',
    '[class.is-streaming]': 'isStreaming()',
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
        <span class="typing-shimmer__text">{{ resolvedTypingLabel() }}</span>
      </div>
    } @else if (isSystem()) {
      <p class="bubble-text bubble-text--system">{{ content() }}</p>
    } @else if (parts().length) {
      <!-- ═══ INTERLEAVED PARTS (Copilot-style: text → tools → text → card) ═══ -->
      @for (part of parts(); track $index; let last = $last) {
        @switch (part.type) {
          @case ('text') {
            @if (isOwn()) {
              <p class="bubble-text">{{ part.content }}</p>
            } @else {
              <nxt1-markdown
                [content]="part.content"
                [isStreaming]="isStreaming() && last"
                (mediaRequested)="onMarkdownMediaRequested($event)"
                (timestampClicked)="onMarkdownTimestampClicked($event)"
              />
            }
          }
          @case ('tool-steps') {
            <nxt1-agent-x-tool-steps [steps]="part.steps" />
          }
          @case ('card') {
            <div class="agent-card-shell" [style]="cardThemeStyle(part.card)">
              @if (part.card.type === 'billing-action') {
                <nxt1-agent-x-billing-action-card
                  [card]="part.card"
                  (actionResolved)="billingActionResolved.emit($event)"
                />
              } @else if (part.card.type === 'ask_user') {
                <nxt1-markdown
                  [content]="askUserCardText(part.card)"
                  (timestampClicked)="onMarkdownTimestampClicked($event)"
                />
              } @else if (part.card.type === 'connect-account') {
                <nxt1-agent-x-connect-account-card
                  [card]="part.card"
                  (actionSelected)="connectAccountAction.emit($event)"
                />
              } @else if (part.card.type === 'connect-platform') {
                <nxt1-agent-x-connect-platform-card
                  [card]="part.card"
                  (actionSelected)="connectPlatformAction.emit($event)"
                />
              } @else {
                <div class="card-fallback">
                  <span class="card-fallback__icon">⚠️</span>
                  <span class="card-fallback__text"
                    >Unsupported card type: {{ part.card.type }}</span
                  >
                </div>
              }
            </div>
          }
          @case ('image') {
            <button
              type="button"
              class="bubble-media bubble-media-button"
              [attr.aria-label]="'Open image' + (part.alt ? ': ' + part.alt : '')"
              (click)="mediaRequested.emit({ url: part.url, type: 'image', alt: part.alt })"
            >
              <img
                [src]="part.url"
                [alt]="part.alt || 'Generated image'"
                class="bubble-img"
                loading="lazy"
              />
            </button>
          }
          @case ('video') {
            <button
              type="button"
              class="bubble-media bubble-media-button bubble-media-button--video"
              [class.bubble-media-button--has-poster]="videoPartPosterUrl(part)"
              aria-label="Open video"
              (click)="
                mediaRequested.emit({
                  url: part.url,
                  type: 'video',
                  poster: videoPartPosterUrl(part) || undefined,
                })
              "
            >
              @if (videoPartPosterUrl(part); as posterUrl) {
                <img
                  [src]="posterUrl"
                  class="bubble-video-poster"
                  alt="Video thumbnail"
                  (error)="onVideoPosterError(part, posterUrl)"
                />
              } @else {
                <div
                  class="bubble-video-poster bubble-video-poster--fallback"
                  aria-hidden="true"
                ></div>
              }
              <span class="bubble-media-play" aria-hidden="true">
                <nxt1-icon name="playCircle" [size]="38" />
              </span>
            </button>
          }
          @case ('thinking') {
            <nxt1-agent-x-extended-thinking
              [content]="part.content"
              [isStreaming]="isStreaming() && !part.done"
            />
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
          <nxt1-markdown
            [content]="content()"
            [isStreaming]="isStreaming()"
            (mediaRequested)="onMarkdownMediaRequested($event)"
            (timestampClicked)="onMarkdownTimestampClicked($event)"
          />
        }
      }
      @for (card of cards(); track $index) {
        <div class="agent-card-shell" [style]="cardThemeStyle(card)">
          @if (card.type === 'billing-action') {
            <nxt1-agent-x-billing-action-card
              [card]="card"
              (actionResolved)="billingActionResolved.emit($event)"
            />
          } @else if (card.type === 'ask_user') {
            <nxt1-markdown
              [content]="askUserCardText(card)"
              (timestampClicked)="onMarkdownTimestampClicked($event)"
            />
          } @else if (card.type === 'connect-account') {
            <nxt1-agent-x-connect-account-card
              [card]="card"
              (actionSelected)="connectAccountAction.emit($event)"
            />
          } @else if (card.type === 'connect-platform') {
            <nxt1-agent-x-connect-platform-card
              [card]="card"
              (actionSelected)="connectPlatformAction.emit($event)"
            />
          } @else {
            <div class="card-fallback">
              <span class="card-fallback__icon">⚠️</span>
              <span class="card-fallback__text">Unsupported card type: {{ card.type }}</span>
            </div>
          }
        </div>
      }
    }

    @if (isError()) {
      <div class="bubble-error-actions">
        <button type="button" class="bubble-retry-btn" (click)="retryRequested.emit()">
          <nxt1-icon name="refresh" size="11" className="bubble-retry-icon" />
          Try again
        </button>
      </div>
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
        --bubble-media-max-width: 240px;
        --bubble-error: var(--nxt1-color-error, #ef4444);
        --bubble-error-bg: var(--nxt1-color-errorBg, rgba(239, 68, 68, 0.1));
        --bubble-error-border: color-mix(in srgb, var(--bubble-error) 44%, transparent);
        --bubble-error-border-soft: color-mix(in srgb, var(--bubble-error) 28%, transparent);
        --bubble-error-text: var(--nxt1-color-errorLight, var(--bubble-error));
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

      .agent-card-shell {
        display: block;
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
        opacity: 1;
        background: var(--bubble-error-bg);
        border: 1px solid var(--bubble-error-border);
        color: var(--bubble-error-text);
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
        background: var(--bubble-error-bg);
        border-color: var(--bubble-error-border);
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

      /* Keep streaming typography aligned with final markdown output. */
      :host(.variant-agent-operation.is-streaming:not(.own)) .bubble-text,
      :host(.variant-agent-chat.is-streaming:not(.own)) .bubble-text,
      :host(.variant-agent-fab.is-streaming:not(.own)) .bubble-text {
        font-size: 1rem;
        line-height: 1.6;
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
        background: var(--bubble-error-bg);
        border: 1px solid var(--bubble-error-border);
        border-radius: 12px;
        padding: 10px 12px;
        color: var(--bubble-error-text);
      }

      :host(.variant-agent-operation.is-error) .bubble-text {
        color: var(--bubble-error-text);
      }

      :host(.variant-agent-operation.is-error) .bubble-error-actions,
      :host(.variant-agent-fab.is-error) .bubble-error-actions {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--bubble-error-border-soft);
      }

      .bubble-error-actions {
        display: flex;
        margin-top: 8px;
      }

      .bubble-retry-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 20px;
        border: 1px solid var(--bubble-error-border);
        background: color-mix(in srgb, var(--bubble-error) 12%, transparent);
        color: var(--bubble-error-text);
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.01em;
        cursor: pointer;
        transition:
          background 0.15s,
          border-color 0.15s;
      }

      .bubble-retry-icon {
        flex-shrink: 0;
      }

      .bubble-retry-btn:hover {
        background: color-mix(in srgb, var(--bubble-error) 18%, transparent);
        border-color: var(--bubble-error-border);
      }

      .bubble-retry-btn:active {
        background: color-mix(in srgb, var(--bubble-error) 24%, transparent);
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
        background: var(--bubble-error-bg);
        border-color: var(--bubble-error-border);
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
        position: relative;
        display: block;
        margin-top: 0.75rem;
        border-radius: 12px;
        overflow: hidden;
        max-width: var(--bubble-media-max-width);
      }

      .bubble-media-button {
        width: min(100%, var(--bubble-media-max-width));
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        text-align: inherit;
        appearance: none;
      }

      .bubble-media-button:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .bubble-media-button--video {
        aspect-ratio: 16 / 9;
        background:
          linear-gradient(
            90deg,
            transparent 0 19%,
            rgba(255, 255, 255, 0.055) 19% 20%,
            transparent 20% 39%,
            rgba(255, 255, 255, 0.045) 39% 40%,
            transparent 40% 59%,
            rgba(255, 255, 255, 0.04) 59% 60%,
            transparent 60% 79%,
            rgba(255, 255, 255, 0.035) 79% 80%,
            transparent 80%
          ),
          radial-gradient(circle at 28% 26%, rgba(204, 255, 0, 0.24), transparent 36%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.035)), #10120f;
      }

      .bubble-media-button--video.bubble-media-button--has-poster {
        width: auto;
        max-width: min(100%, var(--bubble-media-max-width));
        aspect-ratio: auto;
        background: #000;
      }

      .bubble-img {
        display: block;
        width: 100%;
        max-width: 100%;
        height: auto;
        border-radius: 12px;
        object-fit: cover;
        pointer-events: none;
      }

      .bubble-video-poster {
        display: block;
        width: 100%;
        max-width: 100%;
        height: 100%;
        border-radius: 12px;
        object-fit: cover;
        pointer-events: none;
      }

      .bubble-media-button--has-poster .bubble-video-poster {
        width: auto;
        max-width: 100%;
        height: auto;
        max-height: min(360px, 70vh);
        object-fit: contain;
        background: #000;
      }

      .bubble-video-poster--fallback {
        background:
          linear-gradient(
            90deg,
            transparent 0 19%,
            rgba(255, 255, 255, 0.055) 19% 20%,
            transparent 20% 39%,
            rgba(255, 255, 255, 0.045) 39% 40%,
            transparent 40% 59%,
            rgba(255, 255, 255, 0.04) 59% 60%,
            transparent 60% 79%,
            rgba(255, 255, 255, 0.035) 79% 80%,
            transparent 80%
          ),
          radial-gradient(circle at 28% 26%, rgba(204, 255, 0, 0.24), transparent 36%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.035)), #10120f;
      }

      .bubble-media-play {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        background: rgba(0, 0, 0, 0.18);
        pointer-events: none;
        transition:
          background 0.15s ease,
          transform 0.15s ease;
      }

      .bubble-media-button--video:hover .bubble-media-play,
      .bubble-media-button--video:focus-visible .bubble-media-play {
        background: rgba(0, 0, 0, 0.28);
      }

      .bubble-media-button--video:hover .bubble-media-play {
        transform: scale(1.04);
      }

      :host ::ng-deep nxt1-markdown .md img:not(.md-link-favicon),
      :host ::ng-deep nxt1-markdown .md video {
        width: min(100%, var(--bubble-media-max-width));
        max-width: min(100%, var(--bubble-media-max-width));
        height: auto;
        border-radius: 12px;
        display: block;
        cursor: pointer;
      }

      :host(.own) .bubble-img,
      :host(.own) .bubble-video-poster {
        max-width: 100%;
      }

      :host(.own) {
        --bubble-media-max-width: 200px;
      }

      :host(.variant-agent-fab) .bubble-img,
      :host(.variant-agent-fab) .bubble-video-poster {
        max-width: 100%;
      }

      :host(.variant-agent-fab) {
        --bubble-media-max-width: 220px;
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
export class NxtChatBubbleComponent implements AfterViewChecked {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly logger = inject(NxtLoggingService).child('NxtChatBubbleComponent');
  private readonly generatedVideoPosterUrls = new Map<string, string>();
  private readonly pendingVideoPosterUrls = new Set<string>();
  private readonly failedVideoPosterUrls = new Set<string>();
  private readonly failedExplicitThumbnailUrls = new Set<string>();
  private posterHydrationQueued = false;

  /** Visual variant controlling sizing, colors, and border‑radius. */
  readonly variant = input<ChatBubbleVariant>('message');

  /** Whether this is the current user's own message. */
  readonly isOwn = input(false);

  /** The text content to display. */
  readonly content = input('');

  /** Show typing indicator dots instead of text. */
  readonly isTyping = input(false);

  /** True while this bubble is receiving live stream deltas. */
  readonly isStreaming = input(false);

  /** Label shown inside the typing shimmer. */
  readonly typingLabel = input('Thinking...');

  /** Typing shimmer label with guaranteed non-empty fallback. */
  protected readonly resolvedTypingLabel = computed(() => {
    const label = this.typingLabel()?.trim();
    return label && label.length > 0 ? label : 'Agent X is thinking...';
  });

  protected readonly hasExplicitMediaPart = computed(() =>
    this.parts().some((part) => part.type === 'image' || part.type === 'video')
  );

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

  /**
   * External yield lifecycle state for interactive cards (confirmation, draft, ask_user)
   * rendered inside this bubble. Driven by the yield facade after server confirmation.
   * Mirrors the externalCardState contract on each card component.
   */
  readonly externalCardState = input<'idle' | 'submitting' | 'resolved' | null>(null);

  /** Resolved text shown in the card's resolved badge when externally resolved. */
  readonly externalResolvedText = input<string>('');

  /** Emitted when a billing action card CTA is resolved. */
  readonly billingActionResolved = output<BillingActionResolvedEvent>();

  /** Emitted when media inside markdown/parts should open in a viewer overlay. */
  readonly mediaRequested = output<ChatBubbleMediaRequestedEvent>();

  /** Emitted when an inline markdown timestamp should seek active film review video. */
  readonly timestampClicked = output<number>();

  /** Emitted when the user taps connect-account card actions. */
  readonly connectAccountAction = output<ConnectAccountCardActionEvent>();

  /** Emitted when the user taps connect-platform card actions. */
  readonly connectPlatformAction = output<ConnectPlatformCardActionEvent>();

  /** Emitted when the user clicks "Try again" on an error bubble. */
  readonly retryRequested = output<void>();

  ngAfterViewChecked(): void {
    this.queueVideoPosterHydration();
  }

  protected onMarkdownMediaRequested(event: MarkdownMediaRequestedEvent): void {
    this.mediaRequested.emit(event);
  }

  protected onMarkdownTimestampClicked(timeMs: number): void {
    this.timestampClicked.emit(timeMs);
  }
  protected videoPartPosterUrl(part: AgentXMessagePart): string | null {
    if (part.type !== 'video') return null;

    const explicitThumbnailUrl = readVideoPartThumbnailUrl(part);
    if (explicitThumbnailUrl && !this.failedExplicitThumbnailUrls.has(explicitThumbnailUrl)) {
      return explicitThumbnailUrl;
    }

    return this.generatedVideoPosterUrls.get(part.url) ?? null;
  }

  protected onVideoPosterError(part: AgentXMessagePart, posterUrl: string): void {
    if (part.type !== 'video') return;

    const explicitThumbnailUrl = readVideoPartThumbnailUrl(part);
    if (explicitThumbnailUrl && explicitThumbnailUrl === posterUrl) {
      this.failedExplicitThumbnailUrls.add(explicitThumbnailUrl);
      this.logger.warn('Explicit chat bubble video thumbnail failed to load', {
        videoUrl: part.url,
        thumbnailUrl: explicitThumbnailUrl,
      });
      this.cdr.markForCheck();
    }
  }

  protected cardThemeStyle(card: AgentXRichCard): string {
    return buildAgentCardThemeStyle(card);
  }

  protected askUserCardText(card: AgentXRichCard): string {
    if (card.type !== 'ask_user') return '';
    const payload = card.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') {
      return card.title || 'Agent X has a question.';
    }

    const question = typeof payload['question'] === 'string' ? payload['question'].trim() : '';
    const context = typeof payload['context'] === 'string' ? payload['context'].trim() : '';
    const combined = [question, context]
      .filter((value) => value.length > 0)
      .join('\n\n')
      .trim();
    return combined || card.title || 'Agent X has a question.';
  }

  private queueVideoPosterHydration(): void {
    if (!this.canGenerateClientVideoPosters() || this.posterHydrationQueued) {
      return;
    }

    if (!this.parts().some((part) => part.type === 'video')) {
      return;
    }

    this.posterHydrationQueued = true;
    const schedule =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16);

    schedule(() => {
      this.posterHydrationQueued = false;
      this.hydrateVideoPostersForParts();
    });
  }

  private canGenerateClientVideoPosters(): boolean {
    if (
      typeof document === 'undefined' ||
      typeof HTMLVideoElement === 'undefined' ||
      typeof HTMLCanvasElement === 'undefined'
    ) {
      return false;
    }

    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return !/jsdom|happy-dom/i.test(userAgent);
  }

  private hydrateVideoPostersForParts(): void {
    for (const part of this.parts()) {
      if (part.type !== 'video') continue;
      if (readVideoPartThumbnailUrl(part)) continue;
      if (this.generatedVideoPosterUrls.has(part.url)) continue;
      if (this.pendingVideoPosterUrls.has(part.url) || this.failedVideoPosterUrls.has(part.url)) {
        continue;
      }

      this.pendingVideoPosterUrls.add(part.url);
      void this.generateVideoPosterFromUrl(part.url)
        .then((posterUrl) => {
          if (!posterUrl) {
            this.failedVideoPosterUrls.add(part.url);
            this.logger.warn('Failed to generate chat bubble video poster', {
              videoUrl: part.url,
              reason: 'empty-result',
            });
            return;
          }
          this.generatedVideoPosterUrls.set(part.url, posterUrl);
          this.logger.info('Generated chat bubble video poster', {
            videoUrl: part.url,
            posterBytes: posterUrl.length,
          });
          this.cdr.markForCheck();
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          const errorName =
            error && typeof error === 'object' && 'name' in error
              ? String((error as { name?: unknown }).name ?? '')
              : undefined;
          this.failedVideoPosterUrls.add(part.url);
          this.logger.warn('Failed to generate chat bubble video poster', {
            videoUrl: part.url,
            errorName,
            errorMessage: message,
            likelyCorsTaint:
              errorName === 'SecurityError' || /taint|cross-origin|insecure/i.test(message),
          });
        })
        .finally(() => {
          this.pendingVideoPosterUrls.delete(part.url);
        });
    }
  }

  private generateVideoPosterFromUrl(url: string): Promise<string | null> {
    return new Promise<string | null>((resolve, reject) => {
      if (typeof document === 'undefined') {
        resolve(null);
        return;
      }

      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.preload = 'auto';
      video.style.cssText =
        'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
      video.src = url;

      const root = document.body ?? document.documentElement;
      root.appendChild(video);

      let settled = false;
      const timeoutId = setTimeout(() => {
        finish(null);
      }, 6000);

      const cleanup = (): void => {
        clearTimeout(timeoutId);
        try {
          video.pause();
        } catch {
          /* ignore */
        }
        video.removeAttribute('src');
        try {
          video.load();
        } catch {
          /* ignore */
        }
        if (video.parentNode) {
          video.parentNode.removeChild(video);
        }
      };

      const finish = (result: string | null, error?: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      };

      const captureFrame = (): void => {
        if (settled) return;
        try {
          const { width, height } = resolveChatBubbleVideoPosterDimensions(
            video.videoWidth || 320,
            video.videoHeight || 180
          );
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) {
            finish(null);
            return;
          }
          context.drawImage(video, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
          finish(dataUrl);
        } catch (error) {
          finish(null, error);
        }
      };

      const tryCapture = async (): Promise<void> => {
        if (settled) return;
        try {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.then === 'function') {
            await playPromise.catch(() => undefined);
          }
          await new Promise<void>((done) =>
            typeof requestAnimationFrame === 'function'
              ? requestAnimationFrame(() => done())
              : setTimeout(done, 50)
          );
          try {
            video.pause();
          } catch {
            /* ignore */
          }
          captureFrame();
        } catch (error) {
          finish(null, error);
        }
      };

      video.addEventListener(
        'loadeddata',
        () => {
          void tryCapture();
        },
        { once: true }
      );

      video.addEventListener(
        'error',
        () => {
          finish(null, new Error(`Video poster load failed: ${url}`));
        },
        { once: true }
      );

      try {
        video.load();
      } catch (error) {
        finish(null, error);
      }
    });
  }
}
