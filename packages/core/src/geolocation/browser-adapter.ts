/**
 * @fileoverview Browser Geolocation Adapter
 * @module @nxt1/core/geolocation
 *
 * Browser-specific implementation of the GeolocationAdapter interface.
 * Uses the standard Web Geolocation API.
 *
 * @example
 * ```typescript
 * import { createGeolocationService, BrowserGeolocationAdapter } from '@nxt1/core/geolocation';
 *
 * const adapter = new BrowserGeolocationAdapter();
 * const service = createGeolocationService(adapter);
 *
 * const result = await service.getCurrentPosition();
 * ```
 */

import {
  type GeolocationAdapter,
  type GeolocationOptions,
  type GeolocationPermissionStatus,
  type GeolocationPosition,
  type GeolocationResult,
  createGeolocationError,
  mapBrowserGeolocationError,
  GEOLOCATION_DEFAULTS,
} from './geolocation';

/**
 * Browser implementation of GeolocationAdapter.
 *
 * Uses the standard Web Geolocation API available in modern browsers.
 * Handles permissions, position requests, and position watching.
 */
export class BrowserGeolocationAdapter implements GeolocationAdapter {
  /**
   * Check if the browser supports geolocation
   */
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      'geolocation' in navigator
    );
  }

  /**
   * Check the current permission status using the Permissions API.
   * Falls back to 'unknown' if Permissions API is not available.
   */
  async checkPermission(): Promise<GeolocationPermissionStatus> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return 'unknown';
    }

    // Check if Permissions API is available
    if (!('permissions' in navigator)) {
      return 'unknown';
    }

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });

      switch (permission.state) {
        case 'granted':
          return 'granted';
        case 'denied':
          return 'denied';
        case 'prompt':
          return 'prompt';
        default:
          return 'unknown';
      }
    } catch {
      // Permissions API query failed
      return 'unknown';
    }
  }

  /**
   * Request geolocation permission by attempting to get position.
   * This will trigger the browser's permission prompt if needed.
   */
  async requestPermission(): Promise<GeolocationPermissionStatus> {
    if (!this.isSupported()) {
      return 'denied';
    }

    // Try to get position - this triggers the permission prompt
    const result = await this.getCurrentPosition(GEOLOCATION_DEFAULTS.QUICK);

    if (result.success) {
      return 'granted';
    }

    if (result.error.code === 'PERMISSION_DENIED') {
      return 'denied';
    }

    // Other errors (timeout, unavailable) - permission may still be prompt/unknown
    return await this.checkPermission();
  }

  /**
   * Get the current position using the browser Geolocation API.
   */
  getCurrentPosition(
    options: GeolocationOptions = GEOLOCATION_DEFAULTS.BALANCED
  ): Promise<GeolocationResult<GeolocationPosition>> {
    return new Promise((resolve) => {
      if (!this.isSupported()) {
        resolve({
          success: false,
          error: createGeolocationError('NOT_SUPPORTED'),
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            success: true,
            data: {
              coords: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                altitude: position.coords.altitude,
                altitudeAccuracy: position.coords.altitudeAccuracy,
                heading: position.coords.heading,
                speed: position.coords.speed,
              },
              timestamp: position.timestamp,
            },
          });
        },
        (error) => {
          resolve({
            success: false,
            error: createGeolocationError(mapBrowserGeolocationError(error.code), error.message),
          });
        },
        {
          enableHighAccuracy: options.enableHighAccuracy ?? true,
          maximumAge: options.maximumAge ?? 60000,
          timeout: options.timeout ?? 15000,
        }
      );
    });
  }

  /**
   * Watch position changes and call the callback on each update.
   * Returns a cleanup function to stop watching.
   */
  watchPosition(
    callback: (result: GeolocationResult<GeolocationPosition>) => void,
    options: GeolocationOptions = GEOLOCATION_DEFAULTS.BALANCED
  ): () => void {
    if (!this.isSupported()) {
      // Call callback with error immediately
      callback({
        success: false,
        error: createGeolocationError('NOT_SUPPORTED'),
      });
      // Return no-op cleanup
      return () => {};
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        callback({
          success: true,
          data: {
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude,
              altitudeAccuracy: position.coords.altitudeAccuracy,
              heading: position.coords.heading,
              speed: position.coords.speed,
            },
            timestamp: position.timestamp,
          },
        });
      },
      (error) => {
        callback({
          success: false,
          error: createGeolocationError(mapBrowserGeolocationError(error.code), error.message),
        });
      },
      {
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        maximumAge: options.maximumAge ?? 60000,
        timeout: options.timeout ?? 15000,
      }
    );

    // Return cleanup function
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }
}
