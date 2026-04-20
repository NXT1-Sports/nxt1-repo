/**
 * @fileoverview Usage Help Content — Agent X Billing Guide (Role-Aware)
 * @module @nxt1/ui/usage
 * @version 3.0.0
 *
 * Full-screen "How Billing Works" sheet explaining billing with real
 * Agent X operation examples and pricing. Adapts content based on
 * billing entity type:
 *
 * - **Individual (B2C)**: Prepaid wallet — buy credits, wallet holds, instant settlement
 * - **Organization/Team (B2B)**: Postpaid metered — tracked monthly, invoiced via Stripe
 *
 * The `isPersonal` input is passed via `componentProps` from the usage shell,
 * driven by `BillingContextSummary.billingEntity` from the backend.
 *
 * Content is intentionally DIFFERENT from the top-level dashboard
 * sections (overview, metered usage, breakdown, etc.).
 *
 * Designed for NxtBottomSheetService.openSheet() with FULL preset.
 * Uses nxt1-sheet-header for consistent close/title pattern.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, signal, computed, inject, input } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtIconComponent } from '../components/icon';

interface PricingExample {
  readonly id: string;
  readonly icon: string;
  readonly action: string;
  readonly description: string;
  readonly costRange: string;
  readonly category: string;
}

interface HelpStep {
  readonly title: string;
  readonly desc: string;
}

interface HelpFact {
  readonly text: string;
}

interface Scenario {
  readonly quote: string;
  readonly lines: readonly { readonly label: string; readonly amount: string }[];
  readonly totalLabel: string;
  readonly totalAmount: string;
}

interface FaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

@Component({
  selector: 'nxt1-usage-help-content',
  standalone: true,
  imports: [NxtSheetHeaderComponent, NxtIconComponent],
  template: `
    <div class="help-sheet">
      <nxt1-sheet-header
        title="How Billing Works"
        closePosition="left"
        [centerTitle]="true"
        [showBorder]="true"
        (closeSheet)="dismiss()"
      />

      <div class="help-scroll">
        <div class="help-body">
          <!-- Intro -->
          <section class="intro-section">
            <div class="intro-icon-row">
              <div class="intro-icon">
                <nxt1-icon [name]="introIcon()" size="28" />
              </div>
            </div>
            <h3 class="intro-title">{{ introTitle() }}</h3>
            <p class="intro-text">{{ introText() }}</p>
          </section>

          <!-- How It Works Steps -->
          <section class="steps-section">
            <h4 class="section-label">How It Works</h4>
            <div class="steps">
              @for (step of steps(); track $index) {
                <div class="step">
                  <div class="step-number">{{ $index + 1 }}</div>
                  <div class="step-content">
                    <span class="step-title">{{ step.title }}</span>
                    <span class="step-desc">{{ step.desc }}</span>
                  </div>
                </div>
              }
            </div>
          </section>

          <!-- Pricing Examples (shared across roles) -->
          <section class="pricing-section">
            <h4 class="section-label">What Things Cost</h4>
            <p class="pricing-note">{{ pricingNote() }}</p>
            <div class="pricing-grid">
              @for (example of pricingExamples; track example.id) {
                <div class="pricing-card">
                  <div class="pricing-card-header">
                    <div class="pricing-icon">
                      <nxt1-icon [name]="example.icon" size="20" />
                    </div>
                    <span class="pricing-cost">{{ example.costRange }}</span>
                  </div>
                  <span class="pricing-action">{{ example.action }}</span>
                  <span class="pricing-desc">{{ example.description }}</span>
                  <span class="pricing-category">{{ example.category }}</span>
                </div>
              }
            </div>
          </section>

          <!-- Real-World Scenarios -->
          <section class="scenarios-section">
            <h4 class="section-label">Real-World Examples</h4>
            <div class="scenario-list">
              @for (scenario of scenarios(); track $index) {
                <div class="scenario">
                  <div class="scenario-quote">{{ scenario.quote }}</div>
                  <div class="scenario-breakdown">
                    @for (line of scenario.lines; track $index) {
                      <div class="scenario-line">
                        <span>{{ line.label }}</span>
                        <span class="scenario-amount">{{ line.amount }}</span>
                      </div>
                    }
                    <div class="scenario-total">
                      <span>{{ scenario.totalLabel }}</span>
                      <span class="scenario-amount scenario-amount--total">{{
                        scenario.totalAmount
                      }}</span>
                    </div>
                  </div>
                </div>
              }
            </div>
          </section>

          <!-- Key Facts -->
          <section class="facts-section">
            <h4 class="section-label">Good to Know</h4>
            <ul class="facts-list">
              @for (fact of facts(); track $index) {
                <li class="fact">
                  <nxt1-icon name="checkmark-circle-outline" className="fact-icon" size="16" />
                  <span>{{ fact.text }}</span>
                </li>
              }
            </ul>
          </section>

          <!-- FAQ Section -->
          <section class="faq-section">
            <h4 class="section-label">Questions</h4>
            <div class="faq-list">
              @for (faq of faqItems(); track faq.id) {
                <div class="faq-item" [class.faq-item--expanded]="expandedFaq() === faq.id">
                  <button type="button" class="faq-question" (click)="toggleFaq(faq.id)">
                    <span>{{ faq.question }}</span>
                    <nxt1-icon
                      [name]="expandedFaq() === faq.id ? 'chevronUp' : 'chevronDown'"
                      size="16"
                    />
                  </button>
                  @if (expandedFaq() === faq.id) {
                    <div class="faq-answer">
                      <p>{{ faq.answer }}</p>
                    </div>
                  }
                </div>
              }
            </div>
          </section>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .help-sheet {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      .help-scroll {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }

      .help-body {
        padding: var(--nxt1-spacing-5);
        padding-bottom: calc(var(--nxt1-spacing-16) + env(safe-area-inset-bottom, 0));
        max-width: 600px;
        margin: 0 auto;
      }

      /* ── SECTION LABEL ─────────────── */

      .section-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-primary);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin: 0 0 var(--nxt1-spacing-3) 0;
      }

      /* ── INTRO ─────────────── */

      .intro-section {
        text-align: center;
        margin-bottom: var(--nxt1-spacing-8);
        padding-top: var(--nxt1-spacing-2);
      }

      .intro-icon-row {
        display: flex;
        justify-content: center;
        margin-bottom: var(--nxt1-spacing-3);
      }

      .intro-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: var(--nxt1-radius-xl, 16px);
        background: var(--nxt1-color-alpha-primary10, rgba(163, 230, 53, 0.1));
        color: var(--nxt1-color-primary);
      }

      .intro-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2) 0;
      }

      .intro-text {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── STEPS ─────────────── */

      .steps-section {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .steps {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .step {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3-5);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      .step-number {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: var(--nxt1-radius-full);
        background: var(--nxt1-color-alpha-primary10, rgba(163, 230, 53, 0.1));
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
      }

      .step-content {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0-5);
        min-width: 0;
      }

      .step-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .step-desc {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── PRICING GRID ─────────────── */

      .pricing-section {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .pricing-note {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        margin: 0 0 var(--nxt1-spacing-3) 0;
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .pricing-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-2-5);
      }

      .pricing-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      .pricing-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-1);
      }

      .pricing-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-radius-md, 8px);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-primary);
      }

      .pricing-cost {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
      }

      .pricing-action {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .pricing-desc {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .pricing-category {
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-top: var(--nxt1-spacing-0-5);
      }

      /* ── SCENARIOS ─────────────── */

      .scenarios-section {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .scenario-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .scenario {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow: hidden;
      }

      .scenario-quote {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        font-size: var(--nxt1-fontSize-sm);
        font-style: italic;
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-alpha-primary5, rgba(163, 230, 53, 0.05));
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .scenario-breakdown {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .scenario-line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
      }

      .scenario-total {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-primary);
        padding-top: var(--nxt1-spacing-2);
        border-top: 1px solid var(--nxt1-color-border-subtle);
      }

      .scenario-amount {
        font-family: var(--nxt1-fontFamily-brand);
        font-weight: var(--nxt1-fontWeight-medium);
        white-space: nowrap;
      }

      .scenario-amount--total {
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
      }

      /* ── KEY FACTS ─────────────── */

      .facts-section {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .facts-list {
        list-style: none;
        margin: 0;
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-alpha-primary5, rgba(163, 230, 53, 0.05));
        border-radius: var(--nxt1-radius-lg, 12px);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2-5);
      }

      .fact {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-2);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .fact-icon {
        flex-shrink: 0;
        color: var(--nxt1-color-success);
        margin-top: var(--nxt1-spacing-0-5);
      }

      /* ── FAQ ─────────────── */

      .faq-section {
        margin-bottom: var(--nxt1-spacing-6);
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
        padding: var(--nxt1-spacing-3-5);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
        background: none;
        border: none;
        text-align: left;
        cursor: pointer;
        transition: background var(--nxt1-transition-fast);
        gap: var(--nxt1-spacing-2);

        &:hover {
          background: var(--nxt1-color-surface-200);
        }
      }

      .faq-question nxt1-icon {
        flex-shrink: 0;
        color: var(--nxt1-color-text-tertiary);
      }

      .faq-answer {
        padding: 0 var(--nxt1-spacing-3-5) var(--nxt1-spacing-3-5);
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

      /* ── RESPONSIVE ─────────────── */

      @media (max-width: 400px) {
        .pricing-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageHelpContentComponent {
  private readonly modalCtrl = inject(ModalController);

  // ============================================
  // INPUTS (passed via componentProps from shell)
  // ============================================

  /**
   * Whether the user is on a personal/individual billing entity (B2C wallet).
   * When false, shows organization/team postpaid metered billing content (B2B).
   * Driven by BillingContextSummary.billingEntity from the backend.
   * Defaults to true (wallet) since athletes are the most common user type.
   */
  readonly isPersonal = input<boolean>(true);

  /** Currently expanded FAQ item */
  protected readonly expandedFaq = signal<string | null>(null);

  // ============================================
  // ROLE-AWARE COMPUTED CONTENT
  // ============================================

  protected readonly introIcon = computed(() =>
    this.isPersonal() ? 'wallet-outline' : 'business-outline'
  );

  protected readonly introTitle = computed(() =>
    this.isPersonal() ? 'Credits Power Everything' : 'Metered Billing for Your Team'
  );

  protected readonly introText = computed(() =>
    this.isPersonal()
      ? "Every action Agent X performs — from generating highlight reels to drafting recruiting emails — costs credits. You load credits into your wallet up front and they're deducted as you go. No surprises, no hidden fees."
      : "Your team's Agent X usage is tracked throughout the month and invoiced at the end of each billing cycle. Every operation — from generating graphics for athletes to running scout reports — is metered, itemized, and billed to your organization automatically."
  );

  protected readonly pricingNote = computed(() =>
    this.isPersonal()
      ? "Prices below are estimates. AI-powered tasks may vary based on complexity. You'll always see the hold amount before confirming."
      : 'Prices below are estimates per operation. AI-powered tasks may vary based on complexity. All charges appear in your monthly invoice with a per-member breakdown.'
  );

  /** How-it-works steps — wallet flow vs postpaid flow */
  protected readonly steps = computed((): readonly HelpStep[] =>
    this.isPersonal()
      ? [
          {
            title: 'Add credits to your wallet',
            desc: 'Purchase a credit pack through the app. Credits never expire.',
          },
          {
            title: 'Ask Agent X to do something',
            desc: 'Request a highlight reel, graphic, scout report, email campaign — anything.',
          },
          {
            title: 'Credits are held, then settled',
            desc: 'We reserve an estimated amount. When the task finishes, the actual cost is charged and any excess is returned to your wallet.',
          },
        ]
      : [
          {
            title: 'Your team uses Agent X',
            desc: 'Coaches, athletes, and staff run operations — graphics, scout reports, recruiting outreach, highlight reels.',
          },
          {
            title: 'Usage is tracked per member',
            desc: 'Every operation is logged with the member who ran it, the cost, and the category. You can see a live breakdown anytime.',
          },
        ]
  );

  /** Real-world command examples — athlete scenarios vs coach/director scenarios */
  protected readonly scenarios = computed((): readonly Scenario[] =>
    this.isPersonal()
      ? [
          {
            quote: '"Create a highlight reel from my last 3 games"',
            lines: [{ label: 'Highlight reel generation', amount: '~$5.00' }],
            totalLabel: 'Wallet deducted',
            totalAmount: '~$5.00',
          },
          {
            quote: '"Send my highlights and stats to every D2 school in Ohio"',
            lines: [
              { label: 'College matching', amount: '~$1.00' },
              { label: 'Recruiting strategy', amount: '~$1.00' },
              { label: 'Email campaign (24 coaches)', amount: '~$2.00' },
            ],
            totalLabel: 'Wallet deducted',
            totalAmount: '~$4.00',
          },
          {
            quote: '"Design me a new profile banner and logo"',
            lines: [
              { label: 'Profile banner generation', amount: '~$1.00' },
              { label: 'Logo generation', amount: '~$1.00' },
            ],
            totalLabel: 'Wallet deducted',
            totalAmount: '~$2.00',
          },
        ]
      : [
          {
            quote: '"Generate scout reports for my entire starting roster"',
            lines: [{ label: 'Scout report bundle (11 athletes)', amount: '~$33.00' }],
            totalLabel: 'Added to monthly invoice',
            totalAmount: '~$33.00',
          },
          {
            quote: '"Create recruiting graphics for all our seniors"',
            lines: [
              { label: 'Recruiting graphics (8 athletes)', amount: '~$16.00' },
              { label: 'Motion graphics (8 athletes)', amount: '~$24.00' },
            ],
            totalLabel: 'Added to monthly invoice',
            totalAmount: '~$40.00',
          },
          {
            quote: '"Run a college matching campaign for my top 5 prospects"',
            lines: [
              { label: 'College matching (5 athletes)', amount: '~$5.00' },
              { label: 'Recruiting strategy (5 athletes)', amount: '~$5.00' },
              { label: 'Email campaigns (5 athletes)', amount: '~$10.00' },
            ],
            totalLabel: 'Added to monthly invoice',
            totalAmount: '~$20.00',
          },
        ]
  );

  /** Key facts — wallet-specific vs org-specific */
  protected readonly facts = computed((): readonly HelpFact[] =>
    this.isPersonal()
      ? [
          { text: "Credits never expire — use them whenever you're ready" },
          { text: "You'll see the estimated cost before every operation starts" },
          {
            text: 'If the actual cost is less than the hold, the difference is returned instantly',
          },
          { text: 'Set a spending budget to get alerts before reaching your limit' },
          { text: 'Every charge appears in your usage breakdown with a full receipt' },
        ]
      : [
          { text: 'No upfront payment needed — usage is invoiced at end of cycle' },
          { text: 'View a per-member breakdown to see who used what' },
          { text: 'Set team-wide or per-member budgets to control spending' },
          { text: 'Get email alerts when your team approaches the budget cap' },
          { text: 'Download detailed invoices and CSV exports for your records' },
          { text: 'Add or remove members anytime — billing adjusts automatically' },
        ]
  );

  /** FAQ — different questions for wallet users vs org admins */
  protected readonly faqItems = computed((): readonly FaqItem[] =>
    this.isPersonal()
      ? [
          {
            id: 'what-is-hold',
            question: 'What is a processing hold?',
            answer:
              'When Agent X starts an operation, we reserve credits from your wallet to cover the estimated cost. This is the "processing" amount you see on your dashboard. Once the task finishes, the actual cost is charged and any unused portion is returned to your wallet instantly.',
          },
          {
            id: 'why-vary',
            question: 'Why do AI costs vary?',
            answer:
              'Most Agent X operations use AI models under the hood. The actual cost depends on the complexity of your request — a simple graphic costs less than a detailed highlight reel with multiple clips. We always show you the estimated cost up front so there are no surprises.',
          },
          {
            id: 'credits-expire',
            question: 'Do my credits expire?',
            answer:
              'No. Credits you purchase remain in your wallet until you use them. There is no expiration date and no monthly reset on purchased credits.',
          },
          {
            id: 'failed-operation',
            question: 'What if an operation fails?',
            answer:
              "If Agent X can't complete a task, the full held amount is returned to your wallet. You're never charged for failed operations.",
          },
          {
            id: 'spending-limit',
            question: 'Can I set a spending limit?',
            answer:
              "Yes. Go to the Budgets section to set a monthly spending cap. You'll get an alert when you're approaching your limit, and you can optionally pause operations when the cap is reached.",
          },
          {
            id: 'refund',
            question: 'Can I get a refund on credits?',
            answer:
              "Purchased credits are non-refundable but they never expire, so you can use them anytime. If you believe there's an error in a charge, contact support within 30 days for review.",
          },
        ]
      : [
          {
            id: 'when-invoiced',
            question: 'When is my team invoiced?',
            answer:
              'Your organization is invoiced at the end of each billing cycle (monthly from your enrollment date). The invoice includes a full itemized breakdown of every operation run by each team member.',
          },
          {
            id: 'member-usage',
            question: 'Can I see usage per team member?',
            answer:
              'Yes. The Breakdown section on this page shows usage by member. You can also filter by category (media, recruiting, communication) and time period to understand exactly where costs are coming from.',
          },
          {
            id: 'budget-controls',
            question: 'How do team budgets work?',
            answer:
              "You can set a monthly budget cap for the entire organization and optionally set per-member limits. When the budget threshold is approached, you'll receive an email alert. You can also enable a hard stop that pauses all Agent X operations once the cap is reached.",
          },
          {
            id: 'add-remove-members',
            question: 'What happens when I add or remove members?',
            answer:
              'New members can start using Agent X immediately — their usage is added to the current billing cycle. When a member is removed, their historical usage remains on the invoice but no new charges accrue.',
          },
          {
            id: 'payment-method',
            question: 'How do I update our payment method?',
            answer:
              "Go to the Payment Info section to update your organization's card on file. You can also update your billing address and add a purchase order number for invoices.",
          },
          {
            id: 'failed-operation-org',
            question: 'Are we charged for failed operations?',
            answer:
              'No. If an Agent X operation fails or is cancelled before completion, no charge is recorded. Only successfully completed operations appear on your invoice.',
          },
        ]
  );

  /**
   * Agent X operation pricing examples (shared across both billing types).
   * Prices reflect unitPrice from USAGE_PRODUCT_CONFIGS (in cents → dollars).
   * Dynamic items show "~" since actual cost depends on AI token usage.
   */
  protected readonly pricingExamples: readonly PricingExample[] = [
    {
      id: 'highlights',
      icon: 'videocam-outline',
      action: 'Highlight Reels',
      description: 'AI-generated game highlights',
      costRange: '~$5.00',
      category: 'Media',
    },
    {
      id: 'motion-graphics',
      icon: 'film-outline',
      action: 'Motion Graphics',
      description: 'Animated stats and effects',
      costRange: '~$3.00',
      category: 'Media',
    },
    {
      id: 'graphics',
      icon: 'image-outline',
      action: 'Graphics',
      description: 'Recruitment cards and posters',
      costRange: '~$2.00',
      category: 'Media',
    },
    {
      id: 'scout-report',
      icon: 'clipboard-outline',
      action: 'Scout Reports',
      description: 'Full AI scouting analysis',
      costRange: '~$3.00',
      category: 'Recruiting',
    },
    {
      id: 'email-campaign',
      icon: 'mail-outline',
      action: 'Email Campaigns',
      description: 'Outreach to college coaches',
      costRange: '~$2.00',
      category: 'Communication',
    },
    {
      id: 'match-colleges',
      icon: 'school-outline',
      action: 'College Matching',
      description: 'AI-powered program fit',
      costRange: '~$1.00',
      category: 'Recruiting',
    },
    {
      id: 'recruit-strategy',
      icon: 'map-outline',
      action: 'Recruit Strategy',
      description: 'Personalized game plan',
      costRange: '~$1.00',
      category: 'Recruiting',
    },
    {
      id: 'profile-banners',
      icon: 'color-palette-outline',
      action: 'Banners & Logos',
      description: 'Custom profile branding',
      costRange: '~$1.00',
      category: 'Profile',
    },
  ];

  /** Toggle FAQ expansion */
  protected toggleFaq(id: string): void {
    this.expandedFaq.update((current) => (current === id ? null : id));
  }

  /** Dismiss the sheet */
  protected async dismiss(): Promise<void> {
    await this.modalCtrl.dismiss();
  }
}
