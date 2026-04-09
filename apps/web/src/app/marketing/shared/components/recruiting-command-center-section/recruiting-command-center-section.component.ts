/**
 * @fileoverview Recruiting Command Center Section
 * @module apps/web/features/marketing/components/recruiting-command-center-section
 * @version 1.0.0
 *
 * Shared data-aggregation section for the Recruiting Athletes persona page.
 * Represents a high-density recruiting operations dashboard with filter rails,
 * college rows, and multi-channel action buttons.
 *
 * Standards:
 * - 100% design-token driven visual styling
 * - SSR-safe deterministic IDs (no browser globals)
 * - Semantic HTML for SEO and accessibility
 * - Mobile-first responsive layout for web + mobile surfaces
 */

import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { NxtIconComponent } from '@nxt1/ui/components/icon';
import { NxtSectionHeaderComponent } from '@nxt1/ui/components/section-header';

interface CommandCenterFilterGroup {
  readonly id: string;
  readonly label: string;
  readonly options: readonly string[];
  readonly active: string;
}

interface CommandCenterCollegeRow {
  readonly id: string;
  readonly schoolName: string;
  readonly division: string;
  readonly conference: string;
  readonly stateCode: string;
  readonly positionNeed: string;
}

const FILTER_GROUPS: readonly CommandCenterFilterGroup[] = [
  {
    id: 'filter-division',
    label: 'Division',
    options: ['D1', 'D2', 'D3', 'NAIA', 'JUCO'],
    active: 'D1',
  },
  {
    id: 'filter-conference',
    label: 'Conference',
    options: ['SEC', 'ACC', 'Big Ten', 'Big 12'],
    active: 'SEC',
  },
  {
    id: 'filter-state',
    label: 'State',
    options: ['TX', 'CA', 'FL', 'GA'],
    active: 'TX',
  },
  {
    id: 'filter-position-need',
    label: 'Position Need',
    options: ['QB', 'WR', 'CB', 'LB'],
    active: 'QB',
  },
] as const;

const COLLEGE_ROWS: readonly CommandCenterCollegeRow[] = [
  {
    id: 'school-texas-am',
    schoolName: 'Texas A&M University',
    division: 'D1',
    conference: 'SEC',
    stateCode: 'TX',
    positionNeed: 'QB',
  },
  {
    id: 'school-florida-state',
    schoolName: 'Florida State University',
    division: 'D1',
    conference: 'ACC',
    stateCode: 'FL',
    positionNeed: 'WR',
  },
  {
    id: 'school-usc',
    schoolName: 'University of Southern California',
    division: 'D1',
    conference: 'Big Ten',
    stateCode: 'CA',
    positionNeed: 'CB',
  },
  {
    id: 'school-georgia-state',
    schoolName: 'Georgia State University',
    division: 'D1',
    conference: 'Sun Belt',
    stateCode: 'GA',
    positionNeed: 'LB',
  },
] as const;

const ACTION_BUTTONS = [
  { id: 'apply-camp', label: 'Apply to Camp', icon: 'calendar-outline' },
  { id: 'fill-questionnaire', label: 'Fill Questionnaire', icon: 'document-text-outline' },
  { id: 'email-coach', label: 'Email Coach', icon: 'mail-outline' },
  { id: 'dm-x', label: 'DM on X', icon: 'twitter' },
  { id: 'view-academics', label: 'View Academics', icon: 'school-outline' },
] as const;

let recruitingCommandCenterInstanceCounter = 0;

