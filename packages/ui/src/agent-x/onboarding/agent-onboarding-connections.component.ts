/**
 * @fileoverview Agent Onboarding Connections Step
 * @module @nxt1/ui/agent-x/onboarding
 * @version 1.0.0
 *
 * Shared connections component for adding connections during onboarding.
 * Designed to be reusable across Agent X onboarding and other flows.
 * Shows suggested connections and search functionality.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  input,
  output,
} from '@angular/core';
import { type AgentConnection, formatSportDisplayName } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../components/icon/icon.component';
import { NxtSearchBarComponent } from '../../components/search-bar/search-bar.component';
import { HapticsService } from '../../services/haptics/haptics.service';

@Component({
  selector: 'nxt1-agent-onboarding-connections',
  standalone: true,
  imports: [NxtIconComponent, NxtSearchBarComponent],
  template: `
    <section class="connections-container" [attr.data-testid]="testIds.CONNECTIONS_STEP">
      <!-- Search (shared NxtSearchBarComponent) -->
      <div class="search-section">
        <nxt1-search-bar
          variant="desktop-centered"
          placeholder="Search by name, team, or sport..."
          [value]="searchQuery()"
          [attr.data-testid]="testIds.CONNECTIONS_SEARCH"
          (searchInput)="onSearchInput($event)"
          (searchClear)="clearSearch()"
        />
      </div>

      <!-- Added connections count -->
      @if (addedConnections().length > 0) {
        <div class="added-summary">
          <nxt1-icon name="people" [size]="16" className="summary-icon" />
          <span class="summary-text">
            {{ addedConnections().length }} connection{{ addedConnections().length > 1 ? 's' : '' }}
            added
          </span>
        </div>
      }

      <!-- Connection List -->
      @if (isSearching()) {
        <div class="connection-list">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="connection-skeleton animate-pulse">
              <div class="skeleton-avatar-circle"></div>
              <div class="skeleton-text">
                <div class="skeleton-line skeleton-line--name"></div>
                <div class="skeleton-line skeleton-line--meta"></div>
              </div>
              <div class="skeleton-btn"></div>
            </div>
          }
        </div>
      } @else {
        <div class="connection-list">
          @if (displayConnections().length === 0 && searchQuery().length >= 2) {
            <div class="no-results">
              <nxt1-icon name="people-outline" [size]="32" className="no-results-icon" />
              <p class="no-results-text">No users found for "{{ searchQuery() }}"</p>
            </div>
          }

          @for (connection of displayConnections(); track connection.id) {
            <div
              class="connection-card"
              [class.connection-card--added]="isAdded(connection.id)"
              [attr.data-testid]="testIds.CONNECTION_CARD"
            >
              <div class="connection-avatar">
                @if (connection.profileImg) {
                  <img
                    [src]="connection.profileImg"
                    [alt]="connection.displayName"
                    class="avatar-img"
                  />
                } @else {
                  <nxt1-icon name="person" [size]="20" />
                }
              </div>
              <div class="connection-info">
                <span class="connection-name">{{ connection.displayName }}</span>
                <span class="connection-meta">
                  @if (connection.role) {
                    <span class="role-tag">{{ connection.role }}</span>
                  }
                  @if (connection.teamName) {
                    · {{ connection.teamName }}
                  }
                  @if (connection.sport) {
                    · {{ formatSportDisplayName(connection.sport) }}
                  }
                </span>
              </div>
              <button
                type="button"
                class="connection-action"
                [class.connection-action--added]="isAdded(connection.id)"
                [attr.data-testid]="testIds.CONNECTION_ADD_BTN"
                (click)="toggleConnection(connection)"
              >
                @if (isAdded(connection.id)) {
                  <nxt1-icon name="checkmark" [size]="16" />
                  <span>Added</span>
                } @else {
                  <nxt1-icon name="add" [size]="16" />
                  <span>Add</span>
                }
              </button>
            </div>
          }
        </div>
      }

      <!-- Section divider -->
      @if (suggestedConnections().length > 0 && searchQuery().length === 0) {
        <div class="section-label">
          <nxt1-icon name="sparkles-outline" [size]="14" />
          <span>Suggested for you</span>
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

      .connections-container {
        padding: var(--nxt1-spacing-xs) 0 var(--nxt1-spacing-lg);
        max-width: 540px;
        margin: 0 auto;
      }

      /* Search Section */
      .search-section {
        margin-bottom: var(--nxt1-spacing-md);
      }

      .search-section nxt1-search-bar {
        width: 100%;
        max-width: none;
      }

      /* Added summary */
      .added-summary {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        background: rgba(204, 255, 0, 0.08);
        color: var(--nxt1-color-primary);
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: 600;
        margin-bottom: var(--nxt1-spacing-md);
      }

      .summary-icon {
        color: var(--nxt1-color-primary);
      }

      /* Connection List */
      .connection-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-xs);
      }

      .connection-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-md);
        padding: 12px 16px;
        border-radius: var(--nxt1-borderRadius-md, 8px);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        transition: all var(--nxt1-duration-fast, 150ms);
        animation: fadeIn var(--nxt1-duration-normal, 200ms) ease-out;
      }

      .connection-card--added {
        border-color: rgba(204, 255, 0, 0.3);
        background: rgba(204, 255, 0, 0.03);
      }

      .connection-avatar {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-200);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
        overflow: hidden;
      }

      .avatar-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .connection-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .connection-name {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .connection-meta {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--nxt1-color-text-tertiary);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .role-tag {
        text-transform: capitalize;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
      }

      .connection-action {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 14px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: 600;
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms);
        flex-shrink: 0;
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-subtle);
        color: var(--nxt1-color-text-primary);
      }

      .connection-action:hover {
        border-color: var(--nxt1-color-primary);
      }

      .connection-action--added {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-bg-primary);
        border-color: var(--nxt1-color-primary);
      }

      /* Skeleton */
      .connection-skeleton {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-md);
        padding: 12px 16px;
      }

      .skeleton-avatar-circle {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-200);
      }

      .skeleton-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .skeleton-line {
        height: 12px;
        border-radius: 4px;
        background: var(--nxt1-color-surface-200);
      }
      .skeleton-line--name {
        width: 50%;
      }
      .skeleton-line--meta {
        width: 35%;
      }
      .skeleton-btn {
        width: 60px;
        height: 28px;
        border-radius: 14px;
        background: var(--nxt1-color-surface-200);
      }

      /* No Results */
      .no-results {
        text-align: center;
        padding: var(--nxt1-spacing-xl);
      }
      .no-results-icon {
        color: var(--nxt1-color-text-tertiary);
      }
      .no-results-text {
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm, 14px);
        margin: var(--nxt1-spacing-sm) 0 0;
      }

      /* Section Label */
      .section-label {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: var(--nxt1-spacing-lg);
        margin-bottom: var(--nxt1-spacing-sm);
        color: var(--nxt1-color-text-tertiary);
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentOnboardingConnectionsComponent {
  private readonly haptics = inject(HapticsService);

  protected readonly formatSportDisplayName = formatSportDisplayName;
  protected readonly testIds = TEST_IDS.AGENT_ONBOARDING;

  /** Search results from parent */
  readonly searchResults = input<AgentConnection[]>([]);

  /** Suggested connections from parent */
  readonly suggestedConnections = input<AgentConnection[]>([]);

  /** Whether search is in progress */
  readonly isSearching = input(false);

  /** Emitted when user types in search */
  readonly searchChange = output<string>();

  /** Emitted when connections change */
  readonly connectionsChanged = output<AgentConnection[]>();

  // Internal state
  protected readonly searchQuery = signal('');
  protected readonly addedConnections = signal<AgentConnection[]>([]);

  /** Show search results or suggestions depending on query */
  protected readonly displayConnections = computed(() => {
    const query = this.searchQuery();
    return query.length >= 2 ? this.searchResults() : this.suggestedConnections();
  });

  isAdded(connectionId: string): boolean {
    return this.addedConnections().some((c) => c.id === connectionId);
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (value.length >= 2) {
      this.searchChange.emit(value);
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  async toggleConnection(connection: AgentConnection): Promise<void> {
    await this.haptics.impact('light');

    const current = this.addedConnections();
    const exists = current.some((c) => c.id === connection.id);

    if (exists) {
      this.addedConnections.set(current.filter((c) => c.id !== connection.id));
    } else {
      this.addedConnections.set([...current, connection]);
    }

    this.connectionsChanged.emit(this.addedConnections());
  }
}
