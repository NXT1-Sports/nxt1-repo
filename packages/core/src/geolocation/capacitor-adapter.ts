/**
 * @fileoverview Capacitor Geolocation Adapter
 * @module @nxt1/core/geolocation
 *
 * Production-ready Capacitor adapter for native geolocation.
 * Follows 2026 best practices for iOS and Android.
 *
 * Key Features:
 * - iOS 16+ and Android 12+ support
 * - Proper permission handling with rationale support
 * - Android 12+ approximate vs precise location handling
 * - Comprehensive error mapping with specific error codes
 * - Location fallback support for Android (airplane mode)
 *
 * Required Setup:
 * 1. Install: npm install @capacitor/geolocation
 *
 * 2. iOS Info.plist:
 *    <key>NSLocationWhenInUseUsageDescription</key>
 *    <string>Your app uses location to...</string>
 *    <key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
 *    <string>Your app uses location to...</string>
 *
 * 3. Android AndroidManifest.xml:
 *    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
 *    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
 *    <uses-feature android:name="android.hardware.location.gps" android:required="false" />
 *
 * @see https://capacitorjs.com/docs/apis/geolocation
 *
 * @example
 * ```typescript
 * // In apps/mobile
 * import { Geolocation } from '@capacitor/geolocation';
 * import { createCapacitorGeolocationAdapter } from '@nxt1/core/geolocation';
 *
 * const adapter = createCapacitorGeolocationAdapter(Geolocation);
 * const service = createGeolocationService(adapter);
 *
 * // Check permissions first (best practice)
 * const permission = await service.checkPermission();
 * if (permission === 'prompt' || permission === 'prompt-with-rationale') {
 *   // Show rationale UI before requesting
 *   const granted = await service.requestPermission();
 * }
 *
 * // Get location
 * const result = await service.getCurrentLocation();
 * ```
 */

import type {
  GeolocationAdapter,
  GeolocationOptions,
  GeolocationPermissionStatus,
  GeolocationPosition,
  GeolocationResult,
} from './geolocation';
import { createGeolocationError, GEOLOCATION_DEFAULTS } from './geolocation';

/**
 * Capacitor Geolocation Plugin Types
 * These mirror the @capacitor/geolocation v8 types for reference
 * Updated for 2026 with Android 12+ support
 */
interface CapacitorPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null | undefined;
    altitudeAccuracy: number | null | undefined;
    heading: number | null | undefined;
    speed: number | null | undefined;
  };
  timestamp: number;
}

interface CapacitorPermissionStatus {
  /** Fine location permission (ACCESS_FINE_LOCATION on Android) */
  location: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';
  /** Coarse location permission (ACCESS_COARSE_LOCATION on Android) */
  coarseLocation: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';
}

/**
 * Capacitor Geolocation v8 Position Options
 * Includes Android-specific options for better control
 */
interface CapacitorPositionOptions {
  /** Enable high accuracy mode (GPS if available) */
  enableHighAccuracy?: boolean;
  /** Maximum wait time in milliseconds */
  timeout?: number;
  /** Maximum age in milliseconds of cached position */
  maximumAge?: number;
  /**
   * Android only: Minimum update interval for watchPosition
   * @since Capacitor 6.1.0
   */
  minimumUpdateInterval?: number;
  /**
   * Android only: Desired interval for watchPosition updates
   * @since Capacitor 8.0.0
   */
  interval?: number;
  /**
   * Android only: Fall back to LocationManager if Play Services fails
   * Useful for airplane mode scenarios
   * @since Capacitor 8.0.0
   */
  enableLocationFallback?: boolean;
}

/**
 * Type definition for the Capacitor Geolocation plugin.
 * This allows the adapter to be implemented without importing @capacitor/geolocation
 * directly in the core package. Matches v8 API.
 */
export interface CapacitorGeolocationPlugin {
  getCurrentPosition(options?: CapacitorPositionOptions): Promise<CapacitorPosition>;

  watchPosition(
    options: CapacitorPositionOptions,
    callback: (position: CapacitorPosition | null, err?: Error) => void
  ): Promise<string>;

  clearWatch(options: { id: string }): Promise<void>;

  /** Check permissions - throws if location services disabled */
  checkPermissions(): Promise<CapacitorPermissionStatus>;

  /** Request permissions - throws if location services disabled */
  requestPermissions(options?: {
    permissions: ('location' | 'coarseLocation')[];
  }): Promise<CapacitorPermissionStatus>;
}

/**
 * Capacitor error codes from the native plugin
 * @see https://capacitorjs.com/docs/apis/geolocation#errors
 */
