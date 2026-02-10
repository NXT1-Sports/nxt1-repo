/**
 * @fileoverview Analytics Adapter Injection Token
 * @module @nxt1/ui/services/analytics
 *
 * Provides an Angular DI token for the platform analytics adapter.
 * Implementations live in apps (web/mobile) to keep @nxt1/ui portable.
 */

import { InjectionToken } from '@angular/core';
import type { AnalyticsAdapter } from '@nxt1/core/analytics';

export const ANALYTICS_ADAPTER = new InjectionToken<AnalyticsAdapter>('Nxt1AnalyticsAdapter');
