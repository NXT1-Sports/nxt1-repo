/**
 * @fileoverview Manage Team Page — Auth-Aware Dual State
 * @module @nxt1/web/features/manage-team
 * @version 2.0.0
 *
 * Root component for the `/manage-team` route.
 * Implements the professional dual-state pattern (LinkedIn/Strava/GitHub):
 *
 * - **Logged out** → Marketing landing page with feature showcase & dashboard preview
 * - **Logged in** → Actual team management dashboard (shell)
 *
 * Same URL, different experience. SEO-optimized for both states.
 * SSR-safe with proper meta tags regardless of auth state.
 *
 * Architecture:
 * - Reads auth state via AUTH_SERVICE injection token (Signal-based)
 * - Landing page content is indexable; dashboard is noindex
 */

import { Component, ChangeDetectionStrategy, inject, OnInit, computed } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import {
  ManageTeamShellComponent,
  ManageTeamService,
  ManageTeamSkeletonComponent,
  NxtManageTeamLandingComponent,
} from '@nxt1/ui/manage-team';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import type { ManageTeamCloseEvent } from '@nxt1/ui/manage-team';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-manage-team',
  standalone: true,
  imports: [ManageTeamShellComponent, ManageTeamSkeletonComponent, NxtManageTeamLandingComponent],
  template: `
    <!-- Loading: Auth state initializing -->
    @if (isAuthLoading()) {
      <nxt1-manage-team-skeleton />
    }

    <!-- Authenticated: Show actual team management dashboard -->
    @else if (isAuthenticated()) {
      <nxt1-manage-team-shell
        [mode]="'full'"
        [showHeader]="true"
        [title]="pageTitle()"
        (close)="onClose($event)"
      />
    }

    <!-- Unauthenticated: Show marketing landing page -->
    @else {
      <nxt1-manage-team-landing />
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
export class ManageTeamComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly manageTeamService = inject(ManageTeamService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ManageTeamComponent');
  private readonly seo = inject(SeoService);

  /** Auth state signals */
  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly isAuthLoading = computed(
    () => !this.authService.isInitialized() || this.authService.isLoading()
  );

  /** Team ID from route parameter */
  private _teamId: string | null = null;

  /** Page title */
  protected readonly pageTitle = computed(() => {
    const teamName = this.manageTeamService.teamName();
    return teamName ? `Manage ${teamName}` : 'Manage Team';
  });

  ngOnInit(): void {
    // SEO — set meta tags based on auth state
    if (this.isAuthenticated()) {
      this.seo.updatePage({
        title: 'Manage Team',
        description: 'Manage your team roster, schedule, stats, and staff.',
        keywords: ['manage team', 'roster', 'schedule', 'coaching dashboard'],
        noIndex: true,
      });

      // Load team data for authenticated users
      const teamId = this.route.snapshot.paramMap.get('teamId');
      this._teamId = teamId;
      this.logger.info('Manage Team page initialized', { teamId });

      if (teamId) {
        this.manageTeamService.loadTeam(teamId);
      } else {
        this.manageTeamService.loadCurrentUserTeam();
      }
    } else {
      this.seo.updatePage({
        title: 'Team Management — Run Your Program Like a Pro | NXT1',
        description:
          'Manage your roster, schedule, stats, staff, and sponsors from one powerful coaching dashboard. Built for head coaches, assistants, and  directors.',
        keywords: [
          'team management',
          'coaching dashboard',
          'roster management',
          'sports scheduling',
          'team stats',
          'NXT1 coaching',
        ],
      });
    }
  }

  /**
   * Handle shell close event.
   */
  protected onClose(event: ManageTeamCloseEvent): void {
    this.logger.info('Manage team closed', { saved: event.saved });

    if (event.saved) {
      this.toast.success('Team saved successfully');
    }

    // Navigate back (SSR-safe)
    this.location.back();
  }
}
