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
  Input,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AlertController, IonSpinner, ModalController } from '@ionic/angular/standalone';
import { NxtModalService } from '../services/modal';
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
import { NxtIconComponent, type IconName } from '../components/icon';
import { NxtMediaGalleryComponent } from '../components/media-gallery';
import { NxtListSectionComponent } from '../components/list-section';
import { NxtListRowComponent } from '../components/list-row';
import {
  ConnectedAccountsModalService,
  type ConnectedSource,
} from '../components/connected-sources';
import {
  PLATFORM_REGISTRY,
  PLATFORM_CATEGORIES,
  getPlatformFaviconUrl,
  getRecommendedPlatforms,
  type LinkSourcesFormData,
} from '@nxt1/core/api';
import { NxtBottomSheetService } from '../components/bottom-sheet';

import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import {
  getPositionGroupsForSport,
  TEAM_TYPE_CONFIGS,
  titleCase,
  type InboxEmailProvider,
} from '@nxt1/core';
import { formatPositionDisplay } from '@nxt1/core/constants';
import { NxtSearchBarComponent } from '../components/search-bar';
import { HapticButtonDirective } from '../services/haptics';
import type { SearchTeamsFn, TeamSearchResult } from '../onboarding';

const MAX_GALLERY_IMAGES = 8;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const HEIGHT_OPTIONS = buildHeightOptions();

/** Debounce time for program search input (ms) */
const PROGRAM_SEARCH_DEBOUNCE_MS = 300;

/** Minimum query length to trigger program search */
const PROGRAM_MIN_QUERY_LENGTH = 2;

type DraftProgramType =
  | 'high-school'
  | 'middle-school'
  | 'club'
  | 'college'
  | 'juco'
  | 'organization';

interface ProgramTypeOption {
  readonly value: DraftProgramType;
  readonly label: string;
}

const DRAFT_PROGRAM_TYPE_OPTIONS: readonly ProgramTypeOption[] = [
  { value: 'high-school', label: 'High School' },
  { value: 'middle-school', label: 'Middle School' },
  { value: 'club', label: 'Club / Travel' },
  { value: 'college', label: 'College' },
  { value: 'juco', label: 'JUCO' },
  { value: 'organization', label: 'Organization' },
];

/** Matches trailing sport names so they can be stripped from draft program names */
const TRAILING_SPORT_WORD_PATTERN =
  /\s+(football|basketball|baseball|softball|soccer|volleyball|lacrosse|wrestling|track|cross\s*country|swim(?:ming)?|tennis|golf|hockey)\s*$/i;

/** Suffix patterns per program type — stripped before title-casing */
const PROGRAM_TYPE_SUFFIX_PATTERNS: Readonly<Record<DraftProgramType, readonly RegExp[]>> = {
  'high-school': [/\s+high\s+school\s*$/i, /\s+hs\s*$/i],
  'middle-school': [/\s+middle\s+school\s*$/i, /\s+ms\s*$/i],
  club: [/\s+club\s*$/i, /\s+travel\s*$/i],
  college: [/\s+community\s+college\s*$/i, /\s+college\s*$/i, /\s+university\s*$/i],
  juco: [/\s+junior\s+college\s*$/i, /\s+juco\s*$/i],
  organization: [],
};

