import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ShellWeeklyPlaybookItem } from '@nxt1/core/ai';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

@Component({
  selector: 'nxt1-agent-x-action-plan-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="action-card"
      [class.action-card--enter]="animateIn()"
      [class.action-card--featured]="featured()"
      [style.animation-delay]="animationDelayMs() + 'ms'"
    >
      <div class="card-coordinator">
        <div class="coordinator-avatar" aria-hidden="true">
          <svg viewBox="0 0 612 792" class="coordinator-mark">
            <path [attr.d]="agentXLogoPath" />
          </svg>
        </div>
        <div class="coordinator-copy">
          <span class="coordinator-brand">Agent X</span>
          @if (task().coordinator) {
            <span class="coordinator-role">{{ task().coordinator!.label }}</span>
          }
        </div>
      </div>

      <div class="card-content">
        <div class="card-title">{{ task().title }}</div>
        <p class="card-description">{{ task().summary }}</p>
        @if (showWhy() && task().why) {
          <p class="card-why">
            <svg
              class="agent-x-mark"
              width="16"
              height="16"
              viewBox="0 0 612 792"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path [attr.d]="agentXLogoPath" />
              <polygon [attr.points]="agentXLogoPolygon" />
            </svg>
            {{ task().why }}
          </p>
        }
      </div>

      @if (showActions()) {
        <div class="card-actions">
          <button type="button" class="action-btn primary-btn" (click)="actionClick.emit()">
            {{ task().actionLabel }}
          </button>
          <div class="card-secondary-actions">
            <button type="button" class="action-btn snooze-btn" (click)="snoozeClick.emit()">
              Snooze
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .action-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--agent-action-card-padding, var(--nxt1-spacing-4, 16px));
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        margin-bottom: var(--agent-action-card-margin-bottom, var(--nxt1-spacing-3, 12px));
        transition:
          background 0.2s ease,
          border-color 0.2s ease,
          opacity 0.22s ease,
          transform 0.22s ease,
          filter 0.22s ease;
      }

      .action-card:hover {
        background: var(--agent-surface-hover);
      }

      .action-card--featured {
        border-color: var(--agent-primary-glow);
        background: linear-gradient(180deg, var(--agent-surface), var(--agent-surface-hover));
      }

      .action-card--enter {
        opacity: 0;
        animation: agent-action-plan-card-slide-in 0.38s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }

      .card-coordinator {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .coordinator-avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--agent-action-card-avatar-size, 56px);
        height: var(--agent-action-card-avatar-size, 56px);
        border-radius: 50%;
        background: var(--agent-primary-glow);
        color: var(--agent-primary);
        flex-shrink: 0;
      }

      .coordinator-mark {
        width: var(--agent-action-card-mark-size, 34px);
        height: var(--agent-action-card-mark-size, 34px);
        fill: currentColor;
      }

      .coordinator-copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .coordinator-brand {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: var(--agent-text-primary, #fff);
      }

      .coordinator-role {
        font-size: 13px;
        font-weight: 600;
        color: var(--agent-text-secondary);
      }

      .card-content {
        flex: 1;
        min-width: 0;
      }

      .card-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--agent-text-primary);
        line-height: 1.4;
      }

      .card-description {
        margin: 8px 0 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--agent-text-secondary);
      }

      .card-why {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 6px 0 0;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.45;
        color: var(--agent-primary);
        background: var(--agent-primary-glow);
        border-radius: var(--nxt1-radius-md, 8px);
        border-left: 2px solid var(--agent-primary);
      }

      .agent-x-mark {
        flex-shrink: 0;
        margin-top: 1px;
      }

      .card-actions {
        display: flex;
        flex-direction: var(--agent-action-card-actions-direction, column);
        align-items: var(--agent-action-card-actions-align, stretch);
        justify-content: var(--agent-action-card-actions-justify, flex-start);
        flex-wrap: var(--agent-action-card-actions-wrap, nowrap);
        gap: 8px;
        width: 100%;
      }

      .card-secondary-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        width: var(--agent-action-card-secondary-width, auto);
      }

      .action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--agent-action-card-button-padding, 6px 14px);
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition:
          opacity 0.15s ease,
          transform 0.1s ease;
        border: none;
        align-self: var(--agent-action-card-button-align-self, flex-start);
        width: var(--agent-action-card-button-width, auto);
      }

      .action-btn:hover {
        opacity: 0.9;
      }

      .action-btn:active {
        opacity: 0.9;
        transform: scale(0.96);
      }

      .primary-btn {
        background: var(--agent-primary);
        color: var(--nxt1-color-bg-primary, #0a0a0a);
        animation: agent-pulse 2.8s ease-in-out infinite;
        width: var(--agent-action-card-primary-width, 100%);
      }

      .snooze-btn {
        background: transparent;
        border: 1px solid var(--agent-border);
        color: var(--agent-text-secondary);
      }

      @keyframes agent-action-plan-card-slide-in {
        from {
          opacity: 0;
          transform: translateY(12px) scale(0.985);
          filter: blur(4px);
        }

        to {
          opacity: 1;
          transform: translateY(0) scale(1);
          filter: blur(0);
        }
      }
    `,
  ],
})
export class AgentXActionPlanCardComponent {
  readonly task = input.required<ShellWeeklyPlaybookItem>();
  readonly animationDelayMs = input(0);
  readonly animateIn = input(true);
  readonly featured = input(false);
  readonly showActions = input(true);
  readonly showWhy = input(true);
  readonly actionClick = output<void>();
  readonly snoozeClick = output<void>();
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;
}
