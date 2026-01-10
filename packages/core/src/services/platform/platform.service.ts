/**
 * @fileoverview PlatformService - Cross-Platform Detection & Utilities
 * @module @nxt1/core/services
 *
 * Enterprise-grade platform detection service for Angular + Ionic applications.
 * Provides unified API for detecting device capabilities, platform, and viewport.
 *
 * Features:
 * - Device type detection (mobile, tablet, desktop)
 * - Operating system detection (iOS, Android, web)
 * - Viewport size and orientation
 * - Platform capabilities (haptics, camera, biometrics)
 * - SSR-safe with proper browser guards
 * - Reactive signals for state changes
 *
 * @example
 * ```typescript
 * const platform = inject(NxtPlatformService);
 *
 * // Check device type
 * if (platform.isMobile()) {
 *   // Mobile-specific logic
 * }
 *
 * // Use reactive signals in templates
 * @if (platform.isIOS()) {
 *   <ios-specific-component />
 * }
 * ```
 */

import { Injectable, inject, PLATFORM_ID, signal, computed, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Platform } from '@ionic/angular/standalone';

/** Device form factor types */
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/** Operating system types */
export type OperatingSystem = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown';

/** Screen orientation */
export type Orientation = 'portrait' | 'landscape';

/** Ionic display modes */
export type IonicMode = 'ios' | 'md';

/** Platform capabilities */
export interface PlatformCapabilities {
  /** Device supports haptic feedback */
  haptics: boolean;
  /** Device has camera access */
  camera: boolean;
  /** Device supports biometric authentication */
  biometrics: boolean;
  /** Device supports push notifications */
  pushNotifications: boolean;
  /** Device supports native sharing */
  share: boolean;
  /** Device supports vibration API */
  vibration: boolean;
  /** Device is running as a PWA */
  pwa: boolean;
  /** Device supports touch */
  touch: boolean;
  /** Device supports hover */
  hover: boolean;
}

/** Viewport information */
export interface ViewportInfo {
  width: number;
  height: number;
  orientation: Orientation;
  safeAreaInsets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

/** Breakpoint definitions matching Ionic */
export const BREAKPOINTS = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
} as const;

