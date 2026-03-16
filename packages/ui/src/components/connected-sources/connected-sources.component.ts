/**
 * @fileoverview Connected Data Sources Component
 * @module @nxt1/ui/components/connected-sources
 * @version 2.0.0
 *
 * Shared component that displays which platforms/data sources
 * are connected to a user's profile. Supports a segmented toggle
 * to switch between "Linked" (paste URL/username) and "Signed In"
 * (OAuth) connection modes.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { NxtIconComponent, type IconName } from '../icon';

// ============================================
// TYPES
// ============================================

/** Connection mode for the segmented toggle */
export type ConnectionMode = 'link' | 'signin';

/**
 * A connected data source entry for display.
 * Platform-agnostic — supports any social or sports platform.
 */
export interface ConnectedSource {
  /** Platform identifier (e.g., "twitter", "instagram", "hudl") */
  readonly platform: string;
  /** Display label (e.g., "Twitter / X", "Instagram") */
  readonly label: string;
  /** Icon name from the NXT1 design-token registry */
  readonly icon: IconName;
  /** Whether the platform is currently connected */
  readonly connected: boolean;
  /** Display username/handle if connected */
  readonly username?: string;
  /** Profile URL if connected */
  readonly url?: string;
  /** Connection method display hint: 'link' = paste URL, 'signin' = sign in */
  readonly connectionType?: 'link' | 'signin';
  /** Scope: 'global' | 'sport' | 'team' */
  readonly scopeType?: 'global' | 'sport' | 'team';
  /** Sport key or team ID when scoped */
  readonly scopeId?: string;
  /** Real favicon URL (Google Favicon API). When present, replaces the icon glyph. */
  readonly faviconUrl?: string;
}

/**
 * Event emitted when a user taps a data source row.
 */
export interface ConnectedSourceTapEvent {
  /** The source that was tapped */
  readonly source: ConnectedSource;
  /** Index in the sources array */
  readonly index: number;
}

/**
 * Default platform configurations for common social/sports platforms.
 * Use as a starting point — merge with actual user data to set `connected`.
 */
