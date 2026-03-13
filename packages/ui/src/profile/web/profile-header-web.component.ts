/**
 * @fileoverview Madden Franchise Mode — Showcase Banner (Web / Desktop)
 *
 * Full-width hero showcase with banner background and player portrait
 * overlayed on the RIGHT, fading left into the banner — Madden 25 style.
 *
 * Reference: Dallas Turner — Vikings — Madden 25 Franchise Mode
 * SEO-optimized with schema.org microdata for SSR.
 */
import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ProfileUser, PlayerCardData, ProspectTier } from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { ProfileService } from '../profile.service';

@Component({
  selector: 'nxt1-profile-header-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtImageComponent],
  template: `
    <header
      class="madden-card"
      [attr.data-tier]="currentTier()"
      itemscope
      itemtype="https://schema.org/Person"
    >
      <!-- ═══ MADDEN SHOWCASE: Banner + Player Image with Fade ═══ -->
      <div class="mc-showcase">
        <!-- Background: Banner image or dark -->
        <div class="mc-showcase-bg" [style.backgroundImage]="bannerStyle()">
          @if (!user()?.bannerImg) {
            <div class="mc-showcase-grid" aria-hidden="true"></div>
          }
          <div class="mc-showcase-overlay" aria-hidden="true"></div>
        </div>

        <!-- Player portrait: Right side, contained rectangle, fades on left edge -->
        @if (user()?.profileImg) {
          <div class="mc-player-render">
            <nxt1-image
              [src]="user()?.profileImg"
              [alt]="displayName()"
              [width]="400"
              [height]="500"
              fit="cover"
              [priority]="true"
              [showPlaceholder]="false"
            />
          </div>
        }

        <!-- Identity overlay (hidden when profile page header shows it) -->
        @if (!hideIdentity()) {
          <div class="mc-hero">
            <!-- Team Logo (large, like Madden's team crest) -->
            <div class="mc-team-logo">
              @if (user()?.school?.logoUrl) {
                <nxt1-image
                  [src]="user()?.school?.logoUrl"
                  [alt]="user()?.school?.name || ''"
                  [width]="36"
                  [height]="36"
                  variant="avatar"
                  fit="contain"
                  [showPlaceholder]="false"
                />
              } @else {
                <div class="mc-team-placeholder">
                  <nxt1-icon name="school-outline" [size]="36" />
                </div>
              }
            </div>

            <!-- Identity + Split Name -->
            <div class="mc-identity" itemprop="name">
              @if (activeSport()) {
                <div class="mc-pos-line">
                  <span class="mc-pos">{{ activeSport()?.position }}</span>
                  @if (activeSport()?.jerseyNumber) {
                    <span class="mc-jersey">#{{ activeSport()?.jerseyNumber }}</span>
                  }
                </div>
              }
              <div class="mc-name-block">
                <span class="mc-first-name">{{ firstName() }}</span>
                <h1 class="mc-last-name">{{ lastName() }}</h1>
              </div>
              @if (user()?.verificationStatus === 'verified') {
                <div class="mc-verified-badge">
                  <nxt1-icon name="verified" [size]="16" />
                  <span>Verified Athlete</span>
                </div>
              }
            </div>

            <!-- OVR Badge -->
            <div class="mc-ovr">
              @if (hasProspectGrade()) {
                <span class="mc-ovr-num">{{ playerCard()?.prospectGrade?.overall }}</span>
              } @else {
                <span class="mc-ovr-num mc-ovr-unrated">--</span>
              }
              <span class="mc-ovr-label">OVR</span>
              @if (playerCard()?.prospectGrade?.starRating) {
                <div class="mc-ovr-stars">
                  @for (star of starsArray(); track $index) {
                    <span class="mc-star">★</span>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>
    </header>
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════════════════════
       EA MADDEN FRANCHISE MODE — PLAYER CARD (WEB / DESKTOP)
       Two-column layout matching Madden 25 player overview
       ═══════════════════════════════════════════════════════════ */
      :host {
        display: block;
        --card-bg: var(--nxt1-color-bg-primary, #0e0e0e);
        --card-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --card-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --card-text: var(--nxt1-color-text-primary, #ffffff);
        --card-text-2: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --card-text-3: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        --card-accent: var(--nxt1-color-primary, #d4ff00);
        --card-verified: var(--nxt1-color-info, #4da6ff);
      }

      /* ─── OVR Tier Colors ─── */
      .madden-card[data-tier='elite'] {
        --ovr-color: var(--card-accent);
        --ovr-glow: rgba(212, 255, 0, 0.45);
        --ovr-text: #000;
      }
      .madden-card[data-tier='blue-chip'] {
        --ovr-color: #00e676;
        --ovr-glow: rgba(0, 230, 118, 0.35);
        --ovr-text: #000;
      }
      .madden-card[data-tier='starter'] {
        --ovr-color: #42a5f5;
        --ovr-glow: rgba(66, 165, 245, 0.35);
        --ovr-text: #000;
      }
      .madden-card[data-tier='prospect'] {
        --ovr-color: #ff9800;
        --ovr-glow: rgba(255, 152, 0, 0.35);
        --ovr-text: #000;
      }
      .madden-card[data-tier='developing'] {
        --ovr-color: #78909c;
        --ovr-glow: rgba(120, 144, 156, 0.25);
        --ovr-text: #fff;
      }
      .madden-card[data-tier='unrated'] {
        --ovr-color: rgba(255, 255, 255, 0.08);
        --ovr-glow: transparent;
        --ovr-text: rgba(255, 255, 255, 0.25);
      }

      .madden-card {
        position: relative;
        background: var(--card-bg);
        padding-bottom: 24px;
      }

      /* ─── MADDEN SHOWCASE ─── */
      .mc-showcase {
        position: relative;
        height: 400px;
        margin: 0 16px;
        border-radius: 16px;
        overflow: hidden;
        background: #0e0e0e;
      }

      /* Showcase background (banner image) */
      .mc-showcase-bg {
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: center top;
        background-color: #1a1a1a;
      }
      .mc-showcase-grid {
        position: absolute;
        inset: 0;
        background:
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent 60px,
            rgba(255, 255, 255, 0.02) 60px,
            rgba(255, 255, 255, 0.02) 61px
          ),
          repeating-linear-gradient(
            0deg,
            transparent,
            transparent 60px,
            rgba(255, 255, 255, 0.02) 60px,
            rgba(255, 255, 255, 0.02) 61px
          );
      }
      .mc-showcase-overlay {
        position: absolute;
        inset: 0;
        /* Side fade only: dark on left (for text), transparent on right (banner shows) */
        background: linear-gradient(
          to right,
          rgba(14, 14, 14, 0.7) 0%,
          rgba(14, 14, 14, 0.35) 30%,
          transparent 55%
        );
        z-index: 1;
      }

      /* Player portrait: RIGHT side, contained box, CSS mask fades left edge */
      .mc-player-render {
        position: absolute;
        right: 16px;
        top: 16px;
        bottom: 16px;
        width: 240px;
        z-index: 2;
        border-radius: 12px;
        overflow: hidden;
      }
      .mc-player-render img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center top;
      }

      /* ─── HERO ZONE (inside showcase, left side) ─── */
      .mc-hero {
        position: absolute;
        left: 24px;
        bottom: 24px;
        right: 50%;
        display: flex;
        align-items: flex-end;
        gap: 16px;
        z-index: 3;
      }

      /* Team Logo */
      .mc-team-logo {
        flex-shrink: 0;
        width: 80px;
        height: 80px;
        border-radius: 16px;
        overflow: hidden;
        background: var(--card-surface);
        border: 2px solid var(--card-border);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .mc-team-logo img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .mc-team-placeholder {
        color: var(--card-text-3);
      }

      /* Identity */
      .mc-identity {
        flex: 1;
        min-width: 0;
      }
      .mc-pos-line {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 2px;
      }
      .mc-pos {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--card-text-2);
      }
      .mc-jersey {
        font-size: 13px;
        font-weight: 800;
        color: var(--card-text);
      }

      /* Madden split name */
      .mc-name-block {
        display: flex;
        flex-direction: column;
        line-height: 1;
      }
      .mc-first-name {
        font-size: 18px;
        font-weight: 400;
        color: var(--card-text-2);
        letter-spacing: 0.02em;
      }
      .mc-last-name {
        font-size: 48px;
        font-weight: 900;
        color: var(--card-text);
        letter-spacing: -0.03em;
        line-height: 0.92;
        margin: 0;
      }
      .mc-verified-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-top: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--card-verified);
      }

      /* OVR Badge */
      .mc-ovr {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 72px;
        height: 72px;
        border-radius: 12px;
        background: var(--ovr-color);
        color: var(--ovr-text);
        box-shadow:
          0 0 28px var(--ovr-glow),
          0 6px 16px rgba(0, 0, 0, 0.5);
        position: relative;
        transition:
          transform 0.3s ease,
          box-shadow 0.3s ease;
      }
      .mc-ovr:hover {
        transform: scale(1.06);
        box-shadow:
          0 0 36px var(--ovr-glow),
          0 8px 24px rgba(0, 0, 0, 0.4);
      }
      .mc-ovr-num {
        font-size: 34px;
        font-weight: 900;
        line-height: 1;
      }
      .mc-ovr-unrated {
        font-size: 26px;
      }
      .mc-ovr-label {
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        opacity: 0.7;
        margin-top: -1px;
      }
      .mc-ovr-stars {
        position: absolute;
        bottom: -14px;
        display: flex;
        gap: 1px;
      }
      .mc-star {
        font-size: 11px;
        color: var(--ovr-color);
        filter: drop-shadow(0 0 2px var(--ovr-glow));
      }

      /* ─── RESPONSIVE ─── */
      @media (max-width: 840px) {
        .mc-showcase {
          height: 300px;
        }
        .mc-player-render {
          width: 180px;
          right: 12px;
          top: 12px;
          bottom: 12px;
        }
        .mc-hero {
          right: 55%;
        }
        .mc-last-name {
          font-size: 32px;
        }
        .mc-team-logo {
          width: 56px;
          height: 56px;
        }
        .mc-ovr {
          width: 60px;
          height: 60px;
        }
        .mc-ovr-num {
          font-size: 28px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileHeaderWebComponent {
  // ─── SERVICE ───
  protected readonly profile = inject(ProfileService);

  // ─── INPUTS ───
  readonly user = input<ProfileUser | null>(null);
  readonly playerCard = input<PlayerCardData | null>(null);
  readonly hideIdentity = input(false);

  // ─── OUTPUTS ───
  readonly editBanner = output<void>();

  // ─── COMPUTED ───
  /** Use activeSport() for sport-switching support */
  protected readonly activeSport = computed(() => this.profile.activeSport());

  protected readonly displayName = computed(() => {
    const u = this.user();
    return u?.displayName ?? (`${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'User');
  });

  protected readonly firstName = computed(() => {
    const u = this.user();
    return u?.firstName || this.displayName().split(' ')[0] || '';
  });

  protected readonly lastName = computed(() => {
    const u = this.user();
    if (u?.lastName) return u.lastName;
    const parts = this.displayName().split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
  });

  protected readonly hasMeasurables = computed(() => {
    const u = this.user();
    return !!(u?.height || u?.weight || u?.gpa || u?.classYear || u?.sat || u?.act);
  });

  protected readonly hasProspectGrade = computed(() => {
    const grade = this.playerCard()?.prospectGrade;
    return !!(grade && grade.overall > 0);
  });

  protected readonly currentTier = computed((): ProspectTier => {
    return this.playerCard()?.prospectGrade?.tier ?? 'unrated';
  });

  protected readonly starsArray = computed(() => {
    const count = this.playerCard()?.prospectGrade?.starRating ?? 0;
    return Array.from({ length: count });
  });

  protected readonly bannerStyle = computed(() => {
    const banner = this.user()?.bannerImg;
    return banner ? `url(${banner})` : 'none';
  });
}
