/**
 * @fileoverview Mobile Join Component — Invite Link Handler
 * @module @nxt1/mobile/features/join
 *
 * Handles incoming invite deep links on mobile:
 *   /join/:code
 *
 * Flow (unauthenticated):
 * 1. Extracts invite code from URL path
 * 2. Calls POST /invite/validate to resolve invite type, inviter, and team metadata
 * 3. Stores invite data in native storage with default role='Athlete'
 * 4. Navigates to /auth?mode=signup&invite=CODE
 * 5. During onboarding, user can select role (Athlete or Coach only for team invites)
 * 6. After signup, AuthFlowService reads storage and calls POST /invite/accept
 *
 * Flow (already authenticated + team invite):
 * 1. Shows confirmation screen: "TeamName invited you to join"
 * 2. User taps Accept → POST /invite/accept using their actual role → navigate to /agent
 * 3. User taps Decline → navigate to /agent
 *
 * Mirrors apps/web/src/app/features/join/join.component.ts
 */

import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular/standalone';
import { IonSpinner } from '@ionic/angular/standalone';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtLogoComponent } from '@nxt1/ui/components/logo';
import type { ValidatedTeamInfo } from '@nxt1/core';
import { AuthApiService } from '../../core/services/auth/auth-api.service';
import { AuthFlowService } from '../../core/services/auth/auth-flow.service';
import { InviteApiService } from '@nxt1/ui/invite';
import { createNativeStorageAdapter } from '../../core/infrastructure/native-storage.adapter';

/** Shape of referral data persisted to sessionStorage. */
export interface PendingReferral {
  readonly code: string;
  readonly inviterUid: string;
  readonly type: string;
  readonly teamId?: string;
  readonly teamCode?: string;
  readonly teamName?: string;
  readonly sport?: string;
  readonly teamType?: string;
  readonly role?: string;
  readonly timestamp: number;
}

/** Native storage key for pending referral (Capacitor Preferences on mobile, localStorage on web) */
export const PENDING_REFERRAL_KEY = 'nxt1:pending_referral';

/** Native storage key to indicate user joined a team via invite (skip team selection in onboarding) */
export const INVITE_TEAM_JOINED_KEY = 'nxt1:invite_team_joined';

/** Native storage key for sport pre-selection from invite link */
export const INVITE_SPORT_KEY = 'nxt1:invite_sport';

