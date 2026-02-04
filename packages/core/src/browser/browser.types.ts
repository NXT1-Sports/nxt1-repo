/**
 * @fileoverview Browser Types - In-App Browser Configuration
 * @module @nxt1/core/browser
 *
 * Pure TypeScript types for in-app browser functionality.
 * Platform-agnostic - works with any Capacitor adapter.
 *
 * iOS: Uses SFSafariViewController
 * Android: Uses Chrome Custom Tabs
 * Web: Opens in new tab
 */

// ============================================
// PRESENTATION STYLES
// ============================================

/**
 * iOS presentation style for the browser
 * @see https://capacitorjs.com/docs/apis/browser#presentationstyle
 */
export type BrowserPresentationStyle = 'fullscreen' | 'popover';

/**
 * iOS Safari ViewController dismiss button style
 */
export type DismissStyle = 'close' | 'done' | 'cancel';

// ============================================
// BROWSER CONFIGURATION
// ============================================

/**
 * Configuration for opening an in-app browser
 */
export interface InAppBrowserOptions {
  /** URL to open (required) */
  readonly url: string;

  /**
   * Toolbar/status bar color (hex format)
   * iOS: Safari toolbar color
   * Android: Chrome Custom Tab toolbar color
   * @default '#0a0a0a' (NXT1 dark background)
   */
  readonly toolbarColor?: string;

  /**
   * Presentation style (iOS only)
   * - 'fullscreen': Full screen modal
   * - 'popover': Card-style modal (iOS 13+)
   * @default 'popover'
   */
  readonly presentationStyle?: BrowserPresentationStyle;

  /**
   * Window name for web platform
   * @default '_blank'
   */
  readonly windowName?: string;

  /**
   * Width of the browser window (iPad/desktop only)
   * @default undefined (system default)
   */
  readonly width?: number;

  /**
   * Height of the browser window (iPad/desktop only)
   * @default undefined (system default)
   */
  readonly height?: number;
}

/**
 * Event emitted when browser is opened
 */
export interface BrowserOpenedEvent {
  /** URL that was opened */
  readonly url: string;
  /** Timestamp when browser was opened */
  readonly openedAt: number;
}

/**
 * Event emitted when browser is closed/finished
 */
export interface BrowserFinishedEvent {
  /** URL that was being viewed */
  readonly url?: string;
  /** Timestamp when browser was closed */
  readonly closedAt: number;
  /** Duration browser was open (ms) */
  readonly duration?: number;
}

/**
 * Event emitted when page loads in browser
 */
export interface BrowserPageLoadedEvent {
  /** URL that was loaded */
  readonly url: string;
}

// ============================================
// BROWSER ADAPTER (Platform Implementation)
// ============================================

/**
 * Platform-agnostic browser adapter interface
 * Implemented by Capacitor Browser plugin or web fallback
 */
export interface BrowserAdapter {
  /**
   * Open URL in in-app browser
   */
  open(options: InAppBrowserOptions): Promise<void>;

  /**
   * Close the in-app browser (if open)
   * Web: No-op (cannot close tabs programmatically)
   */
  close(): Promise<void>;

  /**
   * Add listener for browser events
   */
  addListener(
    event: 'browserFinished' | 'browserPageLoaded',
    callback: (info: BrowserFinishedEvent | BrowserPageLoadedEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;

  /**
   * Remove all listeners
   */
  removeAllListeners(): Promise<void>;
}

// ============================================
// LINK TYPES (Semantic URLs)
// ============================================

/**
 * Types of links that can be opened
 * Used for analytics and determining open behavior
 */
export type LinkType =
  | 'external' // Generic external link
  | 'college' // College website
  | 'social' // Social media profile
  | 'video' // Video content (YouTube, Vimeo)
  | 'news' // News article
  | 'legal' // Privacy policy, terms of service
  | 'support' // Help/support pages
  | 'store' // App store links
  | 'payment'; // Payment processor pages

/**
 * Configuration for opening a semantic link
 */
export interface OpenLinkOptions {
  /** URL to open */
  readonly url: string;

  /** Type of link (for analytics) */
  readonly linkType?: LinkType;

  /** Custom toolbar color (overrides default) */
  readonly toolbarColor?: string;

  /** Source of the link open (for analytics) */
  readonly source?: string;

  /** Additional metadata for analytics */
  readonly metadata?: Record<string, string | number | boolean>;
}

// ============================================
// BRAND COLORS
// ============================================

/**
 * NXT1 brand color constants for browser customization
 */
export const BROWSER_COLORS = {
  /** Dark background - default toolbar color */
  TOOLBAR_DARK: '#0a0a0a',

  /** Light toolbar for contrast */
  TOOLBAR_LIGHT: '#ffffff',

  /** NXT1 primary accent (lime green) */
  ACCENT_PRIMARY: '#ccff00',

  /** Secondary accent */
  ACCENT_SECONDARY: '#1a1a1a',
} as const;

/**
 * Default browser options
 */
export const DEFAULT_BROWSER_OPTIONS: Required<
  Omit<InAppBrowserOptions, 'url' | 'width' | 'height'>
> & { width: undefined; height: undefined } = {
  toolbarColor: BROWSER_COLORS.TOOLBAR_DARK,
  presentationStyle: 'popover',
  windowName: '_blank',
  width: undefined,
  height: undefined,
};
