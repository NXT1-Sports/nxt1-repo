/**
 * @fileoverview XP Root Page — Auth-Aware Dual State
 * @module @nxt1/web/features/xp
 * @version 2.0.0
 *
 * Root component for the `/xp` route.
 * Implements the professional dual-state pattern (LinkedIn/Strava/GitHub):
 *
 * - **Logged out** → Marketing landing page with feature showcase & preview
 * - **Logged in** → Actual XP dashboard with missions, progress, badges
 *
 * Same URL, different experience. SEO-optimized for both states.
 * SSR-safe with proper meta tags regardless of auth state.
 *
 * Architecture:
 * - Reads auth state via AUTH_SERVICE injection token (Signal-based)
 * - Landing page content is indexable; dashboard is noindex
 */

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import {
  XpShellWebComponent,
  NxtXpLandingComponent,
  XpSkeletonComponent,
  NxtLoggingService,
  NxtSidenavService,
  NxtPlatformService,
} from '@nxt1/ui';
import type { MissionUserRole } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-xp',
  standalone: true,
  imports: [XpShellWebComponent, NxtXpLandingComponent, XpSkeletonComponent],
  template: `
    <!-- Loading: Auth state initializing -->
    @if (isAuthLoading()) {
      <nxt1-xp-skeleton />
    }

    <!-- Authenticated: Show actual XP dashboard -->
    @else if (isAuthenticated()) {
      <nxt1-xp-shell-web
        [userRole]="userRole()"
        [avatarSrc]="avatarSrc()"
        [avatarName]="avatarName()"
        [hideHeader]="isDesktop()"
        (avatarClick)="onAvatarClick()"
      />
    }

    <!-- Unauthenticated: Show marketing landing page -->
    @else {
      <nxt1-xp-landing />
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XpComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly _logger = inject(NxtLoggingService).child('XpComponent');
  private readonly seo = inject(SeoService);
  private readonly platform = inject(NxtPlatformService);

  /** Auth state signals */
  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly isAuthLoading = computed(
    () => !this.authService.isInitialized() || this.authService.isLoading()
  );

  /** Desktop detection for hiding redundant page header (sidebar provides nav) */
  protected readonly isDesktop = computed(() => this.platform.viewport().width >= 1280);

  ngOnInit(): void {
    if (this.isAuthenticated()) {
      this.seo.updatePage({
        title: 'XP & Missions',
        description: 'Complete missions, earn XP, and level up your recruiting journey.',
        keywords: ['xp', 'missions', 'achievements', 'badges', 'gamification'],
        noIndex: true,
      });
    } else {
      this.seo.updatePage({
        title: 'XP & Missions — Level Up Your Recruiting Game | NXT1',
        description:
          'Complete guided missions, earn XP, collect badges, and advance through 5 levels. A gamified recruiting journey for athletes and coaches on NXT1.',
        keywords: [
          'sports gamification',
          'recruiting missions',
          'athlete xp',
          'achievement badges',
          'daily streaks',
          'NXT1 xp',
        ],
      });
    }
  }

  /**
   * Determine user role for XP task type.
   * Defaults to 'athlete' if user is not authenticated.
   */
  protected readonly userRole = computed<MissionUserRole>(() => {
    const role = this.authService.userRole();
    if (!role) return 'athlete';
    return role === 'coach' ? 'coach' : 'athlete';
  });

  /** Avatar source URL for page header */
  protected readonly avatarSrc = computed(() => {
    const user = this.authService.user();
    if (!user) return undefined;
    return user.photoURL ?? undefined;
  });

  /** Avatar display name for page header */
  protected readonly avatarName = computed(() => {
    const user = this.authService.user();
    if (!user) return '';
    return user.displayName ?? '';
  });

  /** Handle avatar click — open sidenav */
  onAvatarClick(): void {
    this.sidenavService.open();
  }
}
