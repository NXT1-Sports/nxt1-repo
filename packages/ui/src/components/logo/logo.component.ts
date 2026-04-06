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

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  HostBinding,
  inject,
  PLATFORM_ID,
  signal,
  computed,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { LOGO_PATHS, LOGO_DIMENSIONS } from '@nxt1/design-tokens/assets';

export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'full';
export type LogoVariant = 'default' | 'header' | 'auth' | 'footer' | 'splash';
export type Theme = 'light' | 'dark' | string; // 'string' allows custom themes like 'football', 'basketball'

@Component({
  selector: 'nxt1-logo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <picture>
      <!-- Use white logo for custom themes, standard for light/dark -->
      <img
        [src]="logoSrc()"
        [alt]="alt"
        class="h-auto max-w-full select-none object-contain"
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtLogoComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly _currentTheme = signal<Theme>('light');
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

  constructor() {
    // Initialize theme detection (SSR-safe)
    if (isPlatformBrowser(this.platformId)) {
      this.detectTheme();
      this.watchThemeChanges();
    }
  }

  @HostBinding('class.nxt1-logo--block')
  get isBlock(): boolean {
    return this.block || this.variant === 'auth';
  }

  /**
   * Logo source based on current theme.
   * - Light theme: Standard logo (with green accent)
   * - Dark theme: Standard logo (designed for dark backgrounds)
   * - Custom themes (football, basketball, etc.): White logo
   */
  readonly logoSrc = computed(() => {
    const theme = this._currentTheme();

    // Use white logo for any custom theme (not light or dark)
    if (theme !== 'light' && theme !== 'dark') {
      return LOGO_PATHS.white;
    }

    // Use standard logo for light and dark themes
    return LOGO_PATHS.main;
  });

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

  /**
   * Detect current theme from document element (SSR-safe).
   */
  private detectTheme(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    this._currentTheme.set(theme as Theme);
  }

  /**
   * Watch for theme changes via MutationObserver (SSR-safe).
   */
  private watchThemeChanges(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Listen for custom theme change events
    window.addEventListener('nxt1-theme-change', (event: Event) => {
      const customEvent = event as CustomEvent<{ theme: Theme }>;
      this._currentTheme.set(customEvent.detail.theme);
    });

    // Also watch for data-theme attribute changes
    const observer = new MutationObserver(() => {
      this.detectTheme();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }
}
