/**
 * @fileoverview Edit Profile Shell Component
 * @module @nxt1/ui/edit-profile
 * @version 3.0.0
 *
 * Uses the same shared form components (NxtFormFieldComponent, IonInput,
 * IonSelect) and design-token styling as the onboarding flow.
 */

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  IonContent,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  ModalController,
} from '@ionic/angular/standalone';
import {
  BrowserGeolocationAdapter,
  CachedGeocodingAdapter,
  GEOLOCATION_DEFAULTS,
  NominatimGeocodingAdapter,
  createGeolocationService,
  formatLocationShort,
  type GeolocationService,
} from '@nxt1/core/geolocation';
import { EditProfileService } from './edit-profile.service';
import { EditProfileSkeletonComponent } from './edit-profile-skeleton.component';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtIconComponent } from '../components/icon';
import { NxtFormFieldComponent } from '../components/form-field';
import { NxtChipComponent } from '../components/chip';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';

const MAX_GALLERY_IMAGES = 8;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const POSITION_OPTIONS = [
  'Quarterback',
  'Running Back',
  'Wide Receiver',
  'Tight End',
  'Offensive Line',
  'Defensive Line',
  'Linebacker',
  'Cornerback',
  'Safety',
  'Athlete',
] as const;
const HEIGHT_OPTIONS = buildHeightOptions();

