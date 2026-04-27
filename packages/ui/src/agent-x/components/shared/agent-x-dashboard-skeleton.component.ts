/**
 * @fileoverview Agent X Dashboard Skeleton - Loading State
 * @module @nxt1/ui/agent-x
 *
 * Layout-aware skeleton loader that mirrors the real Agent X shell structure:
 * - mobile: briefing + game plan + chips + input tray
 * - desktop: sessions rail + chat stream + action panel
 */

import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-agent-x-dashboard-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="agent-skeleton" aria-hidden="true">
      @if (variant() === 'desktop') {
        <div
          class="desktop-grid"
          [class.desktop-grid--sessions]="showSessionsRail()"
          [class.desktop-grid--right]="showRightPanel()"
          [class.desktop-grid--expanded]="showExpandedPanel()"
        >
          @if (showSessionsRail()) {
            <aside class="desktop-rail surface-block">
              <div class="desktop-rail__header">
                <div class="skeleton-line skeleton-shimmer h-16 w-40"></div>
                <div class="skeleton-circle skeleton-shimmer size-24"></div>
              </div>
              <div class="skeleton-line skeleton-shimmer h-12 w-64"></div>
              <div class="skeleton-pill w-100 h-34 skeleton-shimmer"></div>
              <div class="desktop-rail__list">
                @for (entry of [1, 2, 3, 4, 5]; track entry) {
                  <div class="surface-block surface-block--compact rail-entry">
                    <div class="skeleton-circle size-30 skeleton-shimmer"></div>
                    <div class="rail-entry__copy">
                      <div class="skeleton-line w-70 skeleton-shimmer h-12"></div>
                      <div class="skeleton-line w-50 skeleton-shimmer h-10"></div>
                    </div>
                  </div>
                }
              </div>
            </aside>
          }

          <section class="desktop-chat">
            <div class="desktop-briefing">
              <div class="skeleton-line h-30 skeleton-shimmer w-48"></div>
              <div class="desktop-briefing__copy">
                <div class="skeleton-line w-100 skeleton-shimmer h-14"></div>
                <div class="skeleton-line skeleton-shimmer h-14 w-72"></div>
                <div class="skeleton-line skeleton-shimmer h-12 w-20"></div>
              </div>
            </div>

            <div class="desktop-chat__stream">
              @for (row of [1, 2, 3, 4, 5, 6]; track row) {
                <div class="chat-row" [class.chat-row--user]="row % 3 === 0">
                  <div class="chat-bubble surface-block surface-block--compact">
                    <div class="skeleton-line w-100 skeleton-shimmer h-12"></div>
                    <div class="skeleton-line w-82 skeleton-shimmer h-12"></div>
                  </div>
                </div>
              }
            </div>

            <div class="desktop-chat__composer surface-block surface-block--compact">
              <div class="skeleton-pill w-100 h-42 skeleton-shimmer"></div>
            </div>
          </section>

          @if (showRightPanel()) {
            <aside class="desktop-right">
              <div class="desktop-right__header">
                <div class="skeleton-pill w-55 h-34 skeleton-shimmer"></div>
                <div class="skeleton-circle skeleton-shimmer size-28"></div>
              </div>

              <section class="surface-block">
                <div class="right-title-row">
                  <div class="skeleton-line h-18 skeleton-shimmer w-56"></div>
                  <div class="skeleton-line skeleton-shimmer h-14 w-24"></div>
                </div>
                <div class="skeleton-line w-46 skeleton-shimmer h-4"></div>
              </section>

              <section class="surface-block">
                <div class="right-pill-row">
                  <div class="skeleton-pill w-42 h-30 skeleton-shimmer"></div>
                  <div class="skeleton-pill w-34 h-30 skeleton-shimmer"></div>
                </div>

                @for (task of [1, 2, 3]; track task) {
                  <div class="surface-block surface-block--compact right-task">
                    <div class="right-task__head">
                      <div class="skeleton-circle skeleton-shimmer size-32"></div>
                      <div class="right-task__meta">
                        <div class="skeleton-line skeleton-shimmer h-12 w-44"></div>
                        <div class="skeleton-line w-30 skeleton-shimmer h-10"></div>
                      </div>
                    </div>
                    <div class="skeleton-line skeleton-shimmer h-14 w-80"></div>
                    <div class="skeleton-line w-100 skeleton-shimmer h-12"></div>
                    <div class="skeleton-pill w-100 h-34 skeleton-shimmer"></div>
                  </div>
                }
              </section>
            </aside>
          }
        </div>
      } @else {
        <div class="mobile-stack">
          <section class="mobile-briefing">
            <div class="mobile-status-row">
              <div class="skeleton-line skeleton-shimmer h-12 w-20"></div>
              <div class="skeleton-circle skeleton-shimmer size-10"></div>
            </div>
            <div class="skeleton-line h-30 skeleton-shimmer w-60"></div>
            <div class="mobile-briefing__copy">
              <div class="skeleton-line w-100 skeleton-shimmer h-14"></div>
              <div class="skeleton-line w-74 skeleton-shimmer h-14"></div>
            </div>
            <div class="mobile-goals-row">
              <div class="skeleton-pill w-100 skeleton-shimmer h-40"></div>
              <div class="skeleton-pill w-100 skeleton-shimmer h-40"></div>
            </div>
          </section>

          <section class="mobile-plan surface-block">
            <div class="mobile-plan__header">
              <div class="skeleton-line h-18 skeleton-shimmer w-56"></div>
              <div class="mobile-progress">
                <div class="skeleton-line w-34 skeleton-shimmer h-14"></div>
                <div class="skeleton-line skeleton-shimmer h-4 w-24"></div>
              </div>
            </div>

            <div class="mobile-pill-row">
              <div class="skeleton-pill h-30 skeleton-shimmer w-36"></div>
              <div class="skeleton-pill w-30 h-30 skeleton-shimmer"></div>
            </div>

            @for (task of [1, 2]; track task) {
              <div class="surface-block surface-block--compact mobile-task">
                <div class="mobile-task__head">
                  <div class="skeleton-circle size-42 skeleton-shimmer"></div>
                  <div class="mobile-task__meta">
                    <div class="skeleton-line skeleton-shimmer h-12 w-40"></div>
                    <div class="skeleton-line w-30 skeleton-shimmer h-11"></div>
                  </div>
                </div>
                <div class="skeleton-line w-82 skeleton-shimmer h-14"></div>
                <div class="skeleton-line w-100 skeleton-shimmer h-12"></div>
                <div class="skeleton-pill w-100 h-38 skeleton-shimmer"></div>
                <div class="mobile-task__actions">
                  <div class="skeleton-pill skeleton-shimmer h-32 w-48"></div>
                  <div class="skeleton-pill skeleton-shimmer h-32 w-48"></div>
                </div>
              </div>
            }
          </section>

          <section class="mobile-chips">
            <div class="mobile-chips__scroll">
              @for (chip of [1, 2, 3, 4]; track chip) {
                <div class="skeleton-pill w-30 h-38 skeleton-shimmer"></div>
              }
            </div>
          </section>

          <section class="mobile-composer surface-block">
            <div class="skeleton-pill w-100 skeleton-shimmer h-44"></div>
          </section>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .agent-skeleton {
        width: 100%;
        min-height: 0;
      }

      .skeleton-shimmer {
        position: relative;
        overflow: hidden;
        background: var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08));
      }

      .skeleton-shimmer::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          var(--nxt1-color-loading-skeletonShimmer, rgba(255, 255, 255, 0.16)) 50%,
          transparent 100%
        );
        animation: agent-skeleton-shimmer 1.45s ease-in-out infinite;
      }

      @keyframes agent-skeleton-shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .skeleton-shimmer::after {
          animation: none;
        }
      }

      .surface-block {
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 16px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        padding: 16px;
      }

      .surface-block--compact {
        border-radius: 14px;
        padding: 12px;
      }

      .skeleton-line,
      .skeleton-pill,
      .skeleton-circle {
        border-radius: 999px;
      }

      .skeleton-circle {
        flex: 0 0 auto;
      }

      .h-4 {
        height: 4px;
      }

      .h-10 {
        height: 10px;
      }

      .h-11 {
        height: 11px;
      }

      .h-12 {
        height: 12px;
      }

      .h-14 {
        height: 14px;
      }

      .h-16 {
        height: 16px;
      }

      .h-18 {
        height: 18px;
      }

      .h-30 {
        height: 30px;
      }

      .h-32 {
        height: 32px;
      }

      .h-34 {
        height: 34px;
      }

      .h-38 {
        height: 38px;
      }

      .h-40 {
        height: 40px;
      }

      .h-42 {
        height: 42px;
      }

      .h-44 {
        height: 44px;
      }

      .w-20 {
        width: 20%;
      }

      .w-24 {
        width: 24%;
      }

      .w-30 {
        width: 30%;
      }

      .w-34 {
        width: 34%;
      }

      .w-36 {
        width: 36%;
      }

      .w-40 {
        width: 40%;
      }

      .w-42 {
        width: 42%;
      }

      .w-44 {
        width: 44%;
      }

      .w-46 {
        width: 46%;
      }

      .w-48 {
        width: 48%;
      }

      .w-50 {
        width: 50%;
      }

      .w-55 {
        width: 55%;
      }

      .w-56 {
        width: 56%;
      }

      .w-60 {
        width: 60%;
      }

      .w-64 {
        width: 64%;
      }

      .w-70 {
        width: 70%;
      }

      .w-72 {
        width: 72%;
      }

      .w-74 {
        width: 74%;
      }

      .w-80 {
        width: 80%;
      }

      .w-82 {
        width: 82%;
      }

      .w-100 {
        width: 100%;
      }

      .size-10 {
        width: 10px;
        height: 10px;
      }

      .size-24 {
        width: 24px;
        height: 24px;
      }

      .size-28 {
        width: 28px;
        height: 28px;
      }

      .size-30 {
        width: 30px;
        height: 30px;
      }

      .size-32 {
        width: 32px;
        height: 32px;
      }

      .size-42 {
        width: 42px;
        height: 42px;
      }

      .mobile-stack {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 2px 0 14px;
      }

      .mobile-briefing {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-top: 6px;
      }

      .mobile-status-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .mobile-briefing__copy {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .mobile-goals-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .mobile-plan {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .mobile-plan__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .mobile-progress {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-end;
      }

      .mobile-pill-row {
        display: flex;
        gap: 8px;
      }

      .mobile-task {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .mobile-task__head {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .mobile-task__meta {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 100%;
      }

      .mobile-task__actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .mobile-chips {
        overflow: hidden;
      }

      .mobile-chips__scroll {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        scrollbar-width: none;
      }

      .mobile-chips__scroll::-webkit-scrollbar {
        display: none;
      }

      .mobile-composer {
        padding: 10px;
      }

      .desktop-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        min-height: calc(100vh - var(--nxt1-nav-height, 56px));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 18px;
        overflow: hidden;
        background: var(--nxt1-color-bg-primary, transparent);
      }

      .desktop-grid--sessions {
        grid-template-columns: var(--agent-skeleton-left-width, 280px) minmax(0, 1fr);
      }

      .desktop-grid--right {
        grid-template-columns: minmax(0, 1fr) var(--agent-skeleton-right-width, 320px);
      }

      .desktop-grid--sessions.desktop-grid--right {
        grid-template-columns:
          var(--agent-skeleton-left-width, 280px)
          minmax(0, 1fr)
          var(--agent-skeleton-right-width, 320px);
      }

      .desktop-grid--expanded {
        --agent-skeleton-right-width: 540px;
      }

      .desktop-rail,
      .desktop-chat,
      .desktop-right {
        min-width: 0;
        min-height: 0;
      }

      .desktop-rail {
        display: flex;
        flex-direction: column;
        gap: 12px;
        border-right: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 0;
        background: transparent;
      }

      .desktop-rail__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .desktop-rail__list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .rail-entry {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .rail-entry__copy {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 100%;
      }

      .desktop-chat {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 20px;
      }

      .desktop-briefing {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .desktop-briefing__copy {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .desktop-chat__stream {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 0;
        flex: 1;
      }

      .chat-row {
        display: flex;
        justify-content: flex-start;
      }

      .chat-row--user {
        justify-content: flex-end;
      }

      .chat-bubble {
        width: min(68%, 560px);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .chat-row--user .chat-bubble {
        width: min(56%, 460px);
      }

      .desktop-chat__composer {
        padding: 10px;
      }

      .desktop-right {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        border-left: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .desktop-right__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .right-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }

      .right-pill-row {
        display: flex;
        gap: 8px;
      }

      .right-task {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 9px;
      }

      .right-task__head {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .right-task__meta {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 100%;
      }

      @media (max-width: 1024px) {
        .desktop-grid,
        .desktop-grid--sessions,
        .desktop-grid--right,
        .desktop-grid--sessions.desktop-grid--right {
          grid-template-columns: minmax(0, 1fr);
          min-height: 0;
          border: 0;
          border-radius: 0;
        }

        .desktop-rail,
        .desktop-right {
          display: none;
        }

        .desktop-chat {
          padding: 10px 0 14px;
        }

        .chat-bubble,
        .chat-row--user .chat-bubble {
          width: 100%;
        }
      }

      @media (max-width: 420px) {
        .mobile-goals-row {
          grid-template-columns: 1fr;
        }

        .mobile-task__actions {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXDashboardSkeletonComponent {
  readonly variant = input<'mobile' | 'desktop'>('mobile');
  readonly showSessionsRail = input(false);
  readonly showActionPlan = input(false);
  readonly showExpandedPanel = input(false);

  protected readonly showRightPanel = computed(
    () => this.showActionPlan() || this.showExpandedPanel()
  );
}
