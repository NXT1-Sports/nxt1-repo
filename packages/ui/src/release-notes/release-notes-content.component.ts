/**
 * @fileoverview Release Notes Content Component — What's New modal body
 * @module @nxt1/ui/release-notes
 *
 * Shared standalone content rendered inside:
 * - NxtOverlayService (web/desktop)
 * - NxtBottomSheetService / NxtReleaseNotesModalComponent (mobile)
 *
 * Emits `close` output to let the hosting overlay/sheet dismiss itself.
 */

import { Component, ChangeDetectionStrategy, Input, output, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NxtLoggingService } from '../services/logging';
import { ANALYTICS_ADAPTER } from '../services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { SystemReleaseNote } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

@Component({
  selector: 'nxt1-release-notes-content',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (note) {
      <div class="rn-container" [attr.data-testid]="testIds.CONTENT_CONTAINER">
        <!-- Header -->
        <div class="rn-header" [attr.data-testid]="testIds.HEADER">
          <div class="rn-header-top">
            <span class="rn-icon-wrap">
              <svg
                class="rn-agentx-logo"
                viewBox="0 0 612 792"
                width="42"
                height="42"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="8"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path [attr.d]="agentXLogoPath" />
                <polygon [attr.points]="agentXLogoPolygon" />
              </svg>
            </span>
            <div class="rn-header-meta">
              <span class="rn-version-badge" [attr.data-testid]="testIds.VERSION_BADGE">
                Release Notes
              </span>
              <span class="rn-version-number">v{{ note.version }}</span>
            </div>
          </div>
          @if (note.summary) {
            <p class="rn-summary" [attr.data-testid]="testIds.SUMMARY">{{ note.summary }}</p>
          }
        </div>

        <!-- Category sections -->
        <div class="rn-sections">
          @if (note.categories.features.length > 0) {
            <div class="rn-section" [attr.data-testid]="testIds.SECTION_FEATURES">
              <div class="rn-section-label">
                <span class="rn-emoji">🚀</span>
                <span>What's New</span>
              </div>
              <ul class="rn-list">
                @for (item of note.categories.features; track item) {
                  <li [attr.data-testid]="testIds.ITEM_FEATURE">{{ item }}</li>
                }
              </ul>
            </div>
          }

          @if (note.categories.enhancements.length > 0) {
            <div class="rn-section" [attr.data-testid]="testIds.SECTION_ENHANCEMENTS">
              <div class="rn-section-label">
                <span class="rn-emoji">⚡</span>
                <span>Speed & Polish</span>
              </div>
              <ul class="rn-list">
                @for (item of note.categories.enhancements; track item) {
                  <li [attr.data-testid]="testIds.ITEM_ENHANCEMENT">{{ item }}</li>
                }
              </ul>
            </div>
          }

          @if (note.categories.fixes.length > 0) {
            <div class="rn-section" [attr.data-testid]="testIds.SECTION_FIXES">
              <div class="rn-section-label">
                <span class="rn-emoji">🛠️</span>
                <span>Fixes & Stability</span>
              </div>
              <ul class="rn-list">
                @for (item of note.categories.fixes; track item) {
                  <li [attr.data-testid]="testIds.ITEM_FIX">{{ item }}</li>
                }
              </ul>
            </div>
          }
        </div>

        <!-- Footer actions -->
        <div class="rn-footer">
          <button
            type="button"
            class="rn-btn-primary"
            [attr.data-testid]="testIds.PRIMARY_CTA"
            (click)="onCta()"
          >
            {{ note.ctaLabel || 'Got It' }}
          </button>
          <button
            type="button"
            class="rn-btn-dismiss"
            [attr.data-testid]="testIds.DISMISS_BUTTON"
            (click)="onDismiss()"
          >
            Dismiss
          </button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .rn-container {
        display: flex;
        flex-direction: column;
        gap: 24px;
        padding: 24px;
        color: var(--nxt1-color-text-primary, #fff);
      }
      .rn-header {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .rn-header-top {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .rn-icon-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 16px;
        background: var(--nxt1-color-primary-muted, rgba(204, 255, 0, 0.12));
        color: var(--nxt1-color-primary, #ccff00);
      }
      .rn-agentx-logo {
        display: block;
        width: 42px;
        height: 42px;
        flex: 0 0 auto;
      }
      .rn-header-meta {
        display: flex;
        flex-direction: column;
        gap: 4px;
        align-items: flex-start;
      }
      .rn-version-badge {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        padding: 3px 8px;
        border-radius: 100px;
        background: var(--nxt1-color-primary-muted, rgba(204, 255, 0, 0.12));
        color: var(--nxt1-color-primary, #ccff00);
        text-transform: uppercase;
      }
      .rn-version-number {
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.68));
      }
      .rn-summary {
        margin: 4px 0 0;
        font-size: 14px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.72));
        max-width: 36rem;
      }
      .rn-sections {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .rn-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .rn-section-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.5));
      }
      .rn-emoji {
        font-size: 14px;
      }
      .rn-list {
        margin: 0;
        padding: 0 0 0 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .rn-list li {
        font-size: 14px;
        line-height: 1.45;
        color: var(--nxt1-color-text-primary, rgba(255, 255, 255, 0.85));
      }
      .rn-footer {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-top: 4px;
      }
      .rn-btn-primary {
        padding: 14px;
        border-radius: 12px;
        border: none;
        cursor: pointer;
        font-size: 15px;
        font-weight: 700;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-primary-contrast, #0d0d0d);
      }
      .rn-btn-dismiss {
        padding: 12px;
        border-radius: 12px;
        border: none;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        background: transparent;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.5));
      }
    `,
  ],
})
export class NxtReleaseNotesContentComponent {
  protected readonly testIds = TEST_IDS.RELEASE_NOTES;
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  private readonly logger = inject(NxtLoggingService).child('ReleaseNotesContent');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  @Input() note: SystemReleaseNote | null = null;

  /** Emits when user dismisses or clicks primary CTA — lets the overlay/sheet close. */
  readonly close = output<{ action: 'dismiss' | 'cta' }>();

  protected onDismiss(): void {
    this.logger.info('Release notes dismissed');
    this.analytics?.trackEvent(APP_EVENTS.RELEASE_NOTES_DISMISSED, {
      version: this.note?.version,
    });
    this.close.emit({ action: 'dismiss' });
  }

  protected onCta(): void {
    this.logger.info('Release notes CTA clicked', { route: this.note?.ctaRoute });
    this.analytics?.trackEvent(APP_EVENTS.RELEASE_NOTES_CTA_CLICKED, {
      version: this.note?.version,
      ctaRoute: this.note?.ctaRoute,
    });
    this.close.emit({ action: 'cta' });
  }
}
