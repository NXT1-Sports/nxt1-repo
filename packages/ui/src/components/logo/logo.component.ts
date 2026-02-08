/**
 * @fileoverview NXT1 Logo Component
 * @module @nxt1/ui/components/logo
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
import { LOGO_PATHS, LOGO_DIMENSIONS } from '@nxt1/design-tokens/assets';

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
        class="h-auto max-w-full object-contain select-none"
        [style.user-drag]="'none'"
        [style.-webkit-user-drag]="'none'"
        [width]="width"
        [height]="height"
        loading="eager"
        fetchpriority="high"
      />
    </picture>
  `,
  host: {
    class: 'inline-block leading-none',
    '[class.block]': 'isBlock',
  },
  styles: [],
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

  /** Path to AVIF logo (primary modern format) */
  get avifSrc(): string {
    return LOGO_PATHS.mainAvif;
  }

  /** Path to PNG logo (fallback for older browsers) */
  get pngSrc(): string {
    return LOGO_PATHS.main;
  }

  /** Intrinsic width based on size */
  get width(): number {
    const scale: Record<LogoSize, number> = {
      xs: 0.13,
      sm: 0.2,
      md: 0.27,
      lg: 0.33,
      xl: 0.47,
      xxl: 0.67,
      full: 1,
    };
    return Math.round(LOGO_DIMENSIONS.main.width * scale[this.size]);
  }

  /** Intrinsic height (maintains aspect ratio) */
  get height(): number {
    const scale: Record<LogoSize, number> = {
      xs: 0.13,
      sm: 0.2,
      md: 0.27,
      lg: 0.33,
      xl: 0.47,
      xxl: 0.67,
      full: 1,
    };
    return Math.round(LOGO_DIMENSIONS.main.height * scale[this.size]);
  }
}
