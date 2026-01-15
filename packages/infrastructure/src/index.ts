/**
 * @fileoverview NXT1 Infrastructure Package
 * @module @nxt1/infrastructure
 *
 * Cross-cutting Angular services for authentication, network,
 * and platform concerns. These are framework-dependent services
 * that implement interfaces and use types from @nxt1/core.
 *
 * Architecture:
 * - @nxt1/core = Pure TypeScript (types, helpers, validation)
 * - @nxt1/infrastructure = Angular services (this package)
 * - @nxt1/ui = Presentational components only
 *
 * Usage:
 * ```typescript
 * import { BiometricService } from '@nxt1/infrastructure/auth';
 * import { NetworkService } from '@nxt1/infrastructure/network';
 * ```
 */

// Re-export all services from a single entry point
export * from './auth';
export * from './network';
