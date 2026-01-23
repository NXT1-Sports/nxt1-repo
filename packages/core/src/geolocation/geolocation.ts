/**
 * @fileoverview Geolocation Types and Factory
 * @module @nxt1/core/geolocation
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Provides pure TypeScript types and factory functions for geolocation.
 * Platform-specific implementations are injected via adapters.
 *
 * @example
 * ```typescript
 * // Web implementation
 * import { createGeolocationService, BrowserGeolocationAdapter } from '@nxt1/core/geolocation';
 *
 * const geolocation = createGeolocationService(new BrowserGeolocationAdapter());
 * const position = await geolocation.getCurrentPosition();
 *
 * // Mobile (Capacitor) implementation
 * import { createGeolocationService, CapacitorGeolocationAdapter } from '@nxt1/core/geolocation';
 *
 * const geolocation = createGeolocationService(new CapacitorGeolocationAdapter());
 * const position = await geolocation.getCurrentPosition();
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Coordinates returned from geolocation
 */
export interface GeolocationCoordinates {
  /** Latitude in decimal degrees */
  latitude: number;
  /** Longitude in decimal degrees */
  longitude: number;
  /** Accuracy of the position in meters */
  accuracy: number;
  /** Altitude in meters above sea level (may be null) */
  altitude: number | null;
  /** Accuracy of the altitude in meters (may be null) */
  altitudeAccuracy: number | null;
  /** Heading in degrees clockwise from true north (may be null) */
  heading: number | null;
  /** Speed in meters per second (may be null) */
  speed: number | null;
}

/**
 * Position result from geolocation request
 */
export interface GeolocationPosition {
  /** Coordinates data */
  coords: GeolocationCoordinates;
  /** Timestamp of when the position was acquired */
  timestamp: number;
}

/**
 * Error codes for geolocation failures
 */
export type GeolocationErrorCode =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'NOT_SUPPORTED'
  | 'UNKNOWN';

/**
 * Error result from geolocation request
 */
export interface GeolocationError {
  /** Error code */
  code: GeolocationErrorCode;
  /** Human-readable error message */
  message: string;
}

/**
 * Options for geolocation requests
 */
export interface GeolocationOptions {
  /** Enable high accuracy mode (GPS vs network) */
  enableHighAccuracy?: boolean;
  /** Maximum age of cached position in milliseconds */
  maximumAge?: number;
  /** Timeout for the request in milliseconds */
  timeout?: number;
}

/**
 * Permission status for geolocation
 */
export type GeolocationPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

/**
 * Reverse geocoded location data
 */
export interface ReverseGeocodedLocation {
  /** City name */
  city?: string;
  /** State/province/region */
  state?: string;
  /** Country name */
  country?: string;
  /** Country code (ISO 3166-1 alpha-2) */
  countryCode?: string;
  /** Postal/ZIP code */
  postalCode?: string;
  /** Street address */
  street?: string;
  /** Formatted full address */
  formatted?: string;
}

/**
 * Combined location data with coordinates and address
 */
export interface LocationData {
  /** Raw coordinates */
  coords: GeolocationCoordinates;
  /** Reverse geocoded address data */
  address?: ReverseGeocodedLocation;
  /** Whether this was auto-detected */
  isAutoDetected: boolean;
  /** Timestamp of acquisition */
  timestamp: number;
}

/**
 * Result type for geolocation operations
 */
export type GeolocationResult<T> =
  | { success: true; data: T }
  | { success: false; error: GeolocationError };

// ============================================================================
// DEFAULT OPTIONS
// ============================================================================

/**
 * Default geolocation options for different use cases
 */
