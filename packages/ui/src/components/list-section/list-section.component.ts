/**
 * @fileoverview List Section Component
 * @module @nxt1/ui/components/list-section
 * @version 1.0.0
 *
 * Native iOS-style grouped list section with a section header label
 * and content-projected rows. Provides the outer section layout
 * used across settings, edit-profile, and onboarding screens.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'nxt1-list-section',
  standalone: true,
  template: `
    <section class="nxt1-list-section">
      @if (header()) {
        <h2 class="nxt1-list-header">{{ header() }}</h2>
      }
      <div class="nxt1-list-group">
        <ng-content />
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .nxt1-list-section {
        display: flex;
        flex-direction: column;
      }

      .nxt1-list-header {
        margin: 0;
        padding: 0 var(--nxt1-spacing-1);
        padding-bottom: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
        text-transform: none;
        letter-spacing: normal;
      }

      .nxt1-list-group {
        display: flex;
        flex-direction: column;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtListSectionComponent {
  /** Section header text displayed above the list group. */
  readonly header = input<string>();
}