@Component({
  selector: 'nxt1-recruiting-command-center-section',
  standalone: true,
  imports: [NxtIconComponent, NxtSectionHeaderComponent],
  template: `
    <section class="command-center" [attr.aria-labelledby]="titleId()">
      <div class="command-center__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="The Recruiting Command Center"
          [headingLevel]="2"
          variant="hero"
          layout="split"
          contentPosition="end"
          title="The Entire Internet. One Dashboard."
          subtitle="Stop Googling. We have every camp, every email, every questionnaire, and every social handle for D1 to JUCO."
          support="100 tabs open? Close them. NXT1 pulls verified data directly from university athletic sites daily."
        >
          <article class="command-center__panel" [attr.aria-labelledby]="panelTitleId()">
            <header class="command-center__panel-header">
              <div class="command-center__panel-title-group">
                <p class="command-center__eyebrow">Data Aggregation</p>
                <h3 class="command-center__panel-title" [id]="panelTitleId()">
                  College Operations Control Panel
                </h3>
              </div>

              <p class="command-center__trust" role="status" aria-live="polite">
                Updated Real-Time. 2,400+ Colleges Indexed.
              </p>
            </header>

            <div class="filter-toolbar" [attr.aria-labelledby]="filtersTitleId()">
              <h4 class="filter-toolbar__title" [id]="filtersTitleId()">Filters</h4>
              <div class="filter-toolbar__groups" role="list" aria-label="Recruiting filters">
                @for (group of filterGroups; track group.id) {
                  <section class="filter-group" role="listitem" [attr.aria-labelledby]="group.id">
                    <h5 class="filter-group__label" [id]="group.id">{{ group.label }}</h5>
                    <div
                      class="filter-group__options"
                      role="list"
                      [attr.aria-label]="group.label + ' options'"
                    >
                      @for (option of group.options; track option) {
                        <span
                          class="filter-pill"
                          [class.filter-pill--active]="option === group.active"
                          role="listitem"
                        >
                          {{ option }}
                        </span>
                      }
                    </div>
                  </section>
                }
              </div>
            </div>

            <div class="dashboard-grid" role="region" [attr.aria-labelledby]="gridTitleId()">
              <h4 class="dashboard-grid__title" [id]="gridTitleId()">Program Grid</h4>

              <div
                class="dashboard-grid__rows"
                role="list"
                aria-label="College recruiting action rows"
              >
                @for (row of collegeRows; track row.id) {
                  <article class="college-card" role="listitem" [attr.aria-label]="row.schoolName">
                    <div class="college-card__meta">
                      <p class="college-card__school">{{ row.schoolName }}</p>
                      <p class="college-card__details">
                        {{ row.division }} · {{ row.conference }} · {{ row.stateCode }} · Need:
                        {{ row.positionNeed }}
                      </p>
                    </div>

                    <div
                      class="college-card__actions"
                      role="group"
                      [attr.aria-label]="row.schoolName + ' actions'"
                    >
                      @for (action of actions; track action.id) {
                        <button type="button" class="action-button">
                          <nxt1-icon [name]="action.icon" size="13" />
                          <span>{{ action.label }}</span>
                        </button>
                      }
                    </div>
                  </article>
                }
              </div>
            </div>
          </article>
        </nxt1-section-header>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .command-center {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      .command-center__shell {
        display: grid;
        gap: var(--nxt1-spacing-8);
      }

      .command-center__panel {
        display: grid;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-shadow-md);
      }

      .command-center__panel-header {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: var(--nxt1-spacing-4);
        flex-wrap: wrap;
      }

      .command-center__panel-title-group {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
      }

      .command-center__eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .command-center__panel-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .command-center__trust {
        margin: 0;
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary6);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        width: 100%;
        text-align: center;
      }

      .filter-toolbar {
        display: grid;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .filter-toolbar__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .filter-toolbar__groups {
        display: grid;
        gap: var(--nxt1-spacing-3);
        grid-template-columns: minmax(0, 1fr);
      }

      .filter-group {
        display: grid;
        gap: var(--nxt1-spacing-2);
        align-content: start;
      }

      .filter-group__label {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .filter-group__options {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
      }

      .filter-pill {
        display: inline-flex;
        align-items: center;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-surface-100);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .filter-pill--active {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-inverse);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .dashboard-grid {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .dashboard-grid__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .dashboard-grid__rows {
        display: grid;
        gap: var(--nxt1-spacing-3);
        grid-template-columns: minmax(0, 1fr);
      }

      .college-card {
        display: grid;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3_5);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .college-card__meta {
        display: grid;
        gap: var(--nxt1-spacing-1);
      }

      .college-card__school {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .college-card__details {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .college-card__actions {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--nxt1-spacing-2);
      }

      .college-card__actions .action-button:last-child {
        grid-column: 1 / -1;
      }

      .action-button {
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: var(--nxt1-spacing-1_5);
        min-height: var(--nxt1-spacing-8);
        padding: 0 var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-alpha-primary25);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        cursor: pointer;
        transition:
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-standard),
          background-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-standard),
          color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-standard);
      }

      .action-button:hover {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary8);
        color: var(--nxt1-color-primary);
      }

      .action-button:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      /* ────────────────────────────────────────────────
         Responsive: mobile-first using design-token
         breakpoints (md = 768px, lg = 992px)
         ──────────────────────────────────────────────── */

      @media (min-width: 768px) {
        .command-center__panel {
          padding: var(--nxt1-spacing-5);
        }

        .command-center__panel-title {
          font-size: var(--nxt1-fontSize-xl);
        }

        .command-center__trust {
          width: auto;
          text-align: start;
        }

        .filter-toolbar__groups {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .college-card__actions {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (min-width: 992px) {
        .filter-toolbar__groups {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .dashboard-grid__rows {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtRecruitingCommandCenterSectionComponent {
  private readonly instanceId = ++recruitingCommandCenterInstanceCounter;

  protected readonly filterGroups = FILTER_GROUPS;
  protected readonly collegeRows = COLLEGE_ROWS;
  protected readonly actions = ACTION_BUTTONS;

  readonly titleId = computed(() => `recruiting-command-center-title-${this.instanceId}`);
  readonly panelTitleId = computed(() => `recruiting-command-center-panel-${this.instanceId}`);
  readonly filtersTitleId = computed(() => `recruiting-command-center-filters-${this.instanceId}`);
  readonly gridTitleId = computed(() => `recruiting-command-center-grid-${this.instanceId}`);
}
