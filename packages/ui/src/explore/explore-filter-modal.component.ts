/**
 * @fileoverview Explore Filter Modal Component
 * @module @nxt1/ui/explore
 * @version 1.0.0
 *
 * Shared filter UI for Explore tabs.
 * Opened via ExploreFilterModalService with adaptive presentation:
 * - Mobile: bottom sheet
 * - Web/Desktop: centered modal
 */

import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonFooter,
  IonLabel,
  IonRange,
  IonToggle,
} from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular/standalone';
import { NxtChipComponent } from '../components/chip';
import { addIcons } from 'ionicons';
import { closeOutline, refreshOutline, checkmarkOutline } from 'ionicons/icons';
import {
  type ExploreFilters,
  type ExploreTabId,
  EXPLORE_TABS,
  EXPLORE_FILTER_SPORT_OPTIONS,
  EXPLORE_FILTER_DIVISION_OPTIONS,
  EXPLORE_FILTER_STATE_OPTIONS,
  EXPLORE_FILTER_RADIUS_CONFIG,
  getExploreFilterClassYearOptions,
  EXPLORE_TAB_FILTER_FIELDS,
} from '@nxt1/core';

addIcons({ closeOutline, refreshOutline, checkmarkOutline });

@Component({
  selector: 'nxt1-explore-filter-modal',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonFooter,
    IonLabel,
    IonRange,
    IonToggle,
    NxtChipComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button fill="clear" (click)="onCancel()">
            <ion-icon name="close-outline" slot="icon-only" />
          </ion-button>
        </ion-buttons>

        <ion-title>
          Filters · {{ activeTabLabel() }}
          @if (activeFilterCount() > 0) {
            <span class="filter-count">{{ activeFilterCount() }}</span>
          }
        </ion-title>

        <ion-buttons slot="end">
          <ion-button fill="clear" [disabled]="activeFilterCount() === 0" (click)="onReset()">
            <ion-icon name="refresh-outline" slot="start" />
            Reset
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="filter-content">
      @if (fields().sport) {
        <section class="filter-section">
          <h3>Sport</h3>
          <div class="filter-chips">
            @for (sport of sportOptions; track sport) {
              <nxt1-chip
                size="sm"
                [selected]="draftFilters().sport === sport"
                (chipClick)="toggleSport(sport)"
              >
                {{ sport }}
              </nxt1-chip>
            }
          </div>
        </section>
      }

      @if (fields().division) {
        <section class="filter-section">
          <h3>Division</h3>
          <div class="filter-chips">
            @for (division of divisionOptions; track division) {
              <nxt1-chip
                size="sm"
                [selected]="draftFilters().division === division"
                (chipClick)="toggleDivision(division)"
              >
                {{ division }}
              </nxt1-chip>
            }
          </div>
        </section>
      }

      @if (fields().classYear) {
        <section class="filter-section">
          <h3>Class Year</h3>
          <div class="filter-chips">
            @for (year of classYearOptions; track year) {
              <nxt1-chip
                size="sm"
                [selected]="draftFilters().classYear === year"
                (chipClick)="toggleClassYear(year)"
              >
                {{ year }}
              </nxt1-chip>
            }
          </div>
        </section>
      }

      @if (fields().radius) {
        <section class="filter-section">
          <h3>Distance Radius</h3>
          <div class="range-label">{{ draftFilters().radius ?? radiusConfig.default }} miles</div>
          <ion-range
            [min]="radiusConfig.min"
            [max]="radiusConfig.max"
            [step]="radiusConfig.step"
            [pin]="true"
            [snaps]="true"
            [ticks]="true"
            [value]="draftFilters().radius ?? radiusConfig.default"
            (ionChange)="onRadiusChange($event)"
          >
            <ion-label slot="start">{{ radiusConfig.min }}</ion-label>
            <ion-label slot="end">{{ radiusConfig.max }}</ion-label>
          </ion-range>
        </section>
      }

      @if (fields().position) {
        <section class="filter-section">
          <h3>Position</h3>
          <input
            class="nxt1-filter-input"
            type="text"
            placeholder="e.g. QB, WR, Point Guard"
            [value]="draftFilters().position ?? ''"
            (input)="setPosition($event)"
          />
        </section>
      }

      @if (fields().state) {
        <section class="filter-section">
          <h3>State</h3>
          <input
            class="nxt1-filter-input"
            type="text"
            list="nxt1-explore-filter-states"
            placeholder="Select state"
            maxlength="2"
            [value]="draftFilters().state ?? ''"
            (input)="setState($event)"
          />
          <datalist id="nxt1-explore-filter-states">
            @for (state of stateOptions; track state) {
              <option [value]="state"></option>
            }
          </datalist>
        </section>
      }

      @if (fields().verifiedOnly) {
        <section class="filter-section row">
          <div>
            <h3>Verified Only</h3>
            <p>Show only verified athletes, teams, or creators</p>
          </div>
          <ion-toggle
            [checked]="draftFilters().verifiedOnly === true"
            (ionChange)="toggleVerified($event)"
          />
        </section>
      }
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-button expand="block" class="apply-btn" (click)="onApply()">
          <ion-icon name="checkmark-outline" slot="start" />
          Apply Filters
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        --ion-background-color: var(--nxt1-color-background-primary);
        background: var(--nxt1-color-background-primary);
      }

      ion-header {
        --ion-toolbar-background: var(--nxt1-color-background-elevated);
      }

      ion-toolbar {
        --background: var(--nxt1-color-background-elevated);
        --border-color: var(--nxt1-color-border-subtle);
      }

      ion-title {
        font-size: var(--nxt1-fontSize-lg);
      }

      .filter-count {
        margin-left: 8px;
        display: inline-flex;
        min-width: 18px;
        height: 18px;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-on-primary);
        font-size: 11px;
        font-weight: 700;
      }

      .filter-content {
        --background: var(--nxt1-color-background-primary);
        --ion-background-color: var(--nxt1-color-background-primary);
      }

      .filter-section {
        padding: 16px;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .filter-section h3 {
        margin: 0 0 10px 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .filter-section p {
        margin: 0;
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary);
      }

      .filter-section.row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .filter-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .nxt1-filter-input {
        width: 100%;
        border: 1px solid var(--nxt1-color-border);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        border-radius: 10px;
        min-height: 40px;
        padding: 0 12px;
        font-size: 14px;
      }

      .nxt1-filter-input:focus {
        outline: none;
        border-color: var(--nxt1-color-primary);
      }

      .range-label {
        margin-bottom: 8px;
        font-size: 13px;
        color: var(--nxt1-color-text-secondary);
      }

      ion-footer {
        --ion-toolbar-background: var(--nxt1-color-background-elevated);
      }

      ion-footer ion-toolbar {
        --background: var(--nxt1-color-background-elevated);
        --padding-start: 16px;
        --padding-end: 16px;
        --padding-top: 12px;
        --padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      }

      .apply-btn {
        --background: var(--nxt1-color-primary);
        --color: var(--nxt1-color-on-primary);
        font-weight: 700;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreFilterModalComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);

  activeTab: ExploreTabId = 'feed';
  initialFilters: ExploreFilters = {};

  protected readonly sportOptions = EXPLORE_FILTER_SPORT_OPTIONS;
  protected readonly divisionOptions = EXPLORE_FILTER_DIVISION_OPTIONS;
  protected readonly classYearOptions = getExploreFilterClassYearOptions();
  protected readonly stateOptions = EXPLORE_FILTER_STATE_OPTIONS;
  protected readonly radiusConfig = EXPLORE_FILTER_RADIUS_CONFIG;

  protected readonly draftFilters = signal<ExploreFilters>({});

  protected readonly fields = computed(() => EXPLORE_TAB_FILTER_FIELDS[this.activeTab]);

  protected readonly activeTabLabel = computed(() => {
    return EXPLORE_TABS.find((tab) => tab.id === this.activeTab)?.label ?? 'Explore';
  });

  protected readonly activeFilterCount = computed(() => {
    const filters = this.draftFilters();
    let count = 0;

    if (filters.sport) count += 1;
    if (filters.state) count += 1;
    if (filters.division) count += 1;
    if (filters.position) count += 1;
    if (typeof filters.classYear === 'number') count += 1;
    if (typeof filters.radius === 'number') count += 1;
    if (filters.verifiedOnly === true) count += 1;

    return count;
  });

  ngOnInit(): void {
    this.draftFilters.set(this.normalizeFilters(this.initialFilters));
  }

  protected onCancel(): void {
    this.modalCtrl.dismiss({ confirmed: false, filters: this.initialFilters }, 'cancel');
  }

  protected onReset(): void {
    this.draftFilters.set({});
  }

  protected onApply(): void {
    this.modalCtrl.dismiss(
      {
        confirmed: true,
        filters: this.normalizeFilters(this.draftFilters()),
      },
      'apply'
    );
  }

  protected toggleSport(sport: string): void {
    this.draftFilters.update((current) => ({
      ...current,
      sport: current.sport === sport ? undefined : sport,
    }));
  }

  protected toggleDivision(division: string): void {
    this.draftFilters.update((current) => ({
      ...current,
      division: current.division === division ? undefined : division,
    }));
  }

  protected toggleClassYear(classYear: number): void {
    this.draftFilters.update((current) => ({
      ...current,
      classYear: current.classYear === classYear ? undefined : classYear,
    }));
  }

  protected onRadiusChange(event: Event): void {
    const customEvent = event as CustomEvent<{ value?: number | { lower: number; upper: number } }>;
    const value = customEvent.detail?.value;

    if (typeof value === 'number') {
      this.draftFilters.update((current) => ({
        ...current,
        radius: value,
      }));
    }
  }

  protected setPosition(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draftFilters.update((current) => ({
      ...current,
      position: value || undefined,
    }));
  }

  protected setState(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draftFilters.update((current) => ({
      ...current,
      state: value ? value.toUpperCase() : undefined,
    }));
  }

  protected toggleVerified(event: Event): void {
    const customEvent = event as CustomEvent<{ checked: boolean }>;
    this.draftFilters.update((current) => ({
      ...current,
      verifiedOnly: customEvent.detail?.checked ? true : undefined,
    }));
  }

  private normalizeFilters(filters: ExploreFilters): ExploreFilters {
    return {
      ...(filters.sport?.trim() ? { sport: filters.sport.trim() } : {}),
      ...(filters.state?.trim() ? { state: filters.state.trim().toUpperCase() } : {}),
      ...(filters.division?.trim() ? { division: filters.division.trim() } : {}),
      ...(filters.position?.trim() ? { position: filters.position.trim() } : {}),
      ...(typeof filters.classYear === 'number' ? { classYear: filters.classYear } : {}),
      ...(typeof filters.radius === 'number' ? { radius: filters.radius } : {}),
      ...(filters.verifiedOnly === true ? { verifiedOnly: true } : {}),
    };
  }
}