export const GEOLOCATION_DEFAULTS = {
  /** Quick location (network-based, less accurate) */
  QUICK: {
    enableHighAccuracy: false,
    maximumAge: 5 * 60 * 1000, // 5 minutes
    timeout: 10 * 1000, // 10 seconds
  } as const satisfies GeolocationOptions,

  /** Accurate location (GPS-based, slower) */
  ACCURATE: {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 30 * 1000, // 30 seconds
  } as const satisfies GeolocationOptions,

  /** Balanced (good for most use cases) */
  BALANCED: {
    enableHighAccuracy: true,
    maximumAge: 60 * 1000, // 1 minute
    timeout: 15 * 1000, // 15 seconds
  } as const satisfies GeolocationOptions,
} as const;

// ============================================================================
// ADAPTER INTERFACE
// ============================================================================

/**
 * Platform-agnostic geolocation adapter interface.
 *
 * Implementations provided by platform-specific code:
 * - Web: Uses browser Geolocation API
 * - Mobile: Uses Capacitor Geolocation plugin
 *
 * @example
 * ```typescript
 * // Implement for your platform
 * class MyGeolocationAdapter implements GeolocationAdapter {
 *   async getCurrentPosition(options?: GeolocationOptions): Promise<GeolocationResult<GeolocationPosition>> {
 *     // Platform-specific implementation
 *   }
 * }
 * ```
 */
export interface GeolocationAdapter {
  /**
   * Check if geolocation is supported on this platform
   */
  isSupported(): boolean;

  /**
   * Get the current permission status
   */
  checkPermission(): Promise<GeolocationPermissionStatus>;

  /**
   * Request permission to access location
   */
  requestPermission(): Promise<GeolocationPermissionStatus>;

  /**
   * Get the current position
   */
  getCurrentPosition(options?: GeolocationOptions): Promise<GeolocationResult<GeolocationPosition>>;

  /**
   * Watch position changes (returns cleanup function)
   */
  watchPosition(
    callback: (result: GeolocationResult<GeolocationPosition>) => void,
    options?: GeolocationOptions
  ): () => void;
}

/**
 * Reverse geocoding adapter interface.
 *
 * Implementations can use:
 * - Browser Geocoding API (limited)
 * - Google Maps Geocoding API
 * - OpenStreetMap Nominatim
 * - Capacitor native geocoding
 */
export interface ReverseGeocodingAdapter {
  /**
   * Convert coordinates to address
   */
  reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<GeolocationResult<ReverseGeocodedLocation>>;
}

// ============================================================================
// ERROR UTILITIES
// ============================================================================

/**
 * Create a geolocation error
 */
export function createGeolocationError(
  code: GeolocationErrorCode,
  message?: string
): GeolocationError {
  const defaultMessages: Record<GeolocationErrorCode, string> = {
    PERMISSION_DENIED: 'Location permission was denied',
    POSITION_UNAVAILABLE: 'Location information is unavailable',
    TIMEOUT: 'Location request timed out',
    NOT_SUPPORTED: 'Geolocation is not supported on this device',
    UNKNOWN: 'An unknown error occurred',
  };

  return {
    code,
    message: message ?? defaultMessages[code],
  };
}

/**
 * Map browser geolocation error code to our error code
 */
export function mapBrowserGeolocationError(code: number): GeolocationErrorCode {
  switch (code) {
    case 1:
      return 'PERMISSION_DENIED';
    case 2:
      return 'POSITION_UNAVAILABLE';
    case 3:
      return 'TIMEOUT';
    default:
      return 'UNKNOWN';
  }
}

// ============================================================================
// SERVICE FACTORY
// ============================================================================

/**
 * Geolocation service interface
 */
export interface GeolocationService {
  /** Check if geolocation is available */
  isSupported(): boolean;

  /** Check current permission status */
  checkPermission(): Promise<GeolocationPermissionStatus>;

  /** Request permission */
  requestPermission(): Promise<GeolocationPermissionStatus>;

  /** Get current position */
  getCurrentPosition(options?: GeolocationOptions): Promise<GeolocationResult<GeolocationPosition>>;