export const DEFAULT_PLATFORMS: readonly ConnectedSource[] = [
  { platform: 'twitter', label: 'Twitter / X', icon: 'twitter', connected: false },
  { platform: 'instagram', label: 'Instagram', icon: 'instagram', connected: false },
  { platform: 'tiktok', label: 'TikTok', icon: 'tiktok', connected: false },
  { platform: 'youtube', label: 'YouTube', icon: 'youtube', connected: false },
  { platform: 'hudl', label: 'Hudl', icon: 'link', connected: false },
];

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-connected-sources',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <section class="nxt1-list-section">
      @if (showModeToggle()) {
        <div class="nxt1-mode-toggle">
          <button
            type="button"
            class="nxt1-mode-btn"
            [class.nxt1-mode-btn--active]="activeMode() === 'link'"
            (click)="setMode('link')"
          >
            Linked
          </button>
          <button
            type="button"
            class="nxt1-mode-btn"
            [class.nxt1-mode-btn--active]="activeMode() === 'signin'"
            (click)="setMode('signin')"
          >
            Signed In
          </button>
        </div>
      }

      @if (title()) {
        <button
          type="button"
          class="nxt1-list-header"
          [class.nxt1-list-header--collapsible]="collapsible()"
          (click)="toggleExpanded()"
        >
          <span class="nxt1-list-header-text">{{ title() }}</span>
          @if (collapsible()) {
            <nxt1-icon
              [name]="expanded() ? 'chevronUp' : 'chevronDown'"
              [size]="14"
              class="nxt1-list-header-chevron"
            />
          }
        </button>
      }
      @if (expanded()) {
        <div class="nxt1-list-group">
          @for (source of filteredSources(); track source.platform; let i = $index) {
            <button
              type="button"
              class="nxt1-source-row"
              [attr.data-testid]="'link-sources-source-row-' + source.platform"
              (click)="sourceTap.emit({ source, index: i })"
            >
              <div class="nxt1-source-left">
                <div
                  class="nxt1-source-icon"
                  [class.nxt1-source-icon--connected]="source.connected"
                >
                  @if (source.faviconUrl && !isFaviconFailed(source.platform)) {
                    <img
                      class="nxt1-source-favicon"
                      [src]="source.faviconUrl"
                      [alt]="source.label"
                      width="18"
                      height="18"
                      (error)="onFaviconError(source.platform)"
                    />
                  } @else {
                    <nxt1-icon [name]="source.icon" [size]="18" />
                  }
                </div>
                <span class="nxt1-source-label">{{ source.label }}</span>
              </div>
              <div class="nxt1-source-right">
                @if (source.connected) {
                  <span class="nxt1-source-username">{{ source.username || 'Connected' }}</span>
                  <nxt1-icon name="checkmarkCircle" [size]="16" class="nxt1-source-check" />
                } @else {
                  <span class="nxt1-source-connect">{{
                    source.connectionType === 'signin' ? 'Sign in' : 'Link'
                  }}</span>
                  <nxt1-icon name="chevronForward" [size]="14" class="nxt1-source-chevron" />
                }
              </div>
            </button>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ============================================
         MODE TOGGLE (segmented control)
         ============================================ */
      .nxt1-mode-toggle {
        display: flex;
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-200);
        padding: var(--nxt1-spacing-0-5);
        margin-bottom: var(--nxt1-spacing-5);
      }

      .nxt1-mode-btn {
        appearance: none;
        -webkit-appearance: none;
        border: none;
        background: transparent;
        flex: 1;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
        border-radius: var(--nxt1-borderRadius-md);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: all var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nxt1-mode-btn--active {
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }

      /* ============================================
         SECTION LAYOUT (matches edit-profile pattern)
         ============================================ */
      .nxt1-list-section {
        display: flex;
        flex-direction: column;
      }

      .nxt1-list-header {
        appearance: none;
        -webkit-appearance: none;
        border: none;
        background: transparent;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 0;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-1);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
        text-transform: none;
        letter-spacing: normal;
        text-align: left;
        cursor: default;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-list-header--collapsible {
        cursor: pointer;
        border-radius: var(--nxt1-borderRadius-md);
        transition: background var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nxt1-list-header--collapsible:active {
        background: var(--nxt1-color-surface-200);
      }

      .nxt1-list-header-text {
        flex: 1;
      }

      .nxt1-list-header-chevron {
        flex-shrink: 0;
        color: var(--nxt1-color-text-tertiary);
        transition: transform var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nxt1-list-group {
        display: flex;
        flex-direction: column;
      }

      /* ============================================
         SOURCE ROW
         ============================================ */
      .nxt1-source-row {
        appearance: none;
        -webkit-appearance: none;
        border: none;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-1);
        font-family: var(--nxt1-fontFamily-brand);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        text-align: left;
        transition: opacity var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nxt1-source-row:not(:last-child) {
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .nxt1-source-row:active {
        opacity: 0.7;
      }

      /* ============================================
         LEFT SIDE — Icon + Label
         ============================================ */
      .nxt1-source-left {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        min-width: 0;
      }

      .nxt1-source-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-8);
        height: var(--nxt1-spacing-8);
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        flex-shrink: 0;
        transition: all var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nxt1-source-icon--connected {
        background: color-mix(in srgb, var(--nxt1-color-primary) 15%, transparent);
        color: var(--nxt1-color-primary);
      }

      .nxt1-source-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-regular);
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
      }

      /* ============================================
         RIGHT SIDE — Status + Indicator
         ============================================ */
      .nxt1-source-right {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        min-width: 0;
        justify-content: flex-end;
        flex: 1;
      }

      .nxt1-source-username {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-regular);
        color: var(--nxt1-color-text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 140px;
      }

      .nxt1-source-connect {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-regular);
        color: var(--nxt1-color-text-tertiary);
      }

      .nxt1-source-favicon {
        display: block;
        border-radius: var(--nxt1-borderRadius-sm, 3px);
        object-fit: contain;
      }

      .nxt1-source-check {
        color: var(--nxt1-color-success, #22c55e);
        flex-shrink: 0;
      }

      .nxt1-source-chevron {
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtConnectedSourcesComponent {
  /** Section title. Defaults to "Connected accounts". */
  readonly title = input('Connected accounts');

  /** Array of data sources to display. */
  readonly sources = input.required<readonly ConnectedSource[]>();

  /** Whether to show the mode toggle (Linked / Signed In). */
  readonly showModeToggle = input(false);

  /** Whether the section is collapsible (accordion). */
  readonly collapsible = input(false);

  /** Whether the section starts expanded. Defaults to true. */
  readonly initialExpanded = input(true);

  /** Initial active mode. Defaults to 'link'. */
  readonly initialMode = input<ConnectionMode>('link');

  /** Emitted when a source row is tapped. */
  readonly sourceTap = output<ConnectedSourceTapEvent>();

  /** Emitted when the user switches the mode toggle. */
  readonly modeChange = output<ConnectionMode>();

  /** Current active toggle mode */
  readonly activeMode = signal<ConnectionMode>('link');

  /** Expanded/collapsed state */
  readonly expanded = signal(true);

  /** Tracks platforms whose favicon failed to load — falls back to the icon glyph */
  private readonly _failedFavicons = signal<ReadonlySet<string>>(new Set());

  onFaviconError(platform: string): void {
    this._failedFavicons.update((s) => new Set([...s, platform]));
  }

  isFaviconFailed(platform: string): boolean {
    return this._failedFavicons().has(platform);
  }

  /** Sources filtered by the active mode (only when toggle is shown). */
  readonly filteredSources = computed(() => {
    const all = this.sources();
    if (!this.showModeToggle()) return all;
    const mode = this.activeMode();
    return all.filter((s) => (s.connectionType ?? 'link') === mode);
  });

  constructor() {
    effect(() => {
      this.expanded.set(this.initialExpanded());
    });
  }

  toggleExpanded(): void {
    if (!this.collapsible()) return;
    this.expanded.update((v) => !v);
  }

  setMode(mode: ConnectionMode): void {
    this.activeMode.set(mode);
    this.modeChange.emit(mode);
  }
}
