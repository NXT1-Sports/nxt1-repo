/**
 * Seed Script — Account & Settings Help Center Articles
 *
 * Creates 3 articles in the helpArticles collection:
 *   A. How NXT1 Billing Works
 *   C. Understanding the Usage Dashboard
 *   E. Connected Accounts and Integrations
 *
 * Idempotent: upserts by slug. Safe to re-run.
 *
 * Usage (from monorepo root):
 *   MONGO="..." npx tsx scripts/seed-knowledge/seed-account-articles.ts
 */

import 'dotenv/config';
import {
  connectToMongoDB,
  disconnectFromMongoDB,
} from '../../backend/src/config/database.config.js';
import { HelpArticleModel } from '../../backend/src/models/help-center/help-article.model.js';
import { SHARED_BILLING_HELP_CENTER_ARTICLE } from '../../packages/core/src/help-center/billing-knowledge.js';

// ─── Article Definitions ──────────────────────────────────────────────────────

const TODAY = '2026-04-19';

const articles = [
  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE A: How NXT1 Billing Works
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: SHARED_BILLING_HELP_CENTER_ARTICLE.slug,
    title: SHARED_BILLING_HELP_CENTER_ARTICLE.title,
    excerpt: SHARED_BILLING_HELP_CENTER_ARTICLE.excerpt,
    type: 'article' as const,
    category: 'account' as const,
    tags: [...SHARED_BILLING_HELP_CENTER_ARTICLE.tags],
    targetUsers: ['all'] as const,
    readingTimeMinutes: 4,
    isFeatured: true,
    isNew: true,
    isPublished: true,
    publishedAt: TODAY,
    updatedAt: TODAY,
    viewCount: 0,
    helpfulCount: 0,
    notHelpfulCount: 0,
    tableOfContents: [...SHARED_BILLING_HELP_CENTER_ARTICLE.tableOfContents],
    seo: {
      metaTitle: SHARED_BILLING_HELP_CENTER_ARTICLE.seo.metaTitle,
      metaDescription: SHARED_BILLING_HELP_CENTER_ARTICLE.seo.metaDescription,
      keywords: [...SHARED_BILLING_HELP_CENTER_ARTICLE.seo.keywords],
    },
    content: SHARED_BILLING_HELP_CENTER_ARTICLE.content,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE C: Understanding the Usage Dashboard
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'understanding-the-usage-dashboard',
    title: 'Understanding the Usage Dashboard',
    excerpt:
      'The Usage Dashboard gives you a complete view of your spend, usage history, payment records, and wallet status in one place. Learn what each section shows, how to filter by time period, and how to read the day-by-day breakdown to understand exactly where your credits are going.',
    type: 'guide' as const,
    category: 'account' as const,
    tags: [
      'usage dashboard',
      'billing',
      'spend',
      'usage history',
      'credits',
      'payment history',
      'Balance AI',
      'budgets',
    ],
    targetUsers: ['all'] as const,
    readingTimeMinutes: 5,
    isFeatured: false,
    isNew: true,
    isPublished: true,
    publishedAt: TODAY,
    updatedAt: TODAY,
    viewCount: 0,
    helpfulCount: 0,
    notHelpfulCount: 0,
    tableOfContents: [
      { id: 'where-to-find-it', title: 'Where to Find the Usage Dashboard', level: 2 },
      { id: 'summary-cards', title: 'The Four Summary Cards', level: 2 },
      { id: 'timeframe-filter', title: 'Timeframe Filter', level: 2 },
      { id: 'usage-chart', title: 'Usage Chart', level: 2 },
      { id: 'product-tabs', title: 'The Six Product Tabs', level: 2 },
      { id: 'breakdown-table', title: 'Day-by-Day Breakdown Table', level: 2 },
      { id: 'payment-history', title: 'Payment History', level: 2 },
      { id: 'budgets-and-coupons', title: 'Budgets and Active Coupons', level: 2 },
    ],
    seo: {
      metaTitle: 'Understanding the NXT1 Usage Dashboard — Spend, Credits, and Billing History',
      metaDescription:
        'Complete guide to the NXT1 Usage Dashboard. Learn to read summary cards, product tabs, the breakdown table, payment history, and budget controls.',
      keywords: [
        'NXT1 usage dashboard',
        'billing dashboard',
        'credit usage',
        'NXT1 spend history',
        'Balance AI dashboard',
      ],
    },
    content: `
<h2 id="where-to-find-it">Where to Find the Usage Dashboard</h2>

<p>The Usage Dashboard is accessible from the sidenav under <strong>Billing &amp; Usage</strong>. It is a single scrollable page — every piece of billing and usage information lives here, from your real-time wallet balance to individual line items for each operation Agent X has run on your behalf.</p>

<h2 id="summary-cards">The Four Summary Cards</h2>

<p>At the top of the dashboard, four cards give you an instant snapshot of your current financial state:</p>

<ul>
  <li>
    <strong>Current Metered Usage</strong> — Your total spend for the current billing period. This is what you have actually been charged so far this month across all paid operations.
  </li>
  <li>
    <strong>Wallet Balance</strong> — Your available Balance AI funds in real time. This number updates as operations complete and holds settle. It reflects what you can actually spend right now.
  </li>
  <li>
    <strong>Pending Holds</strong> — Funds currently reserved for in-flight Agent X operations that have started but not yet completed. These are committed but not yet settled to a final charge. Pending holds reduce your effective available balance.
  </li>
  <li>
    <strong>Next Payment</strong> — If Auto Top-Up is configured, this shows the next scheduled reload date and the amount that will be charged. If Auto Top-Up is off, this card shows your current payment method on file.
  </li>
</ul>

<h2 id="timeframe-filter">Timeframe Filter</h2>

<p>Every section of the dashboard — the chart, the product tabs, the breakdown table, and the payment history — responds to the timeframe filter at the top of the page. Options:</p>

<ul>
  <li>Current month</li>
  <li>Last month</li>
  <li>Last 3 months</li>
  <li>Last 6 months</li>
  <li>Last 12 months</li>
  <li>Custom date range — pick any start and end date</li>
</ul>

<p>The summary cards (wallet balance and pending holds) always show real-time values regardless of the filter. Only historical spend data responds to the timeframe selection.</p>

<h2 id="usage-chart">Usage Chart</h2>

<p>The chart below the summary cards shows your spend visually across the selected timeframe. It has two layers:</p>

<ul>
  <li><strong>Line chart</strong> — daily cumulative spend. The line rises as operations run and flattens on days with no paid activity.</li>
  <li><strong>Stacked bar</strong> — a breakdown of spending by category for the period, color-coded by type: AI, Media, Recruiting, Communication, Profile, and Teams. The stacked bar gives you an immediate visual read on which parts of the platform are driving your spend.</li>
</ul>

<p>Hovering over any point on the line chart shows the exact spend for that day. The stacked bar at the end of the chart summarizes the full period.</p>

<h2 id="product-tabs">The Six Product Tabs</h2>

<p>Below the chart, six tabs break your usage down by product category. Each tab covers a distinct part of the platform:</p>

<ul>
  <li><strong>AI</strong> — Agent X operations, Intel Report generation, performance analysis, and any task that involves significant AI compute</li>
  <li><strong>Media</strong> — AI graphic generation, highlight reel creation, branding assets, and video processing</li>
  <li><strong>Recruiting</strong> — College program connections and outreach sends via Agent X</li>
  <li><strong>Communication</strong> — Email automation, message drafting pipelines, and scheduled communication operations</li>
  <li><strong>Profile</strong> — Profile enhancement products, scouting report generation, and profile-specific AI operations</li>
  <li><strong>Teams</strong> — Team-level operations: roster intelligence, schedule analytics, program reports</li>
</ul>

<p>Each tab shows three things for the selected timeframe:</p>

<ol>
  <li><strong>Billable amount</strong> — what you were charged after any discounts or credits applied</li>
  <li><strong>Consumed amount</strong> — the gross cost before discounts</li>
  <li><strong>Included quotas</strong> — free usage included in your account for this period. For example, if your account includes 10 AI operations per month and you have used 5, the tab shows "5 of 10 included AI credits used" and a countdown to the next reset date. Operations within quota have no cost.</li>
</ol>

<p>Each operation within a tab is listed as a <strong>per-SKU line item</strong>: product name, units consumed, price per unit, gross amount, and billed amount after discounts. This gives you full transparency on exactly what each operation cost.</p>

<h2 id="breakdown-table">Day-by-Day Breakdown Table</h2>

<p>Below the product tabs, the breakdown table shows usage organized chronologically. Each row represents a day with paid activity. Rows are expandable:</p>

<p><strong>For individual users</strong>, expanding a day shows the SKU line items for that day directly — product name, units consumed, unit price, and billed amount.</p>

<p><strong>For organization accounts</strong>, the hierarchy is deeper: each day expands into teams, each team expands into individual members, and each member expands into their SKU line items. This lets Directors see exactly which team and which user drove every charge, down to the individual operation level.</p>

<p>The breakdown table is the right place to go when you see an unexpected spike in spend and need to trace exactly what happened and who ran what.</p>

<h2 id="payment-history">Payment History</h2>

<p>Below the breakdown table, the full transaction log shows every time funds were added to your wallet. Each entry includes:</p>

<ul>
  <li>Transaction ID (short display format for support references)</li>
  <li>Amount and currency</li>
  <li>Status: pending / processing / completed / failed / refunded</li>
  <li>Payment method used (e.g., "Mastercard ending in 9639")</li>
  <li>Date and time</li>
  <li>Download links for the receipt and invoice</li>
</ul>

<p>Receipts and invoices are available immediately after a transaction completes. If you need documentation for expense reports or program accounting, download them directly from this section.</p>

<h2 id="budgets-and-coupons">Budgets and Active Coupons</h2>

<p><strong>Budgets</strong> — At the bottom of the dashboard, you can configure per-category spend limits. Set a monthly budget for any product tab (AI, Media, Recruiting, etc.) in dollars. Enable the <strong>Stop on Limit</strong> toggle to automatically pause operations in that category when the budget ceiling is reached for the month. Each budget row shows your current spend vs. the limit with a progress bar. For organization accounts, team-level sub-allocations appear within each budget row.</p>

<p><strong>Active Coupons</strong> — If a promotional code or discount is applied to your account, it appears in this section showing the code, what it discounts (percentage or flat amount), which product categories it applies to, and the expiration date. Coupons are applied automatically at checkout — you do not need to enter them for each transaction once they are on your account.</p>
    `.trim(),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE E: Connected Accounts and Integrations
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'connected-accounts-and-integrations',
    title: 'Connected Accounts and Integrations',
    excerpt:
      'Connecting your external accounts — MaxPreps, Hudl, and others — is what gives Agent X live, real data to work with. Without connected sources, your briefings are thin and operations require manual input. With them, Agent X works automatically. Here is what connects, what it unlocks, and how to set it up.',
    type: 'article' as const,
    category: 'account' as const,
    tags: [
      'connected accounts',
      'MaxPreps',
      'Hudl',
      'integrations',
      'agent x',
      'settings',
      'data sync',
      'tools',
    ],
    targetUsers: ['all'] as const,
    readingTimeMinutes: 3,
    isFeatured: false,
    isNew: true,
    isPublished: true,
    publishedAt: TODAY,
    updatedAt: TODAY,
    viewCount: 0,
    helpfulCount: 0,
    notHelpfulCount: 0,
    tableOfContents: [
      { id: 'what-connected-accounts-unlock', title: 'What Connected Accounts Unlock', level: 2 },
      { id: 'available-integrations', title: 'Available Integrations', level: 2 },
      { id: 'where-to-connect', title: 'Where to Connect', level: 2 },
      { id: 'what-agent-x-can-do', title: 'What Agent X Can Do With Connected Sources', level: 2 },
      { id: 'without-connected-accounts', title: 'What Agent X Cannot Do Without Them', level: 2 },
      { id: 'disconnecting', title: 'Disconnecting an Account', level: 2 },
    ],
    seo: {
      metaTitle: 'Connected Accounts and Integrations — MaxPreps, Hudl, and NXT1 Agent X',
      metaDescription:
        'Learn how to connect MaxPreps, Hudl, and other external accounts to NXT1. What connected sources unlock for Agent X and your daily briefing.',
      keywords: [
        'NXT1 integrations',
        'connect MaxPreps',
        'connect Hudl',
        'NXT1 connected accounts',
        'Agent X data',
      ],
    },
    content: `
<h2 id="what-connected-accounts-unlock">What Connected Accounts Unlock</h2>

<p>NXT1 can display a profile that looks complete on the surface — name, position, sport, some manually entered stats. But Agent X operates on <em>data quality</em>, not data presence. A profile with a handful of manually typed stats gives Agent X something to show. A profile connected to live sources gives Agent X something to work with.</p>

<p>The difference is significant:</p>

<ul>
  <li><strong>Manual-only profile</strong> — Agent X works from static snapshots. Stats go stale the moment your next game ends. Briefings can only surface what you have typed in. Operations require you to provide context that connected sources would have supplied automatically.</li>
  <li><strong>Connected profile</strong> — Agent X pulls live data. Stats update after competitions without any action on your part. Briefings are specific to your actual current situation. Operations run with full context already loaded.</li>
</ul>

<p>Connecting your external accounts is the single highest-leverage configuration step you can take on NXT1 — for athletes, coaches, and programs alike.</p>

<h2 id="available-integrations">Available Integrations</h2>

<p><strong>MaxPreps</strong> — The primary stats and standings integration. After connecting, MaxPreps syncs game results, team stats, individual player stats, and standings automatically after each competition is posted. Athletes get accurate, current stats on their profile without manual entry. Coaches see live team record and performance data that Agent X can reference in recruiting communications and program reports.</p>

<p><strong>Hudl</strong> — Film and highlight integration. Connecting Hudl links your video library directly to your NXT1 profile and team. Athletes' highlight reels are accessible from their profile. Coaches can reference specific film clips when Agent X generates performance analyses. New film uploaded to Hudl becomes available on NXT1 automatically.</p>

<p>Additional integrations are available depending on your sport. The full list of currently supported sources appears in <strong>Settings → Tools &amp; Integrations → Connected Accounts</strong> — the options shown are specific to your sport and role.</p>

<h2 id="where-to-connect">Where to Connect</h2>

<ol>
  <li>Go to <strong>Settings</strong> from the sidenav.</li>
  <li>Select <strong>Tools &amp; Integrations</strong>.</li>
  <li>Tap <strong>Connected Accounts</strong>.</li>
  <li>Find the source you want to connect and tap <strong>Connect</strong>.</li>
  <li>You will be redirected to the external platform to authorize the connection. After authorizing, you are returned to NXT1 and the sync begins immediately.</li>
</ol>

<p>The first sync may take a few minutes depending on how much historical data is being imported. Agent X will notify you when the initial import is complete.</p>

<h2 id="what-agent-x-can-do">What Agent X Can Do With Connected Sources</h2>

<p>Once your accounts are connected, Agent X can execute operations that would otherwise require manual data entry or simply could not run at all:</p>

<ul>
  <li><strong>Post-game summaries generated automatically</strong> — After each game, Agent X can generate a performance summary using real results from MaxPreps without any prompting. For coaches, this includes team performance breakdowns. For athletes, individual stat lines and context against their season averages.</li>
  <li><strong>Stats stay current without manual updates</strong> — Every athlete's profile reflects their actual current season stats, not a snapshot from the last time someone remembered to update it.</li>
  <li><strong>Recruiting communications with live context</strong> — When Agent X drafts outreach to college programs on an athlete's behalf, it references their actual current record and real stats — not a generic template with blanks to fill in.</li>
  <li><strong>Staleness alerts surface automatically</strong> — If a connected source has not synced in an unusual amount of time, Agent X flags it in your daily briefing and playbook so you can investigate before stale data causes problems.</li>
  <li><strong>Film-backed analysis</strong> — With Hudl connected, Agent X can reference specific game tape in performance analyses rather than working from stats alone.</li>
</ul>

<h2 id="without-connected-accounts">What Agent X Cannot Do Without Them</h2>

<p>Without connected sources, Agent X is not broken — it still runs. But it operates with one hand tied behind its back. The practical gaps:</p>

<ul>
  <li>Daily briefings default to generic prompts ("connect your accounts to get more specific intelligence") rather than specific, data-driven insights</li>
  <li>Weekly playbooks consistently surface "sync your stats" as a top action item — because Agent X knows data is stale but cannot fix it automatically</li>
  <li>Post-game operations require you to manually provide scores, stats, and results before Agent X can analyze them</li>
  <li>Recruiting drafts lack current performance data and must rely on whatever you have manually typed into your profile</li>
  <li>Coach-level roster analyses are limited to what athletes have typed themselves, which is often incomplete</li>
</ul>

<p>If your Agent X briefings consistently feel thin or your playbook keeps surfacing the same data-entry tasks, the fix is almost always connecting your external accounts.</p>

<h2 id="disconnecting">Disconnecting an Account</h2>

<p>To disconnect a source, go to <strong>Settings → Tools &amp; Integrations → Connected Accounts</strong>, find the connected source, and tap <strong>Disconnect</strong>.</p>

<p>What happens when you disconnect:</p>
<ul>
  <li>The live sync stops immediately. No new data pulls from that source.</li>
  <li>Data already imported to your NXT1 profile <strong>stays on your profile</strong> — disconnecting does not delete historical stats or media that have already been imported.</li>
  <li>Agent X stops referencing that source for new operations. It will work from whatever data remains on your profile until you reconnect or update manually.</li>
  <li>You can reconnect at any time and the sync resumes from where it left off.</li>
</ul>
    `.trim(),
  },
];

// ─── Seed Runner ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('⚙️  NXT1 Help Center — Account & Settings Articles Seed');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Articles to seed: ${articles.length}\n`);

  await connectToMongoDB();
  console.log('  ✅ MongoDB connected\n');

  let created = 0;
  let updated = 0;

  for (const article of articles) {
    const existing = await HelpArticleModel.findOne({ slug: article.slug });

    if (existing) {
      await HelpArticleModel.updateOne({ slug: article.slug }, { $set: article });
      console.log(`  ♻️  Updated:  "${article.title}"`);
      updated++;
    } else {
      await HelpArticleModel.create(article);
      console.log(`  ✅ Created:  "${article.title}"`);
      created++;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('📊 Seed Complete');
  console.log(`   Created:  ${created}`);
  console.log(`   Updated:  ${updated}`);
  console.log(`   Duration: ${duration}s`);
  console.log('══════════════════════════════════════════════════════════\n');

  await disconnectFromMongoDB();
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
