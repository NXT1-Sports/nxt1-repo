/**
 * @fileoverview Agent X Film Timeline Card — Video Marker Strip
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Renders a stacked list of timestamped film markers inline in the Agent X
 * chat timeline. Each marker shows a formatted timestamp (MM:SS), a label,
 * and an optional sentiment chip (positive / negative / neutral).
 * Clicking a marker emits the timestamp in milliseconds so the host can
 * seek the video player.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import type { AgentXRichCard, AgentXFilmTimelinePayload, AgentXFilmMarker } from '@nxt1/core/ai';

@Component({
  selector: 'nxt1-agent-x-film-timeline-card',
  standalone: true,
  template: `
    <div class="film-card">
      <div class="film-card__header">
        <svg class="film-card__header-icon" viewBox="0 0 20 20" fill="none">
          <rect
            x="2"
            y="4"
            width="16"
            height="12"
            rx="2"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <path d="M7 4V16" stroke="currentColor" stroke-width="1.5" />
          <path d="M13 4V16" stroke="currentColor" stroke-width="1.5" />
          <path d="M2 8H18" stroke="currentColor" stroke-width="1.5" />
          <path d="M2 12H18" stroke="currentColor" stroke-width="1.5" />
        </svg>
        <span class="film-card__header-title">{{ card().title }}</span>
        <span class="film-card__badge">{{ markers().length }}</span>
      </div>

      <div class="film-card__list">
        @for (marker of markers(); track marker.timeMs) {
          <button class="film-marker" type="button" (click)="onMarkerClick(marker.timeMs)">
            <span class="film-marker__time">{{ formatTime(marker.timeMs) }}</span>
            <span class="film-marker__label">{{ marker.label }}</span>
            @if (marker.sentiment) {
              <span
                class="film-marker__sentiment"
                [class.film-marker__sentiment--positive]="marker.sentiment === 'positive'"
                [class.film-marker__sentiment--negative]="marker.sentiment === 'negative'"
                [class.film-marker__sentiment--neutral]="marker.sentiment === 'neutral'"
              >
                {{ marker.sentiment }}
              </span>
            }
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .film-card {
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        overflow: hidden;
        margin-top: 8px;
      }

      .film-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .film-card__header-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .film-card__header-title {
        flex: 1;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .film-card__badge {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        height: 22px;
        padding: 0 6px;
        border-radius: 11px;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-size: 0.6875rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      /* ── Marker list ── */

      .film-card__list {
        display: flex;
        flex-direction: column;
        max-height: 280px;
        overflow-y: auto;
      }

      .film-marker {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 10px 12px;
        border: none;
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.06));
        background: transparent;
        color: inherit;
        cursor: pointer;
        transition: background 0.15s ease;
        text-align: left;
      }

      .film-marker:last-child {
        border-bottom: none;
      }

      .film-marker:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      .film-marker:active {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
      }

      .film-marker__time {
        flex-shrink: 0;
        width: 44px;
        font-size: 0.8125rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--nxt1-color-primary, #ccff00);
        font-family: var(--nxt1-font-mono, ui-monospace, SFMono-Regular, monospace);
      }

      .film-marker__label {
        flex: 1;
        font-size: 0.8125rem;
        color: var(--nxt1-color-text-primary, #ffffff);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .film-marker__sentiment {
        flex-shrink: 0;
        padding: 2px 8px;
        border-radius: 9999px;
        font-size: 0.625rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .film-marker__sentiment--positive {
        background: rgba(76, 217, 100, 0.15);
        color: #4cd964;
      }

      .film-marker__sentiment--negative {
        background: rgba(255, 59, 48, 0.15);
        color: #ff3b30;
      }

      .film-marker__sentiment--neutral {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      /* ── Scrollbar ── */

      .film-card__list::-webkit-scrollbar {
        width: 4px;
      }

      .film-card__list::-webkit-scrollbar-track {
        background: transparent;
      }

      .film-card__list::-webkit-scrollbar-thumb {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        border-radius: 2px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXFilmTimelineCardComponent {
  /** The rich card data (type, title, payload). */
  readonly card = input.required<AgentXRichCard>();

  /** Emitted when the user clicks a marker. Sends the timestamp in ms. */
  readonly markerClicked = output<number>();

  /** Extract the markers array defensively. */
  protected readonly markers = computed<readonly AgentXFilmMarker[]>(() => {
    const payload = this.card().payload as AgentXFilmTimelinePayload;
    return Array.isArray(payload?.markers) ? payload.markers : [];
  });

  /** Format milliseconds into MM:SS display string. */
  protected formatTime(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  protected onMarkerClick(timeMs: number): void {
    this.markerClicked.emit(timeMs);
  }
}
