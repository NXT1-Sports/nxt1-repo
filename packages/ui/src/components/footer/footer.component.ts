/**
 * @fileoverview NxtMobileFooterComponent - Native Ionic Tab Bar
 * @module @nxt1/ui/components/footer
 * @version 2.0.0
 *
 * Professional mobile footer/tab bar using Ionic Framework's native components
 * with NXT1 design token icons for consistent branding.
 *
 * Design Philosophy:
 * - Uses Ionic's native ion-tab-bar for proper platform behavior
 * - iOS 18: Native translucent blur, haptic feedback, SF Symbols style
 * - Android: Material You theming, proper ripple effects
 * - Both: NXT1 design token SVG icons for consistent branding
 *
 * Features:
 * - Native Ionic tab bar with automatic safe area handling
 * - Platform-adaptive styling (iOS blur vs Android elevation)
 * - Custom NXT1 SVG icons (not ionicons) for brand consistency
 * - Haptic feedback on tab selection
 * - Badge support with Ionic's native badge
 * - Center action button variant (floating FAB style)
 * - Route-based active state detection
 * - Full accessibility via Ionic's built-in ARIA
 * - SSR-safe with proper browser guards
 *
 * Usage:
 * ```html
 * <nxt1-mobile-footer
 *   [tabs]="footerTabs"
 *   [activeTabId]="currentTab"
 *   (tabSelect)="onTabSelect($event)"
 * />
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  Output,
  EventEmitter,
  inject,
  signal,
  computed,
  HostBinding,
  PLATFORM_ID,
  afterNextRender,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { IonTabBar, IonTabButton } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../icon';
import { NxtAvatarComponent } from '../avatar';
import { NxtPlatformService } from '../../services/platform';
import { HapticsService } from '../../services/haptics';
import { NxtLoggingService } from '../../services/logging';
import type {
  FooterTabItem,
  FooterConfig,
  FooterTabSelectEvent,
  FooterScrollToTopEvent,
} from './footer.types';
import { createFooterConfig, DEFAULT_FOOTER_TABS } from './footer.types';
import { resolveNavigationSurfaceState } from '../navigation-surface/navigation-surface.utils';

@Component({
  selector: 'nxt1-mobile-footer',
  standalone: true,
  imports: [IonTabBar, IonTabButton, NxtIconComponent, NxtAvatarComponent],
  template: `
    <!-- Footer wrapper for pill + FAB layout -->
    <div
      class="footer-container"
      [class.footer-container--centered-create]="isCenteredCreateVariant()"
      [class.footer-container--wide]="regularTabs().length > 3"
    >
      <!-- FAB Button (left of pill) when action tab is first in order -->
      @if (shouldRenderActionFab() && isActionFabOnLeft() && actionTab(); as actionButton) {
        <button
          class="fab-button"
          [class.fab-button--active]="isActiveTab(actionButton)"
          (click)="onTabClick(actionButton, $event)"
          [attr.aria-label]="actionButton.ariaLabel ?? actionButton.label"
        >
          <!-- Agent X Logo SVG - Theme-aware via currentColor -->
          <svg
            class="agent-logo"
            viewBox="0 0 612 792"
            width="53"
            height="53"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="8"
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
        </button>
      }

      <!-- Floating Pill Tab Bar -->
      <div
        class="footer-pill-surface"
        [class.footer-pill-surface--hidden]="config.hidden"
        [class.footer-pill-surface--solid]="surfaceState().mode === 'solid'"
        [class.footer-pill-surface--glass]="surfaceState().mode === 'glass'"
        [class.footer-pill-surface--translucent]="surfaceState().mode === 'translucent'"
        [class.footer-pill-surface--centered-create]="isCenteredCreateVariant()"
      >
        <ion-tab-bar
          [translucent]="isTranslucent()"
          [class.footer--hidden]="config.hidden"
          [class.footer--solid]="surfaceState().mode === 'solid'"
          [class.footer--glass]="surfaceState().mode === 'glass'"
          [class.footer--translucent]="surfaceState().mode === 'translucent'"
          [class.footer--centered-create]="isCenteredCreateVariant()"
          [class.footer--show-labels]="shouldShowLabels()"
          [class.footer--hide-labels]="!shouldShowLabels()"
          [selectedTab]="activeTabId() ?? _activeTabId()"
          [style.--ion-tab-bar-background]="'transparent'"
          [style.--background]="'transparent'"
        >
          @for (tab of regularTabs(); track tab.id) {
            <ion-tab-button
              [tab]="tab.id"
              [disabled]="tab.disabled"
              [class.tab-button--active]="isActiveTab(tab)"
              [class.tab-button--center-action]="isCenteredCreateTab(tab)"
              [class.has-badge]="tab.badge && tab.badge > 0"
              (click)="onTabClick(tab, $event)"
            >
              <!-- Custom NXT1 SVG Icon (same icon, color changes on select) -->
              <div class="tab-icon-wrapper">
                @if (isAgentXTab(tab)) {
                  <svg
                    class="agent-tab-logo"
                    viewBox="0 0 612 792"
                    width="56"
                    height="56"
                    fill="currentColor"
                    stroke="currentColor"
                    stroke-width="8"
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
                } @else if (isProfileTab(tab)) {
                  <!-- Profile avatar (Instagram-style) -->
                  <div
                    class="profile-avatar-wrapper"
                    [class.profile-avatar-wrapper--active]="isActiveTab(tab)"
                  >
                    <nxt1-avatar
                      [src]="profileAvatarSrc()"
                      [name]="profileAvatarName()"
                      [customSize]="28"
                      [showSkeleton]="false"
                      cssClass="footer-profile-avatar"
                    />
                  </div>
                } @else {
                  <nxt1-icon [name]="tab.icon" [size]="24" class="tab-icon" />
                }

                <!-- Professional Red Dot Badge (Instagram/Twitter style) -->
                @if (tab.badge && tab.badge > 0) {
                  <span class="badge-dot" aria-label="Unread notifications"></span>
                }
              </div>
            </ion-tab-button>
          }
        </ion-tab-bar>
      </div>

      <!-- FAB Button (right of pill) - Agent X with custom logo -->
      @if (shouldRenderActionFab() && !isActionFabOnLeft() && actionTab(); as actionButton) {
        <button
          class="fab-button"
          [class.fab-button--active]="isActiveTab(actionButton)"
          (click)="onTabClick(actionButton, $event)"
          [attr.aria-label]="actionButton.ariaLabel ?? actionButton.label"
        >
          <!-- Agent X Logo SVG - Theme-aware via currentColor -->
          <svg
            class="agent-logo"
            viewBox="0 0 612 792"
            width="53"
            height="53"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="8"
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
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        background: transparent;

        /* ============================================
           POSITIONING - Fixed at bottom
           Shell components can override via CSS variables:
           --nxt1-footer-bottom, --nxt1-footer-left, --nxt1-footer-right
           ============================================ */
        position: fixed;
        bottom: var(--nxt1-footer-bottom, 28px);
        left: var(--nxt1-footer-left, 16px);
        right: var(--nxt1-footer-right, 16px);
        z-index: var(--nxt1-z-index-footer, 1000);
        pointer-events: none; /* Allow clicks through transparent areas */

        /* iOS 26 Liquid Glass Design Tokens - 100% Theme Aware */
        --nxt1-navigation-surface-glass-bg: var(--nxt1-glass-bg);
        --nxt1-navigation-surface-translucent-bg: var(--nxt1-glass-bg);
        --nxt1-navigation-surface-glass-border: var(--nxt1-glass-border);
        --nxt1-navigation-surface-glass-shadow: var(--nxt1-glass-shadow);
        --nxt1-navigation-surface-glass-backdrop: var(--nxt1-glass-backdrop);
        --footer-icon-active: var(--nxt1-icon-active, #ffffff);
        --footer-icon-inactive: var(--nxt1-icon-inactive, #666666);
        --footer-tab-active-bg: color-mix(
          in srgb,
          var(--nxt1-color-text-primary, #ffffff) 6%,
          transparent
        );
        --footer-fab-shadow: var(--nxt1-fab-shadow);
        --footer-fab-shadow-active: var(--nxt1-fab-shadowActive);
        --footer-fab-gradient-active: var(--nxt1-fab-gradientActive);
        --footer-fab-glow-active: var(--nxt1-fab-glowActive);

        --nxt1-navigation-surface-solid-bg: var(--nxt1-nav-bgSolid, rgb(22, 22, 22));
        --nxt1-navigation-surface-solid-border: var(
          --nxt1-nav-borderSolid,
          rgba(255, 255, 255, 0.12)
        );
        --nxt1-navigation-surface-solid-shadow: var(
          --nxt1-nav-shadowSolid,
          0 1px 3px rgba(0, 0, 0, 0.12)
        );
        --nxt1-navigation-surface-shadow: 0 0 0 0 transparent;
      }

      /* Container for pill + FAB side by side */
      .footer-container {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-pill-gap, 8px);
        padding: 0;
        background: transparent;
        max-width: 300px;
        margin: 0 auto;
        pointer-events: auto; /* Re-enable clicks for the actual footer content */
      }

      .footer-container.footer-container--centered-create {
        max-width: 392px;
      }

      /* Wider when 5 tabs (right-side FAB variants) */
      .footer-container.footer-container--wide {
        max-width: 344px;
      }

      .footer-pill-surface {
        position: relative;
        flex: 1;
        border-radius: var(--nxt1-pill-radius, 28px);
        overflow: hidden;
        border: 0.55px solid var(--nxt1-navigation-surface-solid-border);
        background: var(--nxt1-navigation-surface-solid-bg);
        box-shadow: var(--nxt1-navigation-surface-shadow);
      }

      /* Pseudo-element overlays only for solid mode (subtle depth).
         Translucent/glass modes use the same clean treatment as the page header:
         semi-transparent background + backdrop-filter, nothing else. */
      .footer-pill-surface--solid::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        z-index: 0;
        background: radial-gradient(
          140% 120% at 50% 0%,
          rgba(255, 255, 255, 0.06) 0%,
          rgba(255, 255, 255, 0.015) 32%,
          rgba(255, 255, 255, 0) 68%
        );
        opacity: 0.7;
      }

      .footer-pill-surface--hidden {
        display: none;
      }

      /* No pseudo-element overrides needed for translucent/glass —
         they inherit the clean header-matching treatment (no overlays). */

      .footer-pill-surface--centered-create {
        border-radius: 30px;
      }

      .footer-pill-surface--translucent {
        border-color: var(--nxt1-navigation-surface-glass-border);
        background: var(--nxt1-navigation-surface-translucent-bg);
        -webkit-backdrop-filter: var(--nxt1-navigation-surface-glass-backdrop);
        backdrop-filter: var(--nxt1-navigation-surface-glass-backdrop);
        overflow: visible;
      }

      .footer-pill-surface--glass {
        border-color: var(--nxt1-navigation-surface-glass-border);
        background: var(--nxt1-navigation-surface-glass-bg);
        -webkit-backdrop-filter: var(--nxt1-navigation-surface-glass-backdrop);
        backdrop-filter: var(--nxt1-navigation-surface-glass-backdrop);
        overflow: visible;
      }

      .footer-pill-surface--centered-create::after {
        border-radius: 29px;
      }

      /* Floating Pill Tab Bar - Base styles */
      ion-tab-bar {
        --background: transparent !important;
        --color: var(--footer-icon-inactive);
        --color-selected: var(--footer-icon-active);
        flex: 1;
        position: relative;
        z-index: 2;
        border: none !important;
        border-radius: var(--nxt1-pill-radius, 28px);
        padding: var(--nxt1-pill-padding, 1px);
        height: var(--nxt1-pill-height, 48px);
        min-height: var(--nxt1-pill-height, 48px); /* Ensure height is respected */
        box-shadow: none;
        background: transparent !important;
      }

      /* Solid mode (default) - Surface handled by wrapper */
      ion-tab-bar.footer--solid {
        --background: transparent !important;
        background: transparent !important;
        box-shadow: none;
      }

      ion-tab-bar.footer--solid:not(.footer--translucent) {
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
      }

      ion-tab-bar.footer--solid.footer--translucent {
        --background: transparent !important;
        background: transparent !important;
        box-shadow: none;
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
      }

      /* Glass mode (opt-in) - iOS 26 Liquid Glass Effect */
      ion-tab-bar.footer--glass {
        --background: transparent !important;
        background: transparent !important;
        box-shadow: none;
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
      }

      ion-tab-bar.footer--centered-create {
        border-radius: 30px;
        min-height: 56px;
        height: 56px;
        padding-inline: 6px;
        overflow: visible;
      }

      ion-tab-bar.footer--centered-create ion-tab-button {
        overflow: visible;
      }

      /* Hidden state */
      .footer--hidden {
        display: none;
      }

      /* Tab Button Styling - Rounded containers */
      ion-tab-button {
        --color: var(--footer-icon-inactive);
        --color-selected: var(--footer-icon-active);
        --padding-top: var(--nxt1-tab-paddingY);
        --padding-bottom: var(--nxt1-tab-paddingY);
        --background: transparent;
        --background-focused: transparent;
        max-width: none;
        flex: 1;
        border-radius: var(--nxt1-tab-radius);
        margin: 0;
        transition: background 0.2s ease;
      }

      /* Active tab background highlight */
      ion-tab-button.tab-button--active {
        --background: var(--footer-tab-active-bg);
        background: var(--footer-tab-active-bg);
      }

      ion-tab-bar.footer--centered-create ion-tab-button.tab-button--center-action {
        --background: transparent;
        background: transparent;
      }

      ion-tab-bar.footer--centered-create
        ion-tab-button.tab-button--center-action
        .tab-icon-wrapper {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        margin-top: 0;
        background: var(--nxt1-color-primary, #ccff00);
        transition:
          transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
          background 0.2s ease;
      }

      ion-tab-bar.footer--centered-create
        ion-tab-button.tab-button--center-action
        .tab-icon-wrapper:active {
        transform: scale(0.94);
      }

      ion-tab-bar.footer--centered-create ion-tab-button.tab-button--center-action .tab-icon {
        color: var(--nxt1-color-text-onPrimary, #000000);
      }

      ion-tab-bar.footer--centered-create ion-tab-button.tab-button--center-action .agent-tab-logo {
        color: var(--nxt1-color-text-onPrimary, #000000);
      }

      ion-tab-bar.footer--centered-create
        ion-tab-button.tab-button--center-action.tab-button--active
        .tab-icon-wrapper {
        box-shadow: none;
      }

      /* Icon wrapper */
      .tab-icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        height: var(--nxt1-tab-iconSize);
      }

      /* Icon colors - theme aware */
      .tab-icon {
        color: var(--footer-icon-inactive);
        transition: color 0.2s ease;
      }

      .tab-button--active .tab-icon {
        color: var(--footer-icon-active);
      }

      .agent-tab-logo {
        color: var(--footer-icon-inactive);
        fill: currentColor;
        stroke: currentColor;
        width: 56px;
        height: 56px;
        transition:
          color 0.2s ease,
          fill 0.2s ease;
      }

      .tab-button--active .agent-tab-logo {
        color: var(--footer-icon-active);
      }

      /* Profile Avatar (Instagram-style) */
      .profile-avatar-wrapper {
        width: 31px;
        height: 31px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5px;
        border: 1.5px solid transparent;
        transition: border-color 0.2s ease;
        box-sizing: border-box;
        overflow: hidden;
      }

      .profile-avatar-wrapper--active {
        border-color: var(--footer-icon-active, #ffffff);
      }

      .profile-avatar-wrapper :host ::ng-deep .footer-profile-avatar {
        width: 100% !important;
        height: 100% !important;
      }

      .profile-avatar-wrapper ::ng-deep nxt1-avatar {
        width: 100%;
        height: 100%;
      }

      .profile-avatar-wrapper ::ng-deep .nxt1-avatar,
      .profile-avatar-wrapper ::ng-deep .avatar-container {
        width: 100% !important;
        height: 100% !important;
        min-width: unset !important;
        min-height: unset !important;
      }

      .profile-avatar-wrapper ::ng-deep .avatar-inner {
        width: 100% !important;
        height: 100% !important;
      }

      .profile-avatar-wrapper ::ng-deep .avatar-image {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover;
      }

      /* Theme-aware initials — match nav design tokens, not random hash colors */
      .profile-avatar-wrapper ::ng-deep .nxt1-avatar {
        --avatar-initials-bg: var(--pill-bg, var(--nxt1-color-surface-200)) !important;
        --avatar-initials-color: var(
          --footer-icon-default,
          var(--nxt1-color-text-secondary)
        ) !important;
      }

      .tab-button--active .profile-avatar-wrapper {
        border-color: var(--footer-icon-active, #ffffff);
      }

      /* Label styling */
      ion-tab-button ion-label {
        font-size: var(--nxt1-tab-labelSize);
        font-weight: 500;
        letter-spacing: 0.02em;
        margin-top: var(--nxt1-tab-labelGap);
        color: inherit;
      }

      .tab-button--active ion-label {
        color: var(--footer-icon-active);
      }

      /* Badge positioning - Professional Red Dot (Instagram/Twitter style) */
      .tab-icon-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Professional notification dot - positioned top-right of icon */
      .badge-dot {
        position: absolute;
        top: -2px;
        right: -6px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        /* Design token: badge background from design system */
        background: var(--nxt1-color-badge-background, var(--nxt1-color-error, #ef4444));
        /* Design token: badge shadow for subtle glow */
        box-shadow: 0 0 4px var(--nxt1-color-badge-shadow, rgba(239, 68, 68, 0.5));
        /* Subtle border for visibility on any background */
        border: 1.5px solid var(--nxt1-color-background-primary, #0a0a0a);
        /* Pop-in animation */
        animation: badge-dot-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 10;
      }

      @keyframes badge-dot-pop {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        50% {
          transform: scale(1.3);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      /* Hide labels mode - even more compact */
      .footer--hide-labels ion-tab-button {
        --padding-top: 10px;
        --padding-bottom: 10px;
      }

      /* FAB Button - Theme-aware with semantic tokens */
      .fab-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-fab-size, 48px);
        height: var(--nxt1-fab-size, 48px);
        min-width: var(--nxt1-fab-size, 48px);
        min-height: var(--nxt1-fab-size, 48px);
        border-radius: var(--nxt1-fab-radius, 50%);
        border: none;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #000000);
        box-shadow: var(
          --footer-fab-shadow,
          0 4px 16px rgba(204, 255, 0, 0.4),
          0 2px 6px rgba(0, 0, 0, 0.2)
        );
        cursor: pointer;
        flex-shrink: 0;
        transition:
          transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
          box-shadow 0.3s ease,
          background 0.3s ease;
        position: relative;
        overflow: visible;
        pointer-events: auto; /* Ensure FAB is clickable */
      }

      /* FAB Glow ring (pseudo element) */
      .fab-button::before {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 50%;
        background: var(
          --nxt1-glow-md,
          radial-gradient(
            circle at center,
            color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 35%, transparent) 0%,
            transparent 72%
          )
        );
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: -1;
        pointer-events: none;
      }

      .fab-button:active {
        transform: scale(0.92);
      }

      /* FAB Active State - theme-token based (no hardcoded multicolor glow) */
      .fab-button.fab-button--active {
        background: linear-gradient(
          120deg,
          color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 35%, white) 0%,
          color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 78%, white) 22%,
          var(--nxt1-color-primary, #ccff00) 45%,
          color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 70%, black) 72%,
          color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 40%, black) 100%
        );
        background-size: 320% 320%;
        animation: footer-theme-flow 2.8s ease-in-out infinite;
        box-shadow: var(
          --footer-fab-shadow-active,
          0 0 24px color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 45%, transparent),
          0 0 48px color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 25%, transparent),
          0 4px 20px rgba(0, 0, 0, 0.4)
        );
        color: var(--nxt1-color-text-onPrimary, #000000);
      }

      .fab-button.fab-button--active::before {
        opacity: 1;
        background: radial-gradient(
          circle at center,
          color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 70%, transparent) 0%,
          color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 35%, transparent) 42%,
          transparent 78%
        );
        filter: blur(14px);
        inset: -8px;
        background-size: 220% 220%;
        animation: footer-theme-flow 2.8s ease-in-out infinite;
      }

      /* FAB Icon styling */
      .fab-button nxt1-icon {
        color: inherit;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Agent X Logo - Theme-aware SVG */
      .fab-button .agent-logo {
        color: inherit;
        fill: currentColor;
        stroke: currentColor;
        display: block;
        width: 49px;
        height: 49px;
        transition:
          color 0.2s ease,
          fill 0.2s ease;
      }

      @keyframes footer-theme-flow {
        0%,
        100% {
          background-position: 0% 50%;
        }
        50% {
          background-position: 100% 50%;
        }
      }

      /* iOS-specific - Ensure liquid glass effect only when glass mode enabled */
      :host-context(.ios) ion-tab-bar.footer--glass {
        --background: var(--nxt1-navigation-surface-glass-bg) !important;
        background: var(--nxt1-navigation-surface-glass-bg) !important;
        -webkit-backdrop-filter: var(--nxt1-navigation-surface-glass-backdrop) !important;
        backdrop-filter: var(--nxt1-navigation-surface-glass-backdrop) !important;
      }

      /* Android/MD-specific */
      :host-context(.md) ion-tab-button {
        --ripple-color: var(--nxt1-ripple-color);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtMobileFooterComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly haptics = inject(HapticsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly logger = inject(NxtLoggingService).child('MobileFooter');

  // ============================================
  // INPUTS
  // ============================================

  /** Tab items to display */
  readonly tabs = input<FooterTabItem[]>(DEFAULT_FOOTER_TABS);

  /** Profile avatar image URL (for profile tab) */
  readonly profileAvatarSrc = input<string | null | undefined>(undefined);

  /** Profile avatar display name (for initials fallback) */
  readonly profileAvatarName = input<string | undefined>(undefined);

  /** Currently active tab ID (if controlling externally). Set to null for no selection. */
  readonly activeTabId = input<string | null | undefined>(undefined);

  /** Footer configuration */
  readonly configInput = input<Partial<FooterConfig> | undefined>(undefined, { alias: 'config' });

  get config(): FooterConfig {
    return this._config();
  }

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emits when a tab is selected */
  @Output() tabSelect = new EventEmitter<FooterTabSelectEvent>();

  /**
   * Emits when user taps the currently active tab (scroll-to-top trigger).
   * Following Instagram, Twitter, TikTok patterns for native mobile UX.
   * Shell components should handle this by scrolling content to top.
   */
  @Output() scrollToTop = new EventEmitter<FooterScrollToTopEvent>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Internal active tab tracking based on router */
  readonly _activeTabId = signal<string | null>(null);

  /** Normalized footer config with shared navigation-surface defaults applied. */
  private readonly _config = computed(() => createFooterConfig(this.configInput()));

  /** Whether component is in browser */
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Previous tab for event emission */
  private previousTab?: FooterTabItem;

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Platform detection - iOS or Android/Web */
  readonly isIos = computed(() => this.platform.isIOS());

  /** Shared navigation surface state */
  readonly surfaceState = computed(() =>
    resolveNavigationSurfaceState(this._config(), this.platform.os())
  );

  /** Whether to use Ionic's native translucent surface handling. */
  readonly isTranslucent = computed(() => {
    return this.surfaceState().translucent;
  });

  /** Whether to show labels based on config and device */
  readonly shouldShowLabels = computed(() => {
    const cfg = this._config();
    if (cfg.showLabels !== undefined) {
      return cfg.showLabels;
    }
    // Default: show on mobile, hide on tablet
    return this.platform.isMobile();
  });

  /** Get the currently active tab */
  readonly activeTab = computed(() => {
    const id = this.activeTabId() ?? this._activeTabId();
    return this.tabs().find((t) => t.id === id);
  });

  /** Regular tabs (non-action buttons) for the tab bar */
  readonly regularTabs = computed(() => {
    if (this.isCenteredCreateVariant()) {
      return this.tabs();
    }
    return this.tabs().filter((tab) => !tab.isActionButton);
  });

  /** Action button tab (floating FAB) */
  readonly actionTab = computed(() => {
    return this.tabs().find((tab) => tab.isActionButton) ?? null;
  });

  /** Whether floating action FAB should render on the left side */
  readonly isActionFabOnLeft = computed(() => {
    if (this.isCenteredCreateVariant()) return false;
    return this.tabs()[0]?.isActionButton === true;
  });

  /** Whether centered-create variant is active */
  readonly isCenteredCreateVariant = computed(() => this._config().variant === 'centeredCreate');

  /** Whether floating action FAB should render */
  readonly shouldRenderActionFab = computed(() => !this.isCenteredCreateVariant());

  // ============================================
  // HOST BINDINGS
  // ============================================

  @HostBinding('class.nxt1-mobile-footer-host')
  readonly hostClass = true;

  @HostBinding('attr.data-platform')
  get hostPlatform(): 'ios' | 'android' {
    return this.isIos() ? 'ios' : 'android';
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    // Listen to route changes after render (SSR-safe)
    afterNextRender(() => {
      this.initRouteListener();
      this.detectInitialRoute();
    });
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Initialize router event listener for active tab detection
   */
  private initRouteListener(): void {
    if (!this.isBrowser) return;

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        this.updateActiveTabFromRoute(event.urlAfterRedirects);
      });
  }

  /**
   * Detect initial route on component init
   */
  private detectInitialRoute(): void {
    if (!this.isBrowser) return;
    this.updateActiveTabFromRoute(this.router.url);
  }

  /**
   * Update active tab based on current route.
   * Sets to null if no matching tab found (professional pattern:
   * Instagram, Twitter, TikTok all show no tab selected when on
   * pages like Settings that aren't part of the main navigation).
   */
  private updateActiveTabFromRoute(url: string): void {
    const matchedTab = this.tabs().find((tab) => {
      if (tab.routeExact) {
        return url === tab.route;
      }
      return url.startsWith(tab.route);
    });

    // Set to matched tab ID, or null if no match (professional apps behavior)
    this._activeTabId.set(matchedTab?.id ?? null);
  }

  /**
   * Trigger haptic feedback
   */
  private async triggerHaptic(): Promise<void> {
    if (!this.config.enableHaptics) return;
    await this.haptics.impact('light');
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Check if a tab is the currently active tab
   */
  isActiveTab(tab: FooterTabItem): boolean {
    const activeId = this.activeTabId() ?? this._activeTabId();
    return tab.id === activeId;
  }

  /**
   * Get the appropriate icon for a tab (filled when active, outline when inactive)
   */
  getTabIcon(tab: FooterTabItem): string {
    if (this.isActiveTab(tab) && tab.iconActive) {
      return tab.iconActive;
    }
    return tab.icon;
  }

  /** Whether a tab should be emphasized as the centered primary create action */
  isCenteredCreateTab(tab: FooterTabItem): boolean {
    return this.isCenteredCreateVariant() && tab.id === 'create-post';
  }

  isAgentXTab(tab: FooterTabItem): boolean {
    return tab.id === 'ai';
  }

  /** Whether a tab is the profile identity tab (custom sparkle icon) */
  isProfileTab(tab: FooterTabItem): boolean {
    return tab.id === 'profile';
  }

  /**
   * Handle tab click
   * Follows Instagram/Twitter/TikTok pattern: tapping active tab scrolls to top.
   */
  async onTabClick(tab: FooterTabItem, event: Event): Promise<void> {
    if (tab.disabled) return;

    try {
      // Check if tapping the currently active tab (scroll-to-top pattern)
      const isCurrentlyActive = this.isActiveTab(tab);

      if (isCurrentlyActive && this.config.scrollToTopOnSameTap !== false) {
        // Trigger haptic feedback for scroll-to-top action
        await this.triggerHaptic();

        // Emit scroll-to-top event instead of navigation
        this.scrollToTop.emit({
          tab,
          timestamp: Date.now(),
          source: 'same-tab-tap',
        });

        // Don't navigate or emit tabSelect - just scroll to top
        return;
      }

      // Store previous tab
      this.previousTab = this.activeTab();

      // Trigger haptic feedback
      await this.triggerHaptic();

      // Update internal state
      this._activeTabId.set(tab.id);

      // Emit selection event
      this.tabSelect.emit({
        tab,
        previousTab: this.previousTab,
        event,
      });

      // Navigate (only if not handled externally)
      if (this.isBrowser && tab.route) {
        void this.router.navigate([tab.route]);
      }
    } catch (error) {
      // Log but don't throw - tab click failures shouldn't crash the app
      this.logger.error('Tab click handler failed', error);
    }
  }
}
