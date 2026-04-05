/**
 * @fileoverview Team Profile Shell Component - Web (Tailwind SSR)
 * @module @nxt1/ui/team-profile/web
 * @version 2.0.0
 *
 * Web-optimized Team Profile Shell — thin composition layer.
 * All tab content is extracted into dedicated components.
 * 100% SSR-safe with semantic HTML for Grade A+ SEO.
 *
 * ⭐ WEB ONLY - Pure Tailwind, Zero Ionic, SSR-optimized ⭐
 *
 * Mirrors the ProfileShellWebComponent architecture exactly:
 * Shell handles layout (split, halftone, right panel),
 * while child components own their section content & styles.
 *
 * Design: Madden Franchise Mode split layout (left: content, right: team branding)
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
  AfterViewInit,
  OnDestroy,
  PLATFORM_ID,
  viewChild,
  type TemplateRef,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  type TeamProfileTabId,
  type TeamProfileTab,
  type TeamProfilePost,
  type TeamProfileRosterMember,
  TEAM_PROFILE_TABS,
  TEAM_PROFILE_EMPTY_STATES,
  type NewsArticle,
  getSeasonForDate,
} from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
// NxtPageHeaderComponent not used — web team profile uses shell top nav on mobile and page header in wide layouts
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
import { NxtHeaderPortalService } from '../../services/header-portal';
import { NxtBottomSheetService, SHEET_PRESETS } from '../../components/bottom-sheet';
import type { BottomSheetAction } from '../../components/bottom-sheet/bottom-sheet.types';
import { TeamProfileService } from '../team-profile.service';

// ─── Extracted Section Components ───
import { TeamMobileHeroComponent } from './team-mobile-hero.component';
import { TeamIntelComponent } from '../../intel/team-intel.component';
import { TeamRosterWebComponent } from './team-roster-web.component';
import { type ScheduleRow } from '@nxt1/core';
import { mapTeamStatsToGameLogs, buildSeasonRecordMap } from '@nxt1/core';
import { TeamTimelineWebComponent } from './team-timeline-web.component';
import { TeamContactWebComponent } from './team-contact-web.component';
import { ProfileVerificationBannerComponent } from '../../profile/components/profile-verification-banner.component';
import { TeamProfileSkeletonComponent } from './team-profile-skeleton.component';

@Component({
  selector: 'nxt1-team-profile-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    NxtIconComponent,
    NxtImageComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    NxtSectionNavWebComponent,
    NxtImageCarouselComponent,
    // Extracted section components
    TeamMobileHeroComponent,
    TeamIntelComponent,
    TeamRosterWebComponent,
    TeamTimelineWebComponent,
    TeamContactWebComponent,
    ProfileVerificationBannerComponent,
    TeamProfileSkeletonComponent,
  ],
  template: `
    <!-- Portal: center — Team name + subtitle teleported into top nav -->
    <ng-template #teamPortalContent>
      <div class="header-portal-team">
        <button
          type="button"
          class="header-portal-back-btn"
          aria-label="Go back"
          (click)="backClick.emit()"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        @if (teamProfile.team()?.logoUrl) {
          <nxt1-image
            class="header-portal-logo"
            [src]="teamProfile.team()!.logoUrl!"
            [alt]="teamProfile.team()!.teamName"
            [width]="32"
            [height]="32"
            variant="avatar"
            fit="contain"
            [showPlaceholder]="false"
          />
        } @else {
          <div class="header-portal-logo-fallback">
            <nxt1-icon name="shield" [size]="16" />
          </div>
        }
        <div class="header-portal-name-block">
          <span class="header-portal-title">{{ portalTeamName() }}</span>
          @if (portalTeamSubtitle()) {
            <span class="header-portal-subtitle">{{ portalTeamSubtitle() }}</span>
          }
        </div>
        @if (teamProfile.canEdit()) {
          <button
            type="button"
            class="header-portal-action-btn"
            (click)="manageTeamClick.emit()"
            aria-label="Manage team"
          >
            <nxt1-icon name="settings" [size]="13" />
            Manage Team
          </button>
        }
      </div>
    </ng-template>

    <!-- Portal: right — Share + QR icon buttons in top nav (before bell) -->
    <ng-template #teamRightPortalContent>
      <button
        type="button"
        class="nav-action-btn"
        aria-label="Share team"
        (click)="shareClick.emit()"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <path d="M16 6l-4-4-4 4" />
          <path d="M12 2v13" />
        </svg>
      </button>
      <button
        type="button"
        class="nav-action-btn"
        aria-label="QR code"
        (click)="qrCodeClick.emit()"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 3h7v7H3V3z" />
          <path d="M14 3h7v7h-7V3z" />
          <path d="M3 14h7v7H3v-7z" />
          <path d="M14 14h3v3h-3v-3z" />
          <path d="M20 14v3h-3" />
          <path d="M14 20h3v1" />
          <path d="M20 20h1v1" />
        </svg>
      </button>
    </ng-template>

    <main class="team-profile-main">
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <!-- Loading Skeleton -->
      @if (teamProfile.isLoading()) {
        <nxt1-team-profile-skeleton />
      }
      <!-- Error State -->
      @else if (teamProfile.error()) {
        <section class="madden-error">
          <div class="madden-error-icon" aria-hidden="true">⚠️</div>
          <h2 class="madden-error-title">Failed to load team profile</h2>
          <p class="madden-error-msg">{{ teamProfile.error() }}</p>
          <button type="button" class="madden-error-btn" (click)="onRetry()">Try Again</button>
        </section>
      }
      <!-- Content State -->
      @else if (isContentReady()) {
        <div class="madden-stage" [style.--team-accent]="teamAccentColor()">
          <!-- Background variant: modern clean gradient (default) -->
          @if (bgVariant === 'modern') {
            <div class="stage-modern-bg" aria-hidden="true">
              <div class="stage-modern-base"></div>
              <div class="stage-modern-lanes"></div>
              <div class="stage-modern-glow"></div>
              <div class="stage-modern-vignette"></div>
            </div>
          } @else {
            <!-- Background variant: legacy halftone dots -->
            <div class="stage-halftone-bg" aria-hidden="true">
              <div class="stage-halftone-dots"></div>
              <div class="stage-halftone-fade"></div>
            </div>
          }

          <!-- ═══ SPLIT: LEFT CONTENT | RIGHT TEAM BRANDING ═══ -->
          <div class="madden-split">
            <!-- LEFT SIDE: Header + Tabs + Content -->
            <div class="madden-split-left">
              <!-- Mobile Hero (extracted component) -->
              @if (teamProfile.team()) {
                <div class="md:hidden">
                  <nxt1-team-mobile-hero (back)="backClick.emit()" />
                </div>
              }

              <!-- TOP TAB BAR -->
              <nav class="madden-top-tabs" aria-label="Team profile sections">
                <nxt1-option-scroller
                  [options]="tabOptions()"
                  [selectedId]="teamProfile.activeTab()"
                  [config]="{ scrollable: false, stretchToFill: true, showDivider: false }"
                  (selectionChange)="onTabChange($event)"
                />
              </nav>

              <!-- Content Area: Side tabs + scrollable content -->
              <div class="madden-content-layer">
                <!-- LEFT SIDE NAV COLUMN -->
                <div class="madden-side-nav-column">
                  <nxt1-section-nav-web
                    [items]="sideTabItems()"
                    [activeId]="activeSideTab()"
                    ariaLabel="Section navigation"
                    (selectionChange)="onSectionNavChange($event)"
                  />
                </div>

                <!-- MAIN CONTENT AREA — Each tab renders its own extracted component -->
                <section class="madden-content-scroll" aria-live="polite">
                  <nxt1-profile-verification-banner
                    [activeTab]="teamProfile.activeTab()"
                    [activeSideTab]="activeSideTab()"
                  />

                  @switch (teamProfile.activeTab()) {
                    @case ('intel') {
                      @if (activeSideTab() === 'contact') {
                        <nxt1-team-contact-web (manageTeam)="manageTeamClick.emit()" />
                      } @else {
                        <nxt1-team-intel
                          [teamId]="teamProfile.team()!.id"
                          [canGenerate]="teamProfile.canEdit()"
                          (missingDataAction)="manageTeamClick.emit()"
                        />
                      }
                    }

                    @case ('timeline') {
                      <nxt1-team-timeline-web
                        [activeSection]="activeSideTab()"
                        (postClick)="onPostClick($event)"
                        (manageTeam)="manageTeamClick.emit()"
                      />
                    }

                    @case ('roster') {
                      <nxt1-team-roster-web
                        [activeSideTab]="activeSideTab()"
                        (memberClick)="onRosterMemberClick($event)"
                        (manageTeam)="manageTeamClick.emit()"
                      />
                    }

                    @case ('connect') {
                      <nxt1-team-contact-web (manageTeam)="manageTeamClick.emit()" />
                    }
                  }
                </section>
              </div>
            </div>

            <!-- RIGHT SIDE: Team image + team info -->
            <div class="madden-split-right">
              <div class="madden-right-stack">
                @if (teamProfile.galleryImages().length > 0) {
                  <div class="carousel-glow-wrap">
                    <div class="carousel-glow-border" aria-hidden="true"></div>
                    <div class="carousel-glow-ambient" aria-hidden="true"></div>
                    <nxt1-image-carousel
                      [images]="teamProfile.galleryImages()"
                      [alt]="teamProfile.team()?.teamName ?? 'Team'"
                      [autoPlay]="true"
                      [autoPlayInterval]="5000"
                      [overlayTitle]="teamProfile.team()?.teamName ?? ''"
                      [overlaySubtitle]="headerSubtitle()"
                      class="madden-team-carousel"
                    />
                    @if (teamProfile.team()?.verificationStatus === 'verified') {
                      <span class="carousel-verified-badge">
                        <nxt1-icon name="checkmark-circle" [size]="14" />
                        Verified
                      </span>
                    }
                  </div>
                } @else if (teamProfile.team()?.logoUrl) {
                  <div class="team-logo-display">
                    <nxt1-image
                      [src]="teamProfile.team()!.logoUrl!"
                      [alt]="teamProfile.team()!.teamName"
                      [width]="160"
                      [height]="160"
                      variant="avatar"
                      fit="contain"
                      [priority]="true"
                      [showPlaceholder]="false"
                    />
                  </div>
                }

                <!-- Organization card (matches /profile team affiliation style) -->
                @if (organizationName()) {
                  <div class="madden-team-stack">
                    <div class="madden-team-block">
                      @if (teamProfile.team()?.logoUrl) {
                        <nxt1-image
                          class="madden-team-logo"
                          [src]="teamProfile.team()!.logoUrl!"
                          [alt]="organizationName()"
                          [width]="44"
                          [height]="44"
                          variant="avatar"
                          fit="contain"
                          [priority]="true"
                          [showPlaceholder]="false"
                        />
                      } @else {
                        <div class="madden-team-logo-placeholder">
                          <nxt1-icon name="business" [size]="22" />
                        </div>
                      }
                      <div class="madden-team-info">
                        <div class="madden-team-headline">
                          <span class="madden-team-name">{{ organizationName() }}</span>
                        </div>
                        @if (teamProfile.team()?.location) {
                          <span class="madden-team-location">{{
                            teamProfile.team()!.location
                          }}</span>
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Projected content (e.g. CTA banner for logged-out users) -->
        <ng-content />
      }
      <!-- Fallback: Show skeleton if no state matches (safety net for SSR hydration) -->
      @else {
        <nxt1-team-profile-skeleton />
      }
    </main>
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════════════════════
         TEAM PROFILE — MADDEN FRANCHISE MODE LAYOUT
         Shell-level layout only. Tab content styles live in
         their respective extracted components.
         ═══════════════════════════════════════════════════════════ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        --m-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --m-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --m-surface-2: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        --m-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --m-text: var(--nxt1-color-text-primary, #ffffff);
        --m-text-2: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --m-text-3: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        --m-accent: var(--team-accent, var(--nxt1-color-primary, #d4ff00));
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .header-action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        padding: 0;
        margin: 0;
        border: none;
        background: transparent;
        border-radius: var(--nxt1-radius-full, 50%);
        color: var(--m-text);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color 0.15s ease,
          transform 0.1s ease;
      }

      .header-action-btn:active {
        background: var(--m-surface-2);
        transform: scale(0.92);
      }

      .team-profile-main {
        background: var(--m-bg);
        height: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        padding-top: 0;
        display: flex;
        flex-direction: column;
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
        min-height: calc(100vh - 64px);
        overflow: hidden;
        flex-shrink: 0;
      }

      /* ─── SPORTY CLEAN BACKGROUND (default variant) ─── */
      .stage-modern-bg {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        overflow: hidden;
      }

      .stage-modern-base {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--m-accent) 8%, rgba(255, 255, 255, 0.01)) 0%,
            rgba(255, 255, 255, 0.01) 16%,
            transparent 44%
          ),
          linear-gradient(
            120deg,
            transparent 0%,
            color-mix(in srgb, var(--m-accent) 4%, transparent) 58%,
            transparent 100%
          );
        opacity: 0.95;
      }

      .stage-modern-lanes {
        position: absolute;
        inset: -12% -8% 10% 34%;
        background: repeating-linear-gradient(
          -62deg,
          transparent 0 22px,
          color-mix(in srgb, var(--m-accent) 18%, transparent) 22px 24px,
          transparent 24px 56px
        );
        clip-path: polygon(16% 0%, 100% 0%, 100% 100%, 0% 100%);
        mask-image: linear-gradient(
          to left,
          rgba(0, 0, 0, 1) 0%,
          rgba(0, 0, 0, 0.82) 18%,
          rgba(0, 0, 0, 0.34) 54%,
          transparent 100%
        );
        -webkit-mask-image: linear-gradient(
          to left,
          rgba(0, 0, 0, 1) 0%,
          rgba(0, 0, 0, 0.82) 18%,
          rgba(0, 0, 0, 0.34) 54%,
          transparent 100%
        );
        opacity: 0.82;
        transform: skewX(-14deg);
        transform-origin: right center;
      }

      .stage-modern-glow {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(
            ellipse 56% 64% at 84% 22%,
            color-mix(in srgb, var(--m-accent) 20%, transparent) 0%,
            color-mix(in srgb, var(--m-accent) 10%, transparent) 36%,
            transparent 74%
          ),
          linear-gradient(
            100deg,
            transparent 16%,
            color-mix(in srgb, var(--m-accent) 7%, transparent) 62%,
            transparent 100%
          );
        opacity: 0.95;
      }

      .stage-modern-vignette {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(
            180deg,
            rgba(6, 8, 12, 0.18) 0%,
            transparent 20%,
            transparent 74%,
            rgba(6, 8, 12, 0.18) 100%
          ),
          linear-gradient(
            90deg,
            rgba(6, 8, 12, 0.08) 0%,
            transparent 24%,
            transparent 72%,
            rgba(6, 8, 12, 0.16) 100%
          );
      }

      /* Respect motion preferences */
      @media (prefers-reduced-motion: reduce) {
        .stage-modern-lanes,
        .stage-modern-glow,
        .stage-modern-vignette {
          opacity: 0.5;
        }
      }

      /* ─── HALFTONE BACKGROUND (legacy variant) ─── */
      .stage-halftone-bg {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        overflow: hidden;
      }
      .stage-halftone-dots {
        position: absolute;
        inset: 0;
        background-image: radial-gradient(
          circle,
          color-mix(in srgb, var(--m-accent) 28%, transparent) 1.2px,
          transparent 1.2px
        );
        background-size: 11px 11px;
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
      }
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
      @media (prefers-reduced-motion: reduce) {
        .stage-halftone-dots,
        .stage-halftone-fade {
          opacity: 0.5;
        }
      }

      /* ─── SPLIT LAYOUT ─── */
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
      /* ─── HEADER PORTAL — Perplexity-style team identity in top nav ─── */
      .header-portal-team {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 0 var(--nxt1-spacing-2, 8px);
      }
      .header-portal-back-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-radius-full, 9999px);
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-primary, #ffffff);
        cursor: pointer;
        transition: all 0.15s ease;
        flex-shrink: 0;
        padding: 0;
      }
      .header-portal-back-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        border-color: rgba(255, 255, 255, 0.14);
      }
      .header-portal-back-btn:active {
        transform: scale(0.95);
      }
      .header-portal-logo {
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-radius-md, 8px);
        flex-shrink: 0;
      }
      .header-portal-logo-fallback {
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-radius-md, 8px);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
      }
      .header-portal-name-block {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 1px;
        flex: 1;
      }
      .header-portal-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 15px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .header-portal-subtitle {
        font-size: 12px;
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .header-portal-action-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        flex-shrink: 0;
        margin-left: auto;
        padding: 6px 14px;
        border-radius: var(--nxt1-radius-md, 8px);
        border: 1.5px solid var(--nxt1-color-border-secondary, rgba(255, 255, 255, 0.2));
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .header-portal-action-btn:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        border-color: var(--nxt1-color-border-primary, rgba(255, 255, 255, 0.35));
      }
      .header-portal-action-btn:active {
        transform: scale(0.97);
      }
      .madden-right-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 300px;
        padding-top: 20px;
        padding-bottom: 12px;
      }

      /* ─── TOP TAB BAR ─── */
      .madden-top-tabs {
        padding: 0 8px;
        padding-left: calc(var(--shell-content-padding-x, 32px) - 4px);
        margin-top: 12px;
        border-bottom: none;
        background: transparent;
        flex-shrink: 0;
      }
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

      /* ─── CONTENT LAYER ─── */
      .madden-content-layer {
        position: relative;
        display: grid;
        grid-template-columns: 180px minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
        gap: var(--nxt1-spacing-6, 24px);
        align-items: stretch;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        padding-top: var(--nxt1-spacing-2, 8px);
        padding-left: calc(var(--shell-content-padding-x, 32px) - 4px);
      }
      .madden-side-nav-column {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        align-self: stretch;
        overflow-y: auto;
        scrollbar-width: none;
        padding-bottom: 120px;
      }
      .madden-side-nav-column::-webkit-scrollbar {
        display: none;
      }
      .madden-side-nav-column nxt1-section-nav-web {
        width: 100%;
      }
      .madden-side-nav-column ::ng-deep .nav-group-header {
        text-transform: none;
        letter-spacing: normal;
      }

      /* ─── CONTENT SCROLL AREA ─── */
      .madden-content-scroll {
        height: 100%;
        min-height: 0;
        min-width: 0;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-gutter: stable both-edges;
        padding: 0 12px 120px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .madden-content-scroll > * {
        width: 100%;
        max-width: 660px;
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
        transition:
          background 100ms ease-out,
          color 100ms ease-out,
          border-color 100ms ease-out;
      }
      .right-action-btn:hover {
        background: var(--m-surface-2);
        color: var(--m-text);
        border-color: var(--m-accent);
      }
      .right-action-btn:active {
        transform: scale(0.97);
      }

      /* ─── CAROUSEL GLOW ─── */
      @property --glow-angle {
        syntax: '<angle>';
        initial-value: 0deg;
        inherits: false;
      }
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
        color: var(--m-accent);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.03em;
        pointer-events: none;
      }
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
      }
      .madden-team-carousel {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
        border-radius: 16px;
        overflow: hidden;
      }
      .madden-team-carousel ::ng-deep .carousel {
        position: relative;
        height: 100%;
        border-radius: 16px;
      }
      .madden-team-carousel ::ng-deep .carousel-track {
        height: 100%;
      }
      .madden-team-carousel ::ng-deep .carousel-slide {
        height: 100%;
      }
      .madden-team-carousel ::ng-deep .carousel-img {
        height: 100%;
        object-position: center top;
      }

      /* ─── TEAM LOGO DISPLAY (fallback for no gallery) ─── */
      .team-logo-display {
        width: 100%;
        display: flex;
        justify-content: center;
        padding: 32px 0;
      }

      /* Organization block below team image (matches profile style) */
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
      .madden-team-location {
        font-size: 12px;
        color: var(--m-text-3);
      }

      /* ═══ RESPONSIVE ═══ */
      @media (max-width: 1024px) {
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
      }
      @media (max-width: 768px) {
        .madden-top-tabs {
          padding-left: 8px;
        }
        :host {
          height: auto;
          overflow-x: hidden;
          overflow-y: visible;
          max-width: 100vw;
        }
        /* Mobile modern background — center glow for portrait */
        .stage-modern-bg {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          z-index: 0;
        }
        .stage-modern-base {
          background:
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--m-accent) 10%, rgba(255, 255, 255, 0.01)) 0%,
              transparent 40%
            ),
            linear-gradient(
              135deg,
              transparent 0%,
              color-mix(in srgb, var(--m-accent) 5%, transparent) 60%,
              transparent 100%
            );
        }
        .stage-modern-lanes {
          inset: -10% -28% 40% -8%;
          clip-path: polygon(0% 0%, 100% 0%, 82% 100%, 0% 100%);
          transform: none;
          background: repeating-linear-gradient(
            -58deg,
            transparent 0 18px,
            color-mix(in srgb, var(--m-accent) 16%, transparent) 18px 20px,
            transparent 20px 42px
          );
          mask-image: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.96) 0%,
            rgba(0, 0, 0, 0.72) 44%,
            transparent 100%
          );
          -webkit-mask-image: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.96) 0%,
            rgba(0, 0, 0, 0.72) 44%,
            transparent 100%
          );
          opacity: 0.76;
        }
        .stage-modern-glow {
          background:
            radial-gradient(
              ellipse 88% 58% at 50% 10%,
              color-mix(in srgb, var(--m-accent) 18%, transparent) 0%,
              color-mix(in srgb, var(--m-accent) 8%, transparent) 40%,
              transparent 76%
            ),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--m-accent) 5%, transparent) 0%,
              transparent 42%
            );
        }
        .stage-modern-vignette {
          background:
            linear-gradient(
              180deg,
              rgba(6, 8, 12, 0.12) 0%,
              transparent 22%,
              transparent 78%,
              rgba(6, 8, 12, 0.18) 100%
            ),
            linear-gradient(
              90deg,
              rgba(6, 8, 12, 0.04) 0%,
              transparent 18%,
              transparent 82%,
              rgba(6, 8, 12, 0.1) 100%
            );
        }
        /* Mobile halftone overrides (legacy variant) */
        .stage-halftone-dots {
          background-image: radial-gradient(
            circle,
            color-mix(in srgb, var(--m-accent) 34%, transparent) 1.05px,
            transparent 0.9px
          );
          background-size: 14px 14px;
          mask-image: radial-gradient(
            ellipse 122% 78% at 50% 10%,
            rgba(0, 0, 0, 0.9) 0%,
            rgba(0, 0, 0, 0.68) 30%,
            rgba(0, 0, 0, 0.36) 56%,
            transparent 80%
          );
          -webkit-mask-image: radial-gradient(
            ellipse 122% 78% at 50% 10%,
            rgba(0, 0, 0, 0.9) 0%,
            rgba(0, 0, 0, 0.68) 30%,
            rgba(0, 0, 0, 0.36) 56%,
            transparent 80%
          );
        }
        .stage-halftone-fade {
          background: radial-gradient(
            ellipse 86% 72% at 50% 8%,
            color-mix(in srgb, var(--m-accent) 26%, transparent) 0%,
            color-mix(in srgb, var(--m-accent) 13%, transparent) 42%,
            transparent 78%
          );
        }
        .team-profile-main {
          height: auto;
          overflow-x: hidden;
          overflow-y: visible;
          display: block;
          max-width: 100%;
        }
        .madden-stage {
          height: auto;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: visible;
          flex-shrink: 1;
        }
        .stage-halftone-bg {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          z-index: 0;
        }
        .madden-split {
          height: auto;
          align-items: flex-start;
        }
        .madden-split-left {
          flex: 1;
          min-width: 0;
          max-width: 100%;
          overflow-x: hidden;
          overflow-y: visible;
        }
        .madden-content-layer {
          grid-template-columns: minmax(0, 1fr);
          gap: var(--nxt1-spacing-4, 16px);
          padding-top: 12px;
          padding-left: 0;
          min-height: auto;
          overflow-x: hidden;
          overflow-y: visible;
          max-width: 100%;
          width: 100%;
        }
        .madden-side-nav-column {
          display: contents;
          order: 0;
          width: 100%;
          position: static;
          max-height: none;
          padding-bottom: 0;
        }
        .madden-side-nav-column > nxt1-section-nav-web {
          order: 0;
          width: calc(100% - 24px);
          margin-inline: 12px;
        }
        .madden-content-scroll {
          order: 1;
          height: auto;
          min-height: 0;
          width: 100%;
          max-width: 100%;
          max-height: none;
          overflow-y: visible;
          overflow-x: hidden;
          padding: 0 12px 120px;
          align-items: stretch;
          scrollbar-gutter: auto;
          box-sizing: border-box;
        }
        .madden-content-scroll > * {
          max-width: none;
        }
        .madden-split-right {
          display: none;
        }
        .madden-side-nav-column ::ng-deep .section-nav {
          gap: 4px;
          padding-inline: 2px;
          padding-bottom: 10px;
          border-bottom: none;
        }
        .madden-side-nav-column ::ng-deep .nav-item {
          width: auto;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 600;
          font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
          letter-spacing: 0.02em;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          color: var(--m-text-2, rgba(255, 255, 255, 0.55));
        }
        .madden-side-nav-column ::ng-deep .nav-item--active {
          background: color-mix(in srgb, var(--m-accent) 12%, transparent);
          border-color: color-mix(in srgb, var(--m-accent) 35%, transparent);
          color: var(--m-text, #fff);
        }
        .madden-side-nav-column ::ng-deep .nav-group-header {
          display: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamProfileShellWebComponent implements OnInit, AfterViewInit, OnDestroy {
  protected readonly teamProfile = inject(TeamProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('TeamProfileShellWeb');
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly headerPortal = inject(NxtHeaderPortalService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Template refs for portal content
  private readonly teamPortalContent = viewChild<TemplateRef<unknown>>('teamPortalContent');
  private readonly teamRightPortalContent =
    viewChild<TemplateRef<unknown>>('teamRightPortalContent');

  // ============================================
  // INPUTS
  // ============================================

  /** Team slug to load */
  readonly teamSlug = input<string>('');

  /**
   * Firestore document ID of the team.
   * When provided, takes priority over teamSlug to avoid ambiguity
   * when multiple teams share the same name/slug.
   */
  readonly teamId = input<string>('');

  /** Whether the current user is an admin of this team */
  readonly isTeamAdmin = input(false);

  /**
   * When true, skip the internal ngOnInit data fetch.
   * Used by platform wrappers (mobile) that manage their own API calls
   * and push data via TeamProfileService.loadFromExternalData().
   */
  readonly skipInternalLoad = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly backClick = output<void>();
  readonly tabChange = output<TeamProfileTabId>();
  readonly shareClick = output<void>();
  readonly menuClick = output<void>();
  readonly qrCodeClick = output<void>();
  readonly manageTeamClick = output<void>();
  readonly rosterMemberClick = output<TeamProfileRosterMember>();
  readonly postClick = output<TeamProfilePost>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Check if content is ready to render (prevents SSR hydration mismatch) */
  protected readonly isContentReady = computed(() => {
    return (
      !this.teamProfile.isLoading() &&
      !this.teamProfile.error() &&
      !!this.teamProfile.team()?.teamName
    );
  });

  /**
   * Maps TeamProfileScheduleEvent[] → ScheduleRow[] for the shared schedule board.
   * Filters by active season side tab (season-YYYY-YYYY).
   */
  protected readonly teamScheduleRows = computed<ScheduleRow[]>(() => {
    const sideTab = this.activeSideTab();
    const seasonLabel = sideTab.startsWith('season-') ? sideTab.replace('season-', '') : undefined;
    const teamName = this.teamProfile.team()?.teamName ?? 'Team';
    const teamLogo = this.teamProfile.team()?.logoUrl;
    const now = Date.now();

    const events = this.teamProfile.schedule().filter((event) => {
      if (!seasonLabel) return true;
      return getSeasonForDate(event.date) === seasonLabel;
    });

    return events.map((event) => {
      const eventDate = new Date(event.date);
      const isPast = event.status === 'final' || eventDate.getTime() <= now;
      const homeTeam = event.isHome ? teamName : (event.opponent ?? 'Opponent');
      const awayTeam = event.isHome ? (event.opponent ?? 'Opponent') : teamName;
      const homeLogo = event.isHome ? teamLogo : event.opponentLogoUrl;
      const awayLogo = event.isHome ? event.opponentLogoUrl : teamLogo;

      let statusLabel: string;
      let statusValue: string;
      if (event.status === 'final' && event.result) {
        statusLabel =
          event.result.outcome === 'win' ? 'Win' : event.result.outcome === 'loss' ? 'Loss' : 'Tie';
        statusValue = `${event.result.teamScore}-${event.result.opponentScore}`;
      } else if (event.status === 'live') {
        statusLabel = 'Live';
        statusValue = 'In Progress';
      } else if (event.status === 'postponed') {
        statusLabel = 'Postponed';
        statusValue = '';
      } else if (event.status === 'cancelled') {
        statusLabel = 'Cancelled';
        statusValue = '';
      } else {
        statusLabel = isPast ? 'Completed' : 'Upcoming';
        statusValue = isPast ? 'No score reported' : 'Scheduled';
      }

      return {
        id: event.id,
        isPast,
        month: eventDate.toLocaleDateString('en-US', { month: 'short' }),
        day: eventDate.getDate().toString(),
        homeTeam,
        awayTeam,
        homeLogo,
        awayLogo,
        location: event.location ?? 'Location TBA',
        time: event.time ?? 'Time TBA',
        statusLabel,
        statusValue,
      } satisfies ScheduleRow;
    });
  });

  /**
   * Per-season record map built from current record + season history.
   * Used by the mapper and sidebar to display the correct W-L for each season.
   */
  private readonly seasonRecordMap = computed(() => {
    const team = this.teamProfile.team();
    return buildSeasonRecordMap(team?.record, team?.seasonHistory);
  });

  /**
   * Maps TeamProfileStatsCategory[] → ProfileSeasonGameLog[] for the shared stats dashboard.
   */
  protected readonly teamStatsAsGameLogs = computed(() =>
    mapTeamStatsToGameLogs(this.teamProfile.stats(), this.seasonRecordMap())
  );

  /**
   * News board items sourced from the News collection (type==='team' documents).
   * Sorted newest-first. The news-board component accepts NewsArticle[] directly.
   */
  protected readonly teamNewsBoardItems = computed((): readonly NewsArticle[] =>
    [...this.teamProfile.newsArticles()].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
  );

  /** Portal: cleaned team name for the top nav header */
  protected readonly portalTeamName = computed(() => {
    const team = this.teamProfile.team();
    if (!team) return '';
    const teamName = team.teamName?.trim() ?? '';
    if (!teamName) return '';
    const sport = team.sport?.trim();
    const withoutHighSchool = teamName.replace(/\bhigh\s+school\b/gi, '').trim();
    const withoutSport = sport
      ? withoutHighSchool
          .replace(new RegExp(`\\b${sport.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi'), '')
          .trim()
      : withoutHighSchool;
    const baseName = withoutSport.replace(/\s{2,}/g, ' ').trim();
    const cleanName = baseName || teamName;
    const mascot = team.branding?.mascot?.trim();
    if (!mascot) return cleanName;
    if (cleanName.toLowerCase().endsWith(mascot.toLowerCase())) return cleanName;
    return `${cleanName} ${mascot}`;
  });

  /** Portal: team type + sport subtitle for top nav header */
  protected readonly portalTeamSubtitle = computed(() => {
    const team = this.teamProfile.team();
    if (!team) return '';
    const typeLabel = team.teamType
      ? team.teamType
          .split('-')
          .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' ')
      : '';
    const sportLabel = team.sport?.trim() ?? '';
    return `${typeLabel} ${sportLabel}`.trim();
  });

  /** Header subtitle: sport · location · conference · record */
  protected readonly headerSubtitle = computed(() => {
    const team = this.teamProfile.team();
    if (!team) return '';
    const parts: string[] = [];
    if (team.sport) parts.push(team.sport);
    if (team.location) parts.push(team.location);
    if (team.conference) parts.push(team.conference);
    const record = this.teamProfile.recordDisplay();
    if (record) parts.push(record);
    return parts.join(' · ');
  });

  /**
   * Background variant toggle.
   * - 'modern'   — clean team-color gradient (current default)
   * - 'halftone' — legacy recruiting-card halftone dots
   */
  protected readonly bgVariant: 'modern' | 'halftone' = 'modern';

  /** Team accent color from branding */
  protected readonly teamAccentColor = computed(() => {
    const branding = this.teamProfile.team()?.branding;
    return branding?.primaryColor ?? 'var(--nxt1-color-primary, #d4ff00)';
  });

  /** Organization name for the team (school/club/program) shown in right panel. */
  protected readonly organizationName = computed(() => {
    const team = this.teamProfile.team();
    if (!team) return '';

    const rawName = team.teamName?.trim() ?? '';
    if (!rawName) return '';

    const sport = team.sport?.trim();
    const mascot = team.branding?.mascot?.trim();

    let orgName = rawName;
    if (sport) {
      orgName = orgName
        .replace(new RegExp(`\\b${sport.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi'), '')
        .trim();
    }
    if (mascot) {
      orgName = orgName
        .replace(new RegExp(`\\b${mascot.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi'), '')
        .trim();
    }

    orgName = orgName.replace(/\s{2,}/g, ' ').trim();
    return orgName || rawName;
  });

  /** Tab options for the top bar scroller */
  protected readonly tabOptions = computed((): OptionScrollerItem[] => {
    const badges = this.teamProfile.tabBadges();

    return TEAM_PROFILE_TABS.map((tab: TeamProfileTab) => ({
      id: tab.id,
      label: tab.label,
      badge: badges[tab.id as keyof typeof badges] || undefined,
    }));
  });

  /** Empty state for current tab */
  protected readonly emptyState = computed(() => {
    const tab = this.teamProfile.activeTab();
    return TEAM_PROFILE_EMPTY_STATES[tab] || TEAM_PROFILE_EMPTY_STATES['intel'];
  });

  /** Unique season labels derived from team schedule events (most recent first). */
  protected readonly scheduleSeasons = computed<readonly string[]>(() => {
    const seen = new Set<string>();
    const seasons: string[] = [];

    for (const event of this.teamProfile.schedule()) {
      const season = getSeasonForDate(event.date);
      if (!seen.has(season)) {
        seen.add(season);
        seasons.push(season);
      }
    }

    seasons.sort((a, b) => b.localeCompare(a));
    return seasons;
  });

  /** Section nav items — contextual to active top tab */
  protected readonly sideTabItems = computed((): SectionNavItem[] => {
    const tab = this.teamProfile.activeTab();

    const sections: Record<string, SectionNavItem[]> = {
      intel: [
        { id: 'about', label: 'About' },
        { id: 'staff', label: 'Staff' },
        { id: 'team-history', label: 'Team History' },
        { id: 'sponsors', label: 'Sponsors' },
      ],
      timeline: [
        {
          id: 'pinned',
          label: 'Pinned',
          badge: this.teamProfile.pinnedPosts().length || undefined,
        },
        {
          id: 'all-posts',
          label: 'All Posts',
          badge: this.teamProfile.allPosts().length || undefined,
        },
        {
          id: 'media',
          label: 'Media',
          badge:
            this.teamProfile
              .allPosts()
              .filter(
                (post) =>
                  post.type === 'image' ||
                  post.type === 'video' ||
                  post.type === 'highlight' ||
                  !!post.thumbnailUrl ||
                  !!post.mediaUrl
              ).length || undefined,
        },
      ],
      roster: [
        { id: 'all', label: 'All', badge: this.teamProfile.rosterCount() || undefined },
        ...this.teamProfile.rosterClassYears().map((year) => ({
          id: `class-${year}`,
          label: `Class of ${year}`,
        })),
      ],
      connect: [
        { id: 'contact', label: 'Contact' },
        { id: 'social', label: 'Social Media' },
      ],
    };

    return sections[tab] ?? sections['intel'];
  });

  /** Active side tab */
  private readonly _activeSideTab = signal<string>('');
  protected readonly activeSideTab = computed(() => {
    const current = this._activeSideTab();
    const items = this.sideTabItems();
    if (current && items.some((i) => i.id === current)) return current;
    return items[0]?.id ?? '';
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    if (this.skipInternalLoad()) {
      return; // Parent component handles data loading via loadFromExternalData()
    }

    if (!this.isBrowser) return;

    const teamId = this.teamId();
    const slug = this.teamSlug();
    const isAdmin = this.isTeamAdmin();

    if (teamId) {
      // Prefer ID lookup — exact match, avoids slug ambiguity across same-name teams
      this.teamProfile.startLoading();
      this.teamProfile.loadTeamById(teamId, isAdmin);
    } else if (slug) {
      this.teamProfile.startLoading();
      this.teamProfile.loadTeam(slug, isAdmin);
    }
  }

  ngAfterViewInit(): void {
    const centerTpl = this.teamPortalContent();
    if (centerTpl) this.headerPortal.setCenterContent(centerTpl);
    const rightTpl = this.teamRightPortalContent();
    if (rightTpl) this.headerPortal.setRightContent(rightTpl);
  }

  ngOnDestroy(): void {
    this.headerPortal.clearAll();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onTabChange(event: OptionScrollerChangeEvent): void {
    const tabId = event.option.id as TeamProfileTabId;
    this.teamProfile.setActiveTab(tabId);
    this._activeSideTab.set('');
    this.tabChange.emit(tabId);
  }

  protected onSectionNavChange(event: SectionNavChangeEvent): void {
    this._activeSideTab.set(event.id);
  }

  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      await this.teamProfile.refresh();
    } finally {
      event.complete();
    }
  }

  protected handleRefreshTimeout(): void {
    this.toast.error('Refresh timed out. Please try again.');
  }

  protected onRetry(): void {
    const teamId = this.teamId();
    const slug = this.teamSlug();
    if (teamId) {
      this.teamProfile.loadTeamById(teamId, this.isTeamAdmin());
    } else if (slug) {
      this.teamProfile.loadTeam(slug, this.isTeamAdmin());
    }
  }

  /**
   * Opens team quick actions bottom sheet.
   * Mirrors ProfileShell mobile header menu behavior.
   */
  protected async onMenuClick(): Promise<void> {
    this.menuClick.emit();

    const isAdmin = this.isTeamAdmin();
    const actions: BottomSheetAction[] = isAdmin
      ? [
          { label: 'Manage Team', role: 'secondary', icon: 'settings' },
          { label: 'Share Team', role: 'secondary', icon: 'share' },
          { label: 'QR Code', role: 'secondary', icon: 'qrCode' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
        ]
      : [
          { label: 'Share Team', role: 'secondary', icon: 'share' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
          { label: 'Report', role: 'destructive', icon: 'flag' },
        ];

    const result = await this.bottomSheet.show<BottomSheetAction>({
      actions,
      showClose: false,
      backdropDismiss: true,
      ...SHEET_PRESETS.COMPACT,
    });

    const selected = result?.data as BottomSheetAction | undefined;
    if (!selected) return;

    switch (selected.label) {
      case 'Manage Team':
        this.manageTeamClick.emit();
        break;
      case 'Share Team':
        this.shareClick.emit();
        break;
      case 'QR Code':
        this.qrCodeClick.emit();
        break;
      case 'Copy Link':
        this.shareClick.emit();
        break;
      case 'Report':
        this.logger.info('Report team requested');
        break;
    }
  }

  protected onRosterMemberClick(member: TeamProfileRosterMember): void {
    this.rosterMemberClick.emit(member);
    this.logger.debug('Roster member click', { memberId: member.id, name: member.displayName });
  }

  protected onPostClick(post: TeamProfilePost): void {
    this.postClick.emit(post);
    this.logger.debug('Post click', { postId: post.id });
  }

  protected onNewsBoardItemClick(item: NewsArticle): void {
    this.logger.debug('News board item click', { itemId: item.id, title: item.title });
  }
}