@Component({
  selector: 'app-join-mobile',
  standalone: true,
  imports: [IonSpinner, NxtLogoComponent],
  template: `
    @if (confirmState(); as state) {
      <!-- Confirmation screen for already-authenticated users -->
      <div class="confirm-container" data-testid="join-confirm-page">
        <nxt1-logo variant="default" size="md" />
        <div class="confirm-body">
          <h2 class="confirm-title">You've been invited!</h2>
          <p class="confirm-message">
            <strong>{{ state.teamName }}</strong> invited you to join their team.
          </p>
        </div>
        <div class="confirm-actions">
          <button class="nxt1-btn-primary" [disabled]="isAccepting()" (click)="acceptInvite()">
            {{ isAccepting() ? 'Joining…' : 'Accept & Join Team' }}
          </button>
          <button class="nxt1-btn-secondary" [disabled]="isAccepting()" (click)="declineInvite()">
            Decline
          </button>
        </div>
      </div>
    } @else {
      <!-- Loading / redirecting state -->
      <div class="loading-container" data-testid="join-redirect-page">
        <nxt1-logo variant="default" size="lg" />
        <ion-spinner name="crescent" />
        <p>Preparing your invite…</p>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: var(--nxt1-ui-bg-page);
      }

      .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        gap: var(--nxt1-spacing-4, 16px);
        color: var(--nxt1-ui-text-muted);
        font-size: var(--nxt1-fontSize-sm, 14px);
      }

      .confirm-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        gap: var(--nxt1-spacing-6, 24px);
        padding: var(--nxt1-spacing-8, 32px) var(--nxt1-spacing-6, 24px);
      }

      .confirm-body {
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .confirm-title {
        font-size: var(--nxt1-fontSize-xl, 20px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-ui-text-primary);
        margin: 0;
      }

      .confirm-message {
        font-size: var(--nxt1-fontSize-sm, 14px);
        color: var(--nxt1-ui-text-secondary);
        margin: 0;
      }

      .confirm-actions {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinMobileComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly navController = inject(NavController);
  private readonly logger = inject(NxtLoggingService).child('JoinMobileComponent');
  private readonly authApi = inject(AuthApiService);
  private readonly authFlow = inject(AuthFlowService);
  private readonly inviteApi = inject(InviteApiService);
  private readonly storage = createNativeStorageAdapter();

  protected readonly confirmState = signal<{
    teamName: string;
    code: string;
    teamCode: string;
    inviterUid: string;
  } | null>(null);
  protected readonly isAccepting = signal(false);

  protected async acceptInvite(): Promise<void> {
    const state = this.confirmState();
    if (!state || this.isAccepting()) return;
    this.isAccepting.set(true);
    const role = this.authFlow.userRole() ?? 'athlete';
    try {
      await this.inviteApi.acceptInvite(state.code, state.teamCode, role, state.inviterUid);
      this.logger.info('Invite accepted by authenticated mobile user', {
        teamCode: state.teamCode,
        role,
      });
    } catch (err) {
      this.logger.warn('Invite accept failed (non-blocking)', { error: err });
    } finally {
      this.isAccepting.set(false);
    }
    void this.navController.navigateRoot('/agent');
  }

  protected declineInvite(): void {
    void this.navController.navigateRoot('/agent');
  }

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.paramMap.get('code')?.trim().toUpperCase() ?? '';

    if (!code) {
      this.logger.warn('Join link missing required code');
      void this.navController.navigateRoot('/auth', { queryParams: { mode: 'signup' } });
      return;
    }

    // Resolve all invite metadata server-side — no query params needed
    let inviterUid = 'unknown';
    let type = 'general';
    let teamCode: string | undefined;
    let teamName: string | undefined;
    let sport: string | undefined;

    try {
      const validateResult = await this.inviteApi.validateCode(code);
      this.logger.debug('Invite validate response', { code, valid: validateResult.valid });

      if (!validateResult.valid) {
        this.logger.warn('Invalid invite code', { code });
        void this.navController.navigateRoot('/auth', { queryParams: { mode: 'signup' } });
        return;
      }

      inviterUid = validateResult.inviterUid ?? 'unknown';
      type = validateResult.type ?? 'general';
      teamCode = validateResult.teamCode;
      teamName = validateResult.teamName;
      sport = validateResult.sport;
    } catch (err) {
      this.logger.warn('Invite validate failed — proceeding as general invite', { error: err });
    }

    // For team invites, fetch full team data (teamId, teamType) via validateTeamCode
    let teamData: ValidatedTeamInfo | undefined;
    if (type === 'team' && teamCode) {
      try {
        const result = await this.authApi.validateTeamCode(teamCode);
        if (result.valid && result.teamCode) {
          teamData = result.teamCode;
          teamName = teamData?.teamName;
          sport = teamData?.sport;
          this.logger.info('Fetched full team data', {
            teamId: teamData.id,
            teamName: teamData.teamName,
            sport: teamData.sport,
          });
        } else {
          this.logger.warn('Team validation returned invalid or no teamCode', {
            teamCode,
            valid: result.valid,
            hasTeamCodeData: !!result.teamCode,
          });
        }
      } catch (err) {
        this.logger.error('Failed to fetch team data - sport step will NOT be skipped', {
          error: err,
          teamCode,
        });
      }

      // If the user is already authenticated, show a confirmation instead of redirecting to signup
      if (this.authFlow.isAuthenticated()) {
        const displayName = teamName ?? teamData?.teamName ?? 'A team';
        this.logger.info('Authenticated mobile user opening team invite — showing confirmation', {
          teamCode,
          teamName: displayName,
        });
        this.confirmState.set({
          teamName: displayName,
          code,
          teamCode: teamCode!,
          inviterUid,
        });
        return;
      }
    }

    // Store invite data with default role='Athlete'
    // User will select role during onboarding wizard (Athlete or Coach only for team invites)
    const pending: PendingReferral = {
      code,
      inviterUid,
      type,
      teamId: teamData?.id,
      teamCode,
      teamName,
      sport,
      teamType: teamData?.teamType,
      role: 'Athlete', // Default role, user can change in onboarding
      timestamp: Date.now(),
    };

    void this.storeAndRedirect(pending);
  }

  private async storeAndRedirect(pending: PendingReferral): Promise<void> {
    try {
      // Store in native storage (Capacitor Preferences - persists across app restarts)
      await this.storage.set(PENDING_REFERRAL_KEY, JSON.stringify(pending));

      // Also store in sessionStorage for immediate access (faster)
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(pending));
      }

      // Store sport separately for easy access in onboarding
      if (pending.sport) {
        await this.storage.set(INVITE_SPORT_KEY, pending.sport);
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(INVITE_SPORT_KEY, pending.sport);
        }
      }

      this.logger.info('Referral data stored in native storage', {
        code: pending.code,
        teamCode: pending.teamCode,
        type: pending.type,
        role: pending.role,
        sport: pending.sport,
        teamName: pending.teamName,
      });
    } catch (err) {
      this.logger.error('Failed to write to native storage', { error: err });
    }

    // Minimal URL params - invite code is enough to re-fetch team data on reload
    const queryParams: Record<string, string> = {
      mode: 'signup',
      invite: pending.code,
      inviteType: pending.type,
    };

    void this.navController.navigateRoot('/auth', { queryParams });
  }
}
