/**
 * @fileoverview Geolocation Module Barrel Export
 * @module @nxt1/core/geolocation
 *
 * Cross-platform geolocation with adapter pattern.
 *
 * ⭐ ARCHITECTURE OVERVIEW:
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    @nxt1/core/geolocation                   │
 * │                                                              │
 * │  Types & Interfaces (100% portable)                         │
 * │  ├─ GeolocationPosition, GeolocationCoordinates             │
 * │  ├─ GeolocationError, GeolocationOptions                    │
 * │  ├─ LocationData, ReverseGeocodedLocation                   │
 * │  └─ GeolocationAdapter, ReverseGeocodingAdapter             │
 * │                                                              │
 * │  Factory Functions (100% portable)                          │
 * │  └─ createGeolocationService(adapter, geocoder?)            │
 * │                                                              │
 * │  Adapters                                                    │
 * │  ├─ BrowserGeolocationAdapter (web)                         │
 * │  ├─ NominatimGeocodingAdapter (cross-platform)              │
 * │  └─ CachedGeocodingAdapter (wrapper)                        │
 * │                                                              │
 * │  Helpers                                                     │
 * │  ├─ formatLocation, formatLocationShort                     │
 * │  └─ calculateDistance, calculateDistanceMiles               │
 * └─────────────────────────────────────────────────────────────┘
 *
 * @example Web Usage
 * ```typescript
 * import {
 *   createGeolocationService,
 *   BrowserGeolocationAdapter,
 *   NominatimGeocodingAdapter,
 *   CachedGeocodingAdapter,
 * } from '@nxt1/core/geolocation';
 *
 * // Create service with browser adapter and cached geocoding
 * const geolocation = createGeolocationService(
 *   new BrowserGeolocationAdapter(),
 *   new CachedGeocodingAdapter(new NominatimGeocodingAdapter())
 * );
 *
 * // Get location with address
 * const result = await geolocation.getCurrentLocation();
 * if (result.success) {
 *   console.log(result.data.address?.city); // "Los Angeles"
 * }
 * ```
 *
 * @example Mobile (Capacitor) Usage
 * ```typescript
 * import { createGeolocationService } from '@nxt1/core/geolocation';
 * import { CapacitorGeolocationAdapter } from './adapters/capacitor-geolocation';
 *
 * // Mobile uses native Capacitor adapter (implemented in apps/mobile)
 * const geolocation = createGeolocationService(
 *   new CapacitorGeolocationAdapter(),
 *   new CachedGeocodingAdapter(new NominatimGeocodingAdapter())
 * );
 * ```
 */

// Core types and interfaces
export {
  // Position types
  type GeolocationCoordinates,
  type GeolocationPosition,
  type GeolocationError,
  type GeolocationErrorCode,
  type GeolocationOptions,
  type GeolocationPermissionStatus,
  type GeolocationResult,

  // Location data types
  type ReverseGeocodedLocation,
  type LocationData,

  // Adapter interfaces
  type GeolocationAdapter,
  type ReverseGeocodingAdapter,

  // Service interface
  type GeolocationService,

  // Factory function
  createGeolocationService,

  // Error utilities
  createGeolocationError,
  mapBrowserGeolocationError,

  // Helper functions
  formatLocation,
  formatLocationShort,
  calculateDistance,
  calculateDistanceMiles,

  // Default options
  GEOLOCATION_DEFAULTS,
} from './geolocation';

// Browser adapter (for web apps)
export { BrowserGeolocationAdapter } from './browser-adapter';

// Capacitor adapter factory (for mobile apps)
export {
  createCapacitorGeolocationAdapter,
  type CapacitorGeolocationPlugin,
} from './capacitor-adapter';

// Nominatim geocoding (cross-platform)
export {
  NominatimGeocodingAdapter,
  CachedGeocodingAdapter,
  type NominatimConfig,
} from './nominatim-adapter';
