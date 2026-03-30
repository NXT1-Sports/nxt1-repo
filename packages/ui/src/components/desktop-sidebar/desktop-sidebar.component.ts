/**
 * @fileoverview NxtDesktopSidebarComponent - Professional Fixed Desktop Sidebar
 * @module @nxt1/ui/components/desktop-sidebar
 * @version 1.0.0
 *
 * Professional fixed sidebar for desktop web applications.
 * YouTube/Twitter/LinkedIn-inspired navigation pattern.
 *
 * Design Philosophy:
 * - Fixed position sidebar (not drawer/overlay)
 * - Responsive: expanded (≥1280px), collapsed (768-1279px)
 * - Hover expand when collapsed for quick access
 * - Full keyboard navigation and ARIA accessibility
 * - 100% design token + Tailwind theme awareness
 * - SSR-safe implementation
 *
 * Features:
 * - NXT1 Logo at top
 * - Sectioned navigation items with icons
 * - Active state highlighting with route detection
 * - Badge support for notifications
 * - User section at bottom
 * - Theme toggle
 * - Collapse/expand toggle
 * - Smooth animations
 *
 * ⭐ DESKTOP WEB ONLY — Use NxtMobileFooter for mobile ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  input,
  output,
  PLATFORM_ID,
  afterNextRender,
  DestroyRef,
  HostBinding,
  ElementRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SUPPORT_CONFIG } from '@nxt1/core/constants';
import { NxtLogoComponent } from '../logo';
import { NxtIconComponent } from '../icon';
import { NxtAvatarComponent } from '../avatar';
import { NxtThemeSelectorComponent } from '../theme-selector';
import { NxtBrowserService } from '../../services/browser';
import { NxtThemeService } from '../../services/theme';
import type {
  DesktopSidebarConfig,
  DesktopSidebarSection,
  DesktopSidebarItem,
  DesktopSidebarUserData,
  DesktopSidebarSelectEvent,
} from './desktop-sidebar.types';
import {
  DEFAULT_DESKTOP_SIDEBAR_CONFIG,
  DEFAULT_DESKTOP_SIDEBAR_SECTIONS,
  SIDEBAR_WIDTHS,
} from './desktop-sidebar.types';

@Component({
  selector: 'nxt1-desktop-sidebar',
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
    <aside
      class="sidebar"
      [class.sidebar--collapsed]="isCollapsed()"
      [class.sidebar--expanded]="!isCollapsed()"
      [class.sidebar--hover-expanded]="isHoverExpanded()"
      [class.sidebar--bordered]="config().bordered !== false"
      [class.sidebar--elevated]="config().variant === 'elevated'"
      [class.sidebar--minimal]="config().variant === 'minimal'"
      (mouseenter)="onMouseEnter()"
      (mouseleave)="onMouseLeave()"
      role="navigation"
      aria-label="Main navigation"
    >
      <!-- Logo Section -->
      @if (config().showLogo !== false) {
        <div class="sidebar__logo">
          <!-- Collapse/Menu toggle (always visible) -->
          <button
            type="button"
            class="sidebar__menu-btn"
            (click)="toggleCollapse($event)"
            [attr.aria-label]="isCollapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
            [attr.aria-expanded]="!isCollapsed()"
          >
            <nxt1-icon name="menu" [size]="22" />
          </button>

          <!-- Logo (hidden when collapsed) -->
          @if (!isCollapsed() || isHoverExpanded()) {
            <button
              type="button"
              class="sidebar__logo-btn"
              (click)="onLogoClick($event)"
              aria-label="Go to home"
            >
              <nxt1-logo size="sm" variant="header" />
            </button>
          }
        </div>
      }

      <!-- Skeleton Loading State -->
      @if (sections().length === 0) {
        <nav class="sidebar__nav sidebar__nav--loading">
          <!-- Skeleton items to mimic navigation structure -->
          <div class="sidebar__skeleton-section">
            <div class="sidebar__skeleton-label"></div>
            <div class="sidebar__skeleton-item"></div>
          </div>
          <div class="sidebar__skeleton-section">
            <div class="sidebar__skeleton-label"></div>
            <div class="sidebar__skeleton-item"></div>
            <div class="sidebar__skeleton-item"></div>
            <div class="sidebar__skeleton-item"></div>
            <div class="sidebar__skeleton-item"></div>
            <div class="sidebar__skeleton-item"></div>
            <div class="sidebar__skeleton-item"></div>
          </div>
          <div class="sidebar__skeleton-section">
            <div class="sidebar__skeleton-label"></div>
            <div class="sidebar__skeleton-item"></div>
            <div class="sidebar__skeleton-item"></div>
            <div class="sidebar__skeleton-item"></div>
            <div class="sidebar__skeleton-item"></div>
          </div>
        </nav>
      } @else {
        <!-- Navigation Sections -->
        <nav #sidebarNav class="sidebar__nav">
          @for (section of sections(); track section.id; let isLast = $last) {
            <div class="sidebar__section" [class.sidebar__section--last]="isLast">
              <!-- Section Label (only when expanded) -->
              @if (section.label && (!isCollapsed() || isHoverExpanded())) {
                @if (section.collapsible) {
                  <!-- Collapsible section header -->
                  <button
                    type="button"
                    class="sidebar__section-toggle"
                    [attr.aria-expanded]="isSectionExpanded(section.id)"
                    [attr.aria-controls]="'sidebar-section-' + section.id"
                    (click)="toggleSection(section.id)"
                  >
                    <span class="sidebar__section-label sidebar__section-label--collapsible">{{
                      section.label
                    }}</span>
                    <nxt1-icon
                      name="chevronDown"
                      [size]="14"
                      class="sidebar__section-chevron"
                      [class.sidebar__section-chevron--expanded]="isSectionExpanded(section.id)"
                    />
                  </button>
                } @else {
                  <div class="sidebar__section-label">{{ section.label }}</div>
                }
              }

              <!-- Section Items (collapsible wrapper) -->
              <div
                class="sidebar__section-content"
                [class.sidebar__section-content--collapsed]="
                  section.collapsible &&
                  !isSectionExpanded(section.id) &&
                  (!isCollapsed() || isHoverExpanded())
                "
                [class.sidebar__section-content--collapsible]="section.collapsible"
                [id]="'sidebar-section-' + section.id"
                [attr.role]="section.collapsible ? 'region' : null"
                [attr.aria-label]="section.collapsible ? section.label : null"
              >
                <ul class="sidebar__items" role="menu">
                  @for (item of section.items; track item.id) {
                    @if (!item.hidden) {
                      @if (item.divider) {
                        <li class="sidebar__divider" role="separator"></li>
                      } @else {
                        <li role="none">
                          <button
                            type="button"
                            class="sidebar__item"
                            [class.sidebar__item--active]="isActiveItem(item)"
                            [class.sidebar__item--expandable]="!!item.children?.length"
                            [class.sidebar__item--disabled]="item.disabled"
                            [class.sidebar__item--collapsed]="isCollapsed() && !isHoverExpanded()"
                            [disabled]="item.disabled"
                            [attr.aria-current]="isActiveItem(item) ? 'page' : null"
                            [attr.aria-expanded]="
                              item.children?.length ? isSectionExpanded(item.id) : null
                            "
                            [attr.aria-label]="item.ariaLabel ?? item.label"
                            role="menuitem"
                            (click)="onExpandableItemClick(item, section.id, $event)"
                          >
                            <!-- Icon -->
                            <span
                              class="sidebar__item-icon"
                              [class.sidebar__item-icon--agent-x]="isAgentXIcon(item.icon)"
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

                            <!-- Label (hidden when collapsed) -->
                            @if (!isCollapsed() || isHoverExpanded()) {
                              <span class="sidebar__item-label">{{ item.label }}</span>
                            }

                            <!-- Expand chevron for items with children -->
                            @if (item.children?.length && (!isCollapsed() || isHoverExpanded())) {
                              <nxt1-icon
                                name="chevronDown"
                                [size]="16"
                                class="sidebar__item-chevron"
                                [class.sidebar__item-chevron--expanded]="isSectionExpanded(item.id)"
                              />
                            }

                            <!-- Badge -->
                            @if (item.badge && item.badge > 0) {
                              <span
                                class="sidebar__item-badge"
                                [class.sidebar__item-badge--collapsed]="
                                  isCollapsed() && !isHoverExpanded()
                                "
                              >
                                {{ item.badge > 99 ? '99+' : item.badge }}
                              </span>
                            }

                            <!-- Tooltip (only when collapsed) -->
                            @if (isCollapsed() && !isHoverExpanded()) {
                              <span class="sidebar__tooltip">{{ item.label }}</span>
                            }
                          </button>

                          <!-- Child items (expandable sub-list) -->
                          @if (item.children?.length && (!isCollapsed() || isHoverExpanded())) {
                            <ul
                              class="sidebar__children"
                              [class.sidebar__children--collapsed]="!isSectionExpanded(item.id)"
                              role="group"
                              [attr.aria-label]="item.label"
                            >
                              @for (child of item.children; track child.id) {
                                @if (!child.hidden) {
                                  <li role="none">
                                    <button
                                      type="button"
                                      class="sidebar__item sidebar__item--child"
                                      [class.sidebar__item--active]="isActiveItem(child)"
                                      [class.sidebar__item--disabled]="child.disabled"
                                      [disabled]="child.disabled"
                                      [attr.aria-current]="isActiveItem(child) ? 'page' : null"
                                      [attr.aria-label]="child.ariaLabel ?? child.label"
                                      role="menuitem"
                                      (click)="onItemClick(child, section.id, $event)"
                                    >
                                      <span
                                        class="sidebar__item-icon"
                                        [class.sidebar__item-icon--agent-x]="
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
                                      <span class="sidebar__item-label">{{ child.label }}</span>
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
            </div>
          }

          <!-- Workspace slot: host can project custom content (e.g. Agent X logs) -->
          @if (!isCollapsed() || isHoverExpanded()) {
            <div class="sidebar__workspace">
              <ng-content select="[sidebar-workspace]" />
            </div>
          }

          <!-- Legal Footer (inside scrollable nav, below Follow Us) -->
          @if (!isCollapsed() || isHoverExpanded()) {
            <footer class="sidebar__legal">
              <nav class="sidebar__legal-links" aria-label="Legal">
                <a routerLink="/terms" class="sidebar__legal-link">Terms of Service</a>
                <a routerLink="/privacy" class="sidebar__legal-link">Privacy Policy</a>
                <a
                  [href]="contactEmailHref"
                  class="sidebar__legal-link"
                  (click)="onContactEmailClick($event)"
                >
                  Contact Us
                </a>
              </nav>
              <p class="sidebar__copyright">
                &copy; {{ currentYear }} NXT1 Sports. All rights reserved.
              </p>
              <p class="sidebar__signature">Made With ❤️ By John Keller</p>
            </footer>
          }
        </nav>

        <!-- Bottom Section: Theme & User -->
        <div class="sidebar__bottom">
          <!-- Theme Toggle -->
          @if (config().showThemeToggle !== false) {
            <div class="sidebar__theme">
              @if (!isCollapsed() || isHoverExpanded()) {
                <nxt1-theme-selector
                  variant="compact"
                  [showLabels]="false"
                  [showAppearance]="true"
                  [showSportThemes]="true"
                  [singleRow]="true"
                />
              } @else {
                <button
                  type="button"
                  class="sidebar__item sidebar__item--collapsed"
                  (click)="toggleTheme($event)"
                  aria-label="Toggle theme"
                >
                  <span class="sidebar__item-icon">
                    <nxt1-icon [name]="theme.isDark() ? 'sun' : 'moon'" [size]="22" />
                  </span>
                  <span class="sidebar__tooltip">Toggle theme</span>
                </button>
              }
            </div>
          }

          <!-- Sign In Prompt (unauthenticated) -->
          @if (showSignInButton()) {
            <div class="sidebar__signin">
              @if (!isCollapsed() || isHoverExpanded()) {
                <a class="sidebar__signin-btn" routerLink="/auth" aria-label="Sign in"> Sign In </a>
              } @else {
                <button
                  type="button"
                  class="sidebar__item sidebar__item--collapsed sidebar__item--signin"
                  (click)="onSignInClick($event)"
                  aria-label="Sign in"
                >
                  <span class="sidebar__item-icon">
                    <nxt1-icon name="person" [size]="22" />
                  </span>
                  <span class="sidebar__tooltip">Sign in</span>
                </button>
              }
            </div>
          }

          <!-- User Section (authenticated) -->
          @if (config().showUserSection !== false && user()) {
            <div class="sidebar__user">
              <button
                type="button"
                class="sidebar__user-btn"
                [class.sidebar__user-btn--collapsed]="isCollapsed() && !isHoverExpanded()"
                (click)="onUserClick($event)"
                aria-label="User menu"
              >
                <nxt1-avatar
                  [src]="user()!.profileImg"
                  [name]="user()!.name"
                  [initials]="user()!.initials"
                  [size]="isCollapsed() && !isHoverExpanded() ? 'sm' : 'md'"
                  [badge]="user()!.verified ? 'verified' : undefined"
                />

                @if (!isCollapsed() || isHoverExpanded()) {
                  <div class="sidebar__user-info">
                    <span class="sidebar__user-name">{{ user()!.name }}</span>
                    @if (user()!.handle) {
                      <span class="sidebar__user-handle">{{ user()!.handle }}</span>
                    }
                  </div>
                  <nxt1-icon name="moreHorizontal" [size]="18" class="sidebar__user-more" />
                }
              </button>
            </div>
          }
        </div>
      }
    </aside>
  `,
  styles: [
    `
      /* ============================================
       CSS CUSTOM PROPERTIES (Design Tokens)
       ============================================ */
      :host {
        --sidebar-width-expanded: ${SIDEBAR_WIDTHS.EXPANDED}px;
        --sidebar-width-collapsed: ${SIDEBAR_WIDTHS.COLLAPSED}px;
        --sidebar-width-hover: ${SIDEBAR_WIDTHS.HOVER_EXPANDED}px;

        --sidebar-bg: var(--nxt1-color-bg-primary);
        --sidebar-border: var(--nxt1-color-border-default);
        --sidebar-text-primary: var(--nxt1-color-text-primary);
        --sidebar-text-secondary: var(--nxt1-color-text-secondary);
        --sidebar-text-tertiary: var(--nxt1-color-text-tertiary);

        --sidebar-item-hover: var(--nxt1-color-surface-200);
        --sidebar-item-active: var(--nxt1-color-surface-300);
        --sidebar-item-active-text: var(--nxt1-color-text-primary);
        --sidebar-item-radius: var(--nxt1-borderRadius-xl);

        --sidebar-accent: var(--nxt1-color-primary);
        --sidebar-badge-bg: var(--nxt1-color-error);
        --sidebar-badge-text: white;

        --sidebar-transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);

        display: block;
        height: 100%;
      }

      /* ============================================
       SIDEBAR CONTAINER
       ============================================ */
      .sidebar {
        display: flex;
        flex-direction: column;
        height: 100vh;
        height: 100dvh;
        width: var(--sidebar-width-expanded);
        background: var(--sidebar-bg);
        transition: width var(--sidebar-transition);
        overflow: hidden;
        position: sticky;
        top: 0;
        z-index: 50;
      }

      .sidebar--bordered {
        border-right: 1px solid var(--sidebar-border);
      }

      .sidebar--elevated {
        box-shadow: var(--nxt1-shadow-lg);
      }

      .sidebar--collapsed {
        width: var(--sidebar-width-collapsed);
      }

      .sidebar--hover-expanded {
        width: var(--sidebar-width-hover);
        position: absolute;
        box-shadow: var(--nxt1-shadow-2xl);
        z-index: 100;
      }

      /* ============================================
       LOGO SECTION
       ============================================ */
      .sidebar__logo {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-4, 1rem);
        min-height: var(--nxt1-spacing-14, 3.5rem);
      }

      .sidebar--bordered .sidebar__logo {
        border-bottom: 1px solid var(--sidebar-border);
      }

      .sidebar__menu-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-10, 2.5rem);
        height: var(--nxt1-spacing-10, 2.5rem);
        background: none;
        border: none;
        border-radius: var(--sidebar-item-radius);
        cursor: pointer;
        color: var(--sidebar-text-secondary);
        transition: all var(--sidebar-transition);
        flex-shrink: 0;
      }

      .sidebar__menu-btn:hover {
        background: var(--sidebar-item-hover);
        color: var(--sidebar-text-primary);
      }

      .sidebar__logo-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        border-radius: var(--sidebar-item-radius);
        transition: opacity var(--sidebar-transition);
      }

      .sidebar__logo-btn:hover {
        opacity: 0.8;
      }

      .sidebar--collapsed .sidebar__logo {
        justify-content: center;
        padding: var(--nxt1-spacing-3, 0.75rem);
      }

      /* ============================================
       NAVIGATION
       ============================================ */
      .sidebar__nav {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: var(--nxt1-spacing-2, 0.5rem);
        scrollbar-width: thin;
        scrollbar-color: var(--sidebar-border) transparent;
      }

      .sidebar__nav::-webkit-scrollbar {
        width: 4px;
      }

      .sidebar__nav::-webkit-scrollbar-track {
        background: transparent;
      }

      .sidebar__nav::-webkit-scrollbar-thumb {
        background: var(--sidebar-border);
        border-radius: 2px;
      }

      .sidebar__section {
        margin-bottom: var(--nxt1-spacing-3, 0.75rem);
      }

      .sidebar__section--last {
        margin-top: auto;
      }

      /* Projected workspace content (e.g. Agent X logs) */
      .sidebar__workspace {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        border-top: 1px solid var(--sidebar-border);
        margin-top: var(--nxt1-spacing-2, 0.5rem);
        scrollbar-width: thin;
        scrollbar-color: var(--sidebar-border) transparent;
      }

      .sidebar__workspace:empty {
        display: none;
      }

      .sidebar__section-label {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--sidebar-text-tertiary);
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-3, 0.75rem)
          var(--nxt1-spacing-2, 0.5rem);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Collapsible section toggle button */
      .sidebar__section-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-3, 0.75rem)
          var(--nxt1-spacing-2, 0.5rem);
        background: none;
        border: none;
        cursor: pointer;
        transition: color var(--sidebar-transition);
      }

      .sidebar__section-toggle:hover {
        color: var(--sidebar-text-secondary);
      }

      .sidebar__section-toggle:hover .sidebar__section-label--collapsible {
        color: var(--sidebar-text-secondary);
      }

      .sidebar__section-toggle:focus-visible {
        outline: 2px solid var(--sidebar-accent);
        outline-offset: -2px;
        border-radius: 6px;
      }

      .sidebar__section-label--collapsible {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--sidebar-text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: color var(--sidebar-transition);
      }

      .sidebar__section-chevron {
        flex-shrink: 0;
        color: var(--sidebar-text-tertiary);
        transition: transform var(--sidebar-transition);
        transform: rotate(0deg);
      }

      .sidebar__section-chevron--expanded {
        transform: rotate(180deg);
      }

      /* Collapsible section content */
      .sidebar__section-content {
        overflow: hidden;
      }

      .sidebar__section-content--collapsible {
        transition:
          max-height 250ms cubic-bezier(0.4, 0, 0.2, 1),
          opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
        max-height: 500px;
        opacity: 1;
      }

      .sidebar__section-content--collapsed {
        max-height: 0;
        opacity: 0;
        pointer-events: none;
      }

      .sidebar__items {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .sidebar__divider {
        height: 1px;
        background: var(--sidebar-border);
        margin: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem);
      }

      /* ============================================
       NAVIGATION ITEM
       ============================================ */
      .sidebar__item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        width: 100%;
        padding: var(--nxt1-spacing-2_5, 0.625rem) var(--nxt1-spacing-3, 0.75rem);
        background: none;
        border: none;
        border-radius: var(--sidebar-item-radius);
        cursor: pointer;
        color: var(--sidebar-text-secondary);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        text-align: left;
        transition: all var(--sidebar-transition);
        position: relative;
        white-space: nowrap;
      }

      .sidebar__item:hover:not(:disabled) {
        background: var(--sidebar-item-hover);
        color: var(--sidebar-text-primary);
      }

      .sidebar__item--active {
        background: var(--sidebar-item-active);
        color: var(--sidebar-item-active-text);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
      }

      .sidebar__item--active .sidebar__item-icon {
        color: var(--sidebar-accent);
      }

      .sidebar__item--disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .sidebar__item--collapsed {
        justify-content: center;
        padding: var(--nxt1-spacing-3, 0.75rem);
      }

      .sidebar__item-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: var(--nxt1-spacing-6, 1.5rem);
        height: var(--nxt1-spacing-6, 1.5rem);
        color: inherit;
      }

      /* Agent X Logo - larger size (matches footer FAB) */
      .sidebar__item-icon--agent-x {
        width: var(--nxt1-spacing-6, 1.5rem);
        height: var(--nxt1-spacing-6, 1.5rem);
        overflow: visible;
      }

      .sidebar__item-icon .agent-x-logo {
        display: block;
        width: var(--nxt1-spacing-10, 2.5rem);
        height: var(--nxt1-spacing-10, 2.5rem);
        margin-left: -2px;
      }

      .sidebar__item-label {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sidebar__item-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: var(--nxt1-spacing-5, 1.25rem);
        height: var(--nxt1-spacing-5, 1.25rem);
        padding: 0 var(--nxt1-spacing-1_5, 0.375rem);
        background: var(--sidebar-badge-bg);
        color: var(--sidebar-badge-text);
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
      }

      .sidebar__item-badge--collapsed {
        position: absolute;
        top: var(--nxt1-spacing-1_5, 0.375rem);
        right: var(--nxt1-spacing-2_5, 0.625rem);
        min-width: var(--nxt1-spacing-2, 0.5rem);
        height: var(--nxt1-spacing-2, 0.5rem);
        padding: 0;
        font-size: 0;
      }

      /* ============================================
       EXPANDABLE ITEM (Children / Sub-list)
       ============================================ */
      .sidebar__item--expandable {
        cursor: pointer;
      }

      .sidebar__item-chevron {
        flex-shrink: 0;
        color: var(--sidebar-text-tertiary);
        transition: transform var(--sidebar-transition);
        transform: rotate(0deg);
        margin-left: auto;
      }

      .sidebar__item-chevron--expanded {
        transform: rotate(180deg);
      }

      .sidebar__children {
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

      .sidebar__children--collapsed {
        max-height: 0;
        padding-top: 0;
        padding-bottom: 0;
        opacity: 0;
        pointer-events: none;
      }

      .sidebar__item--child {
        padding: var(--nxt1-spacing-2_5, 0.625rem) var(--nxt1-spacing-3, 0.75rem);
        gap: var(--nxt1-spacing-2_5, 0.625rem);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-regular, 400);
      }

      .sidebar__item--child .sidebar__item-icon {
        width: var(--nxt1-spacing-5, 1.25rem);
        height: var(--nxt1-spacing-5, 1.25rem);
      }

      /* ============================================
       TOOLTIP (Collapsed State)
       ============================================ */
      .sidebar__tooltip {
        position: absolute;
        left: calc(100% + var(--nxt1-spacing-3, 0.75rem));
        top: 50%;
        transform: translateY(-50%);
        padding: var(--nxt1-spacing-1_5, 0.375rem) var(--nxt1-spacing-3, 0.75rem);
        background: var(--nxt1-color-surface-300);
        color: var(--sidebar-text-primary);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        border-radius: var(--nxt1-borderRadius-lg, 0.5rem);
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: all 150ms ease;
        box-shadow: var(--nxt1-shadow-lg);
        z-index: 1000;
      }

      .sidebar__tooltip::before {
        content: '';
        position: absolute;
        left: calc(-1 * var(--nxt1-spacing-1_5, 0.375rem));
        top: 50%;
        transform: translateY(-50%);
        border: var(--nxt1-spacing-1_5, 0.375rem) solid transparent;
        border-right-color: var(--nxt1-color-surface-300);
      }

      .sidebar__item:hover .sidebar__tooltip {
        opacity: 1;
        visibility: visible;
      }

      /* ============================================
       BOTTOM SECTION (Theme + User)
       ============================================ */
      .sidebar__bottom {
        flex-shrink: 0;
        border-top: 1px solid var(--sidebar-border);
      }

      /* ============================================
       THEME TOGGLE
       ============================================ */
      .sidebar__theme {
        padding: var(--nxt1-spacing-2, 0.5rem);
      }

      /* ============================================
       USER SECTION
       ============================================ */
      .sidebar__user {
        padding: var(--nxt1-spacing-2, 0.5rem);
        border-top: 1px solid var(--sidebar-border);
      }

      .sidebar__user-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        width: 100%;
        padding: var(--nxt1-spacing-2, 0.5rem);
        background: none;
        border: none;
        border-radius: var(--sidebar-item-radius);
        cursor: pointer;
        transition: background var(--sidebar-transition);
      }

      .sidebar__user-btn:hover {
        background: var(--sidebar-item-hover);
      }

      .sidebar__user-btn--collapsed {
        justify-content: center;
      }

      .sidebar__user-info {
        flex: 1;
        min-width: 0;
        text-align: left;
      }

      .sidebar__user-name {
        display: block;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--sidebar-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .sidebar__user-handle {
        display: block;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--sidebar-text-tertiary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .sidebar__user-more {
        color: var(--sidebar-text-tertiary);
        flex-shrink: 0;
      }

      .sidebar__signature {
        margin: var(--nxt1-spacing-2, 0.5rem) 0 0;
        padding-top: var(--nxt1-spacing-1, 0.25rem);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        line-height: var(--nxt1-lineHeight-normal, 1.5);
        color: var(--sidebar-text-muted);
        text-align: center;
      }

      /* ============================================
       SIGN IN PROMPT
       ============================================ */
      .sidebar__signin {
        padding: var(--nxt1-spacing-2, 0.5rem);
        border-top: 1px solid var(--sidebar-border);
      }

      .sidebar__signin-btn {
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
          background-color var(--sidebar-transition),
          transform var(--sidebar-transition),
          box-shadow var(--sidebar-transition);
      }

      .sidebar__signin-btn:hover {
        background: var(--nxt1-color-primary-dark, var(--nxt1-color-primary));
        transform: translateY(-1px);
      }

      .sidebar__signin-btn:active {
        transform: translateY(0);
        box-shadow: var(--nxt1-glow-sm);
      }

      .sidebar__signin-btn:focus-visible {
        outline: 2px solid var(--sidebar-accent);
        outline-offset: 2px;
      }

      .sidebar__item--signin {
        color: var(--nxt1-color-primary);
      }

      .sidebar__item--signin:hover:not(:disabled) {
        background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
      }

      /* ============================================
       LEGAL FOOTER
       ============================================ */
      .sidebar__legal {
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-4, 1rem)
          var(--nxt1-spacing-4, 1rem);
        border-top: 1px solid var(--sidebar-border);
        margin-left: calc(-1 * var(--nxt1-spacing-2, 0.5rem));
        margin-right: calc(-1 * var(--nxt1-spacing-2, 0.5rem));
      }

      .sidebar__legal-links {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-1, 0.25rem) var(--nxt1-spacing-3, 0.75rem);
        margin-bottom: var(--nxt1-spacing-2, 0.5rem);
      }

      .sidebar__legal-link {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-regular, 400);
        color: var(--sidebar-text-muted);
        text-decoration: none;
        line-height: var(--nxt1-lineHeight-relaxed, 1.625);
        transition: color 0.15s ease;
      }

      .sidebar__legal-link:hover {
        color: var(--sidebar-text);
      }

      .sidebar__legal-link:focus-visible {
        outline: 2px solid var(--sidebar-accent);
        outline-offset: 2px;
        border-radius: 2px;
      }

      .sidebar__copyright {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        color: var(--sidebar-text-muted);
        margin: 0;
        line-height: var(--nxt1-lineHeight-normal, 1.5);
      }

      /* ============================================
       SKELETON LOADING STATE
       ============================================ */
      .sidebar__nav--loading {
        pointer-events: none;
      }

      .sidebar__skeleton-section {
        margin-bottom: var(--nxt1-spacing-4, 1rem);
      }

      .sidebar__skeleton-label {
        height: 10px;
        width: 60px;
        background: var(--nxt1-color-surface-200);
        border-radius: 4px;
        margin: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-3, 0.75rem)
          var(--nxt1-spacing-2, 0.5rem);
        animation: skeleton-pulse 1.5s ease-in-out infinite;
      }

      .sidebar__skeleton-item {
        height: 44px;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--sidebar-item-radius);
        margin-bottom: var(--nxt1-spacing-1, 0.25rem);
        animation: skeleton-pulse 1.5s ease-in-out infinite;
      }

      .sidebar__skeleton-item:nth-child(2) {
        animation-delay: 0.1s;
      }

      .sidebar__skeleton-item:nth-child(3) {
        animation-delay: 0.2s;
      }

      .sidebar__skeleton-item:nth-child(4) {
        animation-delay: 0.3s;
      }

      .sidebar__skeleton-item:nth-child(5) {
        animation-delay: 0.4s;
      }

      @keyframes skeleton-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }

      .sidebar--collapsed .sidebar__skeleton-label,
      .sidebar--collapsed .sidebar__skeleton-section {
        margin-left: var(--nxt1-spacing-2, 0.5rem);
        margin-right: var(--nxt1-spacing-2, 0.5rem);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtDesktopSidebarComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly browser = inject(NxtBrowserService);
  protected readonly theme = inject(NxtThemeService);
  private readonly sidebarNav = viewChild<ElementRef<HTMLElement>>('sidebarNav');

  /** Opens the desktop mail client for support. */
  protected readonly contactEmailHref = `mailto:${SUPPORT_CONFIG.SUPPORT_EMAIL}`;

  /** Storage key for preserving nav scroll position. */
  private readonly navScrollStorageKey = 'nxt1_sidebar_nav_scroll_top';

  /** Current year for copyright line. */
  protected readonly currentYear = new Date().getFullYear();

  // ============================================
  // INPUTS
  // ============================================

  /** Navigation sections */
  readonly sections = input<readonly DesktopSidebarSection[]>(DEFAULT_DESKTOP_SIDEBAR_SECTIONS);

  /** User data for footer section */
  readonly user = input<DesktopSidebarUserData | null>(null);

  /** Configuration */
  readonly config = input<DesktopSidebarConfig>(DEFAULT_DESKTOP_SIDEBAR_CONFIG);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when an item is selected */
  readonly itemSelect = output<DesktopSidebarSelectEvent>();

  /** Emitted when user section is clicked */
  readonly userClick = output<Event>();

  /** Emitted when logo is clicked */
  readonly logoClick = output<Event>();

  /** Emitted when sign-in is clicked */
  readonly signInClick = output<Event>();

  /** Emitted when collapse state changes */
  readonly collapseChange = output<boolean>();

  // ============================================
  // STATE
  // ============================================

  /** Current route path */
  private readonly _currentRoute = signal('/');

  /** Whether sidebar is collapsed */
  private readonly _isCollapsed = signal(false);

  /** Whether sidebar is hover-expanded (when collapsed but mouse is over) */
  private readonly _isHoverExpanded = signal(false);

  /** Tracks expanded state for collapsible sections by section ID */
  private readonly _expandedSections = signal<ReadonlySet<string>>(new Set<string>());

  /** Computed: is collapsed (respects config and stored preference) */
  readonly isCollapsed = computed(() => this._isCollapsed());

  /** Computed: is hover expanded */
  readonly isHoverExpanded = computed(() => this._isCollapsed() && this._isHoverExpanded());

  /**
   * Computed: whether to show sign-in button.
   * Trusts the parent's `config().showSignIn` which is gated by `isAuthReady`.
   * No internal timing hack needed — the auth service controls the flag.
   */
  readonly showSignInButton = computed(() => !this.user() && this.config().showSignIn !== false);

  // ============================================
  // HOST BINDINGS
  // ============================================

  @HostBinding('class.sidebar-collapsed')
  get hostCollapsed(): boolean {
    return this._isCollapsed();
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    // Initialize route tracking
    this._currentRoute.set(this.router.url);

    // Initialize expanded sections from section defaults
    this.initExpandedSections();

    // Track route changes
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        this._currentRoute.set(event.urlAfterRedirects);
        this.restoreNavScrollPosition();
      });

    // Initialize from storage (browser only)
    afterNextRender(() => {
      this.loadCollapsedState();
      this.initializeNavScrollPersistence();
      this.restoreNavScrollPosition();
    });
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Check if an item is active based on current route.
   */
  isActiveItem(item: DesktopSidebarItem): boolean {
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
   * Check if a collapsible section is currently expanded.
   */
  isSectionExpanded(sectionId: string): boolean {
    return this._expandedSections().has(sectionId);
  }

  /**
   * Toggle a collapsible section's expanded state.
   */
  toggleSection(sectionId: string): void {
    this._expandedSections.update((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

  /**
   * Handle click on an item that may have children.
   * - Items with children: toggle expand only (never navigate).
   * - Items without children: normal navigation.
   */
  onExpandableItemClick(item: DesktopSidebarItem, sectionId: string, event: Event): void {
    if (item.children?.length) {
      event.preventDefault();
      event.stopPropagation();

      // In collapsed mode, open sidebar normally (non-hover) before toggling
      // so dropdown content opens predictably on tap.
      if (this.isCollapsed()) {
        this.setCollapsed(false);
      }

      this.toggleSection(item.id);
    } else {
      this.onItemClick(item, sectionId, event);
    }
  }

  /**
   * Toggle collapsed state.
   */
  toggleCollapse(event?: Event): void {
    event?.stopPropagation();
    const newState = !this._isCollapsed();
    this._isCollapsed.set(newState);
    this._isHoverExpanded.set(false);
    this.saveCollapsedState(newState);
    this.collapseChange.emit(newState);
  }

  /**
   * Set collapsed state programmatically.
   */
  setCollapsed(collapsed: boolean): void {
    this._isCollapsed.set(collapsed);
    this._isHoverExpanded.set(false);
    this.saveCollapsedState(collapsed);
    this.collapseChange.emit(collapsed);
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  onMouseEnter(): void {
    if (this._isCollapsed() && this.config().expandOnHover !== false) {
      this._isHoverExpanded.set(true);
    }
  }

  onMouseLeave(): void {
    this._isHoverExpanded.set(false);
  }

  onItemClick(item: DesktopSidebarItem, sectionId: string, event: Event): void {
    if (item.disabled) return;

    // Handle special actions
    if (item.action) {
      this.itemSelect.emit({ item, sectionId, event });
      return;
    }

    // Handle external links
    if (item.href) {
      window.open(item.href, '_blank', 'noopener,noreferrer');
      return;
    }

    // Handle route navigation
    if (item.route) {
      this.persistNavScrollPosition();
      this.router.navigate([item.route]);
      this.itemSelect.emit({ item, sectionId, event });
    }
  }

  onUserClick(event: Event): void {
    this.userClick.emit(event);
  }

  onLogoClick(event: Event): void {
    this.logoClick.emit(event);
  }

  onSignInClick(event: Event): void {
    this.router.navigate(['/auth']);
    this.signInClick.emit(event);
  }

  onContactEmailClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    void this.openContactEmail();
  }

  toggleTheme(event: Event): void {
    event.stopPropagation();
    if (this.theme.hasSportTheme()) {
      this.theme.clearSportTheme();
    }
    this.theme.toggle();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private async openContactEmail(): Promise<void> {
    await this.browser.openMailto({
      to: SUPPORT_CONFIG.SUPPORT_EMAIL,
      subject: 'Support Request - NXT1 Sports',
      body: ['Hi NXT1 Support Team,', '', 'I need help with:', '', 'My account email:'].join('\n'),
    });
  }

  /**
   * Initialize _expandedSections from section.expanded defaults.
   * Called once in constructor. Sections with expanded: true are pre-opened.
   */
  private initExpandedSections(): void {
    const expanded = new Set<string>();
    for (const section of this.sections()) {
      if (section.collapsible && section.expanded !== false) {
        expanded.add(section.id);
      }
      // Also init expandable items (items with children)
      for (const item of section.items) {
        if (item.children && item.expanded) {
          expanded.add(item.id);
        }
      }
    }
    this._expandedSections.set(expanded);
  }

  private loadCollapsedState(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const config = this.config();
    if (!config.persistState) return;

    const key = config.storageKey ?? 'nxt1_sidebar_collapsed';
    const stored = localStorage.getItem(key);

    if (stored !== null) {
      this._isCollapsed.set(stored === 'true');
    } else if (config.collapsed !== undefined) {
      this._isCollapsed.set(config.collapsed);
    }
  }

  private saveCollapsedState(collapsed: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const config = this.config();
    if (!config.persistState) return;

    const key = config.storageKey ?? 'nxt1_sidebar_collapsed';
    localStorage.setItem(key, String(collapsed));
  }

  /**
   * Registers scroll listener on nav container to persist scroll position.
   */
  private initializeNavScrollPersistence(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const nav = this.sidebarNav()?.nativeElement;
    if (!nav) return;

    const onScroll = (): void => {
      localStorage.setItem(this.navScrollStorageKey, String(nav.scrollTop));
    };

    nav.addEventListener('scroll', onScroll, { passive: true });
    this.destroyRef.onDestroy(() => {
      nav.removeEventListener('scroll', onScroll);
    });
  }

  /**
   * Persists current nav scroll position immediately.
   */
  private persistNavScrollPosition(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const nav = this.sidebarNav()?.nativeElement;
    if (!nav) return;

    localStorage.setItem(this.navScrollStorageKey, String(nav.scrollTop));
  }

  /**
   * Restores nav scroll position from persisted state.
   */
  private restoreNavScrollPosition(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const nav = this.sidebarNav()?.nativeElement;
    if (!nav) return;

    const stored = localStorage.getItem(this.navScrollStorageKey);
    if (stored === null) return;

    const scrollTop = Number(stored);
    if (!Number.isFinite(scrollTop) || scrollTop < 0) return;

    requestAnimationFrame(() => {
      nav.scrollTop = scrollTop;
    });
  }
}
