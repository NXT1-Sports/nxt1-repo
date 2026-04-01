/**
 * @fileoverview Performance Adapter Injection Token
 * @module @nxt1/ui/services/performance
 *
 * Provides an Angular DI token for the platform performance adapter.
 * Implementations live in apps (web/mobile) to keep @nxt1/ui portable.
 *
 * Web: provides PerformanceService (@angular/fire/performance)
 * Mobile: provides PerformanceService (@capacitor-firebase/performance)
 * SSR/Test: token is optional — services use { optional: true }
 */

import { InjectionToken } from '@angular/core';
import type { PerformanceAdapter } from '@nxt1/core/performance';

export const PERFORMANCE_ADAPTER = new InjectionToken<PerformanceAdapter>('Nxt1PerformanceAdapter');
