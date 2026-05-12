/**
 * @fileoverview Shared Help Center Seed Content
 * @module @nxt1/backend/scripts/seed-knowledge
 *
 * Canonical article and FAQ definitions used by the help-center seed scripts.
 * Keep this file aligned with live Mongo help content to avoid drift.
 */

import { SHARED_BILLING_HELP_CENTER_ARTICLE } from '../../../packages/core/src/help-center/billing-knowledge.js';

const TODAY = '2026-04-19';

export const HELP_CENTER_ACCOUNT_ARTICLES = [
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

export const HELP_CENTER_TEAMS_ARTICLES = [
  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE A: Creating and Managing Your Team
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'creating-and-managing-your-team',
    title: 'Creating and Managing Your Team',
    excerpt:
      'Set up your team on NXT1 the right way — from creating the program and filling out each section, to connecting your accounts so Agent X has real data to work with. A properly configured team unlocks the full power of the platform.',
    type: 'guide' as const,
    category: 'teams' as const,
    tags: [
      'teams',
      'create team',
      'roster',
      'staff',
      'manage team',
      'program setup',
      'connected accounts',
      'agent x',
      'coach',
      'director',
    ],
    targetUsers: ['coach', 'director'] as const,
    readingTimeMinutes: 5,
    isFeatured: true,
    isNew: true,
    isPublished: true,
    publishedAt: TODAY,
    updatedAt: TODAY,
    viewCount: 0,
    helpfulCount: 0,
    notHelpfulCount: 0,
    tableOfContents: [
      { id: 'what-a-team-is', title: 'What a Team Is on NXT1', level: 2 },
      { id: 'creating-a-team', title: 'Creating a Team', level: 2 },
      { id: 'building-out-your-program', title: 'Building Out Your Program Properly', level: 2 },
      { id: 'connecting-your-accounts', title: 'Connecting Your Accounts', level: 2 },
      { id: 'managing-your-staff', title: 'Managing Your Staff', level: 2 },
      { id: 'the-invite-system', title: 'Inviting Athletes and Staff', level: 2 },
      { id: 'coach-vs-director', title: 'Coach vs. Director Permissions', level: 2 },
    ],
    seo: {
      metaTitle: 'Creating and Managing Your Team on NXT1 | Coach & Director Guide',
      metaDescription:
        'Learn how to create a team, build out each section, connect your accounts for Agent X, and invite athletes and staff to your NXT1 program.',
      keywords: [
        'create team NXT1',
        'manage team',
        'coach setup',
        'program setup',
        'invite athletes',
        'connected accounts',
      ],
    },
    content: `
<h2 id="what-a-team-is">What a Team Is on NXT1</h2>

<p>A Team on NXT1 is a structured program workspace that connects athletes, coaches, and staff under a single shared environment. It is not just a roster list — it is the operational hub for your program, with six distinct sections that together give Agent X the full picture of your organization:</p>

<ul>
  <li><strong>Roster</strong> — Your athletes and their profile data, stats, and status</li>
  <li><strong>Schedule</strong> — Games, practices, tournaments, and events</li>
  <li><strong>Stats</strong> — Team and individual performance data</li>
  <li><strong>Staff</strong> — Coaches, trainers, and support staff with their roles and access</li>
  <li><strong>Sponsors</strong> — Program sponsors with tier levels and contact information</li>
  <li><strong>Team Info</strong> — Name, branding, contact details, and program identity</li>
</ul>

<p>The quality of everything Agent X does for your program — roster analysis, communications, performance summaries, recruiting intel — is directly proportional to how completely these sections are filled out. A sparse team profile produces sparse results. A complete team profile gives Agent X everything it needs to work at full capacity.</p>

<h2 id="creating-a-team">Creating a Team</h2>

<p>Only Coach and Director role accounts can create teams. To create a team:</p>

<ol>
  <li>Navigate to <strong>Teams</strong> from the main navigation.</li>
  <li>Tap <strong>Create Team</strong>.</li>
  <li>Fill in the core fields:
    <ul>
      <li><strong>Team Name</strong> — The full name of your program (e.g., "Westfield Varsity Football")</li>
      <li><strong>Mascot / Abbreviation</strong> — Optional, used in team branding and Agent X communications</li>
      <li><strong>Sport</strong> — Determines which stats fields, position options, and performance benchmarks are available for your roster</li>
      <li><strong>Level</strong> — Youth, middle school, JV, varsity, club, travel, college, semi-pro, or professional. Choose the level that matches how your program competes — this affects how Agent X frames recruiting and performance context.</li>
      <li><strong>Gender</strong> — Boys, girls, or coed</li>
      <li><strong>Season / Year</strong> — Optional, helps with schedule organization and historical stats</li>
    </ul>
  </li>
  <li>Add your <strong>branding</strong> — upload a team logo, set your primary and secondary colors. This is used across the team profile, shared graphics, and any content Agent X generates for your program.</li>
</ol>

<p>Your team is created immediately. The next step is to build it out so Agent X has something real to work with.</p>

<h2 id="building-out-your-program">Building Out Your Program Properly</h2>

<p>Creating the team is step one. Building it out is what unlocks the platform. Agent X reads from every section of your team profile when it executes operations. The more complete your program data, the more specific, accurate, and actionable Agent X's output becomes.</p>

<p>Work through each section deliberately:</p>

<p><strong>Roster</strong> — Add your athletes and make sure each one has their NXT1 profile connected. A connected athlete brings their stats, highlight media, academic data, and recruiting activity into your team view automatically. An athlete listed by name only gives Agent X nothing to work with beyond their name.</p>

<p><strong>Schedule</strong> — Enter your full season schedule including games, scrimmages, practices, and tournaments. Agent X uses schedule data to time communications, generate pre-game and post-game content, and flag scheduling conflicts. A blank schedule means Agent X cannot proactively surface time-sensitive actions for your program.</p>

<p><strong>Stats</strong> — Team-level stats feed program performance summaries and allow Agent X to benchmark your athletes against position averages and opponent data. Connect your stats sources (see the next section) rather than entering everything manually.</p>

<p><strong>Staff</strong> — Add every coach and staff member with their correct role. Agent X uses staff data when generating program communications, assigning tasks in playbooks, and routing approvals. It also determines who receives Director-level briefings vs. Coach-level briefings.</p>

<p><strong>Team Info</strong> — Complete your contact info, address, and website. These appear on your public team profile and are used by Agent X when generating outreach on behalf of the program.</p>

<h2 id="connecting-your-accounts">Connecting Your Accounts</h2>

<p>Manual data entry is a starting point — connected accounts are the goal. When your external platforms are linked to your team, Agent X can pull live data automatically rather than working from static entries you have to keep updated.</p>

<p>Connect your accounts from the team's <strong>Accounts</strong> section. Sources include:</p>

<ul>
  <li><strong>MaxPreps</strong> — Pulls game results, team stats, and standings automatically after each competition</li>
  <li><strong>Hudl</strong> — Connects film and highlight reels directly to athlete profiles and team media</li>
  <li>Additional integration sources available depending on your sport</li>
</ul>

<p>Once connected, Agent X can:</p>
<ul>
  <li>Generate post-game performance summaries without any prompting</li>
  <li>Keep individual athlete stats current without manual entry</li>
  <li>Reference live team record and standings when drafting recruiting communications</li>
  <li>Surface alerts when stats are out of date and need a manual sync</li>
</ul>

<p>If you skip this step, your daily briefing and weekly playbook will consistently surface "connect your accounts" as a high-priority action item — because Agent X cannot do its best work without real data flowing in.</p>

<h2 id="managing-your-staff">Managing Your Staff</h2>

<p>Add every coach, assistant, trainer, and support staff member to the <strong>Staff</strong> section with their correct role. Each staff member you add receives an invitation to join the team on NXT1 (see the next section on inviting).</p>

<p>Staff roles available: head coach, assistant coach, offensive coordinator, defensive coordinator, position coach, strength &amp; conditioning, athletic trainer, team manager, and others depending on sport.</p>

<p>Getting your full staff on the platform matters beyond just access — Agent X uses your staff structure to understand the org. When generating program-wide communications, briefings, and playbooks, it tailors content to each staff member's role. A head coach and a position coach receive meaningfully different briefings and playbook actions.</p>

<h2 id="the-invite-system">Inviting Athletes and Staff</h2>

<p>Once your team is set up, share it with your athletes and staff using the invite link. The link is the single mechanism for adding people to your team — there is no manual lookup or search required on their end.</p>

<p><strong>How to invite:</strong></p>
<ol>
  <li>Open your team and tap <strong>Invite</strong>.</li>
  <li>Choose how to send the link — options include SMS, email, WhatsApp, copy link, QR code, device contacts, and AirDrop.</li>
  <li>The recipient taps the link, signs up for NXT1 or signs in to their existing account, and lands directly on your team. No code entry, no search, no manual confirmation step required on your end.</li>
</ol>

<p>The QR code option is particularly useful for in-person onboarding — display it at a team meeting or in your locker room and athletes can scan and join on the spot. The copy link option is ideal for group texts, parent emails, and any existing communication channels you already use with your team.</p>

<p>Athletes who do not have a link can also <strong>request to join</strong> your team by finding it through search or a shared profile. These requests appear in your roster as <strong>pending</strong> — you approve or decline from the Roster section.</p>

<h2 id="coach-vs-director">Coach vs. Director Permissions</h2>

<p>Both Coaches and Directors can create and manage teams, but with different scope:</p>

<ul>
  <li><strong>Coach</strong> — Full management of the specific team(s) they are added to: roster, schedule, stats, communications, and media. Receives team-level briefings and playbooks from Agent X.</li>
  <li><strong>Director</strong> — Program-level oversight across multiple teams. Can create teams, assign coaches, view aggregated analytics, manage sponsors, and control the program umbrella. Receives program-level briefings from Agent X covering all teams under their org.</li>
</ul>

<p>For programs running multiple teams — varsity and JV, multiple sport programs, or club organizations with multiple age groups — the Director role is the right foundation. See <em>Setting Up a Club or Travel Program</em> for a full guide on multi-team program structure.</p>
    `.trim(),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE B: Joining a Team on NXT1
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'joining-a-team-on-nxt1',
    title: 'Joining a Team on NXT1',
    excerpt:
      'Whether you received an invite link from your coach or are requesting to join a program on your own, here is the complete guide to joining a team on NXT1 — for athletes, coaches, and staff.',
    type: 'guide' as const,
    category: 'teams' as const,
    tags: [
      'join team',
      'invite link',
      'team request',
      'pending',
      'athlete',
      'coach',
      'staff',
      'roster',
      'teams',
    ],
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
    tableOfContents: [
      { id: 'two-ways-to-join', title: 'Two Ways to Join a Team', level: 2 },
      { id: 'joining-via-invite-link', title: 'Joining via Invite Link', level: 2 },
      { id: 'requesting-to-join', title: 'Requesting to Join', level: 2 },
      { id: 'after-joining', title: 'What Happens After You Join', level: 2 },
      { id: 'multiple-teams', title: 'Being on Multiple Teams', level: 2 },
      { id: 'leaving-a-team', title: 'Leaving a Team', level: 2 },
    ],
    seo: {
      metaTitle: 'How to Join a Team on NXT1 — Invite Link and Join Request Guide',
      metaDescription:
        'Complete guide to joining a team on NXT1 via invite link or join request. Covers athletes, coaches, and staff. Includes pending approval and multi-team support.',
      keywords: [
        'join team NXT1',
        'invite link',
        'team join request',
        'athlete team',
        'NXT1 roster',
      ],
    },
    content: `
<p>Teams on NXT1 are the shared workspace that connects athletes, coaches, and staff under one program. Joining is straightforward — but there are two distinct paths depending on how you are being brought on to the team.</p>

<h2 id="two-ways-to-join">Two Ways to Join a Team</h2>

<p>There are two ways to become a member of a team on NXT1:</p>

<ol>
  <li><strong>Invite link</strong> — Your coach or director sends you a link directly. Tapping it takes you straight to the team with no extra steps required. This is the most common path and works for athletes, coaches, and staff.</li>
  <li><strong>Join request</strong> — You find the team yourself and submit a request to join. The coach or director reviews and approves or declines the request. This path is for situations where you know the team exists but do not have a direct link from them yet.</li>
</ol>

<h2 id="joining-via-invite-link">Joining via Invite Link</h2>

<p>When a coach or director invites you, they send a link through whatever channel they use — a group text, WhatsApp message, email, a QR code at practice, or a direct message. The channel does not matter. The link works the same way regardless of how it reaches you.</p>

<p><strong>The process for all roles (athlete, coach, staff):</strong></p>

<ol>
  <li>Tap the invite link.</li>
  <li>If you already have an NXT1 account, sign in. If you are new to the platform, create your account — you will be prompted to select your role (athlete, coach, etc.) and complete basic setup.</li>
  <li>After signing in, you land directly on the team. No search, no code entry, no confirmation step needed from the coach.</li>
  <li>Your membership is active immediately. You appear on the roster or staff list and can access all sections the team has made available to your role.</li>
</ol>

<p>If you tap a link and see an error, the most common cause is that the link has expired (most invite links are valid for 7 days) or the team is no longer accepting new members. Contact your coach or director to send a fresh link.</p>

<h2 id="requesting-to-join">Requesting to Join</h2>

<p>If you know a team or program is on NXT1 but you do not have an invite link from them, you can find the team and request to join.</p>

<p><strong>How it works:</strong></p>
<ol>
  <li>Search for the team from the <strong>Teams</strong> section or find it through a coach or athlete's profile.</li>
  <li>Tap <strong>Request to Join</strong> on the team's page.</li>
  <li>Your request is sent to the team's coaches and directors. Your status on the team is set to <strong>pending</strong> until they act on it.</li>
  <li>The coach or director reviews pending requests in the Roster or Staff section of their team management view. They tap <strong>Approve</strong> or <strong>Decline</strong>.</li>
  <li>If approved, your membership becomes active and you receive a notification. If declined, you receive a notification and can reach out to the program directly.</li>
</ol>

<p>This path is most common for athletes who know their coach uses NXT1 and want to get connected proactively, or for coaches who are joining a program that a director has already set up and wants them added to.</p>

<h2 id="after-joining">What Happens After You Join</h2>

<p>Once you are active on a team, what you see and can do depends on your role:</p>

<p><strong>Athletes</strong> — Your profile data (stats, highlights, academics) is now visible to the coaches and staff on that team. Your coach can see your progress, generate Intel Reports about you, include you in team communications, and tag you in schedule events. Your team membership also appears on your public profile, which is visible to scouts and recruiters.</p>

<p><strong>Coaches and staff</strong> — You have management access to the team sections assigned to your role. Head coaches have full access. Position coaches and assistants may have scoped access depending on how the Director or head coach has structured permissions. Agent X begins generating coach-level daily briefings and weekly playbooks that include your team's data immediately after you join.</p>

<p>In both cases, the more complete your own NXT1 profile is, the better the platform can serve you from day one. Coaches with complete profiles generate better Agent X briefings. Athletes with complete profiles give their coaches and Agent X more to work with.</p>

<h2 id="multiple-teams">Being on Multiple Teams</h2>

<p>Any role on NXT1 can belong to multiple teams simultaneously. This is common for:</p>

<ul>
  <li><strong>Athletes</strong> on both a high school team and a club or travel team</li>
  <li><strong>Coaches</strong> who work with multiple programs (e.g., a head coach and a club team during the off-season)</li>
  <li><strong>Directors</strong> overseeing multiple teams under their program umbrella</li>
</ul>

<p>Each team membership is listed separately in your <strong>Teams</strong> section. Switching between teams is instant — tap the team name to open that team's workspace. Your Agent X briefings and playbooks automatically account for all active teams you are a member of.</p>

<h2 id="leaving-a-team">Leaving a Team</h2>

<p>To leave a team, open the team from your Teams section, go to <strong>Settings</strong>, and tap <strong>Leave Team</strong>. You will be asked to confirm.</p>

<p>When you leave:</p>
<ul>
  <li>You are immediately removed from the team's roster or staff list.</li>
  <li>Your personal profile data remains your own — it does not get deleted from your account.</li>
  <li>The coach or director sees your membership as ended. Any content you shared with the team (media, posts) remains accessible to the team unless you delete it from your own profile first.</li>
  <li>Your Agent X briefings and playbooks update automatically to reflect the removed team membership.</li>
</ul>

<p>If you are a coach or director and want to remove an athlete or staff member rather than leaving yourself, that is managed from the Roster or Staff section of team management.</p>
    `.trim(),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE H: Setting Up a Club or Travel Program
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'setting-up-a-club-or-travel-program',
    title: 'Setting Up a Club or Travel Program',
    excerpt:
      'NXT1 is built for multi-team programs — club organizations, travel programs, AAU programs, JUCOs, and college programs running multiple teams. Learn how to structure a multi-team program, assign coaches, manage sponsors, and use Agent X at the program level.',
    type: 'guide' as const,
    category: 'teams' as const,
    tags: [
      'club team',
      'travel program',
      'AAU',
      'multi-team',
      'director',
      'program setup',
      'sponsors',
      'agent x',
      'JUCO',
      'college program',
    ],
    targetUsers: ['director'] as const,
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
      { id: 'nxt1-for-multi-team-programs', title: 'NXT1 for Multi-Team Programs', level: 2 },
      { id: 'choosing-the-right-team-level', title: 'Choosing the Right Team Level', level: 2 },
      { id: 'building-your-program-umbrella', title: 'Building Your Program Umbrella', level: 2 },
      {
        id: 'assigning-coaches-across-teams',
        title: 'Assigning Coaches and Staff Across Teams',
        level: 2,
      },
      { id: 'sponsors', title: 'Managing Sponsors at the Program Level', level: 2 },
      { id: 'agent-x-for-directors', title: 'Agent X for Directors', level: 2 },
    ],
    seo: {
      metaTitle: 'Setting Up a Club or Travel Program on NXT1 | Director Guide',
      metaDescription:
        'How to set up a multi-team club, travel, or AAU program on NXT1. Covers team levels, program structure, coach assignments, sponsors, and Agent X for directors.',
      keywords: [
        'club program NXT1',
        'travel program setup',
        'AAU NXT1',
        'multi-team director',
        'sports program management',
      ],
    },
    content: `
<p>NXT1 is not just a tool for a single team and a single coach. It is architected for the way multi-team sports programs actually operate — an athletic director managing three varsity programs, a club basketball organization with five age-group teams, a JUCO with multiple sport programs all needing coordinated oversight.</p>

<p>The Director role is the foundation for this. If you are running more than one team or overseeing a program with multiple coaches, start here.</p>

<h2 id="nxt1-for-multi-team-programs">NXT1 for Multi-Team Programs</h2>

<p>As a Director, every team you create falls under your program umbrella. You see all of them from a single view, manage coaches across all of them, and receive Agent X briefings and playbooks that span the entire organization — not just a single team.</p>

<p>This structure works for:</p>
<ul>
  <li><strong>High school athletic departments</strong> — Multiple sport teams, multiple coaches, one Director with program-wide visibility</li>
  <li><strong>Club and AAU organizations</strong> — Multiple age groups (U13, U15, U17, U19) each as a separate team, all under the same org</li>
  <li><strong>Travel programs</strong> — Seasonal rosters that change year to year, multiple coaches, sponsor relationships at the org level</li>
  <li><strong>JUCOs and college programs</strong> — Varsity, JV, and club squads under the same athletic umbrella</li>
  <li><strong>Training academies and performance centers</strong> — Multiple sport-specific groups managed as teams</li>
</ul>

<h2 id="choosing-the-right-team-level">Choosing the Right Team Level</h2>

<p>When creating each team under your program, the <strong>Level</strong> field is important — it shapes how Agent X frames performance context, recruiting relevance, and communications for that team. Choose the level that most accurately reflects how that team competes:</p>

<ul>
  <li><strong>Youth</strong> — Recreational or developmental programs, typically under 13</li>
  <li><strong>Middle School</strong> — School-affiliated middle school programs</li>
  <li><strong>JV</strong> — Junior varsity school programs</li>
  <li><strong>Varsity</strong> — High school varsity programs — the primary recruiting-relevant tier</li>
  <li><strong>Club</strong> — Non-school-affiliated club teams competing in leagues or showcases</li>
  <li><strong>Travel</strong> — Tournament-focused travel teams, typically seasonal</li>
  <li><strong>College</strong> — NCAA, NAIA, NJCAA, or CCCAA programs</li>
  <li><strong>Semi-Pro</strong> — Independent or regional semi-professional leagues</li>
  <li><strong>Professional</strong> — Professional league programs</li>
</ul>

<p>For a club organization with multiple age groups, each age group should be its own team with the <strong>Club</strong> level selected and the appropriate season or graduation year in the Season/Year field. This keeps rosters clean and lets Agent X generate age-appropriate and competition-level-appropriate outputs for each group.</p>

<h2 id="building-your-program-umbrella">Building Your Program Umbrella</h2>

<p>Create each team from the <strong>Teams</strong> section — every team you create as a Director is automatically grouped under your program. You can manage all of them from your Director dashboard without switching accounts.</p>

<p>Build out each team's profile completely before adding athletes and coaches. The sections that matter most for Agent X's program-level intelligence:</p>

<ul>
  <li><strong>Team Info</strong> — Name, level, branding, contact details. Agent X uses this to differentiate between teams when generating program-wide communications and briefings.</li>
  <li><strong>Schedule</strong> — Each team's full season schedule. Agent X uses cross-team schedule data to surface conflicts, coordinate program-level announcements around game weeks, and track season progress across the org.</li>
  <li><strong>Connected Accounts</strong> — Link MaxPreps, Hudl, and other sources for each team individually. This gives Agent X live data at the team level, which it aggregates into your Director briefings.</li>
  <li><strong>Staff</strong> — Assign the correct coaches and staff to each team. Agent X uses staff structure to route team-specific and program-wide communications correctly.</li>
</ul>

<h2 id="assigning-coaches-across-teams">Assigning Coaches and Staff Across Teams</h2>

<p>Coaches on NXT1 are assigned to teams — not to programs. When you add a coach to a specific team, they receive full management permissions for that team and that team only. They do not automatically have access to other teams in your program.</p>

<p>A single coach can be on multiple teams simultaneously. A strength and conditioning coach who works with your varsity football and varsity basketball programs can be added to both. Each team membership is tracked independently — their briefings and playbooks from Agent X aggregate across all teams they are active on.</p>

<p>To add a coach or staff member to a team:</p>
<ol>
  <li>Open the team from your Director dashboard.</li>
  <li>Go to the <strong>Staff</strong> section.</li>
  <li>Add the staff member by email or NXT1 handle, assign their role, and send the invite. They receive a link to join that specific team.</li>
</ol>

<p>As Director, you retain override access to every team in your program regardless of whether you are listed as a staff member on each individual team.</p>

<h2 id="sponsors">Managing Sponsors at the Program Level</h2>

<p>Each team has a <strong>Sponsors</strong> section where you can log the businesses and partners that support your program. This is not just an organizational record — Agent X references sponsor data when generating program communications, acknowledgment posts, and partnership outreach.</p>

<p>Sponsor tiers available:</p>
<ul>
  <li><strong>Platinum</strong> — Lead program sponsor, highest visibility</li>
  <li><strong>Gold</strong> — Major sponsor</li>
  <li><strong>Silver</strong> — Mid-tier sponsor</li>
  <li><strong>Bronze</strong> — Contributing sponsor</li>
  <li><strong>Supporter</strong> — Community-level supporter</li>
  <li><strong>Partner</strong> — Strategic or in-kind partner</li>
</ul>

<p>Fill in each sponsor's name, tier, contact information, and any logo or website. When you ask Agent X to draft a sponsor acknowledgment post or a program newsletter, it pulls from this data to reference partners correctly by name and tier without you needing to specify them manually each time.</p>

<h2 id="agent-x-for-directors">Agent X for Directors</h2>

<p>As a Director with multiple teams set up and connected, Agent X operates at a fundamentally different level than it does for a single-team coach. Your daily briefing and weekly playbook aggregate across every team in your program — surfacing the signals that matter most at the org level rather than within a single roster.</p>

<p>Directory-level Agent X operations you can run directly from the command center:</p>

<ul>
  <li><em>"Run a roster health audit across all my teams — flag any team that has gaps at key positions heading into next season."</em></li>
  <li><em>"Generate a program-wide end-of-season summary covering all five teams — wins, losses, standout athletes, and what to prioritize in the off-season for each."</em></li>
  <li><em>"Draft an announcement congratulating our varsity girls soccer team on winning the regional championship. Appropriate for both social media and an email to our full program list. Present for my approval before anything goes out."</em></li>
  <li><em>"Find which of my teams has the lowest athlete engagement on the platform — who hasn't logged in, whose profiles are incomplete, and what's the fastest fix."</em></li>
  <li><em>"Check each team's connected accounts — flag any team that hasn't synced stats in the last two weeks."</em></li>
</ul>

<p>The more complete your program data — team profiles, schedules, connected accounts, full rosters, and staff — the more precise and actionable these outputs become. Set the program up right once and Agent X keeps it running.</p>
    `.trim(),
  },
];

