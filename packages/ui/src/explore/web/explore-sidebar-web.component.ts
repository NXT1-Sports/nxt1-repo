import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  type ExploreTabId,
  type ExploreFilters,
  EXPLORE_FILTER_SPORT_OPTIONS,
  EXPLORE_FILTER_STATE_OPTIONS,
  EXPLORE_TAB_FILTER_FIELDS,
} from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../components/icon';

interface ExploreSidebarContent {
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly focusLabel: string;
  readonly focusValue: string;
  readonly laneLabel: string;
  readonly laneValue: string;
  readonly bullets: readonly string[];
  readonly tags: readonly string[];
}

const DEFAULT_SIDEBAR_CONTENT: ExploreSidebarContent = {
  eyebrow: 'Agent X Briefing',
  title: 'Professional Discovery Flow',
  summary:
    'Use the left rail to switch lanes, keep the main column focused, and let the right rail surface context instead of noise.',
  focusLabel: 'Current Mode',
  focusValue: 'Explore command center',
  laneLabel: 'Best Use',
  laneValue: 'Scan high-value people, programs, and headlines without losing context.',
  bullets: [
    'A narrower center feed keeps cards, headlines, and imagery readable on wide screens.',
    'The right rail gives Agent X a dedicated space for guidance, momentum, and quick reads.',
    'This desktop layout feels like a platform, not a stretched mobile page.',
  ],
  tags: ['Command Center', 'Desktop First', 'Focused Feed'],
};

const SIDEBAR_CONTENT_BY_TAB: Partial<Record<ExploreTabId, ExploreSidebarContent>> = {
  news: {
    eyebrow: 'Pulse Briefing',
    title: 'Editorial Feed With Desktop Discipline',
    summary:
      'Pulse reads better when the article column is capped. It stops large cards from feeling oversized and gives headlines room to breathe.',
    focusLabel: 'Current Mode',
    focusValue: 'Recruiting and sports news intelligence',
    laneLabel: 'Best Use',
    laneValue: 'Read, compare, and move between stories without the page looking stretched.',
    bullets: [
      'The main column becomes a true editorial lane instead of a full-width card wall.',
      'The right rail can spotlight trends, themes, and what Agent X thinks matters.',
      'Desktop users get a premium media experience instead of a blown-up mobile feed.',
    ],
    tags: ['Pulse', 'Editorial', 'Trend Watch'],
  },
  'scout-reports': {
    eyebrow: 'Scout Desk',
    title: 'Scouting With Better Visual Hierarchy',
    summary:
      'Reports need structure. The new layout makes the main reading lane tighter and reserves the right rail for context, filters, and takeaways.',
    focusLabel: 'Current Mode',
    focusValue: 'Player evaluation and scouting intelligence',
    laneLabel: 'Best Use',
    laneValue: 'Compare reports and move through insights without visual overload.',
    bullets: [
      'The main report lane stays readable across large monitors.',
      'The right rail becomes a premium space for summary context and actions.',
      'This desktop treatment feels closer to a real recruiting operations tool.',
    ],
    tags: ['Scouting', 'Evaluation', 'Operations'],
  },
};

