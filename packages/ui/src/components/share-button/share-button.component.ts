/**
 * @fileoverview NxtShareButtonComponent - Cross-Platform Share Button
 * @module @nxt1/ui/components/share-button
 *
 * Lightweight share button component with optional label and haptics.
 * Designed to keep templates consistent and DRY.
 */

import { Component, ChangeDetectionStrategy, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent, type IconName } from '../icon';
import { HapticsService, type HapticImpact } from '../../services/haptics';

export type ShareButtonSize = 'sm' | 'md' | 'lg';
export type ShareButtonVariant = 'ghost' | 'solid' | 'outline';

@Component({
  selector: 'nxt1-share-button',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <button
      type="button"
      class="nxt1-share-button"
      [class.nxt1-share-button--sm]="size() === 'sm'"
      [class.nxt1-share-button--md]="size() === 'md'"
      [class.nxt1-share-button--lg]="size() === 'lg'"
      [class.nxt1-share-button--ghost]="variant() === 'ghost'"
      [class.nxt1-share-button--solid]="variant() === 'solid'"
      [class.nxt1-share-button--outline]="variant() === 'outline'"
      [class.nxt1-share-button--disabled]="disabled()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel() || label() || 'Share'"
      [attr.data-testid]="testId()"
      (click)="onClick($event)"
    >
      <span class="nxt1-share-button__icon">
        <nxt1-icon [name]="icon()" [ariaHidden]="true" />
      </span>
      @if (label()) {
        <span class="nxt1-share-button__label">{{ label() }}</span>
      }
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;

        --nxt1-share-button-size-sm: var(--nxt1-component-shareButton-size-sm, 32px);
        --nxt1-share-button-size-md: var(--nxt1-component-shareButton-size-md, 40px);
        --nxt1-share-button-size-lg: var(--nxt1-component-shareButton-size-lg, 48px);
        --nxt1-share-button-icon-size: var(--nxt1-component-shareButton-iconSize, 20px);
        --nxt1-share-button-radius: var(
          --nxt1-component-shareButton-borderRadius,
          var(--nxt1-border-radius-full, 9999px)
        );
        --nxt1-share-button-transition: var(--nxt1-motion-duration-fast, 150ms)
          var(--nxt1-motion-easing-standard, ease-out);

        --nxt1-share-button-color: var(--nxt1-color-text-primary, currentColor);
        --nxt1-share-button-bg: transparent;
        --nxt1-share-button-bg-hover: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.08));
        --nxt1-share-button-bg-active: var(--nxt1-color-state-pressed, rgba(255, 255, 255, 0.12));
        --nxt1-share-button-outline: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.2));
      }

      .nxt1-share-button {
        appearance: none;
        border: none;
        padding: 0 12px;
        margin: 0;
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;

        display: inline-flex;
        align-items: center;
        gap: 8px;

        height: var(--nxt1-share-button-size-md);
        border-radius: var(--nxt1-share-button-radius);
        color: var(--nxt1-share-button-color);
        background: var(--nxt1-share-button-bg);
        transition: background var(--nxt1-share-button-transition);
      }

      .nxt1-share-button--sm {
        height: var(--nxt1-share-button-size-sm);
        padding: 0 10px;
        font-size: 0.85rem;
      }

      .nxt1-share-button--md {
        height: var(--nxt1-share-button-size-md);
        font-size: 0.95rem;
      }

      .nxt1-share-button--lg {
        height: var(--nxt1-share-button-size-lg);
        font-size: 1rem;
      }

      .nxt1-share-button--outline {
        border: 1px solid var(--nxt1-share-button-outline);
        background: transparent;
      }

      .nxt1-share-button--solid {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.12));
      }

      .nxt1-share-button--ghost:hover {
        background: var(--nxt1-share-button-bg-hover);
      }

      .nxt1-share-button--solid:hover,
      .nxt1-share-button--outline:hover {
        background: var(--nxt1-share-button-bg-hover);
      }

      .nxt1-share-button:active {
        background: var(--nxt1-share-button-bg-active);
      }

      .nxt1-share-button--disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .nxt1-share-button__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: var(--nxt1-share-button-icon-size);
      }

      .nxt1-share-button__label {
        line-height: 1;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtShareButtonComponent {
  private readonly haptics = inject(HapticsService);

  readonly size = input<ShareButtonSize>('md');
  readonly variant = input<ShareButtonVariant>('ghost');
  readonly icon = input<IconName>('share-outline');
  readonly label = input<string>('');
  readonly disabled = input(false);
  readonly ariaLabel = input<string>('');
  readonly testId = input<string>('');
  readonly haptic = input<HapticImpact | 'none'>('light');

  readonly shareClick = output<void>();

  protected async onClick(event: Event): Promise<void> {
    if (this.disabled()) {
      event.preventDefault();
      return;
    }

    if (this.haptic() !== 'none') {
      await this.haptics.impact(this.haptic() as HapticImpact);
    }

    this.shareClick.emit();
  }
}
