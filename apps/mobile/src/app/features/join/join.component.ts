/**
 * @fileoverview Mobile Join Component — Invite Link Handler
 * @module @nxt1/mobile/features/join
 *
 * Handles incoming invite deep links on mobile:
 *   /join/:code?ref=<uid>&type=<general|team|...>&teamCode=<code>&teamName=<name>
 *
 * Flow (unauthenticated):
 * 1. Extracts code + query params from URL
 * 2. Stores invite data in native storage with default role='Athlete'
 * 3. Navigates to /auth?mode=signup&invite=CODE
 * 4. During onboarding, user can select role (Athlete or Coach only for team invites)
 * 5. After signup, AuthFlowService reads storage and calls POST /invite/accept
 *
 * Flow (already authenticated + team invite):
 * 1. Shows confirmation screen: "TeamName invited you to join"
 * 2. User taps Accept → POST /invite/accept using their actual role → navigate to /home
 * 3. User taps Decline → navigate to /home
 *
 * Mirrors apps/web/src/app/features/join/join.component.ts
 */

import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular/standalone';
import { IonSpinner, IonButton } from '@ionic/angular/standalone';
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
  imports: [IonSpinner, IonButton, NxtLogoComponent],
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
          <ion-button
            expand="block"
            color="primary"
            [disabled]="isAccepting()"
            (click)="acceptInvite()"
          >
            {{ isAccepting() ? 'Joining…' : 'Accept & Join Team' }}
          </ion-button>
          <ion-button
            expand="block"
            fill="outline"
            color="medium"
            [disabled]="isAccepting()"
            (click)="declineInvite()"
          >
            Decline
          </ion-button>
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
        background: var(--nxt1-color-bg-primary);
      }

      .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        gap: 16px;
        color: var(--nxt1-color-text-secondary);
        font-size: 14px;
      }

      .confirm-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        gap: 24px;
        padding: 32px 24px;
      }

      .confirm-body {
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .confirm-title {
        font-size: 20px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .confirm-message {
        font-size: 14px;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .confirm-actions {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
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
    void this.navController.navigateRoot('/home');
  }

  protected declineInvite(): void {
    void this.navController.navigateRoot('/home');
  }

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.paramMap.get('code')?.trim().toUpperCase() ?? '';
    const ref = this.route.snapshot.queryParamMap.get('ref') ?? '';
    const type = this.route.snapshot.queryParamMap.get('type') ?? 'general';
    const teamId = this.route.snapshot.queryParamMap.get('team') ?? undefined;
    let teamCode = this.route.snapshot.queryParamMap.get('teamCode') ?? undefined;
    let teamName = this.route.snapshot.queryParamMap.get('teamName') ?? undefined;
    let sport = this.route.snapshot.queryParamMap.get('sport') ?? undefined;

    if (!code) {
      this.logger.warn('Join link missing required code');
      void this.navController.navigateRoot('/auth', { queryParams: { mode: 'signup' } });
      return;
    }

    let inviterUid = ref;
    if (!inviterUid) {
      inviterUid = 'unknown';
    }

    // For team invites, fetch full team data from backend
    let teamData: ValidatedTeamInfo | undefined;
    if (type === 'team') {
      // Use the code from path as teamCode if not provided in query params
      if (!teamCode) {
        teamCode = code;
      }

      try {
        const result = await this.authApi.validateTeamCode(teamCode);
        if (result.valid && result.teamCode) {
          teamData = result.teamCode;
          teamName = teamData?.teamName || teamName;
          sport = teamData?.sport || sport;
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
      teamId: teamData?.id || teamId,
      teamCode,
      teamName,
      sport,
      teamType: teamData?.teamType,
      role: 'Athlete', // Default role, user can change in onboarding
      timestamp: Date.now(),
    };

    this.storeAndRedirect(pending);
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
