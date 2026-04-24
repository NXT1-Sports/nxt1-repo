/**
 * Seed Script — Help Center Popular FAQs
 *
 * Creates 10 popular FAQ items in the helpfaqs collection.
 * These power the "Popular Questions" tab on the Help Center home screen
 * and the per-category FAQ sections (via HelpCategoryDetail.faqs).
 *
 * FAQs span all 5 categories, ordered 1–10 for display priority.
 * Each FAQ links back to the relevant seeded article(s) via relatedArticles.
 *
 * Idempotent: upserts by question text. Safe to re-run.
 *
 * Usage (from monorepo root):
 *   MONGO="..." npx tsx scripts/seed-knowledge/seed-popular-faqs.ts
 */

import 'dotenv/config';
import {
  connectToMongoDB,
  disconnectFromMongoDB,
} from '../../backend/src/config/database.config.js';
import { HelpFaqModel } from '../../backend/src/models/help-center/help-faq.model.js';

// ─── FAQ Definitions ──────────────────────────────────────────────────────────

const faqs = [
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

// ─── Seed Logic ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n⚙️  NXT1 Help Center — Popular FAQs Seed');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  FAQs to seed: ${faqs.length}\n`);

  await connectToMongoDB();
  console.log('  ✅ MongoDB connected\n');

  let created = 0;
  let updated = 0;
  const startTime = Date.now();

  for (const faq of faqs) {
    const existing = await HelpFaqModel.findOne({ question: faq.question });

    if (existing) {
      await HelpFaqModel.updateOne({ question: faq.question }, { $set: faq });
      console.log(`  🔄 Updated:  "${faq.question}"`);
      updated++;
    } else {
      await HelpFaqModel.create(faq);
      console.log(`  ✅ Created:  "${faq.question}"`);
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
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
