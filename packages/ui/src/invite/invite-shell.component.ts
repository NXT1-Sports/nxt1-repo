/**
 * @fileoverview Invite Shell Component - Main Container
 * @module @nxt1/ui/invite
 * @version 1.0.0
 *
 * Top-level container component for Invite feature.
 * Orchestrates all child components and handles layout.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Responsive layout (mobile-first)
 * - Theme-aware styling (light/dark mode)
 * - iOS 26 liquid glass aesthetic
 * - Gamified XP display
 * - Multi-channel share grid
 * - Achievement badges
 * - QR code display
 *
 * Usage Modes:
 * - Standalone page
 * - Modal/Bottom sheet content
 * - Embedded component
 *
 * @example
 * ```html
 * <nxt1-invite-shell
 *   [user]="currentUser()"
 *   [inviteType]="'team'"
 *   [team]="selectedTeam()"
 *   (close)="dismiss()"
 * />
 * ```
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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  close,
  closeOutline,
  link,
  linkOutline,
  qrCode,
  qrCodeOutline,
  shareSocial,
  shareSocialOutline,
  copy,
  copyOutline,
  checkmarkCircle,
  checkmarkCircleOutline,
  people,
  peopleOutline,
  trophy,
  trophyOutline,
  flame,
  flameOutline,
  star,
  starOutline,
  starHalf,
  diamond,
  diamondOutline,
  ribbon,
  ribbonOutline,
  rocket,
  rocketOutline,
  megaphone,
  megaphoneOutline,
  trendingUp,
  trendingUpOutline,
  sparkles,
  sparklesOutline,
  gift,
  giftOutline,
  chatbubble,
  chatbubbleOutline,
  mail,
  mailOutline,
  logoWhatsapp,
  logoInstagram,
  logoTwitter,
  logoFacebook,
  share,
  shareOutline,
  personAdd,
  personAddOutline,
} from 'ionicons/icons';
import type { InviteType, InviteTeam, InviteChannel, InviteChannelConfig } from '@nxt1/core';
import { InviteService } from './invite.service';
import { InviteStatsCardComponent } from './invite-stats-card.component';
import { InviteChannelGridComponent } from './invite-channel-grid.component';
import { InviteQrCodeComponent } from './invite-qr-code.component';
import { InviteAchievementsComponent } from './invite-achievements.component';
import { InviteCelebrationComponent } from './invite-celebration.component';
import { InviteSkeletonComponent } from './invite-skeleton.component';
import { HapticsService } from '../services/haptics/haptics.service';

// Register all icons
/**
 * User info for personalization.
 */
export interface InviteUser {
  readonly displayName?: string | null;
  readonly profileImg?: string | null;
  readonly referralCode?: string;
}

