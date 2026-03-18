/**
 * @fileoverview Agent X Dashboard Skeleton - Loading State
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Shared loading skeleton for the Agent X dashboard on web and mobile.
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-agent-x-dashboard-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="agent-skeleton" aria-hidden="true">
      <section class="skeleton-card skeleton-card--briefing">
        <div class="skeleton-status-row">
          <div class="skeleton-dot skeleton-shimmer"></div>
          <div class="skeleton-line skeleton-line--status skeleton-shimmer"></div>
        </div>
        <div class="skeleton-line skeleton-line--greeting skeleton-shimmer"></div>
        <div class="skeleton-briefing-copy">
          <div class="skeleton-line skeleton-line--body skeleton-shimmer"></div>
          <div
            class="skeleton-line skeleton-line--body skeleton-line--body-short skeleton-shimmer"
          ></div>
        </div>
        <div class="skeleton-btn skeleton-shimmer"></div>
      </section>

      <section class="skeleton-card">
        <div class="skeleton-line skeleton-line--section-title skeleton-shimmer"></div>
        <div class="skeleton-coordinator-grid">
          @for (item of [1, 2, 3, 4]; track item) {
            <div class="skeleton-coordinator-card">
              <div class="skeleton-icon skeleton-shimmer"></div>
              <div class="skeleton-line skeleton-line--card-label skeleton-shimmer"></div>
            </div>
          }
        </div>
      </section>

      <section class="skeleton-card">
        <div class="skeleton-playbook-header">
          <div class="skeleton-line skeleton-line--section-title skeleton-shimmer"></div>
          <div class="skeleton-btn skeleton-btn--small skeleton-shimmer"></div>
        </div>
        <div class="skeleton-pill-row">
          <div class="skeleton-pill skeleton-pill--active skeleton-shimmer"></div>
          <div class="skeleton-pill skeleton-shimmer"></div>
        </div>
        <div class="skeleton-timeline">
          @for (item of [1, 2, 3]; track item) {
            <div class="skeleton-timeline-item">
              <div class="skeleton-timeline-rail">
                <div class="skeleton-marker skeleton-shimmer"></div>
                @if (item < 3) {
                  <div class="skeleton-rail-line skeleton-shimmer"></div>
                }
              </div>
              <div class="skeleton-timeline-card">
                <div class="skeleton-line skeleton-line--timeline-title skeleton-shimmer"></div>
                <div class="skeleton-line skeleton-line--timeline-copy skeleton-shimmer"></div>
                <div
                  class="skeleton-line skeleton-line--timeline-copy skeleton-line--timeline-copy-short skeleton-shimmer"
                ></div>
              </div>
            </div>
          }
        </div>
      </section>

      <section class="skeleton-card">
        <div class="skeleton-line skeleton-line--section-title skeleton-shimmer"></div>
        <div class="skeleton-operations-row">
          @for (item of [1, 2]; track item) {
            <div class="skeleton-operation-card">
              <div class="skeleton-operation-top">
                <div class="skeleton-icon skeleton-icon--sm skeleton-shimmer"></div>
                <div class="skeleton-line skeleton-line--operation-title skeleton-shimmer"></div>
              </div>
              <div class="skeleton-progress skeleton-shimmer"></div>
              <div class="skeleton-operation-bottom">
                <div class="skeleton-pill skeleton-pill--status skeleton-shimmer"></div>
                <div class="skeleton-icon skeleton-icon--xs skeleton-shimmer"></div>
              </div>
            </div>
          }
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .agent-skeleton {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 4px 0 16px;
      }

      .skeleton-card,
      .skeleton-coordinator-card,
      .skeleton-timeline-card,
      .skeleton-operation-card {
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 18px;
      }

      .skeleton-card {
        padding: 18px;
      }

      .skeleton-card--briefing {
        padding: 20px;
      }

      .skeleton-shimmer {
        position: relative;
        overflow: hidden;
        background: var(--nxt1-color-loading-skeleton);
      }

      .skeleton-shimmer::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          var(--nxt1-color-loading-skeletonShimmer) 50%,
          transparent 100%
        );
        animation: agent-skeleton-shimmer 1.5s infinite ease-in-out;
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

      .skeleton-line,
      .skeleton-btn,
      .skeleton-pill,
      .skeleton-icon,
      .skeleton-dot,
      .skeleton-progress,
      .skeleton-marker,
      .skeleton-rail-line {
        border-radius: 999px;
      }

      .skeleton-status-row,
      .skeleton-playbook-header,
      .skeleton-operation-top,
      .skeleton-operation-bottom {
        display: flex;
        align-items: center;
      }

      .skeleton-status-row {
        gap: 8px;
        margin-bottom: 18px;
      }

      .skeleton-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
      }

      .skeleton-line--status {
        width: 72px;
        height: 12px;
      }

      .skeleton-line--greeting {
        width: 48%;
        height: 28px;
        margin-bottom: 16px;
      }

      .skeleton-briefing-copy {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 18px;
      }

      .skeleton-line--body {
        width: 100%;
        height: 14px;
      }

      .skeleton-line--body-short {
        width: 78%;
      }

      .skeleton-btn {
        width: 128px;
        height: 36px;
      }

      .skeleton-btn--small {
        width: 92px;
        height: 30px;
      }

      .skeleton-line--section-title {
        width: 136px;
        height: 18px;
        margin-bottom: 16px;
      }

      .skeleton-coordinator-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .skeleton-coordinator-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 16px 12px;
      }

      .skeleton-icon {
        width: 36px;
        height: 36px;
        border-radius: 12px;
      }

      .skeleton-icon--sm {
        width: 18px;
        height: 18px;
        border-radius: 8px;
      }

      .skeleton-icon--xs {
        width: 12px;
        height: 12px;
        border-radius: 50%;
      }

      .skeleton-line--card-label {
        width: 72px;
        height: 12px;
      }

      .skeleton-playbook-header {
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 16px;
      }

      .skeleton-playbook-header .skeleton-line--section-title {
        margin-bottom: 0;
      }

      .skeleton-pill-row {
        display: flex;
        gap: 10px;
        margin-bottom: 18px;
      }

      .skeleton-pill {
        width: 112px;
        height: 34px;
      }

      .skeleton-pill--active {
        width: 128px;
      }

      .skeleton-pill--status {
        width: 92px;
        height: 24px;
      }

      .skeleton-timeline {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .skeleton-timeline-item {
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr);
        gap: 12px;
      }

      .skeleton-timeline-rail {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }

      .skeleton-marker {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        margin-top: 4px;
      }

      .skeleton-rail-line {
        width: 2px;
        flex: 1;
        min-height: 56px;
      }

      .skeleton-timeline-card {
        padding: 14px;
      }

      .skeleton-line--timeline-title {
        width: 58%;
        height: 16px;
        margin-bottom: 12px;
      }

      .skeleton-line--timeline-copy {
        width: 100%;
        height: 12px;
        margin-bottom: 8px;
      }

      .skeleton-line--timeline-copy-short {
        width: 74%;
        margin-bottom: 0;
      }

      .skeleton-operations-row {
        display: flex;
        gap: 12px;
      }

      .skeleton-operation-card {
        flex: 1;
        min-width: 0;
        padding: 14px;
      }

      .skeleton-operation-top {
        gap: 10px;
        margin-bottom: 14px;
      }

      .skeleton-line--operation-title {
        width: 100%;
        height: 12px;
      }

      .skeleton-progress {
        width: 100%;
        height: 8px;
        margin-bottom: 14px;
      }

      .skeleton-operation-bottom {
        justify-content: space-between;
        gap: 8px;
      }

      @media (max-width: 767px) {
        .agent-skeleton {
          gap: 14px;
        }

        .skeleton-card,
        .skeleton-card--briefing {
          padding: 16px;
        }

        .skeleton-line--greeting {
          width: 72%;
        }

        .skeleton-operations-row {
          flex-direction: column;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXDashboardSkeletonComponent {}
