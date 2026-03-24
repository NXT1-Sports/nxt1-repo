/**
 * @fileoverview Manage Team Shell Component
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Main container component for team management.
 * Can be placed as a page, in a modal, or bottom sheet.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
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
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonIcon,
  IonRippleEffect,
  IonSpinner,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  checkmarkOutline,
  informationCircleOutline,
  peopleOutline,
  calendarOutline,
  statsChartOutline,
  personOutline,
  ribbonOutline,
  linkOutline,
  chevronForwardOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import type {
  ManageTeamSectionId,
  ManageTeamFormData,
  ManageTeamTabId,
  RosterPlayer,
  TeamScheduleEvent,
  StaffMember,
  TeamSponsor,
} from '@nxt1/core';
import { MANAGE_TEAM_TABS, getAllManageTeamSections } from '@nxt1/core';
import { ManageTeamService } from './manage-team.service';
import { ManageTeamSkeletonComponent } from './manage-team-skeleton.component';
import { InviteBottomSheetService } from '../invite/invite-bottom-sheet.service';
import {
  ManageTeamInfoSectionComponent,
  ManageTeamRosterSectionComponent,
  ManageTeamScheduleSectionComponent,
  ManageTeamStatsSectionComponent,
  ManageTeamStaffSectionComponent,
  ManageTeamSponsorsSectionComponent,
} from './sections';

/** Event emitted when shell requests close */
export interface ManageTeamCloseEvent {
  readonly saved: boolean;
  readonly data?: ManageTeamFormData;
}

