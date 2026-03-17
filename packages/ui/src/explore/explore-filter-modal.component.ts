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
import { IonContent, IonLabel, IonRange, IonToggle } from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular/standalone';
import { NxtChipComponent } from '../components/chip';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet';
import { NxtIconComponent } from '../components/icon';
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

@Component({
  selector: 'nxt1-explore-filter-modal',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonLabel,
    IonRange,
    IonToggle,
    NxtChipComponent,
    NxtSheetHeaderComponent,
    NxtIconComponent,
  ],
  template: `
    <nxt1-sheet-header [title]="filterTitle()" [showBorder]="true" (closeSheet)="onCancel()">
      <div sheetHeaderAction class="filter-header-actions">
        @if (activeFilterCount() > 0) {
          <span class="filter-count">{{ activeFilterCount() }}</span>
        }
        <button
          type="button"
          class="filter-reset-btn"
          [disabled]="activeFilterCount() === 0"
          (click)="onReset()"
        >
          <nxt1-icon name="refresh" [size]="16" />
          Reset
        </button>
      </div>
    </nxt1-sheet-header>

    <ion-content class="filter-scroll-content">
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

    <div class="filter-footer">
      <button type="button" class="filter-apply-btn" (click)="onApply()">
        <nxt1-icon name="checkmark" [size]="18" />
        Apply Filters
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-background-primary);
      }

      /* ============================================
       * Header Actions (badge + reset)
       * ============================================ */
      .filter-header-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .filter-count {
        display: inline-flex;
        min-width: 20px;
        height: 20px;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-on-primary);
        font-size: 11px;
        font-weight: 700;
        padding: 0 5px;
      }

      .filter-reset-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        border: none;
        background: none;
        color: var(--nxt1-color-text-secondary);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        padding: 6px 8px;
        border-radius: var(--nxt1-radius-sm, 6px);
        transition:
          color 0.15s ease,
          opacity 0.15s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .filter-reset-btn:hover:not(:disabled) {
        color: var(--nxt1-color-text-primary);
      }

      .filter-reset-btn:disabled {
        opacity: 0.35;
        cursor: default;
      }

      /* ============================================
       * Scrollable Content
       * ============================================ */
      .filter-scroll-content {
        --background: var(--nxt1-color-background-primary);
        flex: 1;
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

      /* ============================================
       * Sticky Footer
       * ============================================ */
      .filter-footer {
        flex-shrink: 0;
        padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
        border-top: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-background-elevated);
      }

      .filter-apply-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        min-height: 48px;
        border: none;
        border-radius: var(--nxt1-radius-md, 10px);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-on-primary);
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: opacity 0.15s ease;
      }

      .filter-apply-btn:active {
        opacity: 0.85;
        transform: scale(0.99);
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

  protected readonly filterTitle = computed(() => `Filters · ${this.activeTabLabel()}`);

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
