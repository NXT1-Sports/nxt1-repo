/**
 * @fileoverview NxtPlatformIconComponent — Shared Platform Icon
 * @module @nxt1/ui/components/platform-icon
 * @version 1.0.0
 *
 * Renders a platform icon with automatic favicon fallback.
 * Platforms with native SVG glyphs (twitter, instagram, youtube)
 * render via NxtIconComponent. Platforms mapped to 'link' (hudl,
 * maxpreps, on3, etc.) render a Google Favicon API image with
 * graceful error fallback to the glyph icon.
 *
 * Centralises the favicon/glyph decision that was previously
 * duplicated in 7+ components across profile, team-profile,
 * connected-sources, and edit-profile.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { NxtIconComponent } from '../icon';

@Component({
  selector: 'nxt1-platform-icon',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    @if (shouldShowFavicon()) {
      <img
        class="nxt1-platform-icon-favicon"
        [src]="faviconUrl()"
        [alt]="alt()"
        [width]="size()"
        [height]="size()"
        loading="lazy"
        referrerpolicy="no-referrer"
        (error)="onFaviconError()"
      />
    } @else {
      <nxt1-icon [name]="icon()" [size]="size()" />
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        line-height: 0;
      }

      .nxt1-platform-icon-favicon {
        display: block;
        border-radius: 3px;
        object-fit: contain;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtPlatformIconComponent {
  /** Icon name from design-token registry (e.g., 'twitter', 'link'). */
  readonly icon = input.required<string>();

  /** Favicon URL from Google Favicon API. When provided for `icon === 'link'`, renders `<img>`. */
  readonly faviconUrl = input<string | null | undefined>(null);

  /** Icon size in pixels. Applied to both glyph and favicon. */
  readonly size = input<number>(16);

  /** Alt text for the favicon image. */
  readonly alt = input<string>('');

  /** Tracks whether the favicon failed to load. */
  private readonly _faviconFailed = signal(false);

  /** Show <img> when faviconUrl is present, icon is 'link', and no load error. */
  protected readonly shouldShowFavicon = computed(
    () => !!this.faviconUrl() && this.icon() === 'link' && !this._faviconFailed()
  );

  /** On image error, flip to glyph fallback. */
  protected onFaviconError(): void {
    this._faviconFailed.set(true);
  }
}
