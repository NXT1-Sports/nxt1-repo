/**
 * Seed Script — Troubleshooting Help Center Articles
 *
 * Creates 3 articles in the helpArticles collection:
 *   B. Can't Log In or Recover Your Account
 *   E. Team Join Issues
 *   H. Payment Failed or Wallet Won't Load
 *
 * Idempotent: upserts by slug. Safe to re-run.
 *
 * Usage (from monorepo root):
 *   MONGO="..." npx tsx scripts/seed-knowledge/seed-troubleshooting-articles.ts
 */

import 'dotenv/config';
import {
  connectToMongoDB,
  disconnectFromMongoDB,
} from '../../backend/src/config/database.config.js';
import { HelpArticleModel } from '../../backend/src/models/help-center/help-article.model.js';

// ─── Article Definitions ──────────────────────────────────────────────────────

const TODAY = '2026-04-19';

const articles = [
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

// ─── Seed Logic ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n⚙️  NXT1 Help Center — Troubleshooting Articles Seed');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Articles to seed: ${articles.length}\n`);

  await connectToMongoDB();
  console.log('  ✅ MongoDB connected\n');

  let created = 0;
  let updated = 0;
  const startTime = Date.now();

  for (const article of articles) {
    const existing = await HelpArticleModel.findOne({ slug: article.slug });

    if (existing) {
      await HelpArticleModel.updateOne({ slug: article.slug }, { $set: article });
      console.log(`  🔄 Updated:  "${article.title}"`);
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
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