  /** Get current position with reverse geocoding */
  getCurrentLocation(options?: GeolocationOptions): Promise<GeolocationResult<LocationData>>;

  /** Watch position changes */
  watchPosition(
    callback: (result: GeolocationResult<GeolocationPosition>) => void,
    options?: GeolocationOptions
  ): () => void;
}

/**
 * Create a geolocation service instance.
 *
 * This factory accepts platform-specific adapters to provide
 * a unified geolocation API across all platforms.
 *
 * @param geolocationAdapter - Platform-specific geolocation implementation
 * @param geocodingAdapter - Optional reverse geocoding implementation
 * @returns Geolocation service instance
 *
 * @example
 * ```typescript
 * // Web
 * const service = createGeolocationService(
 *   new BrowserGeolocationAdapter(),
 *   new NominatimGeocodingAdapter()
 * );
 *
 * // Mobile
 * const service = createGeolocationService(
 *   new CapacitorGeolocationAdapter(),
 *   new NativeGeocodingAdapter()
 * );
 *
 * // Usage
 * const result = await service.getCurrentLocation();
 * if (result.success) {
 *   console.log(result.data.address?.city);
 * }
 * ```
 */
export function createGeolocationService(
  geolocationAdapter: GeolocationAdapter,
  geocodingAdapter?: ReverseGeocodingAdapter
): GeolocationService {
  return {
    isSupported(): boolean {
      return geolocationAdapter.isSupported();
    },

    checkPermission(): Promise<GeolocationPermissionStatus> {
      return geolocationAdapter.checkPermission();
    },

    requestPermission(): Promise<GeolocationPermissionStatus> {
      return geolocationAdapter.requestPermission();
    },

    getCurrentPosition(
      options?: GeolocationOptions
    ): Promise<GeolocationResult<GeolocationPosition>> {
      return geolocationAdapter.getCurrentPosition(options);
    },

    async getCurrentLocation(
      options?: GeolocationOptions
    ): Promise<GeolocationResult<LocationData>> {
      const positionResult = await geolocationAdapter.getCurrentPosition(options);

      if (!positionResult.success) {
        return positionResult;
      }

      const { coords, timestamp } = positionResult.data;

      // Base location data without geocoding
      const locationData: LocationData = {
        coords,
        isAutoDetected: true,
        timestamp,
      };

      // Attempt reverse geocoding if adapter provided
      if (geocodingAdapter) {
        const geocodeResult = await geocodingAdapter.reverseGeocode(
          coords.latitude,
          coords.longitude
        );

        if (geocodeResult.success) {
          locationData.address = geocodeResult.data;
        }
        // Silently continue without address if geocoding fails
      }

      return { success: true, data: locationData };
    },

    watchPosition(
      callback: (result: GeolocationResult<GeolocationPosition>) => void,
      options?: GeolocationOptions
    ): () => void {
      return geolocationAdapter.watchPosition(callback, options);
    },
  };
}

// ============================================================================
// SIMPLE LOCATION HELPERS
// ============================================================================

/**
 * Format location to display string
 */
export function formatLocation(location: ReverseGeocodedLocation): string {
  if (location.formatted) {
    return location.formatted;
  }

  const parts: string[] = [];

  if (location.city) {
    parts.push(location.city);
  }

  if (location.state) {
    parts.push(location.state);
  }

  if (location.country && parts.length === 0) {
    parts.push(location.country);
  }

  return parts.join(', ') || 'Unknown location';
}

/**
 * Format location for profile display (City, State format)
 */
export function formatLocationShort(location: ReverseGeocodedLocation): string {
  const parts: string[] = [];

  if (location.city) {
    parts.push(location.city);
  }

  if (location.state) {
    parts.push(location.state);
  }

  return parts.join(', ') || location.country || '';
}

/**
 * Calculate distance between two coordinates in kilometers
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate distance in miles
 */
export function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return calculateDistance(lat1, lon1, lat2, lon2) * 0.621371;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
