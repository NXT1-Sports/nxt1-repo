/**
 * @fileoverview Usage Help Content — "How it Works" Information Sheet
 * @module @nxt1/ui/usage
 * @version 1.0.0
 *
 * Professional "How it Works" content explaining billing, usage, and payments.
 * Designed for both modal (desktop) and bottom sheet (mobile) display.
 *
 * Structure follows 2026 best practices:
 * - Clear section hierarchy
 * - Visual icons for quick scanning
 * - Expandable FAQ sections
 * - Contact CTA at bottom
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  helpCircleOutline,
  cashOutline,
  calendarOutline,
  cardOutline,
  trendingUpOutline,
  alertCircleOutline,
  checkmarkCircleOutline,
  chevronDownOutline,
  chevronUpOutline,
  mailOutline,
  closeOutline,
} from 'ionicons/icons';

addIcons({
  helpCircleOutline,
  cashOutline,
  calendarOutline,
  cardOutline,
  trendingUpOutline,
  alertCircleOutline,
  checkmarkCircleOutline,
  chevronDownOutline,
  chevronUpOutline,
  mailOutline,
  closeOutline,
});

interface HelpSection {
  readonly id: string;
  readonly icon: string;
  readonly title: string;
  readonly content: string;
}

interface FaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

@Component({
  selector: 'nxt1-usage-help-content',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div class="help-scroll-content">
      <div class="help-content">
        <!-- Header -->
        <header class="help-header">
          <h2 class="help-title">How Billing Works</h2>
          <p class="help-subtitle">
            Everything you need to know about your billing, usage tracking, and payments.
          </p>
        </header>

        <!-- Main Sections -->
        <div class="help-sections">
          @for (section of helpSections; track section.id) {
            <article class="help-section">
              <div class="section-icon">
                <ion-icon [name]="section.icon"></ion-icon>
              </div>
              <div class="section-content">
                <h3 class="section-title">{{ section.title }}</h3>
                <p class="section-text">{{ section.content }}</p>
              </div>
            </article>
          }
        </div>

        <!-- Key Points -->
        <div class="key-points">
          <h3 class="key-points-title">Key Points</h3>
          <ul class="key-points-list">
            <li class="key-point">
              <ion-icon name="checkmark-circle-outline" class="key-point-icon"></ion-icon>
              <span>Usage is tracked in real-time and updated hourly</span>
            </li>
            <li class="key-point">
              <ion-icon name="checkmark-circle-outline" class="key-point-icon"></ion-icon>
              <span>Your included usage resets at the start of each billing cycle</span>
            </li>
            <li class="key-point">
              <ion-icon name="checkmark-circle-outline" class="key-point-icon"></ion-icon>
              <span>Set spending limits to avoid unexpected charges</span>
            </li>
            <li class="key-point">
              <ion-icon name="checkmark-circle-outline" class="key-point-icon"></ion-icon>
              <span>Download detailed invoices for your records</span>
            </li>
          </ul>
        </div>

        <!-- FAQ Section -->
        <div class="faq-section">
          <h3 class="faq-title">Frequently Asked Questions</h3>
          <div class="faq-list">
            @for (faq of faqItems; track faq.id) {
              <div class="faq-item" [class.faq-item--expanded]="expandedFaq() === faq.id">
                <button type="button" class="faq-question" (click)="toggleFaq(faq.id)">
                  <span>{{ faq.question }}</span>
                  <ion-icon
                    [name]="
                      expandedFaq() === faq.id ? 'chevron-up-outline' : 'chevron-down-outline'
                    "
                  ></ion-icon>
                </button>
                @if (expandedFaq() === faq.id) {
                  <div class="faq-answer">
                    <p>{{ faq.answer }}</p>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <!-- Contact CTA -->
        <footer class="help-footer">
          <div class="footer-content">
            <ion-icon name="mail-outline" class="footer-icon"></ion-icon>
            <div class="footer-text">
              <p class="footer-title">Still have questions?</p>
              <p class="footer-subtitle">Our support team is here to help 24/7.</p>
            </div>
          </div>
          <button type="button" class="contact-btn" (click)="contactSupport.emit()">
            Contact Support
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
      }

      .help-scroll-content {
        height: 100%;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        background: var(--nxt1-color-surface-200);
      }

      .help-content {
        padding: var(--nxt1-spacing-5);
        padding-bottom: calc(var(--nxt1-spacing-10) + env(safe-area-inset-bottom, 0));
        max-width: 600px;
        margin: 0 auto;
      }

      /* ── HEADER ─────────────── */

      .help-header {
        text-align: center;
        margin-bottom: var(--nxt1-spacing-6);
        padding-top: var(--nxt1-spacing-8);
      }

      .help-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2) 0;
      }

      .help-subtitle {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ── MAIN SECTIONS ─────────────── */

      .help-sections {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        margin-bottom: var(--nxt1-spacing-6);
      }

      .help-section {
        display: flex;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      .section-icon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-md, 8px);

        ion-icon {
          font-size: var(--nxt1-icon-size-lg, 24px);
          color: var(--nxt1-color-primary);
        }
      }

      .section-content {
        flex: 1;
        min-width: 0;
      }

      .section-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-1) 0;
      }

      .section-text {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── KEY POINTS ─────────────── */

      .key-points {
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-alpha-primary5);
        border-radius: var(--nxt1-radius-lg, 12px);
        margin-bottom: var(--nxt1-spacing-6);
      }

      .key-points-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-primary);
        margin: 0 0 var(--nxt1-spacing-3) 0;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .key-points-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .key-point {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-2);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .key-point-icon {
        flex-shrink: 0;
        font-size: var(--nxt1-icon-size-sm, 16px);
        color: var(--nxt1-color-success);
        margin-top: var(--nxt1-spacing-0-5);
      }

      /* ── FAQ SECTION ─────────────── */

      .faq-section {
        margin-bottom: var(--nxt1-spacing-6);
      }

      .faq-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-4) 0;
      }

      .faq-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .faq-item {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow: hidden;
        transition: border-color var(--nxt1-transition-fast);
      }

      .faq-item--expanded {
        border-color: var(--nxt1-color-border-default);
      }

      .faq-question {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: var(--nxt1-spacing-4);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
        background: none;
        border: none;
        text-align: left;
        cursor: pointer;
        transition: background var(--nxt1-transition-fast);

        &:hover {
          background: var(--nxt1-color-surface-200);
        }

        ion-icon {
          flex-shrink: 0;
          font-size: var(--nxt1-icon-size-sm, 16px);
          color: var(--nxt1-color-text-tertiary);
        }
      }

      .faq-answer {
        padding: 0 var(--nxt1-spacing-4) var(--nxt1-spacing-4);
        animation: fadeInDown var(--nxt1-duration-fast) var(--nxt1-easing-out);

        p {
          margin: 0;
          font-size: var(--nxt1-fontSize-sm);
          color: var(--nxt1-color-text-secondary);
          line-height: var(--nxt1-lineHeight-relaxed);
        }
      }

      @keyframes fadeInDown {
        from {
          opacity: 0;
          transform: translateY(calc(-1 * var(--nxt1-spacing-2)));
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ── FOOTER / CTA ─────────────── */

      .help-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      .footer-content {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .footer-icon {
        font-size: var(--nxt1-icon-size-lg, 24px);
        color: var(--nxt1-color-text-secondary);
      }

      .footer-text {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0-5);
      }

      .footer-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .footer-subtitle {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        margin: 0;
      }

      .contact-btn {
        flex-shrink: 0;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-onPrimary);
        background: var(--nxt1-color-primary);
        border: none;
        border-radius: var(--nxt1-radius-md, 8px);
        cursor: pointer;
        transition: opacity var(--nxt1-transition-fast);

        &:hover {
          opacity: 0.9;
        }
      }

      /* ── RESPONSIVE ─────────────── */

      @media (max-width: 480px) {
        .help-content {
          padding: var(--nxt1-spacing-4);
        }

        .help-section {
          flex-direction: column;
          gap: var(--nxt1-spacing-3);
        }

        .help-footer {
          flex-direction: column;
          text-align: center;
        }

        .footer-content {
          flex-direction: column;
        }

        .contact-btn {
          width: 100%;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageHelpContentComponent {
  /** Emitted when contact support is clicked */
  readonly contactSupport = output<void>();

  /** Currently expanded FAQ item */
  protected readonly expandedFaq = signal<string | null>(null);

  /** Main help sections */
  protected readonly helpSections: readonly HelpSection[] = [
    {
      id: 'billing-cycle',
      icon: 'calendar-outline',
      title: 'Billing Cycle',
      content:
        'Your billing cycle runs monthly from the date you subscribed. At the start of each cycle, your included usage resets and any overage from the previous month is charged to your payment method.',
    },
    {
      id: 'metered-usage',
      icon: 'trending-up-outline',
      title: 'Metered Usage',
      content:
        'Metered usage tracks your consumption of AI features, video analysis, and other premium services. Usage is measured in units specific to each product and updated in real-time.',
    },
    {
      id: 'included-usage',
      icon: 'checkmark-circle-outline',
      title: 'Included Usage',
      content:
        'Your subscription includes a certain amount of usage each month at no extra cost. The included amount depends on your plan tier. Any usage beyond this is billed as overage.',
    },
    {
      id: 'payments',
      icon: 'card-outline',
      title: 'Payments & Invoices',
      content:
        'Payments are processed automatically at the end of each billing cycle. You can view and download detailed invoices for every transaction from your payment history.',
    },
    {
      id: 'budgets',
      icon: 'alert-circle-outline',
      title: 'Budgets & Alerts',
      content:
        "Set spending limits to control costs. You'll receive email alerts when approaching your budget threshold, and optionally pause usage when the limit is reached.",
    },
  ];

  /** FAQ items */
  protected readonly faqItems: readonly FaqItem[] = [
    {
      id: 'when-charged',
      question: 'When am I charged for usage?',
      answer:
        'You are charged at the end of each billing cycle for any usage that exceeds your included amount. The charge appears on your statement within 1-3 business days after the cycle ends.',
    },
    {
      id: 'cancel-subscription',
      question: 'What happens if I cancel my subscription?',
      answer:
        "If you cancel, you'll retain access until the end of your current billing period. Any unused included usage does not roll over or get refunded. Metered usage is billed through the cancellation date.",
    },
    {
      id: 'change-plan',
      question: 'Can I change my plan mid-cycle?',
      answer:
        "Yes! When you upgrade, you'll be charged a prorated amount for the remainder of the cycle and receive additional included usage immediately. Downgrades take effect at the start of your next cycle.",
    },
    {
      id: 'usage-discounts',
      question: 'How do usage discounts work?',
      answer:
        'Discounts are applied automatically based on your plan tier and any active promotions. Higher tiers receive better per-unit pricing. Discounts are shown in your usage breakdown as "Included usage discounts."',
    },
    {
      id: 'refunds',
      question: 'Can I get a refund for unused usage?',
      answer:
        "Included usage does not roll over and is not refundable. However, if you believe there's an error in your billing, please contact support within 30 days of the charge for review.",
    },
  ];

  /** Toggle FAQ expansion */
  protected toggleFaq(id: string): void {
    this.expandedFaq.update((current) => (current === id ? null : id));
  }
}
