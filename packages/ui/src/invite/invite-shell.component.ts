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
 *    - Invite-type toggle: Athlete | Coach
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
  afterNextRender,
  viewChild,
  ElementRef,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { IonRippleEffect, IonSpinner } from '@ionic/angular/standalone';
import { type InviteType, type InviteTeam, type UserRole, USER_ROLES } from '@nxt1/core';
import { InviteService } from './invite.service';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtSheetFooterComponent } from '../components/bottom-sheet/sheet-footer.component';
import { NxtLogoComponent } from '../components/logo/logo.component';
import { NxtIconComponent } from '../components/icon/icon.component';

/** Invite recipient type selection. */
export type InviteRecipientType = 'athlete' | 'coach';

/**
 * User info for personalization.
 * `role` drives which invite design variant is shown:
 *   - athlete / parent  → toggle (Athlete | Coach/Scout), default 'athlete'
 *   - coach / director / recruiter → staff view: athlete-only (no toggle)
 */
export interface InviteUser {
  readonly displayName?: string | null;
  readonly profileImg?: string | null;
  readonly referralCode?: string;
  /** The sender's platform role — controls which design variant is shown. */
  readonly role?: UserRole;
}

/**
 * Copy keyed by RECIPIENT type — what the invitee receives when they join.
 * Used in the athlete/parent view (toggle visible).
 */
const INVITE_COPY: Record<InviteRecipientType, { title: string; shareText: string }> = {
  athlete: {
    title: 'Free AI Highlight Graphic',
    shareText:
      'Join me on NXT1 — the AI sports platform built for athletes. Sign up with my link and get a free AI highlight graphic from Agent X:',
  },
  coach: {
    title: 'Free AI Scouting Report',
    shareText:
      "I'm using NXT1 to manage recruiting and evaluate prospects with AI. Join with my link and get a free AI scouting report on your first athlete:",
  },
};

/**
 * Copy for the staff (coach/director/recruiter) view — always inviting athletes.
 */
const STAFF_INVITE_COPY = {
  title: 'Free AI Highlight Graphic',
  subtitle: 'Athletes you invite get a free AI graphic when they sign up.',
  shareText:
    'Discover and manage top talent on NXT1. Join with my link and get a free AI highlight graphic for your first athlete:',
} as const;

