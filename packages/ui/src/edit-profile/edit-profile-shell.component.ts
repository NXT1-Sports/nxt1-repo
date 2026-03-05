/**
 * @fileoverview Edit Profile Shell Component - Main Container
 * @module @nxt1/ui/edit-profile
 * @version 1.0.0
 *
 * Top-level container component for Edit Profile feature.
 * Orchestrates header, completion progress, and sections.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Gamified completion progress ring
 * - Collapsible section cards
 * - XP rewards display
 * - Tier progression
 * - Save/discard actions
 * - Pull-to-refresh support
 *
 * @example
 * ```html
 * <nxt1-edit-profile-shell
 *   (close)="onClose()"
 *   (save)="onSave()"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  output,
  input,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  checkmarkOutline,
  chevronDownOutline,
  chevronUpOutline,
  sparklesOutline,
  trophyOutline,
  starOutline,
  diamondOutline,
  flameOutline,
} from 'ionicons/icons';
import { EditProfileService } from './edit-profile.service';
import { EditProfileProgressComponent } from './edit-profile-progress.component';
import { EditProfileSectionComponent } from './edit-profile-section.component';
import { EditProfileSkeletonComponent } from './edit-profile-skeleton.component';
import type { EditProfileSectionId } from '@nxt1/core';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';

// Register icons
@Component({
  selector: 'nxt1-edit-profile-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    IonSpinner,
    EditProfileProgressComponent,
    EditProfileSectionComponent,
    EditProfileSkeletonComponent,
    NxtSheetHeaderComponent,
  ],
  template: `
    <div class="edit-profile-shell">
      <!-- Header (optional - native sheet has its own handle) -->
      @if (showHeader()) {
        <header class="edit-profile-header">
          <button
            type="button"
            class="header-btn header-btn--close"
            (click)="onClose()"
            aria-label="Close"
          >
            <ion-icon name="close-outline"></ion-icon>
          </button>

          <h1 class="header-title">Edit Profile</h1>

          <button
            type="button"
            class="header-btn header-btn--save"
            [class.header-btn--active]="profile.hasUnsavedChanges()"
            [disabled]="profile.isSaving() || !profile.hasUnsavedChanges()"
            (click)="onSave()"
            aria-label="Save changes"
          >
            @if (profile.isSaving()) {
              <ion-spinner name="crescent"></ion-spinner>
            } @else {
              <span>Save</span>
            }
          </button>
        </header>
      }

      <!-- Minimal Sheet Header (when showHeader is false - used in native bottom sheet) -->
      @if (!showHeader()) {
        <nxt1-sheet-header
          title="Edit Profile"
          [showClose]="false"
          [showBorder]="true"
          (closeSheet)="onClose()"
        >
          <button
            sheetHeaderAction
            type="button"
            class="sheet-save-btn"
            [class.sheet-save-btn--active]="profile.hasUnsavedChanges()"
            [disabled]="profile.isSaving() || !profile.hasUnsavedChanges()"
            (click)="onSave()"
            aria-label="Save changes"
          >
            @if (profile.isSaving()) {
              <ion-spinner name="crescent"></ion-spinner>
            } @else {
              <span>{{ profile.hasUnsavedChanges() ? 'Save' : 'Done' }}</span>
            }
          </button>
        </nxt1-sheet-header>
      }

      <ion-content [fullscreen]="true" class="edit-profile-content">
        @if (profile.isLoading()) {
          <nxt1-edit-profile-skeleton />
        } @else if (profile.error()) {
          <div class="error-state">
            <ion-icon name="alert-circle-outline"></ion-icon>
            <p>{{ profile.error() }}</p>
            <button class="retry-btn" (click)="loadProfile()">Try Again</button>
          </div>
        } @else {
          <!-- Gamified Progress Section -->
          <section class="progress-section">
            <nxt1-edit-profile-progress
              [percentage]="profile.completionPercent()"
              [tier]="profile.currentTier()"
              [tierConfig]="profile.currentTierConfig()"
              [nextTierConfig]="profile.nextTierConfig()"
              [progressToNextTier]="profile.progressToNextTier()"
              [xpEarned]="profile.xpProgress().earned"
              [xpTotal]="profile.xpProgress().total"
              [fieldsCompleted]="profile.fieldsProgress().completed"
              [fieldsTotal]="profile.fieldsProgress().total"
            />
          </section>

          <!-- Quick Stats -->
          <div class="quick-stats">
            <div class="stat-item">
              <span class="stat-value">{{ profile.completedSections().length }}</span>
              <span class="stat-label">Sections Done</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-value">{{ profile.fieldsProgress().completed }}</span>
              <span class="stat-label">Fields Done</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item stat-item--xp">
              <span class="stat-value">{{ profile.xpProgress().earned }}</span>
              <span class="stat-label">XP Earned</span>
            </div>
          </div>

          <!-- Sections -->
          <div class="sections-container">
            @for (section of profile.sections(); track section.id) {
              <nxt1-edit-profile-section
                [section]="section"
                [isExpanded]="profile.expandedSection() === section.id"
                (toggle)="profile.toggleSection(section.id)"
                (fieldChange)="onFieldChange($event)"
              />
            }
          </div>

          <!-- Bottom Safe Area -->
          <div class="bottom-spacer"></div>
        }
      </ion-content>

      <!-- Unsaved Changes Banner -->
      @if (profile.hasUnsavedChanges() && !profile.isSaving()) {
        <div class="unsaved-banner">
          <span class="unsaved-text">You have unsaved changes</span>
          <div class="unsaved-actions">
            <button class="unsaved-btn unsaved-btn--discard" (click)="onDiscard()">Discard</button>
            <button class="unsaved-btn unsaved-btn--save" (click)="onSave()">Save</button>
          </div>
        </div>
      }

      <!-- Tier Celebration Overlay -->
      @if (profile.showCompletionCelebration()) {
        <div class="celebration-overlay" (click)="profile.dismissCelebration()">
          <div class="celebration-content">
            <div class="celebration-icon">
              <ion-icon name="trophy-outline"></ion-icon>
            </div>
            <h2 class="celebration-title">Level Up!</h2>
            <p class="celebration-tier">{{ tierLabel() }}</p>
            <p class="celebration-message">Your profile is looking great!</p>
            <button class="celebration-btn" (click)="profile.dismissCelebration()">
              <ion-icon name="sparkles-outline"></ion-icon>
              <span>Continue</span>
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       EDIT PROFILE SHELL - iOS 26 Liquid Glass Design
       100% Theme Aware (Light + Dark Mode)
       ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .edit-profile-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-bg-primary);
        position: relative;
      }

      /* ============================================
         HEADER (Full header with X button - for standalone page)
         ============================================ */

      .edit-profile-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        min-height: 56px;
        position: sticky;
        top: 0;
        z-index: 100;
      }

      .header-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .header-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        border-radius: var(--nxt1-radius-lg);
        transition: all var(--nxt1-transition-fast);

        ion-icon {
          font-size: 24px;
        }

        &:active:not(:disabled) {
          transform: scale(0.95);
          background: var(--nxt1-color-surface-200);
        }
      }

      .header-btn--save {
        padding: 0 var(--nxt1-spacing-4);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary);

        &.header-btn--active {
          color: var(--nxt1-color-primary);
        }

        &:disabled {
          opacity: 0.5;
        }

        ion-spinner {
          width: 20px;
          height: 20px;
          --color: var(--nxt1-color-primary);
        }
      }

      /* ============================================
         SHEET HEADER (Save button styling for projected content)
         ============================================ */

      .sheet-save-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        min-height: 36px;
        border: none;
        background: transparent;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary);
        cursor: pointer;
        border-radius: var(--nxt1-radius-lg);
        transition: all var(--nxt1-transition-fast);

        &.sheet-save-btn--active {
          color: var(--nxt1-color-primary);
        }

        &:disabled {
          opacity: 0.5;
        }

        &:active:not(:disabled) {
          transform: scale(0.95);
        }

        ion-spinner {
          width: 20px;
          height: 20px;
          --color: var(--nxt1-color-primary);
        }
      }

      /* ============================================
         CONTENT
         ============================================ */

      .edit-profile-content {
        --background: var(--nxt1-color-bg-primary);
        flex: 1;
      }

      /* ============================================
         PROGRESS SECTION
         ============================================ */

      .progress-section {
        padding: var(--nxt1-spacing-6) var(--nxt1-spacing-4);
        background: linear-gradient(
          180deg,
          var(--nxt1-color-surface-100) 0%,
          var(--nxt1-color-bg-primary) 100%
        );
      }

      /* ============================================
         QUICK STATS
         ============================================ */

      .quick-stats {
        display: flex;
        align-items: center;
        justify-content: space-around;
        padding: var(--nxt1-spacing-4);
        margin: 0 var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1);
      }

      .stat-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .stat-label {
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      .stat-item--xp .stat-value {
        color: var(--nxt1-color-primary);
      }

      .stat-divider {
        width: 1px;
        height: 32px;
        background: var(--nxt1-color-border-subtle);
      }

      /* ============================================
         SECTIONS
         ============================================ */

      .sections-container {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
      }

      /* ============================================
         ERROR STATE
         ============================================ */

      .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-8);
        text-align: center;
        min-height: 300px;

        ion-icon {
          font-size: 48px;
          color: var(--nxt1-color-feedback-error);
          margin-bottom: var(--nxt1-spacing-4);
        }

        p {
          color: var(--nxt1-color-text-secondary);
          margin-bottom: var(--nxt1-spacing-4);
        }
      }

      .retry-btn {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-6);
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border);
        border-radius: var(--nxt1-radius-lg);
        color: var(--nxt1-color-text-primary);
        font-weight: 500;
        cursor: pointer;
        transition: all var(--nxt1-transition-fast);

        &:active {
          transform: scale(0.98);
        }
      }

      /* ============================================
         UNSAVED BANNER
         ============================================ */

      .unsaved-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-200);
        border-top: 1px solid var(--nxt1-color-border);
        position: sticky;
        bottom: 0;
        z-index: 100;
        padding-bottom: calc(var(--nxt1-spacing-3) + env(safe-area-inset-bottom, 0));
      }

      .unsaved-text {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
      }

      .unsaved-actions {
        display: flex;
        gap: var(--nxt1-spacing-2);
      }

      .unsaved-btn {
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-radius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        cursor: pointer;
        transition: all var(--nxt1-transition-fast);

        &:active {
          transform: scale(0.98);
        }
      }

      .unsaved-btn--discard {
        background: transparent;
        border: 1px solid var(--nxt1-color-border);
        color: var(--nxt1-color-text-secondary);
      }

      .unsaved-btn--save {
        background: var(--nxt1-color-primary);
        border: none;
        color: var(--nxt1-color-text-onPrimary);
      }

      /* ============================================
         CELEBRATION OVERLAY
         ============================================ */

      .celebration-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        animation: fadeIn 0.3s ease-out;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      .celebration-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: var(--nxt1-spacing-8);
        animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes scaleIn {
        from {
          transform: scale(0.8);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }

      .celebration-icon {
        width: 80px;
        height: 80px;
        border-radius: var(--nxt1-radius-full);
        background: linear-gradient(135deg, var(--nxt1-color-primary), #a3cc00);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--nxt1-spacing-4);
        animation: pulse 1.5s ease-in-out infinite;

        ion-icon {
          font-size: 40px;
          color: var(--nxt1-color-text-onPrimary);
        }
      }

      @keyframes pulse {
        0%,
        100% {
          box-shadow: 0 0 0 0 rgba(204, 255, 0, 0.4);
        }
        50% {
          box-shadow: 0 0 0 20px rgba(204, 255, 0, 0);
        }
      }

      .celebration-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2);
      }

      .celebration-tier {
        font-size: var(--nxt1-fontSize-lg);
        color: var(--nxt1-color-primary);
        font-weight: 600;
        margin: 0 0 var(--nxt1-spacing-2);
      }

      .celebration-message {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-6);
      }

      .celebration-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-6);
        background: var(--nxt1-color-primary);
        border: none;
        border-radius: var(--nxt1-radius-full);
        color: var(--nxt1-color-text-onPrimary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        cursor: pointer;
        transition: all var(--nxt1-transition-fast);

        &:active {
          transform: scale(0.98);
        }

        ion-icon {
          font-size: 18px;
        }
      }

      /* ============================================
         BOTTOM SPACER
         ============================================ */

      .bottom-spacer {
        height: calc(80px + env(safe-area-inset-bottom, 0));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditProfileShellComponent implements OnInit {
  constructor() {
    addIcons({
      closeOutline,
      checkmarkOutline,
      chevronDownOutline,
      chevronUpOutline,
      sparklesOutline,
      trophyOutline,
      starOutline,
      diamondOutline,
      flameOutline,
    });
  }

  protected readonly profile = inject(EditProfileService);

  // ============================================
  // INPUTS
  // ============================================

  /**
   * Whether to show the full header with X button.
   * Set to false when used in native bottom sheet (has its own handle).
   * Default: false (uses minimal sheet header with handle)
   */
  readonly showHeader = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when close button is clicked */
  readonly close = output<void>();

  /** Emitted when save is complete */
  readonly save = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly tierLabel = computed(() => {
    const tier = this.profile.lastUnlockedTier();
    if (!tier) return '';
    const config = this.profile.currentTierConfig();
    return config?.label ?? tier;
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    this.loadProfile();
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  async loadProfile(): Promise<void> {
    await this.profile.loadProfile();
  }

  onClose(): void {
    this.close.emit();
  }

  async onSave(): Promise<void> {
    const success = await this.profile.saveChanges();
    if (success) {
      this.save.emit();
    }
  }

  async onDiscard(): Promise<void> {
    await this.profile.discardChanges();
  }

  onFieldChange(event: { sectionId: string; fieldId: string; value: unknown }): void {
    this.profile.updateField(event.sectionId as EditProfileSectionId, event.fieldId, event.value);
  }
}
