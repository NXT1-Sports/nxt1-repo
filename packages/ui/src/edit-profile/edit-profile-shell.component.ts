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
import { NxtIconComponent } from '../components/icon';
import { NxtMediaGalleryComponent } from '../components/media-gallery';
import { NxtListSectionComponent } from '../components/list-section';
import { NxtListRowComponent } from '../components/list-row';
import {
  ConnectedAccountsSheetComponent,
  DEFAULT_PLATFORMS,
  type ConnectedSource,
} from '../components/connected-sources';
import { NxtBottomSheetService, SHEET_PRESETS } from '../components/bottom-sheet';

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
                  class="nxt1-list-value"
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

  protected readonly imageInputRef = viewChild<ElementRef<HTMLInputElement>>('imageInput');
  private readonly nxtModal = inject(NxtModalService);
  private readonly alertCtrl = inject(AlertController);
  private readonly bottomSheet = inject(NxtBottomSheetService);

  protected readonly isDetectingLocation = signal(false);
  protected readonly maxGalleryImages = MAX_GALLERY_IMAGES;
  protected readonly positionOptions = POSITION_OPTIONS;

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

    return DEFAULT_PLATFORMS.map((platform) => {
      const match = links.find((l) => l.platform === platform.platform);
      if (match?.url) {
        return { ...platform, connected: true, username: match.username, url: match.url };
      }
      return platform;
    });
  });

  protected readonly connectedCount = computed(
    () => this.connectedSources().filter((s) => s.connected).length
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

  protected async openConnectedAccounts(): Promise<void> {
    const result = await this.bottomSheet.openSheet<{
      updatedLinks: { platform: string; url: string; username?: string; displayOrder: number }[];
      sources: readonly ConnectedSource[];
    }>({
      component: ConnectedAccountsSheetComponent,
      ...SHEET_PRESETS.TALL,
      componentProps: { initialSources: this.connectedSources() },
      showHandle: true,
    });

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
    const alert = await this.alertCtrl.create({
      header: 'Position',
      cssClass: 'nxt-modal-prompt',
      inputs: this.positionOptions.map((pos) => ({
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