@Component({
  selector: 'nxt1-invite-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonRippleEffect,
    IonSpinner,
    NxtSheetHeaderComponent,
    NxtSheetFooterComponent,
    NxtLogoComponent,
    NxtIconComponent,
  ],
  template: `
    <div class="invite-shell" [class.invite-shell--modal]="isModal()">
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
        <div class="invite-body">
          <!-- QR CODE: shared across both variants -->
          <div class="invite-qr-section">
            <div class="invite-qr-card">
              @if (qrLoading()) {
                <div class="invite-qr-skeleton">
                  <ion-spinner name="crescent" class="invite-qr-spinner" />
                </div>
              } @else if (qrError()) {
                <div class="invite-qr-error">
                  <nxt1-icon name="alertCircle" [size]="24" />
                  <span>Could not generate QR code</span>
                </div>
              } @else {
                <canvas
                  #qrCanvas
                  class="invite-qr-canvas"
                  aria-label="NXT1 invite QR code"
                  role="img"
                ></canvas>
              }
              <div class="invite-qr-logo" aria-hidden="true">
                <nxt1-logo variant="default" size="xs" />
              </div>
            </div>
            <p class="invite-qr-label">Scan to join NXT1</p>
          </div>

          @if (isStaffRole()) {
            <!-- ══════════════════════════════════════════════
                 STAFF VARIANT: Coach / Director / Recruiter
                 Always inviting athletes — no toggle needed.
                 ══════════════════════════════════════════════ -->
            <div class="invite-value-card">
              <div class="invite-value-card__icon" aria-hidden="true">
                <nxt1-icon name="gift" [size]="24" />
              </div>
              <div class="invite-value-card__text">
                <p class="invite-value-card__title">{{ staffCopy.title }}</p>
                <p class="invite-value-card__subtitle">{{ staffCopy.subtitle }}</p>
              </div>
            </div>
          } @else {
            <!-- ══════════════════════════════════════════════
                 ATHLETE / PARENT VARIANT
                 Can invite teammates OR coaches — toggle visible.
                 ══════════════════════════════════════════════ -->
            <div class="invite-type-section">
              <p class="invite-type-label">Who are you inviting?</p>
              <div class="invite-type-pills" role="group" aria-label="Select invite type">
                <button
                  type="button"
                  class="invite-type-pill"
                  [class.invite-type-pill--active]="recipientType() === 'athlete'"
                  (click)="setRecipientType('athlete')"
                  [attr.aria-pressed]="recipientType() === 'athlete'"
                >
                  <ion-ripple-effect />
                  <nxt1-icon name="person" [size]="18" aria-hidden="true" />
                  <span>Athlete</span>
                </button>
                <button
                  type="button"
                  class="invite-type-pill"
                  [class.invite-type-pill--active]="recipientType() === 'coach'"
                  (click)="setRecipientType('coach')"
                  [attr.aria-pressed]="recipientType() === 'coach'"
                >
                  <ion-ripple-effect />
                  <nxt1-icon name="school" [size]="18" aria-hidden="true" />
                  <span>Coach / Scout</span>
                </button>
              </div>
            </div>

            <div class="invite-value-card">
              <div class="invite-value-card__icon" aria-hidden="true">
                <nxt1-icon name="gift" [size]="24" />
              </div>
              <p class="invite-value-card__title">{{ currentCopy().title }}</p>
            </div>
          }
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

      /* Reduced from 196 → 148 px */
      .invite-qr-card {
        position: relative;
        width: 148px;
        height: 148px;
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
        width: 28px;
        height: 28px;
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

      /* ── INVITE TYPE TOGGLE ── */

      .invite-type-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        width: 100%;
      }

      .invite-type-label {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-text-secondary);
      }

      .invite-type-pills {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        width: 100%;
      }

      .invite-type-pill {
        flex: 1;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        height: 52px;
        border-radius: var(--nxt1-radius-xl, 16px);
        border: 1.5px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          border-color var(--nxt1-motion-duration-fast, 150ms)
            var(--nxt1-motion-easing-standard, ease),
          background var(--nxt1-motion-duration-fast, 150ms)
            var(--nxt1-motion-easing-standard, ease),
          color var(--nxt1-motion-duration-fast, 150ms) var(--nxt1-motion-easing-standard, ease);
      }

      .invite-type-pill:active {
        transform: scale(0.97);
      }

      .invite-type-pill--active {
        border-color: var(--nxt1-color-primary);
        background: var(
          --nxt1-color-alpha-primary10,
          rgba(var(--nxt1-color-primary-rgb, 99, 102, 241), 0.1)
        );
        color: var(--nxt1-color-primary);
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

      /* Athlete/parent variant — single-line title only */
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

      /* ── RESPONSIVE ── */

      @media (min-width: 640px) {
        .invite-body {
          padding: var(--nxt1-spacing-6, 24px);
          padding-bottom: var(--nxt1-spacing-8, 32px);
        }
      }

      /* ── ACCESSIBILITY ── */

      @media (prefers-reduced-motion: reduce) {
        .invite-type-pill {
          transition: none;
        }

        .invite-type-pill:active {
          transform: none;
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

  private readonly qrCanvas = viewChild<ElementRef<HTMLCanvasElement>>('qrCanvas');

  constructor() {
    afterNextRender(() => {
      this.generateQrCode();
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

  protected readonly recipientType = signal<InviteRecipientType>('athlete');
  protected readonly qrLoading = signal(true);
  protected readonly qrError = signal(false);
  protected readonly isSharing = signal(false);

  // ============================================
  // COMPUTED
  // ============================================

  /**
   * True when the signed-in user is a staff role (coach, director, recruiter).
   * Drives which invite design variant is shown:
   *   - false (athlete/parent) → toggle visible, can invite athlete or coach
   *   - true  (staff)          → no toggle, always inviting athletes
   */
  protected readonly isStaffRole = computed(() => {
    const role = this.user()?.role;
    return (
      role === USER_ROLES.COACH || role === USER_ROLES.DIRECTOR || role === USER_ROLES.RECRUITER
    );
  });

  /** True while the invite link is being fetched from the backend. */
  protected readonly isLinkLoading = computed(() => this.invite.isLoading());

  /** Staff-variant copy (constant — staff always invites athletes). */
  protected readonly staffCopy = STAFF_INVITE_COPY;

  protected readonly headerTitle = computed(() => {
    if (this.isStaffRole()) return 'Invite Athletes';
    const type = this.inviteType();
    if (type === 'team') return 'Invite Team';
    return 'Invite';
  });

  protected readonly inviteUrl = computed(() => this.invite.inviteLink()?.url ?? null);

  protected readonly displayUrl = computed(() => {
    const link = this.invite.inviteLink();
    const url = link?.shortUrl ?? link?.url ?? 'nxt1sports.com';
    // Strip protocol for display
    return url.replace(/^https?:\/\//, '');
  });

  protected readonly currentCopy = computed(() => INVITE_COPY[this.recipientType()]);

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    const type = this.inviteType();
    if (type) this.invite.setInviteType(type);

    const team = this.team();
    if (team) this.invite.selectTeam(team);

    this.invite.loadInviteLink();

    // Staff roles always invite athletes — lock the recipient type.
    // Athlete/parent default is already 'athlete' from signal initializer.
    if (this.isStaffRole()) {
      this.recipientType.set('athlete');
    }
  }

  // ============================================
  // QR CODE GENERATION
  // ============================================

  async generateQrCode(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this.qrLoading.set(true);
    this.qrError.set(false);

    try {
      const QRCode = await import('qrcode');
      const url = this.inviteUrl();

      if (!url) {
        this.qrError.set(true);
        this.qrLoading.set(false);
        return;
      }

      // Wait for canvas to render after loading clears
      this.qrLoading.set(false);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      const canvasRef = this.qrCanvas();
      if (!canvasRef?.nativeElement) {
        this.qrError.set(true);
        return;
      }

      await QRCode.toCanvas(canvasRef.nativeElement, url, {
        width: 130,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      });

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

  protected setRecipientType(type: InviteRecipientType): void {
    this.haptics.impact('light');
    this.recipientType.set(type);
  }

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
    // Staff role always uses the staff share text; athlete/parent uses toggle-driven copy.
    const shareText = this.isStaffRole()
      ? STAFF_INVITE_COPY.shareText
      : this.currentCopy().shareText;
    const shareData: ShareData = {
      title: 'Join me on NXT1',
      text: shareText,
      url,
    };

    try {
      if (
        isPlatformBrowser(this.platformId) &&
        typeof navigator !== 'undefined' &&
        navigator.share &&
        navigator.canShare?.(shareData)
      ) {
        await navigator.share(shareData);
        this.logger.info('Invite shared via native share sheet', {
          recipientType: this.recipientType(),
        });
      } else {
        // Fallback: copy invite link to clipboard
        await navigator.clipboard.writeText(`${shareData.text} ${url}`);
        await this.haptics.notification('success');
        this.toast.success('Invite link copied to clipboard');
        this.logger.info('Invite link copied (share fallback)', {
          recipientType: this.recipientType(),
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
