/**
 * @fileoverview Types for NxtFloatingActionBarComponent
 * @module @nxt1/ui/components/floating-action-bar
 */

/** A single social / follow link displayed in the panel's follow row */
export interface FloatingBarFollowItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly href: string;
  readonly ariaLabel?: string;
  readonly hidden?: boolean;
}

/** Configuration for the floating action bar */
export interface FloatingActionBarConfig {
  /** URL for the primary CTA pill (defaults to iOS App Store link) */
  readonly appStoreUrl?: string;
  /** Label for the primary CTA pill */
  readonly appButtonLabel?: string;
  /** Icon name for the primary CTA pill (defaults to 'download') */
  readonly appButtonIcon?: string;
  /**
   * When true the CTA pill renders as a <button> and emits the ctaAction output
   * instead of being an <a> link to the app store. Use this on the mobile app
   * where the user is already on the app and you want a custom action.
   */
  readonly appButtonAction?: boolean;
  /** Whether to render the theme selector in the panel */
  readonly showThemeToggle?: boolean;
  /** Label shown above the Follow Us row */
  readonly followUsLabel?: string;
  /** Legal links shown at the bottom of the panel */
  readonly showLegal?: boolean;
}

export const IOS_APP_STORE_URL = 'https://apps.apple.com/us/app/nxt-1/id6446410344';
export const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.nxt1.app';

export const DEFAULT_FLOATING_ACTION_BAR_CONFIG: FloatingActionBarConfig = {
  appStoreUrl: IOS_APP_STORE_URL,
  appButtonLabel: 'Download the NXT1 app',
  showThemeToggle: true,
  followUsLabel: 'Follow Us',
  showLegal: true,
};
