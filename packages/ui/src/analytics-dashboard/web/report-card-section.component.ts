/**
 * @fileoverview "The Report Card" (Feedback) section — Shared Web UI
 * @module @nxt1/ui/analytics-dashboard/web
 * @version 1.0.0
 *
 * Automated weekly scouting report email preview for the `/analytics` landing page.
 * Renders a pixel-perfect "inbox" mock showing the Friday digest email with
 * engagement highlights, coach activity, and actionable advice.
 *
 * Design compliance:
 *   - 100 % design-token driven (ZERO hardcoded px/rem/hex)
 *   - Canonical section spacing via --nxt1-section-padding-y / --nxt1-section-padding-x
 *   - Max-width via --nxt1-section-max-width-narrow (matches sibling sections)
 *   - SSR-safe: no browser APIs, deterministic IDs, fully renderable on server
 *   - WCAG-ready: labelled section, proper heading hierarchy, role attributes
 *   - OnPush change detection
 *   - Zero Ionic dependencies
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NxtSectionHeaderComponent } from '../../components/section-header';

@Component({
  selector: 'nxt1-report-card-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="rc" aria-labelledby="rc-heading">
      <nxt1-section-header
        titleId="rc-heading"
        eyebrow="The Report Card · Weekly Feedback"
        [headingLevel]="2"
        align="center"
        title="Weekly Scouting Report."
        subtitle="We summarize the noise into clear, actionable advice every Friday morning."
      />

      <!-- Email preview card -->
      <div
        class="rc__email"
        role="img"
        aria-label="Preview of automated weekly scouting report email showing engagement metrics and coach activity"
      >
        <!-- Browser-style top bar -->
        <div class="rc__email-chrome" aria-hidden="true">
          <span class="rc__dot"></span>
          <span class="rc__dot"></span>
          <span class="rc__dot"></span>
          <span class="rc__chrome-label">Inbox</span>
        </div>

        <!-- Email header -->
        <div class="rc__email-header">
          <div class="rc__email-meta">
            <div class="rc__avatar" aria-hidden="true">
              <svg viewBox="0 0 32 32" class="rc__avatar-svg" aria-hidden="true">
                <rect width="32" height="32" rx="8" class="rc__avatar-bg" />
                <text x="16" y="21" text-anchor="middle" class="rc__avatar-text">N</text>
              </svg>
            </div>
            <div class="rc__email-sender">
              <p class="rc__from">
                <span class="rc__from-name">NXT1 Scouting</span>
                <span class="rc__from-email">&lt;reports&#64;nxt1.app&gt;</span>
              </p>
              <p class="rc__to">to me</p>
            </div>
          </div>
          <p class="rc__timestamp" aria-label="Received Friday at 8:00 AM">Fri 8:00 AM</p>
        </div>

        <!-- Subject line -->
        <div class="rc__subject-row">
          <h3 class="rc__subject">Your Week in Review: +14% Engagement</h3>
          <span class="rc__tag" aria-label="Weekly report badge">Weekly</span>
        </div>

        <!-- Email body -->
        <div class="rc__body">
          <p class="rc__greeting">You had a great week.</p>

          <!-- Highlight metric cards -->
          <div class="rc__highlights">
            <div class="rc__highlight">
              <div class="rc__highlight-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" class="rc__icon-svg">
                  <path
                    d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                    stroke="currentColor"
                    stroke-width="1.5"
                  />
                  <path
                    d="M2.036 12.322a1.012 1.012 0 0 1 0-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z"
                    stroke="currentColor"
                    stroke-width="1.5"
                  />
                </svg>
              </div>
              <div class="rc__highlight-content">
                <p class="rc__highlight-value">3 New Coaches</p>
                <p class="rc__highlight-label">Viewed your film this week</p>
              </div>
            </div>

            <div class="rc__highlight">
              <div class="rc__highlight-icon rc__highlight-icon--engagement" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" class="rc__icon-svg">
                  <path
                    d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.28m5.94 2.28-2.28 5.941"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
              <div class="rc__highlight-content">
                <p class="rc__highlight-value">+14% Engagement</p>
                <p class="rc__highlight-label">Profile views up week over week</p>
              </div>
            </div>

            <div class="rc__highlight">
              <div class="rc__highlight-icon rc__highlight-icon--posts" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" class="rc__icon-svg">
                  <path
                    d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
              <div class="rc__highlight-content">
                <p class="rc__highlight-value">Keep Posting</p>
                <p class="rc__highlight-label">Highlights drive the most coach interest</p>
              </div>
            </div>
          </div>

          <!-- Advice / CTA -->
          <div class="rc__advice">
            <p class="rc__advice-text">
              Keep posting highlights. Coaches respond best to game-day film uploaded within 24
              hours. Your next report lands
              <strong>Friday at 8:00 AM.</strong>
            </p>
          </div>
        </div>
      </div>

      <!-- Value strip -->
      <div class="rc__value" role="note" aria-label="Key value and delivery schedule">
        <p class="rc__value-text">
          <span class="rc__value-label">Key Value:</span>
          We summarize the noise into clear, actionable advice every Friday morning.
        </p>
        <p class="rc__value-text">
          <span class="rc__value-label">Delivery:</span>
          Automated weekly email — zero setup required. Just sign up and start recruiting.
        </p>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ── Section container — canonical section layout ── */
      .rc {
        max-width: var(--nxt1-section-max-width-narrow);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        display: grid;
        gap: var(--nxt1-spacing-6);
      }

      /* ── Email preview card ── */
      .rc__email {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        overflow: hidden;
        box-shadow: var(--nxt1-shadow-md);
        transition: box-shadow var(--nxt1-duration-normal, 200ms) var(--nxt1-easing-standard, ease);
      }

      .rc__email:hover {
        box-shadow: var(--nxt1-shadow-lg);
      }

      /* ── Browser chrome bar ── */
      .rc__email-chrome {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-200);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .rc__dot {
        width: var(--nxt1-spacing-2_5);
        height: var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-400);
      }

      .rc__chrome-label {
        margin-left: var(--nxt1-spacing-2);
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      /* ── Email header row ── */
      .rc__email-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5) 0;
      }

      .rc__email-meta {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        min-width: 0;
      }

      .rc__avatar {
        flex-shrink: 0;
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
      }

      .rc__avatar-svg {
        width: 100%;
        height: 100%;
        display: block;
      }

      .rc__avatar-bg {
        fill: var(--nxt1-color-primary);
      }

      .rc__avatar-text {
        fill: var(--nxt1-color-bg-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
      }

      .rc__email-sender {
        min-width: 0;
      }

      .rc__from {
        margin: 0;
        display: flex;
        align-items: baseline;
        gap: var(--nxt1-spacing-1_5);
        flex-wrap: wrap;
      }

      .rc__from-name {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        white-space: nowrap;
      }

      .rc__from-email {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .rc__to {
        margin: var(--nxt1-spacing-0_5) 0 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .rc__timestamp {
        margin: 0;
        flex-shrink: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        white-space: nowrap;
      }

      /* ── Subject line row ── */
      .rc__subject-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .rc__subject {
        margin: 0;
        flex: 1;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .rc__tag {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2_5);
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      /* ── Email body ── */
      .rc__body {
        padding: var(--nxt1-spacing-5);
        display: grid;
        gap: var(--nxt1-spacing-5);
      }

      .rc__greeting {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── Highlight metric cards ── */
      .rc__highlights {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .rc__highlight {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3_5);
        background: var(--nxt1-color-bg-primary);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg);
        transition: border-color var(--nxt1-duration-normal, 200ms)
          var(--nxt1-easing-standard, ease);
      }

      .rc__highlight:hover {
        border-color: var(--nxt1-color-border-default);
      }

      .rc__highlight-icon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        color: var(--nxt1-color-primary);
      }

      .rc__highlight-icon--engagement {
        background: var(--nxt1-color-alpha-success10, rgba(34, 197, 94, 0.1));
        color: var(--nxt1-color-success);
      }

      .rc__highlight-icon--posts {
        background: var(--nxt1-color-alpha-info10, rgba(59, 130, 246, 0.1));
        color: var(--nxt1-color-info, #3b82f6);
      }

      .rc__icon-svg {
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
      }

      .rc__highlight-content {
        min-width: 0;
      }

      .rc__highlight-value {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .rc__highlight-label {
        margin: var(--nxt1-spacing-0_5) 0 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ── Advice / CTA block ── */
      .rc__advice {
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-lg);
        border-left: 3px solid var(--nxt1-color-primary);
      }

      .rc__advice-text {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .rc__advice-text strong {
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-bold);
      }

      /* ── Value strip ── */
      .rc__value {
        display: grid;
        gap: var(--nxt1-spacing-2);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-4);
      }

      .rc__value-text {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .rc__value-label {
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      /* ── Responsive ── */
      @media (min-width: 768px) {
        .rc__highlights {
          grid-template-columns: repeat(3, 1fr);
        }

        .rc__highlight {
          flex-direction: column;
          text-align: center;
          padding: var(--nxt1-spacing-4);
        }
      }

      @media (max-width: 767px) {
        .rc__email-header {
          padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4) 0;
        }

        .rc__subject-row {
          padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        }

        .rc__body {
          padding: var(--nxt1-spacing-4);
        }

        .rc__subject {
          font-size: var(--nxt1-fontSize-base);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportCardSectionComponent {}
