/**
 * @fileoverview Settings Item Component - Individual Setting Row
 * @module @nxt1/ui/settings
 * @version 1.0.0
 *
 * Individual row component for a single settings item.
 * Supports multiple types: toggle, navigation, action, info, button.
 * Following Instagram/iOS/Android settings patterns.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Toggle with animated switch
 * - Navigation with chevron and display value
 * - Action buttons with variants
 * - Info display with copy support
 * - Haptic feedback on interactions
 * - Full accessibility support
 *
 * @example
 * ```html
 * <nxt1-settings-item
 *   [item]="toggleItem"
 *   (toggle)="onToggle($event)"
 *   (navigate)="onNavigate($event)"
 *   (action)="onAction($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { IonToggle, IonRippleEffect, IonBadge } from '@ionic/angular/standalone';
import type {
  SettingsItem,
  SettingsToggleItem,
  SettingsNavigationItem,
  SettingsActionItem,
  SettingsInfoItem,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtIconComponent } from '../components/icon';

// Register all icons used
/**
 * Toggle change event.
 */
export interface SettingsToggleEvent {
  readonly itemId: string;
  readonly settingKey: string;
  readonly value: boolean;
}

/**
 * Navigation event.
 */
export interface SettingsNavigateEvent {
  readonly itemId: string;
  readonly route?: string;
  readonly externalUrl?: string;
}

/**
 * Action event.
 */
export interface SettingsActionEvent {
  readonly itemId: string;
  readonly action: string;
  readonly requiresConfirmation?: boolean;
  readonly confirmationMessage?: string;
}

/**
 * Copy event.
 */
export interface SettingsCopyEvent {
  readonly itemId: string;
  readonly value: string;
}

