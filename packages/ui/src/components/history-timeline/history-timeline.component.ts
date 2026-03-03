/**
 * @fileoverview Shared History Timeline Component
 * @module @nxt1/ui/components/history-timeline
 * @version 1.0.0
 *
 * Reusable timeline list used by both Player History (profile)
 * and Team History (team profile). Renders a year-label column
 * alongside Madden-style team block cards with optional record badges.
 *
 * ⭐ Fully shared — no business logic, pure presentation ⭐
 */
import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { NxtIconComponent, type IconName } from '../icon';
import { NxtImageComponent } from '../image';

// ============================================
// PUBLIC INTERFACE
// ============================================

/**
 * A single entry in the history timeline.
 * Both player affiliations and team season records map to this shape.
 */
export interface HistoryTimelineEntry {
  /** Year/season label displayed in the left column (e.g. "Current", "2024-2025") */
  readonly label: string;
  /** Primary display name (team name, org name) */
  readonly name: string;
  /** Optional logo URL */
  readonly logoUrl?: string;
  /** Optional subtitle (location, conference, highlight) */
  readonly subtitle?: string;
  /** Record badge text (e.g. "10-2", "8-4-1") — shown as accent pill */
  readonly record?: string;
  /** Fallback icon name when no logo is provided */
  readonly fallbackIcon?: string;
}

/**
 * Configuration for the empty state when no entries exist.
 */
export interface HistoryTimelineEmptyConfig {
  /** Icon name for the empty state circle */
  readonly icon: string;
  /** Heading text */
  readonly title: string;
  /** Description text */
  readonly description: string;
}

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-history-timeline',
  standalone: true,
  imports: [NxtIconComponent, NxtImageComponent],
  template: `
    @if (entries().length === 0) {
      <div class="ht-empty">
        <div class="ht-empty__icon" aria-hidden="true">
          <nxt1-icon [name]="emptyIcon()" [size]="40" />
        </div>
        <h3>{{ emptyTitle() }}</h3>
        <p>{{ emptyDescription() }}</p>
      </div>
    } @else {
      <div class="ht-list">
        @for (entry of entries(); track entry.label + '-' + entry.name) {
          <article class="ht-item">
            <span class="ht-year">{{ entry.label }}</span>
            <div class="ht-main">
              <div class="ht-logo-wrap">
                @if (entry.logoUrl) {
                  <nxt1-image
                    class="ht-logo"
                    [src]="entry.logoUrl"
                    [alt]="entry.name"
                    [width]="24"
                    [height]="24"
                    variant="avatar"
                    fit="contain"
                    [showPlaceholder]="false"
                  />
                } @else {
                  <span class="ht-logo-fallback">
                    <nxt1-icon [name]="safeFallbackIcon(entry.fallbackIcon)" [size]="16" />
                  </span>
                }
              </div>
              <div class="ht-content">
                <div class="ht-headline">
                  <span class="ht-name">{{ entry.name }}</span>
                </div>
                @if (entry.subtitle) {
                  <span class="ht-subtitle">{{ entry.subtitle }}</span>
                }
              </div>
              <span class="ht-record">{{ entry.record ?? 'N/A' }}</span>
            </div>
          </article>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ─── TIMELINE LIST ─── */
      .ht-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .ht-item {
        display: grid;
        grid-template-columns: 92px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
      }

      .ht-year {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        line-height: 1.25;
        padding-top: 10px;
      }

      /* ─── TEAM BLOCK CARD ─── */
      .ht-main {
        width: 100%;
        max-width: 520px;
        min-width: 0;
        justify-self: stretch;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 16px;
        border-radius: 12px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }

      /* ─── LOGO ─── */
      .ht-logo-wrap {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
      }

      .ht-logo {
        width: 42px;
        height: 42px;
        object-fit: contain;
        border-radius: 6px;
        flex-shrink: 0;
      }

      .ht-logo-fallback {
        width: 42px;
        height: 42px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.06);
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        flex-shrink: 0;
      }

      /* ─── TEXT CONTENT ─── */
      .ht-content {
        min-width: 0;
        flex: 1;
      }

      .ht-headline {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .ht-name {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text, #ffffff);
        line-height: 1.2;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
      }

      .ht-subtitle {
        font-size: 12px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        margin-top: 0;
      }

      /* ─── RECORD BADGE ─── */
      .ht-record {
        margin-left: auto;
        flex-shrink: 0;
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--m-accent, #d4ff00) 35%, transparent);
        background: color-mix(in srgb, var(--m-accent, #d4ff00) 12%, transparent);
        color: var(--m-accent, #d4ff00);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        line-height: 1;
      }

      /* ─── EMPTY STATE ─── */
      .ht-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 12px;
        padding: 40px 20px;
      }

      .ht-empty__icon {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        margin-bottom: 4px;
      }

      .ht-empty h3 {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin: 0;
      }

      .ht-empty p {
        font-size: 13px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        margin: 0;
        max-width: 320px;
        line-height: 1.6;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtHistoryTimelineComponent {
  /** Timeline entries to render (most recent first) */
  readonly entries = input.required<readonly HistoryTimelineEntry[]>();

  /** Icon for empty state */
  readonly emptyIcon = input<string>('time-outline');

  /** Title for empty state */
  readonly emptyTitle = input<string>('No history yet');

  /** Description for empty state */
  readonly emptyDescription = input<string>('History will appear here.');

  /** Safely cast fallback icon to IconName (defaults to 'shield' if absent) */
  protected safeFallbackIcon(icon?: string): IconName {
    return (icon ?? 'shield') as IconName;
  }
}
