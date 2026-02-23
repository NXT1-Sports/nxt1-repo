/**
 * @fileoverview Manage Team - Sponsors Section Component
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Professional sponsor management section with tier-based display.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  ribbonOutline,
  addOutline,
  diamondOutline,
  trophyOutline,
  medalOutline,
  heartOutline,
  globeOutline,
  mailOutline,
  callOutline,
  ellipsisVertical,
  imageOutline,
} from 'ionicons/icons';
import type { TeamSponsor, SponsorTier, SponsorActionEvent } from '@nxt1/core';
import { SPONSOR_TIER_CONFIG } from '@nxt1/core';

@Component({
  selector: 'nxt1-manage-team-sponsors-section',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  template: `
    <div class="sponsors-section">
      <!-- Header -->
      <div class="sponsors-header">
        <div class="sponsors-info">
          <ion-icon name="ribbon-outline"></ion-icon>
          <span>{{ activeCount() }} Active Sponsors</span>
        </div>

        <button type="button" class="add-btn" (click)="onAddSponsor()">
          <ion-ripple-effect></ion-ripple-effect>
          <ion-icon name="add-outline"></ion-icon>
          <span>Add Sponsor</span>
        </button>
      </div>

      <!-- Sponsor Tiers -->
      <div class="sponsor-tiers">
        @for (tier of tierOrder; track tier) {
          @if (sponsorsByTier().get(tier)?.length) {
            <div class="tier-group">
              <div class="tier-header" [style.--tier-color]="getTierConfig(tier).color">
                <ion-icon [name]="getTierConfig(tier).icon"></ion-icon>
                <span class="tier-label">{{ getTierConfig(tier).label }}</span>
                <span class="tier-count">{{ sponsorsByTier().get(tier)?.length ?? 0 }}</span>
              </div>

              <div class="sponsor-grid" [class]="'tier-' + tier">
                @for (sponsor of sponsorsByTier().get(tier); track sponsor.id) {
                  <div class="sponsor-card" [class.sponsor-card--premium]="isPremiumTier(tier)">
                    <ion-ripple-effect></ion-ripple-effect>

                    <!-- Logo -->
                    <div class="sponsor-logo">
                      @if (sponsor.logo) {
                        <img [src]="sponsor.logo" [alt]="sponsor.name" />
                      } @else {
                        <div class="logo-placeholder">
                          <ion-icon name="image-outline"></ion-icon>
                        </div>
                      }
                    </div>

                    <!-- Info -->
                    <div class="sponsor-info">
                      <h4 class="sponsor-name">{{ sponsor.name }}</h4>
                      @if (sponsor.description) {
                        <p class="sponsor-description">{{ sponsor.description }}</p>
                      }

                      <!-- Actions -->
                      <div class="sponsor-actions">
                        @if (sponsor.website) {
                          <a [href]="sponsor.website" target="_blank" class="action-link">
                            <ion-icon name="globe-outline"></ion-icon>
                          </a>
                        }
                        @if (sponsor.contactEmail) {
                          <a [href]="'mailto:' + sponsor.contactEmail" class="action-link">
                            <ion-icon name="mail-outline"></ion-icon>
                          </a>
                        }
                        @if (sponsor.contactPhone) {
                          <a [href]="'tel:' + sponsor.contactPhone" class="action-link">
                            <ion-icon name="call-outline"></ion-icon>
                          </a>
                        }
                      </div>
                    </div>

                    <!-- Tier Badge -->
                    <div class="tier-badge" [style.background]="getTierConfig(tier).color">
                      <ion-icon [name]="getTierConfig(tier).icon"></ion-icon>
                    </div>

                    <!-- Menu -->
                    <button type="button" class="menu-btn" (click)="onSponsorMenu(sponsor, $event)">
                      <ion-ripple-effect></ion-ripple-effect>
                      <ion-icon name="ellipsis-vertical"></ion-icon>
                    </button>
                  </div>
                }
              </div>
            </div>
          }
        }
      </div>

      <!-- Empty State -->
      @if (sponsors().length === 0) {
        <div class="empty-state">
          <ion-icon name="ribbon-outline"></ion-icon>
          <h4>No Sponsors Yet</h4>
          <p>Add sponsors to showcase your team's partnerships</p>
          <button type="button" class="add-sponsor-btn" (click)="onAddSponsor()">
            <ion-ripple-effect></ion-ripple-effect>
            <ion-icon name="add-outline"></ion-icon>
            <span>Add Sponsor</span>
          </button>
        </div>
      }

      <!-- Sponsor Benefits CTA -->
      @if (sponsors().length > 0 && sponsors().length < 5) {
        <div class="sponsors-cta">
          <div class="cta-content">
            <h4>Grow Your Sponsorships</h4>
            <p>Professional sponsor management helps attract more support for your team</p>
          </div>
          <button type="button" class="cta-btn" (click)="onAddSponsor()">
            <ion-ripple-effect></ion-ripple-effect>
            <ion-icon name="add-outline"></ion-icon>
            Add More
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       SPONSORS SECTION - 2026 Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      .sponsors-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      /* ============================================
         HEADER
         ============================================ */

      .sponsors-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .sponsors-info {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);

        ion-icon {
          font-size: 18px;
          color: var(--nxt1-color-secondary);
        }
      }

      .add-btn {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-secondary);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-full);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        ion-icon {
          font-size: 16px;
        }

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-secondaryLight);
        }

        &:active {
          transform: scale(0.98);
        }
      }

      /* ============================================
         TIER GROUPS
         ============================================ */

      .sponsor-tiers {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
      }

      .tier-group {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .tier-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);

        ion-icon {
          font-size: 18px;
          color: var(--tier-color);
        }

        .tier-label {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-sm);
          font-weight: 600;
          color: var(--nxt1-color-text-primary);
        }

        .tier-count {
          background: var(--nxt1-color-surface-200);
          padding: 2px 8px;
          border-radius: var(--nxt1-radius-full);
          font-size: var(--nxt1-fontSize-xs);
          color: var(--nxt1-color-text-secondary);
        }
      }

      /* ============================================
         SPONSOR GRID
         ============================================ */

      .sponsor-grid {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .tier-platinum,
      .tier-gold {
        grid-template-columns: 1fr;
      }

      .tier-silver,
      .tier-bronze {
        grid-template-columns: repeat(2, 1fr);
      }

      .tier-supporter,
      .tier-partner {
        grid-template-columns: repeat(3, 1fr);
      }

      @media (max-width: 640px) {
        .tier-silver,
        .tier-bronze,
        .tier-supporter,
        .tier-partner {
          grid-template-columns: 1fr;
        }
      }

      /* ============================================
         SPONSOR CARD
         ============================================ */

      .sponsor-card {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        &:hover {
          background: var(--nxt1-color-surface-200);
          border-color: var(--nxt1-color-border-default);
        }
      }

      .sponsor-card--premium {
        background: linear-gradient(
          135deg,
          var(--nxt1-color-surface-100) 0%,
          var(--nxt1-color-surface-200) 100%
        );
        border-color: var(--nxt1-color-border-default);
      }

      .sponsor-logo {
        width: 64px;
        height: 64px;
        border-radius: var(--nxt1-radius-lg);
        overflow: hidden;
        flex-shrink: 0;
        background: var(--nxt1-color-surface-200);

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      }

      .logo-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        color: var(--nxt1-color-text-tertiary);

        ion-icon {
          font-size: 24px;
        }
      }

      .sponsor-info {
        flex: 1;
        min-width: 0;
      }

      .sponsor-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-1);
      }

      .sponsor-description {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-2);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .sponsor-actions {
        display: flex;
        gap: var(--nxt1-spacing-2);
      }

      .action-link {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: var(--nxt1-color-surface-300);
        border-radius: var(--nxt1-radius-full);
        color: var(--nxt1-color-text-secondary);
        transition: all var(--nxt1-transition-fast);

        ion-icon {
          font-size: 14px;
        }

        &:hover {
          background: var(--nxt1-color-primary);
          color: var(--nxt1-color-text-onPrimary);
        }
      }

      .tier-badge {
        position: absolute;
        top: var(--nxt1-spacing-2);
        right: var(--nxt1-spacing-2);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: var(--nxt1-radius-full);
        color: var(--nxt1-color-text-onPrimary);

        ion-icon {
          font-size: 12px;
        }
      }

      .menu-btn {
        position: absolute;
        bottom: var(--nxt1-spacing-2);
        right: var(--nxt1-spacing-2);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: transparent;
        border: none;
        border-radius: var(--nxt1-radius-full);
        color: var(--nxt1-color-text-tertiary);
        cursor: pointer;
        overflow: hidden;

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-300);
          color: var(--nxt1-color-text-primary);
        }
      }

      /* ============================================
         EMPTY STATE
         ============================================ */

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-4);
        text-align: center;

        ion-icon {
          font-size: 48px;
          color: var(--nxt1-color-text-tertiary);
        }

        h4 {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-lg);
          font-weight: 600;
          color: var(--nxt1-color-text-primary);
          margin: 0;
        }

        p {
          font-size: var(--nxt1-fontSize-sm);
          color: var(--nxt1-color-text-tertiary);
          margin: 0;
        }
      }

      .add-sponsor-btn {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-secondary);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-secondaryLight);
        }

        &:active {
          transform: scale(0.98);
        }
      }

      /* ============================================
         SPONSORS CTA
         ============================================ */

      .sponsors-cta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4);
        background: linear-gradient(
          135deg,
          var(--nxt1-color-surface-100) 0%,
          var(--nxt1-color-surface-200) 100%
        );
        border-radius: var(--nxt1-radius-xl);
        border: 1px dashed var(--nxt1-color-border-default);
      }

      .cta-content {
        h4 {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-base);
          font-weight: 600;
          color: var(--nxt1-color-text-primary);
          margin: 0 0 var(--nxt1-spacing-1);
        }

        p {
          font-size: var(--nxt1-fontSize-sm);
          color: var(--nxt1-color-text-secondary);
          margin: 0;
        }
      }

      .cta-btn {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-300);
        color: var(--nxt1-color-text-primary);
        border: none;
        border-radius: var(--nxt1-radius-full);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;
        white-space: nowrap;

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-secondary);
          color: var(--nxt1-color-text-onPrimary);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamSponsorsSectionComponent {
  constructor() {
    addIcons({
      ribbonOutline,
      addOutline,
      diamondOutline,
      trophyOutline,
      medalOutline,
      heartOutline,
      globeOutline,
      mailOutline,
      callOutline,
      ellipsisVertical,
      imageOutline,
    });
  }

  /** Sponsors list */
  readonly sponsors = input<readonly TeamSponsor[]>([]);

  /** Action event */
  readonly action = output<SponsorActionEvent>();

  /** Tier order for display */
  readonly tierOrder: SponsorTier[] = [
    'platinum',
    'gold',
    'silver',
    'bronze',
    'supporter',
    'partner',
  ];

  /** Active sponsor count */
  readonly activeCount = computed(
    () => this.sponsors().filter((s) => s.status === 'active').length
  );

  /** Sponsors grouped by tier */
  readonly sponsorsByTier = computed(() => {
    const grouped = new Map<SponsorTier, TeamSponsor[]>();
    for (const sponsor of this.sponsors().filter((s) => s.status === 'active')) {
      if (!grouped.has(sponsor.tier)) grouped.set(sponsor.tier, []);
      grouped.get(sponsor.tier)!.push(sponsor);
    }
    return grouped;
  });

  getTierConfig(tier: SponsorTier): { label: string; color: string; icon: string } {
    return SPONSOR_TIER_CONFIG[tier];
  }

  isPremiumTier(tier: SponsorTier): boolean {
    return tier === 'platinum' || tier === 'gold';
  }

  onAddSponsor(): void {
    this.action.emit({ action: 'add' });
  }

  onSponsorMenu(sponsor: TeamSponsor, event: Event): void {
    event.stopPropagation();
    this.action.emit({ action: 'edit', sponsorId: sponsor.id, sponsor });
  }
}
