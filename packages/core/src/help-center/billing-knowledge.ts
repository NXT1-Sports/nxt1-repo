/**
 * @fileoverview Shared Billing Knowledge
 * @module @nxt1/core/help-center
 * @version 1.0.0
 *
 * Shared content definitions for billing guidance used by both the Usage UI
 * and Help Center knowledge seeding.
 */

import type { ArticleTableOfContents } from './help-center.types';
import type { BillingEntity } from '../usage/usage.types';

export interface BillingHelpSummaryCard {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export interface BillingHelpStep {
  readonly title: string;
  readonly desc: string;
}

export interface BillingHelpFaq {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

export interface BillingHelpContent {
  readonly introTitle: string;
  readonly introText: string;
  readonly statusNote: string | null;
  readonly summaryCards: readonly BillingHelpSummaryCard[];
  readonly steps: readonly BillingHelpStep[];
  readonly facts: readonly string[];
  readonly faqs: readonly BillingHelpFaq[];
}

export interface SharedBillingArticleDefinition {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly tags: readonly string[];
  readonly tableOfContents: readonly ArticleTableOfContents[];
  readonly seo: {
    readonly metaTitle: string;
    readonly metaDescription: string;
    readonly keywords: readonly string[];
  };
  readonly content: string;
}

export interface BillingHelpContext {
  readonly usesPersonalWallet: boolean;
  readonly hasOrganizationContext: boolean;
  readonly billingEntity: BillingEntity;
  readonly orgWalletEmpty: boolean;
  readonly isAdmin: boolean;
}

function renderList(items: readonly string[]): string {
  return `<ul>\n${items.map((item) => `  <li>${item}</li>`).join('\n')}\n</ul>`;
}

function renderOrderedList(items: readonly string[]): string {
  return `<ol>\n${items.map((item) => `  <li>${item}</li>`).join('\n')}\n</ol>`;
}

function renderParagraphs(paragraphs: readonly string[]): string {
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('\n\n');
}

const PERSONAL_FAQS: readonly BillingHelpFaq[] = [
  {
    id: 'what-is-hold',
    question: 'What is a processing hold?',
    answer:
      'A processing hold is the estimated amount reserved before Agent X starts the work. It protects your wallet from being overspent while a task is still running. When the task finishes, the actual amount is settled and any unused portion of the hold is released.',
  },
  {
    id: 'when-charged',
    question: 'When am I actually charged?',
    answer:
      'The wallet is only settled after the task finishes. You may see the estimate as a pending hold first, then the final settled amount once the system knows the true cost of the completed work.',
  },
  {
    id: 'failed-operation',
    question: 'What happens if an operation fails?',
    answer:
      'If Agent X cannot complete the task, the hold is released and the failed work is not settled as a charge. Billing & Usage will reflect that release so your balance returns to what was actually available.',
  },
  {
    id: 'budget-controls',
    question: 'How do budgets and auto top-up fit in?',
    answer:
      'Budgets let you cap or alert on spend before new work can continue, while auto top-up keeps the wallet funded automatically once it drops below your chosen threshold.',
  },
];

const ORGANIZATION_FAQS: readonly BillingHelpFaq[] = [
  {
    id: 'org-prepaid',
    question: 'Is organization billing postpaid or invoiced monthly?',
    answer:
      'No. The shared team and organization model is still prepaid. Usage is tracked throughout the period for reporting and budget control, but Agent X work draws from a funded wallet instead of waiting for a month-end invoice.',
  },
  {
    id: 'who-pays',
    question: 'Who pays for work when organization billing is active?',
    answer:
      'New work is charged to the shared wallet while organization billing is active and funded. Admins manage that wallet, while members operate inside the budgets and limits that have been configured.',
  },
  {
    id: 'wallet-empty',
    question: 'What happens if the shared wallet is empty?',
    answer:
      'New work cannot continue on organization billing once the wallet has no available balance. Eligible members can switch future work to their personal wallet until an admin tops the shared wallet back up.',
  },
  {
    id: 'personal-fallback',
    question: 'Can members use a personal wallet instead?',
    answer:
      "Yes, when the account setup allows it. Switching billing mode routes future charges to the member's personal wallet. That does not reassign past charges that were already taken from the shared wallet.",
  },
  {
    id: 'admin-controls',
    question: 'Who can manage funding, budgets, and payment settings?',
    answer:
      'Organization and team admins manage the shared wallet. They can top up funds, update payment details, set budget rules, and review breakdowns to understand who is using what.',
  },
  {
    id: 'failed-operation-org',
    question: 'Are failed jobs charged to the shared wallet?',
    answer:
      'No. Failed or canceled work releases the hold instead of settling it, so the shared wallet is only charged for completed work.',
  },
];

export function getUsageBillingHelpContent(context: BillingHelpContext): BillingHelpContent {
  const sharedWalletLabel =
    context.billingEntity === 'team' ? 'Team wallet' : 'Organization wallet';

  if (context.usesPersonalWallet) {
    return {
      introTitle: context.hasOrganizationContext
        ? 'Personal Wallet Is Active'
        : 'Credits Power Agent X',
      introText: context.hasOrganizationContext
        ? 'New Agent X work is currently routing to your personal wallet. Usage still follows the same hold-and-settle flow, but the charge comes out of your own balance until you switch back.'
        : 'Agent X runs on wallet credits. You fund your balance first, we place a temporary hold before work starts, and we settle the final amount when the task completes.',
      statusNote: context.hasOrganizationContext
        ? 'You can route future charges back to the shared wallet from Billing & Usage whenever your team setup allows it.'
        : null,
      summaryCards: [
        {
          label: 'Charge Source',
          value: 'Personal wallet',
          detail: context.hasOrganizationContext
            ? 'Your current Agent X work is charging against your own balance, not the shared team wallet.'
            : 'All new Agent X work pulls from the balance you have loaded into your wallet.',
        },
        {
          label: 'Before Work Starts',
          value: 'Temporary hold',
          detail:
            'We reserve the estimated amount up front, then settle the real cost after the task finishes.',
        },
        {
          label: 'Controls',
          value: 'Budgets and auto top-up',
          detail:
            'You can set spending limits, receive alerts, and optionally keep your wallet funded automatically.',
        },
      ],
      steps: [
        {
          title: 'Fund your wallet',
          desc: 'Add credits before you start work so Agent X has balance available to draw from.',
        },
        {
          title: 'Start an Agent X task',
          desc: 'When you confirm a task, we estimate the cost and check that your wallet can cover it.',
        },
        {
          title: 'We place a temporary hold',
          desc: 'The estimated amount is reserved immediately so that in-flight work does not overspend the wallet.',
        },
        {
          title: 'We settle the final amount',
          desc: 'When the task finishes, the actual cost is captured and any unused portion of the hold is released back to the wallet.',
        },
      ],
      facts: [
        'Only completed work is settled. Failed or canceled work releases the hold instead of charging it.',
        'Pending holds and settled charges appear separately in Billing & Usage so you can see what is still in flight.',
        'Budgets and hard stops can prevent new work from starting once you reach the limit you set.',
        'Auto top-up can refill the wallet automatically if you enable it.',
      ],
      faqs: PERSONAL_FAQS,
    };
  }

  return {
    introTitle:
      context.billingEntity === 'team' ? 'Team Wallet Billing' : 'Organization Wallet Billing',
    introText:
      'Your team uses a shared prepaid wallet. Admins fund it, budgets and hard stops protect it, and Agent X usage is tracked live so everyone can see what is pending, settled, and available.',
    statusNote: context.orgWalletEmpty
      ? 'If the shared wallet runs out, eligible members can move new work to their personal wallet until admins top the wallet back up.'
      : null,
    summaryCards: [
      {
        label: 'Charge Source',
        value: sharedWalletLabel,
        detail:
          'Eligible members charge new Agent X work to the shared prepaid balance while organization billing is active.',
      },
      {
        label: 'Managed By',
        value: context.isAdmin ? 'You and other admins' : 'Organization and team admins',
        detail:
          'Admins handle funding, payment settings, budget rules, and any hard-stop policies tied to the shared wallet.',
      },
      {
        label: 'Visibility',
        value: 'Live holds and breakdowns',
        detail:
          'Pending holds, settled usage, and member activity appear inside Billing & Usage so teams can see where funds are going.',
      },
    ],
    steps: [
      {
        title: 'Admins fund the shared wallet',
        desc: 'The organization or team keeps a prepaid balance available for approved Agent X work.',
      },
      {
        title: 'Members run Agent X tasks',
        desc: 'New work uses the shared wallet while organization billing is active and the wallet has funds available.',
      },
      {
        title: 'Holds and budgets are applied live',
        desc: 'Pending holds reserve funds immediately, while budgets, alerts, and hard stops govern how much can be spent.',
      },
      {
        title: 'Fallback stays available when allowed',
        desc: 'If shared funds are unavailable, eligible members can switch future work to their personal wallet until admins refill the shared balance.',
      },
    ],
    facts: [
      'Organization and team billing also uses a prepaid wallet. It is not a postpaid monthly invoice model.',
      'Admins can top up the shared wallet and manage payment details directly from Usage.',
      'Budgets can exist at the organization or team level and may trigger alerts or hard stops before new work begins.',
      'Breakdowns show which member ran each operation so admins can review usage by person, category, and period.',
      'If the shared wallet runs out, eligible members can move future work to their personal wallet until funds are restored.',
    ],
    faqs: ORGANIZATION_FAQS,
  };
}

const BILLING_ARTICLE_TOC: readonly ArticleTableOfContents[] = [
  { id: 'usage-based-billing', title: 'Usage-Based Billing', level: 2 },
  { id: 'balance-ai-wallet', title: 'The Balance AI Wallet', level: 2 },
  { id: 'pending-holds', title: 'Pending Holds', level: 2 },
  { id: 'auto-top-up', title: 'Auto Top-Up', level: 2 },
  { id: 'when-balance-hits-zero', title: 'When Your Balance Hits Zero', level: 2 },
  { id: 'individual-vs-org', title: 'Individual vs. Organization Billing', level: 2 },
];

export const SHARED_BILLING_HELP_CENTER_ARTICLE: SharedBillingArticleDefinition = {
  slug: 'how-nxt1-billing-works',
  title: 'How NXT1 Billing Works',
  excerpt:
    'NXT1 uses usage-based billing for Agent X work. Learn how the prepaid wallet, pending holds, auto top-up, budgets, and organization billing controls actually work.',
  tags: [
    'billing',
    'wallet',
    'credits',
    'auto top-up',
    'usage',
    'payments',
    'how billing works',
    'budgets',
  ],
  tableOfContents: BILLING_ARTICLE_TOC,
  seo: {
    metaTitle: 'How NXT1 Billing Works - Wallets, Holds, Budgets, and Usage',
    metaDescription:
      'Learn how NXT1 billing works across personal and organization accounts, including prepaid wallets, pending holds, budgets, and auto top-up.',
    keywords: [
      'NXT1 billing',
      'usage-based billing',
      'wallet balance',
      'pending holds',
      'auto top-up',
    ],
  },
  content: [
    '<h2 id="usage-based-billing">Usage-Based Billing</h2>',
    renderParagraphs([
      'NXT1 does not charge a flat monthly plan for Agent X work. Standard platform features remain available, while paid AI operations use a wallet-and-usage model so you only fund the work you actually run.',
      'Before a paid operation begins, Agent X checks the active billing source, estimates the cost, and makes sure there is enough balance available. If there is not enough available balance, the work does not start.',
    ]),
    renderParagraphs(['<strong>Always free - no wallet charge required:</strong>']),
    renderList([
      'Creating and maintaining your profile',
      'Browsing teams, athletes, coaches, and explore',
      'Messaging and team communications',
      'Viewing your schedule, roster, and feed',
      'Standard navigation throughout the platform',
    ]),
    renderParagraphs([
      '<strong>Charged to the active wallet when Agent X performs paid work:</strong>',
    ]),
    renderList([
      'Generating reports, analyses, or scouting outputs',
      'Creating AI graphics, branding assets, and highlight reels',
      'Running advanced film analysis or recruiting workflows',
      'Large Agent X operations that consume AI compute or orchestration resources',
    ]),
    '<h2 id="balance-ai-wallet">The Balance AI Wallet</h2>',
    renderParagraphs([
      'NXT1 uses prepaid wallets as the funding source for Agent X work. Individual users have a personal wallet. Teams and organizations can also operate from a shared wallet managed by admins.',
      'The wallet shown in Billing & Usage is the amount currently available to fund new work. This is distinct from funds that are reserved as pending holds for tasks already in progress.',
    ]),
    renderParagraphs(['<strong>To add funds:</strong>']),
    renderOrderedList([
      'Open Billing & Usage.',
      'Choose Add Credits or the relevant funding action.',
      'Select the amount to add and confirm the payment method.',
      'The wallet balance updates when the top-up completes.',
    ]),
    '<h2 id="pending-holds">Pending Holds</h2>',
    renderParagraphs([
      'When Agent X begins a paid operation, the platform reserves the estimated amount first. This reservation is the pending hold.',
      'The hold reduces the funds available for new work while the operation is running. After the task finishes, the final settled charge replaces the hold. If the actual cost is lower, the unused portion is released back to the wallet. If the task fails or is canceled, the hold is released instead of being charged.',
    ]),
    '<h2 id="auto-top-up">Auto Top-Up</h2>',
    renderParagraphs([
      'Auto top-up keeps a wallet funded automatically once the balance drops below a configured threshold. It is useful for people or programs that run Agent X work regularly and do not want operations blocked by low balance.',
    ]),
    renderOrderedList([
      'Set the trigger threshold - the balance level that should cause a refill.',
      'Set the reload amount - how much to add each time the trigger fires.',
      'Choose the payment method that should be charged for the reload.',
    ]),
    '<h2 id="when-balance-hits-zero">When Your Balance Hits Zero</h2>',
    renderParagraphs([
      'If the active wallet has no available balance, new paid Agent X work cannot start. In-flight work that already has a hold remains governed by the hold that was already reserved.',
      'For organization-billed users, eligible members may be able to switch future charges to their personal wallet until admins refill the shared wallet. Free platform features are unaffected.',
    ]),
    '<h2 id="individual-vs-org">Individual vs. Organization Billing</h2>',
    renderParagraphs([
      'Individual billing routes work to the personal wallet. Organization and team billing route work to a shared prepaid wallet that admins control.',
      'Admins can top up the shared wallet, manage payment details, review member-level breakdowns, and set budgets or hard stops. Members can continue running work inside those limits, and when the account setup allows it they can switch future work back to a personal wallet if the shared wallet is unavailable.',
    ]),
  ].join('\n\n'),
};