@Component({
  selector: 'nxt1-explore-sidebar-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <aside
      class="sidebar-shell"
      [attr.data-testid]="testIds.SIDEBAR"
      aria-label="Explore insights panel"
    >
      <!-- Context Briefing Card -->
      <section class="sidebar-card sidebar-card--hero">
        <span class="sidebar-eyebrow">{{ content().eyebrow }}</span>
        <h2 class="sidebar-title">{{ content().title }}</h2>
        <p class="sidebar-summary">{{ content().summary }}</p>

        @if (hasQuery()) {
          <div class="query-chip-row" aria-label="Active search context">
            <span class="query-chip">Searching</span>
            <span class="query-value">{{ query() }}</span>
          </div>
        }
      </section>

      <!-- Detect Location Prompt — shown when user has no state set -->
      @if (!userState()) {
        <section class="sidebar-card sidebar-card--location" aria-label="Detect your location">
          <div class="location-prompt">
            <svg
              class="location-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <div class="location-text">
              <span class="location-heading">Set your location</span>
              <span class="location-description"
                >Get local sports news &amp; athletes near you</span
              >
            </div>
          </div>
          <button
            type="button"
            class="location-detect-btn"
            [attr.data-testid]="testIds.DETECT_LOCATION_BTN"
            [disabled]="detectingLocation()"
            (click)="onDetectLocation()"
          >
            @if (detectingLocation()) {
              <span class="location-spinner"></span>
              Detecting…
            } @else {
              <svg
                class="location-btn-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="2" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="22" y2="12" />
              </svg>
              Detect my location
            }
          </button>
        </section>
      }

      <!-- Filters Card — always visible when tab has filters -->
      @if (hasFilters()) {
        <section class="sidebar-card sidebar-card--filters" aria-label="Filters">
          <div class="filters-header">
            <h2 class="filters-title">
              <nxt1-icon name="funnel" [size]="16" />
              Filters
              @if (activeFilterCount() > 0) {
                <span class="filters-count">{{ activeFilterCount() }}</span>
              }
            </h2>
            @if (activeFilterCount() > 0) {
              <button type="button" class="filters-reset" (click)="onReset()">Clear all</button>
            }
          </div>

          <!-- Sport filter -->
          @if (fields().sport) {
            <div class="filter-group" [attr.data-testid]="testIds.FILTER_SPORT">
              <label class="filter-label">Sport</label>
              <div class="filter-chips">
                @for (sport of sportOptions; track sport) {
                  <button
                    type="button"
                    class="filter-chip"
                    [class.filter-chip--active]="filters().sport === sport"
                    (click)="toggleSport(sport)"
                  >
                    {{ sport }}
                  </button>
                }
              </div>
            </div>
          }

          <!-- State filter -->
          @if (fields().state) {
            <div class="filter-group" [attr.data-testid]="testIds.FILTER_STATE">
              <label class="filter-label" for="sidebar-state-filter">State</label>
              <select
                id="sidebar-state-filter"
                class="filter-select"
                [value]="filters().state ?? ''"
                (change)="onStateChange($event)"
              >
                <option value="">All States</option>
                @for (state of stateOptions; track state) {
                  <option [value]="state">{{ state }}</option>
                }
              </select>
            </div>
          }
        </section>
      }
    </aside>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .sidebar-shell {
        position: sticky;
        top: calc(var(--nxt1-spacing-6, 24px) + 72px);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 16px);
        width: 100%;
      }

      .sidebar-card {
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-radius-lg, 16px);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        padding: 16px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
        overflow: hidden;
      }

      .sidebar-card--hero {
        background:
          radial-gradient(circle at top right, rgba(204, 255, 0, 0.12), transparent 44%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01)),
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      .sidebar-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .sidebar-title {
        margin: 0;
        font-size: 1.15rem;
        line-height: 1.2;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .sidebar-summary {
        margin: 10px 0 0;
        font-size: 0.88rem;
        line-height: 1.55;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.72));
      }

      .query-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }

      .query-chip,
      .query-value {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        border-radius: var(--nxt1-radius-full, 9999px);
        padding: 0 10px;
        font-size: 0.74rem;
        font-weight: 600;
      }

      .query-chip {
        background: rgba(204, 255, 0, 0.12);
        color: var(--nxt1-color-primary, #ccff00);
        border: 1px solid rgba(204, 255, 0, 0.14);
      }

      .query-value {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--nxt1-color-text-primary, #ffffff);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      /* ============================================
         FILTERS CARD
         ============================================ */

      .sidebar-card--filters {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .filters-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .filters-title {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .filters-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        height: 22px;
        padding: 0 7px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: rgba(204, 255, 0, 0.14);
        border: 1px solid rgba(204, 255, 0, 0.2);
        color: var(--nxt1-color-primary, #ccff00);
        font-size: 0.72rem;
        font-weight: 700;
        line-height: 1;
      }

      .filters-reset {
        border: none;
        background: none;
        font-size: 0.76rem;
        font-weight: 600;
        color: var(--nxt1-color-primary, #ccff00);
        cursor: pointer;
        padding: 4px 8px;
        border-radius: var(--nxt1-radius-sm, 6px);
        transition: opacity 0.15s ease;
      }

      .filters-reset:hover {
        opacity: 0.8;
      }

      .filter-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .filter-group--row {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }

      .filter-label {
        font-size: 0.76rem;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .filter-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .filter-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 5px 10px;
        border-radius: var(--nxt1-borderRadius-md, 6px);
        font-size: 0.74rem;
        font-weight: 500;
        line-height: 1;
        white-space: nowrap;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .filter-chip:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .filter-chip--active {
        background: rgba(204, 255, 0, 0.12);
        border-color: rgba(204, 255, 0, 0.25);
        color: var(--nxt1-color-primary, #ccff00);
        font-weight: 600;
      }

      .filter-chip--active:hover {
        background: rgba(204, 255, 0, 0.18);
      }

      .filter-select {
        width: 100%;
        padding: 8px 12px;
        border-radius: var(--nxt1-borderRadius-md, 6px);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: 0.82rem;
        font-weight: 500;
        appearance: none;
        cursor: pointer;
        transition: border-color 0.15s ease;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
        padding-right: 30px;
      }

      .filter-select:focus {
        outline: none;
        border-color: var(--nxt1-color-primary, #ccff00);
      }

      .filter-select option {
        background: var(--nxt1-color-background-primary, #111);
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      /* Toggle */
      .filter-toggle {
        border: none;
        background: none;
        padding: 0;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .filter-toggle__track {
        display: flex;
        align-items: center;
        width: 36px;
        height: 20px;
        border-radius: 10px;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        padding: 2px;
        transition: background 0.2s ease;
      }

      .filter-toggle--active .filter-toggle__track {
        background: var(--nxt1-color-primary, #ccff00);
      }

      .filter-toggle__thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #ffffff;
        transition: transform 0.2s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      }

      .filter-toggle--active .filter-toggle__thumb {
        transform: translateX(16px);
        background: var(--nxt1-color-on-primary, #000);
      }

      @media (max-width: 1200px) {
        .sidebar-shell {
          position: static;
        }
      }

      /* ============================================
         DETECT LOCATION CARD
         ============================================ */

      .sidebar-card--location {
        display: flex;
        flex-direction: column;
        gap: 12px;
        background:
          radial-gradient(circle at bottom left, rgba(59, 130, 246, 0.1), transparent 50%),
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      .location-prompt {
        display: flex;
        align-items: flex-start;
        gap: 10px;
      }

      .location-icon {
        flex-shrink: 0;
        width: 22px;
        height: 22px;
        color: var(--nxt1-color-primary, #ccff00);
        margin-top: 1px;
      }

      .location-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .location-heading {
        font-size: 0.84rem;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .location-description {
        font-size: 0.76rem;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        line-height: 1.4;
      }

      .location-detect-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        padding: 8px 14px;
        border: 1px solid rgba(204, 255, 0, 0.2);
        border-radius: var(--nxt1-borderRadius-md, 6px);
        background: rgba(204, 255, 0, 0.08);
        color: var(--nxt1-color-primary, #ccff00);
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .location-detect-btn:hover:not(:disabled) {
        background: rgba(204, 255, 0, 0.14);
        border-color: rgba(204, 255, 0, 0.3);
      }

      .location-detect-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .location-btn-icon {
        width: 16px;
        height: 16px;
      }

      .location-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(204, 255, 0, 0.3);
        border-top-color: var(--nxt1-color-primary, #ccff00);
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreSidebarWebComponent {
  protected readonly testIds = TEST_IDS.EXPLORE;
  readonly activeTab = input<ExploreTabId | null>(null);
  readonly activeFilterCount = input(0);
  readonly hasQuery = input(false);
  readonly query = input('');
  readonly filters = input<ExploreFilters>({});
  readonly filtersChange = output<ExploreFilters>();

  /** The user's current state — null when not set */
  readonly userState = input<string | null>(null);
  /** Whether geolocation is in-progress (driven by parent) */
  readonly detectingLocation = input(false);
  /** Emitted when user clicks "Detect my location" */
  readonly detectLocation = output<void>();

  protected readonly sportOptions = EXPLORE_FILTER_SPORT_OPTIONS;
  protected readonly stateOptions = EXPLORE_FILTER_STATE_OPTIONS;

  protected readonly content = computed<ExploreSidebarContent>(() => {
    const activeTab = this.activeTab();
    if (!activeTab) return DEFAULT_SIDEBAR_CONTENT;
    return SIDEBAR_CONTENT_BY_TAB[activeTab] ?? DEFAULT_SIDEBAR_CONTENT;
  });

  /** Which filter fields are visible for the active tab */
  protected readonly fields = computed(() => {
    const tab = this.activeTab();
    if (!tab)
      return {
        sport: false,
        state: false,
        division: false,
        position: false,
        classYear: false,
        radius: false,
      };
    return (
      EXPLORE_TAB_FILTER_FIELDS[tab] ?? {
        sport: false,
        state: false,
        division: false,
        position: false,
        classYear: false,
        radius: false,
      }
    );
  });

  /** Whether any filter group is shown for this tab */
  protected readonly hasFilters = computed(() => {
    const f = this.fields();
    return f.sport || f.state || f.division || f.position || f.classYear || f.radius;
  });

  protected toggleSport(sport: string): void {
    const current = this.filters();
    const next: ExploreFilters =
      current.sport === sport ? { ...current, sport: undefined } : { ...current, sport };
    this.filtersChange.emit(next);
  }

  protected onStateChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.filtersChange.emit({ ...this.filters(), state: value || undefined });
  }

  protected onReset(): void {
    this.filtersChange.emit({});
  }

  protected onDetectLocation(): void {
    this.detectLocation.emit();
  }
}