export const HELP_CENTER_TROUBLESHOOTING_ARTICLES = [
  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE B: Can't Log In or Recover Your Account
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'cant-log-in-or-recover-your-account',
    title: "Can't Log In or Recover Your Account",
    excerpt:
      "Locked out, getting an 'email already in use' error, or never received your verification email? This guide walks through every common login and account recovery scenario on NXT1 — including what to do if you no longer have access to the email address on file.",
    type: 'faq' as const,
    category: 'troubleshooting' as const,
    tags: [
      'login',
      'account recovery',
      'forgot password',
      'verification email',
      'sign in',
      'locked out',
      'email already in use',
      'suspicious activity',
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
      { id: 'email-already-in-use', title: '"Email Already in Use" Error', level: 2 },
      { id: 'forgot-password', title: 'Forgot Password', level: 2 },
      { id: 'verification-email', title: 'Verification Email Not Received', level: 2 },
      { id: 'lost-email-access', title: 'Lost Access to Your Email Address', level: 2 },
      { id: 'suspicious-activity', title: 'Suspicious Activity on Your Account', level: 2 },
      { id: 'app-crashes-on-launch', title: 'App Crashes on Launch', level: 2 },
    ],
    seo: {
      metaTitle: "Can't Log In or Recover Your NXT1 Account — Login Troubleshooting",
      metaDescription:
        "Fix NXT1 login issues: 'email already in use,' forgot password, missing verification emails, lost email access, suspicious activity, and app crashes on launch.",
      keywords: [
        'NXT1 login',
        'account recovery',
        'forgot password NXT1',
        'NXT1 verification email',
        'NXT1 locked out',
      ],
    },
    content: `
<h2 id="email-already-in-use">"Email Already in Use" Error</h2>

<p>If you see this message on the sign-up screen, an NXT1 account already exists for that email address. You do not need to create a new account — you already have one.</p>

<p><strong>What to do:</strong></p>
<ol>
  <li>Tap <strong>Sign In</strong> instead of Sign Up.</li>
  <li>Enter the same email address.</li>
  <li>If you don't remember the password, tap <strong>Forgot Password</strong> on the sign-in screen to receive a reset link.</li>
</ol>

<p>If you are certain you have never signed up before, the email may have been used to create an account via a social login (Google or Apple). Try signing in with Google or Apple using that email address instead of entering a password.</p>

<h2 id="forgot-password">Forgot Password</h2>

<p>If you cannot remember your password:</p>
<ol>
  <li>On the sign-in screen, tap <strong>Forgot Password</strong>.</li>
  <li>Enter the email address associated with your account.</li>
  <li>Check your inbox for a password reset email from NXT1. The link expires after <strong>24 hours</strong>.</li>
  <li>Tap the link in the email, set a new password, and sign in.</li>
</ol>

<p>If the reset email does not arrive within 5 minutes, check your spam or junk folder. Emails from <em>noreply@nxt1.app</em> occasionally land there depending on your email provider's filters.</p>

<h2 id="verification-email">Verification Email Not Received</h2>

<p>After signing up, NXT1 sends a verification email to confirm your address. If it hasn't arrived:</p>

<ul>
  <li><strong>Check spam/junk.</strong> Verification emails are the most common type to be filtered.</li>
  <li><strong>Wait 5 minutes.</strong> Email delivery can be delayed during high-volume periods — do not request a resend immediately.</li>
  <li><strong>Confirm the correct email.</strong> Make sure you are checking the inbox for the exact address you used during signup. A typo at signup (e.g., <em>gmial.com</em> instead of <em>gmail.com</em>) means the email went to a non-existent address.</li>
  <li><strong>Resend the verification.</strong> From the sign-in screen, tap <strong>Resend Verification Email</strong>. If you are already signed in, go to Settings → Account → Verify Email.</li>
</ul>

<h2 id="lost-email-access">Lost Access to Your Email Address</h2>

<p>If you no longer have access to the email address you used to sign up — for example, a school email that has been deactivated — you cannot reset your password through the standard flow.</p>

<p><strong>What to do:</strong></p>
<ol>
  <li>Contact NXT1 support through <strong>Help Center → Contact Us</strong>.</li>
  <li>Include your account email address, your full name, and your NXT1 username (if known).</li>
  <li>Support will ask you to verify your identity before updating the email on file.</li>
</ol>

<p>Identity verification typically requires confirming details only the account owner would know. Support response time is within 1 business day.</p>

<h2 id="suspicious-activity">Suspicious Activity on Your Account</h2>

<p>If you believe someone else has access to your account — unexpected posts, messages you didn't send, or a password you didn't change — act immediately:</p>

<ol>
  <li>Go to <strong>Settings → Security → Sign Out All Devices</strong>. This terminates all active sessions everywhere your account is signed in.</li>
  <li>Change your password immediately using <strong>Forgot Password</strong> from the sign-in screen.</li>
  <li>Review your connected email and social accounts under Settings → Connected Accounts and revoke any you don't recognize.</li>
  <li>Contact NXT1 support through Help Center → Contact Us to report the incident. Include the approximate date you first noticed the activity.</li>
</ol>

<h2 id="app-crashes-on-launch">App Crashes on Launch</h2>

<p>If the NXT1 app crashes immediately when you open it:</p>

<ol>
  <li><strong>Check for an update.</strong> Open the App Store (iOS) or Google Play (Android), search for NXT1, and install any available update. Crashes on launch are most often caused by running an outdated app version after a server-side update.</li>
  <li><strong>Force quit and relaunch.</strong> On iOS, swipe up from the home bar and swipe away the NXT1 card. On Android, tap the recent apps button and swipe it away. Then reopen the app.</li>
  <li><strong>Uninstall and reinstall.</strong> If the crash persists after updating, uninstall NXT1 and reinstall it from the App Store or Google Play. Your account data is stored in the cloud — everything will reappear after you sign back in. No data is lost.</li>
</ol>

<p>If the app still crashes after reinstalling, contact support via Help Center → Contact Us and include your device model and OS version.</p>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE E: Team Join Issues
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'team-join-issues',
    title: 'Team Join Issues',
    excerpt:
      "Having trouble joining a team on NXT1? Whether the invite link isn't working, the team code keeps throwing an error, or you joined but can't see any team content, this guide covers every scenario — including pending approval states and how to resolve them.",
    type: 'faq' as const,
    category: 'troubleshooting' as const,
    tags: [
      'join team',
      'team code',
      'invite link',
      'team access',
      'pending approval',
      'team join error',
      "can't see team",
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
      { id: 'invite-link-not-working', title: 'Invite Link Not Working', level: 2 },
      { id: 'team-code-errors', title: 'Team Code Errors', level: 2 },
      { id: 'joined-but-cant-see-content', title: "Joined But Can't See Team Content", level: 2 },
    ],
    seo: {
      metaTitle: 'Team Join Issues on NXT1 — Invite Link, Team Code, and Access Troubleshooting',
      metaDescription:
        "Fix NXT1 team join problems: invite link not working, team code errors, joined but can't see content, and pending approval states.",
      keywords: [
        'NXT1 join team',
        'team code not working',
        'NXT1 invite link',
        'team access NXT1',
        'pending team approval NXT1',
      ],
    },
    content: `
<h2 id="invite-link-not-working">Invite Link Not Working</h2>

<p>A coach or director sent you an invite link but tapping it isn't placing you on the team. Here are the most common causes:</p>

<p><strong>You are not signed in.</strong> The invite link can only attach you to a team if you are already signed in to NXT1 when you tap it. If you tap the link before signing in, you will be taken to the sign-up screen. Complete sign-up or sign in first, then tap the link again — or ask your coach to resend it so you can tap it fresh while signed in.</p>

<p><strong>The link has expired.</strong> Invite links have an expiration date set by the coach. If the link is expired, tapping it will show an error. Ask your coach to resend the invite from the <strong>Invite</strong> section in their sidenav. The new link will be valid immediately.</p>

<p><strong>You are already a member.</strong> If you were previously on the team (even if you left), the link will not re-add you. Check your Teams list — the team may already be showing there. If it isn't but you're getting a "you are already a member" message, sign out and back in to refresh your membership state.</p>

<h2 id="team-code-errors">Team Code Errors</h2>

<p>If your coach gave you a team code and you are entering it manually:</p>

<p><strong>"Invalid code" error:</strong></p>
<ul>
  <li>Codes are exactly <strong>6 characters</strong> — double-check that you are not including a leading or trailing space, especially when pasting from a message.</li>
  <li>Codes are <strong>case-insensitive</strong>, so capitalization does not matter.</li>
  <li>The code may have been regenerated by your coach since you received it. Ask them to go to Team Settings → Share / Invite and confirm the current active code, then share it again.</li>
</ul>

<p><strong>"Already a member" error:</strong></p>
<ul>
  <li>Check your Teams list — you may have joined this team previously. If the team appears there, you do not need to join again.</li>
  <li>If the team does not appear in your list despite the error, sign out and back in to refresh your account state.</li>
</ul>

<p><strong>"Team is not available" or no result:</strong></p>
<ul>
  <li>The team may have been archived or deactivated by the coach. An archived team's code is no longer active. Contact your coach to confirm the team is still active on NXT1.</li>
</ul>

<h2 id="joined-but-cant-see-content">Joined But Can't See Team Content</h2>

<p>You successfully joined a team but the roster, schedule, feed, or other team content is missing or not loading. This happens in two scenarios:</p>

<p><strong>Pending coach approval.</strong> Some teams are configured to require a coach to approve new members before granting full access. If your join is pending approval, you will see a "pending" status on the team card in your Teams list. You will receive a notification once the coach approves your request. If it has been more than 24 hours, reach out to your coach directly to let them know to check their pending approvals.</p>

<p><strong>Display sync issue.</strong> Occasionally, the app's local state doesn't refresh immediately after a successful join. Try the following in order:</p>
<ol>
  <li>Navigate away from the team page and return to it.</li>
  <li>Sign out of NXT1 and sign back in. This forces a full account state refresh and resolves most display issues after joining.</li>
  <li>If content is still missing after signing back in, contact support via Help Center → Contact Us and include the team name and your account email.</li>
</ol>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE H: Payment Failed or Wallet Won't Load
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'payment-failed-or-wallet-wont-load',
    title: "Payment Failed or Wallet Won't Load",
    excerpt:
      'Card declined when adding funds, auto top-up not triggering, or your Balance AI wallet showing zero after a successful payment? This guide covers every common payment and wallet issue on NXT1 — including what to do when your org wallet runs dry and how to find your transaction history.',
    type: 'faq' as const,
    category: 'troubleshooting' as const,
    tags: [
      'payment failed',
      'card declined',
      'wallet',
      'Balance AI',
      'auto top-up',
      'transaction history',
      'org wallet',
      'billing',
      'payment method',
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
      { id: 'card-declined', title: 'Card Declined When Adding Funds', level: 2 },
      { id: 'auto-top-up-not-triggering', title: 'Auto Top-Up Not Triggering', level: 2 },
      {
        id: 'balance-shows-zero',
        title: 'Balance Shows Zero After a Successful Payment',
        level: 2,
      },
      {
        id: 'org-wallet-empty',
        title: "Org Wallet Empty — Members Can't Run Operations",
        level: 2,
      },
      {
        id: 'transaction-history',
        title: 'How to View Transaction History and Download Receipts',
        level: 2,
      },
    ],
    seo: {
      metaTitle: "Payment Failed or Wallet Won't Load — NXT1 Billing Troubleshooting",
      metaDescription:
        'Fix NXT1 payment issues: card declined, auto top-up not working, balance showing zero after payment, org wallet empty, and how to find receipts and transaction history.',
      keywords: [
        'NXT1 payment failed',
        'NXT1 card declined',
        'Balance AI wallet',
        'NXT1 auto top-up not working',
        'NXT1 transaction history',
      ],
    },
    content: `
<h2 id="card-declined">Card Declined When Adding Funds</h2>

<p>NXT1 processes credit and debit card payments via Stripe. If your card is declined when trying to add funds to your Balance AI wallet, the most common cause is an automatic fraud block placed by your bank.</p>

<p>Many banks flag charges from AI platform services as unusual — especially on first use or for amounts they haven't seen from you before. The block happens at the bank's end, not NXT1's. Your card is not actually charged when a payment fails.</p>

<p><strong>Steps to resolve a declined card:</strong></p>
<ol>
  <li><strong>Check your bank app or SMS alerts.</strong> Most banks send an instant notification when a charge is blocked. Some offer a one-tap "approve this charge" option directly in the notification or banking app.</li>
  <li><strong>Call your bank.</strong> Tell them you are trying to make a purchase from NXT1 (a sports platform) and ask them to whitelist or approve the charge. Once cleared, retry the payment.</li>
  <li><strong>Try an alternative payment method.</strong> NXT1 also supports PayPal, Apple Pay (iOS), and Google Pay (Android). These methods often clear bank fraud filters more easily. To add one, go to <strong>Settings → Billing & Usage → Payment Methods → Add Method</strong>.</li>
</ol>

<p>If your card continues to decline after confirming with your bank, contact NXT1 support via Help Center → Contact Us with your account email and the last 4 digits of the card.</p>

<h2 id="auto-top-up-not-triggering">Auto Top-Up Not Triggering</h2>

<p>Auto Top-Up is configured to reload your wallet automatically when your balance drops below a threshold. If it is not triggering when expected:</p>

<ul>
  <li><strong>Confirm the threshold and reload amount.</strong> Go to <strong>Settings → Billing & Usage → Auto Top-Up</strong> and verify that the feature is enabled and the threshold is set correctly. If your balance dropped to, say, $3.00 but your threshold is set to $2.00, the top-up will not fire until the balance drops below $2.00.</li>
  <li><strong>Check your default payment method.</strong> Auto Top-Up charges your default payment method. If that card has expired or been removed, the top-up attempt will fail silently. Go to Billing & Usage → Payment Methods and confirm a valid default method is on file.</li>
  <li><strong>Re-save your payment method.</strong> If your card details changed (new expiry, reissued card number), remove the old card and add the updated one. Then re-enable Auto Top-Up with the new method as the default.</li>
</ul>

<h2 id="balance-shows-zero">Balance Shows Zero After a Successful Payment</h2>

<p>If you added funds and received a confirmation but your wallet balance still shows zero or the previous amount:</p>

<ul>
  <li><strong>Wait 1–2 minutes.</strong> Wallet balance updates require the payment to clear through Stripe and reflect back to NXT1's servers. On most payment methods this is instantaneous, but PayPal and some bank cards can take up to 2 minutes to confirm.</li>
  <li><strong>Pull to refresh</strong> on the Billing & Usage screen. The balance display may be showing a cached value.</li>
  <li><strong>Check your transaction history</strong> (see below). If the payment appears in the transaction log with a status of <em>Completed</em>, the funds are in your wallet. Sign out and back in to force a full account state refresh.</li>
  <li><strong>Check for pending holds.</strong> Funds are not lost — they may be reserved as pending holds for in-flight Agent X operations. Pending holds are shown in the Overview section of your Usage Dashboard. They settle to actual cost when each operation completes.</li>
</ul>

<h2 id="org-wallet-empty">Org Wallet Empty — Members Can't Run Operations</h2>

<p>If members of your organization are seeing a <em>"Your team is out of funds"</em> notice, the shared organization wallet has run out of funds. Paid Agent X operations are automatically paused — no debt accrues and free platform features remain fully accessible.</p>

<p><strong>Only an org admin (Director or designated admin) can resolve this.</strong></p>

<p><strong>Steps for the org admin:</strong></p>
<ol>
  <li>Go to <strong>Settings → Billing & Usage</strong>.</li>
  <li>Tap <strong>Add Funds</strong> to load the org wallet. Choose an amount sufficient to cover your team's expected usage until the next planned top-up.</li>
  <li>Optionally, enable <strong>Auto Top-Up</strong> for the org wallet to prevent future interruptions.</li>
  <li>Once the balance is restored, members can immediately resume running operations — no restart or re-login required.</li>
</ol>

<p>If you need to review which teams are consuming the most budget, the <strong>Usage Dashboard</strong> (Billing & Usage in the sidenav) shows a day-by-team-by-member breakdown under the org admin view.</p>

<h2 id="transaction-history">How to View Transaction History and Download Receipts</h2>

<p>Every wallet top-up, charge, and refund is logged in your transaction history:</p>

<ol>
  <li>Open the sidenav and tap <strong>Billing & Usage</strong>.</li>
  <li>Scroll down to the <strong>Payment History</strong> section.</li>
  <li>Each row shows the transaction ID, amount, payment method used (e.g., "Mastercard ending in 9639"), date, and status (Pending / Processing / Completed / Failed / Refunded).</li>
  <li>Tap any transaction to expand it. From there you can download a <strong>receipt</strong> (simple payment confirmation) or a formatted <strong>invoice</strong> (includes billing address and line items — suitable for expense reporting).</li>
</ol>

<p>If a transaction shows a <em>Failed</em> status, no funds were taken from your payment method. If it shows <em>Completed</em> but the balance has not updated, follow the steps in the section above.</p>
`,
  },
];

