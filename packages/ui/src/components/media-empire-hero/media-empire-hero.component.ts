/**
 * @fileoverview NxtMediaEmpireHeroComponent — Media Empire Hero Section
 * @module @nxt1/ui/components/media-empire-hero
 *
 * Shared hero for content creation surfaces. Centered header above a
 * professional 4-screen phone-mockup visualization showing TikTok,
 * Instagram Reels, YouTube Shorts, and an NXT1 player website — all
 * generated from a single upload.
 *
 * SSR-safe, semantic, token-driven, and accessibility-ready.
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NxtAppStoreBadgesComponent } from '../app-store-badges';
import { NxtCtaButtonComponent } from '../cta-button';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';

@Component({
  selector: 'nxt1-media-empire-hero',
  standalone: true,
  imports: [NxtSectionHeaderComponent, NxtCtaButtonComponent, NxtAppStoreBadgesComponent],
  template: `
    <section class="media-empire" [attr.aria-labelledby]="titleId()">
      <!-- ── Centered header above visual ── -->
      <div class="media-empire__header">
        <nxt1-section-header
          variant="hero"
          align="center"
          [titleId]="titleId()"
          [headingLevel]="headingLevel()"
          eyebrow="Media Empire"
          title="Be Your Own ESPN."
          subtitle="Turn raw game footage and photos into a 24/7 content machine — no editors needed."
          support="Upload once in NXT1 and publish everywhere with pro-level consistency."
        />

        <div class="media-empire__actions">
          <nxt1-cta-button
            class="media-empire__cta-desktop"
            label="Start Free With NXT1"
            [route]="primaryCtaRoute()"
            variant="primary"
            [ariaLabel]="primaryCtaAriaLabel()"
          />
          <nxt1-cta-button
            class="media-empire__cta-desktop"
            label="Log In"
            [route]="secondaryCtaRoute()"
            variant="secondary"
            ariaLabel="Log in to your NXT1 account"
          />

          <nxt1-app-store-badges class="media-empire__cta-mobile" layout="row" />
        </div>
      </div>

      <!-- ── 4-screen phone mockup visual ── -->
      <div class="media-empire__screens" aria-hidden="true">
        <!-- TikTok Phone -->
        <article class="phone phone--tiktok">
          <div class="phone__frame">
            <div class="phone__notch"></div>
            <div class="phone__body">
              <div class="phone__video-thumb phone__video-thumb--tiktok">
                <div class="phone__play-icon">▶</div>
              </div>
              <div class="phone__overlay-bottom">
                <div class="phone__profile-row">
                  <div class="phone__avatar"></div>
                  <div class="phone__meta">
                    <p class="phone__username">&#64;avery.ball</p>
                    <p class="phone__caption">
                      Game-winning TD catch 🔥 #football #recruiting #nxt1
                    </p>
                  </div>
                </div>
                <div class="phone__engagement">
                  <span class="phone__stat-pill">♥ 12.4K</span>
                  <span class="phone__stat-pill">💬 847</span>
                  <span class="phone__stat-pill">↗ 2.1K</span>
                </div>
              </div>
            </div>
            <p class="phone__platform-label">TikTok</p>
          </div>
        </article>

        <!-- Instagram Reels Phone -->
        <article class="phone phone--instagram">
          <div class="phone__frame">
            <div class="phone__notch"></div>
            <div class="phone__body">
              <div class="phone__video-thumb phone__video-thumb--instagram">
                <div class="phone__play-icon">▶</div>
              </div>
              <div class="phone__overlay-bottom">
                <div class="phone__profile-row">
                  <div class="phone__avatar"></div>
                  <div class="phone__meta">
                    <p class="phone__username">&#64;avery.ball</p>
                    <p class="phone__caption">Elite highlight reel — QB #11 🏈</p>
                  </div>
                </div>
                <div class="phone__engagement">
                  <span class="phone__stat-pill">♥ 8.9K</span>
                  <span class="phone__stat-pill">💬 312</span>
                  <span class="phone__stat-pill">🔖 1.4K</span>
                </div>
              </div>
            </div>
            <p class="phone__platform-label">Instagram Reels</p>
          </div>
        </article>

        <!-- YouTube Shorts Phone -->
        <article class="phone phone--youtube">
          <div class="phone__frame">
            <div class="phone__notch"></div>
            <div class="phone__body">
              <div class="phone__video-thumb phone__video-thumb--youtube">
                <div class="phone__play-icon">▶</div>
              </div>
              <div class="phone__overlay-bottom">
                <div class="phone__profile-row">
                  <div class="phone__avatar"></div>
                  <div class="phone__meta">
                    <p class="phone__username">Avery Johnson</p>
                    <p class="phone__caption">Coach-ready highlight cut — 2027 QB recruit</p>
                  </div>
                </div>
                <div class="phone__engagement">
                  <span class="phone__stat-pill">👁 24K views</span>
                  <span class="phone__stat-pill">👍 1.8K</span>
                </div>
              </div>
            </div>
            <p class="phone__platform-label">YouTube Shorts</p>
          </div>
        </article>

        <!-- NXT1 Player Site Phone -->
        <article class="phone phone--website">
          <div class="phone__frame">
            <div class="phone__notch"></div>
            <div class="phone__body phone__body--website">
              <!-- Browser bar inside phone -->
              <div class="phone__browser-bar">
                <span class="phone__browser-dot"></span>
                <span class="phone__browser-dot"></span>
                <span class="phone__browser-dot"></span>
                <span class="phone__browser-url">avery-2027.nxt1.ai</span>
              </div>
              <!-- Website hero image placeholder -->
              <div class="phone__website-hero-img"></div>
              <!-- Profile card -->
              <div class="phone__website-profile">
                <div class="phone__avatar phone__avatar--lg"></div>
                <div class="phone__website-info">
                  <p class="phone__website-name">Avery Johnson</p>
                  <p class="phone__website-pos">QB · Class of 2027 · Austin, TX</p>
                </div>
              </div>
              <!-- Stats row -->
              <div class="phone__website-stats">
                <div class="phone__website-stat-item">
                  <span class="phone__website-stat-val">4.52</span>
                  <span class="phone__website-stat-key">40 Time</span>
                </div>
                <div class="phone__website-stat-item">
                  <span class="phone__website-stat-val">6'1"</span>
                  <span class="phone__website-stat-key">Height</span>
                </div>
                <div class="phone__website-stat-item">
                  <span class="phone__website-stat-val">195</span>
                  <span class="phone__website-stat-key">Weight</span>
                </div>
                <div class="phone__website-stat-item">
                  <span class="phone__website-stat-val">3.8</span>
                  <span class="phone__website-stat-key">GPA</span>
                </div>
              </div>
              <!-- Content row placeholders -->
              <div class="phone__website-content-row">
                <div class="phone__website-thumb"></div>
                <div class="phone__website-thumb"></div>
                <div class="phone__website-thumb"></div>
              </div>
            </div>
            <p class="phone__platform-label">NXT1 Player Site</p>
          </div>
        </article>
      </div>

      <!-- ── Central source badge ── -->
      <div class="media-empire__source-badge" aria-hidden="true">
        <span class="source-badge__dot"></span>
        <span class="source-badge__text">One upload → four platforms</span>
      </div>
    </section>
  `,
  styles: [
    `
      /* ── Pulse glow on source badge ── */
      @keyframes media-empire-pulse {
        0%,
        100% {
          opacity: 0.5;
        }
        50% {
          opacity: 1;
        }
      }

      :host {
        display: block;

        /*
         * Local variables for the phone-mockup internals.
         * These sit on ALWAYS-DARK video thumbnails / overlays,
         * so they must remain white regardless of light/dark theme.
         * Third-party brand gradients (TikTok, Instagram, YouTube)
         * are also declared here — they are NOT NXT1 design tokens.
         */
        --_phone-text: #fff;
        --_phone-text-muted: rgba(255, 255, 255, 0.8);
        --_phone-text-subtle: rgba(255, 255, 255, 0.9);
        --_phone-glass: rgba(255, 255, 255, 0.18);
        --_phone-glass-border: rgba(255, 255, 255, 0.3);
        --_phone-pill-bg: rgba(255, 255, 255, 0.12);
        --_phone-overlay-bg: rgba(0, 0, 0, 0.7);

        /* Third-party brand palettes (not NXT1 tokens) */
        --_brand-tiktok-start: #010101;
        --_brand-tiktok-mid1: #1a1a2e;
        --_brand-tiktok-mid2: #16213e;
        --_brand-tiktok-end: #0f3460;
        --_brand-ig-1: #833ab4;
        --_brand-ig-2: #c13584;
        --_brand-ig-3: #e1306c;
        --_brand-ig-4: #fd1d1d;
        --_brand-ig-5: #f56040;
        --_brand-ig-6: #fcaf45;
        --_brand-yt-start: #1a1a1a;
        --_brand-yt-mid: #282828;
        --_brand-yt-end: #3d0000;

        /*
         * Sub-token miniature font sizes for phone-mockup chrome.
         * The token floor is --nxt1-fontSize-2xs (0.625rem / 10px).
         * Phone-screen text is intentionally smaller to simulate
         * real mobile-app UI at reduced scale.
         */
        --_phone-fs-micro: var(--nxt1-fontSize-2xs);
        --_phone-fs-nano: calc(var(--nxt1-fontSize-2xs) * 0.9);
        --_phone-fs-pico: calc(var(--nxt1-fontSize-2xs) * 0.8);
        --_phone-fs-femto: calc(var(--nxt1-fontSize-2xs) * 0.7);
      }

      /* ============================================
         SECTION LAYOUT — Single column, centered
         ============================================ */
      .media-empire {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-10);
        max-width: var(--nxt1-section-max-width);
        margin-inline: auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      /* ── Header block (centered) ── */
      .media-empire__header {
        display: grid;
        gap: var(--nxt1-spacing-6);
        justify-items: center;
        text-align: center;
      }

      .media-empire__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-3);
        justify-content: center;
      }

      .media-empire__cta-desktop {
        display: none;
      }

      .media-empire__cta-mobile {
        display: inline-flex;
      }

      @media (min-width: 1024px) {
        .media-empire__cta-desktop {
          display: inline-flex;
        }

        .media-empire__cta-mobile {
          display: none;
        }
      }

      /* ============================================
         PHONE GRID — Responsive 4-up
         ============================================ */
      .media-empire__screens {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--nxt1-spacing-4);
        max-width: var(--nxt1-section-max-width-narrow);
        margin-inline: auto;
        width: 100%;
      }

      /* ============================================
         SOURCE BADGE — Pill below phones
         ============================================ */
      .media-empire__source-badge {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        justify-content: center;
      }

      .source-badge__dot {
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        box-shadow: var(--nxt1-glow-sm);
        animation: media-empire-pulse 2400ms ease-in-out infinite;
      }

      .source-badge__text {
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      /* ============================================
         PHONE DEVICE FRAME
         ============================================ */
      .phone__frame {
        position: relative;
        display: flex;
        flex-direction: column;
        border-radius: var(--nxt1-borderRadius-2xl);
        border: var(--nxt1-spacing-0_5) solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-100);
        overflow: hidden;
        box-shadow: var(--nxt1-shadow-lg);
        aspect-ratio: 9 / 16;
      }

      .phone__notch {
        flex-shrink: 0;
        width: 35%;
        height: var(--nxt1-spacing-1_5);
        margin: var(--nxt1-spacing-2) auto var(--nxt1-spacing-1);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-border-default);
      }

      .phone__body {
        position: relative;
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .phone__platform-label {
        margin: 0;
        padding: var(--nxt1-spacing-2) 0;
        text-align: center;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        background: var(--nxt1-color-surface-100);
      }

      /* ============================================
         VIDEO THUMBNAIL — Third-party brand gradients
         ============================================ */
      .phone__video-thumb {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 0;
      }

      .phone__video-thumb--tiktok {
        background: linear-gradient(
          160deg,
          var(--_brand-tiktok-start) 0%,
          var(--_brand-tiktok-mid1) 40%,
          var(--_brand-tiktok-mid2) 60%,
          var(--_brand-tiktok-end) 100%
        );
      }

      .phone__video-thumb--instagram {
        background: linear-gradient(
          135deg,
          var(--_brand-ig-1) 0%,
          var(--_brand-ig-2) 30%,
          var(--_brand-ig-3) 50%,
          var(--_brand-ig-4) 70%,
          var(--_brand-ig-5) 85%,
          var(--_brand-ig-6) 100%
        );
        opacity: 0.85;
      }

      .phone__video-thumb--youtube {
        background: linear-gradient(
          160deg,
          var(--_brand-yt-start) 0%,
          var(--_brand-yt-mid) 50%,
          var(--_brand-yt-end) 100%
        );
      }

      .phone__play-icon {
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--_phone-glass);
        backdrop-filter: blur(var(--nxt1-spacing-2));
        color: var(--_phone-text);
        font-size: var(--nxt1-fontSize-lg);
        line-height: 1;
      }

      /* ============================================
         OVERLAY BOTTOM — Profile + engagement
         ============================================ */
      .phone__overlay-bottom {
        flex-shrink: 0;
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
        background: linear-gradient(0deg, var(--_phone-overlay-bg) 0%, transparent 100%);
        margin-top: auto;
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
      }

      .phone__profile-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .phone__avatar {
        flex-shrink: 0;
        width: var(--nxt1-spacing-8);
        height: var(--nxt1-spacing-8);
        border-radius: var(--nxt1-borderRadius-full);
        background: linear-gradient(
          135deg,
          var(--nxt1-color-primary),
          color-mix(in srgb, var(--nxt1-color-primary) 40%, var(--nxt1-color-surface-100))
        );
        border: var(--nxt1-spacing-0_5) solid var(--_phone-glass-border);
      }

      .phone__avatar--lg {
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-12);
      }

      .phone__meta {
        min-width: 0;
      }

      .phone__username {
        margin: 0;
        color: var(--_phone-text);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .phone__caption {
        margin: 0;
        color: var(--_phone-text-muted);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--_phone-fs-micro);
        line-height: var(--nxt1-lineHeight-normal);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .phone__engagement {
        display: flex;
        gap: var(--nxt1-spacing-1_5);
        flex-wrap: wrap;
      }

      .phone__stat-pill {
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--_phone-pill-bg);
        color: var(--_phone-text-subtle);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--_phone-fs-micro);
        font-weight: var(--nxt1-fontWeight-medium);
        white-space: nowrap;
      }

      /* ============================================
         BROWSER BAR (NXT1 website card)
         ============================================ */
      .phone__browser-bar {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-200);
        border-bottom: var(--nxt1-spacing-px) solid var(--nxt1-color-border-default);
      }

      .phone__browser-dot {
        width: var(--nxt1-spacing-1_5);
        height: var(--nxt1-spacing-1_5);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-border-default);
      }

      .phone__browser-url {
        flex: 1;
        margin-left: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--_phone-fs-micro);
        line-height: var(--nxt1-lineHeight-normal);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .phone__body--website {
        padding: 0;
        gap: 0;
        background: var(--nxt1-color-surface-100);
      }

      /* ── Website hero image placeholder ── */
      .phone__website-hero-img {
        width: 100%;
        height: 0;
        padding-bottom: 36%;
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--nxt1-color-primary) 70%, var(--nxt1-color-surface-100)) 0%,
          color-mix(in srgb, var(--nxt1-color-primary) 30%, var(--nxt1-color-surface-200)) 100%
        );
      }

      /* ── Website profile card ── */
      .phone__website-profile {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
        margin-top: calc(-1 * var(--nxt1-spacing-5));
        position: relative;
        z-index: 1;
      }

      .phone__website-info {
        min-width: 0;
      }

      .phone__website-name {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .phone__website-pos {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--_phone-fs-micro);
        line-height: var(--nxt1-lineHeight-normal);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ── Website stats grid ── */
      .phone__website-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--nxt1-spacing-px);
        background: var(--nxt1-color-border-default);
        margin: 0 var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-md);
        overflow: hidden;
      }

      .phone__website-stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-0_5);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-1);
        background: var(--nxt1-color-surface-100);
      }

      .phone__website-stat-val {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: 1;
      }

      .phone__website-stat-key {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--_phone-fs-nano);
        line-height: 1;
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      /* ── Website thumbnail row ── */
      .phone__website-content-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-3);
      }

      .phone__website-thumb {
        aspect-ratio: 1;
        border-radius: var(--nxt1-borderRadius-md);
        background: linear-gradient(
          135deg,
          var(--nxt1-color-surface-200) 0%,
          color-mix(in srgb, var(--nxt1-color-primary) 12%, var(--nxt1-color-surface-200)) 100%
        );
      }

      /* ============================================
         RESPONSIVE — Mobile (<640px)
         ============================================ */
      @media (max-width: 639px) {
        .media-empire__actions nxt1-cta-button {
          flex: 1 1 100%;
        }

        .media-empire__screens {
          gap: var(--nxt1-spacing-3);
        }

        .phone__frame {
          border-radius: var(--nxt1-borderRadius-xl);
        }

        .phone__play-icon {
          width: var(--nxt1-spacing-8);
          height: var(--nxt1-spacing-8);
          font-size: var(--nxt1-fontSize-sm);
        }

        .phone__overlay-bottom {
          padding: var(--nxt1-spacing-2);
        }

        .phone__avatar {
          width: var(--nxt1-spacing-6);
          height: var(--nxt1-spacing-6);
        }

        .phone__avatar--lg {
          width: var(--nxt1-spacing-8);
          height: var(--nxt1-spacing-8);
        }

        .phone__username {
          font-size: var(--_phone-fs-nano);
        }

        .phone__caption {
          font-size: var(--_phone-fs-pico);
          -webkit-line-clamp: 1;
        }

        .phone__stat-pill {
          font-size: var(--_phone-fs-pico);
          padding: var(--nxt1-spacing-px) var(--nxt1-spacing-1);
        }

        .phone__browser-url {
          font-size: var(--_phone-fs-pico);
        }

        .phone__website-name {
          font-size: var(--nxt1-fontSize-xs);
        }

        .phone__website-stat-val {
          font-size: var(--_phone-fs-micro);
        }

        .phone__website-stat-key {
          font-size: var(--_phone-fs-femto);
        }

        .phone__website-thumb {
          border-radius: var(--nxt1-borderRadius-sm);
        }
      }

      /* ============================================
         RESPONSIVE — Tablet+ (768px)
         ============================================ */
      @media (min-width: 768px) {
        .media-empire__screens {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: var(--nxt1-spacing-5);
        }
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */
      @media (prefers-reduced-motion: reduce) {
        .source-badge__dot {
          animation: none;
          opacity: 1;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtMediaEmpireHeroComponent {
  readonly headingLevel = input<SectionHeaderLevel>(1);
  readonly titleId = input<string>('media-empire-hero-title');
  readonly primaryCtaRoute = input<string>('/auth');
  readonly secondaryCtaRoute = input<string>('/auth');
  readonly primaryCtaAriaLabel = input<string>('Create your NXT1 account');
}
