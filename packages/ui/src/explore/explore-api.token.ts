/**
 * @fileoverview Explore API Injection Token
 * @module @nxt1/ui/explore
 *
 * DI token for the Explore API adapter.
 * Apps (web, mobile) provide their own implementation:
 * - Web: ExploreApiService (HttpClient + createExploreApi)
 * - Mobile: Capacitor HTTP adapter
 *
 * The shared ExploreService injects this token to call the real backend.
 */

import { InjectionToken } from '@angular/core';
import type { ExploreApi } from '@nxt1/core';

/**
 * Injection token for the platform-specific Explore API adapter.
 *
 * @example
 * ```typescript
 * // In app config or route providers:
 * { provide: EXPLORE_API, useExisting: ExploreApiService }
 * ```
 */
export const EXPLORE_API = new InjectionToken<ExploreApi>('EXPLORE_API');
