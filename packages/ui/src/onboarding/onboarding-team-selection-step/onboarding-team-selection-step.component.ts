/**
 * @fileoverview OnboardingTeamSelectionStepComponent - Team Selection (v4.1)
 * @module @nxt1/ui/onboarding
 * @version 4.1.0
 *
 * "Select Teams" step for onboarding — appears after sport selection.
 * Users search for and select up to 2 teams.
 *
 * Architecture:
 * - Search input using NxtSearchBarComponent (shared)
 * - Team results rendered as selectable cards/rows
 * - Max 2 teams selectable
 * - School teams auto-populate across sports for multi-sport users
 * - Club/travel teams do NOT auto-populate
 *
 * The component does NOT call any API directly. Instead, it accepts a
 * `searchTeams` callback input so the parent (web or mobile) can
 * provide a platform-specific implementation (HttpClient vs CapacitorHttp).
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-team-selection-step
 *   [teamSelectionData]="teamSelectionFormData()"
 *   [sportData]="sportFormData()"
 *   [disabled]="isLoading()"
 *   [searchTeams]="searchTeamsFn"
 *   (teamSelectionChange)="onTeamSelectionChange($event)"
 * />
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
  signal,
  computed,
  effect,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { TeamSelectionEntry, TeamSelectionFormData, SportFormData } from '@nxt1/core/api';
import type { ILogger } from '@nxt1/core/logging';
import { NxtSearchBarComponent } from '../../components/search-bar';
import { NxtValidationSummaryComponent } from '../../components/validation-summary';
import { NxtListSectionComponent } from '../../components/list-section';
import { NxtIconComponent } from '../../components/icon';
import { HapticButtonDirective } from '../../services/haptics';
import { NxtLoggingService } from '../../services/logging';
import { NxtToastService } from '../../services/toast';

// ============================================
// TYPES
// ============================================

/** Search result from the team/program search callback */
export interface TeamSearchResult {
  readonly id: string;
  readonly name: string;
  readonly sport: string;
  readonly teamType?: string;
  readonly location?: string;
  readonly logoUrl?: string;
  readonly colors?: readonly string[];
  readonly memberCount?: number;
  readonly isSchool: boolean;
  /** Organization ID (for program search results) */
  readonly organizationId?: string;
  /** Whether this is a draft/ghost entry */
  readonly isDraft?: boolean;
}

/** Callback type for searching teams — provided by the parent component */
export type SearchTeamsFn = (query: string) => Promise<readonly TeamSearchResult[]>;

// ============================================
// CONSTANTS
// ============================================

/** Maximum number of teams a user can select */
const MAX_TEAMS = 2;

/** Debounce time for search input (ms) */
const SEARCH_DEBOUNCE_MS = 300;

