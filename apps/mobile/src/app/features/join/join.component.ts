/**
 * @fileoverview Mobile Join Component — Invite Link Handler
 * @module @nxt1/mobile/features/join
 *
 * Handles incoming invite deep links on mobile:
 *   /join/:code?ref=<uid>&type=<general|team|...>&teamCode=<code>&teamName=<name>
 *
 * Flow:
 * 1. Extracts code + query params from URL
 * 2. For TEAM invites: shows role-selection screen, saves to sessionStorage
 * 3. Navigates to /auth?mode=signup
 * 4. After signup, AuthFlowService reads sessionStorage and calls POST /invite/accept
 *
 * Mirrors apps/web/src/app/features/join/join.component.ts
 */

import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular/standalone';
import { IonSpinner } from '@ionic/angular/standalone';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { InviteApiService } from '@nxt1/ui/invite';
import { NxtLogoComponent } from '@nxt1/ui/components/logo';

/** Shape of referral data persisted to sessionStorage. */
interface PendingReferral {
  readonly code: string;
  readonly inviterUid: string;
  readonly type: string;
  readonly teamId?: string;
  readonly teamCode?: string;
  readonly teamName?: string;
  readonly role?: string;
  readonly timestamp: number;
}

/** SessionStorage key — must match web app's PENDING_REFERRAL_KEY */
const PENDING_REFERRAL_KEY = 'nxt1:pending_referral';

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
    emoji: '👨‍👩‍👧',
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
  selector: 'app-join-mobile',
  standalone: true,
  imports: [IonSpinner, NxtLogoComponent],
  template: `
    @if (showRoleSelection()) {
      <div class="join-container" data-testid="join-role-selection">
        <nxt1-logo variant="default" size="lg" />

        <div class="join-header">
          <h1>You're invited to join</h1>
          @if (teamName()) {
            <p class="team-name">{{ teamName() }}</p>
          }
          <p class="subtitle">How are you joining this team?</p>
        </div>

        <div class="role-list">
          @for (option of roleOptions; track option.value) {
            <button
              class="role-card"
              [attr.data-testid]="'role-option-' + option.value.toLowerCase()"
              (click)="selectRole(option.value)"
            >
              <span class="role-emoji">{{ option.emoji }}</span>
              <div class="role-info">
                <p class="role-label">{{ option.label }}</p>
                <p class="role-desc">{{ option.description }}</p>
                @if (option.requiresApproval) {
                  <p class="role-warning">Requires coach approval</p>
                }
              </div>
            </button>
          }
        </div>
      </div>
    } @else {
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

      .join-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 48px 24px;
        gap: 24px;
      }

      .join-header {
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .join-header h1 {
        font-size: 22px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .team-name {
        font-size: 18px;
        font-weight: 600;
        color: var(--nxt1-color-primary);
        margin: 0;
      }

      .subtitle {
        font-size: 14px;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .role-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        max-width: 360px;
      }

      .role-card {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        background: var(--nxt1-color-bg-surface);
        border: 1px solid var(--nxt1-color-border);
        border-radius: 16px;
        padding: 16px;
        text-align: left;
        cursor: pointer;
        width: 100%;
        transition: border-color 0.15s;
      }

      .role-card:active {
        border-color: var(--nxt1-color-primary);
      }

      .role-emoji {
        font-size: 28px;
        flex-shrink: 0;
      }

      .role-label {
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 2px;
      }

      .role-desc {
        font-size: 13px;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .role-warning {
        font-size: 12px;
        color: var(--nxt1-color-warning);
        margin: 4px 0 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinMobileComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly navController = inject(NavController);
  private readonly logger = inject(NxtLoggingService).child('JoinMobileComponent');
  private readonly inviteApi = inject(InviteApiService);

  protected readonly showRoleSelection = signal(false);
  protected readonly teamName = signal<string | undefined>(undefined);
  protected readonly roleOptions = TEAM_ROLES;

  private pendingBase: Omit<PendingReferral, 'role'> | null = null;

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.paramMap.get('code')?.trim().toUpperCase() ?? '';
    const ref = this.route.snapshot.queryParamMap.get('ref') ?? '';
    const type = this.route.snapshot.queryParamMap.get('type') ?? 'general';
    const teamId = this.route.snapshot.queryParamMap.get('team') ?? undefined;
    const teamCode = this.route.snapshot.queryParamMap.get('teamCode') ?? undefined;
    const teamName = this.route.snapshot.queryParamMap.get('teamName') ?? undefined;

    if (!code) {
      this.logger.warn('Join link missing required code');
      void this.navController.navigateRoot('/auth', { queryParams: { mode: 'signup' } });
      return;
    }

    let inviterUid = ref;
    if (!inviterUid) {
      const validation = await this.inviteApi.validateReferralCode(code);
      if (!validation.valid || !validation.inviterUid) {
        this.logger.warn('Could not resolve inviter from referral code', { code });
        void this.navController.navigateRoot('/auth', { queryParams: { mode: 'signup' } });
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

    if (type === 'team' && teamCode) {
      this.pendingBase = base;
      this.teamName.set(teamName);
      this.showRoleSelection.set(true);
      this.logger.info('Showing role selection for team invite', { code, teamCode });
      return;
    }

    this.storeAndRedirect({ ...base });
  }

  protected selectRole(role: string): void {
    if (!this.pendingBase) return;
    this.storeAndRedirect({ ...this.pendingBase, role });
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

    void this.navController.navigateRoot('/auth', {
      queryParams: { mode: 'signup', ref: pending.code },
    });
  }
}