@Component({
  selector: 'nxt1-settings-item',
  standalone: true,
  imports: [IonToggle, IonRippleEffect, IonBadge, NxtIconComponent],
  template: `
    <div
      class="settings-item"
      [class.settings-item--disabled]="item().disabled"
      [class.settings-item--danger]="item().variant === 'danger'"
      [class.settings-item--warning]="item().variant === 'warning'"
      [class.settings-item--clickable]="isClickable()"
      [attr.data-testid]="item().id"
      [attr.role]="isClickable() ? 'button' : undefined"
      [attr.tabindex]="isClickable() ? 0 : undefined"
      [attr.aria-disabled]="item().disabled"
      [attr.aria-label]="ariaLabel()"
      (click)="handleClick($event)"
      (keydown.enter)="handleClick($event)"
      (keydown.space)="handleClick($event)"
    >
      @if (isClickable()) {
        <ion-ripple-effect></ion-ripple-effect>
      }

      <!-- Left: Icon -->
      @if (item().icon) {
        <div
          class="settings-item__icon"
          [class.settings-item__icon--danger]="item().variant === 'danger'"
        >
          <nxt1-icon [name]="item().icon!" [size]="18"></nxt1-icon>
        </div>
      }

      <!-- Center: Content -->
      <div class="settings-item__content">
        <div class="settings-item__label-row">
          <span class="settings-item__label">{{ item().label }}</span>
          @if (item().badge) {
            <ion-badge
              class="settings-item__badge"
              [class.settings-item__badge--primary]="item().badgeVariant === 'primary'"
              [class.settings-item__badge--secondary]="item().badgeVariant === 'secondary'"
              [class.settings-item__badge--success]="item().badgeVariant === 'success'"
              [class.settings-item__badge--warning]="item().badgeVariant === 'warning'"
              [class.settings-item__badge--error]="item().badgeVariant === 'error'"
            >
              {{ item().badge }}
            </ion-badge>
          }
        </div>
        @if (item().description) {
          <span class="settings-item__description">{{ item().description }}</span>
        }
        @if (item().type === 'info') {
          <div class="settings-item__info-value">
            <span class="settings-item__info-text">{{ asInfo().value }}</span>
            @if (asInfo().copyable) {
              <button
                type="button"
                class="settings-item__copy-btn"
                [class.settings-item__copy-btn--copied]="isCopied()"
                (click)="onCopy($event)"
                [attr.aria-label]="isCopied() ? 'Copied' : 'Copy'"
              >
                <nxt1-icon
                  [name]="isCopied() ? 'checkmarkCircle' : 'documentText'"
                  [size]="14"
                ></nxt1-icon>
              </button>
            }
          </div>
        }
      </div>

      <!-- Right: Control/Value -->
      <div class="settings-item__trailing">
        @switch (item().type) {
          @case ('toggle') {
            <ion-toggle
              [checked]="asToggle().value"
              [disabled]="item().disabled"
              (ionChange)="onToggleChange($event)"
              (click)="$event.stopPropagation()"
              class="settings-item__toggle"
            ></ion-toggle>
          }
          @case ('navigation') {
            @if (asNavigation().displayValue) {
              <span class="settings-item__value">{{ asNavigation().displayValue }}</span>
            }
            <nxt1-icon
              [name]="asNavigation().externalUrl ? 'arrowForward' : 'chevronForward'"
              [size]="18"
              className="settings-item__chevron"
            ></nxt1-icon>
          }
          @case ('action') {
            <nxt1-icon
              name="chevronForward"
              [size]="18"
              className="settings-item__chevron"
            ></nxt1-icon>
          }
          @case ('info') {
            <!-- Info value is rendered in the content section above -->
          }
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       SETTINGS ITEM - Professional Setting Row
       Instagram/iOS/Android Pattern
       100% Theme Aware
       ============================================ */

      :host {
        display: block;
      }

      .settings-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        background: var(--nxt1-color-surface-primary, var(--ion-background-color, #0a0a0a));
        border-bottom: 0.5px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        position: relative;
        transition: background-color 0.15s ease;
        min-height: 52px;
      }

      .settings-item--clickable {
        cursor: pointer;
      }

      .settings-item--clickable:hover {
        background: var(--nxt1-color-surface-hover, rgba(255, 255, 255, 0.03));
      }

      .settings-item--clickable:active {
        background: var(--nxt1-color-surface-active, rgba(255, 255, 255, 0.06));
      }

      .settings-item--disabled {
        opacity: 0.5;
        pointer-events: none;
      }

      .settings-item--danger {
        /* Subtle danger tint */
      }

      .settings-item--danger .settings-item__label {
        color: var(--nxt1-color-error, #ef4444);
      }

      /* ============================================
       ICON
       ============================================ */

      .settings-item__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        flex-shrink: 0;
      }

      .settings-item__icon nxt1-icon {
        font-size: 18px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .settings-item__icon--danger {
        background: var(--nxt1-color-alpha-error10, rgba(239, 68, 68, 0.1));
      }

      .settings-item__icon--danger nxt1-icon {
        color: var(--nxt1-color-error, #ef4444);
      }

      /* ============================================
       CONTENT
       ============================================ */

      .settings-item__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .settings-item__label-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .settings-item__label {
        font-size: 16px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1.3;
      }

      .settings-item__description {
        font-size: 13px;
        font-weight: 400;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        line-height: 1.3;
      }

      /* ============================================
       BADGE
       ============================================ */

      .settings-item__badge {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 2px 6px;
        border-radius: 4px;
        --background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        --color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .settings-item__badge--primary {
        --background: var(--nxt1-color-alpha-primary15, rgba(204, 255, 0, 0.15));
        --color: var(--nxt1-color-primary, #ccff00);
      }

      .settings-item__badge--secondary {
        --background: var(--nxt1-color-alpha-secondary15, rgba(255, 215, 0, 0.15));
        --color: var(--nxt1-color-secondary, #ffd700);
      }

      .settings-item__badge--success {
        --background: var(--nxt1-color-alpha-success15, rgba(34, 197, 94, 0.15));
        --color: var(--nxt1-color-success, #22c55e);
      }

      .settings-item__badge--warning {
        --background: var(--nxt1-color-alpha-warning15, rgba(245, 158, 11, 0.15));
        --color: var(--nxt1-color-warning, #f59e0b);
      }

      .settings-item__badge--error {
        --background: var(--nxt1-color-alpha-error15, rgba(239, 68, 68, 0.15));
        --color: var(--nxt1-color-error, #ef4444);
      }

      /* ============================================
       TRAILING
       ============================================ */

      .settings-item__trailing {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .settings-item__value {
        font-size: 15px;
        font-weight: 400;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .settings-item__chevron {
        font-size: 18px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      /* Toggle styling */
      .settings-item__toggle {
        --track-background: rgba(255, 255, 255, 0.22);
        --track-background-checked: var(--nxt1-color-primary, #ccff00);
        --handle-background: #ffffff;
        --handle-background-checked: #1a1a1a;
        padding: 0;
      }

      /* Info value with copy button */
      .settings-item__info-value {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
      }

      .settings-item__info-text {
        font-size: 14px;
        font-weight: 400;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        word-break: break-all;
      }

      .settings-item__copy-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border: none;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .settings-item__copy-btn nxt1-icon {
        font-size: 14px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .settings-item__copy-btn:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
      }

      .settings-item__copy-btn--copied {
        background: var(--nxt1-color-alpha-success15, rgba(34, 197, 94, 0.15));
      }

      .settings-item__copy-btn--copied nxt1-icon {
        color: var(--nxt1-color-success, #22c55e);
      }

      /* ============================================
       LIGHT MODE
       ============================================ */

      :host-context(.light),
      :host-context([data-theme='light']) {
        .settings-item {
          background: var(--nxt1-color-surface-primary, #ffffff);
          border-bottom-color: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.06));
        }

        .settings-item--clickable:hover {
          background: var(--nxt1-color-surface-hover, rgba(0, 0, 0, 0.02));
        }

        .settings-item--clickable:active {
          background: var(--nxt1-color-surface-active, rgba(0, 0, 0, 0.04));
        }

        .settings-item__icon {
          background: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.04));
        }

        .settings-item__icon nxt1-icon {
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        }

        .settings-item__label {
          color: var(--nxt1-color-text-primary, #1a1a1a);
        }

        .settings-item__description {
          color: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.5));
        }

        .settings-item__value {
          color: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.5));
        }

        .settings-item__chevron {
          color: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.4));
        }

        .settings-item__toggle {
          --track-background: rgba(0, 0, 0, 0.12);
          --handle-background: #ffffff;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsItemComponent {
  private readonly haptics = inject(HapticsService);

  // ============================================
  // INPUTS
  // ============================================

  /** The settings item to render */
  readonly item = input.required<SettingsItem>();

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when a toggle value changes */
  readonly toggle = output<SettingsToggleEvent>();

  /** Emitted when a navigation item is clicked */
  readonly navigate = output<SettingsNavigateEvent>();

  /** Emitted when an action item is clicked */
  readonly action = output<SettingsActionEvent>();

  /** Emitted when copy button is clicked */
  readonly copy = output<SettingsCopyEvent>();

  // ============================================
  // LOCAL STATE
  // ============================================

  private _isCopied = false;
  private copyTimeout: ReturnType<typeof setTimeout> | null = null;

  // ============================================
  // COMPUTED
  // ============================================

  /** Check if item is clickable (navigation, action) */
  protected readonly isClickable = computed(() => {
    const type = this.item().type;
    return type === 'navigation' || type === 'action';
  });

  /** Generate aria label */
  protected readonly ariaLabel = computed(() => {
    const item = this.item();
    const parts = [item.label];
    if (item.description) parts.push(item.description);
    if (item.type === 'toggle') {
      const toggleItem = item as SettingsToggleItem;
      parts.push(toggleItem.value ? 'enabled' : 'disabled');
    }
    return parts.join(', ');
  });

  // ============================================
  // TYPE GUARDS
  // ============================================

  protected asToggle(): SettingsToggleItem {
    return this.item() as SettingsToggleItem;
  }

  protected asNavigation(): SettingsNavigationItem {
    return this.item() as SettingsNavigationItem;
  }

  protected asAction(): SettingsActionItem {
    return this.item() as SettingsActionItem;
  }

  protected asInfo(): SettingsInfoItem {
    return this.item() as SettingsInfoItem;
  }

  // ============================================
  // HELPERS
  // ============================================

  protected isCopied(): boolean {
    return this._isCopied;
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected async handleClick(_event: Event): Promise<void> {
    const item = this.item();

    if (item.disabled) return;

    switch (item.type) {
      case 'navigation':
        await this.haptics.impact('light');
        this.navigate.emit({
          itemId: item.id,
          route: (item as SettingsNavigationItem).route,
          externalUrl: (item as SettingsNavigationItem).externalUrl,
        });
        break;

      case 'action': {
        const actionItem = item as SettingsActionItem;
        if (actionItem.variant === 'danger') {
          await this.haptics.notification('warning');
        } else {
          await this.haptics.impact('light');
        }
        this.action.emit({
          itemId: item.id,
          action: actionItem.action,
          requiresConfirmation: actionItem.requiresConfirmation,
          confirmationMessage: actionItem.confirmationMessage,
        });
        break;
      }
    }
  }

  protected async onToggleChange(event: CustomEvent): Promise<void> {
    const item = this.item() as SettingsToggleItem;
    const newValue = event.detail.checked;

    await this.haptics.selection();

    this.toggle.emit({
      itemId: item.id,
      settingKey: item.settingKey,
      value: newValue,
    });
  }

  protected async onCopy(event: Event): Promise<void> {
    event.stopPropagation();

    const item = this.item() as SettingsInfoItem;

    try {
      await navigator.clipboard.writeText(item.value);
      await this.haptics.notification('success');

      this._isCopied = true;

      if (this.copyTimeout) {
        clearTimeout(this.copyTimeout);
      }

      this.copyTimeout = setTimeout(() => {
        this._isCopied = false;
      }, 2000);

      this.copy.emit({
        itemId: item.id,
        value: item.value,
      });
    } catch {
      await this.haptics.notification('error');
    }
  }
}