@Component({
  selector: 'nxt1-edit-profile-shell',
  standalone: true,
  imports: [
    IonContent,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    EditProfileSkeletonComponent,
    NxtSheetHeaderComponent,
    NxtIconComponent,
    NxtFormFieldComponent,
    NxtChipComponent,
  ],
  template: `
    <div class="nxt1-edit-shell">
      @if (!isModalMode) {
        <header class="nxt1-edit-header">
          <button type="button" class="nxt1-header-btn" (click)="onClose()" aria-label="Close">
            <nxt1-icon name="close" [size]="18" />
          </button>

          <h1 class="nxt1-header-title">Edit Profile</h1>

          <button
            type="button"
            class="nxt1-header-btn nxt1-header-save"
            [class.nxt1-header-save--active]="profile.hasUnsavedChanges()"
            [disabled]="profile.isSaving()"
            (click)="onSave()"
            aria-label="Save changes"
          >
            @if (profile.isSaving()) {
              <ion-spinner name="crescent" />
            } @else {
              <span>{{ profile.hasUnsavedChanges() ? 'Save' : 'Done' }}</span>
            }
          </button>
        </header>
      } @else {
        <nxt1-sheet-header
          title="Edit Profile"
          [showClose]="false"
          [showBorder]="true"
          (closeSheet)="onClose()"
        >
          <button
            sheetHeaderAction
            type="button"
            class="nxt1-header-btn nxt1-header-save"
            [class.nxt1-header-save--active]="profile.hasUnsavedChanges()"
            [disabled]="profile.isSaving()"
            (click)="onSave()"
            aria-label="Save changes"
          >
            @if (profile.isSaving()) {
              <ion-spinner name="crescent" />
            } @else {
              <span>{{ profile.hasUnsavedChanges() ? 'Save' : 'Done' }}</span>
            }
          </button>
        </nxt1-sheet-header>
      }

      <ion-content [fullscreen]="true" class="nxt1-edit-content">
        @if (profile.isLoading()) {
          <nxt1-edit-profile-skeleton />
        } @else if (profile.error()) {
          <div class="nxt1-error-state">
            <div class="nxt1-error-icon">
              <nxt1-icon name="alertCircle" [size]="20" />
            </div>
            <p class="nxt1-error-text">{{ profile.error() }}</p>
            <button type="button" class="nxt1-retry-btn" (click)="loadProfile()">Try Again</button>
          </div>
        } @else if (profile.formData(); as form) {
          <div class="nxt1-edit-body">
            <!-- Media Gallery -->
            <section class="nxt1-media-section">
              <input
                #imageInput
                type="file"
                class="nxt1-hidden"
                accept="image/*"
                multiple
                (change)="onImageFilesSelected($event)"
              />

              <div class="nxt1-media-row">
                @for (image of carouselImages(); track image; let i = $index) {
                  <article class="nxt1-media-tile" [class.nxt1-media-tile--primary]="i === 0">
                    <img [src]="image" [alt]="'Profile image ' + (i + 1)" class="nxt1-media-img" />
                    <button
                      type="button"
                      class="nxt1-media-remove"
                      aria-label="Remove image"
                      (click)="removeImage(i)"
                    >
                      <nxt1-icon name="trash" [size]="12" />
                    </button>
                  </article>
                }

                @if (canAddMoreImages()) {
                  <button type="button" class="nxt1-media-add" (click)="openImagePicker()">
                    <nxt1-icon name="image" [size]="16" />
                    <span>Add</span>
                  </button>
                }
              </div>
            </section>

            <!-- Form Fields — 2x2 Grid -->
            <section class="nxt1-form-section">
              <div class="nxt1-field-grid">
                <!-- Row 1: First Name / Last Name -->
                <nxt1-form-field label="First Name" inputId="editFirstName">
                  <ion-input
                    id="editFirstName"
                    type="text"
                    class="nxt1-input"
                    fill="outline"
                    placeholder="First name"
                    [value]="form.basicInfo.firstName"
                    (ionInput)="onIonInput('firstName', $event)"
                    autocomplete="given-name"
                    autocapitalize="words"
                  />
                </nxt1-form-field>

                <nxt1-form-field label="Last Name" inputId="editLastName">
                  <ion-input
                    id="editLastName"
                    type="text"
                    class="nxt1-input"
                    fill="outline"
                    placeholder="Last name"
                    [value]="form.basicInfo.lastName"
                    (ionInput)="onIonInput('lastName', $event)"
                    autocomplete="family-name"
                    autocapitalize="words"
                  />
                </nxt1-form-field>

                <!-- Row 2: Class Year / Jersey -->
                <nxt1-form-field label="Class" inputId="editClassYear">
                  <ion-select
                    id="editClassYear"
                    class="nxt1-input"
                    interface="action-sheet"
                    [interfaceOptions]="selectActionSheetOptions"
                    placeholder="Select"
                    [value]="form.basicInfo.classYear ?? null"
                    (ionChange)="onSelectChange('classYear', $event)"
                  >
                    @for (year of classOptions(); track year) {
                      <ion-select-option [value]="year">{{ year }}</ion-select-option>
                    }
                  </ion-select>
                </nxt1-form-field>

                <nxt1-form-field label="Jersey" inputId="editJersey">
                  <ion-input
                    id="editJersey"
                    type="text"
                    class="nxt1-input"
                    fill="outline"
                    inputmode="numeric"
                    placeholder="Optional"
                    [value]="form.sportsInfo.jerseyNumber ?? ''"
                    (ionInput)="onIonSportsInput('jerseyNumber', $event)"
                  />
                </nxt1-form-field>

                <!-- Row 3: Height / Weight -->
                <nxt1-form-field label="Height" inputId="editHeight">
                  <ion-select
                    id="editHeight"
                    class="nxt1-input"
                    interface="action-sheet"
                    [interfaceOptions]="selectActionSheetOptions"
                    placeholder="Select"
                    [value]="form.physical.height ?? null"
                    (ionChange)="onSelectChange('height', $event)"
                  >
                    @for (h of heightOptions; track h) {
                      <ion-select-option [value]="h">{{ h }}</ion-select-option>
                    }
                  </ion-select>
                </nxt1-form-field>

                <nxt1-form-field label="Weight" inputId="editWeight">
                  <ion-input
                    id="editWeight"
                    type="text"
                    class="nxt1-input"
                    fill="outline"
                    inputmode="numeric"
                    placeholder="lbs"
                    [value]="form.physical.weight ?? ''"
                    (ionInput)="onIonPhysicalInput('weight', $event)"
                  />
                </nxt1-form-field>

                <!-- Full-width: Position chips -->
                <div class="nxt1-field-full">
                  <nxt1-form-field label="Position">
                    <div class="nxt1-position-chips" role="group" aria-label="Select positions">
                      @for (position of positionOptions; track position) {
                        <nxt1-chip
                          [selected]="isPositionSelected(position)"
                          [showCheck]="true"
                          size="sm"
                          (chipClick)="togglePosition(position)"
                        >
                          {{ position }}
                        </nxt1-chip>
                      }
                    </div>
                  </nxt1-form-field>
                </div>

                <!-- Full-width: Location -->
                <div class="nxt1-field-full">
                  <nxt1-form-field label="Location">
                    <div class="nxt1-location-section">
                      <button
                        type="button"
                        class="nxt1-location-detect"
                        [class.has-location]="!!form.basicInfo.location"
                        [disabled]="isDetectingLocation()"
                        (click)="detectLocation()"
                      >
                        @if (isDetectingLocation()) {
                          <ion-spinner name="crescent" class="nxt1-location-spinner"></ion-spinner>
                          <span>Detecting location...</span>
                        } @else if (form.basicInfo.location) {
                          <svg
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            class="nxt1-location-icon check"
                            aria-hidden="true"
                          >
                            <path
                              d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                            />
                          </svg>
                          <span class="nxt1-location-text">{{ form.basicInfo.location }}</span>
                          <svg
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            class="nxt1-location-edit"
                            aria-hidden="true"
                          >
                            <path
                              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                            />
                          </svg>
                        } @else {
                          <svg
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            class="nxt1-location-icon"
                            aria-hidden="true"
                          >
                            <path
                              d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"
                            />
                          </svg>
                          <span>Detect My Location</span>
                        }
                      </button>
                    </div>
                  </nxt1-form-field>
                </div>

                <!-- Full-width: Bio -->
                <div class="nxt1-field-full">
                  <nxt1-form-field label="Bio" inputId="editBio">
                    <textarea
                      id="editBio"
                      class="nxt1-native-textarea"
                      placeholder="Tell coaches about yourself"
                      [value]="form.basicInfo.bio ?? ''"
                      (input)="onBioInput($event)"
                      rows="3"
                    ></textarea>
                  </nxt1-form-field>
                </div>
              </div>
            </section>
          </div>
        }
      </ion-content>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      /* ============================================
         SHELL CONTAINER
         ============================================ */
      .nxt1-edit-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-bg-primary);
        color: var(--nxt1-color-text-primary);
      }

      /* ============================================
         HEADER (standalone page mode)
         ============================================ */
      .nxt1-edit-header {
        display: grid;
        grid-template-columns: var(--nxt1-spacing-10) 1fr auto;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .nxt1-header-title {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-md);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-tight);
        text-align: center;
        color: var(--nxt1-color-text-primary);
      }

      /* ============================================
         HEADER BUTTONS (shared reset + style)
         ============================================ */
      .nxt1-header-btn {
        appearance: none;
        -webkit-appearance: none;
        border: none;
        background: none;
        padding: 0;
        font: inherit;
        color: var(--nxt1-color-text-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: var(--nxt1-spacing-9);
        border-radius: var(--nxt1-borderRadius-lg);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast) var(--nxt1-easing-out);
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-header-btn:active {
        transform: scale(0.97);
      }

      .nxt1-header-save {
        padding: 0 var(--nxt1-spacing-3);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
      }

      .nxt1-header-save--active {
        color: var(--nxt1-color-primary);
      }

      .nxt1-header-save:disabled {
        opacity: 0.5;
        cursor: default;
      }

      .nxt1-header-save ion-spinner {
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-4);
        --color: currentColor;
      }

      /* ============================================
         CONTENT AREA
         ============================================ */
      .nxt1-edit-content {
        --background: transparent;
        flex: 1;
      }

      .nxt1-edit-body {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-4) var(--nxt1-spacing-8);
      }

      /* ============================================
         MEDIA GALLERY
         ============================================ */
      .nxt1-media-section {
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-100);
        padding: var(--nxt1-spacing-3);
      }

      .nxt1-hidden {
        display: none;
      }

      .nxt1-media-row {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: var(--nxt1-spacing-20);
        gap: var(--nxt1-spacing-2);
        overflow-x: auto;
        scrollbar-width: none;
      }

      .nxt1-media-row::-webkit-scrollbar {
        display: none;
      }

      .nxt1-media-tile,
      .nxt1-media-add {
        position: relative;
        width: var(--nxt1-spacing-20);
        height: var(--nxt1-spacing-24);
        border-radius: var(--nxt1-borderRadius-lg);
        overflow: hidden;
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-200);
      }

      .nxt1-media-tile--primary {
        border-color: var(--nxt1-color-border-primary);
      }

      .nxt1-media-img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .nxt1-media-remove {
        appearance: none;
        -webkit-appearance: none;
        border: none;
        position: absolute;
        top: var(--nxt1-spacing-1-5);
        right: var(--nxt1-spacing-1-5);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-bg-overlay);
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-media-add {
        appearance: none;
        -webkit-appearance: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1-5);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        cursor: pointer;
        border-style: dashed;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
        transition: all var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nxt1-media-add:hover {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-surface-300);
      }

      /* ============================================
         FORM SECTION
         ============================================ */
      .nxt1-form-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
      }

      .nxt1-field-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-3) var(--nxt1-spacing-3);
      }

      .nxt1-field-full {
        grid-column: 1 / -1;
      }

      /* ============================================
         ION-INPUT STYLING  — Matches onboarding
         ============================================ */
      .nxt1-input {
        --background: var(--nxt1-color-surface-100);
        --border-color: var(--nxt1-color-border-default);
        --border-radius: var(--nxt1-borderRadius-lg);
        --border-width: 1px;
        --color: var(--nxt1-color-text-primary);
        --placeholder-color: var(--nxt1-color-text-tertiary);
        --placeholder-opacity: 1;
        --padding-start: var(--nxt1-spacing-4);
        --padding-end: var(--nxt1-spacing-4);
        --padding-top: var(--nxt1-spacing-3-5);
        --padding-bottom: var(--nxt1-spacing-3-5);
        --highlight-color-focused: var(--nxt1-color-border-strong);
        --highlight-color-valid: var(--nxt1-color-border-strong);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        min-height: var(--nxt1-spacing-12);
        transition: all var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nxt1-input:hover:not(.has-focus) {
        --background: var(--nxt1-color-surface-200);
        --border-color: var(--nxt1-color-border-strong);
      }

      /* ============================================
         NATIVE TEXTAREA — resizable bio box
         ============================================ */
      .nxt1-native-textarea {
        display: block;
        width: 100%;
        min-height: var(--nxt1-spacing-20);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        line-height: var(--nxt1-lineHeight-normal);
        resize: vertical;
        outline: none;
        transition:
          border-color var(--nxt1-duration-fast) var(--nxt1-easing-out),
          background var(--nxt1-duration-fast) var(--nxt1-easing-out);
        -webkit-appearance: none;
      }

      .nxt1-native-textarea::placeholder {
        color: var(--nxt1-color-text-tertiary);
        opacity: 1;
      }

      .nxt1-native-textarea:hover {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-strong);
      }

      .nxt1-native-textarea:focus {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-surface-100);
      }

      /* ============================================
         ION-SELECT using nxt1-input class
         ============================================ */
      ion-select.nxt1-input {
        --background: var(--nxt1-color-surface-100);
        --border-color: var(--nxt1-color-border-default);
        --border-radius: var(--nxt1-borderRadius-lg);
        --color: var(--nxt1-color-text-primary);
        --placeholder-color: var(--nxt1-color-text-tertiary);
        --placeholder-opacity: 1;
        --padding-start: var(--nxt1-spacing-4);
        --padding-end: var(--nxt1-spacing-4);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        min-height: var(--nxt1-spacing-12);
        width: 100%;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-100);
        transition: all var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      ion-select.nxt1-input:hover:not(:disabled) {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-strong);
      }

      ion-select.nxt1-input::part(icon) {
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         POSITION CHIPS
         ============================================ */
      .nxt1-position-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
      }

      /* ============================================
         LOCATION SECTION — Matches onboarding
         ============================================ */
      .nxt1-location-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .nxt1-location-detect {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        padding: var(--nxt1-spacing-4);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast) var(--nxt1-easing-out);
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-location-detect:hover:not(:disabled):not(.has-location) {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
      }

      .nxt1-location-detect:disabled {
        opacity: 0.4;
        cursor: default;
      }

      .nxt1-location-detect.has-location {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        justify-content: flex-start;
      }

      .nxt1-location-detect.has-location:hover:not(:disabled) {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
      }

      .nxt1-location-icon {
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        flex-shrink: 0;
      }

      .nxt1-location-icon.check {
        color: var(--nxt1-color-text-onPrimary);
      }

      .nxt1-location-text {
        flex: 1;
        text-align: left;
      }

      .nxt1-location-edit {
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-4);
        color: var(--nxt1-color-text-onPrimary);
        opacity: 0.7;
      }

      .nxt1-location-spinner {
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        --color: var(--nxt1-color-primary);
      }

      /* ============================================
         ERROR STATE
         ============================================ */
      .nxt1-error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3);
        min-height: var(--nxt1-spacing-60);
        padding: var(--nxt1-spacing-6);
        text-align: center;
      }

      .nxt1-error-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
      }

      .nxt1-error-text {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .nxt1-retry-btn {
        appearance: none;
        -webkit-appearance: none;
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-full);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast) var(--nxt1-easing-out);
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-retry-btn:hover {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditProfileShellComponent implements OnInit {
  protected readonly profile = inject(EditProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('EditProfileShell');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly modalCtrl = inject(ModalController, { optional: true });

  private readonly geolocationService: GeolocationService = createGeolocationService(
    new BrowserGeolocationAdapter(),
    new CachedGeocodingAdapter(new NominatimGeocodingAdapter())
  );

  readonly close = output<void>();
  readonly save = output<void>();
  protected readonly isModalMode = !!this.modalCtrl;

  protected readonly imageInputRef = viewChild<ElementRef<HTMLInputElement>>('imageInput');
  protected readonly isDetectingLocation = signal(false);
  protected readonly maxGalleryImages = MAX_GALLERY_IMAGES;
  protected readonly positionOptions = POSITION_OPTIONS;
  protected readonly heightOptions = HEIGHT_OPTIONS;
  protected readonly selectActionSheetOptions = { cssClass: 'nxt1-select-action-sheet' };

  protected readonly classOptions = computed(() => {
    const startYear = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, index) => String(startYear + index));
  });

  protected readonly carouselImages = computed<readonly string[]>(() => {
    const data = this.profile.formData();
    if (!data) return [];

    return (data.photos.profileImgs ?? []).filter((image): image is string => !!image);
  });

  protected readonly selectedPositions = computed<readonly string[]>(() => {
    const data = this.profile.formData();
    if (!data) return [];

    return [data.sportsInfo.primaryPosition, ...(data.sportsInfo.secondaryPositions ?? [])].filter(
      (value): value is string => !!value
    );
  });

  protected readonly canAddMoreImages = computed(
    () => this.carouselImages().length < MAX_GALLERY_IMAGES
  );

  ngOnInit(): void {
    if (!this.profile.formData() && !this.profile.isLoading()) {
      void this.loadProfile();
    }
  }

  protected async loadProfile(): Promise<void> {
    this.breadcrumb.trackStateChange('edit-profile:loading');
    await this.profile.loadProfile();
    this.breadcrumb.trackStateChange('edit-profile:loaded');
  }

  protected async onSave(): Promise<void> {
    this.breadcrumb.trackStateChange('edit-profile:saving');
    const didSave = await this.profile.saveChanges();
    if (didSave) {
      this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, { source: 'edit-profile-shell' });
      this.breadcrumb.trackStateChange('edit-profile:saved');
      if (this.isModalMode) {
        await this.modalCtrl!.dismiss({ saved: true }, 'save');
        return;
      }
      this.save.emit();
    }
  }

  protected onClose(): void {
    if (this.isModalMode) {
      void this.modalCtrl!.dismiss(null, 'cancel');
      return;
    }
    this.close.emit();
  }

  /** Handle ion-input changes for basic info fields */
  protected onIonInput(fieldId: 'firstName' | 'lastName', event: CustomEvent): void {
    this.profile.updateField('basic-info', fieldId, event.detail.value ?? '');
  }

  /** Handle native textarea input for bio */
  protected onBioInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement)?.value ?? '';
    this.profile.updateField('basic-info', 'bio', value);
  }

  /** Handle ion-input changes for sports fields */
  protected onIonSportsInput(fieldId: 'jerseyNumber', event: CustomEvent): void {
    this.profile.updateField('sports-info', fieldId, event.detail.value ?? '');
  }

  /** Handle ion-input changes for physical fields */
  protected onIonPhysicalInput(fieldId: 'weight', event: CustomEvent): void {
    this.profile.updateField('physical', fieldId, event.detail.value ?? '');
  }

  /** Handle ion-select changes */
  protected onSelectChange(fieldId: 'classYear' | 'height', event: CustomEvent): void {
    const value = event.detail.value ?? '';
    if (fieldId === 'height') {
      this.profile.updateField('physical', 'height', value);
    } else {
      this.profile.updateField('basic-info', fieldId, value);
    }
  }

  protected isPositionSelected(position: string): boolean {
    return this.selectedPositions().includes(position);
  }

  protected togglePosition(position: string): void {
    const current = [...this.selectedPositions()];
    const next = current.includes(position)
      ? current.filter((value) => value !== position)
      : [...current, position];

    this.profile.updateField('sports-info', 'primaryPosition', next[0] ?? '');
    this.profile.updateField('sports-info', 'secondaryPositions', next.slice(1));
  }

  protected openImagePicker(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.toast.warning('Image selection is only available in the app runtime.');
      return;
    }

    this.imageInputRef()?.nativeElement.click();
  }

  protected async onImageFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (files.length === 0) return;

    const availableSlots = MAX_GALLERY_IMAGES - this.carouselImages().length;
    if (availableSlots <= 0) {
      this.toast.warning(`You can add up to ${MAX_GALLERY_IMAGES} profile images.`);
      if (input) input.value = '';
      return;
    }

    const selectedFiles = files.slice(0, availableSlots);
    const validImages: string[] = [];

    for (const file of selectedFiles) {
      if (!file.type.startsWith('image/')) {
        this.toast.warning(`${file.name} is not a supported image file.`);
        continue;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        this.toast.warning(`${file.name} is larger than 5MB.`);
        continue;
      }

      try {
        validImages.push(await this.readFileAsDataUrl(file));
      } catch (error) {
        this.logger.error('Failed to read profile image', error, { fileName: file.name });
        this.toast.error(`Could not load ${file.name}.`);
      }
    }

    if (validImages.length > 0) {
      this.profile.updatePhotoGallery([...this.carouselImages(), ...validImages]);
    }

    if (files.length > availableSlots) {
      this.toast.warning(`Only ${MAX_GALLERY_IMAGES} images can be used.`);
    }

    if (input) {
      input.value = '';
    }
  }

  protected removeImage(index: number): void {
    const nextImages = this.carouselImages().filter((_, imageIndex) => imageIndex !== index);
    this.profile.updatePhotoGallery(nextImages);
  }

  protected async detectLocation(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.geolocationService.isSupported()) {
      this.toast.warning('Location detection is not available on this device.');
      return;
    }

    this.isDetectingLocation.set(true);

    try {
      const result = await this.geolocationService.getCurrentLocation(GEOLOCATION_DEFAULTS.QUICK);

      if (!result.success) {
        const errorMessage = 'error' in result ? result.error.message : '';
        this.toast.warning(errorMessage || 'Unable to detect your location.');
        return;
      }

      const address = result.data.address;
      const location = address ? formatLocationShort(address) : '';

      if (!location) {
        this.toast.warning('Location detected, but no city/state could be resolved.');
        return;
      }

      this.profile.updateField('basic-info', 'location', location);
      this.breadcrumb.trackStateChange('edit-profile:location-detected');
      this.toast.success('Location updated.');
    } catch (error) {
      this.logger.error('Location detection failed', error);
      this.toast.error('Failed to detect location.');
    } finally {
      this.isDetectingLocation.set(false);
    }
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }

        reject(new Error('Image preview could not be created.'));
      };

      reader.onerror = () => reject(reader.error ?? new Error('File read failed.'));
      reader.readAsDataURL(file);
    });
  }
}

function buildHeightOptions(): string[] {
  const options: string[] = [];

  for (let feet = 4; feet <= 7; feet += 1) {
    for (let inches = 0; inches < 12; inches += 1) {
      if (feet === 4 && inches < 8) continue;
      if (feet === 7 && inches > 2) continue;
      options.push(`${feet}'${inches}"`);
    }
  }

  return options;
}
