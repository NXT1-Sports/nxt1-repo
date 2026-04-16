/**
 * @fileoverview Join Redirect Component — Invite Link Landing Page
 * @module @nxt1/web/features/join
 *
 * Handles incoming invite links:
 *   /join/:code?ref=<uid>&type=<general|team|...>&team=<firestoreId>&teamCode=<code>&teamName=<name>
 *
 * Flow (unauthenticated):
 * 1. Extracts referral params from URL (route param + query params)
 * 2. Stores invite data in sessionStorage with default role='Athlete'
 * 3. Redirects to /auth?mode=signup&invite=CODE
 * 4. During onboarding, user can select role (Athlete or Coach only for team invites)
 * 5. After signup, AuthFlowService reads sessionStorage and calls POST /invite/accept
 *
 * Flow (already authenticated + team invite):
 * 1. Shows confirmation modal: "TeamName invited you to join"
 * 2. User clicks Accept → POST /invite/accept → navigate to /home
 * 3. User clicks Decline → navigate to /home
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
  template: `
    <div
      class="bg-background flex min-h-screen items-center justify-center"
      data-testid="join-redirect-page"
    >
      @if (confirmState()) {
        <!-- Confirmation modal for already-authenticated users -->
        <div
          class="flex max-w-sm flex-col items-center gap-6 rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-xl"
        >
          <nxt1-logo variant="default" size="md" />
          <div class="flex flex-col gap-2">
            <h2 class="text-lg font-semibold text-text-primary">You've been invited!</h2>
            <p class="text-sm text-text-secondary">
              <strong class="text-text-primary">{{ confirmState()!.teamName }}</strong>
              invited you to join their team.
            </p>
          </div>
          <div class="flex w-full flex-col gap-3">
            <button
              class="bg-brand-primary w-full rounded-xl px-6 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
              [disabled]="isAccepting()"
              (click)="acceptInvite()"
            >
              {{ isAccepting() ? 'Joining…' : 'Accept & Join Team' }}
            </button>
            <button
              class="w-full rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-text-secondary transition hover:bg-white/5"
              [disabled]="isAccepting()"
              (click)="declineInvite()"
            >
              Decline
            </button>
          </div>
        </div>
      } @else {
        <!-- Loading / redirecting state -->
        <div class="flex flex-col items-center gap-4 text-center">
          <nxt1-logo variant="default" size="lg" />
          <p class="animate-pulse text-sm text-text-secondary">Preparing your invite…</p>
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

    const ref = this.route.snapshot.queryParamMap.get('ref') ?? '';
    const type = this.route.snapshot.queryParamMap.get('type') ?? 'general';
    let teamCode: string | undefined;
    let teamName: string | undefined;
    let sport: string | undefined;

    if (!code) {
      this.logger.warn('Join link missing required code', { code: !!code });
      this.router.navigate(['/auth'], { queryParams: { mode: 'signup' }, replaceUrl: true });
      return;
    }

    let inviterUid = ref;
    if (!inviterUid) {
      inviterUid = 'unknown';
    }

    // For team invites, fetch full team data from backend
    let teamData: ValidatedTeamInfo | undefined;
    if (type === 'team') {
      // The path code IS the teamCode
      teamCode = code;

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
