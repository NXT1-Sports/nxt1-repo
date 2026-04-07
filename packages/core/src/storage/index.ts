/**
 * @fileoverview Storage Module Barrel Export
 * @module @nxt1/core/storage
 *
 * Platform-agnostic storage abstractions for web and mobile.
 *
 * @example
 * ```typescript
 * // Import the interface and create platform-specific adapter
 * import {
 *   StorageAdapter,
 *   STORAGE_KEYS,
 *   createBrowserStorageAdapter,
 *   createCapacitorStorageAdapter,
 * } from '@nxt1/core/storage';
 *
 * // Detect platform and use appropriate adapter
 * const storage: StorageAdapter = isNativePlatform()
 *   ? createCapacitorStorageAdapter()
 *   : createBrowserStorageAdapter();
 *
 * // Use consistent API everywhere
 * await storage.set(STORAGE_KEYS.AUTH_TOKEN, token);
 * const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN);
 * ```
 */

// Interface and constants
export { type StorageAdapter, STORAGE_KEYS, type StorageKey } from './storage-adapter';

// Firebase Storage service (with Resize Images extension support)
// TODO: Create storage.service.ts
// export * from './storage.service';

// Browser implementation
export {
  createBrowserStorageAdapter,
  browserLocalStorage,
  browserSessionStorage,
  type BrowserStorageType,
} from './browser-storage';

// Capacitor implementation
export { createCapacitorStorageAdapter, capacitorStorage } from './capacitor-storage';

// Memory implementation (SSR, testing)
export { createMemoryStorageAdapter, memoryStorage } from './memory-storage';

// File download adapter (platform-agnostic)
export { type FileDownloadAdapter, type FileDownloadOptions } from './file-download.adapter';
