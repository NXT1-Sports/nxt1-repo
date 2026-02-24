/**
 * @fileoverview Profile Shell Component - Web (Tailwind SSR)
 * @module @nxt1/ui/profile/web
 * @version 1.0.0
 *
 * Web-optimized Profile Shell using pure Tailwind CSS.
 * 100% SSR-safe with semantic HTML for Grade A+ SEO.
 *
 * ⭐ WEB ONLY - Pure Tailwind, Zero Ionic, SSR-optimized ⭐
 *
 * SEO Features:
 * - Semantic HTML structure (<main>, <section>, <article>)
 * - Proper heading hierarchy (h1 → h2 → h3)
 * - Structured data support ready
 * - Fast LCP with SSR
 *
 * Design Token Integration:
 * - Uses @nxt1/design-tokens CSS custom properties
 * - Tailwind classes map to design tokens via preset
 * - Dark/light mode via [data-theme] attribute
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  type ProfileTabId,
  type ProfileTab,
  PROFILE_TABS,
  PROFILE_EMPTY_STATES,
  type ProfileOffer,
  type ProfileEvent,
  type AthleticStat,
  type ProfileTeamAffiliation,
  type ProfileTeamType,
  type NewsArticle,
} from '@nxt1/core';
import { NxtPageHeaderComponent } from '../../components/page-header';
import { ProfileDesktopHeaderComponent } from './profile-desktop-header.component';
import { NxtIconComponent } from '../../components/icon';
import { NxtRefresherComponent, type RefreshEvent } from '../../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../../components/option-scroller';
import {
  NxtSectionNavWebComponent,
  type SectionNavItem,
  type SectionNavChangeEvent,
} from '../../components/section-nav-web';
import { NxtImageCarouselComponent } from '../../components/image-carousel';
import { NxtToastService } from '../../services/toast/toast.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ProfileService } from '../profile.service';
import { ICONS, type IconName } from '@nxt1/design-tokens/assets/icons';

import { ProfileTimelineComponent } from '../profile-timeline.component';
import { ProfileOffersComponent } from '../profile-offers.component';
import { ProfileRankingsComponent } from '../rankings/profile-rankings.component';
import { ProfileEventsComponent } from '../profile-events.component';
import { ProfileSkeletonComponent } from '../profile-skeleton.component';
import { ProfileNewsWebComponent } from './profile-news-web.component';
import type { ProfileShellUser } from '../profile-shell.component';

const ARCHETYPE_TOKEN_ICONS: Readonly<Record<string, IconName>> = {
  'arm strength': 'barbell',
  accuracy: 'star',
  athleticism: 'bolt',
  'football iq': 'hardwareChip',
};

const TEAM_TYPE_LABELS: Readonly<Record<ProfileTeamType, string>> = {
  'high-school': 'High School',
  club: 'Club',
  juco: 'JUCO',
  college: 'College',
  academy: 'Academy',
  travel: 'Travel',
  'middle-school': 'Middle School',
  other: 'Team',
};

const TEAM_TYPE_ICONS: Readonly<Record<ProfileTeamType, IconName>> = {
  'high-school': 'school',
  club: 'people',
  juco: 'shield',
  college: 'shield',
  academy: 'school',
  travel: 'shield',
  'middle-school': 'school',
  other: 'shield',
};

interface StatsComparisonItem {
  readonly label: string;
  readonly playerDisplay: string;
  readonly averageDisplay: string;
  readonly playerPercent: number;
  readonly averagePercent: number;
}

@Component({
  selector: 'nxt1-profile-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    NxtPageHeaderComponent,
    ProfileDesktopHeaderComponent,
    NxtIconComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    NxtSectionNavWebComponent,
    NxtImageCarouselComponent,
    ProfileTimelineComponent,
    ProfileOffersComponent,
    ProfileRankingsComponent,
    ProfileEventsComponent,
    ProfileSkeletonComponent,
    ProfileNewsWebComponent,
  ],
  template: `
    <main class="profile-main">
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <!-- Loading State -->
      @if (profile.isLoading()) {
        <nxt1-profile-skeleton variant="web" />
      }

      <!-- Error State -->
      @else if (profile.error()) {
        <section class="madden-error">
          <div class="madden-error-icon" aria-hidden="true">⚠️</div>
          <h2 class="madden-error-title">Failed to load profile</h2>
          <p class="madden-error-msg">{{ profile.error() }}</p>
          <button type="button" class="madden-error-btn" (click)="onRetry()">Try Again</button>
        </section>
      }

      <!-- ═══ MADDEN FRANCHISE MODE — SPLIT LAYOUT ═══ -->
      @else if (profile.user()) {
        <div class="madden-stage">
          <!-- Faded halftone accent background (inspired by recruiting card aesthetic) -->
          <div class="stage-halftone-bg" aria-hidden="true">
            <div class="stage-halftone-dots"></div>
            <div class="stage-halftone-fade"></div>
          </div>

          <!-- ═══ SPLIT: LEFT CONTENT | RIGHT PLAYER IMAGE ═══ -->
          <div class="madden-split">
            <!-- LEFT SIDE: Header + Tabs + Content -->
            <div class="madden-split-left">
              <!-- Page header: mobile only -->
              @if (!hideHeader()) {
                <div class="md:hidden">
                  <nxt1-page-header [showBack]="true" (backClick)="backClick.emit()">
                    <div pageHeaderSlot="end" class="profile-header-actions">
                      @if (profile.isOwnProfile()) {
                        <button
                          type="button"
                          class="profile-header-action-btn"
                          aria-label="Edit profile"
                          (click)="editProfileClick.emit()"
                        >
                          <nxt1-icon name="pencil" [size]="22" />
                        </button>
                      }
                      <button
                        type="button"
                        class="profile-header-action-btn"
                        aria-label="Menu"
                        (click)="onMenuClick()"
                      >
                        <nxt1-icon name="menu" [size]="22" />
                      </button>
                    </div>
                  </nxt1-page-header>
                </div>
              }

              <!-- Desktop page header: Madden-style -->
              @if (hideHeader()) {
                <nxt1-profile-desktop-header
                  [user]="profile.user()"
                  [playerCard]="null"
                  (back)="backClick.emit()"
                />
              }

              <!-- TOP TAB BAR -->
              <nav class="madden-top-tabs" aria-label="Profile sections">
                <nxt1-option-scroller
                  [options]="tabOptions()"
                  [selectedId]="profile.activeTab()"
                  [config]="{ scrollable: true, stretchToFill: false, showDivider: false }"
                  (selectionChange)="onTabChange($event)"
                />
              </nav>

              <!-- Content Area: Side tabs + scrollable content -->
              <div class="madden-content-layer">
                <!-- LEFT SIDE NAV COLUMN -->
                <div class="madden-side-nav-column">
                  <!-- LEFT SIDE TABS -->
                  <nxt1-section-nav-web
                    [items]="sideTabItems()"
                    [activeId]="activeSideTab()"
                    ariaLabel="Section navigation"
                    (selectionChange)="onSectionNavChange($event)"
                  />

                  <!-- ═══ SPORT PROFILE SWITCHER ═══ -->
                  @if (profile.hasMultipleSports()) {
                    <div class="sport-switcher" role="group" aria-label="Sport profiles">
                      <span class="sport-switcher__title">Sport Profiles</span>
                      <div class="sport-switcher__list">
                        @for (sport of profile.allSports(); track sport.name; let i = $index) {
                          <button
                            type="button"
                            class="sport-switcher__item"
                            [class.sport-switcher__item--active]="profile.activeSportIndex() === i"
                            [attr.aria-selected]="profile.activeSportIndex() === i"
                            [attr.aria-label]="'Switch to ' + sport.name + ' profile'"
                            role="tab"
                            (click)="onSportSwitch(i)"
                          >
                            @if (profile.user()?.profileImg) {
                              <img
                                class="sport-switcher__avatar"
                                [src]="profile.user()?.profileImg"
                                [alt]="sport.name"
                                loading="lazy"
                              />
                            } @else {
                              <span class="sport-switcher__avatar-fallback" aria-hidden="true">
                                {{ sport.name.charAt(0) }}
                              </span>
                            }
                            <span class="sport-switcher__sport-name">{{ sport.name }}</span>
                            @if (profile.activeSportIndex() === i) {
                              <span class="sport-switcher__active-badge" aria-hidden="true"></span>
                            }
                          </button>
                        }
                      </div>
                    </div>
                  }
                </div>

                <!-- MAIN CONTENT AREA -->
                <section class="madden-content-scroll" aria-live="polite">
                  <!-- ═══ SHARED VERIFICATION BANNER (per-tab provider) ═══ -->
                  @if (showVerificationBanner()) {
                    <div class="profile-verification-banner" role="status">
                      @if (isProfileVerified()) {
                        @if (verificationProviderUrl(); as providerUrl) {
                          <a
                            class="verification-banner__badge verification-banner__badge--link"
                            [href]="providerUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            [attr.aria-label]="
                              'Verified by ' +
                              (verificationProvider() || 'verification provider') +
                              ' — open source'
                            "
                          >
                            <span class="verification-banner__check" aria-hidden="true">✓</span>
                            <span class="verification-banner__label">Verified by</span>
                            @if (verificationProviderLogoSrc(); as logoSrc) {
                              <span class="verification-banner__logo">
                                <img
                                  class="verification-banner__logo-img"
                                  [src]="logoSrc"
                                  [alt]="(verificationProvider() || 'provider') + ' logo'"
                                  loading="lazy"
                                  decoding="async"
                                  (error)="onVerificationBannerLogoError($event)"
                                />
                              </span>
                            } @else {
                              <span class="verification-banner__provider-text">{{
                                verificationProvider()
                              }}</span>
                            }
                          </a>
                        } @else {
                          <span
                            class="verification-banner__badge"
                            [attr.aria-label]="
                              'Verified by ' + (verificationProvider() || 'verification provider')
                            "
                          >
                            <span class="verification-banner__check" aria-hidden="true">✓</span>
                            <span class="verification-banner__label">Verified by</span>
                            @if (verificationProviderLogoSrc(); as logoSrc) {
                              <span class="verification-banner__logo">
                                <img
                                  class="verification-banner__logo-img"
                                  [src]="logoSrc"
                                  [alt]="(verificationProvider() || 'provider') + ' logo'"
                                  loading="lazy"
                                  decoding="async"
                                  (error)="onVerificationBannerLogoError($event)"
                                />
                              </span>
                            } @else {
                              <span class="verification-banner__provider-text">{{
                                verificationProvider()
                              }}</span>
                            }
                          </span>
                        }
                      } @else {
                        <span
                          class="verification-banner__badge verification-banner__badge--unverified"
                        >
                          <nxt1-icon name="alertCircle" [size]="14" />
                          <span class="verification-banner__label">Not Verified</span>
                        </span>
                      }
                    </div>
                  }

                  @switch (profile.activeTab()) {
                    @case ('overview') {
                      <section
                        class="madden-tab-section madden-overview"
                        aria-labelledby="overview-heading"
                      >
                        <h2 id="overview-heading" class="sr-only">Player Overview</h2>

                        @if (activeSideTab() === 'player-profile') {
                          <div class="ov-top-row">
                            <!-- ═══ PLAYER PROFILE — Key/Value Pairs (like Madden) ═══ -->
                            <div class="ov-section ov-section--profile">
                              <h3 class="ov-section-title ov-overview-title">Player Profile</h3>
                              <div class="ov-profile-grid">
                                @if (profile.user()?.classYear) {
                                  <div class="ov-profile-row">
                                    <span class="ov-profile-key">Class:</span>
                                    <span class="ov-profile-val">{{
                                      profile.user()?.classYear
                                    }}</span>
                                  </div>
                                }
                                @if (profile.user()?.height) {
                                  <div class="ov-profile-row">
                                    <span class="ov-profile-key">Height:</span>
                                    <span class="ov-profile-val-wrap">
                                      <span class="ov-profile-val">{{
                                        profile.user()?.height
                                      }}</span>
                                      @if (profile.user()?.measurablesVerifiedBy) {
                                        @if (measurablesProviderUrl()) {
                                          <a
                                            class="ov-verified-badge ov-verified-link"
                                            [href]="measurablesProviderUrl()!"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            [attr.aria-label]="
                                              'Open measurable source: ' +
                                              (profile.user()?.measurablesVerifiedBy ||
                                                'verification provider')
                                            "
                                          >
                                            <span class="ov-verified-label">Verified by</span>
                                            <span class="ov-verified-logo">
                                              <img
                                                class="ov-verified-logo-img"
                                                [src]="measurablesProviderLogoSrc()"
                                                [alt]="
                                                  (profile.user()?.measurablesVerifiedBy ||
                                                    'verification provider') + ' logo'
                                                "
                                                loading="lazy"
                                                decoding="async"
                                                (error)="onProviderLogoError($event)"
                                              />
                                            </span>
                                          </a>
                                        } @else {
                                          <span class="ov-verified-badge">
                                            <span class="ov-verified-label">Verified by</span>
                                            <span class="ov-verified-logo">
                                              <img
                                                class="ov-verified-logo-img"
                                                [src]="measurablesProviderLogoFallbackSrc()"
                                                [alt]="
                                                  (profile.user()?.measurablesVerifiedBy ||
                                                    'verification provider') + ' logo'
                                                "
                                                loading="lazy"
                                                decoding="async"
                                                (error)="onProviderLogoError($event)"
                                              />
                                            </span>
                                          </span>
                                        }
                                      }
                                    </span>
                                  </div>
                                }
                                @if (profile.user()?.weight) {
                                  <div class="ov-profile-row">
                                    <span class="ov-profile-key">Weight:</span>
                                    <span class="ov-profile-val-wrap">
                                      <span class="ov-profile-val"
                                        >{{ profile.user()?.weight }} lb</span
                                      >
                                      @if (profile.user()?.measurablesVerifiedBy) {
                                        @if (measurablesProviderUrl()) {
                                          <a
                                            class="ov-verified-badge ov-verified-link"
                                            [href]="measurablesProviderUrl()!"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            [attr.aria-label]="
                                              'Open measurable source: ' +
                                              (profile.user()?.measurablesVerifiedBy ||
                                                'verification provider')
                                            "
                                          >
                                            <span class="ov-verified-label">Verified by</span>
                                            <span class="ov-verified-logo">
                                              <img
                                                class="ov-verified-logo-img"
                                                [src]="measurablesProviderLogoSrc()"
                                                [alt]="
                                                  (profile.user()?.measurablesVerifiedBy ||
                                                    'verification provider') + ' logo'
                                                "
                                                loading="lazy"
                                                decoding="async"
                                                (error)="onProviderLogoError($event)"
                                              />
                                            </span>
                                          </a>
                                        } @else {
                                          <span class="ov-verified-badge">
                                            <span class="ov-verified-label">Verified by</span>
                                            <span class="ov-verified-logo">
                                              <img
                                                class="ov-verified-logo-img"
                                                [src]="measurablesProviderLogoFallbackSrc()"
                                                [alt]="
                                                  (profile.user()?.measurablesVerifiedBy ||
                                                    'verification provider') + ' logo'
                                                "
                                                loading="lazy"
                                                decoding="async"
                                                (error)="onProviderLogoError($event)"
                                              />
                                            </span>
                                          </span>
                                        }
                                      }
                                    </span>
                                  </div>
                                }
                                @if (profile.user()?.location) {
                                  <div class="ov-profile-row">
                                    <span class="ov-profile-key">Location:</span>
                                    <span class="ov-profile-val">{{
                                      profile.user()?.location
                                    }}</span>
                                  </div>
                                }
                              </div>
                            </div>

                            <!-- ═══ AGENT X TRAIT (inline, no large container) ═══ -->
                            @if (profile.playerCard()?.trait) {
                              <div class="ov-trait-inline">
                                <span class="ov-trait-category">
                                  {{ traitCategoryLabel() }}
                                </span>
                                <div class="ov-trait-icon-lg" aria-hidden="true">
                                  <svg
                                    viewBox="0 0 100 100"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path
                                      d="M50 6L84 28V72L50 94L16 72V28L50 6Z"
                                      class="ov-trait-icon-shell"
                                    />
                                    <path
                                      d="M50 16L74 32V68L50 84L26 68V32L50 16Z"
                                      class="ov-trait-icon-core"
                                    />
                                  </svg>
                                  <div class="ov-trait-icon-inner">
                                    @if (profile.playerCard()?.trait?.category === 'hidden') {
                                      <nxt1-icon name="flame" [size]="36" />
                                    } @else {
                                      <nxt1-icon name="flash" [size]="36" />
                                    }
                                  </div>
                                </div>
                                @if (profile.playerCard()?.agentXSummary) {
                                  <p class="ov-trait-summary">
                                    {{ profile.playerCard()?.agentXSummary }}
                                  </p>
                                }
                              </div>
                            }
                          </div>

                          <!-- ═══ PLAYER ARCHETYPES (badge-style labels) ═══ -->
                          @if (profile.playerCard()?.archetypes?.length) {
                            <div class="ov-section">
                              <h3 class="ov-section-title">Player Archetypes</h3>
                              <div class="ov-archetype-badges">
                                @for (
                                  arch of profile.playerCard()?.archetypes ?? [];
                                  track arch.name
                                ) {
                                  <div class="ov-archetype-badge">
                                    <nxt1-icon
                                      [name]="archetypeIconName(arch.name, arch.icon)"
                                      [size]="18"
                                    />
                                    <span class="ov-archetype-badge-name">{{ arch.name }}</span>
                                  </div>
                                }
                              </div>
                            </div>
                          }

                          <!-- ═══ CONNECTED ACCOUNTS ═══ -->
                          @if (connectedAccountsList().length > 0) {
                            <div class="ov-section">
                              <h3 class="ov-section-title">Connected Accounts</h3>
                              <div class="ov-connected-grid">
                                @for (acct of connectedAccountsList(); track acct.key) {
                                  <a
                                    class="ov-connected-chip"
                                    [href]="acct.url"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    [attr.aria-label]="acct.label"
                                  >
                                    <span class="ov-connected-icon" [style.color]="acct.color">
                                      <nxt1-icon [name]="acct.icon" [size]="14" />
                                    </span>
                                    <span class="ov-connected-label">{{ acct.label }}</span>
                                    <span class="ov-connected-check">
                                      <nxt1-icon name="checkmark-circle" [size]="13" />
                                    </span>
                                  </a>
                                }
                              </div>
                              <p class="ov-connected-explainer">
                                <svg
                                  class="ov-connected-agentx"
                                  viewBox="0 0 612 792"
                                  fill="currentColor"
                                  stroke="currentColor"
                                  stroke-width="12"
                                  stroke-linejoin="round"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                                  />
                                  <polygon
                                    points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
                                  />
                                </svg>
                                Agent X is your personal recruiting manager — connecting all your
                                accounts in one place so coaches see a complete, always up-to-date
                                profile without the extra work.
                              </p>
                            </div>
                          }

                          <div class="ov-section ov-section--profile">
                            <button
                              type="button"
                              class="ov-last-synced-btn"
                              (click)="onSyncNow()"
                              aria-label="Sync profile with Agent X"
                            >
                              <div class="ov-last-synced-main">
                                <span class="ov-last-synced-label">Last synced</span>
                                <span class="ov-last-synced-time">{{ lastSyncedLabel() }}</span>
                              </div>
                              <div class="ov-last-synced-agent">
                                <svg
                                  class="ov-last-synced-agentx"
                                  viewBox="0 0 612 792"
                                  fill="currentColor"
                                  stroke="currentColor"
                                  stroke-width="12"
                                  stroke-linejoin="round"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                                  />
                                  <polygon
                                    points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
                                  />
                                </svg>
                                <span class="ov-last-synced-agent-name">Agent X</span>
                              </div>
                            </button>
                          </div>
                        }

                        @if (activeSideTab() === 'player-bio') {
                          <div class="ov-top-row ov-top-row--single">
                            <div class="ov-section ov-section--profile">
                              <h3 class="ov-section-title ov-overview-title">Player Bio</h3>
                              <div class="ov-bio-card">
                                <nxt1-icon name="person" [size]="18" />
                                <p>
                                  {{
                                    profile.user()?.aboutMe ||
                                      'No bio added yet. Add a short player bio to help coaches understand your story and goals.'
                                  }}
                                </p>
                              </div>
                            </div>
                          </div>
                        }

                        @if (activeSideTab() === 'player-history') {
                          <div class="ov-top-row ov-top-row--single">
                            <div class="ov-section ov-section--profile">
                              <h3 class="ov-section-title ov-overview-title">Player History</h3>
                              @if (playerHistoryAffiliations().length === 0) {
                                <div class="madden-empty">
                                  <nxt1-icon name="time" [size]="48" />
                                  <h3>No history yet</h3>
                                  <p>Team history and year-by-year progression will appear here.</p>
                                </div>
                              } @else {
                                <div class="ov-history-list">
                                  @for (
                                    team of playerHistoryAffiliations();
                                    track team.name + '-' + (team.type || 'other') + '-' + $index
                                  ) {
                                    <article class="ov-history-item">
                                      <span class="ov-history-year">{{
                                        historySeasonLabel($index)
                                      }}</span>
                                      <div class="ov-history-main madden-team-block">
                                        <div class="madden-team-logo-wrap ov-history-logo-wrap">
                                          @if (team.logoUrl) {
                                            <img
                                              class="madden-team-logo"
                                              [src]="team.logoUrl"
                                              [alt]="team.name"
                                              loading="lazy"
                                            />
                                          } @else {
                                            <span
                                              class="madden-team-logo-placeholder ov-history-logo-fallback"
                                            >
                                              <nxt1-icon
                                                [name]="teamIconName(team.type)"
                                                [size]="16"
                                              />
                                            </span>
                                          }
                                        </div>
                                        <div class="madden-team-info ov-history-content">
                                          <div class="madden-team-headline">
                                            <span class="madden-team-name ov-history-team">{{
                                              team.name
                                            }}</span>
                                          </div>
                                          @if (team.location) {
                                            <span class="madden-team-location ov-history-meta">{{
                                              team.location
                                            }}</span>
                                          }
                                        </div>
                                        <span class="ov-history-record">{{
                                          historyTeamRecord(team) ?? 'N/A'
                                        }}</span>
                                      </div>
                                    </article>
                                  }
                                </div>
                              }
                            </div>
                          </div>
                        }

                        @if (activeSideTab() === 'academic') {
                          <div class="ov-top-row">
                            <div class="ov-section ov-section--profile">
                              <h3 class="ov-section-title ov-overview-title">Academic</h3>
                              @if (
                                !profile.user()?.gpa &&
                                !profile.user()?.sat &&
                                !profile.user()?.act &&
                                !profile.user()?.school?.name
                              ) {
                                <div class="madden-empty">
                                  <nxt1-icon name="school" [size]="48" />
                                  <h3>No academic info yet</h3>
                                  <p>
                                    Add GPA, test scores, and school details to strengthen your
                                    profile.
                                  </p>
                                  @if (profile.isOwnProfile()) {
                                    <button
                                      type="button"
                                      class="madden-cta-btn"
                                      (click)="onEditProfile()"
                                    >
                                      Add Academic Info
                                    </button>
                                  }
                                </div>
                              } @else {
                                <div class="madden-stat-group">
                                  <div class="madden-stat-grid">
                                    @if (profile.user()?.gpa) {
                                      <div class="madden-stat-card">
                                        <span class="madden-stat-value">{{
                                          profile.user()?.gpa
                                        }}</span>
                                        <span class="madden-stat-label">GPA</span>
                                      </div>
                                    }
                                    @if (profile.user()?.sat) {
                                      <div class="madden-stat-card">
                                        <span class="madden-stat-value">{{
                                          profile.user()?.sat
                                        }}</span>
                                        <span class="madden-stat-label">SAT</span>
                                      </div>
                                    }
                                    @if (profile.user()?.act) {
                                      <div class="madden-stat-card">
                                        <span class="madden-stat-value">{{
                                          profile.user()?.act
                                        }}</span>
                                        <span class="madden-stat-label">ACT</span>
                                      </div>
                                    }
                                  </div>
                                </div>
                              }
                            </div>
                          </div>
                        }

                        @if (activeSideTab() === 'contact') {
                          <div class="ov-top-row">
                            <div class="ov-section ov-section--profile">
                              <h3 class="ov-section-title ov-overview-title">Contact</h3>
                              @if (
                                !profile.user()?.contact?.email &&
                                !profile.user()?.contact?.phone &&
                                connectedAccountsList().length === 0
                              ) {
                                <div class="madden-empty">
                                  <nxt1-icon name="mail" [size]="48" />
                                  <h3>Contact info not set</h3>
                                  <p>Add your contact information so coaches can reach you.</p>
                                  @if (profile.isOwnProfile()) {
                                    <button
                                      type="button"
                                      class="madden-cta-btn"
                                      (click)="onEditContact()"
                                    >
                                      Add Contact Info
                                    </button>
                                  }
                                </div>
                              } @else {
                                @if (
                                  profile.user()?.contact?.email || profile.user()?.contact?.phone
                                ) {
                                  <div class="madden-contact-list">
                                    @if (profile.user()?.contact?.email) {
                                      <a
                                        class="madden-contact-item"
                                        [href]="'mailto:' + profile.user()?.contact?.email"
                                      >
                                        <nxt1-icon name="mail" [size]="20" />
                                        <span>{{ profile.user()?.contact?.email }}</span>
                                      </a>
                                    }
                                    @if (profile.user()?.contact?.phone) {
                                      <a
                                        class="madden-contact-item"
                                        [href]="'tel:' + profile.user()?.contact?.phone"
                                      >
                                        <nxt1-icon name="call" [size]="20" />
                                        <span>{{ profile.user()?.contact?.phone }}</span>
                                      </a>
                                    }
                                  </div>
                                }

                                @if (connectedAccountsList().length > 0) {
                                  <h3 class="madden-section-label" style="margin-top: 20px;">
                                    Social Media
                                  </h3>
                                  <div class="madden-contact-list">
                                    @for (acct of connectedAccountsList(); track acct.key) {
                                      <a
                                        class="madden-contact-item"
                                        [href]="acct.url"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <nxt1-icon [name]="acct.icon" [size]="20" />
                                        <span>{{ acct.handle || acct.label }}</span>
                                      </a>
                                    }
                                  </div>
                                }
                              }
                            </div>
                          </div>
                        }
                      </section>
                    }

                    @case ('timeline') {
                      <nxt1-profile-timeline
                        [posts]="profile.filteredPosts()"
                        [isLoading]="false"
                        [isLoadingMore]="profile.isLoadingMore()"
                        [isEmpty]="profile.isEmpty()"
                        [hasMore]="profile.hasMore()"
                        [isOwnProfile]="profile.isOwnProfile()"
                        [showMenu]="profile.isOwnProfile()"
                        [emptyIcon]="emptyState().icon"
                        [emptyTitle]="emptyState().title"
                        [emptyMessage]="emptyState().message"
                        [emptyCta]="profile.isOwnProfile() ? (emptyState().ctaLabel ?? null) : null"
                        (postClick)="onPostClick($event)"
                        (likeClick)="onLikePost($event)"
                        (commentClick)="onCommentPost($event)"
                        (shareClick)="onSharePost($event)"
                        (menuClick)="onPostMenu($event)"
                        (loadMore)="onLoadMore()"
                        (emptyCtaClick)="onCreatePost()"
                      />
                    }

                    @case ('news') {
                      <nxt1-profile-news-web
                        (articleClick)="onNewsArticleClick($event)"
                        (bookmarkToggle)="onNewsBookmarkToggle($event)"
                      />
                    }

                    @case ('videos') {
                      <nxt1-profile-timeline
                        [posts]="profile.videoPosts()"
                        [isLoading]="false"
                        [isEmpty]="profile.videoPosts().length === 0"
                        [isOwnProfile]="profile.isOwnProfile()"
                        emptyIcon="videocam"
                        emptyTitle="No videos yet"
                        emptyMessage="Upload highlights and game footage to showcase your skills."
                        [emptyCta]="profile.isOwnProfile() ? 'Upload Video' : null"
                        (postClick)="onPostClick($event)"
                        (likeClick)="onLikePost($event)"
                        (shareClick)="onSharePost($event)"
                        (emptyCtaClick)="onUploadVideo()"
                      />
                    }

                    @case ('offers') {
                      @if (activeSideTab() === 'rankings') {
                        <nxt1-profile-rankings />
                      } @else {
                        <nxt1-profile-offers
                          [offers]="profile.offers()"
                          [committedOffers]="profile.committedOffers()"
                          [activeOffers]="profile.activeOffers()"
                          [interestOffers]="profile.interestOffers()"
                          [isEmpty]="!profile.hasRecruitingActivity()"
                          [isOwnProfile]="profile.isOwnProfile()"
                          [activeSection]="activeSideTab()"
                          (offerClick)="onOfferClick($event)"
                          (addOfferClick)="onAddOffer()"
                          (addCommitmentClick)="onAddOffer()"
                        />
                      }
                    }

                    @case ('stats') {
                      <section
                        class="madden-tab-section stats-board"
                        aria-labelledby="stats-heading"
                      >
                        <h2 id="stats-heading" class="sr-only">Athletic Statistics</h2>

                        @if (profile.athleticStats().length === 0) {
                          <div class="madden-empty">
                            <nxt1-icon name="stats-chart" [size]="48" />
                            <h3>No stats recorded</h3>
                            <p>Add your athletic and academic stats to complete your profile.</p>
                            @if (profile.isOwnProfile()) {
                              <button type="button" class="madden-cta-btn" (click)="onAddStats()">
                                Add Stats
                              </button>
                            }
                          </div>
                        } @else {
                          <!-- Category pill tabs -->
                          <nav class="stats-board__tabs" aria-label="Stat categories">
                            @for (
                              category of profile.athleticStats();
                              track category.name;
                              let i = $index
                            ) {
                              <button
                                type="button"
                                class="stats-board__tab"
                                [class.stats-board__tab--active]="activeStatCategoryIdx() === i"
                                (click)="onStatCategoryChange(i)"
                              >
                                {{ category.name }}
                              </button>
                            }
                          </nav>

                          <!-- Stats table for active category -->
                          @if (activeStatCategory(); as cat) {
                            <div class="stats-board__table-wrap">
                              <table class="stats-board__table" role="grid">
                                <thead>
                                  <tr>
                                    @for (stat of cat.stats; track stat.label) {
                                      <th scope="col">
                                        <span class="stats-board__th-label">{{ stat.label }}</span>
                                      </th>
                                    }
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    @for (stat of cat.stats; track stat.label) {
                                      <td>
                                        <span class="stats-board__cell-value"
                                          >{{ stat.value }}{{ stat.unit ?? '' }}</span
                                        >
                                      </td>
                                    }
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            @if (statsComparisonItems().length > 0) {
                              <section
                                class="stats-compare"
                                aria-labelledby="stats-compare-heading"
                              >
                                <header class="stats-compare__header">
                                  <h3 id="stats-compare-heading" class="stats-compare__title">
                                    Top Stats
                                  </h3>
                                  <div
                                    class="stats-compare__legend"
                                    role="list"
                                    aria-label="Comparison legend"
                                  >
                                    <span class="stats-compare__legend-item" role="listitem">
                                      <span
                                        class="stats-compare__dot stats-compare__dot--player"
                                        aria-hidden="true"
                                      ></span>
                                      <span>{{ profile.user()?.firstName || 'Athlete' }}</span>
                                    </span>
                                    <span class="stats-compare__legend-item" role="listitem">
                                      <span
                                        class="stats-compare__dot stats-compare__dot--average"
                                        aria-hidden="true"
                                      ></span>
                                      <span>National Average</span>
                                    </span>
                                  </div>
                                </header>

                                <div
                                  class="stats-compare__grid"
                                  role="list"
                                  aria-label="Top stats comparison"
                                >
                                  @for (item of statsComparisonItems(); track item.label) {
                                    <article class="stats-compare__item" role="listitem">
                                      <div class="stats-compare__values">
                                        <span
                                          class="stats-compare__value stats-compare__value--player"
                                          >{{ item.playerDisplay }}</span
                                        >
                                        <span
                                          class="stats-compare__value stats-compare__value--average"
                                          >{{ item.averageDisplay }}</span
                                        >
                                      </div>

                                      <div class="stats-compare__bar-zone" aria-hidden="true">
                                        <div
                                          class="stats-compare__bar stats-compare__bar--player"
                                          [style.height.%]="item.playerPercent"
                                        ></div>
                                        <div
                                          class="stats-compare__bar stats-compare__bar--average"
                                          [style.height.%]="item.averagePercent"
                                        ></div>
                                      </div>

                                      <span class="stats-compare__label">{{ item.label }}</span>
                                    </article>
                                  }
                                </div>
                              </section>
                            }
                          }
                        }
                      </section>
                    }

                    @case ('academic') {
                      <section class="madden-tab-section" aria-labelledby="academic-heading">
                        <h2 id="academic-heading" class="sr-only">Academic Profile</h2>
                        @if (
                          !profile.user()?.gpa &&
                          !profile.user()?.sat &&
                          !profile.user()?.act &&
                          !profile.user()?.school?.name
                        ) {
                          <div class="madden-empty">
                            <nxt1-icon name="school" [size]="48" />
                            <h3>No academic info yet</h3>
                            <p>
                              Add GPA, test scores, and school details to strengthen your profile.
                            </p>
                            @if (profile.isOwnProfile()) {
                              <button
                                type="button"
                                class="madden-cta-btn"
                                (click)="onEditProfile()"
                              >
                                Add Academic Info
                              </button>
                            }
                          </div>
                        } @else {
                          <div class="madden-stat-group">
                            <div class="madden-stat-grid">
                              @if (profile.user()?.gpa) {
                                <div class="madden-stat-card">
                                  <span class="madden-stat-value">{{ profile.user()?.gpa }}</span>
                                  <span class="madden-stat-label">GPA</span>
                                </div>
                              }
                              @if (profile.user()?.act) {
                                <div class="madden-stat-card">
                                  <span class="madden-stat-value">{{ profile.user()?.act }}</span>
                                  <span class="madden-stat-label">ACT</span>
                                </div>
                              }
                            </div>
                          </div>
                        }
                      </section>
                    }

                    @case ('events') {
                      <section class="madden-tab-section" aria-labelledby="events-heading">
                        <h2 id="events-heading" class="sr-only">Events</h2>
                        <nxt1-profile-events
                          [events]="profile.events()"
                          [visitEvents]="profile.visitEvents()"
                          [campEvents]="profile.campEvents()"
                          [generalEvents]="profile.generalEvents()"
                          [isLoading]="profile.isLoading()"
                          [isOwnProfile]="profile.isOwnProfile()"
                          [activeSection]="activeSideTab()"
                          (eventClick)="onEventClick($event)"
                          (addEventClick)="onAddEvent()"
                        />
                      </section>
                    }

                    @case ('schedule') {
                      <section
                        class="madden-tab-section madden-schedule"
                        aria-labelledby="schedule-heading"
                      >
                        <h2 id="schedule-heading" class="sr-only">Schedule</h2>

                        @if (scheduleEvents().length === 0) {
                          <div class="madden-empty">
                            <nxt1-icon name="calendar" [size]="48" />
                            <h3>No schedule yet</h3>
                            <p>Add games and practices to show your full season schedule.</p>
                            @if (profile.isOwnProfile()) {
                              <button type="button" class="madden-cta-btn" (click)="onAddEvent()">
                                Add Schedule Item
                              </button>
                            }
                          </div>
                        } @else {
                          <div class="schedule-board" role="list" aria-label="Team schedule">
                            @for (row of scheduleRows(); track row.event.id) {
                              <button
                                type="button"
                                class="schedule-row"
                                [class.schedule-row--past]="row.isPast"
                                role="listitem"
                                (click)="onEventClick(row.event)"
                              >
                                <div class="schedule-row__date">
                                  <span class="schedule-row__month">{{ row.month }}</span>
                                  <span class="schedule-row__day">{{ row.day }}</span>
                                </div>

                                <div class="schedule-row__matchup">
                                  <div class="schedule-row__teams">
                                    <div class="schedule-row__team schedule-row__team--home">
                                      <span class="schedule-row__team-name">{{
                                        row.homeTeam
                                      }}</span>
                                      @if (row.homeLogo; as homeLogo) {
                                        <img
                                          class="schedule-row__logo"
                                          [src]="homeLogo"
                                          [alt]="row.homeTeam + ' logo'"
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      }
                                    </div>

                                    <span class="schedule-row__vs">vs</span>

                                    <div class="schedule-row__team schedule-row__team--away">
                                      <span class="schedule-row__team-name">{{
                                        row.awayTeam
                                      }}</span>
                                      @if (row.awayLogo; as awayLogo) {
                                        <img
                                          class="schedule-row__logo"
                                          [src]="awayLogo"
                                          [alt]="row.awayTeam + ' logo'"
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      }
                                    </div>
                                  </div>

                                  <div class="schedule-row__meta">
                                    <span>{{ row.location }}</span>
                                    <span aria-hidden="true">•</span>
                                    <span>{{ row.time }}</span>
                                  </div>
                                </div>

                                <div class="schedule-row__status">
                                  <span class="schedule-row__status-label">{{
                                    row.statusLabel
                                  }}</span>
                                  <span class="schedule-row__status-value">{{
                                    row.statusValue
                                  }}</span>
                                </div>
                              </button>
                            }
                          </div>
                        }
                      </section>
                    }

                    @case ('contact') {
                      <section class="madden-tab-section" aria-labelledby="contact-heading">
                        <h2 id="contact-heading" class="sr-only">Contact Information</h2>
                        @if (!profile.user()?.contact?.email && !profile.user()?.contact?.phone) {
                          <div class="madden-empty">
                            <nxt1-icon name="mail" [size]="48" />
                            <h3>Contact info not set</h3>
                            <p>Add your contact information so coaches can reach you.</p>
                            @if (profile.isOwnProfile()) {
                              <button
                                type="button"
                                class="madden-cta-btn"
                                (click)="onEditContact()"
                              >
                                Add Contact Info
                              </button>
                            }
                          </div>
                        } @else {
                          <div class="madden-contact-list">
                            @if (profile.user()?.contact?.email) {
                              <a
                                class="madden-contact-item"
                                [href]="'mailto:' + profile.user()?.contact?.email"
                              >
                                <nxt1-icon name="mail" [size]="20" />
                                <span>{{ profile.user()?.contact?.email }}</span>
                              </a>
                            }
                            @if (profile.user()?.contact?.phone) {
                              <a
                                class="madden-contact-item"
                                [href]="'tel:' + profile.user()?.contact?.phone"
                              >
                                <nxt1-icon name="call" [size]="20" />
                                <span>{{ profile.user()?.contact?.phone }}</span>
                              </a>
                            }
                          </div>
                          @if (profile.user()?.social) {
                            <h3 class="madden-section-label" style="margin-top: 20px;">
                              Social Media
                            </h3>
                            <div class="madden-contact-list">
                              @if (profile.user()?.social?.twitter) {
                                <a
                                  class="madden-contact-item"
                                  [href]="'https://twitter.com/' + profile.user()?.social?.twitter"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <nxt1-icon name="link" [size]="20" />
                                  <span>{{ '@' + profile.user()?.social?.twitter }}</span>
                                </a>
                              }
                              @if (profile.user()?.social?.instagram) {
                                <a
                                  class="madden-contact-item"
                                  [href]="
                                    'https://instagram.com/' + profile.user()?.social?.instagram
                                  "
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <nxt1-icon name="link" [size]="20" />
                                  <span>{{ '@' + profile.user()?.social?.instagram }}</span>
                                </a>
                              }
                              @if (profile.user()?.social?.hudl) {
                                <a
                                  class="madden-contact-item"
                                  [href]="
                                    'https://hudl.com/profile/' + profile.user()?.social?.hudl
                                  "
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <nxt1-icon name="link" [size]="20" />
                                  <span>Hudl Profile</span>
                                </a>
                              }
                            </div>
                          }
                        }
                      </section>
                    }
                  }
                </section>
              </div>
            </div>

            <!-- RIGHT SIDE: Player image + Team info -->
            <div class="madden-split-right">
              <div class="madden-right-stack">
                <!-- ─── ACTION GRID ─── -->
                <div class="right-action-grid">
                  <button
                    type="button"
                    class="right-action-btn"
                    (click)="shareClick.emit()"
                    aria-label="Share profile"
                  >
                    <nxt1-icon name="share" [size]="20" />
                    <span>Share Profile</span>
                  </button>
                  <button
                    type="button"
                    class="right-action-btn"
                    (click)="followClick.emit()"
                    aria-label="Follow"
                  >
                    <nxt1-icon name="person" [size]="20" />
                    <span>Follow</span>
                  </button>
                </div>

                @if (profile.profileImages().length > 0) {
                  <div class="carousel-glow-wrap">
                    <div class="carousel-glow-border" aria-hidden="true"></div>
                    <div class="carousel-glow-ambient" aria-hidden="true"></div>
                    <nxt1-image-carousel
                      [images]="profile.profileImages()"
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
                        <nxt1-icon name="checkmark-circle" [size]="14" />
                        Verified
                      </span>
                    }
                  </div>
                }
                <!-- Team affiliations (school/club/juco/etc.) -->
                @if (teamAffiliations().length > 0) {
                  <div class="madden-team-stack">
                    @for (
                      team of teamAffiliations();
                      track team.name + '-' + (team.type || 'other')
                    ) {
                      <div
                        class="madden-team-block madden-team-block--clickable"
                        role="button"
                        tabindex="0"
                        (click)="onEditTeam()"
                        (keydown.enter)="onEditTeam()"
                        (keydown.space)="onEditTeam(); $event.preventDefault()"
                      >
                        @if (team.logoUrl) {
                          <img
                            class="madden-team-logo"
                            [src]="team.logoUrl"
                            [alt]="team.name"
                            loading="eager"
                          />
                        } @else {
                          <div class="madden-team-logo-placeholder">
                            <nxt1-icon [name]="teamIconName(team.type)" [size]="22" />
                          </div>
                        }
                        <div class="madden-team-info">
                          <div class="madden-team-headline">
                            <span class="madden-team-name">{{ team.name }}</span>
                          </div>
                          @if (team.location) {
                            <span class="madden-team-location">{{ team.location }}</span>
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      }
    </main>
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════════════════════
         MADDEN FRANCHISE MODE — FULL LAYOUT
         Tab bar on top → Full-screen banner stage → Content overlayed
         Side tabs on left → Scrollable content center → Player right
         ═══════════════════════════════════════════════════════════ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
        overflow: hidden;
        --m-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --m-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --m-surface-2: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        --m-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --m-text: var(--nxt1-color-text-primary, #ffffff);
        --m-text-2: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --m-text-3: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        --m-accent: var(--nxt1-color-primary, #d4ff00);
      }

      .profile-main {
        background: var(--m-bg);
        height: 100%;
        overflow: hidden;
      }

      /* ─── HEADER ACTION BUTTONS ─── */
      .profile-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .profile-header-action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        padding: 0;
        margin: 0;
        border: none;
        background: transparent;
        border-radius: 50%;
        color: var(--m-text);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color 0.15s ease,
          transform 0.1s ease;
      }
      .profile-header-action-btn:hover {
        background: var(--m-surface-2);
      }
      .profile-header-action-btn:active {
        transform: scale(0.92);
      }

      /* ─── ERROR STATE ─── */
      .madden-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 64px 24px;
        text-align: center;
      }
      .madden-error-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }
      .madden-error-title {
        font-size: 18px;
        font-weight: 700;
        color: var(--m-text);
        margin: 0 0 8px;
      }
      .madden-error-msg {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0 0 20px;
      }
      .madden-error-btn {
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        color: var(--m-text);
        border-radius: 999px;
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
      }
      .madden-error-btn:hover {
        background: var(--m-surface-2);
      }

      /* ─── FULL-SCREEN BANNER STAGE ─── */
      .madden-stage {
        position: relative;
        height: calc(100vh - 64px);
        overflow: hidden;
      }

      /* ─── HALFTONE FADED BACKGROUND ─── */
      .stage-halftone-bg {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        overflow: hidden;
      }

      /* Halftone dot pattern — radial dots that give a newsprint/recruiting card texture */
      .stage-halftone-dots {
        position: absolute;
        inset: 0;
        background-image: radial-gradient(
          circle,
          color-mix(in srgb, var(--m-accent) 28%, transparent) 1.2px,
          transparent 1.2px
        );
        background-size: 11px 11px;
        /* Fade from right to left with generous spread */
        mask-image: radial-gradient(
          ellipse 130% 110% at 85% 50%,
          black 0%,
          rgba(0, 0, 0, 0.7) 20%,
          rgba(0, 0, 0, 0.35) 45%,
          transparent 68%
        );
        -webkit-mask-image: radial-gradient(
          ellipse 130% 110% at 85% 50%,
          black 0%,
          rgba(0, 0, 0, 0.7) 20%,
          rgba(0, 0, 0, 0.35) 45%,
          transparent 68%
        );
        opacity: 1;
      }

      /* Soft colour wash that glows behind the right panel */
      .stage-halftone-fade {
        position: absolute;
        inset: 0;
        background: radial-gradient(
          ellipse 75% 100% at 88% 50%,
          color-mix(in srgb, var(--m-accent) 16%, transparent) 0%,
          color-mix(in srgb, var(--m-accent) 8%, transparent) 30%,
          transparent 62%
        );
      }

      /* Respect motion preferences */
      @media (prefers-reduced-motion: reduce) {
        .stage-halftone-dots,
        .stage-halftone-fade {
          opacity: 0.5;
        }
      }

      /* ─── SPLIT LAYOUT: Left content | Right player ─── */
      .madden-split {
        position: relative;
        z-index: 5;
        display: flex;
        height: 100%;
      }
      .madden-split-left {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        max-width: calc(100% - 380px);
        overflow: hidden;
        padding-left: 4px;
      }
      .madden-split-right {
        flex-shrink: 0;
        width: 380px;
        position: relative;
        overflow-x: hidden;
        overflow-y: auto;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        min-height: 0;
        padding: 0 16px 12px 0;
      }
      .madden-right-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 300px;
        height: auto;
        padding-top: 0;
        padding-bottom: 12px;
      }

      /* ─── RIGHT PANEL ACTION GRID ─── */
      .right-action-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-2);
        width: 100%;
      }
      .right-action-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1-5);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-2);
        border: 1px solid var(--m-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--m-surface);
        color: var(--m-text-2);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        cursor: pointer;
        text-align: center;
        -webkit-tap-highlight-color: transparent;
        transition:
          background var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out),
          color var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out),
          border-color var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out);
      }
      .right-action-btn:hover {
        background: var(--m-surface-2);
        color: var(--m-text);
        border-color: var(--m-accent);
      }
      .right-action-btn:active {
        transform: scale(0.97);
      }

      /* ═══ ANIMATED GLOW BORDER — runs ONCE then settles ═══ */

      /* Houdini custom property for native angle interpolation */
      @property --glow-angle {
        syntax: '<angle>';
        initial-value: 0deg;
        inherits: false;
      }

      /* ── Keyframes ── */

      /* Border spins one full revolution then fades out */
      @keyframes glow-spin {
        0% {
          --glow-angle: 0deg;
          opacity: 1;
        }
        80% {
          --glow-angle: 288deg;
          opacity: 1;
        }
        100% {
          --glow-angle: 360deg;
          opacity: 0;
        }
      }

      /* Ambient glow swells once then settles to a subtle idle */
      @keyframes glow-swell {
        0% {
          opacity: 0;
          transform: scale(0.96);
        }
        40% {
          opacity: 0.65;
          transform: scale(1.02);
        }
        100% {
          opacity: 0.25;
          transform: scale(1);
        }
      }

      /* Vignette fades in after spin completes */
      @keyframes vignette-in {
        0% {
          opacity: 0;
        }
        100% {
          opacity: 1;
        }
      }

      /* ── Wrapper ── */
      .carousel-glow-wrap {
        position: relative;
        width: 100%;
        height: 56vh;
        border-radius: 18px;
        isolation: isolate;
        contain: layout style;
      }
      .carousel-verified-badge {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 4;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px 4px 6px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: var(--m-accent);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.03em;
        pointer-events: none;
      }

      /* ── Rotating conic-gradient border (plays once) ── */
      .carousel-glow-border {
        position: absolute;
        inset: -2px;
        border-radius: 20px;
        z-index: 0;
        background: conic-gradient(
          from var(--glow-angle, 0deg),
          var(--m-accent) 0%,
          transparent 12%,
          transparent 33%,
          var(--m-accent) 45%,
          transparent 57%,
          transparent 78%,
          var(--m-accent) 90%,
          transparent 100%
        );
        animation: glow-spin 2.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        will-change: --glow-angle, opacity;
        border: 2px solid transparent;
        pointer-events: none;
      }

      /* ── Soft ambient glow (swells once, stays subtle) ── */
      .carousel-glow-ambient {
        position: absolute;
        inset: -6px;
        border-radius: 24px;
        z-index: -1;
        background: radial-gradient(
          ellipse at 50% 30%,
          color-mix(in srgb, var(--m-accent) 25%, transparent) 0%,
          transparent 70%
        );
        filter: blur(18px);
        opacity: 0;
        animation: glow-swell 2.4s ease-out forwards;
        will-change: opacity, transform;
        pointer-events: none;
      }

      /* ── Respect prefers-reduced-motion ── */
      @media (prefers-reduced-motion: reduce) {
        .carousel-glow-border {
          animation: none;
          background: none;
          border: 2px solid color-mix(in srgb, var(--m-accent) 30%, transparent);
          opacity: 1;
        }
        .carousel-glow-ambient {
          animation: none;
          opacity: 0.2;
        }
        .madden-player-carousel ::ng-deep .carousel::before {
          animation: none;
          opacity: 1;
        }
      }

      .madden-player-carousel {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
        border-radius: 16px;
        overflow: hidden;
      }
      .madden-player-carousel ::ng-deep .carousel {
        position: relative;
        height: 100%;
        border-radius: 16px;
      }
      .madden-player-carousel ::ng-deep .carousel::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 1;
        border-radius: 16px;
        pointer-events: none;
        opacity: 0;
        animation: vignette-in 0.8s ease-out 2.4s forwards;
        background:
          linear-gradient(
            to bottom,
            color-mix(in srgb, var(--m-accent) 16%, rgba(10, 10, 10, 0.3)) 0%,
            transparent 9%
          ),
          linear-gradient(
            to top,
            color-mix(in srgb, var(--m-accent) 18%, rgba(10, 10, 10, 0.36)) 0%,
            transparent 12%
          ),
          linear-gradient(
            to right,
            color-mix(in srgb, var(--m-accent) 14%, rgba(10, 10, 10, 0.28)) 0%,
            transparent 7%
          ),
          linear-gradient(
            to left,
            color-mix(in srgb, var(--m-accent) 14%, rgba(10, 10, 10, 0.28)) 0%,
            transparent 7%
          );
      }
      .madden-player-carousel ::ng-deep .carousel-track {
        height: 100%;
      }
      .madden-player-carousel ::ng-deep .carousel-slide {
        height: 100%;
      }
      .madden-player-carousel ::ng-deep .carousel-img {
        height: 100%;
        object-position: center top;
      }

      /* Team block below player image */
      .madden-team-stack {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .madden-team-block {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
      }
      .madden-team-block--clickable {
        cursor: pointer;
        transition:
          transform 0.18s ease,
          box-shadow 0.18s ease;
      }
      .madden-team-block--clickable:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.16);
      }
      .madden-team-block--clickable:focus-visible {
        outline: none;
        box-shadow:
          0 0 0 2px color-mix(in srgb, var(--m-text-2) 38%, transparent),
          0 6px 16px rgba(0, 0, 0, 0.16);
      }
      .madden-team-logo {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        object-fit: contain;
        flex-shrink: 0;
      }
      .madden-team-logo-placeholder {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        background: var(--m-surface-2);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m-text-3);
        flex-shrink: 0;
      }
      .madden-team-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 2px;
      }
      .madden-team-headline {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .madden-team-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .madden-team-type {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--m-accent);
        border: 1px solid color-mix(in srgb, var(--m-accent) 42%, transparent);
        background: color-mix(in srgb, var(--m-accent) 12%, transparent);
        border-radius: 999px;
        padding: 2px 8px;
      }
      .madden-team-location {
        font-size: 12px;
        color: var(--m-text-3);
      }

      /* ─── TOP TAB BAR ─── */
      .madden-top-tabs {
        padding: 0 8px;
        margin-top: -6px;
        border-bottom: none;
        background: transparent;
        flex-shrink: 0;
      }

      /* Force option-scroller background transparent, compact height & hide badges in profile context */
      .madden-top-tabs ::ng-deep .option-scroller {
        background: transparent !important;
      }
      .madden-top-tabs ::ng-deep .option-scroller__container {
        min-height: 0;
      }
      .madden-top-tabs ::ng-deep .option-scroller__option {
        height: 36px;
      }
      .madden-top-tabs ::ng-deep .option-scroller__badge {
        display: none !important;
      }

      /* ─── CONTENT LAYER (overlayed on banner) ─── */
      .madden-content-layer {
        position: relative;
        display: flex;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        padding: 18px 0 0;
        gap: var(--nxt1-spacing-4);
      }

      /* ─── SECTION NAV HOST — constrain width ─── */
      .madden-side-nav-column {
        flex-shrink: 0;
        width: 180px;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        position: sticky;
        top: var(--nxt1-spacing-6);
        align-self: stretch;
        max-height: calc(100vh - 200px);
        overflow-y: auto;
        scrollbar-width: none;
      }
      .madden-side-nav-column::-webkit-scrollbar {
        display: none;
      }

      .madden-side-nav-column nxt1-section-nav-web {
        width: 100%;
      }

      /* ─── SPORT PROFILE SWITCHER ─── */
      .sport-switcher {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 0;
        margin-top: auto;
        margin-bottom: var(--nxt1-spacing-4);
      }

      .sport-switcher__title {
        padding: 0 var(--nxt1-spacing-2);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .sport-switcher__list {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 4px;
      }

      .sport-switcher__item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px 4px 4px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--nxt1-radius-full, 999px);
        cursor: pointer;
        text-align: left;
        color: var(--nxt1-color-text-secondary);
        transition:
          color 100ms ease-out,
          background 100ms ease-out,
          border-color 100ms ease-out;
      }

      .sport-switcher__item:hover {
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
      }

      .sport-switcher__item--active {
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border-color: var(--nxt1-color-primary);
      }

      .sport-switcher__item--active:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
      }

      .sport-switcher__item:focus,
      .sport-switcher__item:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--nxt1-color-primary);
      }

      .sport-switcher__avatar {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
        border: 1.5px solid transparent;
      }

      .sport-switcher__item--active .sport-switcher__avatar {
        border-color: var(--nxt1-color-primary);
      }

      .sport-switcher__avatar-fallback {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        color: var(--nxt1-color-text-secondary);
        font-size: 10px;
        font-weight: 700;
        border: 1.5px solid transparent;
      }

      .sport-switcher__item--active .sport-switcher__avatar-fallback {
        border-color: var(--nxt1-color-primary);
      }

      .sport-switcher__sport-name {
        font-size: 12px;
        font-weight: 500;
        line-height: 1;
        white-space: nowrap;
      }

      .sport-switcher__active-badge {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        flex-shrink: 0;
        margin-left: -2px;
      }

      /* ─── MAIN CONTENT SCROLL AREA ─── */
      .madden-content-scroll {
        flex: 1;
        min-width: 0;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 0 12px 120px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
      }
      .madden-content-scroll::-webkit-scrollbar {
        width: 6px;
      }
      .madden-content-scroll::-webkit-scrollbar-track {
        background: transparent;
      }
      .madden-content-scroll::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
      }

      /* Constrain images inside content scroll */
      .madden-content-scroll :deep(img),
      .madden-content-scroll ::ng-deep img {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
      }

      /* ─── TAB SECTION GENERIC ─── */
      .madden-tab-section {
        padding: 4px 0;
      }

      /* ─── EMPTY STATE ─── */
      .madden-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 48px 24px;
        text-align: center;
        color: var(--m-text-3);
      }
      .madden-empty h3 {
        font-size: 18px;
        font-weight: 700;
        color: var(--m-text);
        margin: 16px 0 8px;
      }
      .madden-empty p {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0 0 20px;
        max-width: 280px;
      }

      /* CTA Button */
      .madden-cta-btn {
        background: var(--m-accent);
        color: #000;
        border: none;
        border-radius: 999px;
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: filter 0.15s;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.1);
      }

      /* ─── SECTION LABELS ─── */
      .madden-section-label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-2);
        margin: 0 0 12px;
      }
      .madden-section-label--muted {
        color: var(--m-text-3);
        margin-top: 24px;
      }

      /* ═══ SHARED VERIFICATION BANNER ═══ */
      .profile-verification-banner {
        display: flex;
        align-items: center;
        padding: 0 0 12px;
        margin: 0 0 4px;
        border-bottom: 1px solid color-mix(in srgb, var(--m-border) 50%, transparent);
      }
      .verification-banner__badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--m-accent);
        letter-spacing: 0.01em;
        border: 1px solid color-mix(in srgb, var(--m-accent) 35%, transparent);
        background: color-mix(in srgb, var(--m-accent) 8%, transparent);
        border-radius: 999px;
        padding: 5px 12px 5px 8px;
        line-height: 1;
        transition: all 0.18s ease;
      }
      .verification-banner__badge--link {
        text-decoration: none;
        cursor: pointer;
      }
      .verification-banner__badge--link:hover {
        border-color: color-mix(in srgb, var(--m-accent) 60%, transparent);
        background: color-mix(in srgb, var(--m-accent) 14%, transparent);
      }
      .verification-banner__badge--unverified {
        color: var(--m-text-3);
        border-color: color-mix(in srgb, var(--m-border) 60%, transparent);
        background: color-mix(in srgb, var(--m-surface-2) 40%, transparent);
      }
      .verification-banner__check {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--m-accent);
        color: #000;
        font-size: 10px;
        font-weight: 800;
        flex-shrink: 0;
        line-height: 1;
      }
      .verification-banner__label {
        color: var(--m-text-2);
        font-weight: 600;
        white-space: nowrap;
      }
      .verification-banner__logo {
        width: 20px;
        height: 20px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--m-accent) 20%, transparent);
        flex-shrink: 0;
        overflow: hidden;
      }
      .verification-banner__logo-img {
        width: 14px;
        height: 14px;
        object-fit: contain;
        display: block;
      }
      .verification-banner__provider-name {
        font-weight: 700;
        color: var(--m-accent);
        white-space: nowrap;
      }
      .verification-banner__provider-text {
        font-weight: 700;
        color: var(--m-accent);
        white-space: nowrap;
        font-size: 12px;
        letter-spacing: 0.01em;
      }
      @media (max-width: 640px) {
        .profile-verification-banner {
          padding: 0 0 10px;
          margin: 0 0 2px;
        }
        .verification-banner__badge {
          font-size: 11px;
          padding: 4px 10px 4px 6px;
          gap: 5px;
        }
        .verification-banner__check {
          width: 16px;
          height: 16px;
          font-size: 9px;
        }
        .verification-banner__logo {
          width: 18px;
          height: 18px;
        }
        .verification-banner__logo-img {
          width: 12px;
          height: 12px;
        }
      }

      /* ─── STATS BOARD (Professional Table/Leaderboard) ─── */
      .stats-board {
        padding-top: 0;
      }
      .stats-board__top-bar {
        display: flex;
        align-items: center;
        margin-bottom: 12px;
      }

      /* Category pill tabs */
      .stats-board__tabs {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 0 16px;
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .stats-board__tabs::-webkit-scrollbar {
        display: none;
      }
      .stats-board__tab {
        flex-shrink: 0;
        padding: 7px 16px;
        border-radius: 999px;
        border: 1px solid var(--m-border);
        background: transparent;
        color: var(--m-text-2);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.18s ease;
        white-space: nowrap;
        line-height: 1.2;
      }
      .stats-board__tab:hover {
        background: var(--m-surface-2);
        color: var(--m-text);
        border-color: color-mix(in srgb, var(--m-accent) 30%, var(--m-border));
      }
      .stats-board__tab--active {
        background: var(--m-accent);
        color: #000;
        border-color: var(--m-accent);
        font-weight: 700;
      }
      .stats-board__tab--active:hover {
        background: var(--m-accent);
        color: #000;
        border-color: var(--m-accent);
        filter: brightness(1.08);
      }

      /* Table wrapper — horizontal scroll on small screens */
      .stats-board__table-wrap {
        --stats-board-th-pad-y: 10px;
        --stats-board-th-pad-x: 16px;
        --stats-board-header-height: calc((var(--stats-board-th-pad-y) * 2) + 14px);
        position: relative;
        border-radius: 10px;
        border: 1px solid var(--m-border);
        background-color: var(--m-surface);
        background-image: linear-gradient(
          180deg,
          color-mix(in srgb, var(--m-accent) 5%, var(--m-surface)),
          var(--m-surface)
        );
        background-repeat: no-repeat;
        background-size: 100% var(--stats-board-header-height);
        overflow-x: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--m-surface-2) transparent;
      }
      .stats-board__table-wrap::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        top: var(--stats-board-header-height);
        border-top: 1px solid var(--m-border);
        pointer-events: none;
      }
      .stats-board__table-wrap--compact {
        --stats-board-th-pad-y: 8px;
        --stats-board-th-pad-x: 12px;
        border-radius: 8px;
      }

      /* The table itself */
      .stats-board__table {
        border-collapse: collapse;
        table-layout: auto;
        min-width: max-content;
      }

      /* Header row */
      .stats-board__table thead tr {
        border-bottom: none;
      }
      .stats-board__table th {
        padding: var(--stats-board-th-pad-y) var(--stats-board-th-pad-x);
        text-align: center;
        white-space: nowrap;
        vertical-align: middle;
        background: transparent;
      }
      .stats-board__th-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-3);
        user-select: none;
      }

      /* Data cells */
      .stats-board__table td {
        padding: 14px 16px;
        text-align: center;
        white-space: nowrap;
        vertical-align: middle;
        position: relative;
      }
      .stats-board__table tbody tr {
        border-bottom: 1px solid color-mix(in srgb, var(--m-border) 50%, transparent);
        transition: background 0.12s ease;
      }
      .stats-board__table tbody tr:last-child {
        border-bottom: none;
      }
      .stats-board__table tbody tr:hover {
        background: color-mix(in srgb, var(--m-accent) 4%, transparent);
      }

      .stats-compare {
        margin-top: 10px;
        border: 1px solid var(--m-border);
        border-radius: 8px;
        background: var(--m-surface);
        padding: 12px 12px 8px;
      }
      .stats-compare__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 4px;
      }
      .stats-compare__title {
        margin: 0;
        font-size: 14px;
        font-weight: 800;
        color: var(--m-text);
        letter-spacing: -0.01em;
      }
      .stats-compare__legend {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .stats-compare__legend-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--m-text-2);
        font-size: 12px;
        font-weight: 500;
      }
      .stats-compare__dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
      }
      .stats-compare__dot--player {
        background: var(--m-accent);
      }
      .stats-compare__dot--average {
        background: color-mix(in srgb, var(--m-text-3) 70%, var(--m-border));
      }
      .stats-compare__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
        gap: 6px;
      }
      .stats-compare__item {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
      }
      .stats-compare__values {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
        margin-bottom: 5px;
      }
      .stats-compare__value {
        font-variant-numeric: tabular-nums;
        line-height: 1.04;
        white-space: nowrap;
      }
      .stats-compare__value--player {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text);
      }
      .stats-compare__value--average {
        font-size: 12px;
        font-weight: 500;
        color: var(--m-text-3);
      }
      .stats-compare__bar-zone {
        --stats-compare-bar-max-height: 70px;
        position: relative;
        width: 100%;
        height: var(--stats-compare-bar-max-height);
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 6px;
        border-bottom: 1px solid var(--m-border);
        margin-bottom: 6px;
      }
      .stats-compare__bar {
        width: 10px;
        border-radius: 999px 999px 0 0;
        min-height: 0;
      }
      .stats-compare__bar--player {
        background: var(--m-accent);
      }
      .stats-compare__bar--average {
        background: color-mix(in srgb, var(--m-text-3) 70%, var(--m-border));
      }
      .stats-compare__label {
        font-size: 12px;
        font-weight: 500;
        color: var(--m-text);
        text-align: center;
        letter-spacing: -0.01em;
        text-transform: uppercase;
      }
      .stats-board__cell-value {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.01em;
      }
      .stats-board__verified {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 15px;
        height: 15px;
        border-radius: 50%;
        background: var(--m-accent);
        color: #000;
        font-size: 9px;
        font-weight: 800;
        margin-left: 5px;
        vertical-align: middle;
        line-height: 1;
      }

      /* Compact variant for overview sidebar */
      .stats-board__table--compact th {
        padding: 8px 12px;
      }
      .stats-board__table--compact td {
        padding: 10px 12px;
      }
      .stats-board__table--compact .stats-board__cell-value {
        font-size: 14px;
      }

      /* Responsive */
      @media (max-width: 640px) {
        .stats-board__table-wrap {
          --stats-board-th-pad-y: 8px;
          --stats-board-th-pad-x: 10px;
        }
        .stats-board__tabs {
          padding-bottom: 12px;
        }
        .stats-board__tab {
          padding: 6px 12px;
          font-size: 11px;
        }
        .stats-board__table th {
          padding: var(--stats-board-th-pad-y) var(--stats-board-th-pad-x);
        }
        .stats-board__table td {
          padding: 12px 10px;
        }
        .stats-board__cell-value {
          font-size: 14px;
        }
        .stats-board__th-label {
          font-size: 10px;
        }
        .stats-compare {
          padding: 10px 8px 8px;
        }
        .stats-compare__header {
          align-items: flex-start;
          flex-direction: column;
          gap: 10px;
        }
        .stats-compare__legend {
          gap: 10px;
        }
        .stats-compare__value--player {
          font-size: 14px;
        }
        .stats-compare__value--average {
          font-size: 11px;
        }
        .stats-compare__bar-zone {
          --stats-compare-bar-max-height: 56px;
        }
        .stats-compare__bar {
          width: 8px;
        }
        .stats-compare__label {
          font-size: 11px;
        }
      }

      /* ─── STAT CARDS (original style for academic/overview) ─── */
      .madden-stat-group {
        margin-bottom: 24px;
      }
      .madden-stat-group-title {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-2);
        margin: 0 0 12px;
      }
      .madden-stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 160px));
        gap: 10px;
      }
      .madden-stat-card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px;
        border-radius: 8px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
      }
      .madden-stat-value {
        font-size: 20px;
        font-weight: 800;
        color: var(--m-text);
      }
      .madden-stat-label {
        font-size: 12px;
        color: var(--m-text-2);
      }
      .madden-stat-verified {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--m-accent);
        color: #000;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
      }

      /* ─── SCHEDULE BOARD ─── */
      .madden-schedule {
        padding-top: 2px;
      }
      .schedule-board {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .schedule-row {
        width: 100%;
        border: 1px solid var(--m-border);
        border-radius: 12px;
        background: var(--m-surface);
        color: var(--m-text);
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr) 130px;
        align-items: stretch;
        text-align: left;
        overflow: hidden;
        cursor: pointer;
        transition:
          border-color 0.18s ease,
          transform 0.18s ease,
          background 0.18s ease;
      }
      .schedule-row:hover {
        border-color: color-mix(in srgb, var(--m-accent) 20%, var(--m-border));
        background: var(--m-surface-2);
        transform: translateY(-1px);
      }
      .schedule-row:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--m-accent) 50%, transparent);
        outline-offset: 2px;
      }
      .schedule-row--past {
        opacity: 0.88;
      }
      .schedule-row--past .schedule-row__status-label {
        color: var(--m-text-2);
      }

      .schedule-row__date,
      .schedule-row__status {
        background: color-mix(in srgb, var(--m-surface-2) 70%, var(--m-surface));
      }

      .schedule-row__date {
        border-right: 1px solid var(--m-border);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1px;
        padding: 8px 6px;
      }
      .schedule-row__month {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--m-text-2);
      }
      .schedule-row__day {
        font-size: 22px;
        line-height: 1;
        font-weight: 800;
        color: var(--m-text);
      }

      .schedule-row__matchup {
        padding: 10px 12px;
        display: flex;
        min-width: 0;
        flex-direction: column;
        justify-content: center;
        gap: 6px;
      }
      .schedule-row__teams {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .schedule-row__team {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
      }
      .schedule-row__team-name {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: -0.01em;
        color: var(--m-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .schedule-row__logo {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        object-fit: cover;
        border: 1px solid var(--m-border);
        background: var(--m-surface);
        flex-shrink: 0;
      }
      .schedule-row__vs {
        flex-shrink: 0;
        font-size: 11px;
        font-weight: 600;
        text-transform: lowercase;
        color: var(--m-text-2);
      }
      .schedule-row__meta {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--m-text-2);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .schedule-row__status {
        border-left: 1px solid var(--m-border);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        gap: 4px;
      }
      .schedule-row__status-label {
        font-size: 14px;
        line-height: 1.1;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--m-text);
      }
      .schedule-row__status-value {
        font-size: 12px;
        line-height: 1.25;
        color: var(--m-text-2);
      }

      @media (max-width: 1024px) {
        .schedule-row {
          grid-template-columns: 68px minmax(0, 1fr) 120px;
        }
        .schedule-row__team-name {
          font-size: 13px;
        }
        .schedule-row__status-label {
          font-size: 13px;
        }
        .schedule-row__status-value {
          font-size: 12px;
        }
      }

      @media (max-width: 760px) {
        .schedule-row {
          grid-template-columns: 62px minmax(0, 1fr);
          grid-template-areas:
            'date matchup'
            'status status';
        }
        .schedule-row__date {
          grid-area: date;
        }
        .schedule-row__matchup {
          grid-area: matchup;
          padding: 9px 10px;
          gap: 6px;
        }
        .schedule-row__teams {
          gap: 8px;
          flex-wrap: wrap;
        }
        .schedule-row__team-name {
          font-size: 13px;
        }
        .schedule-row__logo {
          width: 22px;
          height: 22px;
        }
        .schedule-row__meta {
          font-size: 12px;
        }
        .schedule-row__status {
          grid-area: status;
          border-left: none;
          border-top: 1px solid var(--m-border);
          background: color-mix(in srgb, var(--m-surface-2) 70%, var(--m-surface));
          padding: 8px 10px;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }
        .schedule-row__status-label {
          font-size: 13px;
        }
        .schedule-row__status-value {
          font-size: 12px;
          text-align: right;
        }
      }

      /* ─── CONTACT LIST ─── */
      .madden-contact-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .madden-contact-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border-radius: 8px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        color: var(--m-text);
        font-size: 15px;
        text-decoration: none;
        transition: all 0.15s;
      }
      .madden-contact-item:hover {
        background: var(--m-surface-2);
        border-color: var(--m-accent);
      }

      /* ═══════════════════════════════════════════════
         OVERVIEW TAB — Madden Player Overview Style
         ═══════════════════════════════════════════════ */
      .madden-overview {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      .ov-top-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 260px;
        gap: 20px;
        align-items: center;
      }
      .ov-top-row--single {
        grid-template-columns: minmax(0, 1fr);
      }
      .ov-section--profile {
        min-width: 0;
      }

      /* Section titles (Player Profile, Player Archetypes) */
      .ov-section-title {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text);
        margin: 0 0 14px;
        letter-spacing: -0.01em;
      }
      .ov-overview-title {
        font-size: 16px;
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: -0.01em;
      }

      /* Player Profile key-value grid */
      .ov-profile-grid {
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .ov-profile-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--m-border);
      }
      .ov-profile-row:last-child {
        border-bottom: none;
      }
      .ov-profile-key {
        font-size: 14px;
        color: var(--m-text-3);
        min-width: 80px;
        font-weight: 500;
      }
      .ov-profile-val {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
      }
      .ov-profile-val-wrap {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .ov-verified-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--m-accent);
        letter-spacing: 0.01em;
        border: 1px solid color-mix(in srgb, var(--m-accent) 35%, transparent);
        background: color-mix(in srgb, var(--m-accent) 12%, transparent);
        border-radius: 999px;
        padding: 2px 8px 2px 6px;
        line-height: 1;
      }
      .ov-verified-link {
        text-decoration: none;
      }
      .ov-verified-link:hover {
        border-color: color-mix(in srgb, var(--m-accent) 55%, transparent);
      }
      .ov-verified-label {
        color: var(--m-text-2);
        font-weight: 600;
      }
      .ov-verified-logo {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--m-accent) 24%, transparent);
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .ov-verified-logo-img {
        width: 12px;
        height: 12px;
        object-fit: contain;
        display: block;
      }

      .ov-last-synced-btn {
        width: 100%;
        margin: 16px 0 0;
        padding: 14px 16px;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--m-accent) 28%, var(--m-border));
        background:
          linear-gradient(
            160deg,
            color-mix(in srgb, var(--m-accent) 11%, transparent),
            color-mix(in srgb, var(--m-surface) 88%, transparent)
          ),
          var(--m-surface);
        color: var(--m-text);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        cursor: pointer;
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease,
          transform 0.2s ease;
      }
      .ov-last-synced-btn:hover {
        border-color: color-mix(in srgb, var(--m-accent) 44%, var(--m-border));
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.16);
        transform: translateY(-1px);
      }
      .ov-last-synced-btn:focus-visible {
        outline: none;
        border-color: var(--m-accent);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--m-accent) 40%, transparent);
      }
      .ov-last-synced-main {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .ov-last-synced-label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-3);
      }
      .ov-last-synced-time {
        margin-top: 4px;
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
      }
      .ov-last-synced-agent {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .ov-last-synced-agentx {
        width: 34px;
        height: 34px;
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .ov-last-synced-agent-name {
        font-size: 13px;
        font-weight: 700;
        color: color-mix(in srgb, var(--m-accent) 72%, var(--m-text));
        letter-spacing: 0.02em;
      }

      /* Agent X Trait inline block (no large card container) */
      .ov-trait-inline {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 8px;
      }
      .ov-trait-icon-lg {
        width: 112px;
        height: 112px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }
      .ov-trait-icon-lg svg {
        width: 100%;
        height: 100%;
      }
      .ov-trait-icon-inner {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: var(--m-accent);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .ov-trait-icon-shell {
        fill: color-mix(in srgb, var(--m-accent) 15%, transparent);
        stroke: color-mix(in srgb, var(--m-accent) 70%, transparent);
        stroke-width: 2;
      }
      .ov-trait-icon-core {
        fill: color-mix(in srgb, var(--m-accent) 25%, transparent);
        stroke: color-mix(in srgb, var(--m-accent) 80%, transparent);
        stroke-width: 1.5;
      }
      .ov-trait-category {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: var(--m-accent);
        line-height: 1;
      }
      .ov-trait-summary {
        font-size: 14px;
        font-weight: 600;
        color: var(--m-text);
        margin: 4px 0 0;
        line-height: 1.45;
        max-width: 320px;
      }

      @media (max-width: 980px) {
        .ov-top-row {
          grid-template-columns: 1fr;
          gap: 14px;
        }
      }

      /* Connected Accounts — compact chip grid */
      .ov-connected-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .ov-connected-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px 5px 7px;
        background: var(--m-card);
        border: 1px solid color-mix(in srgb, var(--m-accent) 18%, var(--m-border));
        border-radius: 999px;
        text-decoration: none;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          transform 0.15s ease;
        cursor: pointer;
      }
      .ov-connected-chip:hover {
        background: color-mix(in srgb, var(--m-accent) 8%, var(--m-card));
        border-color: color-mix(in srgb, var(--m-accent) 40%, var(--m-border));
        transform: translateY(-1px);
      }
      .ov-connected-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.06);
      }
      .ov-connected-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 12.5px;
        font-weight: 700;
        color: var(--m-text);
        white-space: nowrap;
        letter-spacing: 0.01em;
      }
      .ov-connected-check {
        display: inline-flex;
        align-items: center;
        color: var(--m-accent);
        flex-shrink: 0;
        margin-left: -2px;
      }
      .ov-connected-explainer {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 10px 0 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 11.5px;
        font-weight: 500;
        line-height: 1.45;
        color: var(--m-text-3);
        letter-spacing: 0.01em;
      }
      .ov-connected-explainer nxt1-icon {
        flex-shrink: 0;
        color: var(--m-accent);
        margin-top: 1px;
      }
      .ov-connected-agentx {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        color: var(--m-accent);
        margin-top: -1px;
      }

      /* Player Archetypes — Big Badge Labels */
      .ov-archetype-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .ov-archetype-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        border-radius: 50px;
        background: linear-gradient(
          135deg,
          rgba(212, 255, 0, 0.1) 0%,
          rgba(212, 255, 0, 0.04) 100%
        );
        border: 1px solid rgba(212, 255, 0, 0.18);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        transition:
          border-color 0.2s,
          transform 0.15s,
          box-shadow 0.2s;
        cursor: default;
      }
      .ov-archetype-badge:hover {
        border-color: var(--m-accent);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(212, 255, 0, 0.12);
      }
      .ov-archetype-badge nxt1-icon {
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .ov-archetype-badge-name {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
        letter-spacing: 0.06em;
        white-space: nowrap;
        line-height: 1;
      }

      /* Player Bio card — matches Player Profile section visual weight */
      .ov-bio-card {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        border-radius: 10px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
      }
      .ov-bio-card nxt1-icon {
        color: var(--m-accent);
        flex-shrink: 0;
        margin-top: 2px;
      }
      .ov-bio-card p {
        font-size: 15px;
        font-weight: 500;
        color: var(--m-text-2);
        line-height: 1.6;
        margin: 0;
      }

      .ov-history-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ov-history-item {
        display: grid;
        grid-template-columns: 92px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
      }
      .ov-history-year {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--m-text-2);
        line-height: 1.25;
        padding-top: 10px;
      }
      .ov-history-main {
        width: 100%;
        max-width: 520px;
        min-width: 0;
        justify-self: stretch;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .ov-history-logo-wrap {
        width: 44px;
        height: 44px;
      }
      .ov-history-logo-fallback {
        color: var(--m-text-3);
      }
      .ov-history-content {
        min-width: 0;
        flex: 1;
      }
      .ov-history-team {
        line-height: 1.2;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
      }
      .ov-history-meta {
        margin-top: 0;
      }
      .ov-history-record {
        margin-left: auto;
        flex-shrink: 0;
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--m-accent) 35%, transparent);
        background: color-mix(in srgb, var(--m-accent) 12%, transparent);
        color: var(--m-accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        line-height: 1;
      }

      /* Badges Row (Madden bottom badges) */
      .ov-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .ov-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .ov-badge--verified {
        background: rgba(212, 255, 0, 0.1);
        color: var(--m-accent);
        border: 1px solid rgba(212, 255, 0, 0.2);
      }
      .ov-badge--stars {
        background: rgba(255, 193, 7, 0.1);
        color: #ffc107;
        border: 1px solid rgba(255, 193, 7, 0.2);
      }
      .ov-badge--offers {
        background: rgba(233, 30, 99, 0.1);
        color: #e91e63;
        border: 1px solid rgba(233, 30, 99, 0.2);
      }

      /* ─── RESPONSIVE ─── */
      @media (max-width: 1024px) {
        .madden-side-tabs {
          width: 180px;
        }
        .madden-side-tab {
          font-size: 12px;
          padding: 12px 12px;
        }
        .madden-split-left {
          max-width: calc(100% - 280px);
        }
        .madden-split-right {
          width: 280px;
        }
        .madden-right-stack {
          width: 240px;
        }
        .madden-side-nav-column {
          width: 160px;
        }
        .sport-switcher__sport-name {
          font-size: 11px;
        }
      }
      @media (max-width: 768px) {
        .madden-side-tabs {
          display: none;
        }
        .madden-content-layer {
          padding: 12px;
          flex-direction: column;
          gap: 0;
        }
        .madden-content-scroll {
          max-width: 100%;
          max-height: none;
          overflow-y: visible;
          padding: 0;
        }
        .madden-split-left {
          max-width: 100%;
        }
        .madden-split-right {
          display: none;
        }
        .madden-side-nav-column {
          width: 100%;
          position: static;
          max-height: none;
          flex-direction: column;
          gap: var(--nxt1-spacing-3);
          margin-bottom: var(--nxt1-spacing-3);
        }
        /* Sport switcher: horizontal scroll on mobile */
        .sport-switcher {
          border-top: none;
          padding-top: 0;
          border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
          padding-bottom: var(--nxt1-spacing-3);
        }
        .sport-switcher__list {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .sport-switcher__list::-webkit-scrollbar {
          display: none;
        }
        .sport-switcher__sport-name {
          font-size: 11px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileShellWebComponent implements OnInit {
  protected readonly profile = inject(ProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileShellWeb');

  // ============================================
  // INPUTS
  // ============================================

  /** Current logged-in user info for header avatar */
  readonly currentUser = input<ProfileShellUser | null>(null);

  /** Profile unicode to load (unique identifier for profiles) */
  readonly profileUnicode = input<string>('');

  /** Whether viewing own profile */
  readonly isOwnProfile = input(false);

  /** Hide mobile header (when sidebar provides navigation on desktop) */
  readonly hideHeader = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly avatarClick = output<void>();
  readonly backClick = output<void>();
  readonly tabChange = output<ProfileTabId>();
  readonly editProfileClick = output<void>();
  readonly editTeamClick = output<void>();
  readonly shareClick = output<void>();
  readonly followClick = output<void>();
  readonly menuClick = output<void>();
  readonly qrCodeClick = output<void>();
  readonly aiSummaryClick = output<void>();
  readonly createPostClick = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Desktop page header title — shows the athlete's name */
  protected readonly desktopTitle = computed(() => {
    const u = this.profile.user();
    if (u?.displayName) return u.displayName;
    const first = u?.firstName ?? '';
    const last = u?.lastName ?? '';
    return (first + ' ' + last).trim() || 'Profile';
  });

  /** Desktop page header subtitle — position + school */
  protected readonly desktopSubtitle = computed(() => {
    const u = this.profile.user();
    const parts: string[] = [];
    if (u?.primarySport?.position) parts.push(u.primarySport.position);
    if (u?.school?.name) parts.push(u.school.name);
    if (u?.classYear) parts.push(`Class of ${u.classYear}`);
    return parts.join(' · ') || '';
  });

  /** Carousel hover overlay subtitle — position, sport, school, class */
  protected readonly carouselOverlaySubtitle = computed(() => {
    const u = this.profile.user();
    if (!u) return '';
    const parts: string[] = [];
    if (u.primarySport?.position) parts.push(u.primarySport.position);
    if (u.primarySport?.name) parts.push(u.primarySport.name);
    if (u.school?.name) parts.push(u.school.name);
    if (u.classYear) parts.push(`'${u.classYear.slice(-2)}`);
    return parts.join(' · ');
  });

  /** Carousel per-image titles (first image = profile photo, rest = gallery shots) */
  protected readonly carouselOverlayTitles = computed<readonly string[]>(() => {
    const images = this.profile.profileImages();
    const base = this.desktopTitle();
    const titles: string[] = [];

    for (let index = 0; index < images.length; index += 1) {
      if (index === 0) {
        titles.push(base);
      } else {
        titles.push(`${base} · Gallery ${index}`);
      }
    }

    return titles;
  });

  /** Carousel per-image subtitles (add image position for each slide) */
  protected readonly carouselOverlaySubtitles = computed<readonly string[]>(() => {
    const images = this.profile.profileImages();
    const baseSubtitle = this.carouselOverlaySubtitle();
    const total = images.length;

    return images.map((_, index) => {
      const position = `Photo ${index + 1} of ${total}`;
      return baseSubtitle ? `${baseSubtitle} · ${position}` : position;
    });
  });

  protected readonly tabOptions = computed((): OptionScrollerItem[] => {
    const badges = this.profile.tabBadges();

    return PROFILE_TABS.filter((tab) => tab.id !== 'contact').map((tab: ProfileTab) => ({
      id: tab.id,
      label: tab.label,
      badge: badges[tab.id as keyof typeof badges] || undefined,
    }));
  });

  protected readonly emptyState = computed(() => {
    const tab = this.profile.activeTab();
    return PROFILE_EMPTY_STATES[tab] || PROFILE_EMPTY_STATES['timeline'];
  });

  /** Section nav items — contextual to active top tab */
  protected readonly sideTabItems = computed((): SectionNavItem[] => {
    const tab = this.profile.activeTab();
    const sections: Record<string, SectionNavItem[]> = {
      overview: [
        { id: 'player-profile', label: 'Player Profile' },
        { id: 'player-bio', label: 'Player Bio' },
        { id: 'player-history', label: 'Player History' },
        { id: 'academic', label: 'Academic' },
        { id: 'contact', label: 'Contact' },
      ],
      timeline: [
        { id: 'pinned', label: 'Pinned' },
        { id: 'all-posts', label: 'All Posts' },
        { id: 'media', label: 'Media' },
      ],
      videos: [
        { id: 'highlights', label: 'Highlights' },
        { id: 'game-film', label: 'Game Film' },
        { id: 'training', label: 'Training' },
      ],
      offers: [
        { id: 'timeline', label: 'Timeline' },
        {
          id: 'committed',
          label: 'Commitment',
          badge: this.profile.committedOffers().length || undefined,
        },
        {
          id: 'all-offers',
          label: 'Offers',
          badge: this.profile.activeOffers().length || undefined,
        },
        {
          id: 'interests',
          label: 'Interests',
          badge: this.profile.interestOffers().length || undefined,
        },
        {
          id: 'rankings',
          label: 'Rankings',
        },
      ],
      stats: [
        { id: 'career', label: 'Career' },
        { id: 'season-2025-2026', label: '2025-2026' },
        { id: 'season-2024-2025', label: '2024-2025' },
      ],
      schedule: [
        { id: 'career', label: 'Career' },
        { id: 'season-2025-2026', label: '2025-2026' },
        { id: 'season-2024-2025', label: '2024-2025' },
      ],
      news: [
        { id: 'all-news', label: 'All News' },
        { id: 'announcements', label: 'Announcements' },
        { id: 'media-mentions', label: 'Media Mentions' },
      ],
      events: [
        { id: 'timeline', label: 'Timeline' },
        { id: 'visits', label: 'Visits' },
        { id: 'camps', label: 'Camps' },
        { id: 'events', label: 'Events' },
      ],
      contact: [
        { id: 'info', label: 'Contact Info' },
        { id: 'social', label: 'Social Media' },
      ],
    };
    return sections[tab] ?? sections['timeline'];
  });

  /** Active side tab (first item by default) */
  private readonly _activeSideTab = signal<string>('');
  protected readonly activeSideTab = computed(() => {
    const current = this._activeSideTab();
    const items = this.sideTabItems();
    if (current && items.some((i) => i.id === current)) return current;
    return items[0]?.id ?? '';
  });

  protected onSectionNavChange(event: SectionNavChangeEvent): void {
    this._activeSideTab.set(event.id);
  }

  /** Handle sport profile switching */
  protected onSportSwitch(index: number): void {
    this.profile.setActiveSportIndex(index);
    this.logger.debug('Sport profile switched', { index, sport: this.profile.activeSport()?.name });
  }

  /**
   * Map sport icon key to a valid IconName.
   * Falls back to 'football' for unrecognized icon keys.
   */
  protected getSportIcon(iconKey: string): IconName {
    const iconMap: Record<string, IconName> = {
      'american-football': 'football',
      football: 'football',
      basketball: 'basketball',
      soccer: 'soccer',
      baseball: 'baseball',
      track: 'bolt',
      tennis: 'tennis',
      volleyball: 'football',
      lacrosse: 'football',
      swimming: 'swimming',
      golf: 'golf',
      hockey: 'football',
      wrestling: 'barbell',
      softball: 'baseball',
    };
    return iconMap[iconKey] ?? 'football';
  }

  // Active stat category index for stats tab pill switcher
  private readonly _activeStatCategoryIdx = signal(0);
  protected readonly activeStatCategoryIdx = computed(() => this._activeStatCategoryIdx());
  protected readonly activeStatCategory = computed(() => {
    const cats = this.profile.athleticStats();
    const idx = this._activeStatCategoryIdx();
    return cats[idx] ?? cats[0] ?? null;
  });

  protected readonly statsComparisonItems = computed<readonly StatsComparisonItem[]>(() => {
    const category = this.activeStatCategory();
    if (!category?.stats?.length) return [];

    const comparisonSource = category.stats.slice(0, 4);
    const parsedValues = comparisonSource.map((stat) => this.parseNumericStatValue(stat.value));
    const maxValue = Math.max(...parsedValues.filter((value) => value > 0), 1);

    return comparisonSource.map((stat, index) => {
      const playerNumeric = Math.max(0, this.parseNumericStatValue(stat.value));
      const averageNumeric = Math.max(
        0,
        this.resolveComparisonAverage(stat, playerNumeric, maxValue, index, comparisonSource.length)
      );

      return {
        label: stat.label,
        playerDisplay: `${stat.value}${stat.unit ?? ''}`,
        averageDisplay: this.formatComparisonAverage(stat, averageNumeric),
        playerPercent: this.toBarPercent(playerNumeric, maxValue),
        averagePercent: this.toBarPercent(averageNumeric, maxValue),
      };
    });
  });

  protected onStatCategoryChange(idx: number): void {
    this._activeStatCategoryIdx.set(idx);
  }

  private parseNumericStatValue(raw: string | number | null | undefined): number {
    if (typeof raw === 'number') {
      return Number.isFinite(raw) ? raw : 0;
    }

    if (typeof raw !== 'string') return 0;

    const normalized = raw.replace(/,/g, '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private resolveComparisonAverage(
    stat: AthleticStat,
    playerNumeric: number,
    maxValue: number,
    index: number,
    total: number
  ): number {
    const extendedStat = stat as AthleticStat & {
      readonly nationalAverage?: string | number;
      readonly nationalAvg?: string | number;
      readonly average?: string | number;
      readonly avg?: string | number;
      readonly benchmark?: string | number;
    };

    const explicitAverage =
      extendedStat.nationalAverage ??
      extendedStat.nationalAvg ??
      extendedStat.average ??
      extendedStat.avg ??
      extendedStat.benchmark;

    const parsedExplicit = this.parseNumericStatValue(explicitAverage);
    if (parsedExplicit > 0) return parsedExplicit;

    if (playerNumeric <= 0) return 0;

    const rankFactor = total > 1 ? index / (total - 1) : 0;
    const maxRelativeFloor = maxValue * (0.014 + rankFactor * 0.01);
    const valueBased = playerNumeric * 0.02;

    return Math.max(0, Math.min(playerNumeric, Math.max(maxRelativeFloor, valueBased)));
  }

  private formatComparisonAverage(stat: AthleticStat, value: number): string {
    const hasDecimal = stat.value.includes('.');
    const rounded = hasDecimal ? Math.round(value * 10) / 10 : Math.round(value);
    return `${rounded}${stat.unit ?? ''}`;
  }

  private toBarPercent(value: number, maxValue: number): number {
    if (value <= 0 || maxValue <= 0) return 0;
    const rawPercent = (value / maxValue) * 100;
    return Math.max(3, Math.min(100, rawPercent));
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    const unicode = this.profileUnicode();
    const isOwn = this.isOwnProfile();

    if (unicode) {
      this.profile.loadProfile(unicode, isOwn);
    } else {
      this.profile.loadProfile('me', true);
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onTabChange(event: OptionScrollerChangeEvent): void {
    const tabId = event.option.id as ProfileTabId;
    this.profile.setActiveTab(tabId);
    this.tabChange.emit(tabId);
  }

  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      await this.profile.refresh();
    } finally {
      event.complete();
    }
  }

  protected handleRefreshTimeout(): void {
    this.toast.error('Refresh timed out. Please try again.');
  }

  protected onRetry(): void {
    const unicode = this.profileUnicode();
    if (unicode) {
      this.profile.loadProfile(unicode, this.isOwnProfile());
    } else {
      this.profile.loadProfile('me', true);
    }
  }

  // Header actions
  protected onFollowToggle(): void {
    this.profile.toggleFollow();
  }

  protected onFollowersClick(): void {
    this.logger.debug('Followers click');
  }

  protected onFollowingClick(): void {
    this.logger.debug('Following click');
  }

  protected onEditProfile(): void {
    this.editProfileClick.emit();
  }

  protected onEditTeam(): void {
    this.editTeamClick.emit();
  }

  protected onEditBanner(): void {
    this.logger.debug('Edit banner');
  }

  protected onEditAvatar(): void {
    this.logger.debug('Edit avatar');
  }

  protected onMessageClick(): void {
    this.logger.debug('Message click');
  }

  protected onPinnedVideoClick(): void {
    this.logger.debug('Pinned video click');
  }

  protected onPinVideoClick(): void {
    this.logger.debug('Pin video click');
  }

  protected onStatClick(key: string): void {
    this.logger.debug('Stat click', { key });
  }

  // Post actions
  protected onPostClick(post: { id: string }): void {
    this.logger.debug('Post click', { postId: post.id });
  }

  // News article actions
  protected onNewsArticleClick(article: NewsArticle): void {
    this.logger.debug('News article click', { articleId: article.id, title: article.title });
  }

  protected onNewsBookmarkToggle(article: NewsArticle): void {
    this.logger.debug('News bookmark toggle', {
      articleId: article.id,
      bookmarked: article.isBookmarked,
    });
  }

  protected onLikePost(post: { id: string }): void {
    this.logger.debug('Like post', { postId: post.id });
  }

  protected onCommentPost(post: { id: string }): void {
    this.logger.debug('Comment post', { postId: post.id });
  }

  protected onSharePost(post: { id: string }): void {
    this.logger.debug('Share post', { postId: post.id });
  }

  protected onPostMenu(post: { id: string }): void {
    this.logger.debug('Post menu', { postId: post.id });
  }

  protected onLoadMore(): void {
    this.profile.loadMorePosts();
  }

  protected onCreatePost(): void {
    this.createPostClick.emit();
  }

  protected onUploadVideo(): void {
    this.logger.debug('Upload video');
  }

  // Offers
  protected onOfferClick(offer: ProfileOffer): void {
    this.logger.debug('Offer click', { offerId: offer.id });
  }

  protected onAddOffer(): void {
    this.logger.debug('Add offer');
  }

  // Stats
  protected onAddStats(): void {
    this.logger.debug('Add stats');
  }

  // Events
  protected onEventClick(event: ProfileEvent): void {
    this.logger.debug('Event click', { eventId: event.id });
  }

  protected onAddEvent(): void {
    this.logger.debug('Add event');
  }

  // Contact
  protected onEditContact(): void {
    this.logger.debug('Edit contact');
  }

  /**
   * Handle menu click — emits output for the web wrapper to handle.
   * (Web app does not use Ionic, so the bottom sheet service is not available.)
   */
  protected onMenuClick(): void {
    this.menuClick.emit();
  }

  // ============================================
  // HELPERS
  // ============================================

  protected formatEventMonth(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short' });
  }

  protected formatEventDay(dateString: string): string {
    return new Date(dateString).getDate().toString();
  }

  protected isPastEvent(event: ProfileEvent): boolean {
    return new Date(event.startDate) <= new Date();
  }

  /**
   * Pre-computed schedule rows — resolved once per signal change.
   * Eliminates redundant per-row method calls in template.
   */
  protected readonly scheduleEvents = computed(() => {
    const sorted = [...this.profile.events()].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    const gameSchedule = sorted.filter(
      (event) => event.type === 'game' || event.type === 'practice'
    );
    return gameSchedule.length > 0 ? gameSchedule : sorted;
  });

  protected readonly scheduleRows = computed(() => {
    const events = this.scheduleEvents();
    const user = this.profile.user();
    const ownTeamName = user?.school?.name?.trim() || user?.displayName?.trim() || 'Team';
    const ownTeamLogo = user?.school?.logoUrl || user?.teamAffiliations?.[0]?.logoUrl;
    const now = Date.now();

    return events.map((event) => {
      const matchup = this.resolveMatchup(event, ownTeamName, ownTeamLogo);
      const isPast = new Date(event.startDate).getTime() <= now;

      return {
        event,
        isPast,
        month: this.formatEventMonth(event.startDate),
        day: this.formatEventDay(event.startDate),
        homeTeam: matchup.homeTeam,
        awayTeam: matchup.awayTeam,
        homeLogo: matchup.homeLogo,
        awayLogo: matchup.awayLogo,
        location: event.location || 'Location TBA',
        time: this.resolveTime(event),
        statusLabel: isPast ? 'Completed' : 'Upcoming',
        statusValue: event.result?.trim() || (isPast ? 'No score reported' : 'Scheduled'),
      };
    });
  });

  // ── Schedule helpers (private, called only from computed) ──

  private resolveMatchup(
    event: ProfileEvent,
    ownTeamName: string,
    ownTeamLogo: string | undefined
  ): { homeTeam: string; awayTeam: string; homeLogo?: string; awayLogo?: string } {
    const opponentName = this.resolveOpponent(event, ownTeamName);
    const isHome = this.isHomeEvent(event.name, ownTeamName);

    return isHome
      ? {
          homeTeam: ownTeamName,
          awayTeam: opponentName,
          homeLogo: ownTeamLogo,
          awayLogo: event.logoUrl,
        }
      : {
          homeTeam: opponentName,
          awayTeam: ownTeamName,
          homeLogo: event.logoUrl,
          awayLogo: ownTeamLogo,
        };
  }

  private resolveOpponent(event: ProfileEvent, ownTeamName: string): string {
    if (event.opponent?.trim()) return event.opponent.trim();

    const parsed = this.parseMatchupTeams(event.name, ownTeamName);
    return parsed ?? 'Opponent';
  }

  private resolveTime(event: ProfileEvent): string {
    if (event.isAllDay) return 'All day';
    const d = new Date(event.startDate);
    if (Number.isNaN(d.getTime())) return 'Time TBA';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  private isHomeEvent(eventName: string, ownTeamName: string): boolean {
    const name = eventName.toLowerCase();
    if (name.includes(' @ ')) return !name.startsWith(ownTeamName.toLowerCase());
    return true;
  }

  private parseMatchupTeams(eventName: string, ownTeamName: string): string | undefined {
    const cleaned = eventName.trim();
    if (!cleaned) return undefined;

    const separator = cleaned.includes(' vs ')
      ? /\s+vs\.?\s+/i
      : cleaned.includes(' @ ')
        ? /\s+@\s+/i
        : null;
    if (!separator) return undefined;

    const [left, right] = cleaned.split(separator);
    if (!left?.trim() || !right?.trim()) return undefined;

    const leftTeam = left.trim();
    const rightTeam = right.trim();
    const own = ownTeamName.toLowerCase();

    if (leftTeam.toLowerCase() === own) return rightTeam;
    if (rightTeam.toLowerCase() === own) return leftTeam;
    return rightTeam;
  }

  protected readonly traitCategoryLabel = computed(() => {
    const cat = this.profile.playerCard()?.trait?.category;
    if (cat === 'x-factor') return 'X-Factor';
    if (cat === 'hidden') return 'Agent';
    return 'Superstar';
  });

  protected readonly teamAffiliations = computed((): ReadonlyArray<ProfileTeamAffiliation> => {
    const user = this.profile.user();
    if (!user) return [];

    const normalized: ProfileTeamAffiliation[] = [];
    const seen = new Set<string>();

    const pushAffiliation = (affiliation: ProfileTeamAffiliation): void => {
      const name = affiliation.name.trim();
      if (!name) return;

      const type = this.normalizeTeamType(affiliation.type);
      const key = `${name.toLowerCase()}::${type}`;
      if (seen.has(key)) return;

      seen.add(key);
      normalized.push({
        name,
        type,
        logoUrl: affiliation.logoUrl,
        teamCode: affiliation.teamCode,
        location: affiliation.location,
      });
    };

    for (const affiliation of user.teamAffiliations ?? []) {
      pushAffiliation(affiliation);
    }

    if (user.school?.name) {
      pushAffiliation({
        name: user.school.name,
        type: this.normalizeTeamType(user.school.type) || 'high-school',
        logoUrl: user.school.logoUrl,
        teamCode: user.school.teamCode,
        location: user.school.location,
      });
    }

    if (user.collegeTeamName && user.collegeTeamName !== user.school?.name) {
      pushAffiliation({
        name: user.collegeTeamName,
        type: 'college',
      });
    }

    return normalized.slice(0, 2);
  });

  protected readonly playerHistoryAffiliations = computed(
    (): ReadonlyArray<ProfileTeamAffiliation> => {
      const user = this.profile.user();
      if (!user) return [];

      const normalized: ProfileTeamAffiliation[] = [];
      const seen = new Set<string>();

      const pushAffiliation = (affiliation: ProfileTeamAffiliation): void => {
        const name = affiliation.name.trim();
        if (!name) return;

        const type = this.normalizeTeamType(affiliation.type);
        const key = `${name.toLowerCase()}::${type}`;
        if (seen.has(key)) return;

        seen.add(key);
        normalized.push({
          name,
          type,
          logoUrl: affiliation.logoUrl,
          teamCode: affiliation.teamCode,
          location: affiliation.location,
          seasonRecord: affiliation.seasonRecord,
          wins: affiliation.wins,
          losses: affiliation.losses,
          ties: affiliation.ties,
        });
      };

      for (const affiliation of user.teamAffiliations ?? []) {
        pushAffiliation(affiliation);
      }

      if (user.school?.name) {
        pushAffiliation({
          name: user.school.name,
          type: this.normalizeTeamType(user.school.type) || 'high-school',
          logoUrl: user.school.logoUrl,
          teamCode: user.school.teamCode,
          location: user.school.location,
          seasonRecord: user.school.seasonRecord,
          wins: user.school.wins,
          losses: user.school.losses,
          ties: user.school.ties,
        });
      }

      if (user.collegeTeamName && user.collegeTeamName !== user.school?.name) {
        pushAffiliation({
          name: user.collegeTeamName,
          type: 'college',
        });
      }

      return normalized;
    }
  );

  protected teamTypeLabel(type?: ProfileTeamType): string {
    const normalized = this.normalizeTeamType(type);
    return TEAM_TYPE_LABELS[normalized];
  }

  protected teamIconName(type?: ProfileTeamType): IconName {
    const normalized = this.normalizeTeamType(type);
    return TEAM_TYPE_ICONS[normalized];
  }

  protected historySeasonLabel(index: number): string {
    const classYearValue = Number(this.profile.user()?.classYear ?? 0);
    const hasClassYear = Number.isFinite(classYearValue) && classYearValue > 1900;

    if (!hasClassYear) {
      if (index === 0) return 'Current';
      return `Prior ${index}`;
    }

    const endYear = classYearValue - index;
    const startYear = endYear - 1;
    return `${startYear}-${endYear}`;
  }

  protected historyTeamRecord(team: ProfileTeamAffiliation): string | null {
    const directRecord = team.seasonRecord?.trim();
    if (directRecord) return directRecord;

    const wins = this.parseRecordNumber(team.wins);
    const losses = this.parseRecordNumber(team.losses);
    const ties = this.parseRecordNumber(team.ties);

    if (wins === null || losses === null) return null;
    if (ties === null || ties <= 0) return `${wins}-${losses}`;
    return `${wins}-${losses}-${ties}`;
  }

  private parseRecordNumber(value: number | string | undefined): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return null;
  }

  protected readonly measurablesProviderUrl = computed(() => {
    const explicitUrl = this.profile.user()?.measurablesVerifiedUrl?.trim();
    if (explicitUrl) return this.ensureAbsoluteUrl(explicitUrl);

    const provider = this.profile.user()?.measurablesVerifiedBy?.trim().toLowerCase() ?? '';
    if (!provider) return null;

    if (provider.includes('rivals')) return 'https://www.rivals.com';
    if (provider.includes('hudl')) return 'https://www.hudl.com';
    if (provider.includes('maxpreps')) return 'https://www.maxpreps.com';
    if (provider.includes('247') || provider.includes('247sports')) return 'https://247sports.com';
    if (provider.includes('on3')) return 'https://www.on3.com';

    return null;
  });

  protected readonly measurablesProviderLogoSrc = computed(() => {
    const host = this.providerHost(this.measurablesProviderUrl());
    return `https://logo.clearbit.com/${host}`;
  });

  protected readonly measurablesProviderLogoFallbackSrc = computed(() => {
    const host = this.providerHost(this.measurablesProviderUrl());
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  });

  protected readonly lastSyncedLabel = computed(() => {
    const updatedAt = this.profile.user()?.updatedAt;
    if (!updatedAt) return 'Never synced';

    const parsed = new Date(updatedAt);
    if (Number.isNaN(parsed.getTime())) return 'Never synced';

    return this.formatRelativeTime(parsed);
  });

  protected readonly statsVerifiedByUrl = 'https://www.maxpreps.com';
  protected readonly statsVerifiedLogoSrc = 'https://logo.clearbit.com/maxpreps.com';
  protected readonly statsVerifiedLogoFallbackSrc =
    'https://www.google.com/s2/favicons?domain=maxpreps.com&sz=64';

  // ============================================
  // SHARED VERIFICATION BANNER — Per-tab/section provider config
  // ============================================

  /**
   * Static provider definitions keyed by name.
   * Each entry holds the display name, URL, and logo sources.
   */
  private static readonly VERIFICATION_PROVIDERS: Readonly<
    Record<
      string,
      { readonly url: string; readonly logoSrc: string; readonly fallbackLogoSrc: string }
    >
  > = {
    maxpreps: {
      url: 'https://www.maxpreps.com',
      logoSrc: 'https://logo.clearbit.com/maxpreps.com',
      fallbackLogoSrc: 'https://www.google.com/s2/favicons?domain=maxpreps.com&sz=64',
    },
    rivals: {
      url: 'https://www.rivals.com',
      logoSrc: 'https://logo.clearbit.com/rivals.com',
      fallbackLogoSrc: 'https://www.google.com/s2/favicons?domain=rivals.com&sz=64',
    },
    twitter: {
      url: 'https://x.com',
      logoSrc: 'https://logo.clearbit.com/x.com',
      fallbackLogoSrc: 'https://www.google.com/s2/favicons?domain=x.com&sz=64',
    },
    transcript: {
      url: '',
      logoSrc: '',
      fallbackLogoSrc: '',
    },
  };

  /**
   * Mapping of tab (+ optional side-tab for overview) → provider key.
   * If a tab is not listed the banner is hidden.
   */
  private static readonly TAB_VERIFICATION_MAP: Readonly<
    Record<string, string | Readonly<Record<string, string>>>
  > = {
    overview: {
      'player-history': 'rivals',
      academic: 'transcript',
      contact: 'twitter',
    },
    offers: 'rivals',
    stats: 'maxpreps',
    schedule: 'maxpreps',
  };

  /**
   * Resolves the active provider key for the current tab + side-tab.
   * Returns null when the banner should be hidden.
   */
  private readonly _activeProviderKey = computed<string | null>(() => {
    const tab = this.profile.activeTab();
    const entry = ProfileShellWebComponent.TAB_VERIFICATION_MAP[tab];
    if (!entry) return null;

    if (typeof entry === 'string') return entry;

    // Overview sub-sections
    const sideTab = this.activeSideTab();
    return (entry as Readonly<Record<string, string>>)[sideTab] ?? null;
  });

  /** Whether the verification banner is visible for this tab/section. */
  protected readonly showVerificationBanner = computed(() => {
    if (this.profile.activeTab() === 'offers' && this.activeSideTab() === 'rankings') {
      return false;
    }

    return this._activeProviderKey() !== null;
  });

  /** Display label for the active provider (e.g. "MaxPreps", "Rivals"). */
  protected readonly verificationProvider = computed<string | null>(() => {
    const key = this._activeProviderKey();
    if (!key) return null;
    // Capitalise first letter for display
    return key.charAt(0).toUpperCase() + key.slice(1);
  });

  /** Whether the current section's provider is "verified" (always true when banner is shown). */
  protected readonly isProfileVerified = computed(() => this._activeProviderKey() !== null);

  /** Resolved URL for the current tab's verification provider. */
  protected readonly verificationProviderUrl = computed<string | null>(() => {
    const key = this._activeProviderKey();
    if (!key) return null;
    const provider = ProfileShellWebComponent.VERIFICATION_PROVIDERS[key];
    return provider?.url || null;
  });

  /** Clearbit logo URL for the current tab's verification provider. */
  protected readonly verificationProviderLogoSrc = computed<string | null>(() => {
    const key = this._activeProviderKey();
    if (!key) return null;
    const provider = ProfileShellWebComponent.VERIFICATION_PROVIDERS[key];
    return provider?.logoSrc || null;
  });

  /** Google favicon fallback logo URL. */
  protected readonly verificationProviderLogoFallbackSrc = computed<string | null>(() => {
    const key = this._activeProviderKey();
    if (!key) return null;
    const provider = ProfileShellWebComponent.VERIFICATION_PROVIDERS[key];
    return provider?.fallbackLogoSrc || null;
  });

  protected onProviderLogoError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;

    if (img.dataset['fallbackApplied'] === 'true') {
      img.src = 'https://www.google.com/s2/favicons?domain=nxt1sports.com&sz=64';
      return;
    }

    img.dataset['fallbackApplied'] = 'true';
    img.src = this.measurablesProviderLogoFallbackSrc();
  }

  protected onStatsProviderLogoError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;

    if (img.dataset['fallbackApplied'] === 'true') {
      img.src = 'https://www.google.com/s2/favicons?domain=nxt1sports.com&sz=64';
      return;
    }

    img.dataset['fallbackApplied'] = 'true';
    img.src = this.statsVerifiedLogoFallbackSrc;
  }

  protected onVerificationBannerLogoError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;

    if (img.dataset['fallbackApplied'] === 'true') {
      img.src = 'https://www.google.com/s2/favicons?domain=nxt1sports.com&sz=64';
      return;
    }

    img.dataset['fallbackApplied'] = 'true';
    const fallback = this.verificationProviderLogoFallbackSrc();
    if (fallback) {
      img.src = fallback;
    } else {
      img.src = 'https://www.google.com/s2/favicons?domain=nxt1sports.com&sz=64';
    }
  }

  protected async onSyncNow(): Promise<void> {
    try {
      await this.profile.refresh();
      this.toast.success('Profile synced with Agent X');
    } catch {
      this.toast.error('Sync failed. Please try again.');
    }
  }

  protected archetypeIconName(name: string, fallbackIcon?: string | null): IconName {
    const normalizedName = name.trim().toLowerCase();
    const mappedIcon = ARCHETYPE_TOKEN_ICONS[normalizedName];
    if (mappedIcon) return mappedIcon;

    if (fallbackIcon && fallbackIcon in ICONS) {
      return fallbackIcon as IconName;
    }

    return 'sparkles';
  }

  private ensureAbsoluteUrl(rawUrl: string): string {
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
    return `https://${rawUrl}`;
  }

  private providerHost(url: string | null): string {
    if (!url) return 'rivals.com';

    try {
      const parsed = new URL(url);
      return parsed.hostname || 'rivals.com';
    } catch {
      return 'rivals.com';
    }
  }

  private formatRelativeTime(date: Date): string {
    const now = Date.now();
    const diffMs = now - date.getTime();

    if (diffMs < 60_000) return 'Just now';

    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    const minutes = Math.round(diffMs / 60_000);
    if (minutes < 60) return rtf.format(-minutes, 'minute');

    const hours = Math.round(diffMs / 3_600_000);
    if (hours < 24) return rtf.format(-hours, 'hour');

    const days = Math.round(diffMs / 86_400_000);
    if (days < 30) return rtf.format(-days, 'day');

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  private normalizeTeamType(type?: string): ProfileTeamType {
    if (!type) return 'other';

    const normalized = type.trim().toLowerCase();

    if (normalized === 'high-school' || normalized === 'high school' || normalized === 'hs') {
      return 'high-school';
    }
    if (normalized === 'middle-school' || normalized === 'middle school' || normalized === 'ms') {
      return 'middle-school';
    }
    if (normalized === 'club') return 'club';
    if (normalized === 'juco' || normalized === 'junior college') return 'juco';
    if (normalized === 'college') return 'college';
    if (normalized === 'academy') return 'academy';
    if (normalized === 'travel' || normalized === 'travel-team' || normalized === 'travel team') {
      return 'travel';
    }

    return 'other';
  }

  // ============================================
  // CONNECTED ACCOUNTS
  // ============================================

  /** Builds a list of connected social/sport accounts from user.social */
  protected readonly connectedAccountsList = computed(
    (): ReadonlyArray<{
      readonly key: string;
      readonly label: string;
      readonly handle: string;
      readonly icon: string;
      readonly color: string;
      readonly url: string;
    }> => {
      const social = this.profile.user()?.social;
      if (!social) return [];

      const ACCOUNT_DEFS: ReadonlyArray<{
        key: keyof typeof social;
        label: string;
        icon: string;
        color: string;
        urlPrefix: string;
        handlePrefix?: string;
      }> = [
        {
          key: 'twitter',
          label: 'X',
          icon: 'twitter',
          color: '#ffffff',
          urlPrefix: 'https://x.com/',
          handlePrefix: '@',
        },
        {
          key: 'instagram',
          label: 'Instagram',
          icon: 'instagram',
          color: '#E1306C',
          urlPrefix: 'https://instagram.com/',
          handlePrefix: '@',
        },
        {
          key: 'youtube',
          label: 'YouTube',
          icon: 'youtube',
          color: '#FF0000',
          urlPrefix: 'https://youtube.com/@',
          handlePrefix: '',
        },
        {
          key: 'hudl',
          label: 'Hudl',
          icon: 'videocam-outline',
          color: '#FF6B00',
          urlPrefix: 'https://hudl.com/profile/',
          handlePrefix: '',
        },
        {
          key: 'maxpreps',
          label: 'MaxPreps',
          icon: 'stats-chart-outline',
          color: '#0033A0',
          urlPrefix: 'https://maxpreps.com/athlete/',
          handlePrefix: '',
        },
        {
          key: 'on3',
          label: 'On3',
          icon: 'link-outline',
          color: '#00C853',
          urlPrefix: 'https://on3.com/db/',
          handlePrefix: '',
        },
        {
          key: 'rivals',
          label: 'Rivals',
          icon: 'link-outline',
          color: '#F57C00',
          urlPrefix: 'https://rivals.com/',
          handlePrefix: '',
        },
        {
          key: 'espn',
          label: 'ESPN',
          icon: 'link-outline',
          color: '#D00000',
          urlPrefix: 'https://espn.com/',
          handlePrefix: '',
        },
      ];

      const result: Array<{
        key: string;
        label: string;
        handle: string;
        icon: string;
        color: string;
        url: string;
      }> = [];

      for (const def of ACCOUNT_DEFS) {
        const value = social[def.key];
        if (!value || (typeof value === 'string' && !value.trim())) continue;
        const raw = String(value).trim();
        result.push({
          key: def.key,
          label: def.label,
          handle: def.handlePrefix ? `${def.handlePrefix}${raw}` : raw,
          icon: def.icon,
          color: def.color,
          url: raw.startsWith('http') ? raw : `${def.urlPrefix}${raw}`,
        });
        if (result.length >= 8) break;
      }

      return result;
    }
  );
}
