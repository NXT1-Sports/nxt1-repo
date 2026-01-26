/**
 * @fileoverview Browser Geolocation Adapter
 * @module @nxt1/core/geolocation
 *
 * Browser-specific implementation of the GeolocationAdapter interface.
 * Uses the standard Web Geolocation API with 2026 best practices.
 *
 * Features:
 * - Secure context validation (HTTPS required)
 * - Permissions API integration
 * - Comprehensive error handling
 * - SSR-safe implementation
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
 *
 * Note: Geolocation API requires HTTPS (secure context) in modern browsers.
 */
export class BrowserGeolocationAdapter implements GeolocationAdapter {
  /**
   * Check if the browser supports geolocation.
   * Also validates secure context requirement.
   */
  isSupported(): boolean {
    // SSR safety check
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false;
    }

    // Check for geolocation API
    if (!('geolocation' in navigator)) {
      return false;
    }

    // Modern browsers require secure context (HTTPS) for geolocation
    // isSecureContext is available in all modern browsers
    if (typeof window.isSecureContext !== 'undefined' && !window.isSecureContext) {
      console.warn('[Geolocation] Geolocation requires HTTPS (secure context)');
      return false;
    }

    return true;
  }

  /**
   * Check the current permission status using the Permissions API.
   * Falls back to 'unknown' if Permissions API is not available.
   */
  async checkPermission(): Promise<GeolocationPermissionStatus> {
    // SSR safety check
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
      // Permissions API query failed (some browsers don't support geolocation query)
      return 'unknown';
    }
  }

  /**
   * Request geolocation permission by attempting to get position.
   * This will trigger the browser's permission prompt if needed.
   *
   * Note: Web doesn't have a separate requestPermissions API like mobile.
   * Permission is requested when getCurrentPosition is called.
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
          error: createGeolocationError(
            'NOT_SUPPORTED',
            typeof window !== 'undefined' && !window.isSecureContext
              ? 'Geolocation requires HTTPS. Please access the site via HTTPS.'
              : 'Geolocation is not supported on this browser.'
          ),
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
          // Map browser error codes to user-friendly messages
          let message: string;
          switch (error.code) {
            case 1: // PERMISSION_DENIED
              message =
                'Location permission was denied. Please allow location access in your browser settings.';
              break;
            case 2: // POSITION_UNAVAILABLE
              message =
                'Location information is unavailable. Please check your network connection.';
              break;
            case 3: // TIMEOUT
              message = 'Location request timed out. Please try again.';
              break;
            default:
              message = error.message || 'An unknown error occurred while getting location.';
          }

          resolve({
            success: false,
            error: createGeolocationError(mapBrowserGeolocationError(error.code), message),
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
      // Return no-op cleanup when geolocation is not supported
      // eslint-disable-next-line @typescript-eslint/no-empty-function
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
