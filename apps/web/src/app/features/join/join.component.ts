/**
 * @fileoverview Join Redirect Component — Invite Link Landing Page
 * @module @nxt1/web/features/join
 *
 * Handles incoming invite links:
 *   /join/:code?ref=<uid>&type=<general|team|...>&team=<firestoreId>&teamCode=<code>&teamName=<name>
 *
 * Flow:
 * 1. Extracts referral params from URL (route param + query params)
 * 2a. For TEAM invites: shows a role-selection screen (Athlete / Parent / Coach+Staff),
 *     saves the chosen role to sessionStorage, then redirects to /auth?mode=signup
 * 2b. For all other invites: persists referral data, redirects immediately
 * 3. After signup, AuthFlowService reads sessionStorage and calls POST /invite/accept
 *    (with teamCode + role for team invites — backend adds user to roster)
 *
 * On SSR this component is a no-op; redirect and role UI only run in browser.
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
import { InviteApiService } from '@nxt1/ui/invite';
import { SeoService } from '../../core/services/seo.service';

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
  /** Role chosen by the invitee on the landing page */
  readonly role?: string;
  /** Timestamp when the link was opened */
  readonly timestamp: number;
}

/** SessionStorage key for pending referral data. */
export const PENDING_REFERRAL_KEY = 'nxt1:pending_referral';

/** Roles the invitee can choose when joining a team. */
interface RoleOption {
  label: string;
  value: string;
  emoji: string;
  description: string;
  requiresApproval: boolean;
}

const TEAM_ROLES: readonly RoleOption[] = [
  {
    label: 'Athlete',
    value: 'Athlete',
    emoji: '🏃',
    description: 'Join as a player on the roster',
    requiresApproval: false,
  },
  {
    label: 'Parent / Guardian',
    value: 'Parent',
    emoji: '👨\u200d👩\u200d👧',
    description: 'Follow along and support your athlete',
    requiresApproval: false,
  },
  {
    label: 'Coach / Staff',
    value: 'Coach',
    emoji: '📋',
    description: 'Requires approval from team admin',
    requiresApproval: true,
  },
] as const;

@Component({
  selector: 'app-join',
  standalone: true,
  imports: [NxtLogoComponent],
  template: `
    @if (showRoleSelection()) {
      <!-- Team invite: role-selection screen -->
      <div
        class="bg-background flex min-h-screen flex-col items-center justify-center px-6 py-12"
        data-testid="join-role-selection"
      >
        <nxt1-logo variant="default" size="lg" />

        <div class="mt-8 w-full max-w-sm text-center">
          <h1 class="text-2xl font-bold text-text-primary">You're invited to join</h1>
          @if (teamName()) {
            <p class="text-brand mt-1 text-lg font-semibold">{{ teamName() }}</p>
          }
          <p class="mt-2 text-sm text-text-secondary">How are you joining this team?</p>
        </div>

        <div class="mt-8 flex w-full max-w-sm flex-col gap-3">
          @for (option of roleOptions; track option.value) {
            <button
              class="bg-surface hover:border-brand flex items-start gap-4 rounded-xl border border-border p-4 text-left transition-all"
              [attr.data-testid]="'role-option-' + option.value.toLowerCase()"
              (click)="selectRole(option.value)"
            >
              <span class="text-3xl">{{ option.emoji }}</span>
              <div>
                <p class="font-semibold text-text-primary">{{ option.label }}</p>
                <p class="text-sm text-text-secondary">{{ option.description }}</p>
                @if (option.requiresApproval) {
                  <p class="mt-1 text-xs text-warning">Requires coach approval</p>
                }
              </div>
            </button>
          }
        </div>
      </div>
    } @else {
      <!-- Loading / redirect state -->
      <div
        class="bg-background flex min-h-screen items-center justify-center"
        data-testid="join-redirect-page"
      >
        <div class="flex flex-col items-center gap-4 text-center">
          <nxt1-logo variant="default" size="lg" />
          <p class="animate-pulse text-sm text-text-secondary">Preparing your invite…</p>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger = inject(NxtLoggingService).child('JoinComponent');
  private readonly inviteApi = inject(InviteApiService);
  private readonly seo = inject(SeoService);

  protected readonly showRoleSelection = signal(false);
  protected readonly teamName = signal<string | undefined>(undefined);
  protected readonly roleOptions = TEAM_ROLES;

  /** Partial referral stored before role is chosen. Completed on selectRole(). */
  private pendingBase: Omit<PendingReferral, 'role'> | null = null;

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
    const teamCode = this.route.snapshot.queryParamMap.get('teamCode') ?? undefined;
    const teamName = this.route.snapshot.queryParamMap.get('teamName') ?? undefined;

    if (!code) {
      this.logger.warn('Join link missing required code', { code: !!code });
      this.router.navigate(['/auth'], { queryParams: { mode: 'signup' }, replaceUrl: true });
      return;
    }

    let inviterUid = ref;
    if (!inviterUid) {
      const validation = await this.inviteApi.validateReferralCode(code);
      if (!validation.valid || !validation.inviterUid) {
        this.logger.warn('Join link could not resolve inviter from referral code', { code });
        this.router.navigate(['/auth'], { queryParams: { mode: 'signup' }, replaceUrl: true });
        return;
      }
      inviterUid = validation.inviterUid;
    }

    const base: Omit<PendingReferral, 'role'> = {
      code,
      inviterUid,
      type,
      teamId,
      teamCode,
      teamName,
      timestamp: Date.now(),
    };

    // For team invites with a teamCode, show role-selection before redirecting
    if (type === 'team' && teamCode) {
      this.pendingBase = base;
      this.teamName.set(teamName);
      this.showRoleSelection.set(true);
      this.logger.info('Showing role selection for team invite', { code, teamCode });
      return;
    }

    // Non-team invites: store and redirect immediately
    this.storeAndRedirect({ ...base });
  }

  /** Called when the user taps a role card. */
  protected selectRole(role: string): void {
    if (!this.pendingBase) return;
    const pending: PendingReferral = { ...this.pendingBase, role };
    this.storeAndRedirect(pending);
  }

  private storeAndRedirect(pending: PendingReferral): void {
    try {
      sessionStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(pending));
      this.logger.info('Referral data stored', {
        code: pending.code,
        type: pending.type,
        role: pending.role,
      });
    } catch {
      this.logger.warn('Failed to write sessionStorage');
    }

    this.router.navigate(['/auth'], {
      queryParams: { mode: 'signup', ref: pending.code },
      replaceUrl: true,
    });
  }
}
