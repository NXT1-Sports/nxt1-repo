/**
 * @fileoverview Join Redirect Component — Invite Link Landing Page
 * @module @nxt1/web/features/join
 *
 * Handles incoming invite links:
 *   /join/:code?ref=<uid>&code=<CODE>&type=<general|team|...>
 *
 * Flow:
 * 1. Extracts referral params from URL (route param + query params)
 * 2. Persists referral data to sessionStorage (SSR-safe)
 * 3. Redirects to /auth?mode=signup so the user can sign up
 * 4. After signup, AuthFlowService reads sessionStorage and calls POST /invite/accept
 *
 * This component renders a brief branded loading state while the redirect
 * happens. On SSR, it's a no-op (redirect only runs in browser).
 */

import { Component, ChangeDetectionStrategy, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtLogoComponent } from '@nxt1/ui/components/logo';

/** Shape of referral data persisted to sessionStorage. */
export interface PendingReferral {
  /** Referral code (e.g. NXT-06476B) */
  readonly code: string;
  /** Firebase UID of the inviter */
  readonly inviterUid: string;
  /** Invite type */
  readonly type: string;
  /** Optional team ID */
  readonly teamId?: string;
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
        <p class="text-text-secondary animate-pulse text-sm">Preparing your invite…</p>
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

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const code = this.route.snapshot.paramMap.get('code')?.trim().toUpperCase() ?? '';
    const ref = this.route.snapshot.queryParamMap.get('ref') ?? '';
    const type = this.route.snapshot.queryParamMap.get('type') ?? 'general';
    const teamId = this.route.snapshot.queryParamMap.get('team') ?? undefined;

    if (!code || !ref) {
      this.logger.warn('Join link missing required params', { code: !!code, ref: !!ref });
      this.router.navigate(['/auth'], { queryParams: { mode: 'signup' }, replaceUrl: true });
      return;
    }

    // Persist referral data so the auth flow can use it after signup
    const pending: PendingReferral = {
      code,
      inviterUid: ref,
      type,
      teamId,
      timestamp: Date.now(),
    };

    try {
      sessionStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(pending));
      this.logger.info('Referral data stored', { code, type });
    } catch {
      this.logger.warn('Failed to write sessionStorage');
    }

    // Redirect to signup with referral context
    this.router.navigate(['/auth'], {
      queryParams: { mode: 'signup', ref: code },
      replaceUrl: true,
    });
  }
}
