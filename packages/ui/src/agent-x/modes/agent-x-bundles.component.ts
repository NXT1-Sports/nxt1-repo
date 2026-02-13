/**
 * @fileoverview Agent X Bundles Component
 * @module @nxt1/ui/agent-x/modes
 * @version 1.0.0
 *
 * Attractive bundle cards with gradient backgrounds, badge rarity,
 * and bonus XP indicators. Gamified design tying into the /xp system.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AgentXBundle } from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'nxt1-agent-x-bundles',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <section class="bundles-section" aria-label="Bundles">
      <div class="section-header">
        <div class="section-label">
          <nxt1-icon name="gift-outline" [size]="18" class="section-icon" />
          <h3 class="section-title">Bundles</h3>
          <span class="bonus-badge">Bonus XP</span>
        </div>
      </div>

      <div class="bundles-scroll">
        @for (bundle of bundles(); track bundle.id) {
          <button class="bundle-card" (click)="bundleSelected.emit(bundle)">
            <!-- Gradient accent bar -->
            <div class="bundle-accent" [style.background]="bundle.gradient"></div>

            <div class="bundle-body">
              <!-- Icon + Rarity badge -->
              <div class="bundle-icon-row">
                <div class="bundle-icon-wrap">
                  <nxt1-icon [name]="bundle.icon" [size]="24" class="bundle-icon" />
                </div>
                <span class="rarity-badge" [attr.data-rarity]="bundle.badgeRarity">
                  {{ bundle.badgeLabel }}
                </span>
              </div>

              <!-- Title + Subtitle -->
              <span class="bundle-title">{{ bundle.title }}</span>
              <span class="bundle-subtitle">{{ bundle.subtitle }}</span>

              <!-- Footer: counts + XP -->
              <div class="bundle-footer">
                <span class="bundle-items">{{ bundle.itemCount }} items</span>
                <span class="bundle-xp">+{{ bundle.bonusXp }} XP</span>
              </div>
            </div>
          </button>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .bundles-section {
        margin-bottom: var(--nxt1-spacing-6);
      }

      .section-header {
        margin-bottom: var(--nxt1-spacing-3);
      }

      .section-label {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .section-icon {
        color: var(--nxt1-color-text-secondary);
      }

      .section-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .bonus-badge {
        font-size: var(--nxt1-fontSize-2xs, 0.65rem);
        font-weight: var(--nxt1-fontWeight-bold);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        padding: 2px 8px;
        border-radius: var(--nxt1-radius-full);
      }

      /* Horizontal scroll */
      .bundles-scroll {
        display: flex;
        gap: var(--nxt1-spacing-3);
        overflow-x: auto;
        padding-bottom: var(--nxt1-spacing-2);
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .bundles-scroll::-webkit-scrollbar {
        display: none;
      }

      /* Bundle card */
      .bundle-card {
        position: relative;
        display: flex;
        flex-direction: column;
        min-width: 240px;
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-xl, 16px);
        overflow: hidden;
        cursor: pointer;
        text-align: left;
        transition:
          border-color var(--nxt1-duration-fast) var(--nxt1-easing-out),
          transform var(--nxt1-duration-fast) var(--nxt1-easing-out),
          box-shadow var(--nxt1-duration-fast) var(--nxt1-easing-out);
        flex-shrink: 0;
      }

      .bundle-card:hover {
        border-color: var(--nxt1-color-primary);
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      }

      .bundle-card:active {
        transform: translateY(0) scale(0.98);
      }

      /* Gradient accent strip */
      .bundle-accent {
        height: 4px;
        width: 100%;
      }

      /* Body content */
      .bundle-body {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4) var(--nxt1-spacing-4);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
      }

      .bundle-icon-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-1);
      }

      .bundle-icon-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-md);
      }

      .bundle-icon {
        color: var(--nxt1-color-primary);
      }

      /* Rarity badges */
      .rarity-badge {
        font-size: var(--nxt1-fontSize-2xs, 0.65rem);
        font-weight: var(--nxt1-fontWeight-bold);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 2px 8px;
        border-radius: var(--nxt1-radius-full);
      }

      .rarity-badge[data-rarity='common'] {
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-surface-200);
      }

      .rarity-badge[data-rarity='uncommon'] {
        color: #38b000;
        background: rgba(56, 176, 0, 0.12);
      }

      .rarity-badge[data-rarity='rare'] {
        color: #4da6ff;
        background: rgba(77, 166, 255, 0.12);
      }

      .rarity-badge[data-rarity='epic'] {
        color: #a29bfe;
        background: rgba(162, 155, 254, 0.12);
      }

      .rarity-badge[data-rarity='legendary'] {
        color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .bundle-title {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .bundle-subtitle {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .bundle-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: var(--nxt1-spacing-2);
      }

      .bundle-items {
        font-size: var(--nxt1-fontSize-2xs, 0.65rem);
        color: var(--nxt1-color-text-tertiary);
      }

      .bundle-xp {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
      }

      @media (prefers-reduced-motion: reduce) {
        .bundle-card {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXBundlesComponent {
  /** Bundles to display. */
  readonly bundles = input.required<readonly AgentXBundle[]>();

  /** Emitted when a bundle card is clicked. */
  readonly bundleSelected = output<AgentXBundle>();
}
