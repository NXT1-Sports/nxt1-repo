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
import {
  AlertController,
  IonContent,
  IonSpinner,
  ModalController,
} from '@ionic/angular/standalone';
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
  ConnectedAccountsSheetComponent,
  type ConnectedSource,
} from '../components/connected-sources';
import {
  PLATFORM_REGISTRY,
  PLATFORM_CATEGORIES,
  getPlatformFaviconUrl,
  getRecommendedPlatforms,
} from '@nxt1/core/api';
import { NxtBottomSheetService, SHEET_PRESETS } from '../components/bottom-sheet';

import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { getPositionGroupsForSport, type InboxEmailProvider } from '@nxt1/core';

const MAX_GALLERY_IMAGES = 8;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const HEIGHT_OPTIONS = buildHeightOptions();

@Component({
  selector: 'nxt1-edit-profile-shell',
  standalone: true,
  imports: [
    IonContent,
    IonSpinner,
    EditProfileSkeletonComponent,
    NxtSheetHeaderComponent,
    NxtIconComponent,
    NxtMediaGalleryComponent,
    NxtListSectionComponent,
    NxtListRowComponent,
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
            </nxt1-list-section>

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

  /** User ID to load/edit - passed from parent component via Ionic componentProps */
  @Input() userId?: string;

  /** Sport index to load - defaults to activeSportIndex if not provided */
  @Input() sportIndex?: number;

  /** Optional callback for direct provider connection (bypasses modal dismiss chain) */
  @Input() connectProviderCallback?: (provider: InboxEmailProvider) => void;

  protected readonly imageInputRef = viewChild<ElementRef<HTMLInputElement>>('imageInput');
  private readonly nxtModal = inject(NxtModalService);
  private readonly alertCtrl = inject(AlertController);
  private readonly bottomSheet = inject(NxtBottomSheetService);

  protected readonly isDetectingLocation = signal(false);
  protected readonly maxGalleryImages = MAX_GALLERY_IMAGES;

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

  protected onClose(): void {
    if (this.isModalMode) {
      void this.modalCtrl!.dismiss(null, 'cancel');
      return;
    }
    this.close.emit();
  }

  protected async openConnectedAccounts(): Promise<void> {
    console.log('[Edit Profile Shell] Opening connected accounts sheet...');
    const result = await this.bottomSheet.openSheet<{
      updatedLinks: { platform: string; url: string; username?: string; displayOrder: number }[];
      sources: readonly ConnectedSource[];
    }>({
      component: ConnectedAccountsSheetComponent,
      ...SHEET_PRESETS.TALL,
      componentProps: {
        platformGroups: this.platformGroups(),
        connectProviderCallback: this.connectProviderCallback,
        connectedEmails: this.profile.rawUserData()?.connectedEmails ?? [],
      },
      showHandle: true,
    });

    console.log('[Edit Profile Shell] Sheet dismissed with role:', result.role);

    if (result.role === 'save' && result.data?.updatedLinks) {
      this.profile.updateField('social-links', 'links', result.data.updatedLinks);
      this.logger.info('Connected accounts updated', {
        count: result.data.updatedLinks.length,
      });
      this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, {
        source: 'connected-accounts-sheet',
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

  protected async editPosition(): Promise<void> {
    const form = this.profile.formData();
    if (!form) return;
    const selected = this.selectedPositions();
    const positions = this.positionOptions();
    const activeSportIndex = this.profile.activeSportIndex();
    const allSports = this.profile.allSports();

    this.logger.info('🎯 Opening position picker', {
      sport: form.sportsInfo.sport,
      activeSportIndex,
      allSportsCount: allSports?.length,
      currentSport: allSports?.[activeSportIndex]?.sport,
      currentPositions: selected,
      availablePositionsCount: positions.length,
      firstFewPositions: positions.slice(0, 5),
      allFormDataSportsInfo: form.sportsInfo,
    });

    const alert = await this.alertCtrl.create({
      header: 'Position',
      cssClass: 'nxt-modal-prompt',
      inputs: positions.map((pos) => ({
        name: pos,
        type: 'checkbox' as const,
        label: pos,
        value: pos,
        checked: selected.includes(pos),
      })),
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
