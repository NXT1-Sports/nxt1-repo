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
} from '@angular/core';
import { IonSpinner } from '@ionic/angular/standalone';
import type { ManageTeamSectionId, ManageTeamFormData } from '@nxt1/core';
import { ManageTeamService } from './manage-team.service';
import { ManageTeamSkeletonComponent } from './manage-team-skeleton.component';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtIconComponent } from '../components/icon';
import { NxtListSectionComponent } from '../components/list-section';
import { NxtListRowComponent } from '../components/list-row';
import { NxtMediaGalleryComponent } from '../components/media-gallery';

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
  template: `
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
          <!-- Images (Media Gallery) -->
          <nxt1-media-gallery
            [images]="teamImages()"
            [maxImages]="6"
            (add)="emitAction('images', 'add')"
            (remove)="onRemoveImage($event)"
          />

          <!-- Connected team accounts -->
          <nxt1-list-section header="Connected accounts">
            <nxt1-list-row label="Accounts" (tap)="emitAction('accounts', 'manage')">
              <span class="nxt1-list-value nxt1-list-placeholder">Connect accounts</span>
            </nxt1-list-row>
          </nxt1-list-section>

          <!-- Two-column layout: About Info (left) | Staff + Contact + Roster + Stats (right) -->
          <div class="nxt1-mt-sections" [class.nxt1-mt-two-col]="webLayout()">
            <!-- About Info -->
            <nxt1-list-section header="About Info">
              <nxt1-list-row label="Title" (tap)="emitAction('about', 'editTitle')">
                <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!teamName()">
                  {{ teamName() || 'Add team name' }}
                </span>
              </nxt1-list-row>
              <nxt1-list-row label="Mascot" (tap)="emitAction('about', 'editMascot')">
                <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!mascot()">
                  {{ mascot() || 'Add mascot' }}
                </span>
              </nxt1-list-row>
              <nxt1-list-row label="Location" (tap)="emitAction('about', 'editLocation')">
                <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!locationSummary()">
                  {{ locationSummary() || 'Add location' }}
                </span>
              </nxt1-list-row>
            </nxt1-list-section>

            <!-- RIGHT column stacks -->
            <div class="nxt1-mt-sections" [class.nxt1-mt-right-col]="webLayout()">
              <!-- Roster & Staff -->
              <nxt1-list-section header="Roster & Staff">
                <nxt1-list-row label="Players" (tap)="emitAction('roster', 'invite')">
                  <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!rosterSummary()">
                    {{ rosterSummary() || 'Invite team' }}
                  </span>
                </nxt1-list-row>
                <nxt1-list-row label="Staff" (tap)="emitAction('staff', 'manage')">
                  <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!staffSummary()">
                    {{ staffSummary() || 'Add staff' }}
                  </span>
                </nxt1-list-row>
              </nxt1-list-section>

              <!-- Contact Info -->
              <nxt1-list-section header="Contact info">
                <nxt1-list-row label="Email" (tap)="emitAction('contact', 'editEmail')">
                  <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!emailSummary()">
                    {{ emailSummary() || 'Add email' }}
                  </span>
                </nxt1-list-row>
                <nxt1-list-row label="Phone" (tap)="emitAction('contact', 'editPhone')">
                  <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!phoneSummary()">
                    {{ phoneSummary() || 'Add phone number' }}
                  </span>
                </nxt1-list-row>
              </nxt1-list-section>

              <!-- Stats -->
              <nxt1-list-section header="Stats">
                <nxt1-list-row label="Record" (tap)="emitAction('stats', 'edit')">
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
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }

      .nxt1-mt-body {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-4)
          calc(var(--nxt1-spacing-8) + env(safe-area-inset-bottom, 0px));
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

      .nxt1-mt-right-col {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
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

  // ─── Inputs ────────────────────────────────────────────────────────────────

  /** Team ID to manage (null for new team) */
  readonly teamId = input<string | null>(null);

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

  protected readonly teamImages = computed(() => {
    const branding = this.service.formData()?.branding;
    if (branding?.galleryImages?.length) {
      return branding.galleryImages;
    }
    const logo = branding?.logo;
    return logo ? ([logo] as readonly string[]) : ([] as readonly string[]);
  });

  protected readonly locationSummary = computed(() => {
    const contact = this.service.formData()?.contact;
    if (!contact) return '';
    const parts = [contact.city, contact.state].filter(Boolean);
    return parts.join(', ');
  });

  protected readonly emailSummary = computed(() => this.service.formData()?.contact?.email ?? '');
  protected readonly phoneSummary = computed(() => this.service.formData()?.contact?.phone ?? '');

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
      this.service.loadTeam(teamIdValue as string);
    }
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  retryLoad(): void {
    const teamIdValue = typeof this.teamId === 'function' ? this.teamId() : this.teamId;
    if (teamIdValue) {
      this.service.loadTeam(teamIdValue as string);
    }
  }

  emitAction(section: ManageTeamSectionId, action: string): void {
    this.sectionAction.emit({ section, action });
  }

  onRemoveImage(index: number): void {
    this.sectionAction.emit({ section: 'images', action: 'remove', data: index });
  }

  onClose(saved: boolean): void {
    const formData = this.service.formData();
    this.close.emit({
      saved,
      data: saved && formData ? formData : undefined,
    });
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
