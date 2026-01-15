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

  @HostListener('click')
  @HostListener('touchstart')
  onInteraction(): void {
    if (this.nxtHapticDisabled || this.feedbackType === null) {
      return;
    }

    this.triggerFeedback();
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
