/**
 * @fileoverview Edit Profile Section Component
 * @module @nxt1/ui/edit-profile
 * @version 1.0.0
 *
 * Collapsible section card for edit profile with fields and completion indicator.
 * Features smooth expand/collapse animations and gamified completion status.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Collapsible accordion behavior
 * - Section completion percentage
 * - XP reward preview
 * - Field list with inputs
 * - Animated expand/collapse
 *
 * @example
 * ```html
 * <nxt1-edit-profile-section
 *   [section]="section"
 *   [isExpanded]="true"
 *   (toggle)="onToggle()"
 *   (fieldChange)="onFieldChange($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonInput, IonTextarea, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronDownOutline,
  chevronUpOutline,
  checkmarkCircle,
  checkmarkCircleOutline,
  sparklesOutline,
  personOutline,
  cameraOutline,
  footballOutline,
  schoolOutline,
  fitnessOutline,
  shareSocialOutline,
  mailOutline,
  settingsOutline,
  locationOutline,
  logoTwitter,
  logoInstagram,
  logoTiktok,
  logoYoutube,
} from 'ionicons/icons';
import type { EditProfileSection, EditProfileField, EditProfileSectionId } from '@nxt1/core';
import { NxtFormFieldComponent } from '../components/form-field';

// Register icons
@Component({
  selector: 'nxt1-edit-profile-section',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonIcon,
    IonInput,
    IonTextarea,
    IonRippleEffect,
    NxtFormFieldComponent,
  ],
  template: `
    <div
      class="section-card"
      [class.section-card--expanded]="isExpanded()"
      [class.section-card--complete]="isComplete()"
    >
      <!-- Section Header (Clickable) -->
      <button type="button" class="section-header" (click)="toggle.emit()">
        <ion-ripple-effect></ion-ripple-effect>

        <!-- Section Icon -->
        <div class="section-icon" [class.section-icon--complete]="isComplete()">
          @if (isComplete()) {
            <ion-icon name="checkmark-circle"></ion-icon>
          } @else {
            <ion-icon [name]="section().icon"></ion-icon>
          }
        </div>

        <!-- Section Info -->
        <div class="section-info">
          <span class="section-title">{{ section().title }}</span>
          <span class="section-description">{{ section().description }}</span>
        </div>

        <!-- Completion Badge -->
        <div class="section-meta">
          <div
            class="completion-badge"
            [class.completion-badge--complete]="isComplete()"
            [class.completion-badge--partial]="!isComplete() && section().completionPercent > 0"
          >
            @if (isComplete()) {
              <ion-icon name="checkmark-circle"></ion-icon>
            } @else {
              <span>{{ section().completionPercent }}%</span>
            }
          </div>

          <!-- XP Reward Preview -->
          @if (!isComplete()) {
            <div class="xp-preview">
              <ion-icon name="sparkles-outline"></ion-icon>
              <span>+{{ section().xpReward }} XP</span>
            </div>
          }
        </div>

        <!-- Expand Icon -->
        <ion-icon
          class="expand-icon"
          [name]="isExpanded() ? 'chevron-up-outline' : 'chevron-down-outline'"
        ></ion-icon>
      </button>

      <!-- Section Content (Collapsible) -->
      <div class="section-content" [class.section-content--expanded]="isExpanded()">
        <div class="fields-container">
          @for (field of section().fields; track field.id) {
            <div class="field-row">
              <nxt1-form-field
                [label]="field.label"
                [required]="field.required ?? false"
                [hint]="field.hint ?? null"
              >
                @switch (field.type) {
                  @case ('textarea') {
                    <ion-textarea
                      [value]="getFieldValue(field)"
                      [placeholder]="field.placeholder ?? ''"
                      [maxlength]="field.validation?.maxLength ?? 500"
                      [rows]="4"
                      [autoGrow]="true"
                      mode="md"
                      fill="outline"
                      (ionInput)="onFieldInput(field.id, $event)"
                    ></ion-textarea>
                  }
                  @case ('photo-upload') {
                    <div class="photo-upload-field">
                      @if (getFieldValue(field)) {
                        <div class="photo-preview">
                          <img [src]="getFieldValue(field)" [alt]="field.label" />
                          <button class="photo-change-btn" type="button">
                            <ion-icon name="camera-outline"></ion-icon>
                            Change
                          </button>
                        </div>
                      } @else {
                        <button class="photo-upload-btn" type="button">
                          <ion-icon name="camera-outline"></ion-icon>
                          <span>Upload {{ field.label }}</span>
                        </button>
                      }
                    </div>
                  }
                  @case ('select') {
                    <div class="select-field">
                      <select
                        [value]="getFieldValue(field)"
                        (change)="onSelectChange(field.id, $event)"
                      >
                        <option value="" disabled>{{ field.placeholder }}</option>
                        @for (option of field.options; track option.value) {
                          <option [value]="option.value">{{ option.label }}</option>
                        }
                      </select>
                      <ion-icon name="chevron-down-outline" class="select-arrow"></ion-icon>
                    </div>
                  }
                  @default {
                    <ion-input
                      [value]="getFieldValue(field)"
                      [type]="getInputType(field.type)"
                      [placeholder]="field.placeholder ?? ''"
                      mode="md"
                      fill="outline"
                      (ionInput)="onFieldInput(field.id, $event)"
                    >
                      @if (field.icon) {
                        <ion-icon slot="start" [name]="field.icon"></ion-icon>
                      }
                    </ion-input>
                  }
                }
              </nxt1-form-field>

              <!-- Field XP Indicator -->
              @if (field.xpReward && !hasFieldValue(field)) {
                <div class="field-xp">
                  <ion-icon name="sparkles-outline"></ion-icon>
                  <span>+{{ field.xpReward }}</span>
                </div>
              }
              @if (hasFieldValue(field)) {
                <div class="field-complete">
                  <ion-icon name="checkmark-circle"></ion-icon>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       EDIT PROFILE SECTION - Collapsible Card
       iOS 26 Liquid Glass Design
       ============================================ */

      :host {
        display: block;
      }

      .section-card {
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        overflow: hidden;
        transition: all var(--nxt1-transition-normal);
      }

      .section-card--expanded {
        border-color: var(--nxt1-color-border);
      }

      .section-card--complete {
        border-color: color-mix(in srgb, var(--nxt1-color-success) 30%, transparent);
      }

      /* ============================================
         SECTION HEADER
         ============================================ */

      .section-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        padding: var(--nxt1-spacing-4);
        background: transparent;
        border: none;
        cursor: pointer;
        text-align: left;
        position: relative;
        overflow: hidden;
      }

      .section-icon {
        width: 44px;
        height: 44px;
        border-radius: var(--nxt1-radius-lg);
        background: var(--nxt1-color-surface-200);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all var(--nxt1-transition-fast);

        ion-icon {
          font-size: 20px;
          color: var(--nxt1-color-text-secondary);
        }
      }

      .section-icon--complete {
        background: color-mix(in srgb, var(--nxt1-color-success) 15%, transparent);

        ion-icon {
          color: var(--nxt1-color-success);
        }
      }

      .section-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
      }

      .section-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .section-description {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .section-meta {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: var(--nxt1-spacing-1);
      }

      .completion-badge {
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-radius-md);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 600;
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-tertiary);
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);

        ion-icon {
          font-size: 14px;
        }
      }

      .completion-badge--partial {
        background: color-mix(in srgb, var(--nxt1-color-primary) 15%, transparent);
        color: var(--nxt1-color-primary);
      }

      .completion-badge--complete {
        background: color-mix(in srgb, var(--nxt1-color-success) 15%, transparent);
        color: var(--nxt1-color-success);
      }

      .xp-preview {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);

        ion-icon {
          font-size: 12px;
          color: var(--nxt1-color-primary);
        }
      }

      .expand-icon {
        font-size: 20px;
        color: var(--nxt1-color-text-tertiary);
        transition: transform var(--nxt1-transition-fast);
      }

      /* ============================================
         SECTION CONTENT
         ============================================ */

      .section-content {
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .section-content--expanded {
        max-height: 2000px;
      }

      .fields-container {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        padding: 0 var(--nxt1-spacing-4) var(--nxt1-spacing-4);
        border-top: 1px solid var(--nxt1-color-border-subtle);
        padding-top: var(--nxt1-spacing-4);
      }

      /* ============================================
         FIELD ROW
         ============================================ */

      .field-row {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-2);
      }

      .field-row nxt1-form-field {
        flex: 1;
      }

      .field-xp,
      .field-complete {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding-top: 28px; /* Align with input */
        flex-shrink: 0;

        ion-icon {
          font-size: 14px;
        }

        span {
          font-size: var(--nxt1-fontSize-2xs);
          font-weight: 600;
        }
      }

      .field-xp {
        color: var(--nxt1-color-text-tertiary);

        ion-icon {
          color: var(--nxt1-color-primary);
        }
      }

      .field-complete {
        color: var(--nxt1-color-success);
      }

      /* ============================================
         INPUT STYLES
         ============================================ */

      ion-input,
      ion-textarea {
        --background: var(--nxt1-color-surface-200);
        --border-radius: var(--nxt1-radius-lg);
        --padding-start: var(--nxt1-spacing-4);
        --padding-end: var(--nxt1-spacing-4);
        --placeholder-color: var(--nxt1-color-text-tertiary);
        --color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
      }

      ion-textarea {
        --padding-top: var(--nxt1-spacing-3);
        --padding-bottom: var(--nxt1-spacing-3);
      }

      /* ============================================
         SELECT FIELD
         ============================================ */

      .select-field {
        position: relative;
        width: 100%;
      }

      .select-field select {
        width: 100%;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        padding-right: var(--nxt1-spacing-10);
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        appearance: none;
        cursor: pointer;
        transition: border-color var(--nxt1-transition-fast);

        &:focus {
          outline: none;
          border-color: var(--nxt1-color-primary);
        }

        option {
          background: var(--nxt1-color-surface-100);
          color: var(--nxt1-color-text-primary);
        }
      }

      .select-arrow {
        position: absolute;
        right: var(--nxt1-spacing-4);
        top: 50%;
        transform: translateY(-50%);
        font-size: 18px;
        color: var(--nxt1-color-text-tertiary);
        pointer-events: none;
      }

      /* ============================================
         PHOTO UPLOAD FIELD
         ============================================ */

      .photo-upload-field {
        width: 100%;
      }

      .photo-preview {
        position: relative;
        border-radius: var(--nxt1-radius-lg);
        overflow: hidden;

        img {
          width: 100%;
          height: 120px;
          object-fit: cover;
        }
      }

      .photo-change-btn {
        position: absolute;
        bottom: var(--nxt1-spacing-2);
        right: var(--nxt1-spacing-2);
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        border: none;
        border-radius: var(--nxt1-radius-md);
        color: #fff;
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 500;
        cursor: pointer;

        ion-icon {
          font-size: 14px;
        }
      }

      .photo-upload-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        width: 100%;
        height: 120px;
        background: var(--nxt1-color-surface-200);
        border: 2px dashed var(--nxt1-color-border);
        border-radius: var(--nxt1-radius-lg);
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        transition: all var(--nxt1-transition-fast);

        &:hover,
        &:focus {
          border-color: var(--nxt1-color-primary);
          color: var(--nxt1-color-primary);
        }

        ion-icon {
          font-size: 28px;
        }

        span {
          font-size: var(--nxt1-fontSize-sm);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditProfileSectionComponent {
  constructor() {
    addIcons({
      chevronDownOutline,
      chevronUpOutline,
      checkmarkCircle,
      checkmarkCircleOutline,
      sparklesOutline,
      personOutline,
      cameraOutline,
      footballOutline,
      schoolOutline,
      fitnessOutline,
      shareSocialOutline,
      mailOutline,
      settingsOutline,
      locationOutline,
      logoTwitter,
      logoInstagram,
      logoTiktok,
      logoYoutube,
    });
  }

  // ============================================
  // INPUTS
  // ============================================

  readonly section = input.required<EditProfileSection>();
  readonly isExpanded = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly toggle = output<void>();
  readonly fieldChange = output<{
    sectionId: EditProfileSectionId;
    fieldId: string;
    value: unknown;
  }>();

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly isComplete = computed(() => this.section().completionPercent === 100);

  // ============================================
  // METHODS
  // ============================================

  getFieldValue(field: EditProfileField): string {
    const value = field.value;
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  hasFieldValue(field: EditProfileField): boolean {
    const value = field.value;
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  getInputType(fieldType: string): string {
    switch (fieldType) {
      case 'email':
        return 'email';
      case 'phone':
        return 'tel';
      case 'number':
        return 'number';
      case 'url':
        return 'url';
      default:
        return 'text';
    }
  }

  onFieldInput(fieldId: string, event: CustomEvent): void {
    const value = event.detail.value;
    this.fieldChange.emit({
      sectionId: this.section().id,
      fieldId,
      value,
    });
  }

  onSelectChange(fieldId: string, event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.fieldChange.emit({
      sectionId: this.section().id,
      fieldId,
      value: target.value,
    });
  }
}
