/**
 * @fileoverview Usage Help Content — Agent X Billing Guide
 * @module @nxt1/ui/usage
 * @version 4.0.0
 *
 * Shared billing help content for the Usage dashboard. The copy is driven by
 * the resolved billing context returned by the backend so the sheet explains
 * the current wallet, budget, and charge-routing model accurately on both web
 * and mobile.
 */

import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { type BillingStateSummary } from '@nxt1/core';
import { getUsageBillingHelpContent } from '@nxt1/core/help-center';
import { ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtIconComponent } from '../components/icon';

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
        (closeSheet)="closeHelp()"
      />

      <div class="help-scroll">
        <div class="help-body">
          <section class="content-section intro-section content-section--hero">
            <div class="intro-icon-row">
              <div class="intro-icon">
                <nxt1-icon [name]="introIcon()" size="28" />
              </div>
            </div>
            <h3 class="intro-title">{{ introTitle() }}</h3>
            <p class="intro-text">{{ introText() }}</p>
            @if (statusNote(); as note) {
              <div class="status-note">
                <nxt1-icon name="information-circle-outline" size="16" />
                <span>{{ note }}</span>
              </div>
            }
          </section>

          <section class="content-section summary-section">
            <div class="section-heading">
              <h4 class="section-label">Current Setup</h4>
              <div class="section-divider" aria-hidden="true"></div>
            </div>
            <div class="summary-grid">
              @for (card of summaryCards(); track card.label) {
                <article class="summary-card">
                  <span class="summary-label">{{ card.label }}</span>
                  <span class="summary-value">{{ card.value }}</span>
                  <p class="summary-detail">{{ card.detail }}</p>
                </article>
              }
            </div>
          </section>

          <section class="content-section steps-section">
            <div class="section-heading">
              <h4 class="section-label">How It Works</h4>
              <div class="section-divider" aria-hidden="true"></div>
            </div>
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

          <section class="content-section facts-section">
            <div class="section-heading">
              <h4 class="section-label">Good to Know</h4>
              <div class="section-divider" aria-hidden="true"></div>
            </div>
            <ul class="facts-list">
              @for (fact of facts(); track $index) {
                <li class="fact">
                  <nxt1-icon name="checkmark-circle-outline" className="fact-icon" size="16" />
                  <span>{{ fact.text }}</span>
                </li>
              }
            </ul>
          </section>

          <section class="content-section faq-section">
            <div class="section-heading">
              <h4 class="section-label">Questions</h4>
              <div class="section-divider" aria-hidden="true"></div>
            </div>
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
        position: relative;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-6);
        padding-bottom: calc(var(--nxt1-spacing-20) + env(safe-area-inset-bottom, 0));
        max-width: 720px;
        margin: 0 auto;
      }

      .content-section {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-radius-xl, 18px);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.025) 0%, rgba(255, 255, 255, 0.01) 100%),
          var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
      }

      .content-section--hero {
        padding: var(--nxt1-spacing-6);
        background:
          radial-gradient(
            circle at top center,
            rgba(163, 230, 53, 0.14) 0%,
            rgba(163, 230, 53, 0) 52%
          ),
          linear-gradient(180deg, rgba(255, 255, 255, 0.035) 0%, rgba(255, 255, 255, 0.015) 100%),
          var(--nxt1-color-surface-100);
      }

      .section-heading {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .section-divider {
        flex: 1;
        height: 1px;
        background: linear-gradient(
          90deg,
          rgba(163, 230, 53, 0.16) 0%,
          var(--nxt1-color-border-subtle) 42%,
          transparent 100%
        );
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
        padding-top: var(--nxt1-spacing-1);
      }

      .intro-icon-row {
        display: flex;
        justify-content: center;
        margin-bottom: var(--nxt1-spacing-4);
      }

      .intro-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        border-radius: 20px;
        background: linear-gradient(
          180deg,
          rgba(163, 230, 53, 0.18) 0%,
          rgba(163, 230, 53, 0.08) 100%
        );
        border: 1px solid rgba(163, 230, 53, 0.18);
        color: var(--nxt1-color-primary);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
      }

      .intro-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: clamp(1.625rem, 1.2rem + 0.9vw, 2rem);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-3) 0;
        letter-spacing: -0.02em;
      }

      .intro-text {
        max-width: 56ch;
        margin: 0 auto;
        font-size: var(--nxt1-fontSize-base);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .status-note {
        display: inline-flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-2);
        margin-top: var(--nxt1-spacing-5);
        max-width: 54ch;
        padding: var(--nxt1-spacing-3-5) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--nxt1-color-alpha-primary5, rgba(163, 230, 53, 0.05));
        border: 1px solid var(--nxt1-color-alpha-primary10, rgba(163, 230, 53, 0.12));
        text-align: left;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .status-note nxt1-icon {
        flex-shrink: 0;
        color: var(--nxt1-color-primary);
        margin-top: 1px;
      }

      .summary-section {
        gap: var(--nxt1-spacing-4-5);
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--nxt1-spacing-4);
      }

      .summary-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4-5);
        border-radius: 16px;
        background: linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.06) 0%,
          rgba(255, 255, 255, 0.025) 100%
        );
        border: 1px solid var(--nxt1-color-border-subtle);
        min-width: 0;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
      }

      .summary-label {
        font-size: 11px;
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary);
      }

      .summary-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .summary-detail {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── STEPS ─────────────── */

      .steps-section {
        gap: var(--nxt1-spacing-4-5);
      }

      .steps {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      .step {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4);
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 16px;
      }

      .step-number {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 12px;
        background: linear-gradient(
          180deg,
          rgba(163, 230, 53, 0.2) 0%,
          rgba(163, 230, 53, 0.09) 100%
        );
        border: 1px solid rgba(163, 230, 53, 0.14);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
      }

      .step-content {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
        min-width: 0;
      }

      .step-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .step-desc {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── KEY FACTS ─────────────── */

      .facts-section {
        gap: var(--nxt1-spacing-4-5);
      }

      .facts-list {
        list-style: none;
        margin: 0;
        padding: var(--nxt1-spacing-5);
        background: linear-gradient(
          180deg,
          rgba(163, 230, 53, 0.06) 0%,
          rgba(163, 230, 53, 0.03) 100%
        );
        border: 1px solid rgba(163, 230, 53, 0.1);
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
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
        gap: var(--nxt1-spacing-4-5);
      }

      .faq-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .faq-item {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 16px;
        overflow: hidden;
        transition:
          border-color var(--nxt1-transition-fast),
          background var(--nxt1-transition-fast),
          transform var(--nxt1-transition-fast);
      }

      .faq-item--expanded {
        border-color: rgba(163, 230, 53, 0.18);
        background: rgba(255, 255, 255, 0.032);
        transform: translateY(-1px);
      }

      .faq-question {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-4-5);
        min-height: 60px;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
        background: none;
        border: none;
        text-align: left;
        cursor: pointer;
        transition: background var(--nxt1-transition-fast);
        gap: var(--nxt1-spacing-3);
        line-height: var(--nxt1-lineHeight-relaxed);

        &:hover {
          background: rgba(255, 255, 255, 0.03);
        }
      }

      .faq-question span {
        flex: 1;
      }

      .faq-question nxt1-icon {
        flex-shrink: 0;
        color: var(--nxt1-color-text-tertiary);
        transition: transform var(--nxt1-transition-fast);
      }

      .faq-item--expanded .faq-question nxt1-icon {
        transform: rotate(180deg);
        color: var(--nxt1-color-primary);
      }

      .faq-answer {
        padding: 0 var(--nxt1-spacing-4-5) var(--nxt1-spacing-4);
        animation: fadeInDown var(--nxt1-duration-fast) var(--nxt1-easing-out);
        border-top: 1px solid rgba(255, 255, 255, 0.04);
        background: linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.01) 0%,
          rgba(255, 255, 255, 0.02) 100%
        );

        p {
          margin: 0;
          font-size: var(--nxt1-fontSize-base);
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
        .help-body {
          padding: var(--nxt1-spacing-4);
          padding-bottom: calc(var(--nxt1-spacing-16) + env(safe-area-inset-bottom, 0));
          gap: var(--nxt1-spacing-4);
        }

        .content-section,
        .content-section--hero {
          padding: var(--nxt1-spacing-4);
        }

        .summary-grid {
          grid-template-columns: 1fr;
        }

        .faq-question {
          padding: var(--nxt1-spacing-3-5) var(--nxt1-spacing-4);
          min-height: 56px;
        }

        .faq-answer {
          padding: 0 var(--nxt1-spacing-4) var(--nxt1-spacing-3-5);
        }
      }

      @media (max-width: 720px) {
        .help-body {
          max-width: 100%;
        }

        .content-section--hero {
          padding: var(--nxt1-spacing-5);
        }

        .summary-grid {
          grid-template-columns: 1fr;
        }

        .section-heading {
          gap: var(--nxt1-spacing-2);
        }

        .intro-text,
        .status-note {
          max-width: 100%;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageHelpContentComponent {
  private readonly modalCtrl = inject(ModalController, { optional: true });

  readonly isPersonal = input<boolean>(true);
  readonly billingContext = input<BillingStateSummary | null>(null);
  readonly close = output<void>();

  protected readonly expandedFaq = signal<string | null>(null);
  protected readonly usesPersonalWallet = computed(() => {
    const ctx = this.billingContext();
    return ctx
      ? ctx.billingMode === 'personal' || ctx.billingEntity === 'individual'
      : this.isPersonal();
  });

  private readonly content = computed(() => {
    const ctx = this.billingContext();
    const hasOrganizationContext = ctx
      ? Boolean(
          ctx.organizationId ||
          ctx.teamId ||
          ctx.billingEntity === 'organization' ||
          ctx.billingEntity === 'team' ||
          ctx.isOrgAdmin ||
          ctx.isTeamAdmin
        )
      : !this.isPersonal();
    const usesPersonalWallet = ctx
      ? ctx.billingMode === 'personal' || ctx.billingEntity === 'individual'
      : this.isPersonal();

    return getUsageBillingHelpContent({
      usesPersonalWallet,
      hasOrganizationContext,
      billingEntity: ctx?.billingEntity ?? (this.isPersonal() ? 'individual' : 'organization'),
      orgWalletEmpty: ctx?.orgWalletEmpty ?? false,
      isAdmin: Boolean(ctx?.isOrgAdmin || ctx?.isTeamAdmin),
    });
  });

  protected readonly introIcon = computed(() =>
    this.usesPersonalWallet() ? 'wallet-outline' : 'business-outline'
  );
  protected readonly introTitle = computed(() => this.content().introTitle);
  protected readonly introText = computed(() => this.content().introText);
  protected readonly statusNote = computed(() => this.content().statusNote);
  protected readonly summaryCards = computed(() => this.content().summaryCards);
  protected readonly steps = computed(() => this.content().steps);
  protected readonly facts = computed(() => this.content().facts.map((text) => ({ text })));
  protected readonly faqItems = computed(() => this.content().faqs);

  protected toggleFaq(id: string): void {
    this.expandedFaq.update((current) => (current === id ? null : id));
  }

  protected async closeHelp(): Promise<void> {
    this.close.emit();

    if (this.modalCtrl) {
      try {
        await this.modalCtrl.dismiss();
      } catch {
        // No active Ionic modal on web overlay path.
      }
    }
  }
}
