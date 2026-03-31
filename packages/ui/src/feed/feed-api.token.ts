/**
 * @fileoverview Feed API Injection Token
 * @module @nxt1/ui/feed
 *
 * DI token for the Feed API adapter.
 * Apps (web, mobile) provide their own implementation:
 * - Web: FeedApiService (HttpClient + createFeedApi)
 * - Mobile: Capacitor HTTP adapter
 *
 * The shared FeedService injects this token to call the real backend.
 */

import { InjectionToken } from '@angular/core';
import type { FeedApi } from '@nxt1/core';

/**
 * Injection token for the platform-specific Feed API adapter.
 *
 * @example
 * ```typescript
 * // In app.config.ts (root-level, since FeedService is providedIn: 'root'):
 * { provide: FEED_API, useExisting: FeedApiService }
 * ```
 */
export const FEED_API = new InjectionToken<FeedApi>('FEED_API');
