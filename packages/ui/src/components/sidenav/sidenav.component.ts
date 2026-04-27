/**
 * @fileoverview NxtSidenavComponent - Ionic-Based Sidenav/Drawer Navigation
 * @module @nxt1/ui/components/sidenav
 * @version 2.0.0
 *
 * Professional sidenav/drawer component built on Ionic's ion-menu with
 * Twitter/X-inspired design. Uses Ionic's native menu infrastructure
 * while maintaining our custom styling, gestures, and design tokens.
 *
 * Design Philosophy:
 * - Built on Ionic's `ion-menu` for native platform feel
 * - Twitter/X-inspired smooth slide animations
 * - Glassmorphism backdrop blur effects
 * - Platform-adaptive styling (iOS/Android)
 * - Full design token + Tailwind theme awareness
 * - Social links footer section
 * - Expandable section groups
 * - Full haptic feedback support
 *
 * Features:
 * - Ionic's native gesture handling (with custom override option)
 * - Backdrop overlay with dismiss
 * - User profile header section
 * - Collapsible menu sections
 * - Social media links footer
 * - Badge support on menu items
 * - Route-based active detection
 * - Full accessibility (ARIA)
 * - SSR-safe implementation
 * - 100% theme-aware (Tailwind + CSS variables)
 *
 * Usage:
 * ```html
 * <nxt1-sidenav
 *   [sections]="menuSections"
 *   [user]="currentUser"
 *   [config]="sidenavConfig"
 *   (itemSelect)="onItemSelect($event)"
 *   (toggle)="onToggle($event)"
 * />
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  effect,
  input,
  output,
  HostBinding,
  HostListener,
  PLATFORM_ID,
  afterNextRender,
  DestroyRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import {
  IonMenu,
  IonHeader,
  IonToolbar,
  IonContent,
  IonMenuToggle,
  MenuController,
} from '@ionic/angular/standalone';
import { NxtIconComponent } from '../icon';
import { NxtAvatarComponent } from '../avatar';
import { NxtPlatformService } from '../../services/platform';
import { HapticsService } from '../../services/haptics';
import { NxtSidenavService } from './sidenav.service';
import { AgentXOperationsLogComponent } from '../../agent-x/agent-x-operations-log.component';
import { AgentXOperationChatComponent } from '../../agent-x/agent-x-operation-chat.component';
import { NxtBottomSheetService, SHEET_PRESETS } from '../bottom-sheet';
import { NxtFloatingActionBarComponent } from '../floating-action-bar';
import type { FloatingActionBarConfig, FloatingBarFollowItem } from '../floating-action-bar';
import type { OperationLogEntry } from '@nxt1/core';
import type {
  SidenavSection,
  SidenavItem,
  SidenavUserData,
  SidenavConfig,
  SocialLink,
  SidenavToggleEvent,
} from './sidenav.types';
import { DEFAULT_SOCIAL_LINKS, DEFAULT_SIDENAV_ITEMS, createSidenavConfig } from './sidenav.types';
import type { SidenavItemSelectEvent } from './sidenav.types';
import { formatSportDisplayName } from '@nxt1/core';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

@Component({
  selector: 'nxt1-sidenav',
  standalone: true,
  imports: [
    // Ionic Components
    IonMenu,
    IonHeader,
    IonToolbar,
    IonContent,
    IonMenuToggle,
    // Custom Components
    NxtIconComponent,
    NxtAvatarComponent,
    AgentXOperationsLogComponent,
    NxtFloatingActionBarComponent,
  ],
  template: `
    <!-- Ionic Menu Component - provides native gestures and animations -->
    <ion-menu
      #ionMenu
      [contentId]="contentId()"
      [side]="config().position === 'right' ? 'end' : 'start'"
      [type]="config().mode === 'push' ? 'push' : 'overlay'"
      [swipeGesture]="menuSwipeGestureEnabled()"
      [maxEdgeStart]="60"
      class="nxt1-sidenav-menu"
      [class.nxt1-sidenav-menu--blur]="config().variant === 'blur'"
      (ionWillOpen)="onMenuWillOpen()"
      (ionDidOpen)="onMenuDidOpen()"
      (ionWillClose)="onMenuWillClose()"
      (ionDidClose)="onMenuDidClose()"
    >
      <!-- Header Section - Compact Profile List Item -->
      @if (config().showUserHeader && user()) {
        <ion-header class="nxt1-sidenav-header ion-no-border">
          <ion-toolbar class="nxt1-sidenav-toolbar">
            <section class="nxt1-sidenav-switcher" aria-label="Profile switcher">
              <span class="nxt1-sidenav-switcher__label">{{ getSwitcherTitle(user()!) }}</span>

              <div class="nxt1-sidenav-switcher__panel">
                <div class="nxt1-sidenav-profile-row">
                  <!-- Tappable profile area: avatar + info -->
                  @if (user()!.isTeamRole && !user()!.isOnTeam && user()!.canAddProfile) {
                    <button
                      class="nxt1-sidenav-profile-row__main"
                      (click)="onAddSportClick($event)"
                      aria-label="Add team"
                    >
                      <div class="nxt1-sidenav-profile-row__avatar">
                        <nxt1-avatar
                          [src]="user()!.profileImg"
                          [name]="user()!.actionLabel || 'Add Team'"
                          initials="AT"
                          [isTeamRole]="true"
                          size="md"
                          [showSkeleton]="false"
                          class="nxt1-sidenav-profile-row__avatar-img"
                        />
                      </div>

                      <div class="nxt1-sidenav-profile-row__info">
                        <span class="nxt1-sidenav-profile-row__name">
                          {{ user()!.actionLabel || 'Add Team' }}
                        </span>
                        <span class="nxt1-sidenav-profile-row__sport">Set up your first team</span>
                      </div>
                    </button>
                  } @else {
                    <button
                      class="nxt1-sidenav-profile-row__main"
                      (click)="onProfileClick()"
                      aria-label="View profile"
                    >
                      <div class="nxt1-sidenav-profile-row__avatar">
                        <nxt1-avatar
                          [src]="user()!.profileImg"
                          [name]="user()!.name"
                          [initials]="user()!.initials"
                          [isTeamRole]="user()!.isTeamRole"
                          size="md"
                          [showSkeleton]="false"
                          class="nxt1-sidenav-profile-row__avatar-img"
                        />
                      </div>

                      <div class="nxt1-sidenav-profile-row__info">
                        <span class="nxt1-sidenav-profile-row__name">
                          {{ user()!.name }}
                        </span>
                        <span class="nxt1-sidenav-profile-row__sport">
                          {{ getUserSportLabel(user()!) }}
                        </span>
                      </div>
                    </button>
                  }

                  <!-- Expand arrow for sport profiles / add action -->
                  @if (
                    !(user()!.isTeamRole && !user()!.isOnTeam && user()!.canAddProfile) &&
                    ((user()!.sportProfiles?.length ?? 0) > 0 || user()!.actionLabel)
                  ) {
                    <button
                      class="nxt1-sidenav-profile-row__expand"
                      [class.nxt1-sidenav-profile-row__expand--open]="sportsExpanded()"
                      (click)="toggleSportsExpanded($event)"
                      [attr.aria-expanded]="sportsExpanded()"
                      [attr.aria-label]="'Show ' + getSwitcherTitle(user()!).toLowerCase()"
                    >
                      <nxt1-icon name="chevronDown" [size]="18" />
                    </button>
                  }
                </div>

                <!-- Expandable sport profiles list -->
                @if (
                  !(user()!.isTeamRole && !user()!.isOnTeam && user()!.canAddProfile) &&
                  sportsExpanded() &&
                  ((user()!.sportProfiles?.length ?? 0) > 0 || user()!.actionLabel)
                ) {
                  <div class="nxt1-sidenav-sport-list">
                    @for (profile of user()!.sportProfiles; track profile.id) {
                      <button
                        class="nxt1-sidenav-sport-list__item"
                        [class.nxt1-sidenav-sport-list__item--active]="profile.isActive"
                        (click)="onSportProfileSelect(profile, $event)"
                        [attr.aria-label]="'Switch to ' + formatSportDisplay(profile.sport)"
                      >
                        <nxt1-avatar
                          [src]="profile.profileImg || user()?.profileImg"
                          [name]="user()?.name"
                          [isTeamRole]="user()!.isTeamRole ?? false"
                          [defaultIcon]="user()!.isTeamRole ? 'shield' : ''"
                          [customSize]="28"
                          [showSkeleton]="false"
                        />
                        <div class="nxt1-sidenav-sport-list__info">
                          <span class="nxt1-sidenav-sport-list__name">{{
                            formatSportDisplay(profile.sport)
                          }}</span>
                          @if (profile.position) {
                            <span class="nxt1-sidenav-sport-list__position">{{
                              profile.position
                            }}</span>
                          }
                        </div>
                        @if (profile.isActive) {
                          <nxt1-icon
                            name="checkmark"
                            [size]="16"
                            class="nxt1-sidenav-sport-list__check"
                          />
                        }
                      </button>
                    }

                    @if (user()?.canAddProfile) {
                      <!-- Add sport/team button — label from user context -->
                      <button
                        class="nxt1-sidenav-sport-list__item nxt1-sidenav-sport-list__item--add"
                        (click)="onAddSportClick($event)"
                        [attr.aria-label]="user()?.actionLabel || 'Add Sport'"
                      >
                        <div class="nxt1-sidenav-sport-list__add-icon">
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
                        <span class="nxt1-sidenav-sport-list__name">{{
                          user()?.actionLabel || 'Add Sport'
                        }}</span>
                      </button>
                    }
                  </div>
                }
              </div>
            </section>
          </ion-toolbar>
        </ion-header>
      }

      <!-- Navigation Content -->
      <ion-content class="nxt1-sidenav-content">
        <nav class="nxt1-sidenav-nav">
          @for (section of sections(); track section.id) {
            <div
              class="nxt1-sidenav-section"
              [class.nxt1-sidenav-section--collapsible]="section.collapsible"
            >
              <!-- Section Header -->
              @if (section.label) {
                @if (section.collapsible) {
                  <button
                    class="nxt1-sidenav-section__header nxt1-sidenav-section__header--clickable"
                    (click)="toggleSection(section, $event)"
                    [attr.aria-expanded]="isSectionExpanded(section)"
                    [attr.aria-controls]="'section-' + section.id"
                  >
                    @if (section.icon) {
                      <nxt1-icon
                        [name]="section.icon"
                        [size]="18"
                        class="nxt1-sidenav-section__icon"
                      />
                    }
                    <span class="nxt1-sidenav-section__label">{{ section.label }}</span>
                    <nxt1-icon
                      name="chevronDown"
                      [size]="16"
                      class="nxt1-sidenav-section__chevron"
                      [class.nxt1-sidenav-section__chevron--expanded]="isSectionExpanded(section)"
                    />
                  </button>
                } @else {
                  <div class="nxt1-sidenav-section__header">
                    @if (section.icon) {
                      <nxt1-icon
                        [name]="section.icon"
                        [size]="18"
                        class="nxt1-sidenav-section__icon"
                      />
                    }
                    <span class="nxt1-sidenav-section__label">{{ section.label }}</span>
                  </div>
                }
              }

              <!-- Section Items -->
              <div
                class="nxt1-sidenav-section__items"
                [id]="'section-' + section.id"
                [class.nxt1-sidenav-section__items--collapsed]="
                  section.collapsible && !isSectionExpanded(section)
                "
              >
                @if (section.layout === 'grid') {
                  <!-- ─── GRID LAYOUT: compact icon+label tiles in a single row ─── -->
                  <div class="nxt1-sidenav-grid" role="menu">
                    @for (item of section.items; track item.id) {
                      @if (!item.hidden) {
                        <ion-menu-toggle [autoHide]="false">
                          <button
                            type="button"
                            class="nxt1-sidenav-grid__item"
                            [class.nxt1-sidenav-grid__item--active]="isItemActive(item)"
                            [class.nxt1-sidenav-grid__item--disabled]="item.disabled"
                            [disabled]="item.disabled"
                            [attr.aria-current]="isItemActive(item) ? 'page' : null"
                            [attr.aria-label]="item.ariaLabel ?? item.label"
                            role="menuitem"
                            (click)="onItemClick(item, section.id, $event)"
                          >
                            <span class="nxt1-sidenav-grid__icon-wrap">
                              <nxt1-icon [name]="item.icon ?? 'help'" [size]="20" />
                            </span>
                            <span class="nxt1-sidenav-grid__label">
                              {{ item.shortLabel ?? item.label }}
                            </span>
                          </button>
                        </ion-menu-toggle>
                      }
                    }
                  </div>
                } @else {
                  @for (item of section.items; track item.id) {
                    @if (!item.hidden) {
                      <!-- Divider -->
                      @if (item.divider) {
                        <div class="nxt1-sidenav-divider"></div>
                      }

                      <!-- Section Header Item -->
                      @if (item.isSection) {
                        <div class="nxt1-sidenav-item nxt1-sidenav-item--section">
                          <span>{{ item.label }}</span>
                        </div>
                      } @else {
                        <!-- Regular Menu Item - wrapped in IonMenuToggle for auto-close -->
                        <ion-menu-toggle [autoHide]="false">
                          <button
                            class="nxt1-sidenav-item"
                            [class.nxt1-sidenav-item--active]="isItemActive(item)"
                            [class.nxt1-sidenav-item--disabled]="item.disabled"
                            [class.nxt1-sidenav-item--danger]="item.variant === 'danger'"
                            [class.nxt1-sidenav-item--premium]="item.variant === 'premium'"
                            [class.nxt1-sidenav-item--has-children]="
                              item.children && item.children.length > 0
                            "
                            [disabled]="item.disabled"
                            (click)="onItemClick(item, section.id, $event)"
                            [attr.aria-current]="isItemActive(item) ? 'page' : null"
                          >
                            @if (item.icon) {
                              <div
                                class="nxt1-sidenav-item__icon"
                                [class.nxt1-sidenav-item__icon--agent-x]="isAgentXIcon(item.icon)"
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
                                    <path [attr.d]="agentXLogoPath" />
                                    <polygon [attr.points]="agentXLogoPolygon" />
                                  </svg>
                                } @else {
                                  <nxt1-icon [name]="item.icon" [size]="22" />
                                }
                              </div>
                            }

                            <div class="nxt1-sidenav-item__content">
                              <span class="nxt1-sidenav-item__label">{{ item.label }}</span>
                              @if (item.description) {
                                <span class="nxt1-sidenav-item__description">{{
                                  item.description
                                }}</span>
                              }
                            </div>

                            @if (item.badge && item.badge > 0) {
                              <span
                                class="nxt1-sidenav-item__badge"
                                [class.nxt1-sidenav-item__badge--danger]="
                                  item.badgeVariant === 'danger'
                                "
                                [class.nxt1-sidenav-item__badge--warning]="
                                  item.badgeVariant === 'warning'
                                "
                                [class.nxt1-sidenav-item__badge--primary]="
                                  item.badgeVariant === 'primary'
                                "
                              >
                                {{ item.badge > 99 ? '99+' : item.badge }}
                              </span>
                            }

                            @if (item.children && item.children.length > 0) {
                              <nxt1-icon
                                name="chevronRight"
                                [size]="16"
                                class="nxt1-sidenav-item__arrow"
                              />
                            }
                          </button>
                        </ion-menu-toggle>

                        <!-- Child Items -->
                        @if (item.children && item.children.length > 0 && item.expanded) {
                          <div class="nxt1-sidenav-children">
                            @for (child of item.children; track child.id) {
                              @if (!child.hidden) {
                                <ion-menu-toggle [autoHide]="false">
                                  <button
                                    class="nxt1-sidenav-item nxt1-sidenav-item--child"
                                    [class.nxt1-sidenav-item--active]="isItemActive(child)"
                                    [class.nxt1-sidenav-item--disabled]="child.disabled"
                                    [disabled]="child.disabled"
                                    (click)="onItemClick(child, section.id, $event, item.id)"
                                  >
                                    @if (child.icon) {
                                      <div
                                        class="nxt1-sidenav-item__icon"
                                        [class.nxt1-sidenav-item__icon--agent-x]="
                                          isAgentXIcon(child.icon)
                                        "
                                      >
                                        @if (isAgentXIcon(child.icon)) {
                                          <!-- Agent X Logo SVG - Theme-aware (same as footer) -->
                                          <svg
                                            class="agent-x-logo"
                                            viewBox="0 0 612 792"
                                            width="35"
                                            height="35"
                                            fill="currentColor"
                                            stroke="currentColor"
                                            stroke-width="12"
                                            stroke-linejoin="round"
                                            aria-hidden="true"
                                          >
                                            <path [attr.d]="agentXLogoPath" />
                                            <polygon [attr.points]="agentXLogoPolygon" />
                                          </svg>
                                        } @else {
                                          <nxt1-icon [name]="child.icon" [size]="18" />
                                        }
                                      </div>
                                    }
                                    <span class="nxt1-sidenav-item__label">{{ child.label }}</span>
                                    @if (child.badge && child.badge > 0) {
                                      <span class="nxt1-sidenav-item__badge">
                                        {{ child.badge > 99 ? '99+' : child.badge }}
                                      </span>
                                    }
                                  </button>
                                </ion-menu-toggle>
                              }
                            }
                          </div>
                        }
                      }
                    }
                  }
                }
                <!-- end @else list layout -->
              </div>
            </div>
          }
        </nav>

        <!-- Sessions Panel (Agent X) -->
        <div class="nxt1-sidenav-sessions">
          <div class="nxt1-sidenav-sessions__header">
            <div class="nxt1-sidenav-sessions__title-row">
              <div class="nxt1-sidenav-sessions__title-group">
                <h3 class="nxt1-sidenav-sessions__title">Sessions</h3>
                <p class="nxt1-sidenav-sessions__subtitle">Recent agent runs</p>
              </div>
            </div>
          </div>
          <nxt1-agent-x-operations-log [embedded]="true" (entryTap)="onLogEntryTap($event)" />
        </div>
      </ion-content>

      <!-- FAB overlay — spans full menu height so the slide-up panel is never clipped -->
      <div class="nxt1-sidenav-fab-footer">
        <nxt1-floating-action-bar
          [config]="floatingBarConfig()"
          [followItems]="fabFollowItems()"
          (linkClick)="onFloatingLinkClick()"
          (ctaAction)="onNewSession()"
        />
      </div>
    </ion-menu>
  `,
  styles: [
    `
      /* ============================================
         CSS CUSTOM PROPERTIES (Design Tokens)
         ============================================ */
      :host {
        --nxt1-sidenav-width: 280px;
        --nxt1-sidenav-bg: var(--nxt1-color-surface-secondary, var(--ion-background-color));
        --nxt1-sidenav-bg-blur: var(--nxt1-glass-bg, rgba(0, 0, 0, 0.8));
        --nxt1-sidenav-border: var(--nxt1-color-border-default, var(--ion-border-color));
        --nxt1-sidenav-shadow: var(--nxt1-glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.3));

        --nxt1-sidenav-header-bg: var(
          --nxt1-color-background-primary,
          var(--ion-toolbar-background)
        );
        --nxt1-sidenav-header-border: var(--nxt1-color-border-default, var(--ion-border-color));

        --nxt1-sidenav-text-primary: var(--nxt1-color-text-primary, var(--ion-text-color));
        --nxt1-sidenav-text-secondary: var(
          --nxt1-color-text-secondary,
          var(--ion-text-color-step-400)
        );
        --nxt1-sidenav-text-tertiary: var(
          --nxt1-color-text-tertiary,
          var(--ion-text-color-step-600)
        );

        --nxt1-sidenav-item-hover: var(--nxt1-color-surface-200, var(--ion-color-step-100));
        --nxt1-sidenav-item-active: var(--nxt1-color-surface-300, var(--ion-color-step-150));
        --nxt1-sidenav-item-radius: var(--nxt1-radius-lg, 12px);

        --nxt1-sidenav-accent: var(--nxt1-color-primary, var(--ion-color-primary));
        --nxt1-sidenav-danger: var(--nxt1-color-feedback-error, var(--ion-color-danger));
        --nxt1-sidenav-warning: var(--nxt1-color-feedback-warning, var(--ion-color-warning));

        display: block;
      }

      /* ============================================
         ION-MENU OVERRIDES (Design Token Integration)
         ============================================ */
      ion-menu.nxt1-sidenav-menu {
        --width: var(--nxt1-sidenav-width);
        --max-width: calc(100vw - 56px);
        --background: var(--nxt1-sidenav-bg);
        --ion-background-color: var(--nxt1-sidenav-bg);

        /* Override Ionic's automatic safe-area-inset-top padding
           inside the menu — we handle spacing manually via toolbar padding */
        --ion-safe-area-top: 0px;
      }

      ion-menu.nxt1-sidenav-menu--blur {
        --background: var(--nxt1-sidenav-bg-blur);
      }

      ion-menu.nxt1-sidenav-menu--blur::part(container) {
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
      }

      /* ============================================
         HEADER SECTION
         ============================================ */
      .nxt1-sidenav-header {
        --background: var(--nxt1-sidenav-header-bg);
        border-bottom: 1px solid var(--nxt1-sidenav-header-border);
      }

      .nxt1-sidenav-header--minimal {
        --background: transparent;
        border-bottom: none;
      }

      .nxt1-sidenav-toolbar {
        --background: transparent;
        --border-width: 0;
        --padding-start: 16px;
        --padding-end: 12px;
        --padding-top: 4px;
        --padding-bottom: 4px;
        --min-height: auto;
      }

      .nxt1-sidenav-toolbar--minimal {
        --padding-top: 12px;
        --padding-bottom: 12px;
        justify-content: flex-end;
      }

      .nxt1-sidenav-switcher {
        width: 100%;
        padding-top: 0;
      }

      .nxt1-sidenav-switcher__panel {
        border: 1px solid var(--nxt1-sidenav-header-border);
        border-radius: calc(var(--nxt1-sidenav-item-radius) + 2px);
        background: var(--nxt1-color-surface-elevated, rgba(255, 255, 255, 0.04));
        padding: 6px;
      }

      .nxt1-sidenav-switcher__label {
        display: block;
        padding: 0 4px 6px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: normal;
        text-transform: none;
        color: var(--nxt1-sidenav-text-tertiary);
      }

      /* ============================================
         PROFILE ROW (Compact List-Item Style)
         ============================================ */
      .nxt1-sidenav-profile-row {
        display: flex;
        align-items: center;
        gap: 0;
        width: 100%;
        padding-top: 0;
      }

      .nxt1-sidenav-profile-row__main {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
        min-width: 0;
        padding: 8px;
        border: none;
        background: transparent;
        border-radius: var(--nxt1-sidenav-item-radius);
        cursor: pointer;
        transition: background 0.15s ease;
        -webkit-tap-highlight-color: transparent;
        text-align: left;
      }

      .nxt1-sidenav-profile-row__main:active {
        background: var(--nxt1-sidenav-item-hover);
      }

      .nxt1-sidenav-profile-row__avatar {
        position: relative;
        flex-shrink: 0;
      }

      .nxt1-sidenav-profile-row__avatar-img {
        display: block;
      }

      .nxt1-sidenav-profile-row__pro {
        position: absolute;
        bottom: -2px;
        right: -4px;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-primary) 0%,
          var(--nxt1-color-secondary, #10b981) 100%
        );
        color: #000;
        font-size: 7px;
        font-weight: 700;
        letter-spacing: 0.02em;
        padding: 1px 4px;
        border-radius: 3px;
        border: 1.5px solid var(--nxt1-sidenav-header-bg);
        line-height: 1.2;
      }

      .nxt1-sidenav-profile-row__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }

      .nxt1-sidenav-profile-row__name {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 15px;
        font-weight: 600;
        color: var(--nxt1-sidenav-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
      }

      .nxt1-sidenav-profile-row__verified {
        color: var(--nxt1-sidenav-accent);
        flex-shrink: 0;
      }

      .nxt1-sidenav-profile-row__sport {
        font-size: 13px;
        color: var(--nxt1-sidenav-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
      }

      .nxt1-sidenav-profile-row__expand {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        border: none;
        background: transparent;
        border-radius: 50%;
        color: var(--nxt1-sidenav-text-secondary);
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          transform 0.2s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-sidenav-profile-row__expand:active {
        background: var(--nxt1-sidenav-item-hover);
      }

      .nxt1-sidenav-profile-row__expand nxt1-icon {
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .nxt1-sidenav-profile-row__expand--open nxt1-icon {
        transform: rotate(180deg);
      }

      /* ============================================
         EXPANDABLE SPORT LIST
         ============================================ */
      .nxt1-sidenav-sport-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px 0 4px 0;
        margin-top: 4px;
        border-top: 1px solid var(--nxt1-sidenav-header-border);
        animation: sport-list-expand 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }

      @keyframes sport-list-expand {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .nxt1-sidenav-sport-list__item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border: none;
        background: transparent;
        border-radius: var(--nxt1-sidenav-item-radius);
        color: var(--nxt1-sidenav-text-primary);
        cursor: pointer;
        transition: background 0.15s ease;
        -webkit-tap-highlight-color: transparent;
        text-align: left;
        width: 100%;
        font-size: 14px;
      }

      .nxt1-sidenav-sport-list__item:active {
        background: var(--nxt1-sidenav-item-hover);
      }

      .nxt1-sidenav-sport-list__item--active {
        background: var(--nxt1-sidenav-item-hover);
      }

      .nxt1-sidenav-sport-list__item--add {
        color: var(--nxt1-sidenav-accent);
      }

      .nxt1-sidenav-sport-list__info {
        display: flex;
        flex-direction: column;
        gap: 1px;
        flex: 1;
        min-width: 0;
      }

      .nxt1-sidenav-sport-list__name {
        font-size: 14px;
        font-weight: 500;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nxt1-sidenav-sport-list__position {
        font-size: 12px;
        color: var(--nxt1-sidenav-text-secondary);
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nxt1-sidenav-sport-list__check {
        color: var(--nxt1-sidenav-accent);
        flex-shrink: 0;
      }

      .nxt1-sidenav-sport-list__add-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 1.5px dashed var(--nxt1-sidenav-accent);
        color: var(--nxt1-sidenav-accent);
        flex-shrink: 0;
      }

      /* Legacy User Styles (for backwards compatibility) */
      .nxt1-sidenav-user {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
        min-width: 0;
      }

      .nxt1-sidenav-user__avatar {
        flex-shrink: 0;
        cursor: pointer;
        transition: transform 0.15s ease;
      }

      .nxt1-sidenav-user__avatar:active {
        transform: scale(0.95);
      }

      .nxt1-sidenav-user__info {
        flex: 1;
        min-width: 0;
      }

      .nxt1-sidenav-user__name {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 16px;
        font-weight: 600;
        color: var(--nxt1-sidenav-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nxt1-sidenav-user__verified {
        color: var(--nxt1-sidenav-accent);
        flex-shrink: 0;
      }

      .nxt1-sidenav-user__subtitle {
        font-size: 13px;
        color: var(--nxt1-sidenav-text-secondary);
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nxt1-sidenav-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        background: transparent;
        border-radius: 50%;
        color: var(--nxt1-sidenav-text-secondary);
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease;
        -webkit-tap-highlight-color: transparent;
        flex-shrink: 0;
      }

      .nxt1-sidenav-close:hover {
        background: var(--nxt1-sidenav-item-hover);
        color: var(--nxt1-sidenav-text-primary);
      }

      .nxt1-sidenav-close:active {
        background: var(--nxt1-sidenav-item-active);
      }

      /* ============================================
         CONTENT AREA
         ============================================ */
      .nxt1-sidenav-content {
        --background: transparent;
        --padding-start: 8px;
        --padding-end: 8px;
        --padding-top: 8px;
        --padding-bottom: 16px;
      }

      .nxt1-sidenav-nav {
        display: flex;
        flex-direction: column;
      }

      /* ============================================
         SECTION STYLES
         ============================================ */
      .nxt1-sidenav-section {
        margin-bottom: 8px;
      }

      .nxt1-sidenav-section:last-child {
        margin-bottom: 0;
      }

      .nxt1-sidenav-section__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--nxt1-sidenav-text-tertiary);
        border: none;
        background: transparent;
        width: 100%;
        text-align: left;
      }

      .nxt1-sidenav-section__header--clickable {
        cursor: pointer;
        transition: color 0.15s ease;
      }

      .nxt1-sidenav-section__header--clickable:hover {
        color: var(--nxt1-sidenav-text-secondary);
      }

      .nxt1-sidenav-section__icon {
        color: var(--nxt1-sidenav-text-tertiary);
      }

      .nxt1-sidenav-section__label {
        flex: 1;
      }

      .nxt1-sidenav-section__chevron {
        color: var(--nxt1-sidenav-text-tertiary);
        transition: transform 0.2s ease;
      }

      .nxt1-sidenav-section__chevron--expanded {
        transform: rotate(180deg);
      }

      .nxt1-sidenav-section__items {
        display: flex;
        flex-direction: column;
        gap: 2px;
        overflow: hidden;
        transition:
          max-height 0.2s ease,
          opacity 0.2s ease;
      }

      .nxt1-sidenav-section__items--collapsed {
        max-height: 0;
        opacity: 0;
      }

      /* ============================================
         GRID LAYOUT (compact icon+label tiles)
         Matches web app mobile sidebar grid style
         ============================================ */
      .nxt1-sidenav-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
        padding: 10px 4px 4px;
      }

      .nxt1-sidenav-grid__item {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 4px;
        border: none;
        background: transparent;
        border-radius: var(--nxt1-sidenav-item-radius);
        color: var(--nxt1-sidenav-text-secondary);
        cursor: pointer;
        transition:
          background 0.15s ease,
          transform 0.1s ease;
        -webkit-tap-highlight-color: transparent;
        min-width: 0;
      }

      .nxt1-sidenav-grid__item:active:not(:disabled) {
        transform: scale(0.93);
      }

      .nxt1-sidenav-grid__item--active .nxt1-sidenav-grid__icon-wrap {
        background: var(--nxt1-sidenav-accent);
      }

      .nxt1-sidenav-grid__item--active .nxt1-sidenav-grid__icon-wrap nxt1-icon {
        color: #000;
      }

      .nxt1-sidenav-grid__item--active .nxt1-sidenav-grid__label {
        color: var(--nxt1-sidenav-text-primary);
        font-weight: 600;
      }

      .nxt1-sidenav-grid__item--disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nxt1-sidenav-grid__icon-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--nxt1-sidenav-item-hover);
        transition: background 0.15s ease;
        flex-shrink: 0;
        color: var(--nxt1-sidenav-text-secondary);
      }

      .nxt1-sidenav-grid__label {
        font-size: 11px;
        font-weight: 500;
        color: var(--nxt1-sidenav-text-secondary);
        text-align: center;
        line-height: 1.25;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
      }

      /* ============================================
         MENU ITEM STYLES
         ============================================ */
      .nxt1-sidenav-item {
        display: flex;
        align-items: center;
        gap: 14px;
        width: 100%;
        padding: 10px 12px;
        border: none;
        background: transparent;
        border-radius: var(--nxt1-sidenav-item-radius);
        color: var(--nxt1-sidenav-text-secondary);
        font-size: 15px;
        font-weight: 500;
        text-align: left;
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          transform 0.1s ease;
        -webkit-tap-highlight-color: transparent;
        position: relative;
      }

      .nxt1-sidenav-item:hover:not(.nxt1-sidenav-item--disabled) {
        background: var(--nxt1-sidenav-item-hover);
        color: var(--nxt1-sidenav-text-primary);
      }

      .nxt1-sidenav-item:active:not(.nxt1-sidenav-item--disabled) {
        background: var(--nxt1-sidenav-item-active);
        transform: scale(0.98);
      }

      .nxt1-sidenav-item--active {
        background: var(--nxt1-sidenav-item-active);
        color: var(--nxt1-sidenav-text-primary);
      }

      .nxt1-sidenav-item--active .nxt1-sidenav-item__icon {
        color: var(--nxt1-sidenav-accent);
      }

      .nxt1-sidenav-item--disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nxt1-sidenav-item--danger {
        color: var(--nxt1-sidenav-danger);
      }

      .nxt1-sidenav-item--danger:hover {
        background: var(--nxt1-color-feedback-errorBg, rgba(239, 68, 68, 0.1));
        color: var(--nxt1-sidenav-danger);
      }

      .nxt1-sidenav-item--premium {
        color: var(--nxt1-sidenav-accent);
      }

      .nxt1-sidenav-item--section {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--nxt1-sidenav-text-tertiary);
        cursor: default;
        padding: 16px 12px 8px;
      }

      .nxt1-sidenav-item--section:hover {
        background: transparent;
        color: var(--nxt1-sidenav-text-tertiary);
      }

      .nxt1-sidenav-item--child {
        padding: 10px 12px 10px 48px;
        font-size: 14px;
      }

      .nxt1-sidenav-item__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        flex-shrink: 0;
        color: inherit;
        transition: color 0.15s ease;
      }

      /* Agent X Logo SVG styling - matches footer FAB icon */
      .nxt1-sidenav-item__icon--agent-x {
        width: 24px;
        height: 24px;
        overflow: visible;
      }

      .nxt1-sidenav-item__icon .agent-x-logo {
        display: block;
        width: 40px;
        height: 40px;
        margin-left: -2px;
      }

      .nxt1-sidenav-item--child .nxt1-sidenav-item__icon--agent-x {
        width: 24px;
        height: 24px;
      }

      .nxt1-sidenav-item--child .nxt1-sidenav-item__icon .agent-x-logo {
        width: 35px;
        height: 35px;
        margin-left: -2px;
      }

      .nxt1-sidenav-item__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .nxt1-sidenav-item__label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nxt1-sidenav-item__description {
        font-size: 12px;
        color: var(--nxt1-sidenav-text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nxt1-sidenav-item__badge {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: 10px;
        background: var(--nxt1-sidenav-text-tertiary);
        color: var(--nxt1-sidenav-bg);
        font-size: 11px;
        font-weight: 600;
        flex-shrink: 0;
      }

      .nxt1-sidenav-item__badge--primary {
        background: var(--nxt1-sidenav-accent);
        color: var(--nxt1-color-text-onPrimary, #ffffff);
      }

      .nxt1-sidenav-item__badge--danger {
        background: var(--nxt1-sidenav-danger);
        color: var(--nxt1-color-text-onPrimary, #ffffff);
      }

      .nxt1-sidenav-item__badge--warning {
        background: var(--nxt1-sidenav-warning);
        color: var(--nxt1-color-text-onPrimary, #ffffff);
      }

      .nxt1-sidenav-item__arrow {
        color: var(--nxt1-sidenav-text-tertiary);
        flex-shrink: 0;
        transition: transform 0.2s ease;
      }

      .nxt1-sidenav-item--has-children[aria-expanded='true'] .nxt1-sidenav-item__arrow {
        transform: rotate(90deg);
      }

      /* ============================================
         CHILDREN / NESTED ITEMS
         ============================================ */
      .nxt1-sidenav-children {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 2px;
      }

      /* ============================================
         DIVIDER
         ============================================ */
      .nxt1-sidenav-divider {
        height: 1px;
        background: var(--nxt1-sidenav-border);
        margin: 8px 12px;
      }

      /* ============================================
         FAB FOOTER (floating action bar)
         ============================================ */

      /*
       * Full-height absolute overlay so the FAB's slide-up panel is never clipped.
       * The FAB component uses position:absolute internally (fab__wrap anchored to
       * bottom:0, fab__panel anchored above it). By giving it a containing block that
       * spans the entire menu height, the panel can slide up freely without overflow.
       * pointer-events:none lets scroll/tap events pass through to ion-content behind;
       * nxt1-floating-action-bar re-enables pointer events for its own interactive areas.
       */
      .nxt1-sidenav-fab-footer {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        z-index: 50;
        /* nxt1-floating-action-bar has display:contents, so its children
           are positioned directly inside this overlay box */
      }

      /* Ensure ion-menu container is the containing block for the FAB overlay */
      ion-menu.nxt1-sidenav-menu::part(container) {
        position: relative;
      }

      /* Re-enable pointer events for the FAB bar + panel
         (also handled by pointer-events:auto on nxt1-floating-action-bar :host) */

      /* Push ion-content scroll bottom padding so cards don't hide behind the bar */
      .nxt1-sidenav-content {
        --padding-bottom: calc(
          52px + var(--nxt1-spacing-2, 0.5rem) + var(--nxt1-spacing-3, 0.75rem) +
            var(--nxt1-spacing-3, 0.75rem) + env(safe-area-inset-bottom, 0px)
        );
      }

      /* ============================================
         PLATFORM-SPECIFIC STYLES
         ============================================ */
      /* iOS-specific styling */
      :host-context(.ios) ion-menu.nxt1-sidenav-menu--blur::part(container) {
        background: var(--nxt1-glass-bg, rgba(0, 0, 0, 0.8));
      }

      /* Android/Material Design */
      :host-context(.md) .nxt1-sidenav-item {
        overflow: hidden;
      }

      /* ============================================
         RESPONSIVE / MOBILE OPTIMIZATIONS
         ============================================ */
      @media (max-width: 480px) {
        .nxt1-sidenav-toolbar {
          --padding-start: 12px;
          --padding-end: 12px;
          --padding-top: 16px;
          --padding-bottom: 12px;
        }

        .nxt1-sidenav-content {
          --padding-start: 4px;
          --padding-end: 4px;
        }

        .nxt1-sidenav-item {
          padding: 10px 10px;
        }
      }

      /* ============================================
         SESSIONS PANEL (Agent X)
         ============================================ */
      .nxt1-sidenav-sessions {
        margin: 4px 0;
        padding: 12px 4px 4px;
        border-top: 1px solid var(--nxt1-sidenav-border);
        /* Keep session card column exactly aligned with the sessions header text. */
        --nxt1-sidenav-sessions-inline: 8px;
        --log-scroll-padding-inline: var(--nxt1-sidenav-sessions-inline);
      }

      .nxt1-sidenav-sessions__header {
        padding: 0 var(--nxt1-sidenav-sessions-inline) 8px;
      }

      .nxt1-sidenav-sessions__title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .nxt1-sidenav-sessions__title-group {
        min-width: 0;
      }

      .nxt1-sidenav-sessions__title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-sidenav-text-primary);
        line-height: 1.3;
      }

      .nxt1-sidenav-sessions__subtitle {
        margin: 2px 0 0;
        font-size: 11px;
        color: var(--nxt1-sidenav-text-tertiary);
        line-height: 1.3;
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */
      @media (prefers-reduced-motion: reduce) {
        .nxt1-sidenav-item,
        .nxt1-sidenav-section__items,
        .nxt1-sidenav-section__chevron {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSidenavComponent {
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly haptics = inject(HapticsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly menuController = inject(MenuController);
  readonly sidenavService = inject(NxtSidenavService);
  private readonly bottomSheet = inject(NxtBottomSheetService);

  // ============================================
  // INPUTS (Signal-based - 2026 Best Practice)
  // ============================================

  /** The content ID that this menu is attached to (required by ion-menu) */
  readonly contentId = input<string>('main-content');

  /** Menu sections to display */
  readonly sections = input<SidenavSection[]>(DEFAULT_SIDENAV_ITEMS);

  /** User data for header display */
  readonly user = input<SidenavUserData | undefined>(undefined);

  /** Social links for footer */
  readonly socialLinks = input<SocialLink[]>(DEFAULT_SOCIAL_LINKS);

  /** Sidenav configuration */
  readonly config = input<SidenavConfig>(createSidenavConfig());

  // ============================================
  // OUTPUTS (Signal-based - 2026 Best Practice)
  // ============================================

  /** Emits when a menu item is selected */
  readonly itemSelect = output<SidenavItemSelectEvent>();

  /** Emits when sidenav is toggled */
  readonly toggle = output<SidenavToggleEvent>();

  /** Emits when user profile is clicked */
  readonly profileClick = output<void>();

  /** Emits when a social link is clicked */
  readonly socialClick = output<{ social: SocialLink; event: Event }>();

  /** Emits when a sport profile is selected from the switcher */
  readonly sportProfileSelect = output<{
    profile: import('@nxt1/core').SidenavSportProfile;
    event: Event;
  }>();

  /** Emits when the "Add Sport" button is tapped */
  readonly addSportClick = output<void>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Track expanded sections */
  private readonly expandedSections = signal<Set<string>>(new Set());

  /** Whether sport profiles dropdown is expanded */
  readonly sportsExpanded = signal(false);

  /** Active route for highlighting */
  private readonly activeRoute = signal<string>('');

  /** Whether component is in browser */
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Direct menu reference so gesture state can be synced after Ionic initializes. */
  private readonly ionMenu = viewChild<IonMenu>('ionMenu');

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Platform detection */
  readonly isIos = computed(() => this.platform.isIOS());

  /** Keep swipe gestures enabled (theme scrolling is now inside FAB, no conflict). */
  readonly menuSwipeGestureEnabled = computed(() => this.config().swipeGesture !== false);

  /** Follow items shaped for NxtFloatingActionBarComponent */
  readonly fabFollowItems = computed<readonly FloatingBarFollowItem[]>(() =>
    this.socialLinks().map((s) => ({
      id: s.id,
      label: s.label,
      icon: s.icon,
      href: s.url,
      ariaLabel: s.ariaLabel,
    }))
  );

  /** Config passed to NxtFloatingActionBarComponent */
  readonly floatingBarConfig = computed<FloatingActionBarConfig>(() => ({
    appButtonLabel: 'New Session',
    appButtonIcon: 'plusCircle',
    appButtonAction: true,
    showThemeToggle: this.config().showThemeSelector !== false,
    followUsLabel: 'Follow Us',
    showLegal: true,
  }));

  // ============================================
  // HOST BINDINGS
  // ============================================

  @HostBinding('class.nxt1-sidenav-host')
  readonly hostClass = true;

  @HostBinding('attr.data-platform')
  get hostPlatform(): 'ios' | 'android' {
    return this.isIos() ? 'ios' : 'android';
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    effect(() => {
      const menu = this.ionMenu();
      if (!menu || !this.isBrowser) {
        return;
      }

      menu.swipeGesture = this.menuSwipeGestureEnabled();
    });

    // Initialize expanded sections from config
    afterNextRender(() => {
      this.initExpandedSections();
      this.initRouteListener();
      this.detectInitialRoute();
    });
  }

  // ============================================
  // IONIC MENU EVENT HANDLERS
  // ============================================

  /**
   * Called when menu is about to open
   */
  onMenuWillOpen(): void {
    this.sidenavService.setAnimating(true);
  }

  /**
   * Called when menu has fully opened
   */
  onMenuDidOpen(): void {
    this.sidenavService.setAnimating(false);
    this.sidenavService.setState(true);

    const event: SidenavToggleEvent = {
      isOpen: true,
      trigger: 'swipe',
      timestamp: Date.now(),
    };
    this.toggle.emit(event);
  }

  /**
   * Called when menu is about to close
   */
  onMenuWillClose(): void {
    this.sidenavService.setAnimating(true);
  }

  /**
   * Called when menu has fully closed
   */
  onMenuDidClose(): void {
    this.sidenavService.setAnimating(false);
    this.sidenavService.setState(false);

    const event: SidenavToggleEvent = {
      isOpen: false,
      trigger: 'backdrop',
      timestamp: Date.now(),
    };
    this.toggle.emit(event);
  }

  // ============================================
  // KEYBOARD HANDLING
  // ============================================

  @HostListener('document:keydown.escape')
  async onEscapeKey(): Promise<void> {
    if (this.sidenavService.isOpen()) {
      await this.close();
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Initialize expanded sections from configuration.
   */
  private initExpandedSections(): void {
    const expanded = new Set<string>();
    this.sections().forEach((section) => {
      if (section.expanded !== false && (section.expanded || !section.collapsible)) {
        expanded.add(section.id);
      }
    });
    this.expandedSections.set(expanded);
  }

  /**
   * Initialize router event listener for active detection.
   */
  private initRouteListener(): void {
    if (!this.isBrowser) return;

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        this.activeRoute.set(event.urlAfterRedirects);
      });
  }

  /**
   * Detect initial route on component init.
   */
  private detectInitialRoute(): void {
    if (!this.isBrowser) return;
    this.activeRoute.set(this.router.url);
  }

  /**
   * Trigger haptic feedback.
   */
  private async triggerHaptic(type: 'light' | 'medium' = 'light'): Promise<void> {
    if (!this.config().enableHaptics) return;
    await this.haptics.impact(type);
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Open the sidenav programmatically
   */
  async open(): Promise<void> {
    await this.menuController.open();
  }

  /**
   * Close the sidenav programmatically
   */
  async close(_event?: Event): Promise<void> {
    await this.triggerHaptic('light');
    await this.menuController.close();
  }

  /**
   * Toggle the sidenav
   */
  async toggleMenu(): Promise<void> {
    await this.menuController.toggle();
  }

  /**
   * Get the sidenav width as CSS value.
   */
  getWidth(): string {
    const width = this.config().width;
    if (typeof width === 'number') {
      return `${width}px`;
    }
    return width ?? '280px';
  }

  /**
   * Check if a section is expanded.
   */
  isSectionExpanded(section: SidenavSection): boolean {
    if (!section.collapsible) return true;
    return this.expandedSections().has(section.id);
  }

  /**
   * Check if a menu item is active.
   */
  isItemActive(item: SidenavItem): boolean {
    if (!item.route) return false;
    const currentRoute = this.activeRoute();

    if (item.routeExact) {
      return currentRoute === item.route;
    }

    return currentRoute.startsWith(item.route);
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
   * Toggle a section's expanded state.
   */
  async toggleSection(section: SidenavSection, event: Event): Promise<void> {
    event.preventDefault();
    await this.triggerHaptic('light');

    const expanded = new Set(this.expandedSections());
    if (expanded.has(section.id)) {
      expanded.delete(section.id);
    } else {
      expanded.add(section.id);
    }
    this.expandedSections.set(expanded);
  }

  /**
   * Handle menu item click.
   */
  async onItemClick(
    item: SidenavItem,
    _sectionId: string,
    event: Event,
    parentId?: string
  ): Promise<void> {
    if (item.disabled) return;

    await this.triggerHaptic('medium');

    // Emit selection event
    this.itemSelect.emit({
      item,
      parentId,
      isChild: !!parentId,
      event,
      timestamp: Date.now(),
    });

    // Handle navigation
    if (item.route) {
      this.router.navigate([item.route]);
      // Menu will auto-close via ion-menu-toggle
    } else if (item.href) {
      // External link - let the browser handle it
    } else if (item.action) {
      // Custom action
    } else if (item.children && item.children.length > 0) {
      // Toggle children visibility
    }
  }

  /**
   * Handle profile click.
   */
  async onProfileClick(): Promise<void> {
    await this.triggerHaptic('light');
    this.profileClick.emit();

    // Navigate to the canonical identity route when provided.
    const currentUser = this.user();
    if (currentUser?.profileRoute) {
      this.router.navigate([currentUser.profileRoute]);
      await this.close();
      return;
    }

    if (currentUser?.userId) {
      this.router.navigate(['/profile', currentUser.userId]);
      await this.close();
    }
  }

  /**
   * Handle social link click.
   */
  async onSocialClick(social: SocialLink, event: Event): Promise<void> {
    await this.triggerHaptic('light');
    this.socialClick.emit({ social, event });
  }

  /**
   * Resolve the current sport label shown under the user's name.
   * Uses active sport profile first and never shows an email address.
   */
  getUserSportLabel(userData: SidenavUserData): string {
    const activeSport = userData.sportProfiles?.find((profile) => profile.isActive);
    const firstSport = userData.sportProfiles?.[0];
    const profile = activeSport ?? firstSport;

    if (userData.isTeamRole) {
      if (profile?.position) {
        return profile.position;
      }

      if (profile?.sport && profile.sport !== userData.name) {
        return formatSportDisplayName(profile.sport);
      }

      if (userData.subtitle && !userData.subtitle.includes('@')) {
        return userData.subtitle;
      }

      return 'Coach';
    }

    if (profile?.sport && profile.position) {
      return `${formatSportDisplayName(profile.sport)} • ${profile.position}`;
    }

    if (profile?.sport) {
      return formatSportDisplayName(profile.sport);
    }

    if (userData.subtitle && !userData.subtitle.includes('@')) {
      return userData.subtitle;
    }

    return 'Athlete';
  }

  /**
   * Header label for the top switcher block.
   * Sports for multi-sport users, Profiles for team-style accounts.
   */
  getSwitcherTitle(userData: SidenavUserData): string {
    if (userData.switcherTitle) return userData.switcherTitle;
    if (userData.isTeamRole) return 'Teams';
    return (userData.sportProfiles?.length ?? 0) > 0 ? 'Sports' : 'Profiles';
  }

  /**
   * Format sport name for display using the centralized formatter.
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

  /**
   * Handle add-sport quick action from the Sports panel.
   * Emits `addSportClick` so the host app can navigate to the add-sport flow.
   */
  async onAddSportClick(event: Event): Promise<void> {
    event.stopPropagation();
    await this.triggerHaptic('light');
    this.addSportClick.emit();
    await this.close();
  }

  /**
   * Toggle sport profiles dropdown expansion.
   */
  async toggleSportsExpanded(event: Event): Promise<void> {
    event.stopPropagation();
    await this.triggerHaptic('light');
    this.sportsExpanded.update((v) => !v);
  }

  /**
   * Navigate to Agent X and start a fresh session.
   */
  async onNewSession(): Promise<void> {
    await this.close();
    void this.router.navigate(['/agent-x']);
  }

  /**
   * Handle floating panel legal/follow link taps.
   * Keeps sidenav behavior consistent with standard menu item navigation.
   */
  async onFloatingLinkClick(): Promise<void> {
    await this.close();
  }

  /**
   * Open an existing Agent X session from the operations log.
   * Awaits the Ionic menu close animation before opening the sheet —
   * no setTimeout needed because menuController.close() resolves on animation complete.
   */
  async onLogEntryTap(entry: OperationLogEntry): Promise<void> {
    await this.close();
    const operationStatus =
      entry.status === 'in-progress'
        ? 'processing'
        : entry.status === 'complete'
          ? 'complete'
          : entry.status === 'error'
            ? 'error'
            : entry.status === 'paused'
              ? 'paused'
              : entry.status === 'awaiting_input'
                ? 'awaiting_input'
                : entry.status === 'awaiting_approval'
                  ? 'awaiting_approval'
                  : null;
    const isFirestoreOperationId = (id: string | undefined): boolean => {
      if (!id) return false;
      const bare = id.startsWith('chat-') ? id.slice(5) : id;
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bare);
    };
    const resolvedOperationId = isFirestoreOperationId(entry.operationId)
      ? entry.operationId
      : undefined;

    void this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: resolvedOperationId ?? entry.threadId ?? entry.id,
        contextTitle: entry.title,
        contextIcon: entry.icon,
        contextType: 'operation',
        operationStatus: resolvedOperationId
          ? operationStatus
          : operationStatus === 'processing'
            ? null
            : operationStatus,
        ...(entry.threadId ? { threadId: entry.threadId } : {}),
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
  }

  /**
   * Handle sport profile selection from the switcher.
   */
  async onSportProfileSelect(
    profile: import('@nxt1/core').SidenavSportProfile,
    event: Event
  ): Promise<void> {
    event.stopPropagation();
    await this.triggerHaptic('medium');

    // Emit the selection event
    this.sportProfileSelect.emit({ profile, event });
  }
}
