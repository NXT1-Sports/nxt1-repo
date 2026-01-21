/**
 * Core Module Barrel Export
 *
 * Re-exports all core services and infrastructure:
 * - Infrastructure (HTTP, Firebase, etc.)
 * - Core services
 *
 * Note: Auth is now in features/auth/ per 2026 feature-first architecture.
 *
 * @module @nxt1/mobile/core
 */

// Infrastructure
export * from './infrastructure';

// Services
export * from './services';
