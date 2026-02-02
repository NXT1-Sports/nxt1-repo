/**
 * @fileoverview Settings Section Component - Grouped Section Container
 * @module @nxt1/ui/settings
 * @version 1.0.0
 *
 * Section container component that groups related settings items.
 * Features a header with title/icon and optional collapsible behavior.
 * Following iOS Settings / Android Preferences patterns.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Section header with icon and title
 * - Optional description
 * - Collapsible sections with animation
 * - Dividers between sections
 * - Full accessibility support
 *
 * @example
 * ```html
 * <nxt1-settings-section
 *   [section]="accountSection"
 *   (toggle)="onToggle($event)"
 *   (navigate)="onNavigate($event)"
 *   (action)="onAction($event)"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  personOutline,
  colorPaletteOutline,
  cardOutline,
  extensionPuzzleOutline,
  helpCircleOutline,
  documentTextOutline,
  chevronDown,
  chevronUp,
} from 'ionicons/icons';
import type { SettingsSection } from '@nxt1/core';
import {
  SettingsItemComponent,
  type SettingsToggleEvent,
  type SettingsNavigateEvent,
  type SettingsActionEvent,
  type SettingsSelectEvent,
  type SettingsCopyEvent,
} from './settings-item.component';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
addIcons({
  personOutline,
  colorPaletteOutline,
  cardOutline,
  extensionPuzzleOutline,
  helpCircleOutline,
  documentTextOutline,
  chevronDown,
  chevronUp,
});

/**
 * Section toggle event.
 */
export interface SettingsSectionToggleEvent {
  readonly sectionId: string;
  readonly collapsed: boolean;
}

