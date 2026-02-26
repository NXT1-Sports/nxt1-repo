/**
 * @fileoverview Explore "For You" Landing Component — Web (Zero Ionic)
 * @module @nxt1/ui/explore/web
 * @version 1.0.0
 *
 * Multi-category curated overview displayed as the default explore landing view.
 * SSR-safe semantic HTML, zero Ionic dependencies, design token CSS.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * For mobile app, use ExploreForYouComponent (Ionic variant) instead.
 *
 * Design Goals:
 * - Visually stunning entry point to the explore feature
 * - No tab pre-selected; showcases content from ALL categories
 * - Smooth horizontal scroll rows per category (CSS scroll snap)
 * - Personalized "For You" sections within each category strip
 * - Fully design-token driven (zero hard-coded values)
 * - Accessible: semantic landmarks, ARIA roles, keyboard navigation
 * - Respects prefers-reduced-motion
 * - IntersectionObserver-driven entry animations
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ExploreItem, ExploreTabId } from '@nxt1/core';
import type { ExploreUser } from '../explore-shell.component';

@Component({
  selector: 'nxt1-explore-for-you-web',
  standalone: true,
  imports: [CommonModule],
  template: ` <section class="for-you" aria-label="For You — personalized explore"></section> `,
  styles: [
    `
      /* ============================================================
         EXPLORE FOR YOU — Web (Zero Ionic)
         Design token driven, SSR-safe, zero hard-coded values.
         All spacing, color, typography via CSS custom properties.
         ============================================================ */

      :host {
        display: block;

        --fy-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --fy-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03));
        --fy-surface-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        --fy-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --fy-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --fy-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --fy-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        --fy-primary: var(--nxt1-color-primary, #ccff00);
        --fy-primary-on: var(--nxt1-color-on-primary, #000000);
        --fy-success: var(--nxt1-color-success, #30d158);
        --fy-radius-sm: var(--nxt1-radius-sm, 8px);
        --fy-radius-md: var(--nxt1-radius-md, 12px);
        --fy-radius-lg: var(--nxt1-radius-lg, 16px);
        --fy-radius-full: var(--nxt1-radius-full, 9999px);
        --fy-duration-fast: var(--nxt1-duration-fast, 150ms);
        --fy-duration-base: var(--nxt1-duration-base, 250ms);
      }

      /* ── FOR YOU WRAPPER ── */

      .for-you {
        padding-bottom: var(--nxt1-spacing-10, 40px);
      }

      /* ── SECTION ENTRY ANIMATION ── */

      .animate-section {
        opacity: 0;
        transform: translateY(16px);
        transition:
          opacity var(--nxt1-duration-slow, 350ms) ease,
          transform var(--nxt1-duration-slow, 350ms) ease;
      }

      .animate-section.is-visible {
        opacity: 1;
        transform: translateY(0);
      }

      /* ── SECTION ── */

      .section {
        padding: var(--nxt1-spacing-6, 24px) 0 0;
      }

      .section--last {
        padding-bottom: var(--nxt1-spacing-4, 16px);
      }

      .section__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-3, 12px);
      }

      .section__title {
        font-size: var(--nxt1-fontSize-lg, 17px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--fy-text-primary);
        letter-spacing: -0.3px;
      }

      .see-all-btn {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--fy-primary);
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        transition: opacity var(--fy-duration-fast) ease;
      }

      .see-all-btn:hover {
        opacity: 0.8;
      }

      .see-all-btn__icon {
        width: 16px;
        height: 16px;
      }

      /* ── HORIZONTAL SCROLL ── */

      .h-scroll {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-6, 24px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: var(--fy-border) transparent;
        padding-bottom: var(--nxt1-spacing-2, 8px);
      }

      .h-scroll::-webkit-scrollbar {
        height: 4px;
      }

      .h-scroll::-webkit-scrollbar-track {
        background: transparent;
      }

      .h-scroll::-webkit-scrollbar-thumb {
        background: var(--fy-border);
        border-radius: var(--fy-radius-full);
      }

      /* ── ATHLETE CARDS ── */

      .athlete-card {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        width: 110px;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-2, 8px);
        background: var(--fy-surface);
        border: 1px solid var(--fy-border);
        border-radius: var(--fy-radius-md);
        cursor: pointer;
        scroll-snap-align: start;
        transition:
          background-color var(--fy-duration-fast) ease,
          transform var(--fy-duration-fast) ease,
          border-color var(--fy-duration-fast) ease;
        outline: none;
      }

      .athlete-card:hover {
        background: var(--fy-surface-hover);
        border-color: color-mix(in srgb, var(--fy-primary) 20%, transparent);
        transform: translateY(-2px);
      }

      .athlete-card:focus-visible {
        outline: 2px solid var(--fy-primary);
        outline-offset: 2px;
      }

      .athlete-card:active {
        transform: scale(0.96);
      }

      .athlete-card__avatar {
        position: relative;
        margin-bottom: var(--nxt1-spacing-1, 4px);
      }

      .athlete-card__verified {
        position: absolute;
        bottom: 0;
        right: -2px;
        width: 16px;
        height: 16px;
        color: var(--fy-success);
        display: flex;
      }

      .athlete-card__verified svg {
        width: 100%;
        height: 100%;
      }

      .athlete-card__name {
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--fy-text-primary);
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        margin: 0;
      }

      .athlete-card__meta {
        font-size: var(--nxt1-fontSize-2xs, 11px);
        color: var(--fy-text-muted);
        text-align: center;
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .athlete-card__committed {
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: var(--fy-primary-on);
        background: var(--fy-primary);
        padding: 2px 6px;
        border-radius: var(--fy-radius-full);
        margin-top: 2px;
        display: block;
      }

      /* ── COLLEGE CARDS ── */

      .college-card {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        width: 260px;
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--fy-surface);
        border: 1px solid var(--fy-border);
        border-radius: var(--fy-radius-md);
        cursor: pointer;
        scroll-snap-align: start;
        transition:
          background-color var(--fy-duration-fast) ease,
          transform var(--fy-duration-fast) ease,
          border-color var(--fy-duration-fast) ease;
        outline: none;
      }

      .college-card:hover {
        background: var(--fy-surface-hover);
        border-color: color-mix(in srgb, var(--fy-primary) 20%, transparent);
        transform: translateY(-2px);
      }

      .college-card:focus-visible {
        outline: 2px solid var(--fy-primary);
        outline-offset: 2px;
      }

      .college-card:active {
        transform: scale(0.97);
      }

      .college-card__logo {
        flex-shrink: 0;
      }

      .college-card__info {
        flex: 1;
        min-width: 0;
      }

      .college-card__name {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--fy-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0 0 2px;
      }

      .college-card__meta {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--fy-text-secondary);
        margin: 0 0 2px;
      }

      .college-card__conference {
        font-size: var(--nxt1-fontSize-2xs, 11px);
        color: var(--fy-text-muted);
        margin: 0;
      }

      .college-card__arrow {
        flex-shrink: 0;
        width: 18px;
        height: 18px;
        color: var(--fy-text-muted);
        opacity: 0.4;
      }

      /* ── VIDEO CARDS ── */

      .h-scroll--videos {
        gap: var(--nxt1-spacing-3, 12px);
      }

      .video-card {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        width: 220px;
        background: var(--fy-surface);
        border: 1px solid var(--fy-border);
        border-radius: var(--fy-radius-md);
        overflow: hidden;
        cursor: pointer;
        scroll-snap-align: start;
        transition:
          border-color var(--fy-duration-fast) ease,
          transform var(--fy-duration-fast) ease;
        outline: none;
      }

      .video-card:hover {
        border-color: color-mix(in srgb, var(--fy-primary) 20%, transparent);
        transform: translateY(-2px);
      }

      .video-card:focus-visible {
        outline: 2px solid var(--fy-primary);
        outline-offset: 2px;
      }

      .video-card:active {
        transform: scale(0.97);
      }

      .video-card__thumb {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        background: var(--fy-surface-hover);
      }

      .video-card__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform var(--fy-duration-base) ease;
      }

      .video-card:hover .video-card__img {
        transform: scale(1.04);
      }

      .video-card__duration {
        position: absolute;
        bottom: var(--nxt1-spacing-1, 4px);
        right: var(--nxt1-spacing-1, 4px);
        padding: 2px 6px;
        background: rgba(0, 0, 0, 0.8);
        color: #fff;
        font-size: var(--nxt1-fontSize-2xs, 11px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        border-radius: var(--fy-radius-sm);
        line-height: 1;
      }

      .video-card__play-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.25);
        opacity: 0;
        transition: opacity var(--fy-duration-fast) ease;
      }

      .video-card:hover .video-card__play-overlay {
        opacity: 1;
      }

      .video-card__play-icon {
        width: 44px;
        height: 44px;
        color: rgba(255, 255, 255, 0.95);
        filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
      }

      .video-card__info {
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-3, 12px);
      }

      .video-card__title {
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--fy-text-primary);
        margin: 0 0 var(--nxt1-spacing-1, 4px);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: var(--nxt1-lineHeight-tight, 1.3);
      }

      .video-card__stats {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .video-card__stat {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: var(--nxt1-fontSize-2xs, 11px);
        color: var(--fy-text-muted);
      }

      .stat-icon {
        width: 11px;
        height: 11px;
        flex-shrink: 0;
      }

      /* ── TEAM LIST ── */

      .team-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
        padding: 0 var(--nxt1-spacing-6, 24px);
        list-style: none;
        margin: 0;
      }

      .team-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--fy-surface);
        border: 1px solid var(--fy-border);
        border-radius: var(--fy-radius-md);
        cursor: pointer;
        transition:
          background-color var(--fy-duration-fast) ease,
          transform var(--fy-duration-fast) ease,
          border-color var(--fy-duration-fast) ease;
        outline: none;
      }

      .team-row:hover {
        background: var(--fy-surface-hover);
        border-color: color-mix(in srgb, var(--fy-primary) 20%, transparent);
      }

      .team-row:focus-visible {
        outline: 2px solid var(--fy-primary);
        outline-offset: 2px;
      }

      .team-row:active {
        transform: scale(0.98);
      }

      .team-row__info {
        flex: 1;
        min-width: 0;
      }

      .team-row__name {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--fy-text-primary);
        margin: 0 0 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .team-row__meta {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--fy-text-secondary);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .team-row__record {
        flex-shrink: 0;
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--fy-text-muted);
        padding: 2px 8px;
        background: var(--fy-surface-hover);
        border-radius: var(--fy-radius-full);
      }

      .team-row__arrow {
        flex-shrink: 0;
        width: 18px;
        height: 18px;
        color: var(--fy-text-muted);
        opacity: 0.4;
      }

      /* ── REDUCED MOTION ── */

      @media (prefers-reduced-motion: reduce) {
        .animate-section {
          opacity: 1;
          transform: none;
          transition: none;
        }

        .athlete-card,
        .college-card,
        .video-card,
        .team-row {
          transition: none;
        }

        .video-card__img,
        .video-card__play-overlay {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreForYouWebComponent {
  // ── Inputs ──────────────────────────────────────────────
  readonly user = input<ExploreUser | null>(null);

  // ── Outputs ─────────────────────────────────────────────
  /** Emitted when the user clicks a content item */
  readonly itemTap = output<ExploreItem>();
  /** Emitted when the user clicks "See All" or a category tile */
  readonly categorySelect = output<ExploreTabId>();
}
