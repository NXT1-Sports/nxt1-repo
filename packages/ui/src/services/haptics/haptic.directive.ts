/**
 * @fileoverview HapticButtonDirective - Automatic haptic feedback for buttons
 * @module @nxt1/ui/directives
 *
 * Adds native haptic feedback to any element on tap/click.
 * Works on both web (no-op) and native platforms.
 *
 * Usage:
 * ```html
 * <!-- Light haptic (default) -->
 * <button nxtHaptic>Tap me</button>
 *
 * <!-- Medium haptic -->
 * <button nxtHaptic="medium">Submit</button>
 *
 * <!-- Heavy haptic for destructive actions -->
 * <button nxtHaptic="heavy" (click)="delete()">Delete</button>
 *
 * <!-- Success notification haptic -->
 * <ion-button nxtHaptic="success">Complete</ion-button>
 *
 * <!-- Disabled haptic -->
 * <button [nxtHaptic]="null">No feedback</button>
 * ```
 */

import { Directive, HostListener, Input, inject, booleanAttribute } from '@angular/core';
import { HapticsService, type HapticImpact, type HapticNotification } from './haptics.service';

/** Valid haptic feedback types */
export type HapticFeedbackType = HapticImpact | HapticNotification | 'selection' | null;

@Directive({
  selector: '[nxtHaptic]',
  standalone: true,
})
export class HapticButtonDirective {
  private readonly haptics = inject(HapticsService);
  private lastTouchStartAt = 0;
  private readonly clickAfterTouchIgnoreMs = 700;
  private static readonly FORM_CONTROL_SELECTOR =
    'input, textarea, select, ion-input, ion-textarea, ion-select, [contenteditable="true"]';

  /**
   * The type of haptic feedback to trigger
   *
   * Impact types: 'light' | 'medium' | 'heavy'
   * Notification types: 'success' | 'warning' | 'error'
   * Selection: 'selection' (for toggles, pickers)
   * Disabled: null
   *
   * @default 'light'
   */
  @Input('nxtHaptic') feedbackType: HapticFeedbackType = 'light';

  /**
   * Disable haptic feedback entirely
   */
  @Input({ transform: booleanAttribute }) nxtHapticDisabled = false;

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: Event): void {
    this.lastTouchStartAt = Date.now();
    this.onInteraction(event);
  }

  @HostListener('click', ['$event'])
  onClick(event: Event): void {
    if (Date.now() - this.lastTouchStartAt < this.clickAfterTouchIgnoreMs) {
      return;
    }

    this.onInteraction(event);
  }

  private onInteraction(event: Event): void {
    if (this.nxtHapticDisabled || this.feedbackType === null) {
      return;
    }

    // Do not fire button haptics when the interaction originates from nested
    // text-entry controls (e.g., input inside a selectable card).
    if (this.isFormControlInteraction(event)) {
      return;
    }

    this.triggerFeedback();
  }

  private isFormControlInteraction(event: Event): boolean {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];

    for (const node of path) {
      if (node instanceof Element && node.matches(HapticButtonDirective.FORM_CONTROL_SELECTOR)) {
        return true;
      }
    }

    const target = event.target;
    return target instanceof Element && target.matches(HapticButtonDirective.FORM_CONTROL_SELECTOR);
  }

  private triggerFeedback(): void {
    const type = this.feedbackType || 'light';

    switch (type) {
      // Impact types
      case 'light':
      case 'medium':
      case 'heavy':
        this.haptics.impact(type);
        break;

      // Notification types
      case 'success':
      case 'warning':
      case 'error':
        this.haptics.notification(type);
        break;

      // Selection feedback
      case 'selection':
        this.haptics.selection();
        break;
    }
  }
}

/**
 * @fileoverview HapticSelectionDirective - Selection change haptic
 *
 * Triggers selection haptic when value changes.
 * Perfect for toggles, radio buttons, checkboxes.
 *
 * Usage:
 * ```html
 * <ion-toggle nxtHapticSelect [(ngModel)]="enabled"></ion-toggle>
 * <ion-checkbox nxtHapticSelect [(ngModel)]="checked"></ion-checkbox>
 * ```
 */
@Directive({
  selector: '[nxtHapticSelect]',
  standalone: true,
})
export class HapticSelectionDirective {
  private readonly haptics = inject(HapticsService);

  @HostListener('ionChange')
  @HostListener('change')
  onValueChange(): void {
    this.haptics.selection();
  }
}