@Component({
  selector: 'nxt1-settings-section',
  standalone: true,
  imports: [CommonModule, IonIcon, SettingsItemComponent],
  template: `
    <section
      class="settings-section"
      [class.settings-section--collapsed]="isCollapsed()"
      [attr.aria-labelledby]="headerId()"
    >
      <!-- Section Header -->
      <header
        class="settings-section__header"
        [id]="headerId()"
        [class.settings-section__header--collapsible]="section().collapsible"
        [attr.role]="section().collapsible ? 'button' : undefined"
        [attr.tabindex]="section().collapsible ? 0 : undefined"
        [attr.aria-expanded]="section().collapsible ? !isCollapsed() : undefined"
        (click)="onHeaderClick()"
        (keydown.enter)="onHeaderClick()"
        (keydown.space)="onHeaderClick()"
      >
        <div class="settings-section__header-content">
          @if (section().icon) {
            <div class="settings-section__icon">
              <ion-icon [name]="section().icon!"></ion-icon>
            </div>
          }
          <div class="settings-section__titles">
            <h3 class="settings-section__title">{{ section().title }}</h3>
            @if (section().description) {
              <p class="settings-section__description">{{ section().description }}</p>
            }
          </div>
        </div>
        @if (section().collapsible) {
          <ion-icon
            [name]="isCollapsed() ? 'chevron-down' : 'chevron-up'"
            class="settings-section__collapse-icon"
          ></ion-icon>
        }
      </header>

      <!-- Section Items -->
      <div
        class="settings-section__items"
        [class.settings-section__items--collapsed]="isCollapsed()"
        [attr.aria-hidden]="isCollapsed()"
      >
        @for (item of section().items; track item.id) {
          <nxt1-settings-item
            [item]="item"
            (toggle)="onItemToggle($event)"
            (navigate)="onItemNavigate($event)"
            (action)="onItemAction($event)"
            (select)="onItemSelect($event)"
            (copy)="onItemCopy($event)"
          />
        }
      </div>
    </section>
  `,
  styles: [
    `
      /* ============================================
       SETTINGS SECTION - Grouped Container
       iOS Settings / Android Preferences Pattern
       100% Theme Aware
       ============================================ */

      :host {
        display: block;
      }

      .settings-section {
        margin-bottom: 24px;
      }

      /* ============================================
       HEADER
       ============================================ */

      .settings-section__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        margin-bottom: 4px;
      }

      .settings-section__header--collapsible {
        cursor: pointer;
        border-radius: 12px;
        transition: background-color 0.15s ease;
      }

      .settings-section__header--collapsible:hover {
        background: var(--nxt1-color-surface-hover, rgba(255, 255, 255, 0.02));
      }

      .settings-section__header--collapsible:active {
        background: var(--nxt1-color-surface-active, rgba(255, 255, 255, 0.04));
      }

      .settings-section__header-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .settings-section__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .settings-section__icon ion-icon {
        font-size: 20px;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .settings-section__titles {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .settings-section__title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .settings-section__description {
        margin: 0;
        font-size: 12px;
        font-weight: 400;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .settings-section__collapse-icon {
        font-size: 20px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        transition: transform 0.2s ease;
      }

      /* ============================================
       ITEMS CONTAINER
       ============================================ */

      .settings-section__items {
        overflow: hidden;
        border-radius: 12px;
        background: var(--nxt1-color-surface-primary, var(--ion-background-color, #0a0a0a));
        border: 0.5px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        transition: all 0.2s ease;
      }

      .settings-section__items--collapsed {
        max-height: 0;
        opacity: 0;
        margin-top: 0;
        border-width: 0;
      }

      /* Remove last item border */
      .settings-section__items ::ng-deep nxt1-settings-item:last-child .settings-item {
        border-bottom: none;
      }

      /* ============================================
       COLLAPSED STATE
       ============================================ */

      .settings-section--collapsed .settings-section__header {
        margin-bottom: 0;
      }

      /* ============================================
       LIGHT MODE
       ============================================ */

      :host-context(.light),
      :host-context([data-theme='light']) {
        .settings-section__header--collapsible:hover {
          background: var(--nxt1-color-surface-hover, rgba(0, 0, 0, 0.02));
        }

        .settings-section__header--collapsible:active {
          background: var(--nxt1-color-surface-active, rgba(0, 0, 0, 0.04));
        }

        .settings-section__icon {
          background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        }

        .settings-section__title {
          color: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.5));
        }

        .settings-section__description {
          color: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.4));
        }

        .settings-section__collapse-icon {
          color: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.4));
        }

        .settings-section__items {
          background: var(--nxt1-color-surface-primary, #ffffff);
          border-color: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.06));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSectionComponent {
  private readonly haptics = inject(HapticsService);

  // ============================================
  // INPUTS
  // ============================================

  /** The section configuration to render */
  readonly section = input.required<SettingsSection>();

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when section collapse state changes */
  readonly sectionToggle = output<SettingsSectionToggleEvent>();

  /** Emitted when a toggle item changes */
  readonly toggle = output<SettingsToggleEvent>();

  /** Emitted when a navigation item is clicked */
  readonly navigate = output<SettingsNavigateEvent>();

  /** Emitted when an action item is clicked */
  readonly action = output<SettingsActionEvent>();

  /** Emitted when a select item needs picker */
  readonly select = output<SettingsSelectEvent>();

  /** Emitted when copy button is clicked */
  readonly copy = output<SettingsCopyEvent>();

  // ============================================
  // LOCAL STATE
  // ============================================

  private readonly _isCollapsed = signal(false);

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly isCollapsed = computed(() => {
    // Use section default if set, otherwise use local state
    const section = this.section();
    if (section.collapsible && section.collapsed !== undefined) {
      return section.collapsed;
    }
    return this._isCollapsed();
  });

  protected readonly headerId = computed(() => `settings-section-${this.section().id}`);

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected async onHeaderClick(): Promise<void> {
    const section = this.section();
    if (!section.collapsible) return;

    await this.haptics.impact('light');

    const newState = !this.isCollapsed();
    this._isCollapsed.set(newState);

    this.sectionToggle.emit({
      sectionId: section.id,
      collapsed: newState,
    });
  }

  protected onItemToggle(event: SettingsToggleEvent): void {
    this.toggle.emit(event);
  }

  protected onItemNavigate(event: SettingsNavigateEvent): void {
    this.navigate.emit(event);
  }

  protected onItemAction(event: SettingsActionEvent): void {
    this.action.emit(event);
  }

  protected onItemSelect(event: SettingsSelectEvent): void {
    this.select.emit(event);
  }

  protected onItemCopy(event: SettingsCopyEvent): void {
    this.copy.emit(event);
  }
}