@Injectable({ providedIn: 'root' })
export class NxtPlatformService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ionicPlatform = inject(Platform);
  private readonly ngZone = inject(NgZone);

  // ============================================
  // PRIVATE STATE
  // ============================================

  private readonly _deviceType = signal<DeviceType>('desktop');
  private readonly _os = signal<OperatingSystem>('unknown');
  private readonly _viewport = signal<ViewportInfo>({
    width: 1920,
    height: 1080,
    orientation: 'landscape',
    safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  private readonly _capabilities = signal<PlatformCapabilities>({
    haptics: false,
    camera: false,
    biometrics: false,
    pushNotifications: false,
    share: false,
    vibration: false,
    pwa: false,
    touch: false,
    hover: true,
  });

  // ============================================
  // PUBLIC COMPUTED SIGNALS
  // ============================================

  /** Current device type (mobile, tablet, desktop) */
  readonly deviceType = computed(() => this._deviceType());

  /** Current operating system */
  readonly os = computed(() => this._os());

  /** Current viewport information */
  readonly viewport = computed(() => this._viewport());

  /** Platform capabilities */
  readonly capabilities = computed(() => this._capabilities());

  /** Ionic display mode (ios or md) */
  readonly ionicMode = computed<IonicMode>(() => {
    const os = this._os();
    return os === 'ios' ? 'ios' : 'md';
  });

  // ============================================
  // CONVENIENCE COMPUTED SIGNALS
  // ============================================

  /** True if running in browser */
  readonly isBrowser = computed(() => isPlatformBrowser(this.platformId));

  /** True if running on server (SSR) */
  readonly isServer = computed(() => !isPlatformBrowser(this.platformId));

  /** True if device is mobile phone */
  readonly isMobile = computed(() => this._deviceType() === 'mobile');

  /** True if device is tablet */
  readonly isTablet = computed(() => this._deviceType() === 'tablet');

  /** True if device is desktop */
  readonly isDesktop = computed(() => this._deviceType() === 'desktop');

  /** True if running on iOS */
  readonly isIOS = computed(() => this._os() === 'ios');

  /** True if running on Android */
  readonly isAndroid = computed(() => this._os() === 'android');

  /** True if running in native app (Capacitor) */
  readonly isNative = computed(() => this.ionicPlatform.is('capacitor'));

  /** True if running as PWA */
  readonly isPWA = computed(() => this._capabilities().pwa);

  /** True if device has touch support */
  readonly hasTouch = computed(() => this._capabilities().touch);

  /** True if device supports hover (mouse/trackpad) */
  readonly hasHover = computed(() => this._capabilities().hover);

  /** True if in portrait orientation */
  readonly isPortrait = computed(() => this._viewport().orientation === 'portrait');

  /** True if in landscape orientation */
  readonly isLandscape = computed(() => this._viewport().orientation === 'landscape');

  /** Current breakpoint name */
  readonly breakpoint = computed<keyof typeof BREAKPOINTS>(() => {
    const width = this._viewport().width;
    if (width >= BREAKPOINTS.xl) return 'xl';
    if (width >= BREAKPOINTS.lg) return 'lg';
    if (width >= BREAKPOINTS.md) return 'md';
    if (width >= BREAKPOINTS.sm) return 'sm';
    return 'xs';
  });

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initializePlatformDetection();
      this.setupResizeListener();
      this.setupOrientationListener();
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  private initializePlatformDetection(): void {
    // Detect OS
    this._os.set(this.detectOS());

    // Detect device type
    this._deviceType.set(this.detectDeviceType());

    // Detect capabilities
    this._capabilities.set(this.detectCapabilities());

    // Initial viewport
    this.updateViewport();
  }

  private detectOS(): OperatingSystem {
    if (this.ionicPlatform.is('ios')) return 'ios';
    if (this.ionicPlatform.is('android')) return 'android';

    // Fallback to user agent detection
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    if (/android/.test(ua)) return 'android';
    if (/win/.test(ua)) return 'windows';
    if (/mac/.test(ua)) return 'macos';
    if (/linux/.test(ua)) return 'linux';

    return 'unknown';
  }

  private detectDeviceType(): DeviceType {
    // Use Ionic platform detection
    if (this.ionicPlatform.is('mobileweb') || this.ionicPlatform.is('mobile')) {
      // Distinguish between phone and tablet
      const width = window.innerWidth;
      const height = window.innerHeight;
      const screenSize = Math.min(width, height);

      // Tablets typically have a shorter dimension of 600px or more
      if (screenSize >= 600) {
        return 'tablet';
      }
      return 'mobile';
    }

    if (this.ionicPlatform.is('tablet')) {
      return 'tablet';
    }

    if (this.ionicPlatform.is('desktop')) {
      return 'desktop';
    }

    // Fallback: use viewport width
    const width = window.innerWidth;
    if (width < 576) return 'mobile';
    if (width < 992) return 'tablet';
    return 'desktop';
  }

  private detectCapabilities(): PlatformCapabilities {
    const isNative = this.ionicPlatform.is('capacitor');
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    return {
      haptics: isNative || 'vibrate' in navigator,
      camera: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
      biometrics: isNative, // Requires Capacitor plugin
      pushNotifications: 'Notification' in window || isNative,
      share: 'share' in navigator,
      vibration: 'vibrate' in navigator,
      pwa:
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true,
      touch: hasTouch,
      hover: window.matchMedia('(hover: hover)').matches,
    };
  }

  private updateViewport(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Get safe area insets from CSS environment variables
    const computedStyle = getComputedStyle(document.documentElement);
    const safeAreaInsets = {
      top: parseInt(computedStyle.getPropertyValue('--ion-safe-area-top') || '0', 10),
      bottom: parseInt(computedStyle.getPropertyValue('--ion-safe-area-bottom') || '0', 10),
      left: parseInt(computedStyle.getPropertyValue('--ion-safe-area-left') || '0', 10),
      right: parseInt(computedStyle.getPropertyValue('--ion-safe-area-right') || '0', 10),
    };

    this._viewport.set({
      width,
      height,
      orientation: width > height ? 'landscape' : 'portrait',
      safeAreaInsets,
    });

    // Re-evaluate device type on significant size changes
    this._deviceType.set(this.detectDeviceType());
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  private setupResizeListener(): void {
    // Guard for SSR
    if (typeof window === 'undefined') return;

    // Use ResizeObserver for more reliable updates
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => {
        this.ngZone.run(() => this.updateViewport());
      });
      observer.observe(document.documentElement);
    } else {
      // Fallback to resize event
      (window as Window).addEventListener(
        'resize',
        () => {
          this.ngZone.run(() => this.updateViewport());
        },
        { passive: true }
      );
    }
  }

  private setupOrientationListener(): void {
    // Guard for SSR
    if (typeof window === 'undefined') return;

    // Listen for orientation changes
    if (typeof screen !== 'undefined' && 'orientation' in screen) {
      screen.orientation.addEventListener('change', () => {
        this.ngZone.run(() => this.updateViewport());
      });
    } else {
      // Fallback
      (window as Window).addEventListener('orientationchange', () => {
        this.ngZone.run(() => this.updateViewport());
      });
    }
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Check if viewport is at or above a breakpoint
   */
  isBreakpoint(breakpoint: keyof typeof BREAKPOINTS): boolean {
    return this._viewport().width >= BREAKPOINTS[breakpoint];
  }

  /**
   * Check if viewport is below a breakpoint
   */
  isBelowBreakpoint(breakpoint: keyof typeof BREAKPOINTS): boolean {
    return this._viewport().width < BREAKPOINTS[breakpoint];
  }

  /**
   * Get CSS class string for current platform
   * Useful for platform-specific styling
   */
  getPlatformClasses(): string {
    const classes: string[] = [];

    // Device type
    classes.push(`device-${this._deviceType()}`);

    // OS
    classes.push(`os-${this._os()}`);

    // Mode
    classes.push(`mode-${this.ionicMode()}`);

    // Orientation
    classes.push(`orientation-${this._viewport().orientation}`);

    // Capabilities
    if (this._capabilities().touch) classes.push('has-touch');
    if (this._capabilities().hover) classes.push('has-hover');
    if (this._capabilities().pwa) classes.push('is-pwa');
    if (this.ionicPlatform.is('capacitor')) classes.push('is-native');

    return classes.join(' ');
  }

  /**
   * Trigger haptic feedback if available
   */
  async hapticFeedback(style: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
    if (!this._capabilities().haptics) return;

    try {
      // For native apps, use Capacitor Haptics plugin
      if (this.ionicPlatform.is('capacitor')) {
        // Dynamically import to avoid bundling when not needed
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        const styleMap = {
          light: ImpactStyle.Light,
          medium: ImpactStyle.Medium,
          heavy: ImpactStyle.Heavy,
        };
        await Haptics.impact({ style: styleMap[style] });
      } else if ('vibrate' in navigator) {
        // Web fallback using Vibration API
        const durationMap = { light: 10, medium: 20, heavy: 30 };
        navigator.vibrate(durationMap[style]);
      }
    } catch (error) {
      console.warn('[PlatformService] Haptic feedback failed:', error);
    }
  }

  /**
   * Trigger selection haptic (for buttons, toggles)
   */
  async hapticSelection(): Promise<void> {
    if (!this._capabilities().haptics) return;

    try {
      if (this.ionicPlatform.is('capacitor')) {
        const { Haptics } = await import('@capacitor/haptics');
        await Haptics.selectionStart();
        await Haptics.selectionEnd();
      } else if ('vibrate' in navigator) {
        navigator.vibrate(5);
      }
    } catch (error) {
      console.warn('[PlatformService] Selection haptic failed:', error);
    }
  }

  /**
   * Trigger notification haptic (success, warning, error)
   */
  async hapticNotification(type: 'success' | 'warning' | 'error' = 'success'): Promise<void> {
    if (!this._capabilities().haptics) return;

    try {
      if (this.ionicPlatform.is('capacitor')) {
        const { Haptics, NotificationType } = await import('@capacitor/haptics');
        const typeMap = {
          success: NotificationType.Success,
          warning: NotificationType.Warning,
          error: NotificationType.Error,
        };
        await Haptics.notification({ type: typeMap[type] });
      } else if ('vibrate' in navigator) {
        const patterns = {
          success: [10, 50, 10],
          warning: [20, 100, 20],
          error: [30, 100, 30, 100, 30],
        };
        navigator.vibrate(patterns[type]);
      }
    } catch (error) {
      console.warn('[PlatformService] Notification haptic failed:', error);
    }
  }

  /**
   * Get the Ionic mode for the current platform
   */
  getMode(): IonicMode {
    return this.ionicMode();
  }

  /**
   * Check if a specific Ionic platform is active
   */
  is(platformName: string): boolean {
    return this.ionicPlatform.is(platformName as any);
  }

  /**
   * Wait for the platform to be ready
   */
  ready(): Promise<string> {
    return this.ionicPlatform.ready();
  }
}