export const HELP_CENTER_AGENT_X_ARTICLES = [
  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE 1: How Agent X Works
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'how-agent-x-works',
    title: 'How Agent X Works — Operations, Status, and What to Expect',
    excerpt:
      'Agent X is not a chatbot. It is an autonomous agent that executes multi-step operations in the background. Learn how the operation pipeline works, what each status means, and how the approval gate keeps you in control.',
    type: 'article' as const,
    category: 'agent-x' as const,
    tags: [
      'agent x',
      'operations',
      'status',
      'background operations',
      'approval',
      'pipeline',
      'how it works',
    ],
    targetUsers: ['all'] as const,
    readingTimeMinutes: 5,
    isFeatured: true,
    isNew: true,
    isPublished: true,
    publishedAt: TODAY,
    updatedAt: TODAY,
    viewCount: 0,
    helpfulCount: 0,
    notHelpfulCount: 0,
    tableOfContents: [
      { id: 'agent-x-is-not-a-chatbot', title: 'Agent X Is Not a Chatbot', level: 2 },
      { id: 'the-operation-pipeline', title: 'The Operation Pipeline', level: 2 },
      { id: 'operation-status-lifecycle', title: 'Operation Status Lifecycle', level: 2 },
      { id: 'background-operations', title: 'Background Operations', level: 2 },
      { id: 'the-approval-gate', title: 'The Approval Gate', level: 2 },
      { id: 'when-an-operation-fails', title: 'When an Operation Fails', level: 2 },
    ],
    seo: {
      metaTitle: 'How Agent X Works — NXT1 Operation Pipeline, Status, and Approval Gate',
      metaDescription:
        'Learn how Agent X processes requests, what each operation status means, how background operations work, and how the approval gate keeps you in control.',
      keywords: [
        'Agent X',
        'how it works',
        'operations',
        'operation status',
        'background operations',
        'NXT1 AI',
      ],
    },
    content: `
<h2 id="agent-x-is-not-a-chatbot">Agent X Is Not a Chatbot</h2>

<p>Most AI tools you have used before are reactive: you type a message, they generate a reply, the interaction ends. Agent X is fundamentally different. It is an <strong>autonomous agent</strong> — it breaks your request into sub-tasks, assigns those sub-tasks to specialist coordinators, executes them in parallel or in sequence, writes results back to your profile, and notifies you when the work is done.</p>

<p>This means Agent X does not just answer your question — it acts on your behalf. When you tell Agent X to draft a recruiting email and send it to a list of programs, it researches each school, personalizes every message, presents them to you for approval, and (after you approve) sends them. It does not hand you a template and walk away.</p>

<p>Understanding this model changes how you use the platform. You are not having a conversation. You are issuing commands to an intelligent coordinator that executes them.</p>

<h2 id="the-operation-pipeline">The Operation Pipeline</h2>

<p>Every request — whether you tap a quick task or type freely in chat — goes through the same five-layer execution pipeline:</p>

<ol>
  <li>
    <strong>The Chief of Staff reads your full intent.</strong> This is the planning layer. It breaks your request into the smallest independent sub-tasks and determines which specialist coordinators to assign.
  </li>
  <li>
    <strong>Sub-tasks are assigned to specialist coordinators.</strong> Agent X has five domain coordinators:
    <ul>
      <li><strong>Recruiting Coordinator</strong> — outreach emails, college target lists, transfer portal research, recruiting timelines</li>
      <li><strong>Performance Coordinator</strong> — film analysis, scout reports, Intel Reports, athletic benchmarking, progression tracking</li>
      <li><strong>Brand &amp; Media Coordinator</strong> — graphic generation, highlight reel editing, social media content, team branding assets</li>
      <li><strong>Data Coordinator</strong> — stat imports from MaxPreps, Hudl, and other connected sources; roster data sync</li>
      <li><strong>Compliance Coordinator</strong> — NCAA, NAIA, and NJCAA rule checks; eligibility validation; violation flags</li>
    </ul>
  </li>
  <li>
    <strong>Coordinators execute in parallel when possible.</strong> If your request has independent parts — for example, researching three schools simultaneously — Agent X runs them at the same time. If one step depends on another (analyzing your highlight tape before writing a personalized email about it), Agent X sequences them correctly automatically.
  </li>
  <li>
    <strong>Long operations run in the background.</strong> You do not have to wait. Navigate away, close the app, come back later — Agent X keeps working.
  </li>
  <li>
    <strong>Results are delivered to the right place.</strong> Completed operations appear in your Activity feed as a notification. Results are written to the relevant section of your profile, team, or messages.
  </li>
</ol>

<h2 id="operation-status-lifecycle">Operation Status Lifecycle</h2>

<p>Every operation has a live status visible on your command center under <strong>Active Operations</strong>. Here is what each status means and what is actually happening behind the scenes:</p>

<ul>
  <li>
    <strong>Queued</strong> — Your request has been received and is waiting for a coordinator to pick it up. This is typically sub-second for most operations.
  </li>
  <li>
    <strong>Thinking</strong> — The Chief of Staff is reading your request, planning the sub-task breakdown, and assigning coordinators. This is where Agent X figures out exactly how to execute your intent.
  </li>
  <li>
    <strong>Acting</strong> — Coordinators are actively running. Stats are being imported, emails are being drafted, graphics are being generated, film is being analyzed. This is the main execution phase and is where most time is spent for complex operations.
  </li>
  <li>
    <strong>Awaiting Input</strong> — Agent X has hit a decision point where it needs more information from you before it can continue. A prompt appears in the chat asking a specific question. Answer it and the operation resumes immediately. Example: "I found 12 matching programs — do you want me to focus on D1 only or include D2?"
  </li>
  <li>
    <strong>Awaiting Approval</strong> — Agent X is about to take an action that cannot be undone — sending an email, publishing a post, or making a change to your profile. It has paused and is waiting for your explicit sign-off. See <em>The Approval Gate</em> section below.
  </li>
  <li>
    <strong>Streaming Result</strong> — The operation has finished executing and Agent X is writing the result back. You may see it appear in real time in the chat or in the destination section.
  </li>
  <li>
    <strong>Completed</strong> — Done. The result is available. A notification has been sent to your Activity feed.
  </li>
  <li>
    <strong>Failed</strong> — The operation did not complete. A reason is shown in the operation detail. You can retry from the same screen — see <em>When an Operation Fails</em> below.
  </li>
  <li>
    <strong>Cancelled</strong> — You manually stopped the operation before it finished.
  </li>
</ul>

<h2 id="background-operations">Background Operations</h2>

<p>When an operation takes more than a few seconds to complete, it automatically moves to the background. This is intentional — NXT1 is designed so Agent X works while you do other things.</p>

<p>You do not need to stay on the Agent X screen. You can:</p>
<ul>
  <li>Navigate to any other section of the app</li>
  <li>Close the app entirely and come back later</li>
  <li>Start a second operation while the first is still running</li>
</ul>

<p>When an operation completes, two things happen:</p>
<ol>
  <li>A notification arrives in your <strong>Activity</strong> feed telling you it is done.</li>
  <li>The result is written to the correct destination — your profile Intel tab, your media library, your messages, or the chat thread where you issued the command.</li>
</ol>

<p>You can check the status of any active operation at any time by opening Agent X and scrolling to <strong>Active Operations</strong> on the command center. Each operation shows its current status, what coordinator is running, and an estimated time remaining for longer tasks.</p>

<h2 id="the-approval-gate">The Approval Gate</h2>

<p>Agent X will <strong>never</strong> send an email, publish a post, make a public change to your profile, or take any other irreversible action without your explicit approval first.</p>

<p>When Agent X reaches a step that requires sign-off, the operation pauses and enters <strong>Awaiting Approval</strong> status. A review card appears in your chat showing:</p>

<ul>
  <li>Exactly what Agent X is about to do</li>
  <li>The full content (draft email, post text, profile edit) for you to review</li>
  <li>An <strong>Edit</strong> option to modify anything before it goes out</li>
  <li><strong>Approve</strong> and <strong>Reject</strong> buttons</li>
</ul>

<p>Tapping <strong>Approve</strong> sends the operation forward. Tapping <strong>Reject</strong> cancels that specific step — you can then give Agent X revised instructions in the chat and it will re-draft.</p>

<p>If you have explicitly enabled <strong>Autonomous Send</strong> for a scheduled action (for example, a weekly coach outreach automation), Agent X will skip the approval step for that specific recurring task only. Everything else always requires approval.</p>

<h2 id="when-an-operation-fails">When an Operation Fails</h2>

<p>Occasionally an operation will fail — a network issue, a rate limit on an external platform, or a request that was ambiguous enough that Agent X could not resolve it confidently.</p>

<p>When this happens:</p>
<ol>
  <li>Open Agent X and find the failed operation in <strong>Active Operations</strong>.</li>
  <li>Tap the operation to see the failure reason.</li>
  <li>Tap <strong>Retry</strong> to run it again as-is, or reply in the chat with additional context before retrying.</li>
</ol>

<p>The most common reason for a failed operation is insufficient data — for example, asking Agent X to generate an Intel Report when no stats or connected sources are on your profile. Adding the missing data and retrying will almost always resolve it.</p>

<p>If an operation continues to fail after two retries, tap <strong>Get Help</strong> in the operation detail to open a pre-filled support ticket with the operation log attached.</p>
    `.trim(),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE 2: Daily Briefing and Weekly Playbook
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'daily-briefing-and-weekly-playbook',
    title: 'Your Daily Briefing and Weekly Playbook',
    excerpt:
      'Agent X prepares a personalized morning briefing and a weekly action playbook automatically — no prompting required. Learn what they contain, how they are generated, and how to use them to get maximum value from the platform in five minutes a day.',
    type: 'article' as const,
    category: 'agent-x' as const,
    tags: [
      'daily briefing',
      'weekly playbook',
      'agent x',
      'proactive intelligence',
      'scheduled actions',
      'morning briefing',
      'command center',
    ],
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
    tableOfContents: [
      { id: 'the-daily-briefing', title: 'The Daily Briefing', level: 2 },
      { id: 'what-your-briefing-contains', title: 'What Your Briefing Contains', level: 2 },
      { id: 'how-briefings-are-generated', title: 'How Briefings Are Generated', level: 2 },
      { id: 'the-weekly-playbook', title: 'The Weekly Playbook', level: 2 },
      { id: 'how-playbooks-update', title: 'How Playbooks Update Mid-Week', level: 2 },
      {
        id: 'the-five-minute-morning-workflow',
        title: 'The Five-Minute Morning Workflow',
        level: 2,
      },
    ],
    seo: {
      metaTitle: 'Daily Briefing and Weekly Playbook — NXT1 Agent X Proactive Intelligence',
      metaDescription:
        'Learn how Agent X prepares your personalized daily briefing and weekly playbook, what they contain by role, and how to use them effectively.',
      keywords: [
        'Agent X briefing',
        'daily briefing',
        'weekly playbook',
        'NXT1',
        'proactive intelligence',
        'command center',
      ],
    },
    content: `
<p>Most platforms only respond when you ask. NXT1 operates differently — Agent X monitors your profile, your team, your sport, and your goals continuously, and surfaces intelligence proactively every morning before you even open the app.</p>

<p>This happens through two mechanisms: the <strong>Daily Briefing</strong> and the <strong>Weekly Playbook</strong>. Together, they are the difference between a platform you have to manage and a platform that manages itself.</p>

<h2 id="the-daily-briefing">The Daily Briefing</h2>

<p>Every morning, Agent X prepares a personalized briefing specific to your current situation. It appears at the top of your command center when you open Agent X — no prompting required, no settings to configure. It is simply there, ready.</p>

<p>The briefing is not a generic newsletter. It is generated fresh each morning from real activity data on your account: who viewed your profile, what your team did yesterday, what is on your schedule today, and what opportunities Agent X has identified that you should act on now.</p>

<h2 id="what-your-briefing-contains">What Your Briefing Contains</h2>

<p>The content of your briefing is tailored to your role.</p>

<p><strong>Athletes</strong> receive briefings focused on recruiting momentum and profile performance:</p>
<ul>
  <li>Profile views from coaches and scouts in the past 24 hours</li>
  <li>New recruiting interest or messages from programs</li>
  <li>Upcoming games, practices, or evaluation events on your schedule</li>
  <li>Agent X's recommended action for the day — often a quick command you can execute in one tap</li>
  <li>Alerts on time-sensitive recruiting windows (early signing period, camp registration deadlines, etc.)</li>
</ul>

<p><strong>Coaches</strong> receive briefings focused on team operations and program health:</p>
<ul>
  <li>Roster activity — new athlete joins, profile updates, or engagement drops from players</li>
  <li>Upcoming games, practices, and team events</li>
  <li>Agent X's recommended team management action for the day</li>
  <li>New prospects in your scouting pipeline who have updated their profiles</li>
  <li>Any pending approvals waiting for your sign-off (scheduled emails, drafted posts)</li>
</ul>

<p><strong>Directors</strong> receive briefings focused on program-wide visibility:</p>
<ul>
  <li>Activity summary across all teams — new athletes, schedule changes, flagged issues</li>
  <li>Wallet and budget status — alerts if any team is approaching its monthly sub-limit</li>
  <li>Agent X's recommended program-level action for the day</li>
  <li>High-level recruiting pipeline signals across the org</li>
</ul>

<h2 id="how-briefings-are-generated">How Briefings Are Generated</h2>

<p>Agent X generates each briefing from live platform data — it is not pre-written content. This means two things:</p>

<p><strong>Briefing quality scales with profile completeness.</strong> The more data on your profile — connected sources, stats, schedule, roster, recruiting activity — the more specific and actionable your briefing becomes. A sparse profile produces a sparse briefing. A complete profile produces intelligence.</p>

<p><strong>Briefings are never generic.</strong> Agent X will not surface a tip about setting up recruiting emails if you already have an active outreach campaign running. It reads your current state and fills the actual gaps.</p>

<p>If your briefing consistently feels thin or irrelevant, the fix is usually one of two things: complete more of your profile, or connect your external sources (MaxPreps, Hudl, etc.) so Agent X has real data to analyze.</p>

<h2 id="the-weekly-playbook">The Weekly Playbook</h2>

<p>Every Monday morning, alongside your daily briefing, Agent X publishes your <strong>Weekly Playbook</strong> — a structured set of prioritized action items for the week ahead. The playbook is not a generic to-do list. Each item is specific to your current goals, your role, and where you are in your sports season or recruiting cycle.</p>

<p>Every playbook item has an <strong>action button</strong>. Tapping it immediately executes that operation via Agent X — no retyping, no setup. The playbook is pre-loaded with context so the operation runs against your actual data the moment you tap.</p>

<p>Example playbook items for an athlete in junior year:</p>
<ul>
  <li><em>Send follow-up emails to 3 programs you visited last month</em> — tap to draft and review</li>
  <li><em>Your MaxPreps stats are 2 games behind — sync them now</em> — tap to import</li>
  <li><em>Update your Intel Report — it was last generated 28 days ago</em> — tap to regenerate</li>
  <li><em>Add your SAT score to your academics section — it is missing from your profile</em> — tap to open edit profile at the right section</li>
</ul>

<p>Example playbook items for a head coach mid-season:</p>
<ul>
  <li><em>Your depth chart has not been updated in 3 weeks — refresh it now</em> — tap to run</li>
  <li><em>4 athletes on your roster have incomplete profiles — send them a prompt</em> — tap to draft and review</li>
  <li><em>Generate a performance summary for your last 3 games</em> — tap to run</li>
</ul>

<h2 id="how-playbooks-update">How Playbooks Update Mid-Week</h2>

<p>Playbooks are not static once published. Agent X monitors your activity throughout the week and adjusts:</p>

<ul>
  <li>Completed items are marked done and removed</li>
  <li>New high-priority items surface if something changes — a coach replies to your email, a prospect updates their profile, an upcoming deadline appears on the recruiting calendar</li>
  <li>Items that remain incomplete carry forward into next week's playbook with elevated priority</li>
</ul>

<p>The goal is to make sure nothing time-sensitive falls through the cracks. Agent X tracks it so you do not have to.</p>

<h2 id="the-five-minute-morning-workflow">The Five-Minute Morning Workflow</h2>

<p>The intended use pattern for the briefing and playbook is deliberately simple:</p>

<ol>
  <li>Open Agent X every morning. Read your briefing — 60 seconds.</li>
  <li>Scan your playbook. Pick 1–2 action items and tap to execute them — 2 minutes.</li>
  <li>Let Agent X run those operations in the background. Get on with your day.</li>
</ol>

<p>That is five minutes of intentional platform use that Agent X turns into hours of work executed on your behalf. Recruiting emails get sent. Intel Reports get updated. Rosters get refreshed. Stats get synced.</p>

<p>The more consistently you engage with your briefing and playbook, the more accurately Agent X calibrates what matters to you — and the more useful both become over time.</p>
    `.trim(),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE 3: How to Talk to Agent X
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'how-to-talk-to-agent-x',
    title: 'How to Talk to Agent X — Writing Effective Commands',
    excerpt:
      'Agent X understands plain language — but the specificity and context you provide determines the quality of what it produces. Learn the five principles of effective commands, see 10 real examples by role, and discover how to use Agent X memory for persistent context.',
    type: 'article' as const,
    category: 'agent-x' as const,
    tags: [
      'agent x',
      'commands',
      'prompting',
      'effective commands',
      'free-form chat',
      'quick tasks',
      'tips',
      'memory',
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
      { id: 'quick-tasks-vs-free-form', title: 'Quick Tasks vs. Free-Form Chat', level: 2 },
      { id: 'five-principles', title: '5 Principles for Effective Commands', level: 2 },
      { id: 'example-commands-by-role', title: '10 Example Commands by Role', level: 2 },
      {
        id: 'when-agent-x-asks-for-more',
        title: 'When Agent X Asks for More Information',
        level: 2,
      },
      {
        id: 'using-agent-x-memory',
        title: 'Using Agent X Memory for Persistent Context',
        level: 2,
      },
    ],
    seo: {
      metaTitle: 'How to Talk to Agent X — Effective Commands and Prompting Tips | NXT1',
      metaDescription:
        'Learn how to write effective Agent X commands. Five principles, 10 real examples by role, and how to use Agent X memory for better results every time.',
      keywords: [
        'Agent X commands',
        'how to use Agent X',
        'NXT1 prompting',
        'effective commands',
        'Agent X tips',
      ],
    },
    content: `
<p>Agent X understands plain, conversational language — there is no special syntax to learn and no command format to memorize. But like any capable coordinator, the quality of what it produces is directly proportional to the clarity and context of what you give it.</p>

<p>This guide covers the principles and patterns that consistently produce the best results.</p>

<h2 id="quick-tasks-vs-free-form">Quick Tasks vs. Free-Form Chat</h2>

<p>There are two ways to give Agent X a command:</p>

<p><strong>Quick Tasks</strong> are pre-built commands that appear as tap-to-run cards on your command center. They are pre-loaded with role-specific context and require no typing. Tap one and Agent X immediately begins executing it against your profile data. Quick tasks are the fastest path to a result for the most common operations.</p>

<p><strong>Free-form chat</strong> is the open input at the bottom of the Agent X screen. You type anything — a request, a question, a multi-part instruction. This unlocks the full range of what Agent X can do, beyond what any pre-built card covers. Both quick tasks and free-form commands go through the exact same execution pipeline — there is no difference in capability.</p>

<p>Use quick tasks when the operation is routine. Use free-form chat when you need something specific, multi-step, or outside the standard cards.</p>

<h2 id="five-principles">5 Principles for Effective Commands</h2>

<h3>1. Give Context Up Front</h3>
<p>Agent X already knows your profile data — but it cannot read your mind about intent. The more context you provide in the command itself, the less it has to guess.</p>
<ul>
  <li><strong>Weak:</strong> "Draft a recruiting email."</li>
  <li><strong>Strong:</strong> "Draft a recruiting email to the offensive coordinator at Michigan State. I'm a 6'3 wide receiver, class of 2027, 4.45 forty. I attended their camp last June and we spoke briefly. Keep the tone confident but not over-eager."</li>
</ul>

<h3>2. Specify the Output Format</h3>
<p>If you want a table, say table. If you want a bullet list, say bullet list. If you want a two-paragraph email and not a five-paragraph one, say so. Agent X will match the format you ask for.</p>
<ul>
  <li><strong>Weak:</strong> "Give me a breakdown of my stats."</li>
  <li><strong>Strong:</strong> "Give me a bullet-point breakdown of my last three seasons — rushing yards, touchdowns, and yards per carry for each season. Keep it under 100 words."</li>
</ul>

<h3>3. Use Sport-Specific Language</h3>
<p>Agent X is trained on sports domain knowledge — use it. Position names, scheme terminology, governing body acronyms, recruiting calendar terms. The more sport-specific your command, the more precise the output.</p>
<ul>
  <li><strong>Weak:</strong> "Find colleges for me."</li>
  <li><strong>Strong:</strong> "Find D2 and D3 programs running a spread offense that have roster gaps at slot receiver for my graduation year. Focus on the Northeast and Mid-Atlantic."</li>
</ul>

<h3>4. Chain Multiple Requests in One Message</h3>
<p>Agent X handles multi-step instructions. You do not need to send one message, wait, then send another. Chain everything related into a single command — Agent X will sequence the steps correctly.</p>
<ul>
  <li><strong>Separate (slower):</strong> "Find my top 10 college matches." Then later: "Draft an intro email for each of them."</li>
  <li><strong>Chained (faster):</strong> "Find my top 10 college matches for my position and class year, then draft a personalized intro email for each one that I can review before sending."</li>
</ul>

<h3>5. Tell Agent X What to Do with the Result</h3>
<p>The default behavior is to return results in the chat. But Agent X can also write results directly to your profile, save them as a draft, post them, or send them for approval. If you have a specific destination in mind, say so.</p>
<ul>
  <li><strong>Weak:</strong> "Update my stats."</li>
  <li><strong>Strong:</strong> "Update my profile stats with last Friday's game: 8 catches, 134 yards, 2 touchdowns. Save it as a season game log entry."</li>
</ul>

<h2 id="example-commands-by-role">10 Example Commands by Role</h2>

<h3>Athletes (4 examples)</h3>

<ol>
  <li>
    <strong>College search with fit criteria:</strong><br>
    <em>"Find D1 and D2 programs that have scholarship availability for a 6'1 point guard graduating in 2027 with a 3.8 GPA. I prefer schools in the Southeast or Big Ten footprint with strong business programs."</em>
  </li>
  <li>
    <strong>Full outreach sequence:</strong><br>
    <em>"Build me a full outreach plan for my top 8 target schools. For each one, draft a personalized intro email referencing specific things about their program, then schedule follow-ups two weeks after each send if I don't get a reply. Present everything for my review before anything goes out."</em>
  </li>
  <li>
    <strong>Profile intelligence review:</strong><br>
    <em>"Look at my profile from a college coach's perspective and tell me exactly what is missing, what is weak, and what needs to be updated. Be direct — I want a brutal honest assessment, not encouragement."</em>
  </li>
  <li>
    <strong>Post-game stat update:</strong><br>
    <em>"Add last night's game stats to my profile: 22 points, 7 assists, 4 rebounds, 2 steals, 38 minutes against Riverside High. Also generate a short highlight caption I can post on my timeline."</em>
  </li>
</ol>

<h3>Coaches (4 examples)</h3>

<ol>
  <li>
    <strong>Roster gap analysis:</strong><br>
    <em>"Analyze my current roster depth chart and identify where we are most exposed for next season — especially positions where we're losing seniors and don't have proven depth behind them."</em>
  </li>
  <li>
    <strong>Team communication draft:</strong><br>
    <em>"Draft a team-wide message announcing that Saturday's practice is moved to 9am and is now mandatory for all varsity players. Firm but professional tone. I'll review it before it goes out."</em>
  </li>
  <li>
    <strong>Individual athlete progress report:</strong><br>
    <em>"Generate a detailed progress report for Marcus Thompson — where his stats are relative to his position benchmark, what areas he has improved since the start of the season, and where he still needs work. Format it as a structured report I can share with him and his parents."</em>
  </li>
  <li>
    <strong>Opponent scouting brief:</strong><br>
    <em>"We play Westfield on Friday. Pull what you can find on their roster and recent game results and give me a two-page scouting brief focused on their offensive tendencies and who their primary threats are."</em>
  </li>
</ol>

<h3>Directors (2 examples)</h3>

<ol>
  <li>
    <strong>Program-wide roster audit:</strong><br>
    <em>"Run a roster audit across all five of my teams. For each team, identify how many players are graduating this year, what position gaps that creates, and which teams are most at risk of being thin next season."</em>
  </li>
  <li>
    <strong>Program announcement:</strong><br>
    <em>"Draft a program-wide announcement congratulating our girls soccer team on winning the regional championship. Mention Coach Rivera by name. Keep it under 150 words, appropriate for both social media and an email blast. Present both versions for my approval."</em>
  </li>
</ol>

<h2 id="when-agent-x-asks-for-more">When Agent X Asks for More Information</h2>

<p>When Agent X needs clarification before it can continue, the operation pauses and enters <strong>Awaiting Input</strong> status. A question appears in the chat. Answer it directly and the operation resumes.</p>

<p>Common reasons Agent X asks for input:</p>
<ul>
  <li>Your command had multiple valid interpretations and it wants to confirm which you meant</li>
  <li>It found multiple matching results (schools, athletes, coaches) and needs you to select one</li>
  <li>A required piece of data is missing from your profile and it needs you to provide it to continue</li>
</ul>

<p>Answering promptly keeps operations moving quickly. If you do not respond, the operation will remain in Awaiting Input until you do — it will not time out or cancel on its own.</p>

<h2 id="using-agent-x-memory">Using Agent X Memory for Persistent Context</h2>

<p>Agent X maintains memory across sessions. It remembers things about your goals, preferences, and history — so you do not have to re-explain context every time.</p>

<p>You can use memory deliberately by telling Agent X what to remember:</p>
<ul>
  <li><em>"Remember that I'm only interested in D2 programs — filter everything through that."</em></li>
  <li><em>"Remember that my preferred contact email for college coaches is my school email, not my personal one."</em></li>
  <li><em>"Remember that I want all recruiting emails to use a confident, direct tone — no filler phrases."</em></li>
</ul>

<p>Agent X will apply these preferences automatically in all future operations without you needing to repeat them. You can view what Agent X has remembered, update it, or delete specific memories by saying:</p>
<ul>
  <li><em>"What do you remember about me?"</em></li>
  <li><em>"Forget that I said I was only targeting D2 — add D3 back in."</em></li>
</ul>

<p>Memory is one of the highest-leverage features on the platform. The more intentional you are about what you ask Agent X to remember, the more context it has to do better work for you across every operation.</p>
    `.trim(),
  },
];

