/**
 * @fileoverview Join Redirect Component — Invite Link Landing Page
 * @module @nxt1/web/features/join
 *
 * Handles incoming invite links:
 *   /join/:code
 *
 * Flow (unauthenticated):
 * 1. Extracts invite code from URL path
 * 2. Calls POST /invite/validate to resolve invite type, inviter, and team metadata
 * 3. Stores invite data in sessionStorage with default role='Athlete'
 * 4. Redirects to /auth?mode=signup&invite=CODE
 * 5. During onboarding, user can select role (Athlete or Coach only for team invites)
 * 6. After signup, AuthFlowService reads sessionStorage and calls POST /invite/accept
 *
 * Flow (already authenticated + team invite):
 * 1. Shows confirmation modal: "TeamName invited you to join"
 * 2. User clicks Accept → POST /invite/accept → navigate to /agent
 * 3. User clicks Decline → navigate to /agent
 *
 * On SSR this component is a no-op; redirect logic only runs in browser.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtLogoComponent } from '@nxt1/ui/components/logo';
import { SeoService } from '../../core/services';
import { AuthApiService } from '../../core/services/auth/auth-api.service';
import { AuthFlowService } from '../../core/services/auth';
import { InviteApiService } from '@nxt1/ui/invite';
import type { ValidatedTeamInfo } from '@nxt1/core';

/** Shape of referral data persisted to sessionStorage. */
export interface PendingReferral {
  /** Referral code (e.g. NXT-06476B) */
  readonly code: string;
  /** Firebase UID of the inviter */
  readonly inviterUid: string;
  /** Invite type */
  readonly type: string;
  /** Optional team Firestore document ID */
  readonly teamId?: string;
  /** Team code (short alphanumeric) — passed to /invite/accept to join roster */
  readonly teamCode?: string;
  /** Human-readable team name — for display only */
  readonly teamName?: string;
  /** Sport name (e.g., "Football") from team document */
  readonly sport?: string;
  /** Team type (e.g., "High School") */
  readonly teamType?: string;
  /** Role chosen by the invitee on the landing page */
  readonly role?: string;
  /** Timestamp when the link was opened */
  readonly timestamp: number;
}

/** SessionStorage key for pending referral data. */
export const PENDING_REFERRAL_KEY = 'nxt1:pending_referral';