@Component({
  selector: 'nxt1-edit-profile-shell',
  standalone: true,
  imports: [
    IonSpinner,
    EditProfileSkeletonComponent,
    NxtSheetHeaderComponent,
    NxtIconComponent,
    NxtMediaGalleryComponent,
    NxtListSectionComponent,
    NxtListRowComponent,
    NxtSearchBarComponent,
    HapticButtonDirective,
  ],
  template: `
    @if (!headless) {
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
    }

    <div class="nxt1-edit-content">
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
          <input
            #imageInput
            type="file"
            class="nxt1-hidden"
            accept="image/*"
            multiple
            (change)="onImageFilesSelected($event)"
          />
          <nxt1-media-gallery
            [images]="carouselImages()"
            [maxImages]="maxGalleryImages"
            (add)="openImagePicker()"
            (remove)="removeImage($event)"
          />

          <!-- Connected Accounts -->
          <nxt1-list-section header="Connected accounts">
            <nxt1-list-row label="Accounts" (tap)="openConnectedAccounts()">
              <span
                class="nxt1-list-value"
                [class.nxt1-list-placeholder]="connectedCount() === 0"
                >{{
                  connectedCount() > 0 ? connectedCount() + ' connected' : 'Connect accounts'
                }}</span
              >
            </nxt1-list-row>
          </nxt1-list-section>

          <!-- Two-column layout: About you (left) | Sports info + Physical (right) -->
          <div [class.nxt1-ep-two-col]="webLayout">
            <!-- About you -->
            <nxt1-list-section header="About you">
              <nxt1-list-row
                label="Name"
                [verified]="verifiedFields().has('name')"
                (tap)="editName()"
              >
                <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!displayName()">{{
                  displayName() || 'Add your name'
                }}</span>
              </nxt1-list-row>
              <nxt1-list-row
                label="Class"
                [verified]="verifiedFields().has('class')"
                (tap)="editClassYear()"
              >
                <span
                  class="nxt1-list-value"
                  [class.nxt1-list-placeholder]="!form.basicInfo.classYear"
                  >{{ form.basicInfo.classYear || 'Select class year' }}</span
                >
              </nxt1-list-row>
              <nxt1-list-row label="Bio" (tap)="editBio()">
                <span
                  class="nxt1-list-value nxt1-list-bio"
                  [class.nxt1-list-placeholder]="!form.basicInfo.bio"
                  >{{ form.basicInfo.bio || 'Tell coaches about yourself' }}</span
                >
              </nxt1-list-row>
              <nxt1-list-row label="Location" (tap)="editLocation()">
                @if (isDetectingLocation()) {
                  <ion-spinner name="crescent" class="nxt1-row-spinner" />
                } @else {
                  <span
                    class="nxt1-list-value"
                    [class.nxt1-list-placeholder]="!form.basicInfo.location"
                    >{{ form.basicInfo.location || 'Detect your location' }}</span
                  >
                }
              </nxt1-list-row>
              <nxt1-list-row label="Phone" (tap)="editPhone()">
                <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!form.contact.phone">{{
                  form.contact.phone || 'Add phone number'
                }}</span>
              </nxt1-list-row>
              <nxt1-list-row label="Email" (tap)="editEmail()">
                <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!form.contact.email">{{
                  form.contact.email || 'Add email'
                }}</span>
              </nxt1-list-row>
            </nxt1-list-section>

            <!-- Right column: Sports info + Physical -->
            <div [class.nxt1-ep-right-col]="webLayout">
              <!-- Sports info -->
              <nxt1-list-section header="Sports info">
                <nxt1-list-row
                  label="Position"
                  [verified]="verifiedFields().has('position')"
                  (tap)="editPosition()"
                >
                  <span
                    class="nxt1-list-value capitalize"
                    [class.nxt1-list-placeholder]="selectedPositions().length === 0"
                    >{{ positionDisplay() || 'Select position' }}</span
                  >
                </nxt1-list-row>
                <nxt1-list-row label="Jersey" (tap)="editJersey()">
                  <span
                    class="nxt1-list-value"
                    [class.nxt1-list-placeholder]="!form.sportsInfo.jerseyNumber"
                    >{{ form.sportsInfo.jerseyNumber || 'Add jersey number' }}</span
                  >
                </nxt1-list-row>
                <nxt1-list-row label="Program" (tap)="toggleProgramSearch()">
                  <span
                    class="nxt1-list-value"
                    [class.nxt1-list-placeholder]="!form.sportsInfo.teamName"
                    >{{ programDisplay() || 'Add your program' }}</span
                  >
                </nxt1-list-row>

                <!-- Inline Program Search (expanded) -->
                @if (isProgramExpanded()) {
                  <div class="nxt1-program-search-section">
                    <!-- Currently selected team -->
                    @if (form.sportsInfo.teamName) {
                      <div class="nxt1-program-selected">
                        @if (form.sportsInfo.teamLogoUrl) {
                          <img
                            [src]="form.sportsInfo.teamLogoUrl"
                            [alt]="form.sportsInfo.teamName"
                            class="nxt1-program-logo"
                            loading="lazy"
                          />
                        } @else {
                          <div class="nxt1-program-logo-placeholder">
                            {{ getTeamInitial(form.sportsInfo.teamName) }}
                          </div>
                        }
                        <div class="nxt1-program-selected-info">
                          <span class="nxt1-program-selected-name">{{
                            form.sportsInfo.teamName
                          }}</span>
                          @if (form.sportsInfo.teamType) {
                            <span class="nxt1-team-type-badge">{{
                              formatTeamType(form.sportsInfo.teamType)
                            }}</span>
                          }
                        </div>
                        <button
                          type="button"
                          class="nxt1-program-remove-btn"
                          nxtHaptic="light"
                          (click)="clearTeam()"
                          aria-label="Remove program"
                        >
                          <nxt1-icon name="close" [size]="14" />
                        </button>
                      </div>
                    }

                    <!-- Search bar -->
                    <div class="nxt1-program-search-wrapper">
                      <nxt1-search-bar
                        variant="mobile"
                        [expanded]="true"
                        placeholder="Search for your program..."
                        [value]="programSearchQuery()"
                        (searchInput)="onProgramSearchInput($event)"
                        (searchClear)="onProgramSearchClear()"
                      />
                    </div>

                    <!-- Search loading -->
                    @if (isProgramSearching()) {
                      <div class="nxt1-program-search-loading">
                        <div class="nxt1-program-spinner"></div>
                        <span class="nxt1-program-search-loading-text">Searching programs...</span>
                      </div>
                    } @else if (programSearchResults().length > 0) {
                      <!-- Search results -->
                      <div class="nxt1-program-results">
                        @for (team of programSearchResults(); track team.id) {
                          <button
                            type="button"
                            class="nxt1-program-result-row"
                            nxtHaptic="selection"
                            (click)="selectTeam(team)"
                          >
                            @if (team.logoUrl) {
                              <img
                                [src]="team.logoUrl"
                                [alt]="team.name"
                                class="nxt1-program-logo"
                                loading="lazy"
                              />
                            } @else {
                              <div
                                class="nxt1-program-logo-placeholder"
                                [style.background]="
                                  team.colors?.[0] ?? 'var(--nxt1-color-surface-200)'
                                "
                              >
                                {{ getTeamInitial(team.name) }}
                              </div>
                            }
                            <div class="nxt1-program-result-copy">
                              <span class="nxt1-program-result-name">{{ team.name }}</span>
                              @if (team.isDraft) {
                                <span class="nxt1-program-result-location nxt1-draft-badge"
                                  >New Program</span
                                >
                              } @else if (team.location) {
                                <span class="nxt1-program-result-location">{{
                                  team.location
                                }}</span>
                              } @else if (team.sport) {
                                <span class="nxt1-program-result-location">{{ team.sport }}</span>
                              }
                              @if (team.teamType && team.teamType !== 'organization') {
                                <span class="nxt1-team-type-badge">{{
                                  formatTeamType(team.teamType)
                                }}</span>
                              }
                            </div>
                            <nxt1-icon name="chevronForward" [size]="14" />
                          </button>
                        }
                      </div>
                    } @else if (hasProgramSearched()) {
                      <!-- No results + draft creation -->
                      <div class="nxt1-program-no-results">
                        <p class="nxt1-program-no-results-text">No programs found</p>
                        @if (programSearchQuery().trim().length >= 2) {
                          <div class="nxt1-program-draft-controls">
                            <p class="nxt1-program-draft-label">
                              Select program type to add "{{ programSearchQuery().trim() }}":
                            </p>
                            <div class="nxt1-program-draft-chips">
                              @for (option of draftProgramTypeOptions; track option.value) {
                                <button
                                  type="button"
                                  class="nxt1-program-draft-chip"
                                  nxtHaptic="light"
                                  (click)="
                                    addDraftProgram(programSearchQuery().trim(), option.value)
                                  "
                                >
                                  {{ option.label }}
                                </button>
                              }
                            </div>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              </nxt1-list-section>

              <!-- Physical -->
              <nxt1-list-section header="Physical">
                <nxt1-list-row
                  label="Height"
                  [verified]="verifiedFields().has('height')"
                  (tap)="editHeight()"
                >
                  <span
                    class="nxt1-list-value"
                    [class.nxt1-list-placeholder]="!form.physical.height"
                    >{{ form.physical.height || 'Select height' }}</span
                  >
                </nxt1-list-row>
                <nxt1-list-row label="Weight" (tap)="editWeight()">
                  <span
                    class="nxt1-list-value"
                    [class.nxt1-list-placeholder]="!form.physical.weight"
                    >{{ form.physical.weight ? form.physical.weight + ' lbs' : 'Add weight' }}</span
                  >
                </nxt1-list-row>
              </nxt1-list-section>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background: var(--nxt1-color-bg-primary);
        color: var(--nxt1-color-text-primary);
      }

      /* ============================================
         SHELL CONTAINER
         ============================================ */

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
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }

      .nxt1-edit-body {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-4)
          calc(var(--nxt1-spacing-8) + env(safe-area-inset-bottom, 0px));
      }

      /* ============================================
         UTILITIES
         ============================================ */
      .nxt1-hidden {
        display: none;
      }

      /* ============================================
         LIST ROW VALUES (content-projected into nxt1-list-row)
         ============================================ */
      .nxt1-list-value {
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-regular);
        color: var(--nxt1-color-text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: right;
      }

      .nxt1-list-bio {
        max-width: 180px;
      }

      .nxt1-list-placeholder {
        color: var(--nxt1-color-text-tertiary);
      }

      .nxt1-row-spinner {
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-4);
        --color: var(--nxt1-color-text-tertiary);
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

      /* ============================================
         INLINE PROGRAM SEARCH
         ============================================ */
      .nxt1-program-search-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4) var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .nxt1-program-search-wrapper {
        width: 100%;
      }

      /* Selected team row */
      .nxt1-program-selected {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        border: 1px solid var(--nxt1-color-primary);
        border-radius: var(--nxt1-borderRadius-lg);
      }

      .nxt1-program-selected-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }

      .nxt1-program-selected-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nxt1-program-remove-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-200);
        border: none;
        color: var(--nxt1-color-text-tertiary);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast);
        padding: 0;
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-program-remove-btn:hover {
        background: var(--nxt1-color-error, #ff4d4f);
        color: #ffffff;
      }

      /* Shared logo styles */
      .nxt1-program-logo {
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-borderRadius-sm);
        object-fit: cover;
        flex-shrink: 0;
      }

      .nxt1-program-logo-placeholder {
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-borderRadius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-200);
        flex-shrink: 0;
      }

      /* Search loading */
      .nxt1-program-search-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
      }

      .nxt1-program-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid var(--nxt1-color-border-default);
        border-top-color: var(--nxt1-color-primary);
        border-radius: 50%;
        animation: nxt1-spin 0.6s linear infinite;
      }

      @keyframes nxt1-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .nxt1-program-search-loading-text {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
      }

      /* Search results */
      .nxt1-program-results {
        display: flex;
        flex-direction: column;
        max-height: 240px;
        overflow-y: auto;
      }

      .nxt1-program-result-row {
        appearance: none;
        -webkit-appearance: none;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        border: none;
        background: transparent;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-1);
        text-align: left;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        transition: background var(--nxt1-duration-fast);
      }

      .nxt1-program-result-row:last-child {
        border-bottom: none;
      }

      .nxt1-program-result-row:active {
        background: var(--nxt1-color-surface-200);
      }

      .nxt1-program-result-row nxt1-icon {
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
        margin-left: auto;
      }

      .nxt1-program-result-copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }

      .nxt1-program-result-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nxt1-program-result-location {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nxt1-team-type-badge {
        display: inline-block;
        padding: 1px 6px;
        font-size: 10px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-full);
        width: fit-content;
        margin-top: 2px;
      }

      .nxt1-draft-badge {
        color: var(--nxt1-color-warning, #ffaa00) !important;
      }

      /* No results + draft creation */
      .nxt1-program-no-results {
        text-align: center;
        padding: var(--nxt1-spacing-4);
      }

      .nxt1-program-no-results-text {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .nxt1-program-draft-controls {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        margin-top: var(--nxt1-spacing-4);
      }

      .nxt1-program-draft-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        text-align: center;
        width: 100%;
      }

      .nxt1-program-draft-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
        justify-content: center;
        margin-top: var(--nxt1-spacing-2);
        width: 100%;
      }

      .nxt1-program-draft-chip {
        display: inline-flex;
        align-items: center;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-full);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast);
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-program-draft-chip:hover {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-primary);
      }

      .nxt1-program-draft-chip:active {
        transform: scale(0.97);
      }

      /* ============================================
         2-COLUMN SECTION LAYOUT (web modal, webLayout=true)
         ============================================ */

      /* Grid wrapper: About you (left col) + right col (Sports info + Physical stacked) */
      .nxt1-ep-two-col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-5);
        align-items: start;
      }

      /* Right column stacks Sports info above Physical with breathing room */
      .nxt1-ep-right-col {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditProfileShellComponent implements OnInit, OnDestroy {
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

  /**
   * When true, the shell renders no header at all.
   * The parent component (e.g. EditProfileWebModalComponent using NxtModalHeaderComponent)
   * is responsible for providing the header chrome.
   * Default false — shell renders its own header (standalone mode or sheet mode).
   */
  @Input() headless = false;

  /**
   * When true, the shell renders its list sections in a 2-column grid layout.
   * Intended for use in wide web modals where horizontal space is available.
   * Default false — single-column layout (mobile default).
   */
  @Input() webLayout = false;

  /** User ID to load/edit - passed from parent component via Ionic componentProps */
  @Input() userId?: string;

  /** Sport index to load - defaults to activeSportIndex if not provided */
  @Input() sportIndex?: number;

  /** Optional callback for direct provider connection (bypasses modal dismiss chain) */
  @Input() connectProviderCallback?: (provider: InboxEmailProvider) => void;

  /** Team/program search callback — provided by parent (platform-specific) */
  @Input() searchTeams?: SearchTeamsFn;

  protected readonly imageInputRef = viewChild<ElementRef<HTMLInputElement>>('imageInput');
  private readonly nxtModal = inject(NxtModalService);
  private readonly alertCtrl = inject(AlertController);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly connectedAccountsModal = inject(ConnectedAccountsModalService);

  protected readonly isDetectingLocation = signal(false);
  protected readonly maxGalleryImages = MAX_GALLERY_IMAGES;

  // Inline program search state
  protected readonly isProgramExpanded = signal(false);
  protected readonly programSearchQuery = signal('');
  protected readonly programSearchResults = signal<readonly TeamSearchResult[]>([]);
  protected readonly isProgramSearching = signal(false);
  protected readonly hasProgramSearched = signal(false);
  protected readonly draftProgramTypeOptions = DRAFT_PROGRAM_TYPE_OPTIONS;
  private programSearchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Track formData changes for debugging
    effect(() => {
      const data = this.profile.formData();
      const activeSportIndex = this.profile.activeSportIndex();
      const allSports = this.profile.allSports();

      this.logger.info('📊 [Edit Profile] FormData changed', {
        hasData: !!data,
        sport: data?.sportsInfo?.sport,
        jerseyNumber: data?.sportsInfo?.jerseyNumber,
        primaryPosition: data?.sportsInfo?.primaryPosition,
        secondaryPositions: data?.sportsInfo?.secondaryPositions,
        activeSportIndex,
        allSportsCount: allSports?.length,
        allSportsData: allSports?.map((s: any, i: number) => ({
          index: i,
          sport: s.sport,
          jerseyNumber: s.jerseyNumber,
          positions: s.positions,
        })),
      });
    });
  }

  /**
   * Position options for the selected sport.
   * Dynamically computed based on the primary sport in the form data.
   */
  protected readonly positionOptions = computed<readonly string[]>(() => {
    const data = this.profile.formData();
    const activeSportIndex = this.profile.activeSportIndex();
    const allSports = this.profile.allSports();

    // Try to get sport from formData first (when loaded)
    let sport = data?.sportsInfo?.sport;

    // Fallback: Get sport from rawUserData if formData not ready yet
    if (!sport && allSports && allSports[activeSportIndex]) {
      sport = allSports[activeSportIndex].sport;
    }

    this.logger.info('🔍 Computing position options', {
      hasData: !!data,
      rawSport: sport,
      activeSportIndex,
      totalSports: allSports?.length,
      allSportsNames: allSports?.map((s: any) => s.sport),
      jerseyNumber: data?.sportsInfo?.jerseyNumber,
      primaryPosition: data?.sportsInfo?.primaryPosition,
      sportsInfoFull: data?.sportsInfo,
      fallbackSport: !data ? allSports?.[activeSportIndex]?.sport : null,
    });

    // Fallback to Football if no sport is set (temporary for debugging)
    const sportToUse = sport || 'Football';

    if (!sport) {
      this.logger.warn('⚠️ No sport found - defaulting to Football', {
        hasFormData: !!data,
        hasRawUser: !!allSports?.length,
        activeSportIndex,
      });
    }

    const positionGroups = getPositionGroupsForSport(sportToUse);
    const positions = positionGroups.flatMap((group) => group.positions);

    this.logger.info('✅ Position groups loaded', {
      rawSport: sport,
      sportToUse,
      normalizedSport: sportToUse.toLowerCase().replace(/\s+/g, '_'),
      groupCount: positionGroups.length,
      totalPositions: positions.length,
      firstFewPositions: positions.slice(0, 5),
      allGroups: positionGroups.map((g) => ({
        category: g.category,
        count: g.positions.length,
      })),
    });

    if (positions.length === 0) {
      this.logger.error('❌ No positions found for sport', {
        sport,
        sportToUse,
        positionGroups,
      });
    }

    return positions;
  });

  /** Mock verified fields — will be replaced with backend verification status */
  protected readonly verifiedFields = signal<ReadonlySet<string>>(
    new Set(['name', 'class', 'position', 'height'])
  );
  protected readonly heightOptions = HEIGHT_OPTIONS;

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

  protected readonly displayName = computed(() => {
    const data = this.profile.formData();
    if (!data) return '';
    return [data.basicInfo.firstName, data.basicInfo.lastName].filter(Boolean).join(' ');
  });

  protected readonly positionDisplay = computed(() => {
    const positions = this.selectedPositions();
    return positions.length > 0 ? positions.join(', ') : '';
  });

  protected readonly programDisplay = computed(() => {
    const data = this.profile.formData();
    if (!data?.sportsInfo?.teamName) return '';

    const teamName = data.sportsInfo.teamName;
    const teamType = data.sportsInfo.teamType;

    if (teamType) {
      const config = TEAM_TYPE_CONFIGS.find((c) => c.id === teamType);
      if (config) return `${teamName} (${config.shortLabel})`;
    }

    return teamName;
  });

  protected readonly connectedSources = computed<readonly ConnectedSource[]>(() => {
    const data = this.profile.formData();
    const links = data?.socialLinks?.links ?? [];

    // Use PLATFORM_REGISTRY to show all available platforms (global scope)
    const globalPlatforms = PLATFORM_REGISTRY.filter((p) => p.scope === 'global');

    return globalPlatforms.map((platform) => {
      const match = links.find((l) => l.platform === platform.platform);
      if (match?.url) {
        return {
          platform: platform.platform,
          label: platform.label,
          icon: platform.icon as IconName,
          connected: true,
          username: match.username,
          url: match.url,
          connectionType: platform.connectionType,
          faviconUrl: getPlatformFaviconUrl(platform.platform) ?? undefined,
        };
      }
      return {
        platform: platform.platform,
        label: platform.label,
        icon: platform.icon as IconName,
        connected: false,
        connectionType: platform.connectionType,
        faviconUrl: getPlatformFaviconUrl(platform.platform) ?? undefined,
      };
    });
  });

  /** Build platform groups similar to onboarding: Recommended + Categories */
  protected readonly platformGroups = computed<
    readonly { key: string; label: string; sources: readonly ConnectedSource[] }[]
  >(() => {
    const data = this.profile.formData();
    const rawUser = this.profile.rawUserData();
    const links = data?.socialLinks?.links ?? [];
    const sport = data?.sportsInfo?.sport;
    const userType = rawUser?.userType; // 'athlete' | 'coach' | 'director' | 'fan'

    // Normalize sport display name → key (e.g. "Football Mens" → "football")
    const sportKey = sport
      ? sport
          .toLowerCase()
          .replace(/\s*(mens|womens)$/i, '')
          .trim()
          .replace(/\s*&\s*/g, '_')
          .replace(/\s+/g, '_')
      : null;

    const groups: { key: string; label: string; sources: ConnectedSource[] }[] = [];

    // ---- 1. Collect all platforms (global link + sport-scoped link) ----
    const globalLinkPlatforms = PLATFORM_REGISTRY.filter(
      (p) => p.scope === 'global' && p.connectionType === 'link'
    );
    const sportPlatforms = sportKey
      ? PLATFORM_REGISTRY.filter((p) => {
          if (p.scope !== 'sport' || p.connectionType !== 'link') return false;
          if (p.sports.length === 0) return true;
          return p.sports.some((ps) => sportKey.startsWith(ps) || ps.startsWith(sportKey));
        })
      : [];

    const linkPlatforms = [...globalLinkPlatforms, ...sportPlatforms];

    // Helper to convert platform to ConnectedSource (handles scoped link lookup)
    const toSource = (platform: (typeof PLATFORM_REGISTRY)[0]): ConnectedSource => {
      const match = links.find((l) => {
        if (l.platform !== platform.platform) return false;
        if (platform.scope === 'sport') {
          return l.scopeType === 'sport' && l.scopeId === sportKey;
        }
        return !l.scopeType || l.scopeType === 'global';
      });
      return {
        platform: platform.platform,
        label: platform.label,
        icon: platform.icon as IconName,
        connected: !!match?.url,
        username: match?.username,
        url: match?.url,
        connectionType: platform.connectionType,
        scopeType: platform.scope,
        scopeId: platform.scope === 'sport' ? (sportKey ?? undefined) : undefined,
        faviconUrl: getPlatformFaviconUrl(platform.platform) ?? undefined,
      };
    };

    // ---- 2. Recommended group (if we have userType and sport) ----
    if (userType && sport) {
      const allIds = new Set(linkPlatforms.map((p) => p.platform));
      const recommended = getRecommendedPlatforms(userType, [sport], 'link');
      const filteredRecommended = recommended.filter((p) => allIds.has(p.platform));

      if (filteredRecommended.length > 0) {
        groups.push({
          key: 'recommended-link',
          label: 'Recommended',
          sources: filteredRecommended.map(toSource),
        });
      }
    }

    // ---- 3. Link platforms grouped by category ----
    for (const cat of PLATFORM_CATEGORIES) {
      const catPlatforms = linkPlatforms.filter((p) => p.category === cat.category);
      if (catPlatforms.length > 0) {
        groups.push({
          key: `${cat.category}-link`,
          label: cat.label,
          sources: catPlatforms.map(toSource),
        });
      }
    }

    return groups;
  });

  protected readonly connectedCount = computed(() => {
    const socialCount = (this.profile.formData()?.socialLinks?.links ?? []).filter(
      (l) => !!l.url || !!l.username
    ).length;
    const emailCount = (this.profile.rawUserData()?.connectedEmails ?? []).filter(
      (e: { isActive: boolean }) => e.isActive
    ).length;
    return socialCount + emailCount;
  });

  ngOnInit(): void {
    const currentSportIndex = this.profile.activeSportIndex();
    const requestedSportIndex = this.sportIndex ?? 0;

    // Always reload if sportIndex has changed, or if no data exists
    if (
      !this.profile.formData() ||
      (!this.profile.isLoading() && currentSportIndex !== requestedSportIndex)
    ) {
      this.logger.info('🔄 [Edit Profile Shell] Triggering profile reload', {
        reason: !this.profile.formData() ? 'no-data' : 'sport-index-changed',
        currentSportIndex,
        requestedSportIndex,
      });
      void this.loadProfile();
    } else {
      this.logger.info('🔄 [Edit Profile Shell] Skipping reload', {
        hasData: !!this.profile.formData(),
        isLoading: this.profile.isLoading(),
        currentSportIndex,
        requestedSportIndex,
      });
    }
  }

  protected async loadProfile(): Promise<void> {
    this.breadcrumb.trackStateChange('edit-profile:loading');
    const uid = this.userId; // Get userId from @Input property
    const sportIdx = this.sportIndex; // Get sportIndex from @Input property
    this.logger.debug('Loading profile', { userId: uid, sportIndex: sportIdx });
    await this.profile.loadProfile(uid, sportIdx); // Pass uid and sportIndex
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

  /**
   * Public entrypoint for parent wrappers (e.g. `EditProfileWebModalComponent`)
   * to trigger the save flow without needing access to the protected `onSave()`.
   * The shell handles the full lifecycle: API call → analytics → `save` output.
   */
  async requestSave(): Promise<void> {
    await this.onSave();
  }

  protected async onClose(): Promise<void> {
    if (this.isModalMode) {
      // If there are unsaved changes, confirm before dismissing
      if (this.profile.hasUnsavedChanges()) {
        const discard = await this.bottomSheet.confirm(
          'Discard Changes?',
          'You have unsaved changes that will be lost.',
          {
            confirmLabel: 'Discard',
            cancelLabel: 'Keep Editing',
            destructive: true,
            icon: 'alert-circle-outline',
          }
        );
        if (!discard) return;
      }
      void this.modalCtrl!.dismiss(null, 'cancel');
      return;
    }
    this.close.emit();
  }

  protected async openConnectedAccounts(): Promise<void> {
    const data = this.profile.formData();
    const rawUser = this.profile.rawUserData();

    // Convert existing social links → LinkSourcesFormData
    const existingLinks = data?.socialLinks?.links ?? [];
    const linkSourcesData: LinkSourcesFormData | null = existingLinks.length
      ? {
          links: existingLinks.map((l) => ({
            platform: l.platform,
            connected: !!(l.url || l.username),
            connectionType: 'link' as const,
            url: l.url,
            username: l.username,
            scopeType: l.scopeType ?? 'global',
            scopeId: l.scopeId,
          })),
        }
      : null;

    const sport = data?.sportsInfo?.sport;
    const selectedSports = sport ? [sport] : [];

    const result = await this.connectedAccountsModal.open({
      role: rawUser?.userType ?? null,
      selectedSports,
      linkSourcesData,
      scope: 'athlete',
    });

    if (result.saved && result.updatedLinks) {
      this.profile.updateField('social-links', 'links', result.updatedLinks);
      this.logger.info('Connected accounts updated', {
        count: result.updatedLinks.length,
      });
      this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, {
        source: 'connected-accounts-modal',
        action: 'bulk-update',
      });
    }
  }

  protected async editName(): Promise<void> {
    const form = this.profile.formData();
    if (!form) return;

    const first = await this.nxtModal.prompt({
      title: 'First Name',
      placeholder: 'First name',
      defaultValue: form.basicInfo.firstName ?? '',
      submitText: 'Next',
      preferNative: 'ionic',
    });
    if (!first.confirmed) return;
    this.profile.updateField('basic-info', 'firstName', first.value.trim());

    const last = await this.nxtModal.prompt({
      title: 'Last Name',
      placeholder: 'Last name',
      defaultValue: form.basicInfo.lastName ?? '',
      submitText: 'Done',
      preferNative: 'ionic',
    });
    if (last.confirmed) {
      this.profile.updateField('basic-info', 'lastName', last.value.trim());
    }
  }

  protected async editBio(): Promise<void> {
    const form = this.profile.formData();
    if (!form) return;

    const result = await this.nxtModal.prompt({
      title: 'Bio',
      placeholder: 'Tell coaches about yourself',
      defaultValue: form.basicInfo.bio ?? '',
      submitText: 'Done',
      multiline: true,
      rows: 5,
      maxLength: 300,
      preferNative: 'ionic',
    });
    if (result.confirmed) {
      this.profile.updateField('basic-info', 'bio', result.value.trim());
    }
  }

  protected async editClassYear(): Promise<void> {
    const form = this.profile.formData();
    if (!form) return;

    const result = await this.nxtModal.actionSheet({
      title: 'Class Year',
      actions: [
        ...this.classOptions().map((year) => ({ text: year, data: year })),
        { text: 'Cancel', cancel: true },
      ],
      preferNative: 'ionic',
    });
    if (result.selected && result.data) {
      this.profile.updateField('basic-info', 'classYear', result.data as string);
    }
  }

  protected async editJersey(): Promise<void> {
    const form = this.profile.formData();
    if (!form) return;

    const result = await this.nxtModal.prompt({
      title: 'Jersey Number',
      placeholder: 'Jersey number',
      defaultValue: form.sportsInfo.jerseyNumber ?? '',
      inputType: 'number',
      submitText: 'Done',
      preferNative: 'ionic',
    });
    if (result.confirmed) {
      this.profile.updateField('sports-info', 'jerseyNumber', result.value.trim());
    }
  }

  // ============================================
  // INLINE PROGRAM SEARCH
  // ============================================

  protected toggleProgramSearch(): void {
    this.isProgramExpanded.update((v) => !v);
    if (!this.isProgramExpanded()) {
      this.resetProgramSearch();
    }
    this.breadcrumb.trackUserAction('edit-program-toggle', { expanded: this.isProgramExpanded() });
  }

  protected onProgramSearchInput(query: string): void {
    this.programSearchQuery.set(query);

    if (this.programSearchTimer !== null) {
      clearTimeout(this.programSearchTimer);
    }

    const trimmed = query.trim();
    if (trimmed.length < PROGRAM_MIN_QUERY_LENGTH) {
      this.programSearchResults.set([]);
      this.isProgramSearching.set(false);
      return;
    }

    this.isProgramSearching.set(true);
    this.programSearchTimer = setTimeout(() => {
      void this.executeProgramSearch(trimmed);
    }, PROGRAM_SEARCH_DEBOUNCE_MS);
  }

  protected onProgramSearchClear(): void {
    this.resetProgramSearch();
  }

  protected selectTeam(team: TeamSearchResult): void {
    this.profile.updateField('sports-info', 'teamName', team.name);
    this.profile.updateField('sports-info', 'teamType', team.teamType ?? '');
    this.profile.updateField('sports-info', 'teamLogoUrl', team.logoUrl ?? '');
    this.profile.updateField('sports-info', 'teamOrganizationId', team.organizationId ?? '');

    // Keep academics.school in sync
    this.profile.updateField('academics', 'school', team.name);

    this.logger.info('Program selected', {
      teamName: team.name,
      teamType: team.teamType,
      isDraft: team.isDraft,
    });
    this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, {
      source: 'edit-profile-program',
      field: 'program',
      teamType: team.teamType,
    });

    // Collapse and reset search
    this.isProgramExpanded.set(false);
    this.resetProgramSearch();
  }

  protected clearTeam(): void {
    this.profile.updateField('sports-info', 'teamName', '');
    this.profile.updateField('sports-info', 'teamType', '');
    this.profile.updateField('sports-info', 'teamLogoUrl', '');
    this.profile.updateField('sports-info', 'teamOrganizationId', '');
    this.profile.updateField('academics', 'school', '');

    this.logger.info('Program cleared');
    this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, {
      source: 'edit-profile-program',
      field: 'program',
      action: 'clear',
    });
  }

  protected addDraftProgram(name: string, programType: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;

    const normalizedType = programType as DraftProgramType;
    const normalizedName = this.normalizeDraftProgramName(trimmed, normalizedType);

    this.profile.updateField('sports-info', 'teamName', normalizedName);
    this.profile.updateField('sports-info', 'teamType', programType);
    this.profile.updateField('sports-info', 'teamLogoUrl', '');
    this.profile.updateField('sports-info', 'teamOrganizationId', '');
    this.profile.updateField('academics', 'school', normalizedName);

    this.logger.info('Draft program added', {
      name: normalizedName,
      requestedName: trimmed,
      teamType: programType,
    });
    this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, {
      source: 'edit-profile-program',
      field: 'program',
      teamType: programType,
      isDraft: true,
    });

    this.isProgramExpanded.set(false);
    this.resetProgramSearch();
  }

  /**
   * Normalize draft program name — matches onboarding logic exactly:
   * 1. Consolidate whitespace
   * 2. Strip trailing sport words ("football", "basketball", etc.)
   * 3. Strip program-type suffixes ("high school", "hs", "college", etc.)
   * 4. Apply proper title casing
   */
  private normalizeDraftProgramName(name: string, programType: DraftProgramType): string {
    let normalized = name.trim().replace(/\s+/g, ' ');

    normalized = normalized.replace(TRAILING_SPORT_WORD_PATTERN, '').trim();

    for (const pattern of PROGRAM_TYPE_SUFFIX_PATTERNS[programType]) {
      normalized = normalized.replace(pattern, '').trim();
    }

    // Apply proper title casing (shared @nxt1/core utility)
    normalized = titleCase(normalized || name.trim());

    return normalized;
  }

  protected getTeamInitial(name: string | undefined): string {
    return (name?.trim().charAt(0) || '?').toUpperCase();
  }

  protected formatTeamType(teamType?: string): string {
    if (!teamType) return '';
    return teamType
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private async executeProgramSearch(query: string): Promise<void> {
    const searchFn = this.searchTeams;
    if (!searchFn) {
      this.logger.warn('No searchTeams function provided');
      this.isProgramSearching.set(false);
      return;
    }

    try {
      this.logger.info('Searching programs', { query });
      const results = await searchFn(query);
      this.programSearchResults.set(results);
      this.hasProgramSearched.set(true);
      this.logger.info('Program search complete', { query, count: results.length });
    } catch (err) {
      this.logger.error('Program search failed', err, { query });
      this.programSearchResults.set([]);
      this.hasProgramSearched.set(true);
      this.toast.error('Failed to search programs. Please try again.');
    } finally {
      this.isProgramSearching.set(false);
    }
  }

  private resetProgramSearch(): void {
    this.programSearchQuery.set('');
    this.programSearchResults.set([]);
    this.isProgramSearching.set(false);
    this.hasProgramSearched.set(false);
    if (this.programSearchTimer !== null) {
      clearTimeout(this.programSearchTimer);
      this.programSearchTimer = null;
    }
  }

  ngOnDestroy(): void {
    if (this.programSearchTimer !== null) {
      clearTimeout(this.programSearchTimer);
    }
    // Discard unsaved changes so the form is clean next time it opens
    if (this.profile.hasUnsavedChanges()) {
      void this.profile.discardChanges();
    }
  }

  protected async editHeight(): Promise<void> {
    const form = this.profile.formData();
    if (!form) return;

    const result = await this.nxtModal.actionSheet({
      title: 'Height',
      actions: [
        ...this.heightOptions.map((h) => ({ text: h, data: h })),
        { text: 'Cancel', cancel: true },
      ],
      preferNative: 'ionic',
    });
    if (result.selected && result.data) {
      this.profile.updateField('physical', 'height', result.data as string);
    }
  }

  protected async editWeight(): Promise<void> {
    const form = this.profile.formData();
    if (!form) return;

    const result = await this.nxtModal.prompt({
      title: 'Weight',
      placeholder: 'Weight (lbs)',
      defaultValue: form.physical.weight ?? '',
      inputType: 'number',
      submitText: 'Done',
      preferNative: 'ionic',
    });
    if (result.confirmed) {
      this.profile.updateField('physical', 'weight', result.value.trim());
    }
  }

  protected async editPhone(): Promise<void> {
    const form = this.profile.formData();
    if (!form) return;

    const result = await this.nxtModal.prompt({
      title: 'Phone Number',
      placeholder: '(555) 123-4567',
      defaultValue: form.contact.phone ?? '',
      inputType: 'tel',
      submitText: 'Done',
      preferNative: 'ionic',
    });
    if (result.confirmed) {
      this.profile.updateField('contact', 'phone', result.value.trim());
    }
  }

  protected async editEmail(): Promise<void> {
    const form = this.profile.formData();
    if (!form) return;

    const result = await this.nxtModal.prompt({
      title: 'Email',
      placeholder: 'your@email.com',
      defaultValue: form.contact.email ?? '',
      inputType: 'email',
      submitText: 'Done',
      preferNative: 'ionic',
    });
    if (result.confirmed) {
      this.profile.updateField('contact', 'email', result.value.trim());
    }
  }

  protected async editPosition(): Promise<void> {
    const form = this.profile.formData();
    if (!form) return;
    const selected = this.selectedPositions();
    const sport = form.sportsInfo.sport || 'Football';
    const positionGroups = getPositionGroupsForSport(sport);
    const activeSportIndex = this.profile.activeSportIndex();
    const allSports = this.profile.allSports();

    this.logger.info('🎯 Opening position picker', {
      sport,
      activeSportIndex,
      allSportsCount: allSports?.length,
      currentPositions: selected,
      groupCount: positionGroups.length,
    });

    const inputs = positionGroups.flatMap((group) =>
      group.positions.map((pos) => ({
        name: pos,
        type: 'checkbox' as const,
        label:
          positionGroups.length > 1
            ? `${group.category}: ${formatPositionDisplay(pos, sport, { showAbbreviation: false })}`
            : formatPositionDisplay(pos, sport, { showAbbreviation: false }),
        value: pos,
        checked: selected.includes(pos),
      }))
    );

    const alert = await this.alertCtrl.create({
      header: 'Position',
      cssClass: 'nxt-modal-prompt',
      inputs,
      buttons: [
        { text: 'Cancel', role: 'cancel', cssClass: 'nxt-modal-cancel-btn' },
        {
          text: 'Done',
          cssClass: 'nxt-modal-confirm-btn',
          handler: (values: string[]) => {
            this.profile.updateField('sports-info', 'primaryPosition', values[0] ?? '');
            this.profile.updateField('sports-info', 'secondaryPositions', values.slice(1));
          },
        },
      ],
    });
    this.nxtModal.applyModalTheme(alert);
    await alert.present();
  }

  protected editLocation(): void {
    void this.detectLocation();
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
    const uploadedUrls: string[] = [];
    const previewUrls: string[] = [];
    const userId = this.userId;

    if (!userId) {
      this.toast.error('User ID not found');
      return;
    }

    // Create instant preview URLs using Object URL
    for (const file of selectedFiles) {
      if (file.type.startsWith('image/')) {
        const previewUrl = URL.createObjectURL(file);
        previewUrls.push(previewUrl);
      }
    }

    // Show preview images immediately
    if (previewUrls.length > 0) {
      this.profile.updatePhotoGallery([...this.carouselImages(), ...previewUrls]);
    }

    // Show loading toast
    this.toast.info(`Uploading ${selectedFiles.length} image(s)...`);

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];

      if (!file.type.startsWith('image/')) {
        this.toast.warning(`${file.name} is not a supported image file.`);
        continue;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        this.toast.warning(`${file.name} is larger than 5MB.`);
        // Remove preview for failed upload
        const currentImages = this.carouselImages();
        const indexToRemove = currentImages.indexOf(previewUrls[i]);
        if (indexToRemove >= 0) {
          const updatedImages = currentImages.filter((_, idx) => idx !== indexToRemove);
          this.profile.updatePhotoGallery(updatedImages);
          URL.revokeObjectURL(previewUrls[i]);
        }
        continue;
      }

      try {
        // Upload to Firebase Storage and get permanent URL
        const result = await this.profile.uploadPhoto(userId, 'profile', file);
        uploadedUrls.push(result.url);

        // Replace the blob preview URL with the real Firebase Storage URL
        const currentImages = this.carouselImages();
        const blobIndex = currentImages.indexOf(previewUrls[i]);
        if (blobIndex >= 0) {
          const updatedImages = [...currentImages];
          updatedImages[blobIndex] = result.url;
          this.profile.updatePhotoGallery(updatedImages);
          URL.revokeObjectURL(previewUrls[i]);
        }
      } catch (error) {
        this.logger.error('Failed to upload profile image', error, { fileName: file.name });
        this.toast.error(`Could not upload ${file.name}.`);

        // Remove preview for failed upload
        const currentImages = this.carouselImages();
        const indexToRemove = currentImages.indexOf(previewUrls[i]);
        if (indexToRemove >= 0) {
          const updatedImages = currentImages.filter((_, idx) => idx !== indexToRemove);
          this.profile.updatePhotoGallery(updatedImages);
          URL.revokeObjectURL(previewUrls[i]);
        }
      }
    }

    if (uploadedUrls.length > 0) {
      this.toast.success(`Uploaded ${uploadedUrls.length} image(s)`);
    }

    if (files.length > availableSlots) {
      this.toast.warning(`Only ${MAX_GALLERY_IMAGES} images can be used.`);
    }

    if (input) {
      input.value = '';
    }
  }

  protected async removeImage(index: number): Promise<void> {
    const images = this.carouselImages();
    const url = images[index];
    if (!url) return;
    await this.profile.removePhoto(url, images);
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
