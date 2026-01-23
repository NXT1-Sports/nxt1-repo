/**
 * @fileoverview Nominatim Reverse Geocoding Adapter
 * @module @nxt1/core/geolocation
 *
 * Uses OpenStreetMap's Nominatim service for reverse geocoding.
 * Free to use with attribution, rate-limited to 1 req/sec.
 *
 * @see https://nominatim.org/release-docs/latest/api/Reverse/
 *
 * @example
 * ```typescript
 * import { NominatimGeocodingAdapter } from '@nxt1/core/geolocation';
 *
 * const geocoder = new NominatimGeocodingAdapter();
 * const result = await geocoder.reverseGeocode(40.7128, -74.0060);
 * // { city: 'New York', state: 'New York', country: 'United States', ... }
 * ```
 */

import {
  type ReverseGeocodingAdapter,
  type ReverseGeocodedLocation,
  type GeolocationResult,
  createGeolocationError,
} from './geolocation';

/**
 * Nominatim API response shape
 */
interface NominatimResponse {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    region?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
  boundingbox: [string, string, string, string];
}

/**
 * Configuration for Nominatim adapter
 */
export interface NominatimConfig {
  /** User agent for API requests (required by Nominatim ToS) */
  userAgent?: string;
  /** API endpoint (default: official Nominatim) */
  endpoint?: string;
  /** Accept-Language header for localized results */
  language?: string;
}

const DEFAULT_CONFIG: Required<NominatimConfig> = {
  userAgent: 'NXT1-Sports-App/1.0',
  endpoint: 'https://nominatim.openstreetmap.org',
  language: 'en',
};

/**
 * Nominatim (OpenStreetMap) reverse geocoding adapter.
 *
 * Uses the free OpenStreetMap Nominatim service for reverse geocoding.
 * Rate limited to 1 request per second per Terms of Service.
 *
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */
export class NominatimGeocodingAdapter implements ReverseGeocodingAdapter {
  private readonly config: Required<NominatimConfig>;

  constructor(config: NominatimConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Reverse geocode coordinates to address
   */
  async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<GeolocationResult<ReverseGeocodedLocation>> {
    try {
      const url = new URL(`${this.config.endpoint}/reverse`);
      url.searchParams.set('format', 'json');
      url.searchParams.set('lat', latitude.toString());
      url.searchParams.set('lon', longitude.toString());
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', this.config.language);

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': this.config.userAgent,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: createGeolocationError(
            'POSITION_UNAVAILABLE',
            `Geocoding request failed: ${response.status}`
          ),
        };
      }

      const data: NominatimResponse = await response.json();

      // Extract address components
      const address = data.address;
      const city = address.city || address.town || address.village || address.municipality;
      const state = address.state || address.region;

      const location: ReverseGeocodedLocation = {
        city,
        state,
        country: address.country,
        countryCode: address.country_code?.toUpperCase(),
        postalCode: address.postcode,
        street: [address.house_number, address.road].filter(Boolean).join(' ') || undefined,
        formatted: data.display_name,
      };

      return { success: true, data: location };
    } catch (error) {
      return {
        success: false,
        error: createGeolocationError(
          'POSITION_UNAVAILABLE',
          error instanceof Error ? error.message : 'Geocoding request failed'
        ),
      };
    }
  }
}

/**
 * In-memory cache for geocoding results to reduce API calls
 */
export class CachedGeocodingAdapter implements ReverseGeocodingAdapter {
  private readonly adapter: ReverseGeocodingAdapter;
  private readonly cache = new Map<string, { data: ReverseGeocodedLocation; timestamp: number }>();
  private readonly ttl: number;
  private readonly precision: number;

  /**
   * @param adapter - Underlying geocoding adapter
   * @param ttl - Cache TTL in milliseconds (default: 24 hours)
   * @param precision - Coordinate precision for cache key (decimal places)
   */
  constructor(adapter: ReverseGeocodingAdapter, ttl = 24 * 60 * 60 * 1000, precision = 3) {
    this.adapter = adapter;
    this.ttl = ttl;
    this.precision = precision;
  }

  async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<GeolocationResult<ReverseGeocodedLocation>> {
    // Round coordinates to reduce cache fragmentation
    const roundedLat = latitude.toFixed(this.precision);
    const roundedLon = longitude.toFixed(this.precision);
    const cacheKey = `${roundedLat},${roundedLon}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return { success: true, data: cached.data };
    }

    // Fetch from adapter
    const result = await this.adapter.reverseGeocode(latitude, longitude);

    // Cache successful results
    if (result.success) {
      this.cache.set(cacheKey, { data: result.data, timestamp: Date.now() });

      // Cleanup old entries (simple LRU-ish behavior)
      if (this.cache.size > 100) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          this.cache.delete(firstKey);
        }
      }
    }

    return result;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
