/**
 * @fileoverview Capacitor Geolocation Adapter Template
 * @module @nxt1/core/geolocation
 *
 * ⚠️ THIS IS A TEMPLATE FILE - NOT A COMPLETE IMPLEMENTATION ⚠️
 *
 * The actual Capacitor adapter should be implemented in apps/mobile
 * since it requires the @capacitor/geolocation plugin which is a
 * mobile-only dependency.
 *
 * This file provides:
 * 1. Documentation of the expected implementation
 * 2. Type-safe skeleton for the mobile team
 * 3. Reference for 2026 best practices
 *
 * @example Implementation in apps/mobile
 * ```typescript
 * // apps/mobile/src/app/adapters/capacitor-geolocation.adapter.ts
 * import { Geolocation } from '@capacitor/geolocation';
 * import {
 *   GeolocationAdapter,
 *   GeolocationOptions,
 *   GeolocationPermissionStatus,
 *   GeolocationPosition,
 *   GeolocationResult,
 *   createGeolocationError,
 *   GEOLOCATION_DEFAULTS,
 * } from '@nxt1/core/geolocation';
 *
 * export class CapacitorGeolocationAdapter implements GeolocationAdapter {
 *   // See implementation below
 * }
 * ```
 *
 * Required Setup:
 * 1. Install: npm install @capacitor/geolocation
 * 2. iOS: Add to Info.plist:
 *    - NSLocationWhenInUseUsageDescription
 *    - NSLocationAlwaysUsageDescription (if needed)
 * 3. Android: Add to AndroidManifest.xml:
 *    - <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
 *    - <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
 *
 * @see https://capacitorjs.com/docs/apis/geolocation
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
 * These mirror the @capacitor/geolocation types for reference
 * Note: Using undefined-friendly types to match actual Capacitor plugin behavior
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
  location: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';
  coarseLocation: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';
}

/**
 * Type definition for the Capacitor Geolocation plugin.
 * This allows the adapter to be implemented without importing @capacitor/geolocation
 * directly in the core package.
 */
export interface CapacitorGeolocationPlugin {
  getCurrentPosition(options?: {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
  }): Promise<CapacitorPosition>;

  watchPosition(
    options: {
      enableHighAccuracy?: boolean;
      timeout?: number;
      maximumAge?: number;
    },
    callback: (position: CapacitorPosition | null, err?: Error) => void
  ): Promise<string>;

  clearWatch(options: { id: string }): Promise<void>;

  checkPermissions(): Promise<CapacitorPermissionStatus>;

  requestPermissions(options?: {
    permissions: ('location' | 'coarseLocation')[];
  }): Promise<CapacitorPermissionStatus>;
}

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
  return {
    isSupported(): boolean {
      // Capacitor is always supported when running in a native context
      return true;
    },

    async checkPermission(): Promise<GeolocationPermissionStatus> {
      try {
        const status = await Geolocation.checkPermissions();

        // Check fine location first, fall back to coarse
        const locationStatus = status.location || status.coarseLocation;

        switch (locationStatus) {
          case 'granted':
            return 'granted';
          case 'denied':
            return 'denied';
          case 'prompt':
          case 'prompt-with-rationale':
            return 'prompt';
          default:
            return 'unknown';
        }
      } catch {
        return 'unknown';
      }
    },

    async requestPermission(): Promise<GeolocationPermissionStatus> {
      try {
        // Request coarse location first (more likely to be granted)
        // Then request fine location if needed
        const status = await Geolocation.requestPermissions({
          permissions: ['coarseLocation', 'location'],
        });

        const locationStatus = status.location || status.coarseLocation;

        switch (locationStatus) {
          case 'granted':
            return 'granted';
          case 'denied':
            return 'denied';
          default:
            return 'prompt';
        }
      } catch {
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
        // Map Capacitor errors to our error types
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message.includes('denied') || message.includes('permission')) {
          return {
            success: false,
            error: createGeolocationError('PERMISSION_DENIED', message),
          };
        }

        if (message.includes('timeout')) {
          return {
            success: false,
            error: createGeolocationError('TIMEOUT', message),
          };
        }

        return {
          success: false,
          error: createGeolocationError('POSITION_UNAVAILABLE', message),
        };
      }
    },

    watchPosition(
      callback: (result: GeolocationResult<GeolocationPosition>) => void,
      options: GeolocationOptions = GEOLOCATION_DEFAULTS.BALANCED
    ): () => void {
      let watchId: string | null = null;

      // Start watching
      Geolocation.watchPosition(
        {
          enableHighAccuracy: options.enableHighAccuracy ?? true,
          timeout: options.timeout ?? 15000,
          maximumAge: options.maximumAge ?? 60000,
        },
        (position, error) => {
          if (error || !position) {
            callback({
              success: false,
              error: createGeolocationError(
                'POSITION_UNAVAILABLE',
                error?.message ?? 'Position unavailable'
              ),
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
        watchId = id;
      });

      // Return cleanup function
      return () => {
        if (watchId) {
          Geolocation.clearWatch({ id: watchId });
        }
      };
    },
  };
}
