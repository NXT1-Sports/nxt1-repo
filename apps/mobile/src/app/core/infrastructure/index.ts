/**
 * Core Infrastructure Barrel Export
 *
 * Re-exports all infrastructure services for clean imports:
 * - HTTP adapters (Capacitor/Fetch)
 * - Firebase services
 * - Error handling
 *
 * @module @nxt1/mobile/core/infrastructure
 */

// HTTP
export { CapacitorHttpAdapter } from './http/capacitor-http-adapter.service';
