/**
 * @fileoverview Shared Activity Card Atom Component
 * @module @nxt1/ui/components/activity-card
 * @version 1.0.0
 *
 * A compact, inline content primitive for rendering recruiting/event
 * activity content (offers, visits, camps, commitments, awards)
 * consistently across ALL contexts — feed cards, timeline views,
 * profile sections, etc.
 *
 * This is the "content atom" pattern used by Instagram, LinkedIn, and
 * Twitter: one shared sub-component renders the activity content, while
 * the WRAPPER (feed shell vs timeline rail) changes framing.
 *
 * Colors use design-token CSS custom properties exclusively — zero hardcoded hex.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-activity-card [item]="offerItem" />
 * <nxt1-activity-card [item]="campItem" [compact]="true" />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ContentCardItem } from '@nxt1/core';
import { NxtIconComponent } from '../icon';

@Component({
  selector: 'nxt1-activity-card',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    @switch (item().type) {
      <!-- ═══ OFFER CARD ═══ -->
      @case ('offer') {
        <div class="cc" [class]="rootClass()">
          @if (item().logoUrl) {
            <img [src]="item().logoUrl" [alt]="item().title" class="cc__logo" loading="lazy" />
          }
          <div class="cc__info">
            <span class="cc__title">{{ item().title }}</span>
            <span class="cc__type cc__type--offer">{{ item().typeLabel }}</span>
            @if (item().division) {
              <span class="cc__meta">{{ item().division }}</span>
            }
          </div>
        </div>
      }

      <!-- ═══ COMMITMENT CARD ═══ -->
      @case ('commitment') {
        <div class="cc" [class]="rootClass()">
          @if (item().logoUrl) {
            <img [src]="item().logoUrl" [alt]="item().title" class="cc__logo" loading="lazy" />
          }
          <div class="cc__info">
            <span class="cc__overline">COMMITTED TO</span>
            <span class="cc__title">{{ item().title }}</span>
            @if (item().result) {
              <span class="cc__result cc__result--signed">{{ item().result }}</span>
            }
          </div>
        </div>
      }

      <!-- ═══ VISIT / CAMP CARD (same layout, different color) ═══ -->
      @default {
        <div class="cc cc--activity" [class]="rootClass()">
          <div class="cc__icon-wrap" [class]="iconWrapClass()">
            <nxt1-icon [name]="item().icon" [size]="20" />
          </div>
          <div class="cc__body">
            <div class="cc__row">
              @if (item().logoUrl) {
                <img
                  [src]="item().logoUrl"
                  [alt]="item().title"
                  class="cc__activity-logo"
                  loading="lazy"
                />
              }
              <div class="cc__details">
                <span class="cc__overline">{{ item().typeLabel }}</span>
                <span class="cc__title">{{ item().title }}</span>
                @if (item().location) {
                  <span class="cc__location">
                    <nxt1-icon name="location" [size]="12" />
                    {{ item().location }}
                  </span>
                }
                @if (item().result) {
                  <span class="cc__result">{{ item().result }}</span>
                }
              </div>
            </div>
          </div>
        </div>
      }
    }
  `,
  styles: [
    `
      /* ============================================
         CONTENT CARD ATOM — Unified Design
         Uses semantic design-token CSS variables.
         ============================================ */

      :host {
        display: block;

        /* ── Semantic aliases (resolve to global design tokens) ── */
        --cc-bg: rgba(255, 255, 255, 0.03);
        --cc-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --cc-radius: var(--nxt1-radius-md, 8px);
        --cc-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --cc-text-secondary: var(--nxt1-color-text-secondary, #9ca3af);
        --cc-text-tertiary: var(--nxt1-color-text-tertiary, #6b7280);

        /* ── Activity-type color tokens ── */
        --cc-color-success: var(--nxt1-color-success, #4ade80);
        --cc-color-info: var(--nxt1-color-info, #3b82f6);
        --cc-color-warning: var(--nxt1-color-warning, #f59e0b);
        --cc-color-primary: var(--nxt1-color-primary, #ccff00);
        --cc-color-muted: var(--cc-text-tertiary);
      }

      /* ═══ BASE CARD ═══ */

      .cc {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--cc-bg);
        border-radius: var(--cc-radius);
        border: 1px solid var(--cc-border);
        margin-bottom: 8px;
      }

      /* ═══ OFFER / COMMITMENT CARD (logo + info) ═══ */

      .cc__logo {
        width: 44px;
        height: 44px;
        object-fit: contain;
        flex-shrink: 0;
      }

      .cc__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .cc__title {
        font-size: 15px;
        font-weight: 600;
        color: var(--cc-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .cc__type {
        font-size: 13px;
        font-weight: 500;
      }

      .cc__type--offer {
        color: var(--cc-color-success);
      }

      .cc__meta {
        font-size: 12px;
        color: var(--cc-text-secondary);
      }

      .cc__overline {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: var(--cc-text-tertiary);
      }

      .cc__result {
        font-size: 12px;
        font-weight: 600;
        color: var(--cc-color-primary);
        margin-top: 2px;
      }

      .cc__result--signed {
        color: var(--cc-color-primary);
        font-weight: 500;
        font-size: 12px;
      }

      /* ═══ ACTIVITY CARD (icon-wrap + body) ═══ */

      .cc--activity {
        /* Same base layout; gap overridden by cc */
      }

      .cc__icon-wrap {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      /* Color variants for icon wraps */
      .cc__icon-wrap--info {
        background: color-mix(in srgb, var(--cc-color-info) 15%, transparent);
        color: var(--cc-color-info);
      }

      .cc__icon-wrap--warning {
        background: color-mix(in srgb, var(--cc-color-warning) 15%, transparent);
        color: var(--cc-color-warning);
      }

      .cc__icon-wrap--success {
        background: color-mix(in srgb, var(--cc-color-success) 15%, transparent);
        color: var(--cc-color-success);
      }

      .cc__icon-wrap--primary {
        background: color-mix(in srgb, var(--cc-color-primary) 15%, transparent);
        color: var(--cc-color-primary);
      }

      .cc__icon-wrap--muted {
        background: color-mix(in srgb, var(--cc-color-muted) 15%, transparent);
        color: var(--cc-color-muted);
      }

      .cc__body {
        flex: 1;
        min-width: 0;
      }

      .cc__row {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .cc__activity-logo {
        width: 40px;
        height: 40px;
        object-fit: contain;
        flex-shrink: 0;
        border-radius: 6px;
      }

      .cc__details {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .cc__location {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--cc-text-tertiary);
      }

      /* ═══ COMPACT MODE ═══ */

      :host-context(.feed-post--compact) .cc,
      .cc--compact {
        padding: 8px;
        gap: 8px;
        margin-bottom: 4px;
      }

      :host-context(.feed-post--compact) .cc__logo,
      .cc--compact .cc__logo {
        width: 32px;
        height: 32px;
      }

      :host-context(.feed-post--compact) .cc__title,
      .cc--compact .cc__title {
        font-size: 13px;
      }

      :host-context(.feed-post--compact) .cc__icon-wrap,
      .cc--compact .cc__icon-wrap {
        width: 32px;
        height: 32px;
        border-radius: 8px;
      }

      :host-context(.feed-post--compact) .cc__activity-logo,
      .cc--compact .cc__activity-logo {
        width: 32px;
        height: 32px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtActivityCardComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** The unified content card data */
  readonly item = input.required<ContentCardItem>();

  /** Whether to render in compact mode */
  readonly compact = input(false);

  // ============================================
  // COMPUTED CSS CLASSES
  // ============================================

  protected readonly rootClass = computed(() => {
    const classes: string[] = [];
    if (this.compact()) classes.push('cc--compact');
    return classes.join(' ');
  });

  protected readonly iconWrapClass = computed(() => {
    const variant = this.item().colorVariant;
    return `cc__icon-wrap cc__icon-wrap--${variant}`;
  });
}