export const HELP_CENTER_GETTING_STARTED_ARTICLES = [
  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE 1: Welcome to NXT1 (all users)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'welcome-to-nxt1',
    title: 'Welcome to NXT1 — Your AI Command Center',
    excerpt:
      'NXT1 is not a profile. It is an active sports intelligence platform powered by Agent X. Learn what sets it apart, how the platform is organized, and where to go next.',
    type: 'article' as const,
    category: 'getting-started' as const,
    tags: [
      'welcome',
      'overview',
      'getting started',
      'agent x',
      'command center',
      'platform',
      'onboarding',
    ],
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
    tableOfContents: [
      { id: 'what-nxt1-is', title: 'What NXT1 Is', level: 2 },
      { id: 'the-three-roles', title: 'The Three Roles', level: 2 },
      { id: 'your-command-center', title: 'Your Command Center', level: 2 },
      { id: 'how-it-works', title: 'How It Works', level: 2 },
      { id: 'your-next-step', title: 'Your Next Step', level: 2 },
    ],
    seo: {
      metaTitle: 'Welcome to NXT1 — Getting Started with Your AI Command Center',
      metaDescription:
        'Learn what NXT1 is, how it works, and how to get started as an athlete, coach, or program director.',
      keywords: [
        'NXT1',
        'sports intelligence platform',
        'Agent X',
        'getting started',
        'command center',
      ],
    },
    content: `
<h2 id="what-nxt1-is">What NXT1 Is</h2>

<p>NXT1 is a <strong>Sports Intelligence Platform</strong> — not a recruiting database, not a social network, and not a passive profile directory. It is an active, autonomous system powered by <strong>Agent X</strong>, an AI agent that executes real work on your behalf so you can focus on competing, coaching, and building your program.</p>

<p>Most sports platforms are completely passive. You build a profile, upload your stats, and wait to be discovered. That model is dead.</p>

<p>NXT1 operates on a different principle: <em>They wait for you. We work for you.</em></p>

<p>You describe what you need in plain language. Agent X executes — drafting recruiting emails, generating Intel Reports, cutting highlights, scouting opponents, building game plans, and coordinating your entire sports career in the background while you get back to work.</p>

<h2 id="the-three-roles">The Three Roles</h2>

<p>When you sign up, you choose one of three roles. Your role determines which version of the platform you operate from and which Agent X coordinator panels are available to you.</p>

<ul>
  <li><strong>Athlete</strong> — Student athletes and competitive players. Your command center is built around recruiting intelligence, performance analytics, media and branding, and academic eligibility. Agent X is your personal sports coordinator managing every aspect of your career.</li>
  <li><strong>Coach</strong> — High school, club, travel, and independent coaches. Your command center is built around team management, roster development, scouting, and program communications. Agent X helps you analyze performance, build game plans, draft outreach, and run your program more intelligently.</li>
  <li><strong>Director</strong> — Athletic directors and program administrators managing multiple teams under one organization. Your command center gives you program-wide visibility, budget controls, multi-team analytics, and org-level coordination tools powered by Agent X.</li>
</ul>

<p>If you selected the wrong role during signup, you can request a change via <strong>Settings → Account → Role</strong>. Role changes are typically processed within 1–2 business days.</p>

<h2 id="your-command-center">Your Command Center</h2>

<p>Everything on NXT1 is organized around your command center. Here is how the platform is structured:</p>

<ul>
  <li><strong>Agent X</strong> — The primary interface. Where you interact with Agent X, review active background operations, receive your daily briefing, and execute quick commands. Accessible from the bottom navigation or by tapping the Agent X button anywhere in the app.</li>
  <li><strong>Profile</strong> — Your public-facing sports presence. Athletes have a three-tab profile: Intel (AI-authored intelligence report) · Timeline (activity feed) · Connect (recruiting contact). Coaches and Directors have program-facing profiles.</li>
  <li><strong>Team</strong> — Your team workspace. Roster, schedule, stats, staff, sponsors, and media — all managed from one place.</li>
  <li><strong>Activity</strong> — Your notification feed. Operation completions, team updates, profile views, and incoming messages all arrive here.</li>
  <li><strong>Sidenav</strong> — Full access to Billing &amp; Usage, Settings, Invite, and the Help Center. Swipe from the left or tap the menu icon.</li>
</ul>

<h2 id="how-it-works">How It Works</h2>

<p>Every request you give Agent X — whether you type it in free-form chat or tap a quick command — goes through the same intelligent pipeline:</p>

<ol>
  <li>Agent X reads your full intent and breaks it into the smallest independent sub-tasks.</li>
  <li>Each sub-task is assigned to a specialist coordinator (Recruiting, Performance, Brand &amp; Media, Data, Compliance).</li>
  <li>Coordinators run in parallel when possible, or in sequence when one depends on another's output.</li>
  <li>Long-running tasks become <strong>background operations</strong> — they continue running while you navigate the platform or close the app entirely.</li>
  <li>When an operation completes, a notification arrives in your Activity feed and the result appears in the relevant section of your profile.</li>
</ol>

<p>You never have to wait on a loading screen. NXT1 works while you work.</p>

<h2 id="your-next-step">Your Next Step</h2>

<p>The fastest path to getting value from NXT1 is completing your profile and running your first Agent X operation. Follow the Quick-Start Guide for your role:</p>

<ul>
  <li><strong>Athletes</strong> — See <em>Quick-Start Guide: Athletes</em></li>
  <li><strong>Coaches</strong> — See <em>Quick-Start Guide: Coaches</em></li>
  <li><strong>Program Directors</strong> — See <em>Quick-Start Guide: Program Directors</em></li>
</ul>

<p>Once your profile is set up and your sources are connected, Agent X has full context to work with — and that is when the platform becomes genuinely powerful.</p>
    `.trim(),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE 2: Quick-Start — Athletes
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'quick-start-athletes',
    title: 'Quick-Start Guide: Athletes — Your First 5 Minutes on NXT1',
    excerpt:
      'A step-by-step checklist to get your athlete profile fully operational — from completing your profile to connecting your sources, joining your team, and running your first Agent X command.',
    type: 'article' as const,
    category: 'getting-started' as const,
    tags: [
      'getting started',
      'athlete',
      'quick start',
      'profile setup',
      'agent x',
      'onboarding',
      'checklist',
    ],
    targetUsers: ['athlete'] as const,
    readingTimeMinutes: 3,
    isFeatured: true,
    isNew: true,
    isPublished: true,
    publishedAt: TODAY,
    updatedAt: TODAY,
    viewCount: 0,
    helpfulCount: 0,
    notHelpfulCount: 0,
    tableOfContents: [
      { id: 'step-1-complete-your-profile', title: 'Step 1 — Complete Your Profile', level: 2 },
      {
        id: 'step-2-add-your-sport-and-position',
        title: 'Step 2 — Add Your Sport and Position',
        level: 2,
      },
      { id: 'step-3-connect-your-sources', title: 'Step 3 — Connect Your Sources', level: 2 },
      { id: 'step-4-join-your-team', title: 'Step 4 — Join Your Team', level: 2 },
      {
        id: 'step-5-run-your-first-command',
        title: 'Step 5 — Run Your First Agent X Command',
        level: 2,
      },
    ],
    seo: {
      metaTitle: 'Athlete Quick-Start Guide — Get Set Up on NXT1 in 5 Minutes',
      metaDescription:
        'A complete checklist for athletes joining NXT1 — profile setup, connecting sources, joining a team, and your first Agent X command.',
      keywords: [
        'NXT1 athlete',
        'athlete setup',
        'quick start',
        'Agent X',
        'recruiting profile',
        'sports intelligence',
      ],
    },
    content: `
<p>This guide gets you from signup to a fully operational command center in under five minutes. Complete each step in order — every step makes Agent X smarter and more effective for you.</p>

<h2 id="step-1-complete-your-profile">Step 1 — Complete Your Profile</h2>

<p>Your NXT1 profile is not just a page — it is the data layer Agent X reads to do everything it does for you. The more complete your profile, the better Agent X performs. Coaches and programs who find you on NXT1 will see the Intel tab first, which is powered entirely by what is in your profile.</p>

<p>Go to your profile and tap <strong>Edit Profile</strong>. Fill in each section:</p>

<ul>
  <li><strong>Basic Info</strong> — Name, username, bio, graduation year, and location.</li>
  <li><strong>Photos</strong> — Upload a clear profile photo and a cover banner. First impressions matter to coaches evaluating your profile.</li>
  <li><strong>Sports Info</strong> — Your primary sport, position, and years of experience. You can add multiple sports.</li>
  <li><strong>Academics</strong> — GPA, SAT/ACT scores, school name, and intended major. This feeds directly into your NCAA/NAIA eligibility intelligence.</li>
  <li><strong>Physical</strong> — Height, weight, and any measurable athletic metrics (40-yard dash, vertical, wingspan, etc.).</li>
  <li><strong>Contact</strong> — A working email and your preferred contact method so coaches can reach you.</li>
</ul>

<p><strong>Pro tip:</strong> You can also tell Agent X what to fill in. Open Agent X and say: <em>"Update my profile — I'm 6'2, 185 lbs, a 4.2 GPA, and I play wide receiver at Lincoln High School, graduating in 2027."</em> Agent X will write it directly to your profile.</p>

<h2 id="step-2-add-your-sport-and-position">Step 2 — Add Your Sport and Position</h2>

<p>If you have not added a sport yet, tap <strong>Add Sport</strong> from the navigation. The wizard walks you through selecting your sport and position. Athletes can add multiple sports and appear in search results for each one.</p>

<p>Make sure your position is accurate — Agent X uses your sport and position to determine which college program fits are most realistic, which benchmarks to compare you against, and which recruiting contacts to target.</p>

<h2 id="step-3-connect-your-sources">Step 3 — Connect Your Sources</h2>

<p>This is the highest-leverage step for athletes. Connecting external platforms gives Agent X verified, real-time data to work with — your actual game stats, film, recruiting rankings, and evaluations — rather than only what you have manually entered.</p>

<p>Connected sources give Agent X context. More context means more accurate college program fits, smarter recruiting emails, more credible Intel Reports, and better performance analysis.</p>

<p>To connect a source: <strong>Edit Profile → Sports Info → Connected Sources</strong>, or ask Agent X: <em>"Connect my MaxPreps account."</em></p>

<p>Supported platforms:</p>
<ul>
  <li><strong>MaxPreps</strong> — High school stats and game logs</li>
  <li><strong>Hudl</strong> — Video highlights and film</li>
  <li><strong>247Sports / Rivals / On3</strong> — Recruiting ratings and rankings</li>
  <li><strong>Perfect Game / Prep Baseball Report</strong> — Baseball-specific evaluations</li>
  <li><strong>NCSA Athletic Recruiting</strong> — Cross-sport recruiting profiles</li>
  <li><strong>USA Football</strong> — Football-specific data</li>
</ul>

<p>Data from connected sources is labeled with a verified badge in your Intel Report so coaches can see exactly where each number came from.</p>

<h2 id="step-4-join-your-team">Step 4 — Join Your Team</h2>

<p>If your coach has already created a team on NXT1, you can join it with a 6-character team code. Tap <strong>Add Team</strong> from the navigation and enter the code your coach provides.</p>

<p>Being on a team unlocks shared roster features, team communications through Agent X, and coach visibility into your progress. You can belong to multiple teams simultaneously — for example, a high school varsity team and a club or travel team at the same time.</p>

<p>If your coach is not on NXT1 yet, invite them from the sidenav (<strong>Invite</strong>) so they can create the team and bring you in.</p>

<h2 id="step-5-run-your-first-command">Step 5 — Run Your First Agent X Command</h2>

<p>Open Agent X by tapping the Agent X button in the bottom right of the screen, or navigate to the Agent X section from the bottom tabs.</p>

<p>You will see your command center with quick-task cards already loaded for your role. These are pre-built commands that require no typing — just tap to execute. Recommended first commands for athletes:</p>

<ul>
  <li><strong>"Find My Best College Matches"</strong> — Agent X analyzes your profile and returns a personalized list of college programs sorted by fit. Add more profile data first for the best results.</li>
  <li><strong>"Improve My Profile"</strong> — Agent X reviews what coaches see on your profile and tells you exactly what is missing or needs to be strengthened.</li>
  <li><strong>"Generate My Intel Report"</strong> — Agent X assembles a full AI-authored intelligence report from your stats, film, rankings, and academic data. This is what coaches read when they evaluate you.</li>
</ul>

<p>Most operations complete in seconds. Larger operations (like generating an Intel Report for the first time) run as background operations — Agent X notifies you in Activity when they are done. Navigate freely; Agent X keeps working.</p>

<p><strong>You are operational.</strong> Check your daily briefing every morning — Agent X prepares one automatically. It will surface profile views, recommended actions, and recruiting opportunities specific to your current situation.</p>
    `.trim(),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE 3: Quick-Start — Coaches
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'quick-start-coaches',
    title: 'Quick-Start Guide: Coaches — Your First 5 Minutes on NXT1',
    excerpt:
      'A step-by-step checklist for coaches to get a team created, athletes invited, and Agent X running its first team management operation — in under five minutes.',
    type: 'article' as const,
    category: 'getting-started' as const,
    tags: [
      'getting started',
      'coach',
      'quick start',
      'team setup',
      'roster',
      'agent x',
      'onboarding',
      'checklist',
    ],
    targetUsers: ['coach'] as const,
    readingTimeMinutes: 3,
    isFeatured: true,
    isNew: true,
    isPublished: true,
    publishedAt: TODAY,
    updatedAt: TODAY,
    viewCount: 0,
    helpfulCount: 0,
    notHelpfulCount: 0,
    tableOfContents: [
      {
        id: 'step-1-complete-your-coach-profile',
        title: 'Step 1 — Complete Your Coach Profile',
        level: 2,
      },
      { id: 'step-2-create-your-team', title: 'Step 2 — Create Your Team', level: 2 },
      { id: 'step-3-invite-your-athletes', title: 'Step 3 — Invite Your Athletes', level: 2 },
      { id: 'step-4-explore-manage-team', title: 'Step 4 — Explore Manage Team', level: 2 },
      {
        id: 'step-5-run-your-first-command',
        title: 'Step 5 — Run Your First Agent X Command',
        level: 2,
      },
    ],
    seo: {
      metaTitle: 'Coach Quick-Start Guide — Get Your Team Set Up on NXT1 in 5 Minutes',
      metaDescription:
        'A complete checklist for coaches joining NXT1 — profile setup, creating a team, inviting athletes, and running your first Agent X team management command.',
      keywords: [
        'NXT1 coach',
        'coach setup',
        'quick start',
        'team management',
        'Agent X',
        'roster',
      ],
    },
    content: `
<p>This guide gets your team command center live and operational in under five minutes. Complete each step in order — by the time you reach Step 5, Agent X will have enough context to start delivering real intelligence for your program.</p>

<h2 id="step-1-complete-your-coach-profile">Step 1 — Complete Your Coach Profile</h2>

<p>Your coach profile establishes your credibility on the platform — with athletes, parents, and other coaches. It also gives Agent X the context it needs to generate relevant team communications, program media, and scouting operations tailored to your sport and program.</p>

<p>Go to your profile and tap <strong>Edit Profile</strong>. Fill in:</p>

<ul>
  <li><strong>Basic Info</strong> — Your name, title (Head Coach, Assistant Coach, etc.), bio, and program.</li>
  <li><strong>Photos</strong> — A professional profile photo and a cover photo (your school or program logo works well here).</li>
  <li><strong>Sport</strong> — The sport(s) you coach and your role within the program.</li>
  <li><strong>Contact</strong> — A working email and phone number so athletes and parents can reach you, and so college programs can contact you about your recruits.</li>
</ul>

<h2 id="step-2-create-your-team">Step 2 — Create Your Team</h2>

<p>A NXT1 team is a shared workspace for your entire program — roster, schedule, stats, staff, media, and communications all live here. Only Coaches and Directors can create teams.</p>

<p>Tap <strong>Add Team</strong> from the navigation and follow the creation wizard:</p>

<ol>
  <li>Enter your team name, sport, and season.</li>
  <li>Add your team colors, mascot, and abbreviation.</li>
  <li>Review the summary and confirm.</li>
</ol>

<p>Once created, your team gets a unique <strong>6-character join code</strong>. This is what athletes use to join your team. Share it via the Invite section, over text, or read it out at the next practice. Athletes enter the code under <strong>Add Team</strong> on their end.</p>

<p>The join code is case-insensitive and does not expire. You can find it anytime in <strong>Manage Team → Overview</strong>.</p>

<h2 id="step-3-invite-your-athletes">Step 3 — Invite Your Athletes</h2>

<p>Once your team exists, add your roster. You have two options:</p>

<p><strong>Option A — Share the join code:</strong> Send athletes the 6-character code via text, email, or in person. When they enter it under Add Team, they join the roster immediately.</p>

<p><strong>Option B — Direct invite:</strong> From <strong>Manage Team → Roster</strong>, tap <strong>Invite Athlete</strong> and enter their email or phone number. They receive a direct invitation linked to your team and join with one tap.</p>

<p>You can also invite <strong>staff members</strong> — assistant coaches, trainers, and support staff — from <strong>Manage Team → Staff</strong>. Staff members get access to team data and can use Agent X for team operations.</p>

<p>Athletes and staff who are already on NXT1 will appear on your roster immediately when they accept. Those who are new will complete a quick signup first.</p>

<h2 id="step-4-explore-manage-team">Step 4 — Explore Manage Team</h2>

<p>The Manage Team interface is your operational hub. Navigate there from your Team Profile. You will see six tabs:</p>

<ul>
  <li><strong>Overview</strong> — Summary stats, join code, recent activity, and program snapshot.</li>
  <li><strong>Roster</strong> — All players with name, number, position, class year, height, and weight. Add entries manually or ask Agent X to build the roster from imported data.</li>
  <li><strong>Schedule</strong> — Games, practices, and events. Add manually or instruct Agent X: <em>"Add our schedule for the spring season."</em></li>
  <li><strong>Stats</strong> — Team aggregate stats for the active season.</li>
  <li><strong>Staff</strong> — Your coaching and support staff directory.</li>
  <li><strong>Sponsors</strong> — Program sponsors with logos and links.</li>
</ul>

<h2 id="step-5-run-your-first-command">Step 5 — Run Your First Agent X Command</h2>

<p>Open Agent X by tapping the Agent X button in the bottom right of the screen, or navigate to Agent X from the bottom tabs.</p>

<p>Your command center is loaded with quick-task cards built for coaches. Recommended first commands:</p>

<ul>
  <li><strong>"Analyze my team's recent performance and identify development priorities"</strong> — Agent X reviews your roster and available stats to surface where your program needs the most focus.</li>
  <li><strong>"Draft a team announcement for this week's practice schedule"</strong> — Agent X writes a professional team communication you can review, edit, and send.</li>
  <li><strong>"Generate a roster summary for my program"</strong> — Agent X assembles a structured overview of your current roster: positions, class year distribution, and any notable gaps.</li>
</ul>

<p>Operations that take more than a few seconds run in the background. Navigate freely — Agent X notifies you in Activity when results are ready.</p>

<p><strong>You are operational.</strong> Check your daily briefing every morning for roster updates, upcoming schedule items, and recommended actions Agent X has prepared specifically for your program.</p>
    `.trim(),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ARTICLE 4: Quick-Start — Program Directors
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'quick-start-directors',
    title: 'Quick-Start Guide: Program Directors — Your First 5 Minutes on NXT1',
    excerpt:
      'A step-by-step checklist for athletic directors and program administrators to set up their organization, configure teams and budgets, add coaches, and execute their first program-level Agent X operation.',
    type: 'article' as const,
    category: 'getting-started' as const,
    tags: [
      'getting started',
      'director',
      'athletic director',
      'quick start',
      'organization',
      'agent x',
      'onboarding',
      'checklist',
      'budget',
    ],
    targetUsers: ['director'] as const,
    readingTimeMinutes: 4,
    isFeatured: true,
    isNew: true,
    isPublished: true,
    publishedAt: TODAY,
    updatedAt: TODAY,
    viewCount: 0,
    helpfulCount: 0,
    notHelpfulCount: 0,
    tableOfContents: [
      {
        id: 'step-1-complete-your-director-profile',
        title: 'Step 1 — Complete Your Director Profile',
        level: 2,
      },
      { id: 'step-2-set-up-your-teams', title: 'Step 2 — Set Up Your Teams', level: 2 },
      { id: 'step-3-add-coaches-and-staff', title: 'Step 3 — Add Coaches and Staff', level: 2 },
      {
        id: 'step-4-configure-your-org-budget',
        title: 'Step 4 — Configure Your Org Budget',
        level: 2,
      },
      {
        id: 'step-5-run-your-first-command',
        title: 'Step 5 — Run Your First Agent X Command',
        level: 2,
      },
    ],
    seo: {
      metaTitle: 'Director Quick-Start Guide — Set Up Your Program Organization on NXT1',
      metaDescription:
        'A complete checklist for athletic directors and program administrators on NXT1 — organization setup, team creation, budget configuration, and your first program-level Agent X command.',
      keywords: [
        'NXT1 director',
        'athletic director',
        'program director',
        'quick start',
        'organization setup',
        'Agent X',
      ],
    },
    content: `
<p>This guide gets your entire program organization live on NXT1 — multiple teams, coaches, athletes, and budgets all under one command center. Complete each step in order to establish full organizational control and unlock program-level Agent X intelligence.</p>

<h2 id="step-1-complete-your-director-profile">Step 1 — Complete Your Director Profile</h2>

<p>Your Director profile is the administrative identity for your entire program. It establishes your role and gives Agent X the organizational context it needs to generate program-wide intelligence, communicate on behalf of your program, and surface the right data across all your teams.</p>

<p>Go to your profile and tap <strong>Edit Profile</strong>. Fill in:</p>

<ul>
  <li><strong>Basic Info</strong> — Your name, title (Athletic Director, Program Director, Head Administrator, etc.), and program name.</li>
  <li><strong>Photos</strong> — A professional profile photo and your program or institution's logo as the cover image.</li>
  <li><strong>Contact</strong> — Your administrative email and phone. This is the contact point for program inquiries, recruiting coordinators from college programs, and external communications generated by Agent X.</li>
</ul>

<h2 id="step-2-set-up-your-teams">Step 2 — Set Up Your Teams</h2>

<p>As a Director, you manage multiple teams under a single organization umbrella. Each team operates as an independent workspace with its own roster, schedule, and stats — but you have oversight of all of them from your command center.</p>

<p>Tap <strong>Add Team</strong> to create your first team. The creation wizard guides you through:</p>

<ol>
  <li>Sport, team name, season, and division.</li>
  <li>Team colors, mascot, and abbreviation.</li>
  <li>Assigning a head coach (you can add coaches in Step 3 and assign them later).</li>
</ol>

<p>Each team receives a unique <strong>6-character join code</strong> after creation. Share each code with the appropriate coach so they can manage roster invitations for that team. Repeat the process for each team in your program — there is no limit on the number of teams under a Director account.</p>

<h2 id="step-3-add-coaches-and-staff">Step 3 — Add Coaches and Staff</h2>

<p>Every team in your program needs coaches assigned to it. Coaches manage day-to-day operations for their specific team while you maintain program-wide visibility.</p>

<p>From each team's <strong>Manage Team → Staff</strong>, tap <strong>Invite Coach</strong> and enter their email or phone. Coaches accept the invite, complete signup if they are new to NXT1, and are immediately linked to that team with full team management access.</p>

<p>Staff members (assistant coaches, trainers, support personnel) can also be added from the same interface. Staff have access to team data and Agent X team operations but do not have administrative or billing controls.</p>

<p>Once your coaches are in and managing their rosters, the program starts populating with real data — and Agent X can begin generating meaningful program-level analysis.</p>

<h2 id="step-4-configure-your-org-budget">Step 4 — Configure Your Org Budget</h2>

<p>NXT1 uses usage-based billing. You add funds to the organization wallet and Agent X operations draw from that balance. As a Director, you control how those funds are distributed across your program.</p>

<p>Go to <strong>Billing &amp; Usage</strong> from the sidenav and configure:</p>

<ul>
  <li><strong>Org wallet</strong> — Add funds to the top-level organization balance. This is the funding source for all teams in your program.</li>
  <li><strong>Team sub-limits</strong> — Set a monthly spending cap per team (for example: Boys Basketball $50/month, Girls Soccer $50/month). When a team hits its cap, paid operations pause until you increase the allocation.</li>
  <li><strong>Auto Top-Up</strong> — Optional automatic refill when the org balance drops below a threshold. Prevents program-wide disruptions if a high-usage month depletes the wallet unexpectedly.</li>
</ul>

<p>Individual coaches cannot add funds to the org wallet or change team allocations — only users with Director-level admin access can manage budget controls. Coaches can view their team's current balance and usage breakdown from their own Billing &amp; Usage dashboard.</p>

<h2 id="step-5-run-your-first-command">Step 5 — Run Your First Agent X Command</h2>

<p>Open Agent X by tapping the Agent X button in the bottom right of the screen, or navigate to Agent X from the bottom tabs.</p>

<p>Your command center is loaded with quick-task cards built for program directors — program-wide analytics, not individual team management. Recommended first commands:</p>

<ul>
  <li><strong>"Program Performance Summary"</strong> — Agent X generates an aggregate analytics report across all your teams: roster composition, season stats, performance trends, and development gaps by sport.</li>
  <li><strong>"Roster Analysis — Identify Gaps Across the Program"</strong> — Agent X reviews every team roster and surfaces positional gaps, graduation risk by class year, and where the program most needs recruiting attention.</li>
  <li><strong>"Draft a program-wide announcement"</strong> — Agent X writes a professional communication to go out across all teams and staff. You review and approve before it is distributed.</li>
</ul>

<p>Operations run in the background. Navigate freely — Agent X delivers results to your Activity feed when ready.</p>

<p><strong>You are operational.</strong> Every morning, Agent X prepares a program-wide briefing: new roster activity, upcoming events across all teams, budget status, and recommended actions. Your program runs more intelligently from day one.</p>
    `.trim(),
  },
];

