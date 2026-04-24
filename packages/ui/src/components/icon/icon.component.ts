/**
 * @fileoverview NxtIconComponent - Cross-Platform Icon Component
 * @module @nxt1/ui/components/icon
 *
 * Shared icon component that renders SVG icons from the design tokens registry.
 * Works identically on web and mobile with zero network requests.
 *
 * Features:
 * - Type-safe icon names from registry
 * - Automatic stroke/fill rendering
 * - Customizable size and color
 * - SSR-safe (inline SVG)
 * - Tree-shakable (only used icons in bundle)
 * - Accessible with proper ARIA attributes
 *
 * Usage:
 * ```html
 * <!-- UI Icons -->
 * <nxt1-icon name="mail" />
 * <nxt1-icon name="lock" size="24" />
 * <nxt1-icon name="eye" color="primary" />
 *
 * <!-- Brand Icons -->
 * <nxt1-icon name="google" size="20" />
 * <nxt1-icon name="apple" />
 * ```
 */

import { Component, Input, HostBinding, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ICONS,
  isStrokeIcon,
  type IconDefinition,
  type IconName,
} from '@nxt1/design-tokens/assets/icons';

@Component({
  selector: 'nxt1-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (iconDef) {
      <svg
        [attr.viewBox]="iconDef.viewBox"
        [attr.width]="size"
        [attr.height]="size"
        [attr.fill]="isStroke ? 'none' : 'currentColor'"
        [attr.stroke]="isStroke ? 'currentColor' : 'none'"
        [attr.stroke-width]="isStroke ? iconDef.strokeWidth : null"
        [attr.stroke-linecap]="isStroke ? 'round' : null"
        [attr.stroke-linejoin]="isStroke ? 'round' : null"
        [attr.aria-hidden]="ariaHidden"
        [attr.aria-label]="ariaLabel"
        [class]="className"
        role="img"
      >
        @if (iconDef.paths) {
          @for (path of iconDef.paths; track $index) {
            <path
              [attr.d]="path.d"
              [attr.fill]="path.fill ?? null"
              [attr.stroke]="path.stroke ?? null"
            />
          }
        }
      </svg>
    } @else {
      <!-- Fallback for missing icons: empty placeholder -->
      <svg
        [attr.viewBox]="'0 0 24 24'"
        [attr.width]="size"
        [attr.height]="size"
        [attr.aria-hidden]="ariaHidden"
        [class]="className"
        role="img"
      >
        <rect
          x="4"
          y="4"
          width="16"
          height="16"
          rx="2"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          opacity="0.3"
        />
      </svg>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      svg {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtIconComponent {
  /** Icon name from the design tokens registry (or any string for dynamic usage) */
  @Input({ required: true }) name!: IconName | string;

  /** Icon size in pixels (width and height) */
  @Input() size: number | string = 20;

  /** Custom CSS class */
  @Input() className = '';

  /** ARIA label for accessibility (if icon has semantic meaning) */
  @Input() ariaLabel?: string;

  /** Whether to hide from screen readers (default: true for decorative icons) */
  @Input() ariaHidden: boolean = true;

  @HostBinding('style.width.px')
  get hostWidth(): number {
    return Number(this.size);
  }

  @HostBinding('style.height.px')
  get hostHeight(): number {
    return Number(this.size);
  }

  /** Get icon definition from registry (null if not found) */
  get iconDef(): IconDefinition | null {
    const icon = ICONS[this.name as IconName];
    if (!icon) {
      return null;
    }
    return icon as IconDefinition;
  }

  /** Check if icon should use stroke rendering */
  get isStroke(): boolean {
    if (!this.iconDef) return false;
    return isStrokeIcon(this.name as IconName);
  }
}