@Component({
  selector: 'app-join',
  standalone: true,
  imports: [NxtLogoComponent],
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: var(--nxt1-ui-bg-page);
      }

      .join-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-6, 1.5rem);
        width: 100%;
        max-width: 384px;
        padding: var(--nxt1-spacing-8, 2rem);
        background: var(--nxt1-ui-bg-card);
        border: 1px solid var(--nxt1-ui-bg-card-border);
        border-radius: var(--nxt1-ui-radius-2xl);
        box-shadow: var(--nxt1-ui-shadow-xl);
        text-align: center;
      }

      .join-copy {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 0.5rem);
      }

      .join-title {
        font-size: var(--nxt1-fontSize-lg, 1.125rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-ui-text-primary);
        margin: 0;
      }

      .join-subtitle {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-ui-text-secondary);
        margin: 0;
      }

      .join-subtitle strong {
        color: var(--nxt1-ui-text-primary);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
      }

      .join-actions {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 0.75rem);
        width: 100%;
      }

      .join-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-4, 1rem);
        text-align: center;
      }

      .join-loading-text {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-ui-text-muted);
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }
    `,
  ],
  template: `
    <div data-testid="join-redirect-page">
      @if (confirmState()) {
        <!-- Confirmation modal for already-authenticated users -->
        <div class="join-card">
          <nxt1-logo variant="default" size="md" />
          <div class="join-copy">
            <h2 class="join-title">You've been invited!</h2>
            <p class="join-subtitle">
              <strong>{{ confirmState()!.teamName }}</strong>
              invited you to join their team.
            </p>
          </div>
          <div class="join-actions">
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
        <div class="join-loading">
          <nxt1-logo variant="default" size="lg" />
          <p class="join-loading-text">Preparing your invite…</p>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger = inject(NxtLoggingService).child('JoinComponent');
  private readonly authApi = inject(AuthApiService);
  private readonly authFlow = inject(AuthFlowService);
  private readonly inviteApi = inject(InviteApiService);
  private readonly seo = inject(SeoService);

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
    // Use the authenticated user's actual role rather than hard-coding 'Athlete'
    const role = this.authFlow.userRole() ?? 'athlete';
    try {
      await this.inviteApi.acceptInvite(state.code, state.teamCode, role, state.inviterUid);
      this.logger.info('Invite accepted by authenticated user', { teamCode: state.teamCode, role });
    } catch (err) {
      this.logger.warn('Invite accept failed (non-blocking)', { error: err });
    } finally {
      this.isAccepting.set(false);
    }
    this.router.navigate(['/agent'], { replaceUrl: true });
  }

  protected declineInvite(): void {
    this.router.navigate(['/agent'], { replaceUrl: true });
  }

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.paramMap.get('code')?.trim().toUpperCase() ?? '';
    this.seo.updatePage({
      title: 'Join Team Invite',
      description: 'Accept your NXT1 invite to join a team or referral experience.',
      canonicalUrl: code
        ? `https://nxt1sports.com/join/${encodeURIComponent(code)}`
        : 'https://nxt1sports.com/join',
      noIndex: true,
      noFollow: true,
    });

    if (!isPlatformBrowser(this.platformId)) return;

    if (!code) {
      this.logger.warn('Join link missing required code');
      this.router.navigate(['/auth'], { queryParams: { mode: 'signup' }, replaceUrl: true });
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
        this.router.navigate(['/auth'], { queryParams: { mode: 'signup' }, replaceUrl: true });
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
      this.logger.info('Validating team code via API...', { teamCode });

      try {
        const result = await this.authApi.validateTeamCode(teamCode);
        this.logger.debug('Team validation API response', {
          teamCode,
          valid: result.valid,
          hasTeamCodeData: !!result.teamCode,
          error: result.error,
          sport: result.teamCode?.sport,
          teamName: result.teamCode?.teamName,
        });

        if (result.valid && result.teamCode) {
          teamData = result.teamCode;
          teamName = teamData.teamName;
          sport = teamData.sport;
          this.logger.info('Fetched full team data successfully', {
            teamId: teamData.id,
            teamName: teamData.teamName,
            sport: teamData.sport,
            teamType: teamData.teamType,
          });
        } else {
          this.logger.error(
            'Team validation FAILED - sport will NOT be auto-selected, role filter may not work correctly',
            {
              teamCode,
              valid: result.valid,
              apiError: result.error,
              hint: 'Ensure team exists in Firestore with isActive=true and sport field populated',
            }
          );
        }
      } catch (err) {
        this.logger.error('Team validation API call failed - sport step will NOT be skipped', {
          error: err,
          teamCode,
        });
      }

      // If the user is already authenticated, show a confirmation instead of redirecting to signup
      if (this.authFlow.isAuthenticated()) {
        const displayName = teamName ?? teamData?.teamName ?? 'A team';
        this.logger.info('Authenticated user opening team invite — showing confirmation', {
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

    this.storeAndRedirect(pending);
  }

  private storeAndRedirect(pending: PendingReferral): void {
    try {
      sessionStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(pending));

      // Store sport separately for easy access in onboarding
      if (pending.sport) {
        sessionStorage.setItem('nxt1:invite_sport', pending.sport);
      }

      this.logger.info('Referral data stored', {
        code: pending.code,
        teamCode: pending.teamCode,
        type: pending.type,
        role: pending.role,
        sport: pending.sport,
        teamName: pending.teamName,
      });
    } catch {
      this.logger.warn('Failed to write sessionStorage');
    }

    // Minimal URL params - invite code is enough to re-fetch team data on reload
    const queryParams: Record<string, string> = {
      mode: 'signup',
      invite: pending.code,
      inviteType: pending.type,
    };

    this.router.navigate(['/auth'], {
      queryParams,
      replaceUrl: true,
    });
  }
}
