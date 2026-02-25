/**
 * @fileoverview QR Code Feature Types
 * @module @nxt1/ui/qr-code
 * @version 1.0.0
 *
 * Type definitions for the NXT1 QR Code modal/bottom sheet feature.
 * Used to display a scannable QR code for sharing profile URLs.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

/**
 * Configuration for opening the QR Code modal/bottom sheet.
 */
export interface QrCodeConfig {
  /** The full URL to encode in the QR code (e.g., https://nxt1sports.com/profile/abc123) */
  readonly url: string;

  /** Display name shown above the QR code (e.g., "John Smith") */
  readonly displayName: string;

  /** Profile image URL for the avatar above the QR code */
  readonly profileImg?: string;

  /** Primary sport for themed accent (optional) */
  readonly sport?: string;

  /** Unicode identifier for analytics tracking */
  readonly unicode?: string;

  /** Whether this is the user's own profile */
  readonly isOwnProfile?: boolean;
}

/**
 * Result from QR Code modal/bottom sheet dismissal.
 */
export interface QrCodeResult {
  /** How the modal was dismissed */
  readonly dismissed: boolean;

  /** Whether the user took a sharing action (copy, share, download) */
  readonly shared: boolean;

  /** The action taken, if any */
  readonly action?: 'copy' | 'share' | 'download' | 'dismiss';
}
