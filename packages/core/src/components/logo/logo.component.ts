/**
 * @fileoverview NXT1 Logo Component
 * @module @nxt1/core/components
 *
 * Standalone Angular component for displaying the NXT1 logo.
 * Uses the shared assets from @nxt1/design-tokens.
 *
 * @example
 * ```html
 * <!-- Basic usage -->
 * <nxt1-logo />
 *
 * <!-- With size -->
 * <nxt1-logo size="lg" />
 *
 * <!-- As link to home -->
 * <nxt1-logo [routerLink]="['/']" />
 *
 * <!-- Auth page variant -->
 * <nxt1-logo variant="auth" />
 * ```
 */

import { Component, ChangeDetectionStrategy, Input, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';

export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'full';
export type LogoVariant = 'default' | 'header' | 'auth' | 'footer' | 'splash';

@Component({
  selector: 'nxt1-logo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <picture>
      <!-- Modern browsers get AVIF -->
      <source [srcset]="avifSrc" type="image/avif" />
      <!-- Fallback to PNG -->
      <img
        [src]="pngSrc"
        [alt]="alt"
        [class]="imageClasses"
        [width]="width"
        [height]="height"
        loading="eager"
        fetchpriority="high"
      />
    </picture>
  `,
  styles: [
    `
      :host {
        display: inline-block;
        line-height: 0;
      }

      :host(.nxt1-logo--block) {
        display: block;
      }

      img {
        max-width: 100%;
        height: auto;
        object-fit: contain;
        user-select: none;
        -webkit-user-drag: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtLogoComponent {
  /** Logo size variant */
  @Input() size: LogoSize = 'md';

  /** Context variant for styling */
  @Input() variant: LogoVariant = 'default';

  /** Alt text for accessibility */
  @Input() alt = 'NXT1 Sports';

  /** Whether to use the shadow version */
  @Input() shadows = false;

  /** Display as block element */
  @Input() block = false;

  @HostBinding('class.nxt1-logo--block')
  get isBlock(): boolean {
    return this.block || this.variant === 'auth';
  }

  /** Path to AVIF logo */
  get avifSrc(): string {
    return 'assets/shared/logo/logo.avif';
  }

  /** Path to PNG logo (fallback) */
  get pngSrc(): string {
    return this.shadows ? 'assets/shared/logo/logo_shadows.png' : 'assets/shared/logo/logo.png';
  }

  /** CSS classes for the image */
  get imageClasses(): string {
    const classes = ['nxt1-logo'];

    if (this.size !== 'md') {
      classes.push(`nxt1-logo--${this.size}`);
    }

    if (this.variant !== 'default') {
      classes.push(`nxt1-logo--${this.variant}`);
    }

    return classes.join(' ');
  }

  /** Intrinsic width based on size */
  get width(): number {
    const widths: Record<LogoSize, number> = {
      xs: 80,
      sm: 120,
      md: 160,
      lg: 200,
      xl: 280,
      xxl: 400,
      full: 400,
    };
    return widths[this.size];
  }

  /** Intrinsic height (maintains aspect ratio) */
  get height(): number {
    // Logo aspect ratio is approximately 3.33:1 (800x240)
    return Math.round(this.width / 3.33);
  }
}
