/**
 * @fileoverview Agent X Citations Card — Source Reference Pills
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Renders a horizontal list of source-reference pills inline in the Agent X
 * chat timeline. Each pill displays a label (and optional favicon) and opens
 * the source URL in a new tab when clicked.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import type { AgentXRichCard, AgentXCitation, AgentXCitationsPayload } from '@nxt1/core/ai';

@Component({
  selector: 'nxt1-agent-x-citations-card',
  standalone: true,
  template: `
    <div class="citations-card">
      <div class="citations-card__header">
        <svg class="citations-card__icon" viewBox="0 0 20 20" fill="none">
          <path
            d="M4 4H12L16 8V16H4V4Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <path d="M12 4V8H16" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
          <line
            x1="7"
            y1="11"
            x2="13"
            y2="11"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
          />
          <line
            x1="7"
            y1="13.5"
            x2="11"
            y2="13.5"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
          />
        </svg>
        <span class="citations-card__title">{{ card().title }}</span>
        <span class="citations-card__count">{{ sources().length }} sources</span>
      </div>

      <div class="citations-card__pills">
        @for (source of sources(); track source.id) {
          <a
            class="citation-pill"
            [href]="source.url"
            target="_blank"
            rel="noopener noreferrer"
            (click)="onCitationClick(source)"
          >
            @if (source.iconUrl) {
              <img
                class="citation-pill__favicon"
                [src]="source.iconUrl"
                [alt]="''"
                loading="lazy"
              />
            } @else {
              <svg class="citation-pill__link-icon" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6.5 9.5L9.5 6.5"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linecap="round"
                />
                <path
                  d="M8.5 10.5L7 12C5.9 13.1 4.1 13.1 3 12C1.9 10.9 1.9 9.1 3 8L4.5 6.5"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linecap="round"
                />
                <path
                  d="M7.5 5.5L9 4C10.1 2.9 11.9 2.9 13 4C14.1 5.1 14.1 6.9 13 8L11.5 9.5"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linecap="round"
                />
              </svg>
            }
            <span class="citation-pill__label">{{ source.label }}</span>
          </a>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .citations-card {
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        overflow: hidden;
        margin-top: 8px;
      }

      .citations-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .citations-card__icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .citations-card__title {
        flex: 1;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .citations-card__count {
        font-size: 0.75rem;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        font-variant-numeric: tabular-nums;
      }

      .citations-card__pills {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 12px;
      }

      .citation-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.12));
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        text-decoration: none;
        transition: all 0.15s ease;
        max-width: 220px;
        overflow: hidden;
      }

      .citation-pill:hover {
        border-color: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-primary, #ccff00);
        background: rgba(204, 255, 0, 0.06);
      }

      .citation-pill:active {
        background: rgba(204, 255, 0, 0.12);
      }

      .citation-pill__favicon {
        width: 14px;
        height: 14px;
        border-radius: 2px;
        flex-shrink: 0;
        object-fit: contain;
      }

      .citation-pill__link-icon {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }

      .citation-pill__label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXCitationsCardComponent {
  /** The rich card data (type, title, payload). */
  readonly card = input.required<AgentXRichCard>();

  /** Emitted when a citation pill is clicked (for analytics/tracking). */
  readonly citationClicked = output<string>();

  /** Extract sources from the citations payload. */
  protected readonly sources = computed<readonly AgentXCitation[]>(() => {
    const payload = this.card().payload as AgentXCitationsPayload;
    return Array.isArray(payload?.sources) ? payload.sources : [];
  });

  protected onCitationClick(source: AgentXCitation): void {
    this.citationClicked.emit(source.id);
  }
}
