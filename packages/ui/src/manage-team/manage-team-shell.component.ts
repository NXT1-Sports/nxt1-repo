/**
 * @fileoverview Manage Team Shell Component
 * @module @nxt1/ui/manage-team
 *
 * Matches Edit Profile's design system 1:1:
 *   NxtListSectionComponent + NxtListRowComponent for iOS-style grouped lists,
 *   plain scrollable div body, optional 2-column web layout via webLayout input.
 *
 * No inline expanded sub-forms — tapping a row emits sectionAction for the
 * parent or caller to open the appropriate edit sheet/modal.
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  inject,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  ElementRef,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { IonSpinner } from '@ionic/angular/standalone';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type {
  ManageTeamSectionId,
  ManageTeamFormData,
  RosterActionEvent,
  StaffActionEvent,
} from '@nxt1/core';
import { ManageTeamService } from './manage-team.service';
import { ManageTeamSkeletonComponent } from './manage-team-skeleton.component';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtIconComponent } from '../components/icon';
import { NxtListSectionComponent } from '../components/list-section';
import { NxtListRowComponent } from '../components/list-row';
import { NxtMediaGalleryComponent } from '../components/media-gallery';
import { NxtModalService } from '../services/modal';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { InviteBottomSheetService } from '../invite';
import { TEAM_LOGO_UPLOADER } from './team-logo-uploader.token';
import { ConnectedAccountsModalService } from '../components/connected-sources';
import { buildLinkSourcesFormData, mapToConnectedSources, TEAM_LEVEL_CONFIG } from '@nxt1/core';
import type { LinkSourcesFormData } from '@nxt1/core/api';
import { ManageTeamMembershipModalService } from './manage-team-membership-modal.service';

/** Event emitted when shell requests close */
export interface ManageTeamCloseEvent {
  readonly saved: boolean;
  readonly data?: ManageTeamFormData;
}