@Component({
  selector: 'nxt1-invite-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    IonRippleEffect,
    InviteStatsCardComponent,
    InviteChannelGridComponent,
    InviteQrCodeComponent,
    InviteAchievementsComponent,
    InviteCelebrationComponent,
    InviteSkeletonComponent,
  ],
  template: `
    <div class="invite-shell" [class.invite-shell--modal]="isModal()">
      <!-- Header -->
      <header class="invite-header">
        @if (showClose()) {
          <button type="button" class="invite-header__close" (click)="onClose()" aria-label="Close">
            <ion-icon name="close-outline"></ion-icon>
          </button>
        }

        <div class="invite-header__content">
          <h1 class="invite-header__title">
            @if (inviteType() === 'team') {
              Invite Teammates
            } @else if (inviteType() === 'profile') {
              Share Profile
            } @else {
              Invite Friends
            }
          </h1>
          <p class="invite-header__subtitle">Earn XP for every friend who joins!</p>
        </div>

        <!-- XP Badge -->
        @if (invite.stats()) {
          <div class="invite-header__xp-badge">
            <ion-icon name="sparkles"></ion-icon>
            <span>{{ invite.stats()!.totalXp }} XP</span>
          </div>
        }
      </header>

      <ion-content [fullscreen]="true" class="invite-content">
        @if (invite.isLoading()) {
          <nxt1-invite-skeleton />
        } @else {
          <div class="invite-container">
            <!-- Team Badge (if team invite) -->
            @if (team()) {
              <div class="invite-team-badge">
                @if (team()!.logoUrl) {
                  <img
                    [src]="team()!.logoUrl"
                    [alt]="team()!.name"
                    class="invite-team-badge__logo"
                  />
                }
                <div class="invite-team-badge__info">
                  <span class="invite-team-badge__name">{{ team()!.name }}</span>
                  <span class="invite-team-badge__sport"
                    >{{ team()!.sport }} • {{ team()!.level }}</span
                  >
                </div>
              </div>
            }

            <!-- Stats Card (Gamification) -->
            <nxt1-invite-stats-card
              [stats]="invite.stats()"
              [streakDays]="invite.streakDays()"
              [earnedCount]="invite.earnedAchievements().length"
            />

            <!-- Invite Link Display -->
            <section class="invite-link-section">
              <div class="invite-link-card">
                <div class="invite-link-card__content">
                  <span class="invite-link-card__label">Your invite link</span>
                  <span class="invite-link-card__url">{{ shortUrl() }}</span>
                </div>
                <button
                  type="button"
                  class="invite-link-card__copy"
                  [class.invite-link-card__copy--copied]="copied()"
                  (click)="onCopyLink()"
                >
                  <ion-ripple-effect></ion-ripple-effect>
                  <ion-icon [name]="copied() ? 'checkmark-circle' : 'copy-outline'"></ion-icon>
                  <span>{{ copied() ? 'Copied!' : 'Copy' }}</span>
                </button>
              </div>
            </section>

            <!-- Quick Share Channels -->
            <section class="invite-share-section">
              <h2 class="invite-section-title">Share via</h2>
              <nxt1-invite-channel-grid
                [channels]="invite.quickShareChannels()"
                variant="primary"
                (channelSelect)="onChannelSelect($event)"
              />
            </section>

            <!-- Social Channels Grid -->
            <section class="invite-social-section">
              <h2 class="invite-section-title">Social</h2>
              <nxt1-invite-channel-grid
                [channels]="invite.socialChannels()"
                variant="social"
                (channelSelect)="onChannelSelect($event)"
              />
            </section>

            <!-- QR Code Section -->
            <section class="invite-qr-section">
              <h2 class="invite-section-title">
                <ion-icon name="qr-code-outline"></ion-icon>
                QR Code
              </h2>
              <nxt1-invite-qr-code
                [qrDataUrl]="invite.inviteLink()?.qrCodeDataUrl"
                [referralCode]="invite.inviteLink()?.referralCode"
              />
            </section>

            <!-- Achievements Preview -->
            @if (invite.achievements().length > 0) {
              <section class="invite-achievements-section">
                <div class="invite-section-header">
                  <h2 class="invite-section-title">
                    <ion-icon name="trophy-outline"></ion-icon>
                    Achievements
                  </h2>
                  <button
                    type="button"
                    class="invite-section-link"
                    (click)="onViewAllAchievements()"
                  >
                    View all
                  </button>
                </div>
                <nxt1-invite-achievements
                  [achievements]="invite.achievements()"
                  [showAll]="false"
                />
              </section>
            }

            <!-- Bottom Spacer -->
            <div class="invite-bottom-spacer"></div>
          </div>
        }
      </ion-content>

      <!-- Celebration Overlay -->
      @if (invite.showCelebration()) {
        <nxt1-invite-celebration
          [xpEarned]="invite.celebrationXp()"
          [achievement]="invite.newAchievement()"
          (dismiss)="invite.dismissCelebration()"
        />
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       INVITE SHELL - iOS 26 LIQUID GLASS DESIGN
       100% Theme Aware (Light + Dark Mode)
       ============================================ */

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

        /* Theme Variables */
        --invite-bg: var(--nxt1-color-bg-primary);
        --invite-surface: var(--nxt1-color-surface-100);
        --invite-surface-elevated: var(--nxt1-color-surface-200);
        --invite-border: var(--nxt1-color-border-subtle);
        --invite-text-primary: var(--nxt1-color-text-primary);
        --invite-text-secondary: var(--nxt1-color-text-secondary);
        --invite-text-tertiary: var(--nxt1-color-text-tertiary);
        --invite-accent: var(--nxt1-color-primary);
        --invite-accent-bg: var(--nxt1-color-alpha-primary10);
        --invite-success: var(--nxt1-color-feedback-success);
        --invite-xp-glow: var(--nxt1-color-primary);
      }

      .invite-shell--modal {
        border-radius: var(--nxt1-radius-xl) var(--nxt1-radius-xl) 0 0;
        overflow: hidden;
      }

      /* ============================================
       HEADER
       ============================================ */

      .invite-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        background: var(--invite-surface);
        border-bottom: 1px solid var(--invite-border);
        position: relative;
      }

      .invite-header__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--invite-surface-elevated);
        border: none;
        color: var(--invite-text-secondary);
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .invite-header__close:hover {
        background: var(--nxt1-color-surface-300);
        color: var(--invite-text-primary);
      }

      .invite-header__close ion-icon {
        font-size: 20px;
      }

      .invite-header__content {
        flex: 1;
        min-width: 0;
      }

      .invite-header__title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--invite-text-primary);
        margin: 0;
        line-height: 1.2;
      }

      .invite-header__subtitle {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--invite-text-secondary);
        margin: 2px 0 0;
      }

      .invite-header__xp-badge {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--invite-accent-bg);
        border-radius: var(--nxt1-radius-full);
        color: var(--invite-accent);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .invite-header__xp-badge ion-icon {
        font-size: 16px;
        animation: sparkle 2s ease-in-out infinite;
      }

      @keyframes sparkle {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.8;
          transform: scale(1.1);
        }
      }

      /* ============================================
       CONTENT
       ============================================ */

      .invite-content {
        --background: var(--invite-bg);
      }

      .invite-container {
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-4);
        padding-bottom: calc(var(--nxt1-spacing-8) + env(safe-area-inset-bottom, 0px));
      }

      /* ============================================
       TEAM BADGE
       ============================================ */

      .invite-team-badge {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--invite-surface);
        border-radius: var(--nxt1-radius-lg);
        border: 1px solid var(--invite-border);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .invite-team-badge__logo {
        width: 48px;
        height: 48px;
        border-radius: var(--nxt1-radius-md);
        object-fit: cover;
      }

      .invite-team-badge__info {
        display: flex;
        flex-direction: column;
      }

      .invite-team-badge__name {
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--invite-text-primary);
      }

      .invite-team-badge__sport {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--invite-text-secondary);
      }

      /* ============================================
       INVITE LINK CARD
       ============================================ */

      .invite-link-section {
        margin-bottom: var(--nxt1-spacing-5);
      }

      .invite-link-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        background: var(--invite-surface);
        border-radius: var(--nxt1-radius-lg);
        border: 1px solid var(--invite-border);
      }

      .invite-link-card__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .invite-link-card__label {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--invite-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .invite-link-card__url {
        font-family: var(--nxt1-fontFamily-mono, monospace);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--invite-accent);
        font-weight: var(--nxt1-fontWeight-medium);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .invite-link-card__copy {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        background: var(--invite-accent);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-full);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition: all 0.2s ease;
      }

      .invite-link-card__copy:hover {
        transform: scale(1.02);
      }

      .invite-link-card__copy:active {
        transform: scale(0.98);
      }

      .invite-link-card__copy--copied {
        background: var(--invite-success);
      }

      .invite-link-card__copy ion-icon {
        font-size: 18px;
      }

      /* ============================================
       SECTIONS
       ============================================ */

      .invite-section-title {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--invite-text-primary);
        margin: 0 0 var(--nxt1-spacing-3);
      }

      .invite-section-title ion-icon {
        font-size: 18px;
        color: var(--invite-text-secondary);
      }

      .invite-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-3);
      }

      .invite-section-header .invite-section-title {
        margin: 0;
      }

      .invite-section-link {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--invite-accent);
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .invite-share-section,
      .invite-social-section,
      .invite-qr-section,
      .invite-achievements-section {
        margin-bottom: var(--nxt1-spacing-6);
      }

      .invite-bottom-spacer {
        height: var(--nxt1-spacing-8);
      }

      /* ============================================
       RESPONSIVE
       ============================================ */

      @media (min-width: 640px) {
        .invite-container {
          max-width: 480px;
          margin: 0 auto;
          padding: var(--nxt1-spacing-6);
        }

        .invite-header {
          padding: var(--nxt1-spacing-5) var(--nxt1-spacing-6);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteShellComponent implements OnInit {
  constructor() {
    addIcons({
      close,
      closeOutline,
      link,
      linkOutline,
      qrCode,
      qrCodeOutline,
      shareSocial,
      shareSocialOutline,
      copy,
      copyOutline,
      checkmarkCircle,
      checkmarkCircleOutline,
      people,
      peopleOutline,
      trophy,
      trophyOutline,
      flame,
      flameOutline,
      star,
      starOutline,
      starHalf,
      diamond,
      diamondOutline,
      ribbon,
      ribbonOutline,
      rocket,
      rocketOutline,
      megaphone,
      megaphoneOutline,
      trendingUp,
      trendingUpOutline,
      sparkles,
      sparklesOutline,
      gift,
      giftOutline,
      chatbubble,
      chatbubbleOutline,
      mail,
      mailOutline,
      logoWhatsapp,
      logoInstagram,
      logoTwitter,
      logoFacebook,
      share,
      shareOutline,
      personAdd,
      personAddOutline,
    });
  }

  protected readonly invite = inject(InviteService);
  private readonly haptics = inject(HapticsService);

  // ============================================
  // INPUTS
  // ============================================

  /** Current user info */
  readonly user = input<InviteUser | null>(null);

  /** Invite type context */
  readonly inviteType = input<InviteType>('general');

  /** Team for team invites */
  readonly team = input<InviteTeam | null>(null);

  /** Whether shown in modal/bottom sheet */
  readonly isModal = input<boolean>(true);

  /** Whether to show close button */
  readonly showClose = input<boolean>(true);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when close button clicked */
  readonly close = output<void>();

  /** Emitted when channel selected */
  readonly channelSelected = output<InviteChannel>();

  /** Emitted when view all achievements clicked */
  readonly viewAchievements = output<void>();

  // ============================================
  // LOCAL STATE
  // ============================================

  protected copied = signal(false);

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly shortUrl = computed(() => {
    const link = this.invite.inviteLink();
    return link?.shortUrl ?? 'Loading...';
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // Set invite type from input
    const type = this.inviteType();
    if (type) {
      this.invite.setInviteType(type);
    }

    // Set team if provided
    const team = this.team();
    if (team) {
      this.invite.selectTeam(team);
    }

    // Initialize service
    this.invite.initialize();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onClose(): void {
    this.haptics.impact('light');
    this.close.emit();
  }

  protected async onCopyLink(): Promise<void> {
    await this.invite.copyLink();
    this.copied.set(true);

    // Reset after 2 seconds
    setTimeout(() => this.copied.set(false), 2000);
  }

  protected async onChannelSelect(channel: InviteChannelConfig): Promise<void> {
    this.channelSelected.emit(channel.id);
    await this.invite.shareViaChannel(channel.id);
  }

  protected onViewAllAchievements(): void {
    this.haptics.impact('light');
    this.viewAchievements.emit();
  }
}
