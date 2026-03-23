/**
 * @fileoverview Join Redirect Component — Invite Link Landing Page
 * @module @nxt1/web/features/join
 *
 * Handles incoming invite links:
 *   /join/:code?ref=<uid>&type=<general|team|...>&team=<firestoreId>&teamCode=<code>&teamName=<name>
 *
 * Flow:
 * 1. Extracts referral params from URL (route param + query params)
 * 2. Stores invite data in sessionStorage with default role='Athlete'
 * 3. Redirects to /auth?mode=signup&invite=CODE
 * 4. During onboarding, user can select role (Athlete or Coach only for team invites)
 * 5. After signup, AuthFlowService reads sessionStorage and calls POST /invite/accept
 *
 * On SSR this component is a no-op; redirect logic only runs in browser.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtLogoComponent } from '@nxt1/ui/components/logo';
import { SeoService } from '../../core/services/seo.service';
import { AuthApiService } from '../auth/services/auth-api.service';
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
      <div class="flex flex-col items-center gap-4 text-center">
        <nxt1-logo variant="default" size="lg" />
        <p class="animate-pulse text-sm text-text-secondary">Preparing your invite…</p>
      </div>
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
  private readonly seo = inject(SeoService);

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
    const teamId = this.route.snapshot.queryParamMap.get('team') ?? undefined;
    let teamCode = this.route.snapshot.queryParamMap.get('teamCode') ?? undefined;
    let teamName = this.route.snapshot.queryParamMap.get('teamName') ?? undefined;
    let sport = this.route.snapshot.queryParamMap.get('sport') ?? undefined;

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
      // Use the code from path as teamCode if not provided in query params
      if (!teamCode) {
        teamCode = code;
      }

      try {
        const result = await this.authApi.validateTeamCode(teamCode);
        if (result.valid && result.teamCode) {
          teamData = result.teamCode;
          teamName = teamData.teamName;
          sport = teamData.sport;
          this.logger.info('Fetched full team data', {
            teamId: teamData.id,
            teamName: teamData.teamName,
            sport: teamData.sport,
          });
        }
      } catch (err) {
        this.logger.warn('Failed to fetch team data, continuing with URL params', { error: err });
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

  private storeAndRedirect(pending: PendingReferral): void {
    try {
      sessionStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(pending));

      // Store sport separately for easy access in onboarding
      if (pending.sport) {
        sessionStorage.setItem('nxt1:invite_sport', pending.sport);
      }

      this.logger.info('Referral data stored', {
        code: pending.code,
        type: pending.type,
        role: pending.role,
        sport: pending.sport,
      });
    } catch {
      this.logger.warn('Failed to write sessionStorage');
    }

    // Pass all invite data through URL params for cross-device/session persistence
    const queryParams: Record<string, string> = {
      mode: 'signup',
      ref: pending.code,
      inviteType: pending.type,
    };

    if (pending.teamCode) queryParams['teamCode'] = pending.teamCode;
    if (pending.sport) queryParams['sport'] = pending.sport;
    if (pending.role) queryParams['role'] = pending.role;

    this.router.navigate(['/auth'], {
      queryParams,
      replaceUrl: true,
    });
  }
}
