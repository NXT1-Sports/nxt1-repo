/**
 * @fileoverview Agent X FAB Chat Panel — Expandable Chat Widget
 * @module @nxt1/ui/agent-x/fab
 * @version 1.0.0
 *
 * Full-featured chat panel that expands from the FAB button.
 * Enterprise-grade design with glass morphism, smooth animations,
 * welcome screen, message history, and input bar.
 *
 * Features:
 * - Spring-based open/close animations
 * - Glass morphism header with blur
 * - Welcome screen with quick actions (when empty)
 * - Full chat history with auto-scroll
 * - Integrated input bar with task pill support
 * - Minimize to compact bar
 * - Keyboard accessible (Escape to close)
 * - Click-outside to minimize
 * - Theme-aware (light/dark mode)
 * - SSR-safe
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * @example
 * ```html
 * <!-- Used internally by AgentXFabComponent -->
 * <nxt1-agent-x-fab-chat-panel />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  viewChild,
  ElementRef,
  afterNextRender,
  effect,
  HostListener,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AgentXQuickTask } from '@nxt1/core';
import type { AgentXMessage } from '@nxt1/core/ai';
import { ATHLETE_QUICK_TASKS, COACH_QUICK_TASKS } from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon/icon.component';
import { NxtChatBubbleComponent } from '../../components/chat-bubble';
import { NxtToastService } from '../../services/toast/toast.service';
import { AgentXService } from '../agent-x.service';
import type { ConfirmationActionEvent } from '../agent-x-confirmation-card.component';
import type { DraftSubmittedEvent } from '../agent-x-draft-card.component';
import type { AskUserReplyEvent } from '../agent-x-ask-user-card.component';
import { AgentXFabService } from './agent-x-fab.service';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

@Component({
  selector: 'nxt1-agent-x-fab-chat-panel',
  standalone: true,
  imports: [FormsModule, NxtIconComponent, NxtChatBubbleComponent],
  template: `
    <div
      class="chat-panel"
      #chatPanel
      [class.open]="isVisible()"
      role="dialog"
      aria-label="Agent X Chat"
    >
      <!-- ═══════════════════════════════════════════
           HEADER — Glass morphism with controls
           ═══════════════════════════════════════════ -->
      <header class="panel-header">
        <div class="header-left">
          <div class="header-avatar">
            <svg
              class="agent-x-logo-header"
              viewBox="0 0 612 792"
              width="26"
              height="26"
              fill="currentColor"
              stroke="currentColor"
              stroke-width="10"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path [attr.d]="agentLogoPath" />
              <polygon [attr.points]="agentLogoPolygon" />
            </svg>
          </div>
          <div class="header-info">
            <h2 class="header-title">Agent X</h2>
            <span class="header-status">
              @if (agentX.isLoading()) {
                <span class="status-dot typing"></span>
                Thinking...
              } @else {
                <span class="status-dot online"></span>
                Online
              }
            </span>
          </div>
        </div>
        <div class="header-actions">
          @if (agentX.messageCount() > 0) {
            <button
              type="button"
              class="header-btn"
              (click)="onClearChat()"
              aria-label="Clear conversation"
              title="Clear conversation"
            >
              <nxt1-icon name="refresh" [size]="16" />
            </button>
          }
          <button
            type="button"
            class="header-btn"
            (click)="onMinimize()"
            aria-label="Minimize chat"
            title="Minimize"
          >
            <nxt1-icon name="chevronDown" [size]="16" />
          </button>
          <button
            type="button"
            class="header-btn close-btn"
            (click)="onClose()"
            aria-label="Close chat"
            title="Close"
          >
            <nxt1-icon name="close" [size]="16" />
          </button>
        </div>
      </header>

      <!-- ═══════════════════════════════════════════
           BODY — Welcome screen or chat messages
           ═══════════════════════════════════════════ -->
      <div class="panel-body" #panelBody>
        @if (agentX.isEmpty()) {
          <!-- Welcome Screen -->
          <div class="welcome-container">
            <div class="welcome-icon">
              <svg
                class="agent-x-logo-welcome"
                viewBox="0 0 612 792"
                width="52"
                height="52"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="10"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path [attr.d]="agentLogoPath" />
                <polygon [attr.points]="agentLogoPolygon" />
              </svg>
            </div>
            <h3 class="welcome-heading">{{ agentX.currentTitle() }}</h3>
            <p class="welcome-text">
              Your AI-powered recruiting assistant. Ask me anything about recruiting, create
              graphics, or get personalized advice.
            </p>
            @if (!agentX.isLoggedIn()) {
              <p class="welcome-sign-in">Sign in to unlock my full capabilities for you.</p>
            }

            <!-- Suggestion Chips -->
            <div class="suggestion-chips">
              @for (task of quickTasks; track task.id) {
                <button type="button" class="suggestion-chip" (click)="onSuggestionClick(task)">
                  {{ task.title }}
                </button>
              }
            </div>
          </div>
        } @else {
          <!-- Chat Messages -->
          <div class="messages-list">
            @for (message of agentX.messages(); track message.id) {
              <div
                class="msg"
                [class.msg-user]="message.role === 'user'"
                [class.msg-assistant]="message.role === 'assistant'"
                [class.msg-error]="message.error"
              >
                @if (message.role === 'assistant') {
                  <div class="msg-avatar">
                    <svg
                      class="agent-x-logo-msg"
                      viewBox="0 0 612 792"
                      width="20"
                      height="20"
                      fill="currentColor"
                      stroke="currentColor"
                      stroke-width="10"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path [attr.d]="agentLogoPath" />
                      <polygon [attr.points]="agentLogoPolygon" />
                    </svg>
                  </div>
                }
                <nxt1-chat-bubble
                  variant="agent-fab"
                  [isOwn]="message.role === 'user'"
                  [content]="message.content"
                  [imageUrl]="message.imageUrl"
                  [isTyping]="!!message.isTyping"
                  [isError]="!!message.error"
                  [steps]="message.steps ?? []"
                  [cards]="message.cards ?? []"
                  [parts]="message.parts ?? []"
                  (confirmationAction)="onConfirmationAction($event)"
                  (draftSubmitted)="onDraftSubmitted($event)"
                  (askUserReply)="onAskUserReply($event)"
                  (retryRequested)="onRetryErrorMessage(message)"
                />
              </div>
            }
          </div>
        }
      </div>

      <!-- ═══════════════════════════════════════════
           FOOTER — Input bar
           ═══════════════════════════════════════════ -->
      <footer class="panel-footer">
        @if (agentX.selectedTask()) {
          <div class="task-pill">
            <span class="task-pill-label">{{ agentX.selectedTask()?.title }}</span>
            <button
              type="button"
              class="task-pill-close"
              (click)="agentX.clearTask()"
              aria-label="Remove task"
            >
              <nxt1-icon name="close" [size]="12" />
            </button>
          </div>
        }
        <div class="input-row">
          <textarea
            #chatInput
            class="chat-input"
            [ngModel]="agentX.getUserMessage()"
            (ngModelChange)="onInputChange($event)"
            (keydown.enter)="onEnterPress($event)"
            placeholder="Message A Coordinator..."
            rows="1"
            [maxlength]="1000"
          ></textarea>
          <button
            type="button"
            class="send-btn"
            [class.active]="agentX.canSend()"
            [disabled]="!agentX.canSend() && !agentX.isLoading()"
            (click)="onSend()"
            aria-label="Send message"
          >
            @if (agentX.isLoading()) {
              <div class="send-spinner"></div>
            } @else {
              <nxt1-icon name="arrowForward" [size]="16" />
            }
          </button>
        </div>
        <p class="footer-disclaimer">Agent X can make mistakes. Verify important info.</p>
      </footer>
    </div>
  `,
  styles: [
    `
      /* ============================================
         AGENT X CHAT PANEL — 2026 Enterprise Design
         Glass morphism, spring animations
         ============================================ */

      :host {
        display: contents;

        /* Panel dimensions */
        --panel-width: 400px;
        --panel-height: 620px;
        --panel-radius: var(--nxt1-ui-radius-2xl, 1.5rem);
        --panel-offset-bottom: var(--nxt1-spacing-6, 24px);
        --panel-offset-right: var(--nxt1-spacing-6, 24px);

        /* Glass tokens */
        --panel-bg: var(--nxt1-color-bg-primary, #0c0c0c);
        --panel-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03));
        --panel-border: var(--nxt1-glass-border, rgba(255, 255, 255, 0.08));
        --panel-shadow: 0 24px 80px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.25);
        --panel-text: var(--nxt1-color-text-primary, #ffffff);
        --panel-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --panel-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        --panel-primary: var(--nxt1-color-primary, #ccff00);
        --panel-primary-glow: var(--nxt1-ui-primary-glow, rgba(204, 255, 0, 0.08));
        --panel-error: var(--nxt1-ui-error, #ef4444);
        --panel-error-bg: var(--nxt1-ui-error-bg, rgba(239, 68, 68, 0.1));
        --panel-error-border: var(--nxt1-ui-error-border, rgba(239, 68, 68, 0.3));
        --panel-success: var(--nxt1-ui-success, #22c55e);
        --panel-success-glow: 0 0 6px rgba(34, 197, 94, 0.5);
        --panel-text-inverse: var(--nxt1-color-text-on-primary, #0a0a0a);
        --panel-z: 9995;

        /* Header glass */
        --header-bg: var(--nxt1-glass-bg, rgba(18, 18, 18, 0.85));
        --header-border: var(--nxt1-glass-borderSubtle, rgba(255, 255, 255, 0.06));
      }

      /* Light mode */
      :host-context(.light),
      :host-context([data-theme='light']) {
        --panel-bg: var(--nxt1-color-bg-primary, #ffffff);
        --panel-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.02));
        --panel-border: var(--nxt1-glass-border, rgba(0, 0, 0, 0.08));
        --panel-shadow: 0 24px 80px rgba(0, 0, 0, 0.15), 0 8px 24px rgba(0, 0, 0, 0.08);
        --panel-text: var(--nxt1-color-text-primary, #1a1a1a);
        --panel-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --panel-text-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.45));
        --panel-primary-glow: var(--nxt1-ui-primary-glow, rgba(204, 255, 0, 0.1));
        --header-bg: var(--nxt1-glass-bg, rgba(255, 255, 255, 0.85));
        --header-border: var(--nxt1-glass-borderSubtle, rgba(0, 0, 0, 0.06));
      }

      /* ── Backdrop ─────────────────────────────── */

      /* ── Chat Panel Container ─────────────────── */

      .chat-panel {
        position: fixed;
        bottom: var(--panel-offset-bottom);
        right: var(--panel-offset-right);
        z-index: var(--panel-z);
        width: var(--panel-width);
        height: var(--panel-height);
        max-height: calc(100vh - 48px);
        max-width: calc(100vw - 32px);
        display: flex;
        flex-direction: column;
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: var(--panel-radius);
        box-shadow: var(--panel-shadow);
        overflow: hidden;

        /* Spring entrance animation */
        opacity: 0;
        transform: translateY(16px) scale(0.95);
        transform-origin: bottom right;
        pointer-events: none;
        transition:
          opacity 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
          transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .chat-panel.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      /* ── Panel Header ─────────────────────────── */

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-3-5, 14px) var(--nxt1-spacing-4, 16px);
        background: var(--header-bg);
        border-bottom: 1px solid var(--header-border);
        backdrop-filter: saturate(180%) blur(20px);
        -webkit-backdrop-filter: saturate(180%) blur(20px);
        flex-shrink: 0;
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .header-avatar {
        width: 38px;
        height: 38px;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        background: var(--panel-primary);
        color: var(--panel-text-inverse);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .header-info {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .header-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: var(--panel-text);
        letter-spacing: 0.01em;
      }

      .header-status {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        color: var(--panel-text-muted);
        font-weight: 500;
      }

      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        flex-shrink: 0;
      }

      .status-dot.online {
        background: var(--panel-success);
        box-shadow: var(--panel-success-glow);
      }

      .status-dot.typing {
        background: var(--panel-primary);
        animation: statusPulse 1s ease-in-out infinite;
      }

      @keyframes statusPulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .header-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: var(--nxt1-ui-radius-default, 8px);
        border: none;
        background: transparent;
        color: var(--panel-text-muted);
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease;
      }

      .header-btn:hover {
        background: var(--panel-surface);
        color: var(--panel-text);
      }

      .header-btn.close-btn:hover {
        background: var(--panel-error-bg);
        color: var(--panel-error);
      }

      /* ── Panel Body (Scrollable) ──────────────── */

      .panel-body {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
      }

      /* Custom scrollbar */
      .panel-body::-webkit-scrollbar {
        width: 4px;
      }

      .panel-body::-webkit-scrollbar-track {
        background: transparent;
      }

      .panel-body::-webkit-scrollbar-thumb {
        background: var(--panel-border);
        border-radius: var(--nxt1-ui-radius-xs, 2px);
      }

      .panel-body::-webkit-scrollbar-thumb:hover {
        background: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
      }

      /* ── Welcome Screen ───────────────────────── */

      .welcome-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--nxt1-spacing-8, 32px) var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-5, 20px);
        text-align: center;
      }

      .welcome-icon {
        width: 72px;
        height: 72px;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        background: var(--panel-primary-glow);
        border: 1px solid var(--nxt1-ui-primary-border, rgba(204, 255, 0, 0.15));
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--panel-primary);
        margin-bottom: var(--nxt1-spacing-4, 16px);
        animation: welcomePulse 3s ease-in-out infinite;
      }

      @keyframes welcomePulse {
        0%,
        100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.03);
          opacity: 0.9;
        }
      }

      .welcome-heading {
        margin: 0 0 var(--nxt1-spacing-2, 8px);
        font-size: 20px;
        font-weight: 700;
        color: var(--panel-text);
        line-height: 1.3;
      }

      .welcome-text {
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        font-size: 13px;
        line-height: 1.5;
        color: var(--panel-text-secondary);
        max-width: 320px;
      }

      .welcome-sign-in {
        margin: 0 0 var(--nxt1-spacing-6, 24px);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.4;
        color: var(--panel-primary);
        opacity: 0.85;
      }

      /* ── Suggestion Chips ─────────────────────── */

      .suggestion-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
        justify-content: center;
        max-width: 340px;
      }

      .suggestion-chip {
        padding: var(--nxt1-spacing-2, 8px) 14px;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        border: 1px solid var(--panel-border);
        background: var(--panel-surface);
        color: var(--panel-text);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          transform 0.15s ease;
      }

      .suggestion-chip:hover {
        background: var(--panel-primary-glow);
        border-color: var(--panel-primary);
        color: var(--panel-primary);
        transform: translateY(-1px);
      }

      .suggestion-chip:active {
        transform: scale(0.97);
      }

      /* ── Messages ─────────────────────────────── */

      .messages-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px);
      }

      .msg {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        max-width: 88%;
        animation: msgFadeIn 0.25s ease-out;
      }

      @keyframes msgFadeIn {
        0% {
          opacity: 0;
          transform: translateY(6px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .msg-user {
        margin-left: auto;
        flex-direction: row-reverse;
      }

      .msg-assistant {
        margin-right: auto;
      }

      .msg-avatar {
        width: 30px;
        height: 30px;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        background: var(--panel-surface);
        border: 1px solid var(--panel-border);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--panel-primary);
      }

      /* ── Panel Footer (Input) ─────────────────── */

      .panel-footer {
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        border-top: 1px solid var(--panel-border);
        flex-shrink: 0;
        background: var(--panel-bg);
      }

      .task-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: var(--nxt1-spacing-1, 4px) 10px;
        margin-bottom: var(--nxt1-spacing-2, 8px);
        border-radius: var(--nxt1-ui-radius-xl, 16px);
        background: var(--panel-primary-glow);
        border: 1px solid var(--nxt1-ui-primary-border, rgba(204, 255, 0, 0.25));
      }

      .task-pill-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--panel-primary);
      }

      .task-pill-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        border: none;
        background: transparent;
        color: var(--panel-primary);
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.15s ease;
      }

      .task-pill-close:hover {
        opacity: 1;
      }

      .input-row {
        display: flex;
        align-items: flex-end;
        gap: var(--nxt1-spacing-2, 8px);
        background: var(--panel-surface);
        border: 1px solid var(--panel-border);
        border-radius: var(--nxt1-ui-radius-lg, 12px);
        padding: 6px 6px 6px 14px;
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease;
      }

      .input-row:focus-within {
        border-color: var(--panel-primary);
        box-shadow: 0 0 0 2px var(--panel-primary-glow);
      }

      .chat-input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: var(--panel-text);
        font-size: 13px;
        line-height: 1.5;
        resize: none;
        max-height: 100px;
        min-height: 22px;
        padding: 4px 0;
        font-family: inherit;
      }

      .chat-input::placeholder {
        color: var(--panel-text-muted);
      }

      .send-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        border-radius: var(--nxt1-ui-radius-lg, 12px);
        border: none;
        background: transparent;
        color: var(--panel-text-muted);
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          transform 0.15s ease;
      }

      .send-btn.active {
        background: var(--panel-primary);
        color: var(--panel-text-inverse);
      }

      .send-btn.active:hover {
        transform: scale(1.05);
      }

      .send-btn.active:active {
        transform: scale(0.95);
      }

      .send-btn:disabled:not(.active) {
        opacity: 0.3;
        cursor: default;
      }

      .send-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid var(--nxt1-ui-primary-border, rgba(204, 255, 0, 0.2));
        border-top-color: var(--panel-primary);
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .footer-disclaimer {
        margin: var(--nxt1-spacing-2, 8px) 0 0;
        font-size: 10px;
        color: var(--panel-text-muted);
        text-align: center;
        letter-spacing: 0.01em;
      }

      /* ── Responsive ───────────────────────────── */

      @media (max-width: 480px) {
        :host {
          --panel-offset-bottom: 0;
          --panel-offset-right: 0;
          --panel-width: 100vw;
          --panel-height: 100vh;
          --panel-radius: 0;
        }

        .chat-panel {
          max-height: 100vh;
          max-width: 100vw;
          border: none;
          border-radius: 0;
        }
      }

      @media (min-width: 481px) and (max-width: 768px) {
        :host {
          --panel-width: 380px;
          --panel-height: 560px;
        }
      }

      /* ── Reduced Motion ───────────────────────── */

      @media (prefers-reduced-motion: reduce) {
        .chat-panel {
          transition: opacity 0.15s ease;
          transform: none !important;
        }

        .chat-panel.open {
          transform: none !important;
        }

        .msg,
        .suggestion-chip,
        .welcome-icon {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXFabChatPanelComponent {
  private readonly toast = inject(NxtToastService);

  protected readonly agentX = inject(AgentXService);
  private readonly fabService = inject(AgentXFabService);

  /** Agent X logo SVG data */
  protected readonly agentLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentLogoPolygon = AGENT_X_LOGO_POLYGON;

  /** Panel container element for click-outside detection */
  private readonly chatPanel = viewChild<ElementRef>('chatPanel');

  /** Panel body element for scroll management */
  private readonly panelBody = viewChild<ElementRef>('panelBody');

  /** Chat input element for focus management */
  private readonly chatInput = viewChild<ElementRef>('chatInput');

  /** Visible state drives CSS animation (delayed slightly for enter transition) */
  protected readonly isVisible = signal(false);

  /** Quick tasks shown as suggestion chips */
  protected readonly quickTasks: readonly AgentXQuickTask[] = [
    ...ATHLETE_QUICK_TASKS.slice(0, 3),
    ...COACH_QUICK_TASKS.slice(0, 1),
  ];

  constructor() {
    // Trigger open animation after mount
    afterNextRender(() => {
      requestAnimationFrame(() => {
        this.isVisible.set(true);

        // Focus the input after animation
        setTimeout(() => {
          this.chatInput()?.nativeElement?.focus();
        }, 400);
      });
    });

    // Sync local visibility with service state (handles restore from minimized)
    effect(() => {
      const isOpen = this.fabService.isOpen();
      if (isOpen && !this.isVisible()) {
        // Service says open but panel is hidden → restore visibility
        requestAnimationFrame(() => {
          this.isVisible.set(true);
          setTimeout(() => {
            this.chatInput()?.nativeElement?.focus();
          }, 400);
        });

        // Consume any pending message injected via openWithMessage()
        const pending = this.fabService.consumePendingMessage();
        if (pending) {
          this.agentX.pushMessage({
            role: 'assistant',
            content: pending.content,
            ...(pending.imageUrl ? { imageUrl: pending.imageUrl } : {}),
          });
        }
      }
    });

    // Auto-scroll when messages change
    effect(() => {
      const messages = this.agentX.messages();
      if (messages.length > 0) {
        this.scrollToBottom();
      }
    });

    // Start title animation if not already running
    afterNextRender(() => {
      this.agentX.startTitleAnimation();
    });
  }

  /**
   * Keyboard: Escape to close
   */
  @HostListener('document:keydown.escape')
  protected onEscapeKey(): void {
    if (this.fabService.isOpen()) {
      this.onClose();
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle suggestion chip click.
   */
  protected async onSuggestionClick(task: AgentXQuickTask): Promise<void> {
    await this.agentX.selectTask(task);
    // TODO(@fab-migration): FAB streaming not yet migrated to AgentXOperationChatComponent
    this.toast.info('Open Agent X to continue your conversation.');
  }

  /**
   * Handle input text change.
   */
  protected onInputChange(value: string): void {
    this.agentX.setUserMessage(value);
    this.autoResizeInput();
  }

  /**
   * Handle Enter key press (send on Enter, newline on Shift+Enter).
   */
  protected onEnterPress(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    if (!keyEvent.shiftKey && this.agentX.canSend()) {
      event.preventDefault();
      this.onSend();
    }
  }

  /**
   * Send the current message.
   */
  protected async onSend(): Promise<void> {
    // TODO(@fab-migration): FAB streaming not yet migrated to AgentXOperationChatComponent
    this.toast.info('Open Agent X to continue your conversation.');

    // Reset textarea height
    const textarea = this.chatInput()?.nativeElement;
    if (textarea) {
      textarea.style.height = 'auto';
    }
  }

  /**
   * Clear the conversation.
   */
  protected async onClearChat(): Promise<void> {
    await this.agentX.clearMessages();
  }

  /**
   * Handle draft email approval from chat bubble card.
   */
  protected async onDraftSubmitted(event: DraftSubmittedEvent): Promise<void> {
    if (event.approvalId) {
      await this.agentX.resolveInlineApproval({
        approvalId: event.approvalId,
        decision: 'approved',
        toolInput: {
          ...(event.toEmail ? { toEmail: event.toEmail } : {}),
          subject: event.subject,
          bodyHtml: event.content,
        },
        successMessage: 'Draft approved — Agent X is resuming',
      });
      return;
    }

    this.toast.error('This draft can no longer be sent directly. Refresh and try again.');
  }

  /** Route an ask_user card reply into the chat as a user message. */
  protected async onAskUserReply(event: AskUserReplyEvent): Promise<void> {
    this.agentX.setUserMessage(event.answer);
    // TODO(@fab-migration): FAB streaming not yet migrated to AgentXOperationChatComponent
    this.toast.info('Open Agent X to continue your conversation.');
  }

  protected async onConfirmationAction(event: ConfirmationActionEvent): Promise<void> {
    const decision =
      event.actionId === 'approve' ? 'approved' : event.actionId === 'reject' ? 'rejected' : null;

    if (!decision) return;

    await this.agentX.resolveInlineApproval({
      approvalId: event.approvalId ?? '',
      decision,
      successMessage:
        decision === 'approved' ? 'Approved — Agent X is resuming' : 'Request rejected',
    });
  }

  /** Remove the error bubble and pre-populate the input with the failed message. */
  protected onRetryErrorMessage(errorMsg: AgentXMessage): void {
    const msgs = this.agentX.messages();
    const errorIdx = msgs.findIndex((m) => m.id === errorMsg.id);
    const lastUserMsg = [...msgs]
      .slice(0, errorIdx)
      .reverse()
      .find((m) => m.role === 'user');

    // Remove error bubble from history
    this.agentX.removeMessage(errorMsg.id);

    if (lastUserMsg) {
      this.agentX.setUserMessage(lastUserMsg.content);
    }
    this.toast.info('Message restored — tap Send to retry.');
  }

  /**
   * Minimize the panel.
   */
  protected onMinimize(): void {
    this.isVisible.set(false);
    setTimeout(() => {
      this.fabService.minimize();
    }, 200);
  }

  /**
   * Close the panel.
   */
  protected onClose(): void {
    this.isVisible.set(false);
    setTimeout(() => {
      this.fabService.close();
    }, 200);
  }

  /**
   * Handle click outside the panel — minimize (not close, to preserve context).
   * Uses document-level listener so page scroll is never blocked.
   * Only active when the panel is fully open (not minimized/closed).
   */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    // Only act when panel is fully open and visible
    if (!this.fabService.isOpen() || !this.isVisible()) return;

    const panelEl = this.chatPanel()?.nativeElement;
    if (!panelEl) return;

    // If click is inside the panel or on the FAB/minimized bar, ignore
    const target = event.target as HTMLElement;
    if (
      panelEl.contains(target) ||
      target.closest('.fab-button, .minimized-bar, .minimized-action-btn')
    ) {
      return;
    }

    this.onMinimize();
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Scroll messages to bottom.
   */
  private scrollToBottom(): void {
    const el = this.panelBody()?.nativeElement;
    if (el) {
      setTimeout(() => {
        el.scrollTop = el.scrollHeight;
      }, 50);
    }
  }

  /**
   * Auto-resize textarea to fit content.
   */
  private autoResizeInput(): void {
    const textarea = this.chatInput()?.nativeElement;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }
  }
}
