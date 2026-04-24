import type { KnowledgeIngestionRequest } from '@nxt1/core/ai';

export const ACCOUNT_BILLING_DOC: Omit<KnowledgeIngestionRequest, 'chunkSize' | 'chunkOverlap'> = {
  title: 'Account Settings, Billing, and Payments on NXT1',
  category: 'platform_guide',
  source: 'manual',
  sourceRef: 'nxt1://platform-guide/account-billing',
  content: `# Account Settings, Billing, and Payments

## How NXT1 Billing Works

NXT1 uses **usage-based billing**. There are no subscription tiers, no monthly plans to select, and no feature gates based on a pricing level. Users pay for what they use. Operations that consume significant compute resources (AI-powered agent tasks, advanced analysis, large media processing) have associated usage costs. Standard platform features (profile, teams, messaging) have no per-use cost.

Every user — individual or organization — has full platform access. Costs accrue only based on how intensively AI-powered operations are used.

## Wallet Balance & Credits

NXT1 uses a **pre-paid wallet (Balance AI)** — the single source of funds for all Agent X operations. There are no subscription tiers or monthly plans. Users add funds to their Balance AI wallet and credits are consumed only when AI-powered operations are run.

- **Add funds** — Go to Billing & Usage → Add Funds. Choose an amount, select a payment method, and the balance is added instantly.
- **Balance AI wallet** — Your available balance is displayed at the top of the Billing & Usage section.
- **Pending holds** — When an AI operation starts, funds are reserved (held) from your wallet for the expected cost. The hold is settled to the actual cost when the operation completes.
- **Auto top-up** — Enable Auto Top-Up to automatically reload your wallet when the balance drops below a threshold you set. Configure the threshold and reload amount in Billing & Usage → Auto Top-Up.

## Individual vs. Organization Billing

**Individual users** have a single personal wallet. All operations they run draw from this wallet.

**Organization users** (Coaches and Directors managing a program) have an organization wallet shared across their program:
- The org wallet funds all operations run by members of the organization.
- **Org admins** (the Director or a designated admin) manage the org wallet, add funds, and set team budgets.
- **Team budgets** — Org admins can set monthly spend sub-limits per team. For example, the Boys Basketball team might have a $50/month sub-limit drawn from the org wallet. When a team's sub-limit is reached, members in that team cannot run further paid operations that month unless the budget is increased.
- **Personal billing override** — An org member can switch to their personal wallet if they prefer to pay for a specific operation themselves. This is toggled in Billing & Usage.
- **Org wallet empty** — When the org wallet runs out of funds, members see a "Your team is out of funds" notice and paid operations are paused until an admin tops up.

## Payment Methods

NXT1 supports the following payment methods for loading the wallet:

**Credit and debit cards** — Processed via Stripe. Visa, Mastercard, American Express, and Discover are accepted. Cards are stored securely on Stripe's infrastructure; NXT1 never stores raw card numbers.

**PayPal** — Link a PayPal account for one-tap payments.

**Apple Pay (iOS)** — Available on the iOS app. Uses Apple's in-app purchase system.

**Google Pay (Android)** — Available on the Android app. Uses Google Play's billing system.

To add or update a payment method, navigate to Billing & Usage → Payment Methods.

## Managing Your Account

**Profile visibility** — Control whether your profile is public (discoverable) or private (visible only to users you approve). Located in Settings → Privacy.

**Notification preferences** — Configure push notifications, email notifications, and in-app alerts per category (team activity, Agent X completions, messages, etc.). Located in Settings → Notifications.

**Connected accounts** — Link external accounts for enhanced functionality. Located in Settings → Connected Accounts.

**Data and privacy** — View what data NXT1 holds, request a data export, or initiate account deletion. Located in Settings → Data & Privacy.

## Athlete Data Ownership

Athletes own their data on NXT1. Performance stats, media, and profile information belong to the athlete. Coaches can view data athletes share with their team but cannot retain it after an athlete leaves. NXT1 does not sell individual athlete data to third parties.

## Account Recovery

**Forgot password** — Use "Forgot Password" on the login screen. A reset link is sent to the email on file and expires after 24 hours.

**Email access lost** — Contact NXT1 support through the Help Center. Identity verification is required.

**Suspicious activity** — Use Settings → Security → Sign Out All Devices immediately, then change your password.

## What Operations Cost Credits

Agent X operations that consume significant AI compute (generating reports, processing video, running analysis, drafting complex content) draw from your Balance AI wallet. Standard platform features — viewing profiles, browsing team feeds, basic navigation — have no per-use cost.

When an operation requires credits, Agent X shows the estimated cost before starting and will not proceed without sufficient balance.

---

## The Usage Dashboard (/usage)

The Usage Dashboard is a single scrollable page — inspired by GitHub/Vercel billing dashboards — that gives a complete view of spend, usage, payment history, and payment methods. It is accessible from the sidenav under **Billing & Usage**.

### Overview Cards (Top of Page)

At the top, four summary cards show:
- **Current metered usage** — total spend in the current billing period
- **Wallet balance** — available pre-paid funds (updates in real time)
- **Pending holds** — funds reserved for in-flight Agent X operations (settled to actual cost when the operation completes)
- **Next payment** — next auto top-up date/amount, if configured

### Timeframe Filter

Filter all dashboard data by:
- Current month
- Last month
- Last 3 months / Last 6 months / Last 12 months
- Custom date range

### Usage Chart

A daily cumulative line chart showing spend over the selected timeframe. Also includes a stacked bar showing the top spending categories for the period — colored segments break down AI, Media, Recruiting, Communication, Profile, and Teams spend visually.

### Product Detail Tabs

Six tabs, one per spend category:

| Tab | What It Shows |
|-----|--------------|
| **AI** | Agent X operations, report generation, analysis |
| **Media** | Graphics, highlight reels, AI video processing |
| **Recruiting** | College connections and outreach sends |
| **Communication** | Email sends, message automation |
| **Profile** | Profile enhancement products, scouting reports |
| **Teams** | Team-level operations and features |

Each tab shows:
- **Billable amount** (after discounts) vs. **consumed amount** (before discounts)
- **Included quotas** — free usage included per period (e.g. "5 of 10 included AI credits used")
- Days until the included quota resets
- Per-SKU line items (e.g. "148 min · $0.006/min = $0.89")

### Usage Breakdown Table

A day-by-day table showing what was spent. Each row is expandable:

**For individual users:** Each day expands to show SKU line items — product name, units consumed, price per unit, gross amount, and billed amount after discounts.

**For organizations:** Each day expands into a **team → user → product** hierarchy:
- Day → Teams → Members → SKUs
- This lets org admins see exactly which team and which user drove each charge

### Payment History

Full transaction log with:
- Transaction ID (short display ID)
- Amount, currency, status (pending / processing / completed / failed / refunded)
- Payment method used (e.g. "MasterCard ending in 9639")
- Date
- Receipt download link
- Invoice download link

### Payment Methods

Saved payment methods with card brand, last 4 digits, expiry, and default status. Add new methods or remove existing ones from here.

### Billing Information

Billing address used for invoices and receipts.

### Active Coupons / Discounts

If a coupon or promotional discount is active, it appears here showing the code, description, percentage or flat discount, and expiry date.

### Budgets (Per-Product Spend Limits)

Configure spend limits per product category:
- Set a monthly budget limit in dollars
- **Stop on limit** — toggle to pause operations in that category when the budget is reached
- Track current spend vs. budget with a progress bar
- For organizations: team-level sub-allocations appear within each budget row

---

## Organization Budget Controls

Org admins have additional budget tools at:
- **Org wallet** — top-level funding for the organization's entire program
- **Team budget allocations** — set a monthly sub-limit per team (e.g. Boys Basketball: $50/month). When a team hits its sub-limit, members pause until the admin increases it.
- **Per-member personal billing toggle** — any org member can switch to their personal wallet for a specific context (\`usePersonalBilling\`). Useful when a coach wants to run a personal project without drawing from org funds.
- **Org wallet empty banner** — when the org wallet reaches $0, all members see a "Your team is out of funds" notice and paid operations pause until an admin adds funds.
- **Admin controls** — only users with \`isOrgAdmin = true\` can add funds, increase budgets, or change team allocations. Team-level \`isTeamAdmin\` users can view team breakdowns but not change org-level budgets.

---

## Changing Your Role

Role changes (e.g., from Athlete to Coach) are requested through Settings → Account → Role. Allow 1-2 business days. Role changes affect what data you can access on the platform.
`,
};
