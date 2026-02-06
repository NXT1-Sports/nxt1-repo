/**
 * @fileoverview Manage Team - Team Info Section Component
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Team information section including logo, mascot, colors, and contact.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonInput, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  shieldOutline,
  cameraOutline,
  colorPaletteOutline,
  callOutline,
  mailOutline,
  globeOutline,
  locationOutline,
  createOutline,
  checkmarkCircle,
  chevronDownOutline,
  chevronUpOutline,
} from 'ionicons/icons';
import type { TeamBasicInfo, TeamBranding, TeamContactInfo } from '@nxt1/core';

addIcons({
  shieldOutline,
  cameraOutline,
  colorPaletteOutline,
  callOutline,
  mailOutline,
  globeOutline,
  locationOutline,
  createOutline,
  checkmarkCircle,
  chevronDownOutline,
  chevronUpOutline,
});

@Component({
  selector: 'nxt1-manage-team-info-section',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, IonInput, IonRippleEffect],
  template: `
    <div class="team-info-section">
      <!-- Logo & Branding -->
      <div class="branding-row">
        <button type="button" class="logo-upload" (click)="onLogoClick()">
          <ion-ripple-effect></ion-ripple-effect>
          @if (branding()?.logo) {
            <img [src]="branding()?.logo" alt="Team Logo" class="logo-preview" />
            <div class="logo-overlay">
              <ion-icon name="camera-outline"></ion-icon>
              <span>Change</span>
            </div>
          } @else {
            <div class="logo-placeholder">
              <ion-icon name="shield-outline"></ion-icon>
              <span>Add Logo</span>
            </div>
          }
        </button>

        <div class="team-identity">
          <div class="form-field">
            <label class="form-label">Team Name <span class="required">*</span></label>
            <ion-input
              [value]="basicInfo()?.name ?? ''"
              placeholder="Enter team name"
              fill="outline"
              mode="md"
              (ionInput)="onFieldChange('name', $event)"
            ></ion-input>
          </div>

          <div class="form-field">
            <label class="form-label">Mascot</label>
            <ion-input
              [value]="basicInfo()?.mascot ?? ''"
              placeholder="e.g., Tigers"
              fill="outline"
              mode="md"
              (ionInput)="onFieldChange('mascot', $event)"
            ></ion-input>
          </div>
        </div>
      </div>

      <!-- Team Colors -->
      <div class="colors-section">
        <h4 class="section-subtitle">
          <ion-icon name="color-palette-outline"></ion-icon>
          Team Colors
        </h4>

        <div class="colors-row">
          <button
            type="button"
            class="color-picker"
            [style.--color]="branding()?.primaryColor ?? '#ccff00'"
            (click)="onColorClick('primary')"
          >
            <ion-ripple-effect></ion-ripple-effect>
            <div
              class="color-swatch"
              [style.background]="branding()?.primaryColor ?? '#ccff00'"
            ></div>
            <span class="color-label">Primary</span>
          </button>

          <button
            type="button"
            class="color-picker"
            [style.--color]="branding()?.secondaryColor ?? '#000000'"
            (click)="onColorClick('secondary')"
          >
            <ion-ripple-effect></ion-ripple-effect>
            <div
              class="color-swatch"
              [style.background]="branding()?.secondaryColor ?? '#000000'"
            ></div>
            <span class="color-label">Secondary</span>
          </button>

          <button
            type="button"
            class="color-picker"
            [style.--color]="branding()?.accentColor ?? '#ffffff'"
            (click)="onColorClick('accent')"
          >
            <ion-ripple-effect></ion-ripple-effect>
            <div
              class="color-swatch"
              [style.background]="branding()?.accentColor ?? '#ffffff'"
            ></div>
            <span class="color-label">Accent</span>
          </button>
        </div>
      </div>

      <!-- Contact Info -->
      <div class="contact-section">
        <h4 class="section-subtitle">
          <ion-icon name="call-outline"></ion-icon>
          Contact Information
        </h4>

        <div class="contact-grid">
          <div class="form-field">
            <label class="form-label">
              <ion-icon name="mail-outline"></ion-icon>
              Email
            </label>
            <ion-input
              type="email"
              [value]="contact()?.email ?? ''"
              placeholder="team@school.edu"
              fill="outline"
              mode="md"
              (ionInput)="onContactChange('email', $event)"
            ></ion-input>
          </div>

          <div class="form-field">
            <label class="form-label">
              <ion-icon name="call-outline"></ion-icon>
              Phone
            </label>
            <ion-input
              type="tel"
              [value]="contact()?.phone ?? ''"
              placeholder="(555) 123-4567"
              fill="outline"
              mode="md"
              (ionInput)="onContactChange('phone', $event)"
            ></ion-input>
          </div>

          <div class="form-field full-width">
            <label class="form-label">
              <ion-icon name="globe-outline"></ion-icon>
              Website
            </label>
            <ion-input
              type="url"
              [value]="contact()?.website ?? ''"
              placeholder="https://yourteam.com"
              fill="outline"
              mode="md"
              (ionInput)="onContactChange('website', $event)"
            ></ion-input>
          </div>

          <div class="form-field full-width">
            <label class="form-label">
              <ion-icon name="location-outline"></ion-icon>
              Address
            </label>
            <ion-input
              [value]="fullAddress()"
              placeholder="1234 Stadium Drive, City, State"
              fill="outline"
              mode="md"
              (ionInput)="onContactChange('address', $event)"
            ></ion-input>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       TEAM INFO SECTION - 2026 Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      .team-info-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-6);
      }

      /* ============================================
         BRANDING ROW
         ============================================ */

      .branding-row {
        display: flex;
        gap: var(--nxt1-spacing-4);
        align-items: flex-start;
      }

      .logo-upload {
        position: relative;
        width: 100px;
        height: 100px;
        border-radius: var(--nxt1-radius-xl);
        border: 2px dashed var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-100);
        cursor: pointer;
        overflow: hidden;
        flex-shrink: 0;
        transition: all var(--nxt1-transition-fast);

        &:hover,
        &:focus-visible {
          border-color: var(--nxt1-color-primary);
          background: var(--nxt1-color-surface-200);
        }

        &:active {
          transform: scale(0.98);
        }
      }

      .logo-preview {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .logo-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1);
        background: rgba(0, 0, 0, 0.6);
        color: white;
        opacity: 0;
        transition: opacity var(--nxt1-transition-fast);
        font-size: var(--nxt1-fontSize-xs);

        ion-icon {
          font-size: 24px;
        }
      }

      .logo-upload:hover .logo-overlay,
      .logo-upload:focus-visible .logo-overlay {
        opacity: 1;
      }

      .logo-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1);
        color: var(--nxt1-color-text-tertiary);
        font-size: var(--nxt1-fontSize-xs);

        ion-icon {
          font-size: 32px;
        }
      }

      .team-identity {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      /* ============================================
         FORM FIELDS
         ============================================ */

      .form-field {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
      }

      .form-label {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);

        ion-icon {
          font-size: 16px;
        }

        .required {
          color: var(--nxt1-color-feedback-error);
        }
      }

      ion-input {
        --background: var(--nxt1-color-surface-100);
        --border-radius: var(--nxt1-radius-lg);
        --padding-start: var(--nxt1-spacing-3);
        --padding-end: var(--nxt1-spacing-3);
        font-family: var(--nxt1-fontFamily-primary);
      }

      /* ============================================
         COLORS SECTION
         ============================================ */

      .colors-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .section-subtitle {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0;

        ion-icon {
          font-size: 18px;
          color: var(--nxt1-color-primary);
        }
      }

      .colors-row {
        display: flex;
        gap: var(--nxt1-spacing-3);
      }

      .color-picker {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        cursor: pointer;
        transition: all var(--nxt1-transition-fast);
        overflow: hidden;

        &:hover,
        &:focus-visible {
          border-color: var(--nxt1-color-primary);
          background: var(--nxt1-color-surface-200);
        }

        &:active {
          transform: scale(0.98);
        }
      }

      .color-swatch {
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-radius-md);
        border: 2px solid var(--nxt1-color-border-default);
        box-shadow: var(--nxt1-shadow-sm);
      }

      .color-label {
        font-family: var(--nxt1-fontFamily-primary);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
      }

      /* ============================================
         CONTACT SECTION
         ============================================ */

      .contact-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .contact-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-3);
      }

      .form-field.full-width {
        grid-column: 1 / -1;
      }

      @media (max-width: 480px) {
        .branding-row {
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .team-identity {
          width: 100%;
        }

        .contact-grid {
          grid-template-columns: 1fr;
        }

        .form-field.full-width {
          grid-column: 1;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamInfoSectionComponent {
  /** Basic team info */
  readonly basicInfo = input<TeamBasicInfo | null>(null);

  /** Team branding */
  readonly branding = input<TeamBranding | null>(null);

  /** Team contact info */
  readonly contact = input<TeamContactInfo | null>(null);

  /** Field change event */
  readonly fieldChange = output<{ field: string; value: string }>();

  /** Logo click event */
  readonly logoClick = output<void>();

  /** Color click event */
  readonly colorClick = output<'primary' | 'secondary' | 'accent'>();

  /** Computed full address */
  readonly fullAddress = computed(() => {
    const c = this.contact();
    if (!c) return '';
    const parts = [c.address, c.city, c.state, c.zipCode].filter(Boolean);
    return parts.join(', ');
  });

  onFieldChange(field: string, event: CustomEvent): void {
    const value = event.detail.value ?? '';
    this.fieldChange.emit({ field, value });
  }

  onContactChange(field: string, event: CustomEvent): void {
    const value = event.detail.value ?? '';
    this.fieldChange.emit({ field: `contact.${field}`, value });
  }

  onLogoClick(): void {
    this.logoClick.emit();
  }

  onColorClick(type: 'primary' | 'secondary' | 'accent'): void {
    this.colorClick.emit(type);
  }
}
