import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  AgentXShareMemberPickerComponent,
  type AgentXShareMemberOption,
} from './agent-x-share-member-picker.component';
import { NxtIconComponent } from '../../../components/icon/icon.component';

export type AgentXSharePrincipalType = 'user' | 'team' | 'organization';
export type AgentXSharePermission = 'read' | 'write';

export interface AgentXShareGrantOption {
  readonly accessKey: string;
  readonly principalType: AgentXSharePrincipalType;
  readonly principalId: string;
  readonly label: string;
  readonly permission: AgentXSharePermission;
}

@Component({
  selector: 'nxt1-agent-x-share-access-panel',
  standalone: true,
  imports: [CommonModule, AgentXShareMemberPickerComponent, NxtIconComponent],
  template: `
    <div class="film-list-item__menu-share">
      <label class="film-list-item__menu-label" [attr.for]="selectId()">Share access</label>

      @if (grants().length > 0) {
        <div class="film-list-item__menu-share-list">
          @for (grant of grants(); track grant.accessKey) {
            <div class="film-list-item__menu-share-pill">
              <span>{{ grant.label }}</span>
              <div class="film-list-item__menu-share-controls">
                <select
                  class="film-list-item__menu-access-select"
                  [value]="grant.permission"
                  (change)="
                    grantPermissionChange.emit({ grant, permission: $any($event.target).value })
                  "
                >
                  <option value="read">Read</option>
                  <option value="write">Write</option>
                </select>
                <button
                  type="button"
                  class="film-list-item__menu-share-remove"
                  aria-label="Remove access"
                  title="Remove access"
                  (click)="removeGrant.emit(grant)"
                >
                  <nxt1-icon name="trash" [size]="14"></nxt1-icon>
                </button>
              </div>
            </div>
          }
        </div>
      } @else {
        <p class="film-list-item__menu-help">{{ emptyAccessMessage() }}</p>
      }

      <div class="film-list-item__menu-share-config">
        <select
          [id]="selectId()"
          class="film-list-item__menu-input"
          [value]="principalType()"
          (change)="principalTypeChange.emit($any($event.target).value)"
        >
          <option value="user">Individual user</option>
          <option value="team">Team</option>
          @if (organizationId()) {
            <option value="organization">Organization</option>
          }
        </select>

        <select
          class="film-list-item__menu-input film-list-item__menu-input--compact"
          [value]="permission()"
          (change)="permissionChange.emit($any($event.target).value)"
        >
          <option value="read">Read</option>
          <option value="write">Write</option>
        </select>
      </div>

      @if (principalType() === 'user') {
        <nxt1-agent-x-share-member-picker
          [query]="query()"
          [loading]="loading()"
          [candidates]="candidates()"
          [selectedIds]="resolvedSelectedUserIds()"
          (queryChange)="queryChange.emit($event)"
          (candidateToggled)="candidateToggled.emit($event)"
          (submit)="submit.emit($event)"
          (cancel)="cancel.emit($event)"
        />
        @if (hasPendingUserSelectionChanges()) {
          <p class="film-list-item__menu-help film-list-item__menu-help--pending">
            Pending changes selected. Tap Done to apply sharing updates.
          </p>
        }
      } @else if (principalType() === 'team') {
        <p class="film-list-item__menu-help">Share with everyone on this team.</p>
      } @else {
        <p class="film-list-item__menu-help">Share with everyone in this organization.</p>
      }

      <div class="film-list-item__menu-actions">
        @if (principalType() !== 'user') {
          <button
            type="button"
            class="film-list-item__menu-action film-list-item__menu-action--primary"
            [disabled]="submitDisabled()"
            (click)="submit.emit($event)"
          >
            Share
          </button>
        }
        <button
          type="button"
          class="film-list-item__menu-action"
          [class.film-list-item__menu-action--primary]="principalType() === 'user'"
          [disabled]="principalType() === 'user' && submitDisabled()"
          (click)="principalType() === 'user' ? submit.emit($event) : cancel.emit($event)"
        >
          Done
        </button>
        @if (principalType() === 'user') {
          <button type="button" class="film-list-item__menu-action" (click)="cancel.emit($event)">
            Cancel
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .film-list-item__menu-share,
      .film-list-item__menu-share-list {
        display: grid;
        gap: 8px;
      }

      .film-list-item__menu-share-list {
        max-height: min(12rem, 28vh);
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding-right: 4px;
      }

      .film-list-item__menu-share-config,
      .film-list-item__menu-share-controls {
        display: grid;
        gap: 8px;
        align-items: center;
      }

      .film-list-item__menu-share-config {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .film-list-item__menu-share-controls {
        grid-template-columns: auto auto;
      }

      .film-list-item__menu-share-pill {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 8px;
        background: var(--nxt1-color-surface-050, rgba(255, 255, 255, 0.02));
        color: var(--nxt1-color-text-primary);
        font-size: 11px;
      }

      .film-list-item__menu-share-pill > span {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .film-list-item__menu-share-remove {
        border: 0;
        background: transparent;
        color: var(--nxt1-color-danger, #ff6b6b);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        cursor: pointer;
      }
      .film-list-item__menu-share-remove:hover,
      .film-list-item__menu-share-remove:focus-visible {
        background: color-mix(in srgb, var(--nxt1-color-danger, #ff6b6b) 12%, transparent);
        color: color-mix(in srgb, var(--nxt1-color-danger, #ff6b6b) 88%, white);
        outline: none;
      }

      .film-list-item__menu-input--compact,
      .film-list-item__menu-access-select {
        min-width: 86px;
      }

      .film-list-item__menu-access-select {
        border-radius: var(--nxt1-radius-md, 10px);
        border: 1px solid var(--log-border, var(--nxt1-color-border-default));
        background: var(--log-surface, var(--nxt1-color-surface-100));
        color: var(--log-text-primary, var(--nxt1-color-text-primary));
        padding: 6px 8px;
        font-size: 11px;
        font-weight: 600;
        font-family: inherit;
        outline: none;
      }

      .film-list-item__menu-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--log-text-secondary, var(--nxt1-color-text-secondary));
        display: block;
        padding: 2px 4px 0;
      }

      .film-list-item__menu-input {
        width: 100%;
        border-radius: var(--nxt1-radius-md, 10px);
        border: 1px solid var(--log-border, var(--nxt1-color-border-default));
        background: var(--log-surface, var(--nxt1-color-surface-100));
        color: var(--log-text-primary, var(--nxt1-color-text-primary));
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 500;
        font-family: inherit;
        outline: none;
      }

      .film-list-item__menu-input:focus {
        border-color: color-mix(
          in srgb,
          var(--log-primary, var(--nxt1-color-primary)) 65%,
          var(--log-border, var(--nxt1-color-border-default))
        );
        box-shadow: 0 0 0 2px
          color-mix(in srgb, var(--log-primary, var(--nxt1-color-primary)) 15%, transparent);
      }

      .film-list-item__menu-access-select:focus {
        border-color: color-mix(
          in srgb,
          var(--log-primary, var(--nxt1-color-primary)) 65%,
          var(--log-border, var(--nxt1-color-border-default))
        );
        box-shadow: 0 0 0 2px
          color-mix(in srgb, var(--log-primary, var(--nxt1-color-primary)) 15%, transparent);
      }

      .film-list-item__menu-help {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-size: 11px;
        line-height: 1.4;
      }

      .film-list-item__menu-help--pending {
        color: color-mix(in srgb, var(--nxt1-color-primary) 78%, var(--nxt1-color-text-secondary));
        font-weight: 600;
      }

      .film-list-item__menu-actions {
        display: flex;
        gap: 4px;
      }

      .film-list-item__menu-actions .film-list-item__menu-action {
        justify-content: center;
      }

      .film-list-item__menu-action {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: var(--nxt1-spacing-3, 0.75rem);
        width: 100%;
        border: 0;
        background: transparent;
        color: var(--nxt1-nav-text, var(--nxt1-color-text-primary));
        text-align: left;
        border-radius: var(--nxt1-ui-radius-default, 8px);
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        line-height: 1.25;
        cursor: pointer;
        transition: background-color var(--nxt1-nav-transition-fast, 0.15s ease);
        -webkit-tap-highlight-color: transparent;
      }

      .film-list-item__menu-action:hover,
      .film-list-item__menu-action:focus-visible {
        background: var(--nxt1-nav-hover-bg, var(--nxt1-color-surface-200));
        outline: none;
      }

      .film-list-item__menu-action:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .film-list-item__menu-action--primary {
        color: var(--log-primary, var(--nxt1-color-primary));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXShareAccessPanelComponent {
  readonly itemId = input.required<string>();
  readonly teamId = input('');
  readonly organizationId = input('');
  readonly principalType = input<AgentXSharePrincipalType>('user');
  readonly permission = input<AgentXSharePermission>('read');
  readonly query = input('');
  readonly loading = input(false);
  readonly candidates = input<readonly AgentXShareMemberOption[]>([]);
  readonly grants = input<readonly AgentXShareGrantOption[]>([]);
  readonly selectedUserIds = input<readonly string[] | null>(null);
  readonly submitDisabled = input(false);
  readonly emptyAccessMessage = input('Only you can access this item right now.');

  readonly principalTypeChange = output<AgentXSharePrincipalType>();
  readonly permissionChange = output<AgentXSharePermission>();
  readonly queryChange = output<string>();
  readonly candidateToggled = output<{ candidate: AgentXShareMemberOption; checked: boolean }>();
  readonly grantPermissionChange = output<{
    grant: AgentXShareGrantOption;
    permission: AgentXSharePermission;
  }>();
  readonly removeGrant = output<AgentXShareGrantOption>();
  readonly submit = output<Event>();
  readonly cancel = output<Event>();

  protected readonly selectId = computed(() => `agent-x-share-type-${this.itemId()}`);
  protected readonly selectedUserGrantIds = computed(() => {
    return this.grants()
      .filter((grant) => grant.principalType === 'user')
      .map((grant) => grant.principalId);
  });
  protected readonly resolvedSelectedUserIds = computed(() => {
    return this.selectedUserIds() ?? this.selectedUserGrantIds();
  });
  protected readonly hasPendingUserSelectionChanges = computed(() => {
    if (this.principalType() !== 'user') {
      return false;
    }

    const baseline = this.selectedUserGrantIds();
    const selected = this.resolvedSelectedUserIds();
    if (baseline.length !== selected.length) {
      return true;
    }

    const selectedSet = new Set(selected);
    return baseline.some((id) => !selectedSet.has(id));
  });
}
