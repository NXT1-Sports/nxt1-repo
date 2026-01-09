/**
 * @fileoverview Platform Detection Utilities
 * @module @nxt1/core/platform
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Detects the current platform/environment for conditional code paths.
 * Works in all JavaScript environments (browser, Node, Capacitor).
 *
 * @example
 * ```typescript
 * import { getPlatform, isMobileApp, isSSR } from '@nxt1/core/platform';
 *
 * if (isSSR()) {
 *   // Server-side code path
 * }
 *
 * if (isMobileApp()) {
 *   // Native mobile code path
 * }
 * ```
 */

/**
 * Platform types
 */
export type Platform =
  | 'browser' // Web browser (Chrome, Safari, Firefox, etc.)
  | 'ios' // iOS native (Capacitor)
  | 'android' // Android native (Capacitor)
  | 'server' // Node.js / SSR
  | 'worker'; // Web Worker

/**
 * Device type based on capabilities
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/**
 * Runtime environment
 */
export type Environment = 'browser' | 'server' | 'native';

/**
 * Platform info object
 */
export interface PlatformInfo {
  platform: Platform;
  deviceType: DeviceType;
  environment: Environment;
  isCapacitor: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isBrowser: boolean;
  isServer: boolean;
  isWorker: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
}

/**
 * Check if code is running in a browser environment
 */
export function isBrowser(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof navigator !== 'undefined'
  );
}

/**
 * Check if code is running in a server environment (Node.js / SSR)
 */
export function isServer(): boolean {
  return typeof window === 'undefined';
}

/**
 * Alias for isServer - more intuitive for SSR checks
 */
export function isSSR(): boolean {
  return isServer();
}

/**
 * Check if code is running in a Web Worker
 */
export function isWorker(): boolean {
  return (
    typeof self !== 'undefined' &&
    typeof window === 'undefined' &&
    typeof (self as unknown as { importScripts?: unknown }).importScripts === 'function'
  );
}

/**
 * Check if running in Capacitor native app
 */
export function isCapacitor(): boolean {
  if (!isBrowser()) return false;
  return !!(
    window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor?.isNativePlatform?.();
}

/**
 * Check if running on iOS (native or browser)
 */
export function isIOS(): boolean {
  if (!isBrowser()) return false;

  // Check Capacitor platform first
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  if (cap?.getPlatform?.() === 'ios') return true;

  // Fall back to user agent check for iOS Safari
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Check if running on Android (native or browser)
 */
export function isAndroid(): boolean {
  if (!isBrowser()) return false;

  // Check Capacitor platform first
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  if (cap?.getPlatform?.() === 'android') return true;

  // Fall back to user agent check
  return /Android/.test(navigator.userAgent);
}

/**
 * Check if running in a mobile native app (Capacitor iOS or Android)
 */
export function isMobileApp(): boolean {
  return isCapacitor() && (isIOS() || isAndroid());
}

/**
 * Check if running on a mobile device (native or mobile browser)
 */
export function isMobileDevice(): boolean {
  if (!isBrowser()) return false;
  return isIOS() || isAndroid();
}

/**
 * Check if device supports touch
 */
export function isTouchDevice(): boolean {
  if (!isBrowser()) return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Check if running on a tablet
 */
export function isTablet(): boolean {
  if (!isBrowser()) return false;

  const ua = navigator.userAgent;
  const isIPad =
    /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroidTablet = /Android/.test(ua) && !/Mobile/.test(ua);

  return isIPad || isAndroidTablet;
}

/**
 * Get current platform
 */
export function getPlatform(): Platform {
  if (isServer()) return 'server';
  if (isWorker()) return 'worker';

  if (isCapacitor()) {
    if (isIOS()) return 'ios';
    if (isAndroid()) return 'android';
  }

  return 'browser';
}

/**
 * Get device type
 */
export function getDeviceType(): DeviceType {
  if (isTablet()) return 'tablet';
  if (isMobileDevice()) return 'mobile';
  return 'desktop';
}

/**
 * Get runtime environment
 */
export function getEnvironment(): Environment {
  if (isServer()) return 'server';
  if (isMobileApp()) return 'native';
  return 'browser';
}

/**
 * Get comprehensive platform info
 */
export function getPlatformInfo(): PlatformInfo {
  return {
    platform: getPlatform(),
    deviceType: getDeviceType(),
    environment: getEnvironment(),
    isCapacitor: isCapacitor(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    isBrowser: isBrowser(),
    isServer: isServer(),
    isWorker: isWorker(),
    isMobile: isMobileDevice(),
    isTablet: isTablet(),
    isDesktop: !isMobileDevice() && !isTablet(),
    isTouchDevice: isTouchDevice(),
  };
}

/**
 * Execute code only in browser environment
 *
 * @param fn - Function to execute
 * @returns Function result or undefined if not in browser
 */
export function runInBrowser<T>(fn: () => T): T | undefined {
  if (isBrowser()) {
    return fn();
  }
  return undefined;
}

/**
 * Execute code only in server environment
 *
 * @param fn - Function to execute
 * @returns Function result or undefined if not on server
 */
export function runOnServer<T>(fn: () => T): T | undefined {
  if (isServer()) {
    return fn();
  }
  return undefined;
}

/**
 * Execute code only in native mobile environment
 *
 * @param fn - Function to execute
 * @returns Function result or undefined if not native
 */
export function runInNative<T>(fn: () => T): T | undefined {
  if (isMobileApp()) {
    return fn();
  }
  return undefined;
}
