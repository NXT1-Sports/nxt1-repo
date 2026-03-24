/**
 * @fileoverview Profile Mobile Hero Component
 * @module @nxt1/ui/profile/components
 *
 * Shared profile section component used by both web and mobile shells.
 * Mobile-only hero section showing carousel, identity, and stats.
 * Hidden on wide (md+) layouts where page-header handles this info.
 */
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';

import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { NxtImageCarouselComponent } from '../../components/image-carousel';
import { ProfileService } from '../profile.service';
import { getVerification, normalizeWeightDisplay, isFemaleGender } from '@nxt1/core';

@Component({
  selector: 'nxt1-profile-mobile-hero',
  standalone: true,
  imports: [NxtIconComponent, NxtImageComponent, NxtImageCarouselComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="madden-mobile-hero md:hidden" aria-label="Profile summary">
      @if (profile.profileImgs().length > 0) {
        <div class="madden-mobile-hero__carousel">
          <div class="carousel-glow-wrap">
            <div class="carousel-glow-border" aria-hidden="true"></div>
            <div class="carousel-glow-ambient" aria-hidden="true"></div>
            <nxt1-image-carousel
              [images]="profile.profileImgs()"
              [alt]="desktopTitle()"
              [autoPlay]="true"
              [autoPlayInterval]="4200"
              [overlayTitle]="desktopTitle()"
              [overlaySubtitle]="carouselOverlaySubtitle()"
              [overlayTitles]="carouselOverlayTitles()"
              [overlaySubtitles]="carouselOverlaySubtitles()"
              class="madden-player-carousel"
            />
            @if (
              profile.user()?.verificationStatus === 'verified' ||
              profile.user()?.verificationStatus === 'premium'
            ) {
              <span class="carousel-verified-badge">
                <nxt1-icon name="checkmarkCircle" [size]="14" />
                Verified
              </span>
            }
          </div>
        </div>
      }

      <div class="madden-mobile-hero__identity">
        <h1 class="madden-mobile-hero__name">{{ mobileDisplayName() }}</h1>
        @if (mobileSubtitleLine()) {
          <p class="madden-mobile-hero__meta">{{ mobileSubtitleLine() }}</p>
        }
        @if (!isOwnProfile()) {
          <button
            type="button"
            class="madden-mobile-hero__follow-btn"
            [class.madden-mobile-hero__follow-btn--following]="profile.followStats()?.isFollowing"
            [attr.aria-label]="
              profile.followStats()?.isFollowing ? 'Unfollow athlete' : 'Follow athlete'
            "
            (click)="followClick.emit()"
          >
            <nxt1-icon
              [name]="profile.followStats()?.isFollowing ? 'checkmark' : 'plus'"
              [size]="13"
            />
            {{ profile.followStats()?.isFollowing ? 'Following' : 'Follow' }}
          </button>
        }
        <!-- Mobile hero stats (Class, Height, Weight, Location) -->
        <div class="madden-mobile-hero__stats">
          @if (profile.user()?.classYear) {
            <div class="mobile-hero-stat">
              <span class="mobile-hero-stat__key">Class:</span>
              <span class="mobile-hero-stat__val">{{ profile.user()?.classYear }}</span>
            </div>
          }
          @if (profile.user()?.height) {
            <div class="mobile-hero-stat">
              <span class="mobile-hero-stat__key">Height:</span>
              <span class="mobile-hero-stat__val-wrap">
                <span class="mobile-hero-stat__val">{{ profile.user()?.height }}</span>
                @if (measurablesVerification()) {
                  @if (measurablesProviderUrl()) {
                    <a
                      class="ov-verified-badge ov-verified-link"
                      [href]="measurablesProviderUrl()!"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span class="ov-verified-logo">
                        <nxt1-image
                          class="ov-verified-logo-img"
                          [src]="measurablesProviderLogoSrc()"
                          [alt]="measurablesVerifiedByLabel() + ' logo'"
                          [width]="60"
                          [height]="14"
                          fit="contain"
                          [showPlaceholder]="false"
                        />
                      </span>
                    </a>
                  } @else {
                    <span class="ov-verified-badge">
                      <span class="ov-verified-logo">
                        <nxt1-image
                          class="ov-verified-logo-img"
                          [src]="measurablesProviderLogoFallbackSrc()"
                          [alt]="measurablesVerifiedByLabel() + ' logo'"
                          [width]="60"
                          [height]="14"
                          fit="contain"
                          [showPlaceholder]="false"
                        />
                      </span>
                    </span>
                  }
                }
              </span>
            </div>
          }
          @if (showWeight()) {
            <div class="mobile-hero-stat">
              <span class="mobile-hero-stat__key">Weight:</span>
              <span class="mobile-hero-stat__val-wrap">
                <span class="mobile-hero-stat__val">{{ formattedWeight() }}</span>
                @if (measurablesVerification()) {
                  @if (measurablesProviderUrl()) {
                    <a
                      class="ov-verified-badge ov-verified-link"
                      [href]="measurablesProviderUrl()!"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span class="ov-verified-logo">
                        <nxt1-image
                          class="ov-verified-logo-img"
                          [src]="measurablesProviderLogoSrc()"
                          [alt]="measurablesVerifiedByLabel() + ' logo'"
                          [width]="60"
                          [height]="14"
                          fit="contain"
                          [showPlaceholder]="false"
                        />
                      </span>
                    </a>
                  } @else {
                    <span class="ov-verified-badge">
                      <span class="ov-verified-logo">
                        <nxt1-image
                          class="ov-verified-logo-img"
                          [src]="measurablesProviderLogoFallbackSrc()"
                          [alt]="measurablesVerifiedByLabel() + ' logo'"
                          [width]="60"
                          [height]="14"
                          fit="contain"
                          [showPlaceholder]="false"
                        />
                      </span>
                    </span>
                  }
                }
              </span>
            </div>
          }
          @if (profile.user()?.location) {
            <div class="mobile-hero-stat">
              <span class="mobile-hero-stat__key">Location:</span>
              <span class="mobile-hero-stat__val">{{ profile.user()?.location }}</span>
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* Desktop: hide mobile hero */
      .madden-mobile-hero {
        display: none;
      }

      /* Mobile hero stats hidden on desktop */
      .madden-mobile-hero__stats {
        display: none;
      }

      /* Verified badge for measurables */
      .ov-verified-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--m-accent, #ceff00) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--m-accent, #ceff00) 25%, transparent);
        flex-shrink: 0;
      }
      .ov-verified-link {
        text-decoration: none;
        cursor: pointer;
        transition:
          border-color 120ms ease-out,
          background 120ms ease-out;
      }
      .ov-verified-link:hover {
        border-color: var(--m-accent, #ceff00);
        background: color-mix(in srgb, var(--m-accent, #ceff00) 18%, transparent);
      }
      .ov-verified-logo {
        display: flex;
        align-items: center;
        line-height: 0;
      }
      .ov-verified-logo-img {
        width: 14px;
        height: 14px;
        object-fit: contain;
        border-radius: 2px;
      }

      /* Carousel glow effects */
      .carousel-glow-wrap {
        position: relative;
        max-width: 400px;
        width: 100%;
        border-radius: var(--nxt1-radius-2xl, 20px);
        overflow: hidden;
      }
      .carousel-glow-border {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        z-index: 2;
        border: 1.5px solid rgba(255, 255, 255, 0.08);
      }
      .carousel-glow-ambient {
        position: absolute;
        inset: -2px;
        border-radius: inherit;
        pointer-events: none;
        z-index: 0;
        background: radial-gradient(ellipse at 50% 0%, rgba(212, 255, 0, 0.08) 0%, transparent 70%);
      }
      .carousel-verified-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 15%, rgba(0, 0, 0, 0.65));
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 40%, transparent);
        color: var(--nxt1-color-primary, #d4ff00);
        font-size: 11px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 999px;
        z-index: 5;
        pointer-events: none;
        line-height: 1;
      }

      /* ── Mobile breakpoint ── */
      @media (max-width: 768px) {
        .madden-mobile-hero {
          display: grid;
          grid-template-columns: 148px minmax(0, 1fr);
          gap: 12px;
          align-items: start;
          margin: 32px 12px 10px;
        }
        .madden-mobile-hero__carousel {
          width: 148px;
        }
        .madden-mobile-hero__carousel .carousel-glow-wrap {
          width: 148px;
          max-width: none;
          height: 220px;
          border-radius: 14px;
        }
        .madden-mobile-hero__carousel .madden-player-carousel {
          width: 100%;
          height: 100%;
          border-radius: 14px;
          overflow: hidden;
        }
        .madden-mobile-hero__carousel .madden-player-carousel ::ng-deep .carousel {
          height: 100%;
          border-radius: 14px;
        }
        .madden-mobile-hero__carousel .madden-player-carousel ::ng-deep .carousel::before {
          border-radius: 14px;
        }
        .madden-mobile-hero__carousel .madden-player-carousel ::ng-deep .carousel-track {
          height: 100%;
        }
        .madden-mobile-hero__carousel .madden-player-carousel ::ng-deep .carousel-slide {
          height: 100%;
        }
        .madden-mobile-hero__carousel .madden-player-carousel ::ng-deep .carousel-img {
          height: 100%;
          object-fit: cover;
          object-position: center top;
        }
        .madden-mobile-hero__identity {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
          padding-top: 2px;
        }
        .madden-mobile-hero__name {
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          line-height: 1.12;
          letter-spacing: -0.01em;
          color: var(--m-text);
        }
        .madden-mobile-hero__meta {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.35;
          color: var(--m-text-2);
        }
        .madden-mobile-hero__follow-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 6px;
          align-self: flex-start;
          border: 1.5px solid var(--nxt1-color-primary);
          background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
          color: var(--nxt1-color-primary);
          border-radius: var(--nxt1-radius-md, 8px);
          font-family: var(--nxt1-fontFamily-brand);
          font-size: 13px;
          font-weight: var(--nxt1-fontWeight-semibold);
          letter-spacing: 0.01em;
          line-height: 1;
          padding: 7px 16px;
          cursor: pointer;
        }
        .madden-mobile-hero__follow-btn:active {
          transform: scale(0.97);
        }
        .madden-mobile-hero__stats {
          display: flex;
          flex-direction: column;
          margin-top: 8px;
        }
        .mobile-hero-stat {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
          border-bottom: 1px solid var(--m-border);
        }
        .mobile-hero-stat:last-child {
          border-bottom: none;
        }
        .mobile-hero-stat__key {
          font-size: 13px;
          color: var(--m-text-3);
          min-width: 50px;
          font-weight: 500;
        }
        .mobile-hero-stat__val {
          font-size: 14px;
          font-weight: 700;
          color: var(--m-text);
        }
        .mobile-hero-stat__val-wrap {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
      }
    `,
  ],
})
export class ProfileMobileHeroComponent {
  protected readonly profile = inject(ProfileService);

  /** Whether viewing own profile */
  readonly isOwnProfile = input(false);

  /** Emitted when Follow button is tapped */
  readonly followClick = output<void>();

  // ── Display computeds ──

  protected readonly desktopTitle = computed(() => {
    const u = this.profile.user();
    if (u?.displayName) return u.displayName;
    const first = u?.firstName ?? '';
    const last = u?.lastName ?? '';
    return (first + ' ' + last).trim() || 'Profile';
  });

  protected readonly mobileDisplayName = computed(() => {
    const u = this.profile.user();
    if (u?.displayName?.trim()) return u.displayName.trim();
    const combined = `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
    return combined || 'Profile';
  });

  protected readonly mobileSubtitleLine = computed(() => {
    // Use activeSport() instead of primarySport for sport-switching support
    const activeSport = this.profile.activeSport();
    const position = activeSport?.position?.trim();
    const jersey = activeSport?.jerseyNumber?.trim();
    if (position && jersey) return `${position} #${jersey}`;
    if (position) return position;
    if (jersey) return `#${jersey}`;
    return '';
  });

  protected readonly isFemaleProfile = computed(() => isFemaleGender(this.profile.user()?.gender));

  protected readonly formattedWeight = computed(() =>
    normalizeWeightDisplay(this.profile.user()?.weight)
  );

  protected readonly showWeight = computed(
    () => this.formattedWeight().length > 0 && !this.isFemaleProfile()
  );

  // ── Carousel overlay signals ──

  protected readonly carouselOverlaySubtitle = computed(() => {
    const u = this.profile.user();
    if (!u) return '';
    // Use activeSport() instead of primarySport for sport-switching support
    const activeSport = this.profile.activeSport();
    const parts: string[] = [];
    if (activeSport?.position) parts.push(activeSport.position);
    if (activeSport?.name) parts.push(activeSport.name);
    if (u.school?.name) parts.push(u.school.name);
    if (u.classYear) parts.push(`'${u.classYear.slice(-2)}`);
    return parts.join(' · ');
  });

  protected readonly carouselOverlayTitles = computed<readonly string[]>(() => {
    const images = this.profile.profileImgs();
    const base = this.desktopTitle();
    const titles: string[] = [];
    for (let index = 0; index < images.length; index += 1) {
      titles.push(index === 0 ? base : `${base} · Gallery ${index}`);
    }
    return titles;
  });

  protected readonly carouselOverlaySubtitles = computed<readonly string[]>(() => {
    const images = this.profile.profileImgs();
    const baseSubtitle = this.carouselOverlaySubtitle();
    const total = images.length;
    return images.map((_, index) => {
      const position = `Photo ${index + 1} of ${total}`;
      return baseSubtitle ? `${baseSubtitle} · ${position}` : position;
    });
  });

  // ── Measurables verification ──

  protected readonly measurablesVerification = computed(() =>
    getVerification(this.profile.user(), 'measurables')
  );

  protected readonly measurablesVerifiedByLabel = computed(
    () => this.measurablesVerification()?.verifiedBy ?? 'provider'
  );

  protected readonly measurablesProviderUrl = computed(() => {
    const v = this.measurablesVerification();
    if (!v) return null;
    const explicitUrl = v.sourceUrl?.trim();
    if (explicitUrl) return this.ensureAbsoluteUrl(explicitUrl);
    const provider = v.verifiedBy?.trim().toLowerCase() ?? '';
    if (!provider) return null;
    if (provider.includes('rivals')) return 'https://www.rivals.com';
    if (provider.includes('hudl')) return 'https://www.hudl.com';
    if (provider.includes('maxpreps')) return 'https://www.maxpreps.com';
    if (provider.includes('247') || provider.includes('247sports')) return 'https://247sports.com';
    if (provider.includes('on3')) return 'https://www.on3.com';
    return null;
  });

  protected readonly measurablesProviderLogoSrc = computed(() => {
    const v = this.measurablesVerification();
    if (v?.sourceLogoUrl) return v.sourceLogoUrl;
    const host = this.providerHost(this.measurablesProviderUrl());
    return `https://logo.clearbit.com/${host}`;
  });

  protected readonly measurablesProviderLogoFallbackSrc = computed(() => {
    const v = this.measurablesVerification();
    if (v?.sourceLogoUrl) return v.sourceLogoUrl;
    const host = this.providerHost(this.measurablesProviderUrl());
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  });

  // ── Helpers ──

  private ensureAbsoluteUrl(rawUrl: string): string {
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
    return `https://${rawUrl}`;
  }

  private providerHost(url: string | null): string {
    if (!url) return 'example.com';
    try {
      return new URL(url).hostname || 'example.com';
    } catch {
      return 'example.com';
    }
  }
}