/** Minimum query length to trigger search */
const MIN_QUERY_LENGTH = 2;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-onboarding-team-selection-step',
  standalone: true,
  imports: [
    CommonModule,
    NxtSearchBarComponent,
    NxtValidationSummaryComponent,
    NxtListSectionComponent,
    NxtIconComponent,
    HapticButtonDirective,
  ],
  template: `
    @if (variant() === 'list-row') {
      <!-- ════════════════════════════════════════════
           MOBILE VARIANT (list-row)
           ════════════════════════════════════════════ -->
      <div class="nxt1-team-selection-step" data-testid="onboarding-team-selection-step">
        <!-- Search Bar -->
        <div class="nxt1-search-wrapper">
          <nxt1-search-bar
            variant="mobile"
            [expanded]="true"
            [placeholder]="searchPlaceholder()"
            [value]="searchQuery()"
            (searchInput)="onSearchInput($event)"
            (searchClear)="onSearchClear()"
          />
        </div>

        <!-- Search Results -->
        @if (isSearching()) {
          <div class="nxt1-search-loading" data-testid="team-search-loading">
            <div class="nxt1-spinner"></div>
            <span class="nxt1-search-loading-text">Searching programs...</span>
          </div>
        } @else if (searchResults().length > 0) {
          <nxt1-list-section>
            @for (team of searchResults(); track team.id) {
              <button
                type="button"
                class="nxt1-mobile-team-row"
                [class.nxt1-mobile-team-row--selected]="isTeamSelected(team.id)"
                [disabled]="disabled() || (!isTeamSelected(team.id) && isMaxReached())"
                nxtHaptic="selection"
                [attr.data-testid]="'team-result-' + team.id"
                (click)="toggleTeam(team)"
              >
                <div class="nxt1-team-result-row">
                  @if (team.logoUrl) {
                    <img
                      [src]="team.logoUrl"
                      [alt]="team.name"
                      class="nxt1-team-logo-sm"
                      loading="lazy"
                    />
                  } @else {
                    <div
                      class="nxt1-team-logo-placeholder nxt1-team-logo-placeholder--sm"
                      [style.background]="team.colors?.[0] ?? 'var(--nxt1-color-surface-200)'"
                    >
                      {{ getTeamInitial(team.name) }}
                    </div>
                  }
                  <div class="nxt1-team-result-copy">
                    <span class="nxt1-team-result-name">{{ team.name }}</span>
                    <div class="nxt1-team-result-meta">
                      @if (team.isDraft) {
                        <span class="nxt1-team-sport-badge nxt1-draft-badge">New Program</span>
                      } @else {
                        <span class="nxt1-team-sport-badge">{{ team.sport }}</span>
                      }
                      @if (team.teamType) {
                        <span class="nxt1-team-type-badge nxt1-team-type-badge--mobile">
                          {{ team.teamType }}
                        </span>
                      }
                    </div>
                    @if (team.location) {
                      <span class="nxt1-team-location">{{ team.location }}</span>
                    }
                  </div>
                  <div class="nxt1-mobile-team-row-actions">
                    @if (isTeamSelected(team.id)) {
                      <span class="nxt1-check-icon" aria-label="Selected">✓</span>
                    }
                    <nxt1-icon name="chevronForward" [size]="14" />
                  </div>
                </div>
              </button>
            }
          </nxt1-list-section>
        } @else if (hasSearched()) {
          <div class="nxt1-no-results" data-testid="team-search-no-results">
            <p class="nxt1-no-results-text">No programs found</p>
            @if (searchQuery().trim().length >= 2) {
              <button
                type="button"
                class="nxt1-add-draft-btn"
                nxtHaptic="light"
                data-testid="team-add-draft-program"
                (click)="addDraftProgram(searchQuery().trim())"
              >
                Don't see your program? Add "{{ searchQuery().trim() }}"
              </button>
            }
          </div>
        }

        <!-- Selected Teams -->
        @if (selectedTeams().length > 0) {
          <div class="nxt1-selected-section" data-testid="team-selected-section">
            <p class="nxt1-section-label">Selected Programs</p>
            @for (team of selectedTeams(); track team.id) {
              <div class="nxt1-selected-team-row" [attr.data-testid]="'team-selected-' + team.id">
                @if (team.logoUrl) {
                  <img
                    [src]="team.logoUrl"
                    [alt]="team.name"
                    class="nxt1-team-logo-sm"
                    loading="lazy"
                  />
                } @else {
                  <div
                    class="nxt1-team-logo-placeholder nxt1-team-logo-placeholder--sm"
                    [style.background]="team.colors?.[0] ?? 'var(--nxt1-color-surface-200)'"
                  >
                    {{ getTeamInitial(team.name) }}
                  </div>
                }
                <div class="nxt1-selected-team-info">
                  <span class="nxt1-selected-team-name">{{ team.name }}</span>
                  <div class="nxt1-selected-team-meta">
                    @if (team.sport) {
                      <span class="nxt1-selected-team-sport">{{ team.sport }}</span>
                    }
                    @if (team.location) {
                      <span class="nxt1-selected-team-location">{{ team.location }}</span>
                    }
                  </div>
                </div>
                <button
                  type="button"
                  class="nxt1-remove-btn"
                  nxtHaptic="light"
                  [attr.data-testid]="'team-remove-' + team.id"
                  [attr.aria-label]="'Remove ' + team.name"
                  (click)="removeTeam(team.id)"
                >
                  ✕
                </button>
              </div>
            }
          </div>
        }
      </div>
    } @else {
      <!-- ════════════════════════════════════════════
           DESKTOP VARIANT (cards)
           ════════════════════════════════════════════ -->
      <div class="nxt1-team-selection-step" data-testid="onboarding-team-selection-step">
        <!-- Description -->
        <p class="nxt1-step-description">
          Search for your program.
          @if (sportNames().length > 0) {
            <span class="nxt1-sport-context"> Playing {{ sportNames().join(', ') }}. </span>
          }
          <span class="nxt1-max-hint">Select up to {{ maxTeams }} programs.</span>
        </p>

        <!-- Search Bar -->
        <div class="nxt1-search-wrapper">
          <nxt1-search-bar
            variant="desktop"
            [placeholder]="searchPlaceholder()"
            [value]="searchQuery()"
            (searchInput)="onSearchInput($event)"
            (searchClear)="onSearchClear()"
          />
        </div>

        <!-- Search Results -->
        @if (isSearching()) {
          <div class="nxt1-search-loading" data-testid="team-search-loading">
            <div class="nxt1-spinner"></div>
            <span class="nxt1-search-loading-text">Searching programs...</span>
          </div>
        } @else if (searchResults().length > 0) {
          <div
            class="nxt1-results-grid"
            role="listbox"
            aria-label="Team search results"
            data-testid="team-search-results"
          >
            @for (team of searchResults(); track team.id) {
              <button
                type="button"
                class="nxt1-team-card"
                [class.nxt1-team-card--selected]="isTeamSelected(team.id)"
                [disabled]="disabled() || (!isTeamSelected(team.id) && isMaxReached())"
                nxtHaptic="selection"
                role="option"
                [attr.aria-selected]="isTeamSelected(team.id)"
                [attr.data-testid]="'team-result-' + team.id"
                (click)="toggleTeam(team)"
              >
                <!-- Logo / Placeholder -->
                <div class="nxt1-team-card-logo">
                  @if (team.logoUrl) {
                    <img
                      [src]="team.logoUrl"
                      [alt]="team.name"
                      class="nxt1-team-logo"
                      loading="lazy"
                    />
                  } @else {
                    <div
                      class="nxt1-team-logo-placeholder"
                      [style.background]="team.colors?.[0] ?? 'var(--nxt1-color-surface-200)'"
                    >
                      {{ team.name.charAt(0).toUpperCase() }}
                    </div>
                  }
                </div>

                <!-- Info -->
                <div class="nxt1-team-card-info">
                  <span class="nxt1-team-card-name">{{ team.name }}</span>
                  <span class="nxt1-team-card-meta">
                    @if (team.isDraft) {
                      New Program
                    } @else {
                      {{ team.sport }}
                      @if (team.location) {
                        · {{ team.location }}
                      }
                    }
                  </span>
                  @if (team.teamType) {
                    <span class="nxt1-team-type-badge">{{ team.teamType }}</span>
                  }
                </div>

                <!-- Selection Check -->
                @if (isTeamSelected(team.id)) {
                  <span class="nxt1-card-check" aria-label="Selected">✓</span>
                }
              </button>
            }
          </div>
        } @else if (hasSearched()) {
          <div class="nxt1-no-results" data-testid="team-search-no-results">
            <p class="nxt1-no-results-text">No programs found for "{{ searchQuery() }}"</p>
            <p class="nxt1-no-results-hint">Try a different search or add your program below.</p>
            @if (searchQuery().trim().length >= 2) {
              <button
                type="button"
                class="nxt1-add-draft-btn"
                nxtHaptic="light"
                data-testid="team-add-draft-program"
                (click)="addDraftProgram(searchQuery().trim())"
              >
                Don't see your program? Add "{{ searchQuery().trim() }}"
              </button>
            }
          </div>
        }

        <!-- Selected Teams Chips -->
        @if (selectedTeams().length > 0) {
          <div class="nxt1-selected-chips" data-testid="team-selected-section">
            @for (team of selectedTeams(); track team.id) {
              <div class="nxt1-selected-chip" [attr.data-testid]="'team-selected-' + team.id">
                @if (team.logoUrl) {
                  <img
                    [src]="team.logoUrl"
                    [alt]="team.name"
                    class="nxt1-chip-logo"
                    loading="lazy"
                  />
                }
                <span class="nxt1-chip-name">{{ team.name }}</span>
                <span class="nxt1-chip-sport">{{ team.sport }}</span>
                <button
                  type="button"
                  class="nxt1-chip-remove"
                  nxtHaptic="light"
                  [attr.data-testid]="'team-remove-' + team.id"
                  [attr.aria-label]="'Remove ' + team.name"
                  (click)="removeTeam(team.id)"
                >
                  ✕
                </button>
              </div>
            }
          </div>
        }

        <!-- Validation Summary -->
        @if (selectedTeams().length > 0) {
          <nxt1-validation-summary testId="team-selection-validation" variant="success">
            {{ selectedTeams().length }}
            {{ selectedTeams().length === 1 ? 'team' : 'teams' }} selected
          </nxt1-validation-summary>
        } @else {
          <nxt1-validation-summary testId="team-selection-hint" variant="info">
            Search for a program or add a new one
          </nxt1-validation-summary>
        }
      </div>
    }
  `,
  styles: [
    `
      /* ============================================
         STEP CONTAINER
         ============================================ */
      .nxt1-team-selection-step {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 16px);
        width: 100%;
      }

      /* ============================================
         DESCRIPTION
         ============================================ */
      .nxt1-step-description {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base, 1rem);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0;
        line-height: 1.5;
        text-align: center;
      }

      .nxt1-sport-context {
        color: var(--nxt1-color-primary, #ccff00);
        font-weight: 500;
      }

      .nxt1-max-hint {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* ============================================
         SEARCH WRAPPER
         ============================================ */
      .nxt1-search-wrapper {
        width: 100%;
      }

      /* ============================================
         SEARCH LOADING
         ============================================ */
      .nxt1-search-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-6, 24px);
      }

      .nxt1-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-top-color: var(--nxt1-color-primary, #ccff00);
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .nxt1-search-loading-text {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* ============================================
         RESULTS GRID (Desktop)
         ============================================ */
      .nxt1-results-grid {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        max-height: 280px;
        overflow-y: auto;
      }

      /* ============================================
         TEAM CARD (Desktop)
         ============================================ */
      .nxt1-team-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        text-align: left;
        width: 100%;
        font-family: var(--nxt1-fontFamily-brand);
        -webkit-tap-highlight-color: transparent;
        position: relative;
      }

      .nxt1-team-card:hover:not(:disabled) {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
      }

      .nxt1-team-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .nxt1-team-card:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .nxt1-team-card--selected {
        border-color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .nxt1-team-card--selected:hover:not(:disabled) {
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        border-color: var(--nxt1-color-primary, #ccff00);
      }

      /* ============================================
         TEAM LOGO
         ============================================ */
      .nxt1-team-card-logo {
        flex-shrink: 0;
      }

      .nxt1-team-logo {
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-borderRadius-md, 8px);
        object-fit: cover;
      }

      .nxt1-team-logo-sm {
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-borderRadius-sm, 6px);
        object-fit: cover;
        flex-shrink: 0;
      }

      .nxt1-team-logo-placeholder--sm {
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-borderRadius-sm, 6px);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
      }

      .nxt1-team-logo-placeholder {
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-borderRadius-md, 8px);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg, 1.125rem);
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      /* ============================================
         TEAM CARD INFO
         ============================================ */
      .nxt1-team-card-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }

      .nxt1-team-card-name {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nxt1-team-card-meta {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .nxt1-team-type-badge {
        display: inline-block;
        padding: 1px 6px;
        font-size: 10px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        margin-top: 2px;
        width: fit-content;
      }

      /* ============================================
         SELECTION CHECK
         ============================================ */
      .nxt1-card-check,
      .nxt1-check-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        font-size: 14px;
        font-weight: 700;
        flex-shrink: 0;
      }

      /* ============================================
         SELECTED CHIPS (Desktop)
         ============================================ */
      .nxt1-selected-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-selected-chip {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px);
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        border: 1px solid var(--nxt1-color-primary, #ccff00);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        font-family: var(--nxt1-fontFamily-brand);
      }

      .nxt1-chip-logo {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        object-fit: cover;
      }

      .nxt1-chip-name {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .nxt1-chip-sport {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .nxt1-chip-remove {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: transparent;
        border: none;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-size: 12px;
        cursor: pointer;
        transition: color var(--nxt1-duration-fast, 150ms);
        padding: 0;
      }

      .nxt1-chip-remove:hover {
        color: var(--nxt1-color-error, #ff4d4f);
      }

      /* ============================================
         SELECTED TEAMS (Mobile)
         ============================================ */
      .nxt1-selected-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-section-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0;
      }

      .nxt1-selected-team-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        border: 1px solid var(--nxt1-color-primary, #ccff00);
        border-radius: var(--nxt1-borderRadius-lg, 12px);
      }

      .nxt1-selected-team-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }

      .nxt1-selected-team-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .nxt1-selected-team-sport {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .nxt1-selected-team-meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
        align-items: center;
      }

      .nxt1-selected-team-location {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .nxt1-remove-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-200);
        border: none;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-size: 14px;
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms);
        padding: 0;
        flex-shrink: 0;
      }

      .nxt1-remove-btn:hover {
        background: var(--nxt1-color-error, #ff4d4f);
        color: #ffffff;
      }

      /* ============================================
         TEAM RESULT ROW (Mobile)
         ============================================ */
      .nxt1-team-result-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        width: 100%;
      }

      .nxt1-mobile-team-row {
        appearance: none;
        -webkit-appearance: none;
        display: block;
        width: 100%;
        border: none;
        background: transparent;
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-1, 4px);
        text-align: left;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-mobile-team-row--selected {
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .nxt1-mobile-team-row:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .nxt1-mobile-team-row-actions {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        margin-left: auto;
      }

      .nxt1-mobile-team-row-actions nxt1-icon {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .nxt1-team-result-copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }

      .nxt1-team-result-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nxt1-team-result-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
        min-width: 0;
      }

      .nxt1-team-sport-badge {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 500;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .nxt1-team-location {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nxt1-team-type-badge--mobile {
        margin-top: 0;
      }

      /* ============================================
         NO RESULTS
         ============================================ */
      .nxt1-no-results {
        text-align: center;
        padding: var(--nxt1-spacing-6, 24px);
      }

      .nxt1-no-results-text {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0;
      }

      .nxt1-no-results-hint {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        margin: var(--nxt1-spacing-1, 4px) 0 0;
      }

      /* ============================================
         ADD DRAFT PROGRAM BUTTON
         ============================================ */
      .nxt1-add-draft-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        margin-top: var(--nxt1-spacing-3, 12px);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        border: 1px dashed var(--nxt1-color-primary, #ccff00);
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-add-draft-btn:hover {
        background: rgba(204, 255, 0, 0.18);
        border-style: solid;
      }

      .nxt1-add-draft-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      /* Draft badge for new programs */
      .nxt1-draft-badge {
        color: var(--nxt1-color-warning, #ffaa00) !important;
      }

      /* ============================================
         RESPONSIVE
         ============================================ */
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingTeamSelectionStepComponent {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly loggingService = inject(NxtLoggingService);
  private readonly toast = inject(NxtToastService);

  /** Namespaced logger */
  private readonly logger: ILogger = this.loggingService.child('OnboardingTeamSelectionStep');

  // ============================================
  // SIGNAL INPUTS
  // ============================================

  /** Current team selection data from parent */
  readonly teamSelectionData = input<TeamSelectionFormData | null>(null);

  /** Current sport data — used for auto-population and search context */
  readonly sportData = input<SportFormData | null>(null);

  /** Display variant: 'cards' for desktop, 'list-row' for mobile */
  readonly variant = input<'cards' | 'list-row'>('cards');

  /** Whether interaction is disabled */
  readonly disabled = input<boolean>(false);

  /** Team search callback — provided by parent (platform-specific) */
  readonly searchTeams = input<SearchTeamsFn | null>(null);

  /** Maximum teams allowed */
  readonly maxTeams = MAX_TEAMS;

  // ============================================
  // SIGNAL OUTPUTS
  // ============================================

  /** Emits when team selection changes */
  readonly teamSelectionChange = output<TeamSelectionFormData>();

  /** Emits when "Create Program" is tapped */
  readonly createProgram = output<void>();

  /** Emits when "Join Program" is tapped */
  readonly joinProgram = output<void>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Currently selected teams */
  readonly selectedTeams = signal<TeamSelectionEntry[]>([]);

  /** Search query text */
  readonly searchQuery = signal('');

  /** Search results from callback */
  readonly searchResults = signal<readonly TeamSearchResult[]>([]);

  /** Whether a search is in progress */
  readonly isSearching = signal(false);

  /** Whether the user has performed at least one search */
  readonly hasSearched = signal(false);

  /** Debounce timer handle */
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Whether max teams are selected */
  readonly isMaxReached = computed(() => this.selectedTeams().length >= MAX_TEAMS);

  /** Sport names from parent sport data */
  readonly sportNames = computed((): string[] => {
    const data = this.sportData();
    if (!data?.sports?.length) return [];
    return data.sports.map((s) => s.sport);
  });

  /** Dynamic search placeholder */
  readonly searchPlaceholder = computed((): string => {
    const names = this.sportNames();
    if (names.length === 1) return `Search ${names[0]} programs...`;
    if (names.length > 1) return 'Search programs...';
    return 'Search for a program...';
  });

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Sync internal state when teamSelectionData input changes
    effect(() => {
      const data = this.teamSelectionData();
      if (!data?.teams?.length) {
        this.selectedTeams.set([]);
        return;
      }
      this.selectedTeams.set([...data.teams]);
    });
  }

  // ============================================
  // SEARCH
  // ============================================

  /** Handle search input with debounce */
  onSearchInput(query: string): void {
    this.searchQuery.set(query);

    // Clear previous timer
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
    }

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      this.searchResults.set([]);
      this.isSearching.set(false);
      return;
    }

    this.isSearching.set(true);
    this.searchTimer = setTimeout(() => {
      void this.executeSearch(trimmed);
    }, SEARCH_DEBOUNCE_MS);
  }

  /** Clear search */
  onSearchClear(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.isSearching.set(false);
    this.hasSearched.set(false);
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  /** Execute the team search via callback */
  private async executeSearch(query: string): Promise<void> {
    const searchFn = this.searchTeams();
    if (!searchFn) {
      this.logger.warn('No searchTeams function provided');
      this.isSearching.set(false);
      return;
    }

    try {
      this.logger.debug('Searching teams', { query });
      const results = await searchFn(query);
      this.searchResults.set(results);
      this.hasSearched.set(true);
      this.logger.debug('Team search complete', { query, count: results.length });
    } catch (err) {
      this.logger.error('Team search failed', err, { query });
      this.searchResults.set([]);
      this.hasSearched.set(true);
      this.toast.error('Failed to search teams. Please try again.');
    } finally {
      this.isSearching.set(false);
    }
  }

  // ============================================
  // SELECTION
  // ============================================

  /** Toggle team selection */
  toggleTeam(team: TeamSearchResult): void {
    const current = this.selectedTeams();
    const isCurrentlySelected = current.some((t) => t.id === team.id);

    if (isCurrentlySelected) {
      // Deselect
      const updated = current.filter((t) => t.id !== team.id);
      this.selectedTeams.set(updated);
      this.logger.debug('Team deselected', { teamId: team.id, name: team.name });
      this.emitChange(updated);

      // Also remove any auto-populated entries for this team
      this.removeAutoPopulated(team);
      return;
    }

    // Check max
    if (current.length >= MAX_TEAMS) {
      this.toast.warning(`You can select up to ${MAX_TEAMS} teams`);
      return;
    }

    // Select — convert search result to entry
    const entry: TeamSelectionEntry = {
      id: team.id,
      name: team.name,
      sport: team.sport,
      teamType: team.teamType,
      location: team.location,
      logoUrl: team.logoUrl,
      colors: team.colors,
      memberCount: team.memberCount,
      isSchool: team.isSchool,
      isDraft: team.isDraft,
      organizationId: team.organizationId,
    };

    const updated = [...current, entry];
    this.selectedTeams.set(updated);
    this.logger.debug('Team selected', {
      teamId: team.id,
      name: team.name,
      isSchool: team.isSchool,
      total: updated.length,
    });

    // Auto-populate school teams across sports for multi-sport users
    if (team.isSchool) {
      this.autoPopulateSchoolTeam(entry, updated);
    } else {
      this.emitChange(updated);
    }
  }

  /** Remove a selected team by ID */
  removeTeam(teamId: string): void {
    const current = this.selectedTeams();
    const team = current.find((t) => t.id === teamId);
    const updated = current.filter((t) => t.id !== teamId);
    this.selectedTeams.set(updated);
    this.logger.debug('Team removed', { teamId, remaining: updated.length });
    this.emitChange(updated);

    // If it was a school team, remove auto-populated entries
    if (team?.isSchool) {
      this.removeAutoPopulated(team);
    }
  }

  /** Check if a team is selected */
  isTeamSelected(teamId: string): boolean {
    return this.selectedTeams().some((t) => t.id === teamId);
  }

  // ============================================
  // PROGRAM ACTIONS
  // ============================================

  /** Add a draft/ghost program entry from the search query */
  addDraftProgram(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;

    const current = this.selectedTeams();

    // Check max
    if (current.length >= MAX_TEAMS) {
      this.toast.warning(`You can select up to ${MAX_TEAMS} programs`);
      return;
    }

    // Check if already added
    if (current.some((t) => t.name.toLowerCase() === trimmed.toLowerCase() && t.isDraft)) {
      this.toast.warning(`"${trimmed}" is already added`);
      return;
    }

    const draftId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const entry: TeamSelectionEntry = {
      id: draftId,
      name: trimmed,
      sport: '', // Will be derived from sports step on backend
      isSchool: false,
      isDraft: true,
    };

    const updated = [...current, entry];
    this.selectedTeams.set(updated);
    this.logger.info('Draft program added', { draftId, name: trimmed });

    // Clear search
    this.onSearchClear();

    this.emitChange(updated);
  }

  /** Handle "Create Program" click */
  onCreateProgram(): void {
    this.logger.info('Create program requested');
    this.createProgram.emit();
  }

  /** Handle "Join Program" click */
  onJoinProgram(): void {
    this.logger.info('Join program requested');
    this.joinProgram.emit();
  }

  // ============================================
  // AUTO-POPULATION LOGIC
  // ============================================

  /**
   * Auto-populate school team across sports for multi-sport users.
   * If a user selects a school team (e.g., "Lincoln High School - Football"),
   * and they have multiple sports, the school is automatically associated
   * with all their sports. Club/travel teams do NOT auto-populate.
   */
  private autoPopulateSchoolTeam(
    schoolEntry: TeamSelectionEntry,
    updatedTeams: TeamSelectionEntry[]
  ): void {
    const sports = this.sportNames();

    // Only auto-populate if user has multiple sports
    if (sports.length <= 1) {
      this.emitChange(updatedTeams);
      return;
    }

    // The selected team already covers one sport.
    // For additional sports, we note the school association but don't
    // add duplicate team entries (max 2 teams). The parent component
    // can use the isSchool flag to infer school association across sports.
    this.logger.info('School team auto-population: school will apply across sports', {
      schoolName: schoolEntry.name,
      sports,
    });

    this.emitChange(updatedTeams);
  }

  /**
   * Remove auto-populated entries when a school team is deselected.
   * Since we don't add duplicate entries, this is a no-op for now,
   * but the method exists for future extensibility.
   */
  private removeAutoPopulated(_team: TeamSearchResult | TeamSelectionEntry): void {
    // No-op: auto-population doesn't create extra entries
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /** Emit team selection change with current data */
  private emitChange(teams: TeamSelectionEntry[]): void {
    const data: TeamSelectionFormData = {
      teams: [...teams],
    };
    this.teamSelectionChange.emit(data);
  }

  protected getTeamInitial(name: string | undefined): string {
    return (name?.trim().charAt(0) || '?').toUpperCase();
  }
}
