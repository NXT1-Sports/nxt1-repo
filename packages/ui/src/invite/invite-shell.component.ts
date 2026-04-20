/**
 * @fileoverview Invite Shell Component - Main Container
 * @module @nxt1/ui/invite
 * @version 2.0.0
 *
 * Redesigned bottom sheet for NXT1 invites.
 *
 * Layout:
 * 1. NxtSheetHeaderComponent — title, close on right, no XP badge
 * 2. Scrollable content:
 *    - Real QR code (canvas) linked to personalized invite URL
 *    - Role-aware value proposition card
 *    - Value proposition card (free AI graphic on signup)
 * 3. Fixed bottom CTA: "Invite" → native OS share sheet
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  signal,
  OnInit,
  effect,
  untracked,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { IonSpinner } from '@ionic/angular/standalone';
import {
  isCapacitor,
  buildInviteShareTitle,
  buildInviteUiCopy,
  type InviteType,
  type InviteTeam,
  type UserRole,
  USER_ROLES,
} from '@nxt1/core';
import { InviteService } from './invite.service';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtSheetFooterComponent } from '../components/bottom-sheet/sheet-footer.component';
import { NxtLogoComponent } from '../components/logo/logo.component';
import { NxtIconComponent } from '../components/icon/icon.component';
import { INVITE_TEST_IDS } from '@nxt1/core/testing';

/**
 * User info for personalization.
 * `role` drives invite messaging.
 */
export interface InviteUser {
  readonly displayName?: string | null;
  readonly profileImg?: string | null;
  readonly referralCode?: string;
  /** The sender's platform role — controls which design variant is shown. */
  readonly role?: UserRole;
}

