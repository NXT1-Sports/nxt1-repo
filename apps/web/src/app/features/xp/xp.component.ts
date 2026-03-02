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
import { XpShellWebComponent, NxtXpLandingComponent } from '@nxt1/ui/xp';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { MissionUserRole } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-xp',
  standalone: true,
  imports: [XpShellWebComponent, NxtXpLandingComponent],
  template: `
    <!-- Authenticated: Show actual XP dashboard -->
    @if (isAuthenticated()) {
      <nxt1-xp-shell-web [userRole]="userRole()" />
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
  private readonly _logger = inject(NxtLoggingService).child('XpComponent');
  private readonly seo = inject(SeoService);

  /** Auth state signals */
  protected readonly isAuthenticated = this.authService.isAuthenticated;

  ngOnInit(): void {
    if (this.isAuthenticated()) {
      this.seo.updatePage({
        title: 'XP',
        description:
          'Complete missions, earn XP, unlock real recruiting rewards, and track live Arena leaderboards.',
        keywords: [
          'xp',
          'missions',
          'achievements',
          'badges',
          'gamification',
          'xp economy',
          'arena leaderboard',
          'head to head rankings',
          'recruiting rewards',
        ],
        noIndex: true,
      });
    } else {
      this.seo.updatePage({
        title: 'XP — Level Up Your Recruiting Game | NXT1',
        description:
          'Grind now, cash in later. Complete guided missions, earn XP, climb The Arena head-to-head leaderboards, and unlock real recruiting rewards including profile upgrades, Agent X graphics, and featured athlete spotlight opportunities.',
        keywords: [
          'sports gamification',
          'recruiting missions',
          'athlete xp',
          'head to head leaderboard',
          'sports rankings',
          'state rankings',
          'achievement badges',
          'daily streaks',
          'NXT1 xp',
          'xp economy rewards',
          'featured athlete spotlight',
          'agent x graphic',
          'scout report reward',
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
}
