/**
 * @fileoverview Profile Offers Section Component
 * @module @nxt1/ui/profile
 * @version 1.0.0
 *
 * Displays college offers with filtering and sorting.
 * Shows offer type badges and college information.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  schoolOutline,
  walkOutline,
  flagOutline,
  locationOutline,
  heartOutline,
  checkmarkCircleOutline,
  addCircleOutline,
  trophyOutline,
} from 'ionicons/icons';
import type { ProfileOffer, OfferType } from '@nxt1/core';
import { OFFER_TYPE_ICONS, OFFER_TYPE_LABELS, OFFER_TYPE_COLORS } from '@nxt1/core';
import { ProfileSkeletonComponent } from './profile-skeleton.component';

// Register icons
addIcons({
  schoolOutline,
  walkOutline,
  flagOutline,
  locationOutline,
  heartOutline,
  checkmarkCircleOutline,
  addCircleOutline,
  trophyOutline,
});

@Component({
  selector: 'nxt1-profile-offers',
  standalone: true,
  imports: [CommonModule, IonIcon, ProfileSkeletonComponent],
  template: `
    <div class="profile-offers">
      <!-- Loading State -->
      @if (isLoading()) {
        <div class="offers-loading">
          @for (i of [1, 2, 3, 4]; track i) {
            <nxt1-profile-skeleton variant="offer" />
          }
        </div>
      }

      <!-- Empty State -->
      @else if (isEmpty()) {
        <div class="offers-empty">
          <div class="empty-icon">
            <ion-icon name="trophy-outline"></ion-icon>
          </div>
          <h3 class="empty-title">No offers yet</h3>
          <p class="empty-message">
            Your recruiting journey is just getting started. Keep working!
          </p>
          @if (isOwnProfile()) {
            <button class="empty-cta" (click)="addOfferClick.emit()">
              <ion-icon name="add-circle-outline"></ion-icon>
              <span>Add Offer</span>
            </button>
          }
        </div>
      }

      <!-- Offers List -->
      @else {
        <div class="offers-list">
          @for (offer of offers(); track offer.id) {
            <article
              class="offer-card"
              [class.offer-card--committed]="offer.isCommitted"
              (click)="offerClick.emit(offer)"
            >
              <!-- College Logo -->
              <div class="offer-logo">
                @if (offer.collegeLogoUrl) {
                  <img [src]="offer.collegeLogoUrl" [alt]="offer.collegeName" />
                } @else {
                  <ion-icon name="school-outline"></ion-icon>
                }
              </div>

              <!-- Offer Info -->
              <div class="offer-info">
                <h4 class="offer-college">{{ offer.collegeName }}</h4>
                <div class="offer-meta">
                  @if (offer.division) {
                    <span class="division-badge">{{ offer.division }}</span>
                  }
                  @if (offer.conference) {
                    <span class="conference">{{ offer.conference }}</span>
                  }
                </div>
                @if (offer.coachName) {
                  <p class="coach-name">{{ offer.coachName }}</p>
                }
              </div>

              <!-- Offer Badge -->
              <div class="offer-badge" [attr.data-type]="offer.type">
                <ion-icon [name]="getOfferTypeIcon(offer.type)"></ion-icon>
                <span>{{ getOfferTypeLabel(offer.type) }}</span>
              </div>

              <!-- Committed Badge -->
              @if (offer.isCommitted) {
                <div class="committed-badge">
                  <ion-icon name="checkmark-circle-outline"></ion-icon>
                  <span>Committed</span>
                </div>
              }
            </article>
          }
        </div>

        <!-- Add Offer Button (Own Profile) -->
        @if (isOwnProfile()) {
          <button class="add-offer-btn" (click)="addOfferClick.emit()">
            <ion-icon name="add-circle-outline"></ion-icon>
            <span>Add Offer</span>
          </button>
        }
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       PROFILE OFFERS - College Offers Section
       2026 Professional Design
       ============================================ */

      :host {
        display: block;

        --offers-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --offers-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --offers-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --offers-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --offers-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --offers-text-tertiary: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --offers-primary: var(--nxt1-color-primary, #d4ff00);
        --offers-success: var(--nxt1-color-success, #4ade80);
      }

      .profile-offers {
        padding: 16px 24px;

        @media (max-width: 768px) {
          padding: 12px 16px;
        }
      }

      /* ============================================
         EMPTY STATE
         ============================================ */

      .offers-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
      }

      .empty-icon {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        background: var(--offers-surface);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16px;

        ion-icon {
          font-size: 32px;
          color: var(--offers-text-tertiary);
        }
      }

      .empty-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--offers-text-primary);
        margin: 0 0 8px;
      }

      .empty-message {
        font-size: 14px;
        color: var(--offers-text-secondary);
        margin: 0 0 20px;
        max-width: 280px;
      }

      .empty-cta {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 24px;
        background: var(--offers-primary);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: #000;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          filter: brightness(1.1);
        }
      }

      /* ============================================
         OFFERS LIST
         ============================================ */

      .offers-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .offer-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px;
        background: var(--offers-surface);
        border: 1px solid var(--offers-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
          border-color: var(--offers-primary);
        }

        @media (max-width: 768px) {
          padding: 12px;
          gap: 12px;
        }
      }

      .offer-card--committed {
        border-color: var(--offers-success);
        background: rgba(74, 222, 128, 0.05);
      }

      /* ============================================
         OFFER LOGO
         ============================================ */

      .offer-logo {
        width: 56px;
        height: 56px;
        border-radius: var(--nxt1-radius-md, 8px);
        background: var(--offers-bg);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        ion-icon {
          font-size: 28px;
          color: var(--offers-text-tertiary);
        }

        @media (max-width: 768px) {
          width: 48px;
          height: 48px;
        }
      }

      /* ============================================
         OFFER INFO
         ============================================ */

      .offer-info {
        flex: 1;
        min-width: 0;
      }

      .offer-college {
        font-size: 16px;
        font-weight: 600;
        color: var(--offers-text-primary);
        margin: 0 0 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        @media (max-width: 768px) {
          font-size: 15px;
        }
      }

      .offer-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 2px;
      }

      .division-badge {
        padding: 2px 8px;
        background: rgba(212, 255, 0, 0.1);
        color: var(--offers-primary);
        border-radius: var(--nxt1-radius-sm, 4px);
        font-size: 11px;
        font-weight: 600;
      }

      .conference {
        font-size: 13px;
        color: var(--offers-text-tertiary);
      }

      .coach-name {
        font-size: 13px;
        color: var(--offers-text-secondary);
        margin: 0;
      }

      /* ============================================
         OFFER BADGE
         ============================================ */

      .offer-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;

        ion-icon {
          font-size: 14px;
        }

        &[data-type='scholarship'] {
          background: rgba(74, 222, 128, 0.1);
          color: var(--offers-success);
        }

        &[data-type='preferred_walk_on'] {
          background: rgba(212, 255, 0, 0.1);
          color: var(--offers-primary);
        }

        &[data-type='camp_invite'] {
          background: rgba(251, 191, 36, 0.1);
          color: var(--nxt1-color-warning, #fbbf24);
        }

        &[data-type='visit'] {
          background: rgba(77, 166, 255, 0.1);
          color: var(--nxt1-color-info, #4da6ff);
        }

        &[data-type='interest'] {
          background: rgba(156, 163, 175, 0.1);
          color: var(--offers-text-secondary);
        }

        @media (max-width: 768px) {
          padding: 4px 8px;
          font-size: 11px;

          span {
            display: none;
          }
        }
      }

      /* ============================================
         COMMITTED BADGE
         ============================================ */

      .committed-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: var(--offers-success);
        color: #000;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 11px;
        font-weight: 600;

        ion-icon {
          font-size: 12px;
        }
      }

      /* ============================================
         ADD OFFER BUTTON
         ============================================ */

      .add-offer-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        margin-top: 16px;
        padding: 14px;
        background: transparent;
        border: 2px dashed var(--offers-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        color: var(--offers-text-secondary);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;

        ion-icon {
          font-size: 20px;
        }

        &:hover {
          border-color: var(--offers-primary);
          color: var(--offers-primary);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileOffersComponent {
  // ============================================
  // INPUTS
  // ============================================

  readonly offers = input<readonly ProfileOffer[]>([]);
  readonly isLoading = input(false);
  readonly isEmpty = input(false);
  readonly isOwnProfile = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly offerClick = output<ProfileOffer>();
  readonly addOfferClick = output<void>();

  // ============================================
  // HELPERS
  // ============================================

  protected getOfferTypeIcon(type: OfferType): string {
    return OFFER_TYPE_ICONS[type] ?? 'school-outline';
  }

  protected getOfferTypeLabel(type: OfferType): string {
    return OFFER_TYPE_LABELS[type] ?? 'Offer';
  }
}
