/**
 * @fileoverview Usage Page - Web App Wrapper
 * @module @nxt1/web/features/usage
 * @version 2.2.0
 *
 * Thin wrapper component that renders the web-optimized Usage shell
 * from @nxt1/ui. Uses UsageShellWebComponent (zero Ionic, SSR-safe)
 * matching the Profile and Explore web shell pattern.
 *
 * On desktop, the page header is hidden since the sidebar provides nav.
 * The shell's desktop title + subtitle is shown instead.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR WEB FEATURE WRAPPERS ⭐
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { UsageShellWebComponent } from '@nxt1/ui';

@Component({
  selector: 'app-usage',
  standalone: true,
  imports: [UsageShellWebComponent],
  template: ` <nxt1-usage-shell-web [hideHeader]="true" /> `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageComponent {}
