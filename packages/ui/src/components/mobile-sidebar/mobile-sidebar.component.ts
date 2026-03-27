/**
 * @fileoverview NxtMobileSidebarComponent - YouTube-Style Mobile Slide-Out Drawer
 * @module @nxt1/ui/components/mobile-sidebar
 * @version 1.0.0
 *
 * Professional mobile sidebar drawer for web applications.
 * YouTube mobile app navigation pattern: hamburger → slide-out left drawer.
 *
 * Design Philosophy:
 * - YouTube/Google-style sectioned navigation drawer
 * - Overlay with backdrop blur for professional feel
 * - Full keyboard navigation and ARIA accessibility
 * - 100% design token + theme-aware system
 * - SSR-safe implementation
 * - Smooth slide-in/out animations
 *
 * Features:
 * - NXT1 Logo at top
 * - Sectioned navigation items matching desktop sidebar
 * - Active state highlighting with route detection
 * - Badge support for notifications/messages
 * - Sign-in prompt for unauthenticated users
 * - User section for authenticated users
 * - Theme toggle
 * - Smooth overlay + drawer animation
 * - Swipe-to-close support
 * - Trap focus when open (accessibility)
 *
 * ⭐ MOBILE WEB ONLY — Use NxtDesktopSidebar for desktop ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  input,
  output,
  effect,
  PLATFORM_ID,
  DestroyRef,
  HostBinding,
  OnDestroy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { NxtLogoComponent } from '../logo';
import { NxtIconComponent } from '../icon';
import { NxtAvatarComponent } from '../avatar';
import { NxtThemeSelectorComponent } from '../theme-selector';
import { NxtThemeService } from '../../services/theme';
import { HapticsService } from '../../services/haptics';
import type {
  MobileSidebarConfig,
  MobileSidebarItem,
  MobileSidebarUserData,
  MobileSidebarSelectEvent,
  MobileSidebarSportSelectEvent,
} from './mobile-sidebar.types';
import { DEFAULT_MOBILE_SIDEBAR_CONFIG } from './mobile-sidebar.types';
import type { DesktopSidebarSection } from '../desktop-sidebar/desktop-sidebar.types';
import { formatSportDisplayName } from '@nxt1/core';

@Component({
  selector: 'nxt1-mobile-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NxtLogoComponent,
    NxtIconComponent,
    NxtAvatarComponent,
    NxtThemeSelectorComponent,
  ],
  template: `
    <!-- Overlay Backdrop -->
    <div
      class="mobile-sidebar-overlay"
      [class.mobile-sidebar-overlay--open]="isOpen()"
      (click)="close()"
      aria-hidden="true"
    ></div>

    <!-- Sidebar Drawer -->
    <aside
      class="mobile-sidebar"
      [class.mobile-sidebar--open]="isOpen()"
      [class.mobile-sidebar--elevated]="config().variant === 'elevated'"
      [style.--mobile-sidebar-width]="config().width || '280px'"
      role="dialog"
      [attr.aria-modal]="isOpen()"
      aria-label="Navigation menu"
      (keydown.escape)="close()"
    >
      <!-- Header Section -->
      <div class="mobile-sidebar__header">
        @if (config().showLogo !== false) {
          <button
            type="button"
            class="mobile-sidebar__logo-btn"
            (click)="onLogoClick($event)"
            aria-label="Go to home"
          >
            <nxt1-logo size="sm" variant="header" />
          </button>
        }
      </div>

      <!-- Scrollable Content -->
      <nav class="mobile-sidebar__nav">
        <!-- Sign In Prompt (unauthenticated) -->
        @if (config().showSignIn !== false && !user()) {
          <div class="mobile-sidebar__signin">
            <a
              class="mobile-sidebar__signin-btn"
              routerLink="/auth"
              (click)="close()"
              aria-label="Sign in"
            >
              Sign In
            </a>
          </div>
        }

        <!-- User Section (authenticated) — Sport Profile Switcher -->
        @if (config().showUserSection !== false && user()) {
          <div class="mobile-sidebar__user">
            <div class="mobile-sidebar__profile-row">
              <button
                type="button"
                class="mobile-sidebar__user-btn"
                (click)="onUserClick($event)"
                aria-label="View profile"
              >
                <div class="mobile-sidebar__avatar-wrap">
                  <nxt1-avatar
                    [src]="user()!.profileImg"
                    [name]="user()!.name"
                    [initials]="user()!.initials"
                    size="md"
                  />
                  @if (user()!.isPremium) {
                    <span class="mobile-sidebar__pro-badge">PRO</span>
                  }
                </div>
                <div class="mobile-sidebar__user-info">
                  <span class="mobile-sidebar__user-name">{{ user()!.name }}</span>
                  <span class="mobile-sidebar__user-sport">{{ getUserSportLabel(user()!) }}</span>
                </div>
              </button>

              <!-- Expand Arrow for Sport Profiles -->
              @if ((user()!.sportProfiles?.length ?? 0) > 0) {
                <button
                  type="button"
                  class="mobile-sidebar__expand-btn"
                  [class.mobile-sidebar__expand-btn--open]="sportsExpanded()"
                  (click)="toggleSportsExpanded($event)"
                  [attr.aria-expanded]="sportsExpanded()"
                  aria-label="Show sports"
                >
                  <nxt1-icon name="chevronDown" [size]="18" />
                </button>
              }
            </div>

            <!-- Expandable Sport Profiles List -->
            @if (sportsExpanded() && (user()!.sportProfiles?.length ?? 0) > 0) {
              <div class="mobile-sidebar__sport-list">
                @for (profile of user()!.sportProfiles; track profile.id) {
                  <button
                    type="button"
                    class="mobile-sidebar__sport-item"
                    [class.mobile-sidebar__sport-item--active]="profile.isActive"
                    (click)="onSportProfileSelect(profile, $event)"
                    [attr.aria-label]="'Switch to ' + formatSportDisplay(profile.sport)"
                  >
                    <nxt1-avatar
                      [src]="profile.profileImg || user()!.profileImg"
                      [name]="profile.sport"
                      [initials]="getSportInitials(profile.sport)"
                      [customSize]="28"
                      [showSkeleton]="false"
                    />
                    <div class="mobile-sidebar__sport-info">
                      <span class="mobile-sidebar__sport-name">{{
                        formatSportDisplay(profile.sport)
                      }}</span>
                      @if (profile.position) {
                        <span class="mobile-sidebar__sport-position">{{ profile.position }}</span>
                      }
                    </div>
                    @if (profile.isActive) {
                      <nxt1-icon name="checkmark" [size]="16" class="mobile-sidebar__sport-check" />
                    }
                  </button>
                }

                <!-- Add Sport Button -->
                <button
                  type="button"
                  class="mobile-sidebar__sport-item mobile-sidebar__sport-item--add"
                  (click)="onAddSportClick($event)"
                  [attr.aria-label]="user()!.actionLabel || 'Add Sport'"
                >
                  <div class="mobile-sidebar__add-icon">
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.2"
                      stroke-linecap="round"
                      aria-hidden="true"
                    >
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </div>
                  <span class="mobile-sidebar__sport-name">{{
                    user()!.actionLabel || 'Add Sport'
                  }}</span>
                </button>
              </div>
            }
          </div>
        }

        <!-- Navigation Sections -->
        @for (section of sections(); track section.id; let isLast = $last) {
          <div class="mobile-sidebar__section" [class.mobile-sidebar__section--bordered]="!isLast">
            <!-- Section Label -->
            @if (section.label) {
              <div class="mobile-sidebar__section-label">{{ section.label }}</div>
            }

            <!-- Section Items -->
            <ul class="mobile-sidebar__items" role="menu">
              @for (item of section.items; track item.id) {
                @if (!item.hidden) {
                  @if (item.divider) {
                    <li class="mobile-sidebar__divider" role="separator"></li>
                  } @else {
                    <li role="none">
                      <button
                        type="button"
                        class="mobile-sidebar__item"
                        [class.mobile-sidebar__item--active]="isActiveItem(item)"
                        [class.mobile-sidebar__item--expandable]="!!item.children?.length"
                        [class.mobile-sidebar__item--disabled]="item.disabled"
                        [disabled]="item.disabled"
                        [attr.aria-current]="isActiveItem(item) ? 'page' : null"
                        [attr.aria-expanded]="
                          item.children?.length ? isItemExpanded(item.id) : null
                        "
                        [attr.aria-label]="item.ariaLabel ?? item.label"
                        role="menuitem"
                        (click)="onExpandableItemClick(item, section.id, $event)"
                      >
                        <!-- Icon -->
                        <span
                          class="mobile-sidebar__item-icon"
                          [class.mobile-sidebar__item-icon--agent-x]="isAgentXIcon(item.icon)"
                        >
                          @if (isAgentXIcon(item.icon)) {
                            <!-- Agent X Logo SVG - Theme-aware via currentColor (same as footer) -->
                            <svg
                              class="agent-x-logo"
                              viewBox="0 0 612 792"
                              width="40"
                              height="40"
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
                          } @else {
                            <nxt1-icon [name]="item.icon" [size]="22" />
                          }
                        </span>

                        <!-- Label -->
                        <span class="mobile-sidebar__item-label">{{ item.label }}</span>

                        <!-- Expand chevron for items with children -->
                        @if (item.children?.length) {
                          <nxt1-icon
                            name="chevronDown"
                            [size]="16"
                            class="mobile-sidebar__item-chevron"
                            [class.mobile-sidebar__item-chevron--expanded]="isItemExpanded(item.id)"
                          />
                        }

                        <!-- Badge -->
                        @if (item.badge && item.badge > 0) {
                          <span class="mobile-sidebar__item-badge">
                            {{ item.badge > 99 ? '99+' : item.badge }}
                          </span>
                        }
                      </button>

                      <!-- Child items (expandable sub-list) -->
                      @if (item.children?.length) {
                        <ul
                          class="mobile-sidebar__children"
                          [class.mobile-sidebar__children--collapsed]="!isItemExpanded(item.id)"
                          role="group"
                          [attr.aria-label]="item.label"
                        >
                          @for (child of item.children; track child.id) {
                            @if (!child.hidden) {
                              <li role="none">
                                <button
                                  type="button"
                                  class="mobile-sidebar__item mobile-sidebar__item--child"
                                  [class.mobile-sidebar__item--active]="isActiveItem(child)"
                                  [class.mobile-sidebar__item--disabled]="child.disabled"
                                  [disabled]="child.disabled"
                                  [attr.aria-current]="isActiveItem(child) ? 'page' : null"
                                  [attr.aria-label]="child.ariaLabel ?? child.label"
                                  role="menuitem"
                                  (click)="onItemClick(child, section.id, $event)"
                                >
                                  <span
                                    class="mobile-sidebar__item-icon"
                                    [class.mobile-sidebar__item-icon--agent-x]="
                                      isAgentXIcon(child.icon)
                                    "
                                  >
                                    @if (isAgentXIcon(child.icon)) {
                                      <!-- Agent X Logo SVG for child items -->
                                      <svg
                                        class="agent-x-logo"
                                        viewBox="0 0 612 792"
                                        width="18"
                                        height="18"
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
                                    } @else {
                                      <nxt1-icon [name]="child.icon" [size]="18" />
                                    }
                                  </span>
                                  <span class="mobile-sidebar__item-label">{{ child.label }}</span>
                                </button>
                              </li>
                            }
                          }
                        </ul>
                      }
                    </li>
                  }
                }
              }
            </ul>
          </div>
        }

        <!-- Theme Toggle -->
        @if (config().showThemeToggle !== false) {
          <div class="mobile-sidebar__section mobile-sidebar__section--bordered">
            <div class="mobile-sidebar__theme">
              <nxt1-theme-selector
                variant="compact"
                [showLabels]="false"
                [showAppearance]="true"
                [showSportThemes]="true"
                [singleRow]="true"
              />
            </div>
          </div>
        }

        <!-- App Download Promotion -->
        <div class="mobile-sidebar__section mobile-sidebar__section--bordered">
          <div class="mobile-sidebar__app-promo">
            <div class="mobile-sidebar__app-promo-header">
              <nxt1-icon name="download" [size]="20" />
              <span class="mobile-sidebar__app-promo-title">Get the NXT1 App</span>
            </div>
            <p class="mobile-sidebar__app-promo-subtitle">The Sports Intelligence Platform</p>
            <div class="mobile-sidebar__app-promo-buttons">
              <a
                [href]="appStoreUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="mobile-sidebar__store-btn"
                aria-label="Download on the App Store"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                  class="mobile-sidebar__store-icon"
                >
                  <path
                    d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
                  />
                </svg>
                <div class="mobile-sidebar__store-text">
                  <span class="mobile-sidebar__store-label">Download on</span>
                  <span class="mobile-sidebar__store-name">App Store</span>
                </div>
              </a>
              <a
                [href]="googlePlayUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="mobile-sidebar__store-btn"
                aria-label="Get it on Google Play"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                  class="mobile-sidebar__store-icon"
                >
                  <path
                    d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.25-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm3.35-4.31c.34.27.59.69.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z"
                  />
                </svg>
                <div class="mobile-sidebar__store-text">
                  <span class="mobile-sidebar__store-label">Get it on</span>
                  <span class="mobile-sidebar__store-name">Google Play</span>
                </div>
              </a>
            </div>
          </div>
        </div>

        <!-- Legal Footer -->
        <footer class="mobile-sidebar__footer">
          <nav class="mobile-sidebar__legal" aria-label="Legal">
            <a routerLink="/about" class="mobile-sidebar__legal-link" (click)="close()">About</a>
            <a routerLink="/terms" class="mobile-sidebar__legal-link" (click)="close()"
              >Terms of Service</a
            >
            <a routerLink="/privacy" class="mobile-sidebar__legal-link" (click)="close()"
              >Privacy Policy</a
            >
            <a routerLink="/contact" class="mobile-sidebar__legal-link" (click)="close()"
              >Contact Us</a
            >
            <a routerLink="/help-center" class="mobile-sidebar__legal-link" (click)="close()"
              >Help</a
            >
          </nav>
          <p class="mobile-sidebar__copyright">
            &copy; {{ currentYear }} NXT1 Sports. All rights reserved.
          </p>
        </footer>
      </nav>
    </aside>
  `,
  styles: [
    `
      /* ============================================
         CSS CUSTOM PROPERTIES (Design Tokens)
         ============================================ */
      :host {
        --mobile-sidebar-width: 280px;
        --mobile-sidebar-bg: var(--nxt1-color-bg-primary);
        --mobile-sidebar-border: var(--nxt1-color-border-default);
        --mobile-sidebar-text-primary: var(--nxt1-color-text-primary);
        --mobile-sidebar-text-secondary: var(--nxt1-color-text-secondary);
        --mobile-sidebar-text-tertiary: var(--nxt1-color-text-tertiary);

        --mobile-sidebar-item-hover: var(--nxt1-color-surface-200);
        --mobile-sidebar-item-active: var(--nxt1-color-surface-300);
        --mobile-sidebar-item-active-text: var(--nxt1-color-text-primary);
        --mobile-sidebar-item-radius: var(--nxt1-borderRadius-xl);

        --mobile-sidebar-accent: var(--nxt1-color-primary);
        --mobile-sidebar-badge-bg: var(--nxt1-color-error);
        --mobile-sidebar-badge-text: var(--nxt1-color-text-onPrimary, #fff);

        --mobile-sidebar-overlay-bg: var(--nxt1-color-background-overlay, rgba(0, 0, 0, 0.5));
        --mobile-sidebar-overlay-blur: var(--nxt1-blur-sm, 4px);
        --mobile-sidebar-max-width: 85vw;
        --mobile-sidebar-transition: var(--nxt1-duration-normal, 250ms) cubic-bezier(0.4, 0, 0.2, 1);
        --mobile-sidebar-transition-fast: var(--nxt1-duration-fast, 150ms) ease-out;

        /* Interaction feedback tokens */
        --mobile-sidebar-hover-opacity: 0.8;
        --mobile-sidebar-active-opacity: 0.6;
        --mobile-sidebar-press-scale: 0.97;
        --mobile-sidebar-disabled-opacity: 0.5;

        /* Scrollbar tokens */
        --mobile-sidebar-scrollbar-width: var(--nxt1-spacing-1, 0.25rem);
        --mobile-sidebar-scrollbar-radius: var(--nxt1-borderRadius-xs, 0.125rem);

        display: contents;
        position: relative;
        z-index: var(--nxt1-zIndex-modal, 1000);
      }

      /* ============================================
         OVERLAY
         ============================================ */
      .mobile-sidebar-overlay {
        position: fixed;
        inset: 0;
        background: var(--mobile-sidebar-overlay-bg);
        backdrop-filter: blur(var(--mobile-sidebar-overlay-blur));
        -webkit-backdrop-filter: blur(var(--mobile-sidebar-overlay-blur));
        opacity: 0;
        visibility: hidden;
        transition:
          opacity var(--mobile-sidebar-transition),
          visibility var(--mobile-sidebar-transition);
        z-index: var(--nxt1-zIndex-modal, 1000);
      }

      .mobile-sidebar-overlay--open {
        opacity: 1;
        visibility: visible;
      }

      /* ============================================
         SIDEBAR DRAWER
         ============================================ */
      .mobile-sidebar {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        width: var(--mobile-sidebar-width);
        max-width: var(--mobile-sidebar-max-width);
        background: var(--mobile-sidebar-bg);
        border-right: 1px solid var(--mobile-sidebar-border);
        transform: translateX(-100%);
        transition: transform var(--mobile-sidebar-transition);
        z-index: calc(var(--nxt1-zIndex-modal, 1000) + 1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .mobile-sidebar--open {
        transform: translateX(0);
      }

      .mobile-sidebar--elevated {
        box-shadow: var(--nxt1-shadow-2xl);
        border-right: none;
      }

      /* ============================================
         HEADER (Logo)
         ============================================ */
      .mobile-sidebar__header {
        display: flex;
        align-items: center;
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-4, 1rem);
        min-height: var(--nxt1-spacing-14, 3.5rem);
        border-bottom: 1px solid var(--mobile-sidebar-border);
        flex-shrink: 0;
      }

      .mobile-sidebar__logo-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        cursor: pointer;
        padding: var(--nxt1-spacing-1, 0.25rem);
        border-radius: var(--mobile-sidebar-item-radius);
        transition: opacity var(--mobile-sidebar-transition-fast);
      }

      .mobile-sidebar__logo-btn:hover {
        opacity: var(--mobile-sidebar-hover-opacity);
      }

      .mobile-sidebar__logo-btn:active {
        opacity: var(--mobile-sidebar-active-opacity);
      }

      /* ============================================
         SCROLLABLE NAV CONTENT
         ============================================ */
      .mobile-sidebar__nav {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: var(--mobile-sidebar-border) transparent;
      }

      .mobile-sidebar__nav::-webkit-scrollbar {
        width: var(--mobile-sidebar-scrollbar-width);
      }

      .mobile-sidebar__nav::-webkit-scrollbar-track {
        background: transparent;
      }

      .mobile-sidebar__nav::-webkit-scrollbar-thumb {
        background: var(--mobile-sidebar-border);
        border-radius: var(--mobile-sidebar-scrollbar-radius);
      }

      /* ============================================
         SIGN-IN PROMPT
         ============================================ */
      .mobile-sidebar__signin {
        padding: var(--nxt1-spacing-4, 1rem);
        border-bottom: 1px solid var(--mobile-sidebar-border);
      }

      .mobile-sidebar__signin-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: var(--nxt1-spacing-9, 2.25rem);
        padding: 0 var(--nxt1-spacing-5, 1.25rem);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-ui-text-inverse, #000000);
        border: none;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        text-decoration: none;
        cursor: pointer;
        box-shadow: var(--nxt1-glow-md);
        transition:
          background-color var(--mobile-sidebar-transition-fast),
          transform var(--mobile-sidebar-transition-fast),
          box-shadow var(--mobile-sidebar-transition-fast);
      }

      .mobile-sidebar__signin-btn:hover {
        background: var(--nxt1-color-primary-dark, var(--nxt1-color-primary));
        transform: translateY(-1px);
      }

      .mobile-sidebar__signin-btn:active {
        transform: translateY(0);
        box-shadow: var(--nxt1-glow-sm);
      }

      .mobile-sidebar__signin-btn:focus-visible {
        outline: 2px solid var(--mobile-sidebar-accent);
        outline-offset: 2px;
      }

      /* ============================================
         USER SECTION
         ============================================ */
      .mobile-sidebar__user {
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-4, 1rem);
        border-bottom: 1px solid var(--mobile-sidebar-border);
      }

      .mobile-sidebar__profile-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
      }

      .mobile-sidebar__user-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        flex: 1;
        min-width: 0;
        padding: var(--nxt1-spacing-2, 0.5rem);
        background: none;
        border: none;
        border-radius: var(--mobile-sidebar-item-radius);
        cursor: pointer;
        transition: background var(--mobile-sidebar-transition-fast);
      }

      .mobile-sidebar__user-btn:hover {
        background: var(--mobile-sidebar-item-hover);
      }

      .mobile-sidebar__avatar-wrap {
        position: relative;
        flex-shrink: 0;
      }

      .mobile-sidebar__pro-badge {
        position: absolute;
        bottom: -2px;
        right: -2px;
        font-size: 8px;
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-ui-text-inverse, #000);
        background: var(--nxt1-color-primary);
        padding: 1px 4px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        line-height: 1;
        letter-spacing: 0.02em;
      }

      .mobile-sidebar__user-info {
        flex: 1;
        min-width: 0;
        text-align: left;
      }

      .mobile-sidebar__user-name {
        display: block;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--mobile-sidebar-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .mobile-sidebar__user-sport {
        display: block;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--mobile-sidebar-text-tertiary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* ── Expand Arrow Button ── */
      .mobile-sidebar__expand-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        border: none;
        background: none;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        color: var(--mobile-sidebar-text-tertiary);
        cursor: pointer;
        transition:
          transform var(--mobile-sidebar-transition-fast),
          background var(--mobile-sidebar-transition-fast);
      }

      .mobile-sidebar__expand-btn:hover {
        background: var(--mobile-sidebar-item-hover);
      }

      .mobile-sidebar__expand-btn--open {
        transform: rotate(180deg);
      }

      /* ── Sport Profiles List ── */
      .mobile-sidebar__sport-list {
        display: flex;
        flex-direction: column;
        padding: var(--nxt1-spacing-2, 0.5rem) 0 0;
      }

      .mobile-sidebar__sport-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        width: 100%;
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-2, 0.5rem);
        background: none;
        border: none;
        border-radius: var(--mobile-sidebar-item-radius);
        cursor: pointer;
        color: var(--mobile-sidebar-text-primary);
        transition: background var(--mobile-sidebar-transition-fast);
      }

      .mobile-sidebar__sport-item:hover {
        background: var(--mobile-sidebar-item-hover);
      }

      .mobile-sidebar__sport-item--active {
        background: var(--mobile-sidebar-item-active);
      }

      .mobile-sidebar__sport-info {
        flex: 1;
        min-width: 0;
        text-align: left;
      }

      .mobile-sidebar__sport-name {
        display: block;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--mobile-sidebar-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .mobile-sidebar__sport-position {
        display: block;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--mobile-sidebar-text-tertiary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .mobile-sidebar__sport-check {
        flex-shrink: 0;
        color: var(--mobile-sidebar-accent);
      }

      /* ── Add Sport ── */
      .mobile-sidebar__sport-item--add {
        color: var(--mobile-sidebar-text-secondary);
      }

      .mobile-sidebar__add-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        border: 1.5px dashed var(--mobile-sidebar-text-tertiary);
        color: var(--mobile-sidebar-text-tertiary);
        flex-shrink: 0;
      }

      .mobile-sidebar__user-handle {
        display: block;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--mobile-sidebar-text-tertiary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* ============================================
         NAVIGATION SECTIONS
         ============================================ */
      .mobile-sidebar__section {
        padding: var(--nxt1-spacing-2, 0.5rem) 0;
      }

      .mobile-sidebar__section--bordered {
        border-bottom: 1px solid var(--mobile-sidebar-border);
      }

      .mobile-sidebar__section-label {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--mobile-sidebar-text-primary);
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-4, 1rem)
          var(--nxt1-spacing-2, 0.5rem);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mobile-sidebar__items {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .mobile-sidebar__divider {
        height: var(--nxt1-borderWidth-default, 1px);
        background: var(--mobile-sidebar-border);
        margin: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-4, 1rem);
      }

      /* ============================================
         NAVIGATION ITEM
         ============================================ */
      .mobile-sidebar__item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-6, 1.5rem);
        width: 100%;
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-6, 1.5rem);
        background: none;
        border: none;
        cursor: pointer;
        color: var(--mobile-sidebar-text-primary);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-regular, 400);
        text-align: left;
        transition: all var(--mobile-sidebar-transition-fast);
        position: relative;
        white-space: nowrap;
      }

      .mobile-sidebar__item:hover:not(:disabled) {
        background: var(--mobile-sidebar-item-hover);
      }

      .mobile-sidebar__item:active:not(:disabled) {
        background: var(--mobile-sidebar-item-active);
      }

      .mobile-sidebar__item--active {
        background: var(--mobile-sidebar-item-active);
        font-weight: var(--nxt1-fontWeight-medium, 500);
      }

      .mobile-sidebar__item--active .mobile-sidebar__item-icon {
        color: var(--mobile-sidebar-accent);
      }

      .mobile-sidebar__item--disabled {
        opacity: var(--mobile-sidebar-disabled-opacity);
        cursor: not-allowed;
      }

      .mobile-sidebar__item-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: var(--nxt1-spacing-6, 1.5rem);
        height: var(--nxt1-spacing-6, 1.5rem);
        color: inherit;
      }

      /* Agent X Logo - larger size (matches footer FAB) */
      .mobile-sidebar__item-icon--agent-x {
        width: var(--nxt1-spacing-6, 1.5rem);
        height: var(--nxt1-spacing-6, 1.5rem);
        overflow: visible;
      }

      .mobile-sidebar__item-icon .agent-x-logo {
        display: block;
        width: var(--nxt1-spacing-10, 2.5rem);
        height: var(--nxt1-spacing-10, 2.5rem);
        margin-left: -2px;
      }

      .mobile-sidebar__item-label {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mobile-sidebar__item-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: var(--nxt1-spacing-5, 1.25rem);
        height: var(--nxt1-spacing-5, 1.25rem);
        padding: 0 var(--nxt1-spacing-1_5, 0.375rem);
        background: var(--mobile-sidebar-badge-bg);
        color: var(--mobile-sidebar-badge-text);
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        line-height: 1;
      }

      /* ============================================
         EXPANDABLE ITEM (Children / Sub-list)
         ============================================ */
      .mobile-sidebar__item--expandable {
        cursor: pointer;
      }

      .mobile-sidebar__item-chevron {
        flex-shrink: 0;
        color: var(--mobile-sidebar-text-tertiary);
        transition: transform var(--mobile-sidebar-transition-fast);
        transform: rotate(0deg);
        margin-left: auto;
      }

      .mobile-sidebar__item-chevron--expanded {
        transform: rotate(180deg);
      }

      .mobile-sidebar__children {
        list-style: none;
        margin: 0;
        padding: var(--nxt1-spacing-1, 0.25rem) 0 var(--nxt1-spacing-1, 0.25rem)
          var(--nxt1-spacing-4, 1rem);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5, 0.125rem);
        transition:
          max-height 250ms cubic-bezier(0.4, 0, 0.2, 1),
          padding 250ms cubic-bezier(0.4, 0, 0.2, 1),
          opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
        max-height: 500px;
        opacity: 1;
      }

      .mobile-sidebar__children--collapsed {
        max-height: 0;
        padding-top: 0;
        padding-bottom: 0;
        opacity: 0;
        pointer-events: none;
      }

      .mobile-sidebar__item--child {
        padding: var(--nxt1-spacing-2_5, 0.625rem) var(--nxt1-spacing-6, 1.5rem);
        gap: var(--nxt1-spacing-4, 1rem);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
      }

      .mobile-sidebar__item--child .mobile-sidebar__item-icon {
        width: var(--nxt1-spacing-5, 1.25rem);
        height: var(--nxt1-spacing-5, 1.25rem);
      }

      /* ============================================
         THEME TOGGLE
         ============================================ */
      .mobile-sidebar__theme {
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-4, 1rem);
      }

      /* ============================================
         APP DOWNLOAD PROMOTION
         ============================================ */
      .mobile-sidebar__app-promo {
        padding: var(--nxt1-spacing-4, 1rem) var(--nxt1-spacing-4, 1rem);
      }

      .mobile-sidebar__app-promo-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
        color: var(--mobile-sidebar-text-primary);
        margin-bottom: var(--nxt1-spacing-1, 0.25rem);
      }

      .mobile-sidebar__app-promo-title {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--mobile-sidebar-text-primary);
      }

      .mobile-sidebar__app-promo-subtitle {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--mobile-sidebar-text-tertiary);
        margin: 0 0 var(--nxt1-spacing-3, 0.75rem) 0;
        line-height: var(--nxt1-lineHeight-normal, 1.5);
      }

      .mobile-sidebar__app-promo-buttons {
        display: flex;
        gap: var(--nxt1-spacing-2, 0.5rem);
      }

      .mobile-sidebar__store-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
        flex: 1;
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem);
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--mobile-sidebar-border);
        border-radius: var(--nxt1-borderRadius-lg, 0.5rem);
        text-decoration: none;
        color: var(--mobile-sidebar-text-primary);
        cursor: pointer;
        transition: all var(--mobile-sidebar-transition-fast);
      }

      .mobile-sidebar__store-btn:hover {
        background: var(--nxt1-color-surface-300);
        border-color: var(--mobile-sidebar-text-tertiary);
      }

      .mobile-sidebar__store-btn:active {
        transform: scale(var(--mobile-sidebar-press-scale));
      }

      .mobile-sidebar__store-icon {
        width: var(--nxt1-spacing-5, 1.25rem);
        height: var(--nxt1-spacing-5, 1.25rem);
        flex-shrink: 0;
      }

      .mobile-sidebar__store-text {
        display: flex;
        flex-direction: column;
        gap: 0;
        min-width: 0;
      }

      .mobile-sidebar__store-label {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-regular, 400);
        color: var(--mobile-sidebar-text-tertiary);
        line-height: var(--nxt1-lineHeight-tight, 1.25);
      }

      .mobile-sidebar__store-name {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--mobile-sidebar-text-primary);
        line-height: var(--nxt1-lineHeight-tight, 1.25);
      }

      /* ============================================
         LEGAL FOOTER
         ============================================ */
      .mobile-sidebar__footer {
        padding: var(--nxt1-spacing-4, 1rem) var(--nxt1-spacing-4, 1rem)
          var(--nxt1-spacing-6, 1.5rem);
        flex-shrink: 0;
      }

      .mobile-sidebar__legal {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-1, 0.25rem) var(--nxt1-spacing-3, 0.75rem);
        margin-bottom: var(--nxt1-spacing-3, 0.75rem);
      }

      .mobile-sidebar__legal-link {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-regular, 400);
        color: var(--mobile-sidebar-text-tertiary);
        text-decoration: none;
        line-height: var(--nxt1-lineHeight-relaxed, 1.625);
        transition: color var(--mobile-sidebar-transition-fast);
      }

      .mobile-sidebar__legal-link:hover {
        color: var(--mobile-sidebar-text-secondary);
      }

      .mobile-sidebar__copyright {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        color: var(--mobile-sidebar-text-tertiary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-normal, 1.5);
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */
      @media (prefers-reduced-motion: reduce) {
        .mobile-sidebar-overlay,
        .mobile-sidebar,
        .mobile-sidebar__item,
        .mobile-sidebar__item-chevron,
        .mobile-sidebar__children,
        .mobile-sidebar__signin-btn,
        .mobile-sidebar__logo-btn,
        .mobile-sidebar__user-btn {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtMobileSidebarComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly haptics = inject(HapticsService);
  protected readonly theme = inject(NxtThemeService);

  /** App store URLs */
  protected readonly appStoreUrl = 'https://apps.apple.com/us/app/nxt-1/id6446410344';
  protected readonly googlePlayUrl =
    'https://play.google.com/store/apps/details?id=com.nxt1sports.app.twa';

  /** Current year for copyright */
  protected readonly currentYear = new Date().getFullYear();

  // ============================================
  // INPUTS
  // ============================================

  /** Navigation sections (same structure as desktop sidebar) */
  readonly sections = input<readonly DesktopSidebarSection[]>([]);

  /** User data for authenticated state */
  readonly user = input<MobileSidebarUserData | null>(null);

  /** Configuration */
  readonly config = input<MobileSidebarConfig>(DEFAULT_MOBILE_SIDEBAR_CONFIG);

  /** Whether the sidebar is open */
  readonly open = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when an item is selected */
  readonly itemSelect = output<MobileSidebarSelectEvent>();

  /** Emitted when user section is clicked */
  readonly userClick = output<Event>();

  /** Emitted when logo is clicked */
  readonly logoClick = output<Event>();

  /** Emitted when sidebar should close */
  readonly closeRequest = output<void>();

  /** Emitted when a sport profile is selected from the switcher */
  readonly sportProfileSelect = output<MobileSidebarSportSelectEvent>();

  /** Emitted when "Add Sport" is clicked */
  readonly addSportClick = output<Event>();

  // ============================================
  // STATE
  // ============================================

  /** Current route path */
  private readonly _currentRoute = signal('/');

  /** Tracks expanded state for items with children (by item ID) */
  private readonly _expandedItems = signal<ReadonlySet<string>>(new Set<string>());

  /** Whether sport profiles dropdown is expanded */
  readonly sportsExpanded = signal(false);

  /** Internal open state (synced with input) */
  readonly isOpen = computed(() => this.open());

  // ============================================
  // HOST BINDINGS
  // ============================================

  @HostBinding('class.nxt1-mobile-sidebar-host')
  readonly hostClass = true;

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    // Initialize route tracking
    this._currentRoute.set(this.router.url);

    // Initialize expanded items from section defaults
    this.initExpandedItems();

    // Track route changes
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        this._currentRoute.set(event.urlAfterRedirects);
      });

    // Set up body scroll lock reactively (effect runs in injection context here)
    this.setupBodyScrollLock();
  }

  ngOnDestroy(): void {
    // Ensure body scroll is unlocked on destroy
    if (isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = '';
    }
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Close the sidebar drawer.
   */
  close(): void {
    this.haptics.impact('light');
    this.closeRequest.emit();
  }

  /**
   * Check if an item is active based on current route.
   */
  isActiveItem(item: MobileSidebarItem): boolean {
    if (!item.route) return false;
    const currentPath = this._currentRoute();

    // Exact match for home, prefix match for others
    if (item.route === '/home') {
      return currentPath === '/home';
    }

    return currentPath.startsWith(item.route);
  }

  /**
   * Check if an icon should render as the Agent X custom logo.
   * Uses same SVG as footer FAB for consistency.
   */
  isAgentXIcon(icon: string | undefined): boolean {
    if (!icon) return false;
    const agentIcons = ['agent-x', 'agent', 'agentx', 'agentX'];
    return agentIcons.includes(icon);
  }

  /**
   * Check if an expandable item is currently expanded.
   */
  isItemExpanded(itemId: string): boolean {
    return this._expandedItems().has(itemId);
  }

  /**
   * Toggle an expandable item's children visibility.
   */
  toggleItem(itemId: string): void {
    this.haptics.impact('light');
    this._expandedItems.update((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  /**
   * Handle click on an item that may have children.
   * Items with children: toggle expand only (never navigate).
   * Items without children: normal navigation.
   */
  onExpandableItemClick(item: MobileSidebarItem, sectionId: string, event: Event): void {
    if (item.children?.length) {
      event.preventDefault();
      event.stopPropagation();
      this.toggleItem(item.id);
    } else {
      this.onItemClick(item, sectionId, event);
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  onItemClick(item: MobileSidebarItem, sectionId: string, event: Event): void {
    if (item.disabled) return;

    this.haptics.impact('light');

    // Handle special actions
    if (item.action) {
      this.itemSelect.emit({ item, sectionId, event });
      this.close();
      return;
    }

    // Handle external links
    if (item.href) {
      if (isPlatformBrowser(this.platformId)) {
        window.open(item.href, '_blank', 'noopener,noreferrer');
      }
      this.close();
      return;
    }

    // Handle route navigation
    if (item.route) {
      this.router.navigate([item.route]);
      this.itemSelect.emit({ item, sectionId, event });
      this.close();
    }
  }

  onUserClick(event: Event): void {
    this.haptics.impact('light');
    this.userClick.emit(event);
    this.close();
  }

  onLogoClick(event: Event): void {
    this.haptics.impact('light');
    this.logoClick.emit(event);
    this.close();
  }

  // ============================================
  // SPORT PROFILE SWITCHER METHODS
  // ============================================

  /**
   * Toggle sport profiles dropdown expansion.
   */
  toggleSportsExpanded(event: Event): void {
    event.stopPropagation();
    this.haptics.impact('light');
    this.sportsExpanded.update((v) => !v);
  }

  /**
   * Handle sport profile selection.
   */
  onSportProfileSelect(profile: import('@nxt1/core').SidenavSportProfile, event: Event): void {
    event.stopPropagation();
    this.haptics.impact('light');
    this.sportProfileSelect.emit({ profile, event });
    this.sportsExpanded.set(false);
    this.close();
  }

  /**
   * Handle "Add Sport" click.
   */
  onAddSportClick(event: Event): void {
    event.stopPropagation();
    this.haptics.impact('light');
    this.addSportClick.emit(event);
    this.sportsExpanded.set(false);
    this.close();
  }

  /**
   * Get the sport label displayed under the user's name.
   */
  getUserSportLabel(userData: MobileSidebarUserData): string {
    if (userData.sportLabel) return userData.sportLabel;

    const activeSport = userData.sportProfiles?.find((p) => p.isActive);
    const firstSport = userData.sportProfiles?.[0];
    const profile = activeSport ?? firstSport;

    if (profile?.sport && profile.position) {
      return `${formatSportDisplayName(profile.sport)} • ${profile.position}`;
    }
    if (profile?.sport) {
      return formatSportDisplayName(profile.sport);
    }
    if (userData.handle) return userData.handle;
    return 'Athlete';
  }

  /**
   * Format sport name for display.
   */
  formatSportDisplay(sportName: string): string {
    return formatSportDisplayName(sportName);
  }

  /**
   * Build compact initials from a sport name for avatar fallbacks.
   */
  getSportInitials(sportName: string): string {
    const parts = sportName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'SP';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Initialize _expandedItems from item.expanded defaults.
   * Items with expanded: true are pre-opened.
   */
  private initExpandedItems(): void {
    const expanded = new Set<string>();
    for (const section of this.sections()) {
      for (const item of section.items) {
        if (item.children && item.expanded) {
          expanded.add(item.id);
        }
      }
    }
    this._expandedItems.set(expanded);
  }

  /**
   * Lock/unlock body scroll when sidebar opens/closes.
   * Uses Angular effect() for reactive signal-based tracking.
   */
  private setupBodyScrollLock(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    effect(() => {
      const shouldLock = this.open();
      document.body.style.overflow = shouldLock ? 'hidden' : '';
    });
  }
}
