/**
 * @fileoverview Agent Onboarding Program Search Step
 * @module @nxt1/ui/agent-x/onboarding
 * @version 1.0.0
 *
 * Coach-specific step for searching, claiming, or creating a program.
 * Includes search input, results list, create new option, and role selection.
 */

import { Component, ChangeDetectionStrategy, inject, signal, input, output } from '@angular/core';
import {
  type AgentProgramResult,
  type CoachProgramRole,
  type SelectedProgramData,
  COACH_ROLE_OPTIONS,
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
      @if (!selectedProgram()) {
        <!-- Search Phase -->
        <div class="search-section">
          <nxt1-search-bar
            variant="desktop-centered"
            placeholder="Search by school or program name..."
            [value]="searchQuery()"
            [attr.data-testid]="testIds.PROGRAM_SEARCH_INPUT"
            (searchInput)="onSearchInput($event)"
            (searchClear)="clearSearch()"
          />

          <!-- Search Results -->
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
          } @else if (searchQuery().length >= 2 && !isSearching()) {
            <div class="no-results">
              <nxt1-icon name="search-outline" [size]="32" className="no-results-icon" />
              <p class="no-results-text">No programs found for "{{ searchQuery() }}"</p>
            </div>
          }

          <!-- Create New Program -->
          @if (searchQuery().length >= 2) {
            <button
              type="button"
              class="create-program-btn"
              [attr.data-testid]="testIds.PROGRAM_CREATE_BTN"
              (click)="createNewProgram()"
            >
              <div class="create-icon-wrap">
                <nxt1-icon name="add" [size]="20" />
              </div>
              <div class="create-info">
                <span class="create-label">Create New Program</span>
                <span class="create-hint">Set up "{{ searchQuery() }}" as a new program</span>
              </div>
              <nxt1-icon name="chevron-forward" [size]="18" className="result-arrow" />
            </button>
          }
        </div>
      } @else if (!selectedRole()) {
        <!-- Role Selection Phase -->
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
        padding: var(--nxt1-spacing-6) var(--nxt1-spacing-4);
      }

      .no-results-icon {
        color: var(--nxt1-color-text-tertiary);
      }

      .no-results-text {
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        margin: var(--nxt1-spacing-2) 0 0;
      }

      /* Create Program */
      .create-program-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-3_5) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-md);
        background: transparent;
        border: 1px dashed var(--nxt1-color-border-default);
        cursor: pointer;
        width: 100%;
        text-align: left;
        transition: all var(--nxt1-duration-fast);
      }

      .create-program-btn:hover {
        border-color: var(--nxt1-color-primary);
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

      /* Role Selection */
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

  /** Search results from parent service */
  readonly searchResults = input<AgentProgramResult[]>([]);

  /** Whether search is in progress */
  readonly isSearching = input(false);

  /** Emitted when user types in search */
  readonly searchChange = output<string>();

  /** Emitted when user selects/creates a program and picks a role */
  readonly programSelected = output<SelectedProgramData>();

  // Internal state
  protected readonly searchQuery = signal('');
  protected readonly selectedProgram = signal<AgentProgramResult | null>(null);
  protected readonly selectedAction = signal<'claim' | 'create'>('claim');
  protected readonly selectedRole = signal<CoachProgramRole | null>(null);
  protected readonly hoveredRole = signal<string | null>(null);

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

  createNewProgram(): void {
    const name = this.searchQuery();
    const newProgram: AgentProgramResult = {
      id: `new-${Date.now()}`,
      name,
      isClaimed: false,
    };
    this.selectProgram(newProgram, 'create');
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
  }
}
