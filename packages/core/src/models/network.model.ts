/**
 * @fileoverview Network Status Models
 * @module @nxt1/core/models
 *
 * Shared network connectivity types for web and mobile platforms.
 */

/**
 * Network connection types
 */
export type ConnectionType =
  | 'wifi'
  | 'cellular'
  | 'ethernet'
  | 'bluetooth'
  | 'wimax'
  | 'vpn'
  | 'unknown'
  | 'none';

/**
 * Network status information
 */
export interface NetworkStatus {
  /** Whether device has network connectivity */
  connected: boolean;

  /** Type of network connection (mobile may provide more detail than web) */
  connectionType: ConnectionType;
}

/**
 * Network change event
 */
export interface NetworkChangeEvent {
  /** Previous connection status */
  wasConnected: boolean;

  /** Current connection status */
  isConnected: boolean;

  /** Previous connection type */
  previousType: ConnectionType;

  /** Current connection type */
  currentType: ConnectionType;

  /** Timestamp of the change */
  timestamp: number;
}