@Component({
  selector: 'nxt1-manage-team-shell',
  standalone: true,
  imports: [
    IonSpinner,
    ManageTeamSkeletonComponent,
    NxtSheetHeaderComponent,
    NxtIconComponent,
    NxtListSectionComponent,
    NxtListRowComponent,
    NxtMediaGalleryComponent,
  ],
  host: { class: 'nxt1-manage-team-shell' },
  template: `
    <!-- Hidden file input for logo/gallery upload (only rendered when uploader is available) -->
    <input
      #mediaFileInput
      type="file"
      accept="image/jpeg,image/png,image/webp,image/svg+xml"
      style="display:none"
      (change)="onMediaFileChange($event)"
    />

    <!-- Header (suppressed when headless — web modal provides its own) -->
    @if (showHeader() && !headless()) {
      @if (!isModalMode()) {
        <header class="nxt1-mt-header">
          <button type="button" class="nxt1-header-btn" (click)="onClose(false)" aria-label="Close">
            <nxt1-icon name="close" [size]="18" />
          </button>
          <h1 class="nxt1-header-title">{{ title() }}</h1>
          <button
            type="button"
            class="nxt1-header-btn nxt1-header-save"
            [class.nxt1-header-save--active]="service.hasUnsavedChanges()"
            [disabled]="service.isSaving()"
            (click)="onSave()"
            aria-label="Save changes"
          >
            @if (service.isSaving()) {
              <ion-spinner name="crescent" />
            } @else {
              <span>{{ service.hasUnsavedChanges() ? 'Save' : 'Done' }}</span>
            }
          </button>
        </header>
      } @else {
        <nxt1-sheet-header
          [title]="title()"
          [showClose]="false"
          [showBorder]="true"
          (closeSheet)="onClose(false)"
        >
          <button
            sheetHeaderAction
            type="button"
            class="nxt1-header-btn nxt1-header-save"
            [class.nxt1-header-save--active]="service.hasUnsavedChanges()"
            [disabled]="service.isSaving()"
            (click)="onSave()"
            aria-label="Save changes"
          >
            @if (service.isSaving()) {
              <ion-spinner name="crescent" />
            } @else {
              <span>{{ service.hasUnsavedChanges() ? 'Save' : 'Done' }}</span>
            }
          </button>
        </nxt1-sheet-header>
      }
    }

    <!-- Scrollable content area — plain div, safe inside NxtOverlayService -->
    <div class="nxt1-mt-content">
      @if (service.isLoading()) {
        <nxt1-manage-team-skeleton />
      } @else if (service.error()) {
        <div class="nxt1-error-state">
          <div class="nxt1-error-icon">
            <nxt1-icon name="alertCircle" [size]="20" />
          </div>
          <p class="nxt1-error-text">{{ service.error() }}</p>
          <button type="button" class="nxt1-retry-btn" (click)="retryLoad()">Try Again</button>
        </div>
      } @else {
        <div class="nxt1-mt-body">
          <!-- Top media row: org logo slot (left) + team gallery (right) -->
          <div class="nxt1-mt-media-top-row">
            <button
              type="button"
              class="nxt1-org-logo-slot"
              [class.nxt1-org-logo-slot--has-image]="!!organizationLogo()"
              (click)="openLogoPrompt()"
              aria-label="Add organization logo"
            >
              @if (organizationLogo()) {
                <img
                  [src]="organizationLogo()!"
                  alt="Organization logo"
                  class="nxt1-org-logo-image"
                />
                <span class="nxt1-org-logo-label">Logo</span>
              } @else {
                <nxt1-icon name="image" [size]="16" />
                <span class="nxt1-org-logo-label">Add logo</span>
              }
            </button>

            <div class="nxt1-mt-gallery-wrap">
              <nxt1-media-gallery
                [images]="galleryImages()"
                [maxImages]="8"
                [addLabel]="'Add image'"
                (add)="openGalleryImagePrompt()"
                (remove)="onRemoveImage($event)"
              />
            </div>
          </div>

          <!-- Connected Accounts -->
          <nxt1-list-section header="Connected accounts">
            <nxt1-list-row label="Accounts" (tap)="openConnectedAccounts()">
              <span class="nxt1-list-value" [class.nxt1-list-placeholder]="connectedCount() === 0">
                {{ connectedCount() > 0 ? connectedCount() + ' connected' : 'Connect accounts' }}
              </span>
            </nxt1-list-row>
          </nxt1-list-section>

          <!-- Team setup / branding -->
          <nxt1-list-section header="Team setup">
            <nxt1-list-row label="Website & branding" (tap)="manageTeamSetup()">
              <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!accountsSummary()">
                {{ accountsSummary() || 'Update team setup' }}
              </span>
            </nxt1-list-row>
          </nxt1-list-section>

          <!-- Two-column layout: About Info (left) | Staff + Contact + Roster + Stats (right) -->
          <div class="nxt1-mt-sections" [class.nxt1-mt-two-col]="webLayout()">
            <!-- About Info -->
            <nxt1-list-section header="About Info">
              <nxt1-list-row label="Team name" (tap)="editTeamName()">
                <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!teamName()">
                  {{ teamName() || 'Add team name' }}
                </span>
              </nxt1-list-row>
              <nxt1-list-row label="Mascot" (tap)="editMascot()">
                <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!mascot()">
                  {{ mascot() || 'Add mascot' }}
                </span>
              </nxt1-list-row>
              <nxt1-list-row label="Location" (tap)="editLocation()">
                <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!locationSummary()">
                  {{ locationSummary() || 'Add location' }}
                </span>
              </nxt1-list-row>
              <nxt1-list-row label="Level" (tap)="editLevel()">
                <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!levelSummary()">
                  {{ levelSummary() || 'Select level' }}
                </span>
              </nxt1-list-row>
              <nxt1-list-row label="Division" (tap)="editDivision()">
                <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!divisionSummary()">
                  {{ divisionSummary() || 'Add division' }}
                </span>
              </nxt1-list-row>
              <nxt1-list-row label="Conference" (tap)="editConference()">
                <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!conferenceSummary()">
                  {{ conferenceSummary() || 'Add conference' }}
                </span>
              </nxt1-list-row>
            </nxt1-list-section>

            <!-- RIGHT column stacks -->
            <div class="nxt1-mt-sections" [class.nxt1-mt-right-col]="webLayout()">
              <!-- Roster & Staff -->
              <nxt1-list-section header="Roster & Staff">
                <nxt1-list-row label="Players" (tap)="toggleRosterSection()">
                  <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!rosterSummary()">
                    {{ rosterSummary() || 'Invite team' }}
                  </span>
                </nxt1-list-row>
                <nxt1-list-row label="Staff" (tap)="toggleStaffSection()">
                  <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!staffSummary()">
                    {{ staffSummary() || 'Add staff' }}
                  </span>
                </nxt1-list-row>
              </nxt1-list-section>

              <!-- Contact Info -->
              <nxt1-list-section header="Contact info">
                <nxt1-list-row label="Email" (tap)="editEmail()">
                  <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!emailSummary()">
                    {{ emailSummary() || 'Add email' }}
                  </span>
                </nxt1-list-row>
                <nxt1-list-row label="Phone" (tap)="editPhone()">
                  <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!phoneSummary()">
                    {{ phoneSummary() || 'Add phone number' }}
                  </span>
                </nxt1-list-row>
              </nxt1-list-section>

              <!-- Stats -->
              <nxt1-list-section header="Stats">
                <nxt1-list-row label="Record" (tap)="editRecord()">
                  <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!statsSummary()">
                    {{ statsSummary() || 'Add record' }}
                  </span>
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
      /* ============================================
         MANAGE TEAM SHELL — Shared Design System
         Token-for-token match with Edit Profile shell.
         ============================================ */

      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background: var(--nxt1-color-bg-primary);
        color: var(--nxt1-color-text-primary);
      }

      /* ============================================
         HEADER (standalone page mode)
         ============================================ */
      .nxt1-mt-header {
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
         HEADER BUTTONS
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
      .nxt1-mt-content {
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
      }

      .nxt1-mt-body {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
        min-width: 0;
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-4)
          calc(var(--nxt1-spacing-8) + env(safe-area-inset-bottom, 0px));
      }

      .nxt1-mt-media-top-row {
        display: grid;
        grid-template-columns: 84px minmax(0, 1fr);
        gap: var(--nxt1-spacing-3);
        align-items: stretch;
      }

      .nxt1-org-logo-slot {
        position: relative;
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1);
        width: 84px;
        min-height: 84px;
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px dashed var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-org-logo-slot:hover {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-surface-200);
      }

      .nxt1-org-logo-slot--has-image {
        border-style: solid;
      }

      .nxt1-org-logo-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .nxt1-org-logo-label {
        position: absolute;
        left: 50%;
        bottom: var(--nxt1-spacing-1);
        transform: translateX(-50%);
        padding: 2px 6px;
        border-radius: var(--nxt1-borderRadius-full);
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        line-height: 1;
        white-space: nowrap;
      }

      .nxt1-mt-gallery-wrap {
        min-width: 0;
      }

      /* ============================================
         LIST ROW VALUES
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

      .nxt1-list-placeholder {
        color: var(--nxt1-color-text-tertiary);
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
         SECTION LAYOUT (mobile: stacked; web: 2-col)
         ============================================ */
      .nxt1-mt-sections {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
      }

      .nxt1-mt-two-col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-5);
        align-items: start;
      }

      .nxt1-mt-two-col > * {
        min-width: 0;
      }

      .nxt1-mt-right-col {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        min-width: 0;
      }

      @media (max-width: 767px) {
        .nxt1-mt-body {
          gap: var(--nxt1-spacing-4);
          padding: var(--nxt1-spacing-3) var(--nxt1-spacing-3)
            calc(var(--nxt1-spacing-7) + env(safe-area-inset-bottom, 0px));
        }

        .nxt1-mt-two-col {
          grid-template-columns: 1fr;
          gap: var(--nxt1-spacing-4);
        }

        .nxt1-mt-media-top-row {
          grid-template-columns: 72px minmax(0, 1fr);
        }

        .nxt1-org-logo-slot {
          width: 72px;
          min-height: 72px;
        }
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */
      @media (prefers-reduced-motion: reduce) {
        .nxt1-header-btn {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamShellComponent implements OnInit {
  readonly service = inject(ManageTeamService);

  private readonly modalService = inject(NxtModalService);
  private readonly logger = inject(NxtLoggingService).child('ManageTeamShell');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly inviteSheet = inject(InviteBottomSheetService);
  private readonly logoUploader = inject(TEAM_LOGO_UPLOADER, { optional: true });
  private readonly connectedAccountsModal = inject(ConnectedAccountsModalService);
  private readonly membershipModal = inject(ManageTeamMembershipModalService);
  private readonly platformId = inject(PLATFORM_ID);

  @ViewChild('mediaFileInput') private readonly mediaFileInputRef?: ElementRef<HTMLInputElement>;

  private readonly pendingUploadTarget = signal<'logo' | 'gallery'>('gallery');
  private readonly membershipChanged = signal(false);

  private initialSectionHandled = false;

  // ─── Inputs ────────────────────────────────────────────────────────────────

  /** Team ID to manage (null for new team) */
  readonly teamId = input<string | null>(null);

  /** Optional section to focus when the shell opens. */
  readonly initialSection = input<ManageTeamSectionId | null>(null);

  /**
   * When headless=true, the shell renders no header.
   * The parent (ManageTeamWebModalComponent) provides its own header chrome.
   */
  readonly headless = input(false);

  /**
   * When true, renders sections in a 2-column grid layout.
   * Intended for wide web modals where horizontal space is available.
   */
  readonly webLayout = input(false);

  /**
   * When true, renders a NxtSheetHeader instead of the standalone page header.
   * Used by bottom sheet overlays on mobile.
   */
  readonly isModalMode = input(false);

  /** Display mode */
  readonly mode = input<'full' | 'compact' | 'inline'>('full');

  /** Custom title */
  readonly title = input('Manage Team');

  /** Show header */
  readonly showHeader = input(true);

  // ─── Outputs ───────────────────────────────────────────────────────────────

  /** Close event */
  readonly close = output<ManageTeamCloseEvent>();

  /** Save event */
  readonly save = output<ManageTeamFormData>();

  /** Section field action — caller opens the appropriate edit sheet */
  readonly sectionAction = output<{
    section: ManageTeamSectionId;
    action: string;
    data?: unknown;
  }>();

  // ─── Computed row values ────────────────────────────────────────────────────

  protected readonly teamName = computed(() => this.service.formData()?.basicInfo?.name ?? '');
  protected readonly mascot = computed(() => this.service.formData()?.basicInfo?.mascot ?? '');
  protected readonly sport = computed(() => this.service.formData()?.basicInfo?.sport ?? '');
  protected readonly levelSummary = computed(() => {
    const level = this.service.formData()?.basicInfo?.level;
    if (!level) return '';
    return TEAM_LEVEL_CONFIG[level]?.label ?? level;
  });
  protected readonly divisionSummary = computed(
    () => this.service.formData()?.basicInfo?.division?.trim() ?? ''
  );
  protected readonly conferenceSummary = computed(
    () => this.service.formData()?.basicInfo?.conference?.trim() ?? ''
  );

  protected readonly organizationLogo = computed(
    () => this.service.formData()?.branding?.logo ?? null
  );
  protected readonly galleryImages = computed(
    () => this.service.formData()?.branding?.galleryImages ?? ([] as readonly string[])
  );

  protected readonly locationSummary = computed(() => {
    const contact = this.service.formData()?.contact;
    if (!contact) return '';
    const parts = [contact.city, contact.state].filter(Boolean);
    return parts.join(', ');
  });

  protected readonly emailSummary = computed(() => this.service.formData()?.contact?.email ?? '');
  protected readonly phoneSummary = computed(() => this.service.formData()?.contact?.phone ?? '');
  protected readonly accountsSummary = computed(() => {
    const website = this.service.formData()?.contact?.website?.trim();
    if (website) {
      return website.replace(/^https?:\/\/(www\.)?/i, '');
    }

    const branding = this.service.formData()?.branding;
    const configuredCount = [
      branding?.logo,
      branding?.primaryColor,
      branding?.secondaryColor,
    ].filter(Boolean).length;

    return configuredCount > 0
      ? `${configuredCount} brand setting${configuredCount === 1 ? '' : 's'}`
      : '';
  });
  protected readonly connectedCount = computed(() => this.service.connectedSources().length);

  protected readonly rosterSummary = computed(() => {
    const n = this.service.roster()?.length ?? 0;
    if (!n) return '';
    return n + ' player' + (n !== 1 ? 's' : '');
  });

  protected readonly statsSummary = computed(() => this.service.recordString() ?? '');

  protected readonly staffSummary = computed(() => {
    const n = this.service.staff()?.length ?? 0;
    if (!n) return '';
    return n + ' member' + (n !== 1 ? 's' : '');
  });

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const teamIdValue = typeof this.teamId === 'function' ? this.teamId() : this.teamId;
    if (teamIdValue) {
      void this.service
        .loadTeam(teamIdValue as string)
        .then(() => this.openInitialSectionIfNeeded());
      return;
    }

    this.openInitialSectionIfNeeded();
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  retryLoad(): void {
    const teamIdValue = typeof this.teamId === 'function' ? this.teamId() : this.teamId;
    if (teamIdValue) {
      this.service.loadTeam(teamIdValue as string);
    }
  }

  emitAction(section: ManageTeamSectionId, action: string, data?: unknown): void {
    this.sectionAction.emit({ section, action, data });
    this.breadcrumb.trackUserAction('manage-team-shell-action', { section, action });
    this.analytics?.trackEvent(APP_EVENTS.TEAM_MANAGED, {
      action,
      section,
    });
  }

  protected async manageTeamSetup(): Promise<void> {
    this.service.expandSection('team-info');
    this.emitAction('accounts', 'manage');

    const result = await this.modalService.actionSheet({
      title: 'Team Setup',
      message: 'Choose what you want to update.',
      actions: [
        { text: 'Website', data: 'website' },
        { text: 'Primary Color', data: 'primaryColor' },
        { text: 'Secondary Color', data: 'secondaryColor' },
        { text: 'Cancel', cancel: true },
      ],
      preferNative: 'native',
    });

    if (!result.selected || typeof result.data !== 'string') {
      return;
    }

    switch (result.data) {
      case 'website':
        await this.editWebsite();
        break;
      case 'logo':
        await this.openLogoPrompt();
        break;
      case 'primaryColor':
      case 'secondaryColor':
        await this.editBrandColor(result.data);
        break;
      default:
        break;
    }
  }

  protected async openConnectedAccounts(): Promise<void> {
    const sport = this.service.formData()?.basicInfo?.sport;
    const selectedSports = sport ? [sport] : [];

    const linkSourcesData = buildLinkSourcesFormData({
      connectedSources: this.service.connectedSources(),
      connectedEmails: [],
    }) as LinkSourcesFormData | null;

    const result = await this.connectedAccountsModal.open({
      role: 'coach',
      selectedSports,
      linkSourcesData,
      scope: 'team',
    });

    if (!result.linkSources) {
      return;
    }

    const connectedSources = mapToConnectedSources(result.linkSources.links);
    this.service.setConnectedSources(connectedSources);
    this.emitAction('accounts', 'editConnectedAccounts', {
      count: connectedSources.length,
    });
    this.service.expandSection('accounts');
  }

  protected async editTeamName(): Promise<void> {
    const result = await this.modalService.prompt({
      title: 'Team Name',
      placeholder: 'Enter team name',
      defaultValue: this.teamName(),
      submitText: 'Done',
      required: true,
      preferNative: 'native',
    });

    if (result.confirmed) {
      this.emitAction('about', 'editTitle');
      this.service.updateField({ sectionId: 'about', fieldId: 'name', value: result.value });
    }
  }

  protected async editMascot(): Promise<void> {
    const result = await this.modalService.prompt({
      title: 'Mascot',
      placeholder: 'e.g. Tigers',
      defaultValue: this.mascot(),
      submitText: 'Done',
      preferNative: 'native',
    });

    if (result.confirmed) {
      this.emitAction('about', 'editMascot');
      this.service.updateField({ sectionId: 'about', fieldId: 'mascot', value: result.value });
    }
  }

  protected async editLocation(): Promise<void> {
    const city = await this.modalService.prompt({
      title: 'City',
      placeholder: 'Team city',
      defaultValue: this.service.formData()?.contact?.city ?? '',
      submitText: 'Next',
      preferNative: 'native',
    });
    if (!city.confirmed) return;

    const state = await this.modalService.prompt({
      title: 'State',
      placeholder: 'State or province',
      defaultValue: this.service.formData()?.contact?.state ?? '',
      submitText: 'Done',
      preferNative: 'native',
    });
    if (!state.confirmed) return;

    this.emitAction('about', 'editLocation');
    this.service.updateField({ sectionId: 'contact', fieldId: 'city', value: city.value });
    this.service.updateField({ sectionId: 'contact', fieldId: 'state', value: state.value });
    this.service.expandSection('contact');
  }

  protected async editLevel(): Promise<void> {
    const selected = await this.modalService.actionSheet({
      title: 'Team Level',
      message: 'Select the team level.',
      actions: [
        ...Object.entries(TEAM_LEVEL_CONFIG)
          .sort(([, a], [, b]) => a.order - b.order)
          .map(([value, config]) => ({
            text: config.label,
            data: value,
          })),
        { text: 'Cancel', cancel: true },
      ],
      preferNative: 'native',
    });

    if (!selected.selected || typeof selected.data !== 'string') {
      return;
    }

    this.emitAction('about', 'editLevel');
    this.service.updateField({ sectionId: 'about', fieldId: 'level', value: selected.data });
  }

  protected async editDivision(): Promise<void> {
    const result = await this.modalService.prompt({
      title: 'Division',
      placeholder: 'e.g. NCAA D1, 4A, Metro East',
      defaultValue: this.service.formData()?.basicInfo?.division ?? '',
      submitText: 'Done',
      preferNative: 'native',
    });

    if (!result.confirmed) {
      return;
    }

    this.emitAction('about', 'editDivision');
    this.service.updateField({ sectionId: 'about', fieldId: 'division', value: result.value });
  }

  protected async editConference(): Promise<void> {
    const result = await this.modalService.prompt({
      title: 'Conference',
      placeholder: 'e.g. Big 12, SEC, District 5',
      defaultValue: this.service.formData()?.basicInfo?.conference ?? '',
      submitText: 'Done',
      preferNative: 'native',
    });

    if (!result.confirmed) {
      return;
    }

    this.emitAction('about', 'editConference');
    this.service.updateField({ sectionId: 'about', fieldId: 'conference', value: result.value });
  }

  protected toggleRosterSection(): void {
    this.emitAction('roster', 'open');

    if (this.service.roster().length === 0) {
      this.manageRosterInvite();
      return;
    }

    void this.openMembershipEditor('roster');
  }

  protected toggleStaffSection(): void {
    this.emitAction('staff', 'open');
    void this.openMembershipEditor('staff');
  }

  /**
   * Open the shared membership editor overlay/modal.
   * Web/mobile-web → NxtOverlayService; native → Ionic modal.
   */
  protected async openMembershipEditor(mode: 'roster' | 'staff'): Promise<void> {
    const teamIdValue = typeof this.teamId === 'function' ? this.teamId() : this.teamId;
    if (!teamIdValue) return;

    this.logger.info('Opening membership editor', { mode, teamId: teamIdValue });
    this.breadcrumb.trackUserAction('manage-team-membership-open', { mode });

    const result = await this.membershipModal.open({
      teamId: teamIdValue as string,
      mode,
      initialFilter: mode,
    });

    if (result.changed) {
      this.membershipChanged.set(true);
      // Reload the team to reflect updated roster/staff counts in the shell
      void this.service.loadTeam(teamIdValue as string);
    }
  }

  protected async editEmail(): Promise<void> {
    const result = await this.modalService.prompt({
      title: 'Team Email',
      placeholder: 'team@email.com',
      defaultValue: this.emailSummary(),
      inputType: 'email',
      submitText: 'Done',
      preferNative: 'native',
    });

    if (result.confirmed) {
      this.emitAction('contact', 'editEmail');
      this.service.updateField({ sectionId: 'contact', fieldId: 'email', value: result.value });
      this.service.expandSection('contact');
    }
  }

  protected async editPhone(): Promise<void> {
    const result = await this.modalService.prompt({
      title: 'Team Phone',
      placeholder: '(555) 123-4567',
      defaultValue: this.phoneSummary(),
      inputType: 'tel',
      submitText: 'Done',
      preferNative: 'native',
    });

    if (result.confirmed) {
      this.emitAction('contact', 'editPhone');
      this.service.updateField({ sectionId: 'contact', fieldId: 'phone', value: result.value });
      this.service.expandSection('contact');
    }
  }

  protected async editWebsite(): Promise<void> {
    const result = await this.modalService.prompt({
      title: 'Team Website',
      placeholder: 'https://yourteam.com',
      defaultValue: this.service.formData()?.contact?.website ?? '',
      inputType: 'url',
      submitText: 'Done',
      preferNative: 'native',
    });

    if (result.confirmed) {
      this.service.updateField({ sectionId: 'contact', fieldId: 'website', value: result.value });
      this.service.expandSection('team-info');
    }
  }

  protected async editRecord(): Promise<void> {
    const formData = this.service.formData();
    if (!formData) return;

    const wins = await this.modalService.prompt({
      title: 'Wins',
      placeholder: '0',
      defaultValue: String(formData.record.wins ?? 0),
      inputType: 'number',
      submitText: 'Next',
      preferNative: 'native',
    });
    if (!wins.confirmed) return;

    const losses = await this.modalService.prompt({
      title: 'Losses',
      placeholder: '0',
      defaultValue: String(formData.record.losses ?? 0),
      inputType: 'number',
      submitText: 'Next',
      preferNative: 'native',
    });
    if (!losses.confirmed) return;

    const ties = await this.modalService.prompt({
      title: 'Ties',
      placeholder: '0',
      defaultValue: String(formData.record.ties ?? 0),
      inputType: 'number',
      submitText: 'Done',
      preferNative: 'native',
    });
    if (!ties.confirmed) return;

    this.emitAction('stats', 'edit');
    this.service.updateField({ sectionId: 'stats', fieldId: 'wins', value: wins.value });
    this.service.updateField({ sectionId: 'stats', fieldId: 'losses', value: losses.value });
    this.service.updateField({ sectionId: 'stats', fieldId: 'ties', value: ties.value });
  }

  protected async editBrandColor(
    colorKey: 'primary' | 'secondary' | 'accent' | 'primaryColor' | 'secondaryColor'
  ): Promise<void> {
    const normalizedKey =
      colorKey === 'primary'
        ? 'primaryColor'
        : colorKey === 'secondary'
          ? 'secondaryColor'
          : colorKey;
    const currentValue =
      normalizedKey === 'primaryColor'
        ? this.service.formData()?.branding?.primaryColor
        : normalizedKey === 'secondaryColor'
          ? this.service.formData()?.branding?.secondaryColor
          : this.service.formData()?.branding?.accentColor;

    const result = await this.modalService.prompt({
      title: 'Brand Color',
      message: 'Enter a hex color like #CCFF00',
      placeholder: '#CCFF00',
      defaultValue: currentValue,
      submitText: 'Done',
      preferNative: 'native',
    });

    if (result.confirmed) {
      this.service.updateField({
        sectionId: 'images',
        fieldId: normalizedKey,
        value: result.value,
      });
      this.service.expandSection('team-info');
    }
  }

  protected async openLogoPrompt(): Promise<void> {
    const teamId = this.service.teamId();

    // If a real upload adapter is provided and we have a teamId, use file picker
    if (this.logoUploader && teamId && isPlatformBrowser(this.platformId)) {
      this.pendingUploadTarget.set('logo');
      this.mediaFileInputRef?.nativeElement.click();
      return;
    }

    // Fallback: prompt for a URL
    const result = await this.modalService.prompt({
      title: 'Organization Logo URL',
      placeholder: 'https://example.com/org-logo.jpg',
      inputType: 'url',
      submitText: 'Set',
      preferNative: 'native',
    });

    if (!result.confirmed) {
      return;
    }

    const imageUrl = result.value.trim();
    if (!imageUrl) {
      return;
    }

    this.applyLogoUrl(imageUrl);
  }

  protected async openGalleryImagePrompt(): Promise<void> {
    const teamId = this.service.teamId();

    if (this.logoUploader && teamId && isPlatformBrowser(this.platformId)) {
      this.pendingUploadTarget.set('gallery');
      this.mediaFileInputRef?.nativeElement.click();
      return;
    }

    const result = await this.modalService.prompt({
      title: 'Gallery Image URL',
      placeholder: 'https://example.com/team-gallery.jpg',
      inputType: 'url',
      submitText: 'Add',
      preferNative: 'native',
    });

    if (!result.confirmed) {
      return;
    }

    const imageUrl = result.value.trim();
    if (!imageUrl) {
      return;
    }

    this.applyGalleryImageUrl(imageUrl);
  }

  protected async onMediaFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so the same file can be re-selected later
    input.value = '';

    if (!file || !this.logoUploader) return;

    const teamId = this.service.teamId();
    if (!teamId) return;

    const target = this.pendingUploadTarget();
    this.logger.info('Uploading team media', { teamId, fileName: file.name, target });
    const url = await this.logoUploader(teamId, file);

    if (url) {
      if (target === 'logo') {
        this.applyLogoUrl(url);
      } else {
        this.applyGalleryImageUrl(url);
      }
      this.logger.info('Team media uploaded', { teamId, url, target });
    } else {
      this.logger.warn('Team media upload returned null', { teamId, target });
    }
  }

  private applyLogoUrl(imageUrl: string): void {
    this.emitAction('images', 'logo-update', imageUrl);
    this.service.updateField({ sectionId: 'images', fieldId: 'logo', value: imageUrl });
    this.service.expandSection('images');
  }

  private applyGalleryImageUrl(imageUrl: string): void {
    const nextImages = Array.from(new Set([...this.galleryImages(), imageUrl]));
    this.emitAction('images', 'add', imageUrl);
    this.service.updateField({ sectionId: 'images', fieldId: 'galleryImages', value: nextImages });
    this.service.expandSection('images');
  }

  onRemoveImage(index: number): void {
    const nextImages = [...this.galleryImages()];
    nextImages.splice(index, 1);

    this.emitAction('images', 'remove', index);
    this.service.updateField({ sectionId: 'images', fieldId: 'galleryImages', value: nextImages });
  }

  protected manageRosterInvite(): void {
    this.emitAction('roster', 'invite');
    this.service.requestAddPlayer();

    const formData = this.service.formData();
    const teamId = this.service.teamId();
    const team = teamId
      ? {
          id: teamId,
          name: formData?.basicInfo?.name?.trim() || 'Team',
          sport: formData?.basicInfo?.sport?.trim() || 'Sports',
          logoUrl: formData?.branding?.logo || undefined,
          memberCount: this.service.roster().length,
        }
      : undefined;

    void this.inviteSheet.open({
      inviteType: team ? 'team' : 'general',
      team,
    });
  }

  protected onRosterAction(event: RosterActionEvent): void {
    this.emitAction('roster', event.action, event);
    this.logger.info('Roster action requested', { action: event.action, playerId: event.playerId });
  }

  protected onStaffAction(event: StaffActionEvent): void {
    this.emitAction('staff', event.action, event);
    this.logger.info('Staff action requested', { action: event.action, staffId: event.staffId });
  }

  private openInitialSectionIfNeeded(): void {
    if (this.initialSectionHandled) return;

    const section = this.initialSection();
    if (!section) return;

    this.initialSectionHandled = true;

    switch (section) {
      case 'roster':
        this.service.expandSection('roster');
        break;
      case 'staff':
        this.service.expandSection('staff');
        break;
      case 'about':
      case 'contact':
      case 'accounts':
      case 'images':
      case 'team-info':
        this.service.expandSection(section === 'team-info' ? 'team-info' : section);
        break;
      default:
        break;
    }
  }

  onClose(saved: boolean): void {
    const formData = this.service.formData();
    const shouldReportSaved = saved || this.membershipChanged();
    this.close.emit({
      saved: shouldReportSaved,
      data: shouldReportSaved && formData ? formData : undefined,
    });
    this.membershipChanged.set(false);
  }

  async onSave(): Promise<void> {
    const formData = this.service.formData();
    if (!formData) return;

    const success = await this.service.saveChanges();
    if (success) {
      this.save.emit(formData);
      if (!this.headless()) {
        this.onClose(true);
      }
    }
  }

  /**
   * Public endpoint for the web modal wrapper to trigger save.
   */
  async requestSave(): Promise<void> {
    await this.onSave();
  }
}