const CAPACITOR_ERROR_CODES = {
  LOCATION_ERROR: 'OS-PLUG-GLOC-0002',
  PERMISSION_DENIED: 'OS-PLUG-GLOC-0003',
  INVALID_PARAMS_GET: 'OS-PLUG-GLOC-0004',
  INVALID_PARAMS_WATCH: 'OS-PLUG-GLOC-0005',
  INVALID_PARAMS_CLEAR: 'OS-PLUG-GLOC-0006',
  SERVICES_DISABLED: 'OS-PLUG-GLOC-0007',
  RESTRICTED: 'OS-PLUG-GLOC-0008',
  ENABLE_DENIED: 'OS-PLUG-GLOC-0009',
  TIMEOUT: 'OS-PLUG-GLOC-0010',
  INVALID_TIMEOUT: 'OS-PLUG-GLOC-0011',
  WATCH_NOT_FOUND: 'OS-PLUG-GLOC-0012',
  WATCH_ID_REQUIRED: 'OS-PLUG-GLOC-0013',
  PLAY_SERVICES_RESOLVABLE: 'OS-PLUG-GLOC-0014',
  PLAY_SERVICES_ERROR: 'OS-PLUG-GLOC-0015',
  SETTINGS_ERROR: 'OS-PLUG-GLOC-0016',
  NETWORK_AND_GPS_OFF: 'OS-PLUG-GLOC-0017',
} as const;

/**
 * Creates a Capacitor geolocation adapter.
 *
 * This factory function accepts the Capacitor Geolocation plugin instance,
 * allowing the core package to remain free of native dependencies.
 *
 * @param Geolocation - The Capacitor Geolocation plugin instance
 * @returns A GeolocationAdapter implementation for native mobile
 *
 * @example
 * ```typescript
 * // In apps/mobile
 * import { Geolocation } from '@capacitor/geolocation';
 * import { createCapacitorGeolocationAdapter } from '@nxt1/core/geolocation';
 *
 * const adapter = createCapacitorGeolocationAdapter(Geolocation);
 * ```
 */
