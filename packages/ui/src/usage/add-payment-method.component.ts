/**
 * @fileoverview Add Payment Method Component — Stripe Elements
 * @module @nxt1/ui/usage
 * @version 1.0.0
 *
 * Opens as a bottom sheet for Org/Team users to add a credit/debit card
 * via Stripe's PaymentElement (SetupIntent flow).
 *
 * Flow:
 *  1. Component init → calls `POST /usage/payment-methods/setup-intent` → gets `clientSecret`
 *  2. Loads Stripe.js → creates Elements instance with PaymentElement
 *  3. User fills card → submits
 *  4. `stripe.confirmSetup()` → Stripe handles 3DS if needed
 *  5. On success → dismiss sheet with role='saved' → shell shows success toast
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE (Capacitor WebView) ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ElementRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtSheetFooterComponent } from '../components/bottom-sheet/sheet-footer.component';
import { NxtToastService } from '../services/toast/toast.service';
import { UsageApiService } from './usage-api.service';
import { STRIPE_PUBLISHABLE_KEY } from './stripe-config';

@Component({
  selector: 'nxt1-add-payment-method',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NxtSheetHeaderComponent, NxtSheetFooterComponent],
  template: `
    <nxt1-sheet-header
      title="Add Payment Method"
      subtitle="Your card is securely processed by Stripe."
    />

    <div class="add-pm-body">
      @if (loadError()) {
        <div class="add-pm-error">
          <p>{{ loadError() }}</p>
          <button type="button" class="add-pm-retry-btn" (click)="init()">Try Again</button>
        </div>
      } @else if (!ready()) {
        <div class="add-pm-skeleton">
          <div class="add-pm-skeleton__row"></div>
          <div class="add-pm-skeleton__row add-pm-skeleton__row--short"></div>
        </div>
      }

      <!-- Stripe PaymentElement mounts here -->
      <div
        #stripeMount
        class="add-pm-stripe-element"
        [class.add-pm-stripe-element--hidden]="!ready()"
        aria-label="Card details"
      ></div>
    </div>

    <nxt1-sheet-footer
      label="Save Card"
      icon="lock-closed"
      [loading]="saving()"
      loadingLabel="Saving…"
      [disabled]="!ready() || !!loadError()"
      (action)="onSubmit()"
    />
  `,
  styles: [
    `
      .add-pm-body {
        padding: 16px 20px 8px;
        min-height: 160px;
      }

      .add-pm-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 24px 0;
        color: var(--nxt1-color-danger, #ef4444);
        font-size: 14px;
        text-align: center;
      }

      .add-pm-retry-btn {
        padding: 8px 20px;
        border-radius: 8px;
        background: var(--nxt1-color-primary, #6366f1);
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        border: none;
        cursor: pointer;
      }

      .add-pm-skeleton {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .add-pm-skeleton__row {
        height: 40px;
        border-radius: 8px;
        background: var(--nxt1-color-surface-elevated, #1e1e2e);
        animation: skeleton-pulse 1.5s ease-in-out infinite;
      }

      .add-pm-skeleton__row--short {
        width: 60%;
      }

      @keyframes skeleton-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }

      .add-pm-stripe-element {
        min-height: 120px;
      }

      .add-pm-stripe-element--hidden {
        visibility: hidden;
        height: 0;
        overflow: hidden;
      }
    `,
  ],
})
export class AddPaymentMethodComponent implements OnInit, OnDestroy {
  private readonly modalCtrl = inject(ModalController);
  private readonly usageApi = inject(UsageApiService);
  private readonly toast = inject(NxtToastService);
  private readonly publishableKey = inject(STRIPE_PUBLISHABLE_KEY);

  protected readonly ready = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;

  private readonly stripeMount = viewChild<ElementRef<HTMLDivElement>>('stripeMount');

  async ngOnInit(): Promise<void> {
    await this.init();
  }

  ngOnDestroy(): void {
    // No cleanup needed — Stripe elements are destroyed with the component
  }

  /** Initialise Stripe and mount the PaymentElement. */
  async init(): Promise<void> {
    this.ready.set(false);
    this.loadError.set(null);

    try {
      // Get SetupIntent clientSecret from backend
      const { clientSecret } = await this.usageApi.getSetupIntent();

      // Load Stripe.js (cached after first call)
      this.stripe = await loadStripe(this.publishableKey);
      if (!this.stripe) {
        throw new Error('Stripe.js failed to load');
      }

      // Create Elements instance scoped to this SetupIntent
      this.elements = this.stripe.elements({
        clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#6366f1',
            colorBackground: '#1e1e2e',
            colorText: '#e2e8f0',
            borderRadius: '8px',
          },
        },
      });

      // Mount the PaymentElement to the DOM ref
      const mountEl = this.stripeMount()?.nativeElement;
      if (!mountEl) {
        throw new Error('Mount element not found');
      }

      const paymentElement = this.elements.create('payment');
      paymentElement.mount(mountEl);

      // Listen for ready event to show the element
      paymentElement.on('ready', () => {
        this.ready.set(true);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load payment form';
      this.loadError.set(msg);
    }
  }

  /** Submit the form — confirms the SetupIntent with Stripe. */
  async onSubmit(): Promise<void> {
    if (!this.stripe || !this.elements || this.saving()) return;

    this.saving.set(true);

    try {
      const { error } = await this.stripe.confirmSetup({
        elements: this.elements,
        confirmParams: {
          // Return URL required by Stripe — we use the current page.
          // The webhook handles the SetupIntent success event on the backend.
          return_url: window.location.href,
        },
        // Prevent redirect when not required (e.g., no 3DS)
        redirect: 'if_required',
      });

      if (error) {
        await this.toast.show({
          message: error.message ?? 'Failed to save card. Please try again.',
          type: 'error',
          duration: 4000,
        });
        return;
      }

      // Success — dismiss sheet and notify parent
      await this.toast.show({
        message: 'Payment method saved successfully.',
        type: 'success',
        duration: 3000,
      });

      await this.modalCtrl.dismiss(null, 'saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      await this.toast.show({ message: msg, type: 'error', duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }
}
