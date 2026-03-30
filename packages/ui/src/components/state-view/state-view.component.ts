/**
 * @fileoverview Shared State View Component (Error / Empty / Not Found)
 * @module @nxt1/ui/components/state-view
 *
 * A single, reusable component for all error, empty, and not-found states
 * across the entire platform. Replaces 15+ inline duplicates.
 *
 * Uses design tokens exclusively — no hardcoded colors, sizes, or fonts.
 *
 * @example
 * ```html
 * <!-- Error state with retry -->
 * <nxt1-state-view
 *   variant="error"
 *   title="Something went wrong"
 *   message="Failed to load data"
 *   actionLabel="Try Again"
 *   actionIcon="refresh"
 *   (action)="onRetry()"
 * />
 *
 * <!-- Empty state with CTA -->
 * <nxt1-state-view
 *   variant="empty"
 *   icon="notifications"
 *   title="No activity yet"
 *   message="When you get likes, follows, or messages they'll show up here"
 *   actionLabel="Explore"
 *   (action)="navigateToExplore()"
 * />
 *
 * <!-- Not found state -->
 * <nxt1-state-view
 *   variant="not-found"
 *   title="Article not found"
 *   message="This article may have been removed or is no longer available"
 *   actionLabel="Go Back"
 *   (action)="goBack()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { NxtIconComponent } from '../icon/icon.component';

@Component({
  selector: 'nxt1-state-view',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="state-view" [class]="'state-view--' + variant()">
      <!-- Icon Circle -->
      <div class="state-view__icon" [class]="'state-view__icon--' + variant()">
        <nxt1-icon [name]="resolvedIcon()" [size]="36" />
      </div>

      <!-- Title -->
      <h3 class="state-view__title">{{ title() }}</h3>

      <!-- Message -->
      @if (message()) {
        <p class="state-view__message">{{ message() }}</p>
      }

      <!-- Action Button -->
      @if (actionLabel()) {
        <button
          type="button"
          class="state-view__action"
          [class]="'state-view__action--' + variant()"
          (click)="action.emit()"
        >
          @if (actionIcon()) {
            <nxt1-icon [name]="actionIcon()!" [size]="18" />
          }
          <span>{{ actionLabel() }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .state-view {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
      }

      /* ── Icon Circle ── */

      .state-view__icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
      }

      .state-view__icon--error {
        background: var(--nxt1-color-errorBg, rgba(239, 68, 68, 0.1));
      }

      .state-view__icon--error nxt1-icon {
        color: var(--nxt1-color-error, #ef4444);
      }

      .state-view__icon--empty,
      .state-view__icon--not-found {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      .state-view__icon--empty nxt1-icon,
      .state-view__icon--not-found nxt1-icon {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      /* ── Title ── */

      .state-view__title {
        font-size: 18px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0 0 8px;
      }

      /* ── Message ── */

      .state-view__message {
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0 0 20px;
        max-width: 280px;
        line-height: 1.5;
      }

      /* ── Action Button ── */

      .state-view__action {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 10px 24px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition:
          background-color 0.15s ease,
          transform 0.1s ease;
      }

      .state-view__action:active {
        transform: scale(0.97);
      }

      /* Error variant: subtle outline button */
      .state-view__action--error {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3));
        color: var(--nxt1-color-text-primary, #ffffff);
        font-weight: 500;
      }

      .state-view__action--error:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
      }

      /* Empty / Not-found variant: primary CTA button */
      .state-view__action--empty,
      .state-view__action--not-found {
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #000000);
      }

      .state-view__action--empty:hover,
      .state-view__action--not-found:hover {
        background: var(--nxt1-color-primaryDark, #a3cc00);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtStateViewComponent {
  /** Visual variant that determines icon background and button style */
  readonly variant = input<'error' | 'empty' | 'not-found'>('error');

  /** Icon name from the icon registry. Defaults based on variant if not set. */
  readonly icon = input<string | null>(null);

  /** Primary heading text */
  readonly title = input.required<string>();

  /** Secondary description text */
  readonly message = input<string | null>(null);

  /** Action button label. If not set, no button is shown. */
  readonly actionLabel = input<string | null>(null);

  /** Optional icon inside the action button */
  readonly actionIcon = input<string | null>(null);

  /** Emitted when the action button is clicked */
  readonly action = output<void>();

  /** Resolves the icon: explicit input > variant default */
  protected readonly resolvedIcon = () => {
    const explicit = this.icon();
    if (explicit) return explicit;
    switch (this.variant()) {
      case 'error':
        return 'alertCircle';
      case 'empty':
        return 'notifications';
      case 'not-found':
        return 'search';
    }
  };
}