@Component({
  selector: 'nxt1-manage-team-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    IonRippleEffect,
    IonSpinner,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    ManageTeamSkeletonComponent,
    ManageTeamInfoSectionComponent,
    ManageTeamRosterSectionComponent,
    ManageTeamScheduleSectionComponent,
    ManageTeamStatsSectionComponent,
    ManageTeamStaffSectionComponent,
    ManageTeamSponsorsSectionComponent,
  ],
  template: `
    <!-- Header (suppressed when headless — web modal provides its own) -->
    @if (showHeader() && !headless()) {
      <ion-header class="ion-no-border shell-header">
        <ion-toolbar>
          <ion-title>{{ title() }}</ion-title>
          <ion-buttons slot="start">
            <ion-button (click)="onClose(false)">
              <ion-icon slot="icon-only" name="close-outline"></ion-icon>
            </ion-button>
          </ion-buttons>
          <ion-buttons slot="end">
            <ion-button
              [disabled]="service.isSaving()"
              (click)="onSave()"
              color="primary"
              fill="solid"
              shape="round"
            >
              @if (service.isSaving()) {
                <ion-spinner name="crescent" slot="start"></ion-spinner>
              } @else {
                <ion-icon slot="start" name="checkmark-outline"></ion-icon>
              }
              Save
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
    }

    <ion-content class="shell-content" [scrollY]="true">
      <div class="shell-container" [class.shell-container--compact]="mode() === 'compact'">
        <!-- Loading State -->
        @if (service.isLoading()) {
          <nxt1-manage-team-skeleton />
        } @else {
          <!-- Tab Navigation -->
          @if (showTabs()) {
            <div class="tab-navigation">
              @for (tab of tabs; track tab.id) {
                <button
                  type="button"
                  class="tab-btn"
                  [class.tab-btn--active]="service.activeTab() === tab.id"
                  (click)="service.setActiveTab(tab.id)"
                >
                  <ion-ripple-effect></ion-ripple-effect>
                  <ion-icon [name]="tab.icon"></ion-icon>
                  <span>{{ tab.label }}</span>
                  @if (getTabBadgeCount(tab.id) > 0) {
                    <span class="tab-badge">{{ getTabBadgeCount(tab.id) }}</span>
                  }
                </button>
              }
            </div>
          }

          <!-- Completion Progress -->
          @if (showProgress() && service.completion()) {
            <div class="completion-progress">
              <div class="progress-header">
                <span class="progress-label">Profile Completion</span>
                <span class="progress-value">{{ service.completion()?.percentage ?? 0 }}%</span>
              </div>
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  [style.width.%]="service.completion()?.percentage ?? 0"
                ></div>
              </div>
            </div>
          }

          <!-- Section Accordion -->
          <div class="sections-container">
            @for (section of visibleSections(); track section.id) {
              <div
                class="section-card"
                [class.section-card--expanded]="service.expandedSection() === section.id"
              >
                <!-- Section Header -->
                <button
                  type="button"
                  class="section-header"
                  (click)="service.toggleSection(section.id)"
                >
                  <ion-ripple-effect></ion-ripple-effect>

                  <div class="section-icon" [style.background]="getSectionColor(section.id)">
                    <ion-icon [name]="section.icon"></ion-icon>
                  </div>

                  <div class="section-info">
                    <h3 class="section-title">{{ section.title }}</h3>
                    <span class="section-description">{{ section.description }}</span>
                  </div>

                  <div class="section-status">
                    @if (getSectionStatus(section.id) === 'complete') {
                      <ion-icon name="checkmark-outline" class="status-complete"></ion-icon>
                    } @else if (getSectionStatus(section.id) === 'incomplete') {
                      <ion-icon name="alert-circle-outline" class="status-incomplete"></ion-icon>
                    }
                    <ion-icon name="chevron-forward-outline" class="chevron"></ion-icon>
                  </div>
                </button>

                <!-- Section Content -->
                @if (service.expandedSection() === section.id) {
                  <div class="section-content">
                    @switch (section.id) {
                      @case ('team-info') {
                        <nxt1-manage-team-info-section (logoUpload)="onLogoUpload()" />
                      }
                      @case ('roster') {
                        <nxt1-manage-team-roster-section
                          [players]="service.roster()"
                          (action)="onRosterAction($event)"
                        />
                      }
                      @case ('schedule') {
                        <nxt1-manage-team-schedule-section
                          [events]="service.schedule()"
                          (action)="onScheduleAction($event)"
                        />
                      }
                      @case ('stats') {
                        <nxt1-manage-team-stats-section
                          [stats]="getTeamStats()"
                          [statsIntegration]="getStatsIntegration()"
                          (action)="onStatsAction($event)"
                        />
                      }
                      @case ('staff') {
                        <nxt1-manage-team-staff-section
                          [staff]="service.staff()"
                          (action)="onStaffAction($event)"
                        />
                      }
                      @case ('sponsors') {
                        <nxt1-manage-team-sponsors-section
                          [sponsors]="service.sponsors()"
                          (action)="onSponsorAction($event)"
                        />
                      }
                    }
                  </div>
                }
              </div>
            }
          </div>

          <!-- Actions Footer (suppressed when headless — web modal provides its own save button) -->
          @if (showFooter() && !headless()) {
            <div class="actions-footer">
              @if (mode() !== 'inline') {
                <button type="button" class="cancel-btn" (click)="onClose(false)">
                  <ion-ripple-effect></ion-ripple-effect>
                  Cancel
                </button>
              }
              <button
                type="button"
                class="save-btn"
                [disabled]="service.isSaving()"
                (click)="onSave()"
              >
                <ion-ripple-effect></ion-ripple-effect>
                @if (service.isSaving()) {
                  <ion-spinner name="crescent"></ion-spinner>
                } @else {
                  <ion-icon name="checkmark-outline"></ion-icon>
                }
                <span>Save Changes</span>
              </button>
            </div>
          }
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
       MANAGE TEAM SHELL - 2026 Design Tokens
       ============================================ */

      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-background);
      }

      /* ============================================
         HEADER
         ============================================ */

      .shell-header {
        ion-toolbar {
          --background: var(--nxt1-color-surface-100);
          --border-color: var(--nxt1-color-border-subtle);
          --padding-start: var(--nxt1-spacing-4);
          --padding-end: var(--nxt1-spacing-4);
        }

        ion-title {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-lg);
          font-weight: 600;
        }

        ion-button[fill='solid'] {
          --background: var(--nxt1-color-secondary);
          --background-hover: var(--nxt1-color-secondaryLight);
          --border-radius: var(--nxt1-radius-full);
          font-family: var(--nxt1-fontFamily-brand);
          font-weight: 600;
        }
      }

      /* ============================================
         CONTENT
         ============================================ */

      .shell-content {
        --background: var(--nxt1-color-background);
      }

      .shell-container {
        padding: var(--nxt1-spacing-4);
        max-width: 800px;
        margin: 0 auto;
      }

      .shell-container--compact {
        padding: var(--nxt1-spacing-3);
      }

      /* ============================================
         TAB NAVIGATION
         ============================================ */

      .tab-navigation {
        display: flex;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        margin-bottom: var(--nxt1-spacing-4);
        overflow-x: auto;
        scrollbar-width: none;

        &::-webkit-scrollbar {
          display: none;
        }
      }

      .tab-btn {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: transparent;
        border: none;
        border-radius: var(--nxt1-radius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);
        white-space: nowrap;

        ion-icon {
          font-size: 18px;
        }

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-200);
          color: var(--nxt1-color-text-primary);
        }

        &.tab-btn--active {
          background: var(--nxt1-color-primary);
          color: var(--nxt1-color-text-onPrimary);

          &:hover,
          &:focus-visible {
            background: var(--nxt1-color-primaryDark);
            color: var(--nxt1-color-text-onPrimary);
          }
        }

        .tab-badge {
          background: var(--nxt1-color-surface-300);
          padding: 2px 6px;
          border-radius: var(--nxt1-radius-full);
          font-size: var(--nxt1-fontSize-xs);
          font-weight: 600;
        }

        &.tab-btn--active .tab-badge {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      /* ============================================
         COMPLETION PROGRESS
         ============================================ */

      .completion-progress {
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        padding: var(--nxt1-spacing-4);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .progress-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-2);
      }

      .progress-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
      }

      .progress-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 700;
        color: var(--nxt1-color-primary);
      }

      .progress-bar {
        height: 8px;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-full);
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(
          90deg,
          var(--nxt1-color-primary) 0%,
          var(--nxt1-color-secondary) 100%
        );
        border-radius: var(--nxt1-radius-full);
        transition: width var(--nxt1-transition-medium);
      }

      /* ============================================
         SECTIONS
         ============================================ */

      .sections-container {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .section-card {
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);
      }

      .section-card--expanded {
        border-color: var(--nxt1-color-primary);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .section-header {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        padding: var(--nxt1-spacing-4);
        background: transparent;
        border: none;
        cursor: pointer;
        overflow: hidden;
        text-align: left;
      }

      .section-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: var(--nxt1-radius-lg);
        flex-shrink: 0;

        ion-icon {
          font-size: 22px;
          color: var(--nxt1-color-text-onPrimary);
        }
      }

      .section-info {
        flex: 1;
        min-width: 0;
      }

      .section-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 2px;
      }

      .section-description {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
      }

      .section-status {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);

        .status-complete {
          font-size: 20px;
          color: var(--nxt1-color-success);
        }

        .status-incomplete {
          font-size: 20px;
          color: var(--nxt1-color-warning);
        }

        .chevron {
          font-size: 20px;
          color: var(--nxt1-color-text-tertiary);
          transition: transform var(--nxt1-transition-fast);
        }
      }

      .section-card--expanded .chevron {
        transform: rotate(90deg);
      }

      .section-content {
        padding: 0 var(--nxt1-spacing-4) var(--nxt1-spacing-4);
        border-top: 1px solid var(--nxt1-color-border-subtle);
        animation: slideDown var(--nxt1-transition-fast) ease-out;
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ============================================
         ACTIONS FOOTER
         ============================================ */

      .actions-footer {
        display: flex;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        margin-top: var(--nxt1-spacing-4);
      }

      .cancel-btn {
        position: relative;
        flex: 1;
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        border: none;
        border-radius: var(--nxt1-radius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-300);
        }
      }

      .save-btn {
        position: relative;
        flex: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-secondary);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        ion-icon,
        ion-spinner {
          font-size: 20px;
        }

        &:hover:not(:disabled),
        &:focus-visible:not(:disabled) {
          background: var(--nxt1-color-secondaryLight);
        }

        &:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        &:active:not(:disabled) {
          transform: scale(0.98);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamShellComponent implements OnInit {
  constructor() {
    addIcons({
      closeOutline,
      checkmarkOutline,
      informationCircleOutline,
      peopleOutline,
      calendarOutline,
      statsChartOutline,
      personOutline,
      ribbonOutline,
      linkOutline,
      chevronForwardOutline,
      alertCircleOutline,
    });
  }

  readonly service = inject(ManageTeamService);
  private readonly inviteSheet = inject(InviteBottomSheetService);

  /** Team ID to manage (null for new team) */
  readonly teamId = input<string | null>(null);

  /**
   * When headless=true, the shell is hosted by the web overlay wrapper
   * (ManageTeamWebModalComponent). The built-in ion-header and footer
   * are suppressed — the wrapper provides its own modal chrome.
   */
  readonly headless = input(false);

  /** Display mode */
  readonly mode = input<'full' | 'compact' | 'inline'>('full');

  /** Custom title */
  readonly title = input('Manage Team');

  /** Show header */
  readonly showHeader = input(true);

  /** Show tab navigation */
  readonly showTabs = input(true);

  /** Show progress bar */
  readonly showProgress = input(true);

  /** Show footer actions */
  readonly showFooter = input(true);

  /** Close event */
  readonly close = output<ManageTeamCloseEvent>();

  /** Save event */
  readonly save = output<ManageTeamFormData>();

  /** Section action event */
  readonly sectionAction = output<{
    section: ManageTeamSectionId;
    action: string;
    data?: unknown;
  }>();

  /** Available tabs */
  readonly tabs = MANAGE_TEAM_TABS;

  /** Sections config */
  readonly sections = getAllManageTeamSections();

  /** Visible sections based on active tab */
  readonly visibleSections = computed(() => {
    const activeTab = this.service.activeTab();
    if (activeTab === 'overview') return this.sections;
    // Filter by matching section id to tab id
    return this.sections.filter((s) => s.id.includes(activeTab));
  });

  ngOnInit(): void {
    // Handle teamId as both signal input and plain property (for Ionic modal componentProps)
    const teamIdValue = typeof this.teamId === 'function' ? this.teamId() : this.teamId;
    if (teamIdValue) {
      this.service.loadTeam(teamIdValue as string);
    }
  }

  getSectionStatus(sectionId: ManageTeamSectionId): 'complete' | 'incomplete' | 'empty' {
    const completion = this.service.completion();
    if (!completion) return 'empty';

    const sectionCompletion = completion.sections.find((s) => s.sectionId === sectionId);
    if (!sectionCompletion) return 'empty';

    if (sectionCompletion.percentage >= 100) return 'complete';
    if (sectionCompletion.percentage > 0) return 'incomplete';
    return 'empty';
  }

  getTabBadgeCount(tabId: ManageTeamTabId): number {
    if (tabId === 'overview') return 0;

    const completion = this.service.completion();
    if (!completion) return 0;

    const sectionCompletion = completion.sections.find((s) => s.sectionId.includes(tabId));
    return sectionCompletion && sectionCompletion.percentage < 100 ? 1 : 0;
  }

  getStatsIntegration(): null {
    return null;
  }

  getTeamStats(): {
    season?: string;
    record?: { wins: number; losses: number; ties?: number };
    pointsScored?: number;
    pointsAllowed?: number;
    rosterSize?: number;
  } | null {
    const formData = this.service.formData();
    if (!formData) return null;

    return {
      season: formData.basicInfo?.season,
      record: formData.record,
      rosterSize: formData.roster?.length ?? 0,
    };
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
    if (formData) {
      this.save.emit(formData);
      // In headless mode (web overlay), the wrapper handles close after save.
      // Only auto-close in non-headless mode (bottom sheet / standalone page).
      if (!this.headless()) {
        this.onClose(true);
      }
    }
  }

  getSectionColor(sectionId: ManageTeamSectionId): string {
    const colors: Record<string, string> = {
      'team-info': 'var(--nxt1-color-primary)',
      roster: 'var(--nxt1-color-secondary)',
      schedule: 'var(--nxt1-color-tertiary)',
      stats: 'var(--nxt1-color-warning)',
      staff: 'var(--nxt1-color-info)',
      sponsors: 'var(--nxt1-color-success)',
    };
    return colors[sectionId] ?? 'var(--nxt1-color-primary)';
  }

  onLogoUpload(): void {
    this.sectionAction.emit({ section: 'team-info', action: 'uploadLogo' });
  }

  onRosterAction(event: { action: string; playerId?: string; player?: RosterPlayer }): void {
    if (event.action === 'invite') {
      // Handle invite internally — open invite sheet with the team's context
      const formData = this.service.formData();
      void this.inviteSheet.open({
        inviteType: 'team',
        team: formData?.basicInfo
          ? {
              id: this.service.teamId() ?? '',
              name: formData.basicInfo.name ?? '',
              sport: formData.basicInfo.sport ?? '',
              memberCount: formData.roster?.length ?? 0,
            }
          : undefined,
      });
      return;
    }
    this.sectionAction.emit({ section: 'roster', action: event.action, data: event });
  }

  onScheduleAction(event: { action: string; eventId?: string; event?: TeamScheduleEvent }): void {
    this.sectionAction.emit({ section: 'schedule', action: event.action, data: event });
  }

  onStatsAction(event: { action: string }): void {
    this.sectionAction.emit({ section: 'stats', action: event.action, data: event });
  }

  onStaffAction(event: { action: string; memberId?: string; member?: StaffMember }): void {
    this.sectionAction.emit({ section: 'staff', action: event.action, data: event });
  }

  onSponsorAction(event: { action: string; sponsorId?: string; sponsor?: TeamSponsor }): void {
    this.sectionAction.emit({ section: 'sponsors', action: event.action, data: event });
  }

  /**
   * Public endpoint for the web modal wrapper to trigger save.
   * The wrapper calls this so the actual API / analytics / haptics run
   * inside the shell, then the shell emits `save` → wrapper closes overlay.
   */
  async requestSave(): Promise<void> {
    await this.onSave();
  }
}