export const HELP_CENTER_POPULAR_FAQS = [
  // ─── 1: Is NXT1 free to use? ─────────────────────────────────────────────
  {
    question: 'Is NXT1 free to use?',
    answer: `<p>Yes — the core NXT1 platform is free. Creating your profile, joining and managing teams, browsing athletes and coaches, messaging, and standard navigation are always free with no credits required.</p>
<p>Credits are only consumed when Agent X runs AI-powered operations — things like generating Intel Reports, drafting recruiting outreach at scale, or processing media. When an operation requires credits, Agent X shows the estimated cost before starting and will not proceed without sufficient balance. You are never charged for simply using the platform.</p>`,
    category: 'getting-started' as const,
    targetUsers: ['all'] as const,
    order: 1,
    helpfulCount: 0,
    relatedArticles: ['welcome-to-nxt1', 'how-nxt1-billing-works'],
    isPublished: true,
  },

  // ─── 2: What can Agent X do? ─────────────────────────────────────────────
  {
    question: 'What can Agent X do?',
    answer: `<p>Agent X is NXT1's AI command center — not a chatbot. It executes real work across the platform using plain-language instructions. You describe what you need and Agent X runs the operation in the background while you keep using the app.</p>
<p>Examples of what Agent X can do: analyze film and generate performance Intel Reports, draft personalized recruiting outreach to college programs, create post-game summaries from connected stats sources, build weekly playbooks with prioritized action items, generate highlight graphics, and research colleges matching your athletic and academic profile. New capabilities are added continuously — Agent X is not limited to a fixed set of commands.</p>`,
    category: 'agent-x' as const,
    targetUsers: ['all'] as const,
    order: 2,
    helpfulCount: 0,
    relatedArticles: ['how-agent-x-works', 'daily-briefing-and-weekly-playbook'],
    isPublished: true,
  },

  // ─── 3: How do I add funds to my wallet? ─────────────────────────────────
  {
    question: 'How do I add funds to my wallet?',
    answer: `<p>Go to <strong>Settings → Billing &amp; Usage → Add Funds</strong>. Choose an amount, select a payment method (credit/debit card, PayPal, Apple Pay, or Google Pay), and your Balance AI wallet is loaded instantly.</p>
<p>You can also enable <strong>Auto Top-Up</strong> from the same screen so your wallet reloads automatically when your balance drops below a threshold you set — no manual top-ups required.</p>`,
    category: 'account' as const,
    targetUsers: ['all'] as const,
    order: 3,
    helpfulCount: 0,
    relatedArticles: ['how-nxt1-billing-works', 'understanding-the-usage-dashboard'],
    isPublished: true,
  },

  // ─── 4: How do I join a team? ────────────────────────────────────────────
  {
    question: 'How do I join a team?',
    answer: `<p>There are two ways to join a team on NXT1:</p>
<ul>
  <li><strong>Invite link</strong> — Tap the link your coach or director sent you. Make sure you are signed in first — the link will place you on the team automatically once you are logged in.</li>
  <li><strong>Team code</strong> — Go to <strong>Teams → Join a Team</strong> and enter the 6-character code your coach shared. Codes are case-insensitive.</li>
</ul>
<p>Some teams require coach approval before you gain full access. If your join is pending, you will see a "pending" status on the team card and receive a notification once approved.</p>`,
    category: 'teams' as const,
    targetUsers: ['all'] as const,
    order: 4,
    helpfulCount: 0,
    relatedArticles: ['joining-a-team-on-nxt1', 'team-join-issues'],
    isPublished: true,
  },

  // ─── 5: How do I reset my password? ─────────────────────────────────────
  {
    question: 'I forgot my password. How do I reset it?',
    answer: `<p>On the sign-in screen, tap <strong>Forgot Password</strong>. Enter the email address associated with your account and NXT1 will send you a reset link. The link expires after <strong>24 hours</strong>.</p>
<p>If the email doesn't arrive within 5 minutes, check your spam or junk folder — emails from <em>noreply@nxt1.app</em> are occasionally filtered there. If you no longer have access to the email address on your account, contact support through <strong>Help Center → Contact Us</strong>.</p>`,
    category: 'troubleshooting' as const,
    targetUsers: ['all'] as const,
    order: 5,
    helpfulCount: 0,
    relatedArticles: ['cant-log-in-or-recover-your-account'],
    isPublished: true,
  },

  // ─── 6: How do I invite players to my team? ──────────────────────────────
  {
    question: 'How do I invite players to my team?',
    answer: `<p>Coaches and directors can invite players from the <strong>Invite</strong> section in the sidenav or directly from the Team Profile. Choose a channel: SMS, WhatsApp, Email, Copy Link, QR Code, Contacts, AirDrop, or social platforms. The recipient taps the link, signs up if they haven't already, and is placed on your team automatically.</p>
<p>You can also invite a player by email directly from the roster: go to <strong>Team Profile → Roster → Invite Player</strong>, enter their email address and optional position, and they receive a direct invite linked to your team.</p>`,
    category: 'teams' as const,
    targetUsers: ['coach', 'director'] as const,
    order: 6,
    helpfulCount: 0,
    relatedArticles: ['creating-and-managing-your-team', 'joining-a-team-on-nxt1'],
    isPublished: true,
  },

  // ─── 7: What are pending holds? ──────────────────────────────────────────
  {
    question: 'What are pending holds on my wallet balance?',
    answer: `<p>When Agent X starts an operation, NXT1 reserves the estimated cost from your Balance AI wallet as a <strong>pending hold</strong>. This prevents you from accidentally spending those funds on another operation while the first is still running.</p>
<p>When the operation completes, the hold settles to the <strong>actual cost</strong> — which may be less than the estimate. Any unused portion of the hold is released back to your available balance immediately. You can see all current pending holds at the top of your <strong>Billing &amp; Usage</strong> dashboard.</p>`,
    category: 'account' as const,
    targetUsers: ['all'] as const,
    order: 7,
    helpfulCount: 0,
    relatedArticles: ['how-nxt1-billing-works', 'understanding-the-usage-dashboard'],
    isPublished: true,
  },

  // ─── 8: How do I talk to Agent X? ────────────────────────────────────────
  {
    question: 'How do I talk to Agent X?',
    answer: `<p>Use plain language — exactly how you would describe a task to a human assistant. Open the Agent X command center from the sidenav or FAB button and type what you need. You do not need to learn special commands or syntax.</p>
<p>Good examples: <em>"Write a recruiting email to Division II basketball programs in the Southeast."</em> &nbsp;|&nbsp; <em>"Generate a post-game summary for last Friday's varsity game."</em> &nbsp;|&nbsp; <em>"Which colleges on my list have a 3.4+ GPA requirement for my position?"</em></p>
<p>Agent X understands context — your sport, position, role, and connected data sources — so you do not need to repeat background details in every message. The more specific you are about what you want, the more precise the output.</p>`,
    category: 'agent-x' as const,
    targetUsers: ['all'] as const,
    order: 8,
    helpfulCount: 0,
    relatedArticles: ['how-to-talk-to-agent-x', 'how-agent-x-works'],
    isPublished: true,
  },

  // ─── 9: Card declined when adding funds ──────────────────────────────────
  {
    question: 'My card keeps getting declined when I try to add funds. Why?',
    answer: `<p>The most common cause is an automatic fraud block placed by your bank — not an issue with NXT1 or your card itself. Many banks flag charges from AI platform services as unusual, especially on first use. Your card is <strong>not charged</strong> when a payment fails.</p>
<p><strong>How to fix it:</strong> Check your bank app or SMS alerts — many banks offer a one-tap "approve this charge" option. Alternatively, call your bank and ask them to whitelist the charge. Once cleared, retry the payment. You can also try an alternative method: <strong>PayPal, Apple Pay, or Google Pay</strong> typically clear bank fraud filters more easily. Add one under <strong>Settings → Billing &amp; Usage → Payment Methods → Add Method</strong>.</p>`,
    category: 'troubleshooting' as const,
    targetUsers: ['all'] as const,
    order: 9,
    helpfulCount: 0,
    relatedArticles: ['payment-failed-or-wallet-wont-load', 'how-nxt1-billing-works'],
    isPublished: true,
  },

  // ─── 10: How do I connect MaxPreps or Hudl? ──────────────────────────────
  {
    question: 'How do I connect MaxPreps or Hudl to my account?',
    answer: `<p>Go to <strong>Settings → Tools &amp; Integrations → Connected Accounts</strong>. From there, tap <strong>Connect</strong> next to MaxPreps or Hudl and follow the authorization steps. Once connected, NXT1 syncs your stats, game results, and film automatically.</p>
<p>Connected sources unlock Agent X's live data capabilities — post-game summaries, current stats in recruiting drafts, film-backed analysis, and staleness alerts when data may be outdated. Without a connection, Agent X can still help but will work with whatever data you have entered manually on your profile.</p>`,
    category: 'account' as const,
    targetUsers: ['athlete', 'coach'] as const,
    order: 10,
    helpfulCount: 0,
    relatedArticles: ['connected-accounts-and-integrations'],
    isPublished: true,
  },
];
