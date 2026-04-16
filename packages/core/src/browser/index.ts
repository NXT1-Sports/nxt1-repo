/**
 * @fileoverview Browser Module - In-App Browser Types & Utilities
 * @module @nxt1/core/browser
 *
 * Pure TypeScript types and utilities for in-app browser functionality.
 * For Angular service implementation, use @nxt1/ui/services/browser.
 *
 * @example
 * ```typescript
 * import {
 *   type InAppBrowserOptions,
 *   type LinkType,
 *   BROWSER_COLORS,
 *   detectLinkType,
 *   sanitizeUrl,
 * } from '@nxt1/core';
 * ```
 */

// Types
export type {
  BrowserPresentationStyle,
  DismissStyle,
  InAppBrowserOptions,
  BrowserOpenedEvent,
  BrowserFinishedEvent,
  BrowserPageLoadedEvent,
  BrowserAdapter,
  LinkType,
  TrackingSurface,
  TrackingSubjectType,
  OpenLinkOptions,
} from './browser.types';

// Constants
export { BROWSER_COLORS, DEFAULT_BROWSER_OPTIONS } from './browser.types';

// Helpers
export {
  isValidUrl,
  ensureProtocol,
  sanitizeUrl,
  buildTrackedLinkUrl,
  detectLinkType,
  extractDomain,
  shouldOpenInExternalApp,
  isInternalLink,
} from './browser.helpers';
