/**
 * @fileoverview Manage Team Page - Web App Wrapper
 * @module @nxt1/web/features/manage-team
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Manage Team shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ FOLLOWS THE EDIT-PROFILE PATTERN ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Team context from route params
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import {
  ManageTeamShellComponent,
  ManageTeamService,
  NxtLoggingService,
  NxtToastService,
} from '@nxt1/ui';
import type { ManageTeamCloseEvent } from '@nxt1/ui';

@Component({
  selector: 'app-manage-team',
  standalone: true,
  imports: [ManageTeamShellComponent],
  template: `
    <nxt1-manage-team-shell
      [mode]="'full'"
      [showHeader]="true"
      [title]="pageTitle()"
      (close)="onClose($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly manageTeamService = inject(ManageTeamService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ManageTeamComponent');

  /** Team ID from route parameter */
  private readonly _teamId = signal<string | null>(null);

  /** Page title */
  protected readonly pageTitle = computed(() => {
    const teamName = this.manageTeamService.teamName();
    return teamName ? `Manage ${teamName}` : 'Manage Team';
  });

  ngOnInit(): void {
    // Get team ID from route params
    const teamId = this.route.snapshot.paramMap.get('teamId');
    this._teamId.set(teamId);

    this.logger.info('Manage Team page initialized', { teamId });

    // Load team data
    if (teamId) {
      this.manageTeamService.loadTeam(teamId);
    } else {
      // Load current user's team
      this.manageTeamService.loadCurrentUserTeam();
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

    // Navigate back
    if (window.history.length > 1) {
      window.history.back();
    } else {
      this.router.navigate(['/home']);
    }
  }
}