@Component({
  selector: 'nxt1-invite-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonSpinner,
    NxtSheetHeaderComponent,
    NxtSheetFooterComponent,
    NxtLogoComponent,
    NxtIconComponent,
  ],
  template: `
    <div
      class="invite-shell"
      [class.invite-shell--modal]="isModal()"
      [attr.data-testid]="testIds.SHELL"
    >
      <!-- ── HEADER ── -->
      <nxt1-sheet-header
        [title]="headerTitle()"
        [showClose]="showClose()"
        closePosition="right"
        [showBorder]="true"
        (closeSheet)="onClose()"
      />

      <!-- ── SCROLLABLE CONTENT ── -->
      <div class="invite-content">
        <div class="invite-body" [class.invite-body--modal]="isModal()">
          <!-- QR CODE: shared across both variants -->
          <div class="invite-qr-section" [attr.data-testid]="testIds.QR_SECTION">
            <div class="invite-qr-card">
              @if (qrLoading()) {
                <div class="invite-qr-skeleton" [attr.data-testid]="testIds.QR_LOADING">
                  <ion-spinner name="crescent" class="invite-qr-spinner" />
                </div>
              } @else if (qrError()) {
                <div class="invite-qr-error" [attr.data-testid]="testIds.QR_ERROR">
                  <nxt1-icon name="alertCircle" [size]="24" />
                  <span>Could not generate QR code</span>
                </div>
              } @else {
                <img
                  [src]="qrDataUrl()"
                  class="invite-qr-canvas"
                  alt="NXT1 invite QR code"
                  role="img"
                  [attr.data-testid]="testIds.QR_IMAGE"
                />
              }
              <div class="invite-qr-logo" aria-hidden="true">
                <nxt1-logo variant="default" size="xs" />
              </div>
            </div>
            <p class="invite-qr-label">Scan to join NXT1</p>
          </div>

          <!-- RIGHT COLUMN: cards -->
          <div class="invite-body__right">
            <div
              class="invite-explainer"
              role="note"
              aria-label="How invites work"
              [attr.data-testid]="testIds.EXPLAINER"
            >
              <p class="invite-explainer__title">How it works</p>
              <p class="invite-explainer__body">{{ howItWorksText() }}</p>
            </div>

            @if (showValueCard()) {
              <div class="invite-value-card" [attr.data-testid]="testIds.VALUE_CARD">
                <div class="invite-value-card__icon" aria-hidden="true">
                  <nxt1-icon name="gift" [size]="24" />
                </div>
                <div class="invite-value-card__text">
                  <p class="invite-value-card__title">{{ currentCopy().title }}</p>
                  <p class="invite-value-card__subtitle">{{ currentCopy().subtitle }}</p>
                </div>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- ── SHARED STICKY FOOTER CTA ── -->
      <nxt1-sheet-footer
        label="Invite"
        icon="share"
        [loading]="isSharing() || isLinkLoading()"
        [loadingLabel]="isLinkLoading() ? 'Preparing...' : 'Opening...'"
        (action)="onInvite()"
      />
    </div>
  `,
  styles: [
    `
      /* ================================================================
         INVITE SHELL v2 — Simplified, professional, theme-aware
         100% design tokens — zero hardcoded values
         ================================================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .invite-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-bg-primary);
      }

      .invite-shell--modal {
        border-radius: var(--nxt1-radius-xl, 16px) var(--nxt1-radius-xl, 16px) 0 0;
        overflow: hidden;
      }

      /* ── CONTENT ──
         Plain div replaces ion-content for reliable flex behavior.
         ion-content Shadow DOM doesn't participate correctly in flex
         layouts — using a plain overflow:auto div is the correct pattern
         for bottom sheet modals (same as auth-modal.component.ts).
      */

      .invite-content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }

      .invite-body {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-5, 20px);
        padding: var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-5, 20px);
        /* Extra bottom padding so last card doesn't sit flush at scroll end */
        padding-bottom: var(--nxt1-spacing-6, 24px);
        max-width: 420px;
        margin: 0 auto;
        width: 100%;
      }

      /* ── QR CODE ── */

      .invite-qr-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        width: 100%;
      }

      /* Larger QR for better scan reliability */
      .invite-qr-card {
        position: relative;
        width: 184px;
        height: 184px;
        padding: var(--nxt1-spacing-3, 12px);
        background: #ffffff;
        border-radius: var(--nxt1-radius-2xl, 24px);
        box-shadow:
          0 2px 8px var(--nxt1-color-alpha-black10, rgba(0, 0, 0, 0.08)),
          0 0 0 1px var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .invite-qr-canvas {
        width: 100%;
        height: 100%;
        border-radius: var(--nxt1-radius-lg, 12px);
        image-rendering: pixelated;
        image-rendering: crisp-edges;
        display: block;
      }

      .invite-qr-skeleton,
      .invite-qr-error {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        color: var(--nxt1-color-text-tertiary);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        text-align: center;
      }

      .invite-qr-spinner {
        --color: var(--nxt1-color-text-tertiary);
      }

      /* Center NXT1 logo over QR code */
      .invite-qr-logo {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 32px;
        height: 32px;
        background: #ffffff;
        border-radius: var(--nxt1-radius-md, 8px);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 1px 4px var(--nxt1-color-alpha-black10, rgba(0, 0, 0, 0.08));
        pointer-events: none;
      }

      .invite-qr-label {
        margin: var(--nxt1-spacing-1, 4px) 0 0;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--nxt1-color-text-secondary);
        text-align: center;
      }

      .invite-qr-url {
        margin: 0;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-mono, ui-monospace, monospace);
        letter-spacing: 0.01em;
        text-align: center;
      }

      /* ── INVITE EXPLAINER ── */

      .invite-explainer {
        width: 100%;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .invite-explainer__title {
        margin: 0 0 var(--nxt1-spacing-1, 4px) 0;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-text-primary);
      }

      .invite-explainer__body {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        line-height: 1.45;
        color: var(--nxt1-color-text-secondary);
      }

      /* ── VALUE PROPOSITION CARD ── */

      .invite-value-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-5, 20px);
        background: var(
          --nxt1-color-alpha-primary10,
          rgba(var(--nxt1-color-primary-rgb, 99, 102, 241), 0.08)
        );
        border-radius: var(--nxt1-radius-xl, 16px);
        border: 1px solid
          var(--nxt1-color-alpha-primary20, rgba(var(--nxt1-color-primary-rgb, 99, 102, 241), 0.2));
        width: 100%;
      }

      .invite-value-card__icon {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(
          --nxt1-color-alpha-primary15,
          rgba(var(--nxt1-color-primary-rgb, 99, 102, 241), 0.15)
        );
        color: var(--nxt1-color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .invite-value-card__title {
        margin: 0;
        flex: 1;
        min-width: 0;
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-primary);
        line-height: 1.3;
      }

      /* Staff variant — title + subtitle stacked */
      .invite-value-card__text {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
        flex: 1;
        min-width: 0;
      }

      .invite-value-card__subtitle {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-secondary);
        line-height: 1.45;
      }

      /* ── RIGHT COLUMN (modal two-column layout) ── */

      .invite-body__right {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 16px);
        width: 100%;
      }

      /* ── RESPONSIVE ── */

      @media (min-width: 640px) {
        .invite-body {
          padding: var(--nxt1-spacing-6, 24px);
          padding-bottom: var(--nxt1-spacing-8, 32px);
        }
      }

      /* ── MODAL TWO-COLUMN LAYOUT (desktop only) ── */

      @media (min-width: 600px) {
        .invite-body--modal {
          flex-direction: row;
          align-items: flex-start;
          gap: var(--nxt1-spacing-6, 24px);
          max-width: 100%;
          padding: var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-6, 24px) 0;
        }

        .invite-body--modal .invite-qr-section {
          flex: 0 0 auto;
          width: 200px;
        }

        .invite-body--modal .invite-body__right {
          flex: 1;
          min-width: 0;
        }

        .invite-body--modal .invite-qr-card {
          width: 164px;
          height: 164px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteShellComponent implements OnInit {
  private readonly invite = inject(InviteService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('InviteShellComponent');
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly testIds = INVITE_TEST_IDS;

  constructor() {
    // Re-generate whenever the invite URL becomes available (handles async load)
    effect(() => {
      const url = this.inviteUrl();
      if (!url) return;
      untracked(() => void this.generateQrCode(url));
    });
  }

  // ============================================
  // INPUTS
  // ============================================

  /** Current user info (optional — for personalization) */
  readonly user = input<InviteUser | null>(null);

  /** Invite type context */
  readonly inviteType = input<InviteType>('general');

  /** Team for team invites */
  readonly team = input<InviteTeam | null>(null);

  /** Whether shown in modal/bottom sheet */
  readonly isModal = input<boolean>(true);

  /** Whether to show the close button */
  readonly showClose = input<boolean>(true);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when close button clicked */
  readonly close = output<void>();

  // ============================================
  // LOCAL STATE
  // ============================================

  protected readonly qrLoading = signal(true);
  protected readonly qrError = signal(false);
  private readonly _qrDataUrl = signal<string>('');
  protected readonly qrDataUrl = this._qrDataUrl.asReadonly();
  protected readonly isSharing = signal(false);

  // ============================================
  // COMPUTED
  // ============================================

  /** True while the invite link is being fetched from the backend. */
  protected readonly isLinkLoading = computed(() => this.invite.isLoading());

  /** Role-aware invite copy shown in UI and used for sharing. */
  protected readonly currentCopy = computed(() =>
    buildInviteUiCopy({
      inviteType: this.inviteType(),
      senderRole: this.user()?.role ?? null,
      team: this.team(),
      rewardCents: this.invite.stats()?.referralRewardCents ?? null,
    })
  );

  /** Only show the reward card for athletes, parents, and recruiters — not coaches/directors. */
  protected readonly showValueCard = computed(() => {
    const role = this.user()?.role;
    return role !== USER_ROLES.COACH && role !== USER_ROLES.DIRECTOR;
  });

  /** Professional explainer shown above the reward card. */
  protected readonly howItWorksText = computed(() => this.currentCopy().howItWorksText);

  protected readonly headerTitle = computed(() => {
    const type = this.inviteType();
    if (type === 'team') return 'Invite Team';

    const role = this.user()?.role;
    if (role === USER_ROLES.COACH || role === USER_ROLES.DIRECTOR) {
      return 'Invite Players & Staff';
    }
    return 'Invite';
  });

  protected readonly inviteUrl = computed(() => {
    const link = this.invite.inviteLink();
    return link?.shortUrl ?? link?.url ?? null;
  });

  protected readonly displayUrl = computed(() => {
    const link = this.invite.inviteLink();
    const url = link?.shortUrl ?? link?.url ?? 'nxt1sports.com';
    // Strip protocol for display
    return url.replace(/^https?:\/\//, '');
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    const type = this.inviteType();
    if (type) this.invite.setInviteType(type);

    const team = this.team();
    if (team) this.invite.selectTeam(team);

    this.invite.loadInviteLink();
  }

  // ============================================
  // QR CODE GENERATION
  // ============================================

  async generateQrCode(url: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this.qrLoading.set(true);
    this.qrError.set(false);

    try {
      const QRCodeModule = await import('qrcode');
      const QRCode = QRCodeModule.default || QRCodeModule;
      const dataUrl = await QRCode.toDataURL(url, {
        width: 166,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'H' as const,
      });
      this._qrDataUrl.set(dataUrl);
      this.qrLoading.set(false);
      this.logger.info('Invite QR code generated', { url });
    } catch (err) {
      this.logger.error('Failed to generate invite QR code', err);
      this.qrError.set(true);
      this.qrLoading.set(false);
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onClose(): void {
    this.haptics.impact('light');
    this.close.emit();
  }

  protected async onInvite(): Promise<void> {
    if (this.isSharing() || this.isLinkLoading()) return;

    const url = this.inviteUrl();
    if (!url) {
      this.logger.warn('onInvite called before invite link was ready');
      this.toast.error('Invite link is still loading — try again in a moment');
      return;
    }

    this.isSharing.set(true);
    await this.haptics.impact('medium');
    const shareText = this.currentCopy().shareText;
    const shareData: ShareData = {
      title: buildInviteShareTitle({
        inviteType: this.inviteType(),
        senderRole: this.user()?.role ?? null,
        team: this.team(),
      }),
      text: shareText,
      url,
    };

    try {
      if (isCapacitor()) {
        const { Share } = await import('@capacitor/share');
        const result = await Share.share({
          title: shareData.title,
          text: shareData.text,
          url: shareData.url,
          dialogTitle: 'Share invite',
        });

        this.logger.info('Invite shared via Capacitor native share', {
          senderRole: this.user()?.role ?? null,
          activityType: result.activityType ?? null,
        });
      } else if (
        isPlatformBrowser(this.platformId) &&
        typeof navigator !== 'undefined' &&
        navigator.share &&
        navigator.canShare?.(shareData)
      ) {
        await navigator.share(shareData);
        this.logger.info('Invite shared via native share sheet', {
          senderRole: this.user()?.role ?? null,
        });
      } else {
        // Fallback: copy invite link to clipboard
        await navigator.clipboard.writeText(`${shareData.text} ${url}`);
        await this.haptics.notification('success');
        this.toast.success('Invite link copied to clipboard');
        this.logger.info('Invite link copied (share fallback)', {
          senderRole: this.user()?.role ?? null,
        });
      }
    } catch (err) {
      // User cancelled — not an error
      if ((err as DOMException)?.name !== 'AbortError') {
        this.logger.warn('Invite share failed', { error: String(err) });
        // Clipboard fallback on unexpected error
        try {
          await navigator.clipboard.writeText(`${shareData.text} ${url}`);
          this.toast.success('Invite link copied to clipboard');
        } catch {
          this.toast.error('Could not open share sheet');
        }
      }
    } finally {
      this.isSharing.set(false);
    }
  }
}
