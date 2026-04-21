/**
 * @fileoverview Agent Onboarding Program Search Step
 * @module @nxt1/ui/agent-x/onboarding
 * @version 1.0.0
 *
 * Coach-specific step for searching, claiming, or creating a program.
 * Includes search input, results list, create new option, and role selection.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  input,
  output,
  computed,
} from '@angular/core';
import {
  type AgentProgramResult,
  type CoachProgramRole,
  type SelectedProgramData,
  COACH_ROLE_OPTIONS,
  ORG_TYPE_OPTIONS,
  formatSportDisplayName,
} from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../components/icon/icon.component';
import { NxtSearchBarComponent } from '../../components/search-bar/search-bar.component';
import { HapticsService } from '../../services/haptics/haptics.service';

@Component({
  selector: 'nxt1-agent-onboarding-program',
  standalone: true,
  imports: [NxtIconComponent, NxtSearchBarComponent],
  template: `
    <section class="program-container" [attr.data-testid]="testIds.PROGRAM_STEP">
      <!-- ══════════════════ SEARCH PHASE ══════════════════ -->
      @if (!selectedProgram() && !isCreating()) {
        <div class="search-section">
          <nxt1-search-bar
            variant="desktop-centered"
            placeholder="Search by school or program name..."
            [value]="searchQuery()"
            [attr.data-testid]="testIds.PROGRAM_SEARCH_INPUT"
            (searchInput)="onSearchInput($event)"
            (searchClear)="clearSearch()"
          />

          @if (isSearching()) {
            <div class="results-list">
              @for (i of [1, 2, 3]; track i) {
                <div class="result-skeleton animate-pulse">
                  <div class="skeleton-avatar"></div>
                  <div class="skeleton-text">
                    <div class="skeleton-line skeleton-line--title"></div>
                    <div class="skeleton-line skeleton-line--sub"></div>
                  </div>
                </div>
              }
            </div>
          } @else if (searchResults().length > 0) {
            <div class="results-list" role="listbox" aria-label="Search results">
              @for (program of searchResults(); track program.id) {
                <button
                  type="button"
                  class="result-card"
                  role="option"
                  [attr.data-testid]="testIds.PROGRAM_RESULT"
                  (click)="selectProgram(program, 'claim')"
                >
                  <div
                    class="result-avatar"
                    [style.background-color]="
                      program.primaryColor || 'var(--nxt1-color-surface-200)'
                    "
                  >
                    @if (program.logoUrl) {
                      <img [src]="program.logoUrl" [alt]="program.name" class="result-logo" />
                    } @else {
                      <nxt1-icon name="school-outline" [size]="20" />
                    }
                  </div>
                  <div class="result-info">
                    <span class="result-name">{{ program.name }}</span>
                    <span class="result-meta">
                      @if (program.sport) {
                        {{ formatSportDisplayName(program.sport) }} ·
                      }
                      @if (program.city && program.state) {
                        {{ program.city }}, {{ program.state }}
                      } @else if (program.state) {
                        {{ program.state }}
                      }
                    </span>
                  </div>
                  @if (program.isClaimed) {
                    <span class="result-badge claimed">Claimed</span>
                  } @else {
                    <nxt1-icon name="chevron-forward" [size]="18" className="result-arrow" />
                  }
                </button>
              }
            </div>
          } @else if (searchQuery().length >= 2) {
            <!-- No results + Create CTA -->
            <div class="no-results">
              <nxt1-icon name="search-outline" [size]="32" className="no-results-icon" />
              <p class="no-results-title">No programs found</p>
              <p class="no-results-sub">No results for "{{ searchQuery() }}"</p>
            </div>

            <button
              type="button"
              class="create-program-btn"
              [attr.data-testid]="testIds.PROGRAM_CREATE_BTN"
              (click)="startCreateFlow()"
            >
              <div class="create-icon-wrap">
                <nxt1-icon name="add" [size]="20" />
              </div>
              <div class="create-info">
                <span class="create-label">Create Program</span>
                <span class="create-hint">Add "{{ searchQuery() }}" as a new program</span>
              </div>
              <nxt1-icon name="chevron-forward" [size]="18" className="result-arrow" />
            </button>
          }
        </div>
      }

      <!-- ══════════════════ CREATE WIZARD ══════════════════ -->
      @if (isCreating()) {
        <div class="create-wizard">
          <div class="wizard-header">
            <button type="button" class="back-btn" (click)="cancelCreate()">
              <nxt1-icon name="arrow-back" [size]="18" />
            </button>
            <span class="wizard-title">
              @if (createStep() === 1) {
                Select Organization Type
              }
              @if (createStep() === 2) {
                Add Location Details
              }
            </span>
            <div class="wizard-steps">
              <span class="wizard-dot" [class.wizard-dot--active]="createStep() === 1"></span>
              <span class="wizard-dot" [class.wizard-dot--active]="createStep() === 2"></span>
            </div>
          </div>

          @if (createStep() === 1) {
            <div class="wizard-body">
              <p class="wizard-hint">What type of organization is this program?</p>
              <div class="org-grid">
                @for (org of orgTypes; track org.id) {
                  <button
                    type="button"
                    class="org-card"
                    [class.org-card--selected]="selectedOrgType() === org.id"
                    (click)="selectOrgType(org.id)"
                  >
                    <nxt1-icon [name]="org.icon" [size]="22" className="org-icon" />
                    <span class="org-label">{{ org.label }}</span>
                  </button>
                }
              </div>
              <button
                type="button"
                class="wizard-next-btn"
                [disabled]="!selectedOrgType()"
                (click)="goToCreateStep2()"
              >
                Next
                <nxt1-icon name="arrow-forward" [size]="16" className="btn-icon" />
              </button>
            </div>
          }

          @if (createStep() === 2) {
            <div class="wizard-body">
              <p class="wizard-hint">Where is this program located?</p>
              <div class="location-fields">
                <div class="field-group">
                  <label class="field-label" for="create-city">City</label>
                  <input
                    id="create-city"
                    type="text"
                    class="field-input"
                    placeholder="e.g. Springfield"
                    [value]="createCity()"
                    (input)="createCity.set($any($event.target).value)"
                  />
                </div>
                <div class="field-group">
                  <label class="field-label" for="create-state">State</label>
                  <input
                    id="create-state"
                    type="text"
                    class="field-input field-input--short"
                    placeholder="e.g. IL"
                    maxlength="2"
                    [value]="createState()"
                    (input)="createState.set($any($event.target).value.toUpperCase())"
                  />
                </div>
              </div>
              <button
                type="button"
                class="wizard-finish-btn"
                [disabled]="!canFinishCreate()"
                (click)="finishCreate()"
              >
                Finish
                <nxt1-icon name="checkmark" [size]="16" className="btn-icon" />
              </button>
            </div>
          }
        </div>
      }

      <!-- ══════════════════ ROLE SELECTION ══════════════════ -->
      @if (selectedProgram() && !isCreating()) {
        <div class="role-section">
          <div class="selected-program-card">
            <div
              class="selected-avatar"
              [style.background-color]="
                selectedProgram()?.primaryColor || 'var(--nxt1-color-surface-200)'
              "
            >
              @if (selectedProgram()?.logoUrl) {
                <img
                  [src]="selectedProgram()?.logoUrl"
                  [alt]="selectedProgram()?.name"
                  class="result-logo"
                />
              } @else {
                <nxt1-icon name="school-outline" [size]="24" />
              }
            </div>
            <div class="selected-info">
              <span class="selected-name">{{ selectedProgram()?.name }}</span>
              <span class="selected-action">{{
                selectedAction() === 'claim' ? 'Claiming' : 'Creating'
              }}</span>
            </div>
            <button type="button" class="change-btn" (click)="resetSelection()">Change</button>
          </div>

          <h3 class="role-title">What's your role?</h3>
          <div class="role-grid" [attr.data-testid]="testIds.PROGRAM_ROLE_SELECT">
            @for (role of coachRoles; track role.id) {
              <button
                type="button"
                class="role-card"
                [class.role-card--selected]="hoveredRole() === role.id"
                (click)="selectRole(role.id)"
                (mouseenter)="hoveredRole.set(role.id)"
                (mouseleave)="hoveredRole.set(null)"
              >
                <nxt1-icon [name]="role.icon" [size]="24" className="role-icon" />
                <span class="role-label">{{ role.label }}</span>
              </button>
            }
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .program-container {
        padding: var(--nxt1-spacing-1) 0 var(--nxt1-spacing-5);
        max-width: 540px;
        margin: 0 auto;
      }

      .search-section {
        margin-bottom: var(--nxt1-spacing-4);
      }

      /* Results */
      .results-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .result-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-md);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast);
        text-align: left;
        width: 100%;
      }

      .result-card:hover {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary4);
      }

      .result-avatar {
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        border-radius: var(--nxt1-borderRadius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--nxt1-color-text-tertiary);
      }

      .result-logo {
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: inherit;
      }

      .result-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .result-name {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .result-meta {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .result-badge {
        font-size: var(--nxt1-fontSize-xs);
        padding: 2px var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .result-badge.claimed {
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
      }

      .result-arrow {
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
      }

      /* Skeleton */
      .result-skeleton {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
      }

      .skeleton-avatar {
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        border-radius: var(--nxt1-borderRadius-md);
        background: var(--nxt1-color-surface-200);
      }

      .skeleton-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1_5);
      }

      .skeleton-line {
        height: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-surface-200);
      }

      .skeleton-line--title {
        width: 60%;
      }
      .skeleton-line--sub {
        width: 40%;
      }

      /* No results */
      .no-results {
        text-align: center;
        padding: var(--nxt1-spacing-6) var(--nxt1-spacing-4) var(--nxt1-spacing-4);
      }

      .no-results-icon {
        color: var(--nxt1-color-text-tertiary);
      }

      .no-results-title {
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: var(--nxt1-spacing-3) 0 var(--nxt1-spacing-1);
      }

      .no-results-sub {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
        margin: 0 0 var(--nxt1-spacing-4);
      }

      /* Create Program button */
      .create-program-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-3_5) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-md);
        background: transparent;
        border: 1px dashed var(--nxt1-color-primary);
        cursor: pointer;
        width: 100%;
        text-align: left;
        transition: all var(--nxt1-duration-fast);
      }

      .create-program-btn:hover {
        background: var(--nxt1-color-alpha-primary4);
      }

      .create-icon-wrap {
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        border-radius: var(--nxt1-borderRadius-md);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .create-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .create-label {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-primary);
      }

      .create-hint {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      /* Create wizard */
      .create-wizard {
        animation: fadeIn var(--nxt1-duration-normal) var(--nxt1-easing-out);
      }

      .wizard-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        margin-bottom: var(--nxt1-spacing-6);
      }

      .back-btn {
        background: none;
        border: none;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        padding: var(--nxt1-spacing-1);
        border-radius: var(--nxt1-borderRadius-sm);
        display: flex;
        align-items: center;
        transition: color var(--nxt1-duration-fast);
      }

      .back-btn:hover {
        color: var(--nxt1-color-text-primary);
      }

      .wizard-title {
        flex: 1;
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .wizard-steps {
        display: flex;
        gap: var(--nxt1-spacing-1_5);
        align-items: center;
      }

      .wizard-dot {
        width: 6px;
        height: 6px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-border-default);
        transition: all var(--nxt1-duration-fast);
      }

      .wizard-dot--active {
        background: var(--nxt1-color-primary);
        width: 16px;
      }

      .wizard-body {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      .wizard-hint {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      /* Org grid */
      .org-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--nxt1-spacing-2);
      }

      .org-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-md);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast);
      }

      .org-card:hover {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary4);
      }

      .org-card--selected {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary10);
      }

      .org-icon {
        color: var(--nxt1-color-text-secondary);
      }
      .org-card:hover .org-icon,
      .org-card--selected .org-icon {
        color: var(--nxt1-color-primary);
      }

      .org-label {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
        text-align: center;
        line-height: 1.2;
      }

      /* Location fields */
      .location-fields {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .field-group {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1_5);
      }

      .field-label {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .field-input {
        width: 100%;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-md);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-sm);
        outline: none;
        transition: border-color var(--nxt1-duration-fast);
        box-sizing: border-box;
      }

      .field-input:focus {
        border-color: var(--nxt1-color-primary);
      }

      .field-input--short {
        max-width: 100px;
      }

      /* Wizard action buttons */
      .wizard-next-btn,
      .wizard-finish-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3_5) var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-md);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast);
        border: none;
        width: 100%;
        margin-top: var(--nxt1-spacing-2);
      }

      .wizard-next-btn {
        background: var(--nxt1-color-primary);
        color: #fff;
      }
      .wizard-next-btn:hover:not(:disabled) {
        opacity: 0.9;
      }

      .wizard-finish-btn {
        background: var(--nxt1-color-success, #22c55e);
        color: #fff;
      }
      .wizard-finish-btn:hover:not(:disabled) {
        opacity: 0.9;
      }

      .wizard-next-btn:disabled,
      .wizard-finish-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .btn-icon {
        flex-shrink: 0;
      }

      /* Role selection */
      .role-section {
        animation: fadeIn var(--nxt1-duration-normal) var(--nxt1-easing-out);
      }

      .selected-program-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-primary);
        margin-bottom: var(--nxt1-spacing-6);
      }

      .selected-avatar {
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-12);
        border-radius: var(--nxt1-borderRadius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-tertiary);
      }

      .selected-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .selected-name {
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .selected-action {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-primary);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .change-btn {
        background: none;
        border: none;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        cursor: pointer;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-sm);
        transition: color var(--nxt1-duration-fast);
      }

      .change-btn:hover {
        color: var(--nxt1-color-text-primary);
      }

      .role-title {
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-4);
        text-align: center;
      }

      .role-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-2);
      }

      .role-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-md);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast);
      }

      .role-card:hover,
      .role-card--selected {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary5);
      }

      .role-icon {
        color: var(--nxt1-color-text-secondary);
      }

      .role-card:hover .role-icon,
      .role-card--selected .role-icon {
        color: var(--nxt1-color-primary);
      }

      .role-label {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
        text-align: center;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(var(--nxt1-spacing-2));
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 480px) {
        .org-grid {
          grid-template-columns: repeat(2, 1fr);
        }
        .role-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentOnboardingProgramComponent {
  private readonly haptics = inject(HapticsService);

  protected readonly formatSportDisplayName = formatSportDisplayName;
  protected readonly testIds = TEST_IDS.AGENT_ONBOARDING;
  protected readonly coachRoles = COACH_ROLE_OPTIONS;
  protected readonly orgTypes = ORG_TYPE_OPTIONS;

  /** Search results from parent service */
  readonly searchResults = input<AgentProgramResult[]>([]);
  /** Whether search is in progress */
  readonly isSearching = input(false);
  /** Emitted when user types in search */
  readonly searchChange = output<string>();
  /** Emitted when user selects/creates a program and picks a role */
  readonly programSelected = output<SelectedProgramData>();

  // Search state
  protected readonly searchQuery = signal('');

  // Create wizard state
  protected readonly isCreating = signal(false);
  protected readonly createStep = signal<1 | 2>(1);
  protected readonly selectedOrgType = signal<string | null>(null);
  protected readonly createCity = signal('');
  protected readonly createState = signal('');

  // Role selection state
  protected readonly selectedProgram = signal<AgentProgramResult | null>(null);
  protected readonly selectedAction = signal<'claim' | 'create'>('claim');
  protected readonly selectedRole = signal<CoachProgramRole | null>(null);
  protected readonly hoveredRole = signal<string | null>(null);

  protected readonly canFinishCreate = computed(
    () => this.createCity().trim().length > 0 && this.createState().trim().length === 2
  );

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (value.length >= 2) {
      this.searchChange.emit(value);
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchChange.emit('');
  }

  async selectProgram(program: AgentProgramResult, action: 'claim' | 'create'): Promise<void> {
    await this.haptics.impact('light');
    this.selectedProgram.set(program);
    this.selectedAction.set(action);
  }

  startCreateFlow(): void {
    this.isCreating.set(true);
    this.createStep.set(1);
    this.selectedOrgType.set(null);
    this.createCity.set('');
    this.createState.set('');
  }

  cancelCreate(): void {
    this.isCreating.set(false);
  }

  async selectOrgType(id: string): Promise<void> {
    await this.haptics.impact('light');
    this.selectedOrgType.set(id);
  }

  goToCreateStep2(): void {
    if (!this.selectedOrgType()) return;
    this.createStep.set(2);
  }

  async finishCreate(): Promise<void> {
    if (!this.canFinishCreate()) return;
    await this.haptics.impact('medium');

    const orgOption = ORG_TYPE_OPTIONS.find((o) => o.id === this.selectedOrgType());
    const newProgram: AgentProgramResult = {
      id: `new-${Date.now()}`,
      name: this.searchQuery(),
      teamType: orgOption?.label,
      city: this.createCity().trim(),
      state: this.createState().trim(),
      isClaimed: false,
    };

    this.isCreating.set(false);
    this.selectedProgram.set(newProgram);
    this.selectedAction.set('create');
  }

  async selectRole(role: CoachProgramRole): Promise<void> {
    await this.haptics.impact('medium');
    this.selectedRole.set(role);

    const program = this.selectedProgram();
    if (program) {
      this.programSelected.emit({
        action: this.selectedAction(),
        program,
        role,
      });
    }
  }

  resetSelection(): void {
    this.selectedProgram.set(null);
    this.selectedAction.set('claim');
    this.selectedRole.set(null);
    this.isCreating.set(false);
  }
}
