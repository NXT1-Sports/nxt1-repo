import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface AgentXShareMemberOption {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly email: string | null;
}

@Component({
  selector: 'nxt1-agent-x-share-member-picker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <input
      type="text"
      class="film-list-item__menu-input"
      [placeholder]="placeholder()"
      [value]="query()"
      (input)="onQueryInput($event)"
      (keydown.enter)="submit.emit($event)"
      (keydown.escape)="cancel.emit($event)"
    />

    @if (loading()) {
      <p class="film-list-item__menu-help">Loading members...</p>
    } @else if (candidates().length > 0) {
      <div class="film-list-item__menu-share-list">
        @for (candidate of candidates(); track candidate.id) {
          <label
            class="film-list-item__menu-action nxt1-checkbox-label"
            [class.nxt1-checkbox-label--selected]="selectedIds().includes(candidate.id)"
          >
            <input
              type="checkbox"
              class="nxt1-checkbox"
              [checked]="selectedIds().includes(candidate.id)"
              (change)="candidateToggled.emit({ candidate, checked: $any($event.target).checked })"
            />
            <div class="nxt1-checkbox-text">
              {{ candidate.displayName }}
              @if (candidate.email) {
                <span> · {{ candidate.email }}</span>
              }
            </div>
          </label>
        }
      </div>
    } @else {
      <p class="film-list-item__menu-help">{{ emptyMessage() }}</p>
    }
  `,
  styles: [
    `
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

      .film-list-item__menu-share-list {
        display: grid;
        gap: 8px;
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

      .nxt1-checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
      }

      .nxt1-checkbox-label--selected {
        border: 1px solid
          color-mix(in srgb, var(--log-primary, var(--nxt1-color-primary)) 48%, transparent);
        background: color-mix(
          in srgb,
          var(--log-primary, var(--nxt1-color-primary)) 12%,
          transparent
        );
      }

      .nxt1-checkbox {
        accent-color: var(--log-primary, var(--nxt1-color-primary));
        width: 16px;
        height: 16px;
        cursor: pointer;
      }

      .nxt1-checkbox-text {
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .nxt1-checkbox-text span {
        font-size: 10px;
        color: var(--nxt1-color-text-secondary);
      }

      .film-list-item__menu-action:hover,
      .film-list-item__menu-action:focus-visible {
        background: var(--nxt1-nav-hover-bg, var(--nxt1-color-surface-200));
        outline: none;
      }

      .film-list-item__menu-help {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-size: 11px;
        line-height: 1.4;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXShareMemberPickerComponent {
  readonly query = input('');
  readonly loading = input(false);
  readonly candidates = input<readonly AgentXShareMemberOption[]>([]);
  readonly selectedIds = input<readonly string[]>([]);
  readonly placeholder = input('Search team or organization members');
  readonly emptyMessage = input('No members matched that search.');

  readonly queryChange = output<string>();
  readonly candidateToggled = output<{ candidate: AgentXShareMemberOption; checked: boolean }>();
  readonly submit = output<Event>();
  readonly cancel = output<Event>();

  protected readonly hasQuery = computed(() => this.query().trim().length > 0);

  protected onQueryInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.queryChange.emit(target?.value ?? '');
  }
}