export function createCapacitorGeolocationAdapter(
  Geolocation: CapacitorGeolocationPlugin
): GeolocationAdapter {
  /**
   * Map Capacitor error messages to our error codes
   * Uses error codes from Capacitor Geolocation v8
   */
  function mapCapacitorError(error: unknown): {
    code: 'PERMISSION_DENIED' | 'TIMEOUT' | 'POSITION_UNAVAILABLE' | 'NOT_SUPPORTED';
    message: string;
  } {
    const message = error instanceof Error ? error.message : String(error);
    const errorStr = message.toLowerCase();

    // Check for specific Capacitor error codes first
    if (message.includes(CAPACITOR_ERROR_CODES.PERMISSION_DENIED)) {
      return { code: 'PERMISSION_DENIED', message: 'Location permission was denied' };
    }
    if (message.includes(CAPACITOR_ERROR_CODES.SERVICES_DISABLED)) {
      return {
        code: 'NOT_SUPPORTED',
        message: 'Location services are disabled. Please enable in Settings.',
      };
    }
    if (message.includes(CAPACITOR_ERROR_CODES.RESTRICTED)) {
      return { code: 'PERMISSION_DENIED', message: 'Location access is restricted on this device' };
    }
    if (message.includes(CAPACITOR_ERROR_CODES.TIMEOUT)) {
      return {
        code: 'TIMEOUT',
        message: 'Location request timed out. Try again or move to a location with better signal.',
      };
    }
    if (message.includes(CAPACITOR_ERROR_CODES.NETWORK_AND_GPS_OFF)) {
      return {
        code: 'POSITION_UNAVAILABLE',
        message: 'Both network and GPS are disabled. Please enable at least one.',
      };
    }
    if (
      message.includes(CAPACITOR_ERROR_CODES.PLAY_SERVICES_ERROR) ||
      message.includes(CAPACITOR_ERROR_CODES.PLAY_SERVICES_RESOLVABLE)
    ) {
      return {
        code: 'POSITION_UNAVAILABLE',
        message: 'Google Play Services error. Try updating Play Services.',
      };
    }

    // Fallback to string matching for older error formats
    if (errorStr.includes('denied') || errorStr.includes('permission')) {
      return { code: 'PERMISSION_DENIED', message };
    }
    if (errorStr.includes('timeout') || errorStr.includes('timed out')) {
      return { code: 'TIMEOUT', message };
    }
    if (errorStr.includes('disabled') || errorStr.includes('services')) {
      return { code: 'NOT_SUPPORTED', message };
    }

    return { code: 'POSITION_UNAVAILABLE', message };
  }

  return {
    isSupported(): boolean {
      // Capacitor is always supported when running in a native context
      return true;
    },

    async checkPermission(): Promise<GeolocationPermissionStatus> {
      try {
        const status = await Geolocation.checkPermissions();

        // Android 12+: Check both fine and coarse location
        // Users can grant approximate (coarse) OR precise (fine) location
        const fineLocation = status.location;
        const coarseLocation = status.coarseLocation;

        // If either is granted, location is available
        if (fineLocation === 'granted' || coarseLocation === 'granted') {
          return 'granted';
        }

        // If explicitly denied, return denied
        if (fineLocation === 'denied' && coarseLocation === 'denied') {
          return 'denied';
        }

        // If prompt-with-rationale, user previously denied - show explanation first
        if (
          fineLocation === 'prompt-with-rationale' ||
          coarseLocation === 'prompt-with-rationale'
        ) {
          return 'prompt'; // Our API simplifies to 'prompt'
        }

        return 'prompt';
      } catch (error) {
        // checkPermissions throws if location services are disabled.
        // Check the Capacitor error code first — on iOS the thrown error can be just
        // "OS-PLUG-GLOC-0007" without descriptive words, so word matching alone misses it.
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes(CAPACITOR_ERROR_CODES.SERVICES_DISABLED) ||
          message.toLowerCase().includes('disabled') ||
          message.toLowerCase().includes('services')
        ) {
          return 'denied'; // Treat disabled services as denied
        }
        return 'unknown';
      }
    },

    async requestPermission(): Promise<GeolocationPermissionStatus> {
      try {
        // Request both coarse and fine location permissions
        // Android 12+ will show the precision chooser dialog
        // iOS will show standard location permission dialog
        const status = await Geolocation.requestPermissions({
          permissions: ['coarseLocation', 'location'],
        });

        // Check if either permission was granted
        if (status.location === 'granted' || status.coarseLocation === 'granted') {
          return 'granted';
        }

        // Only report denied when BOTH are denied — if one is still 'prompt' the
        // user hasn't been asked yet (Android can have mixed coarse/fine states)
        if (status.location === 'denied' && status.coarseLocation === 'denied') {
          return 'denied';
        }

        return 'prompt';
      } catch (error) {
        // requestPermissions throws if location services are disabled.
        // Check the Capacitor error code first (iOS can throw just "OS-PLUG-GLOC-0007").
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes(CAPACITOR_ERROR_CODES.SERVICES_DISABLED) ||
          message.toLowerCase().includes('disabled') ||
          message.toLowerCase().includes('services')
        ) {
          return 'denied';
        }
        return 'denied';
      }
    },

    async getCurrentPosition(
      options: GeolocationOptions = GEOLOCATION_DEFAULTS.BALANCED
    ): Promise<GeolocationResult<GeolocationPosition>> {
      try {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: options.enableHighAccuracy ?? true,
          timeout: options.timeout ?? 15000,
          maximumAge: options.maximumAge ?? 60000,
          // Android 8+: Enable fallback to LocationManager when Play Services fails
          // This helps in airplane mode with GPS enabled
          enableLocationFallback: true,
        });

        // Map Capacitor position to our GeolocationPosition
        // Coerce undefined to null for type consistency
        return {
          success: true,
          data: {
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude ?? null,
              altitudeAccuracy: position.coords.altitudeAccuracy ?? null,
              heading: position.coords.heading ?? null,
              speed: position.coords.speed ?? null,
            },
            timestamp: position.timestamp,
          },
        };
      } catch (error) {
        const mapped = mapCapacitorError(error);
        return {
          success: false,
          error: createGeolocationError(mapped.code, mapped.message),
        };
      }
    },

    watchPosition(
      callback: (result: GeolocationResult<GeolocationPosition>) => void,
      options: GeolocationOptions = GEOLOCATION_DEFAULTS.BALANCED
    ): () => void {
      let watchId: string | null = null;
      let isCleanedUp = false;

      // Start watching
      Geolocation.watchPosition(
        {
          enableHighAccuracy: options.enableHighAccuracy ?? true,
          timeout: options.timeout ?? 15000,
          maximumAge: options.maximumAge ?? 60000,
          // Android: Control update frequency
          minimumUpdateInterval: 5000, // Minimum 5 seconds between updates
          enableLocationFallback: true,
        },
        (position, error) => {
          // Don't call callback if cleaned up
          if (isCleanedUp) return;

          if (error || !position) {
            const mapped = mapCapacitorError(error);
            callback({
              success: false,
              error: createGeolocationError(mapped.code, mapped.message),
            });
            return;
          }

          // Map Capacitor position to our GeolocationPosition
          // Coerce undefined to null for type consistency
          callback({
            success: true,
            data: {
              coords: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                altitude: position.coords.altitude ?? null,
                altitudeAccuracy: position.coords.altitudeAccuracy ?? null,
                heading: position.coords.heading ?? null,
                speed: position.coords.speed ?? null,
              },
              timestamp: position.timestamp,
            },
          });
        }
      ).then((id) => {
        // Only set watchId if not already cleaned up
        if (!isCleanedUp) {
          watchId = id;
        } else if (id) {
          // Already cleaned up, clear the watch immediately
          Geolocation.clearWatch({ id });
        }
      });

      // Return cleanup function
      return () => {
        isCleanedUp = true;
        if (watchId) {
          Geolocation.clearWatch({ id: watchId });
          watchId = null;
        }
      };
    },
  };
}
