/**
 * @fileoverview Agent X Profile Card — Player Snapshot
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Renders a compact micro-profile card inline in the Agent X chat timeline.
 * Displays avatar, name, position, grad year, and key stats.
 * Emits the userId when the "View Profile" button is pressed.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import type { AgentXRichCard, AgentXProfilePayload, AgentXProfileStat } from '@nxt1/core/ai';

@Component({
  selector: 'nxt1-agent-x-profile-card',
  standalone: true,
  template: `
    <div class="profile-card">
      <div class="profile-card__header">
        <svg class="profile-card__header-icon" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="7" r="4" stroke="currentColor" stroke-width="1.5" />
          <path
            d="M3 18C3 14.134 6.134 12 10 12C13.866 12 17 14.134 17 18"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
        <span class="profile-card__header-title">{{ card().title }}</span>
      </div>

      <div class="profile-card__body">
        <div class="profile-card__identity">
          <div class="profile-card__avatar">
            @if (avatarUrl()) {
              <img
                [src]="avatarUrl()"
                [alt]="name()"
                class="profile-card__avatar-img"
                loading="lazy"
              />
            } @else {
              <div class="profile-card__avatar-fallback">
                {{ nameInitial() }}
              </div>
            }
          </div>
          <div class="profile-card__info">
            <span class="profile-card__name">{{ name() }}</span>
            <span class="profile-card__meta">
              @if (position()) {
                {{ position() }}
              }
              @if (position() && gradYear()) {
                &middot;
              }
              @if (gradYear()) {
                Class of {{ gradYear() }}
              }
            </span>
          </div>
        </div>

        @if (stats().length > 0) {
          <div class="profile-card__stats">
            @for (stat of stats(); track stat.label) {
              <div class="profile-stat">
                <span class="profile-stat__value">{{ stat.value }}</span>
                <span class="profile-stat__label">{{ stat.label }}</span>
              </div>
            }
          </div>
        }
      </div>

      <button class="profile-card__action" type="button" (click)="onViewProfile()">
        View Profile
        <svg class="profile-card__arrow" viewBox="0 0 16 16" fill="none">
          <path
            d="M6 4L10 8L6 12"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  `,
  styles: [
    `
      .profile-card {
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        overflow: hidden;
        margin-top: 8px;
      }

      .profile-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .profile-card__header-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .profile-card__header-title {
        flex: 1;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .profile-card__body {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* ── Identity row ── */

      .profile-card__identity {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .profile-card__avatar {
        width: 48px;
        height: 48px;
        flex-shrink: 0;
        border-radius: 50%;
        overflow: hidden;
      }

      .profile-card__avatar-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .profile-card__avatar-fallback {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-size: 1.125rem;
        font-weight: 700;
        text-transform: uppercase;
      }

      .profile-card__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .profile-card__name {
        font-size: 0.9375rem;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .profile-card__meta {
        font-size: 0.75rem;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* ── Stats grid ── */

      .profile-card__stats {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .profile-stat {
        flex: 1 1 0;
        min-width: 56px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 8px 6px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-radius: 8px;
      }

      .profile-stat__value {
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        font-variant-numeric: tabular-nums;
      }

      .profile-stat__label {
        font-size: 0.625rem;
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      /* ── Action button ── */

      .profile-card__action {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        width: 100%;
        padding: 10px;
        border: none;
        border-top: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: transparent;
        color: var(--nxt1-color-primary, #ccff00);
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .profile-card__action:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      .profile-card__action:active {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
      }

      .profile-card__arrow {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXProfileCardComponent {
  /** The rich card data (type, title, payload). */
  readonly card = input.required<AgentXRichCard>();

  /** Emitted when the user clicks "View Profile". Sends the userId. */
  readonly profileClicked = output<string>();

  /** Extract the display name. */
  protected readonly name = computed<string>(() => {
    const payload = this.card().payload as AgentXProfilePayload;
    return typeof payload?.name === 'string' ? payload.name : '';
  });

  /** Extract avatar URL. */
  protected readonly avatarUrl = computed<string>(() => {
    const payload = this.card().payload as AgentXProfilePayload;
    return typeof payload?.avatarUrl === 'string' ? payload.avatarUrl : '';
  });

  /** Extract position. */
  protected readonly position = computed<string>(() => {
    const payload = this.card().payload as AgentXProfilePayload;
    return typeof payload?.position === 'string' ? payload.position : '';
  });

  /** Extract graduation year. */
  protected readonly gradYear = computed<number | undefined>(() => {
    const payload = this.card().payload as AgentXProfilePayload;
    return typeof payload?.gradYear === 'number' ? payload.gradYear : undefined;
  });

  /** Extract stats array. */
  protected readonly stats = computed<readonly AgentXProfileStat[]>(() => {
    const payload = this.card().payload as AgentXProfilePayload;
    return Array.isArray(payload?.stats) ? payload.stats : [];
  });

  /** Compute first initial for avatar fallback. */
  protected readonly nameInitial = computed<string>(() => {
    const n = this.name();
    return n.length > 0 ? n.charAt(0) : '?';
  });

  protected onViewProfile(): void {
    const payload = this.card().payload as AgentXProfilePayload;
    if (typeof payload?.userId === 'string') {
      this.profileClicked.emit(payload.userId);
    }
  }
}
