/**
 * @fileoverview Seed Help Center Content into MongoDB
 * @module @nxt1/backend/scripts/seed-help-center
 *
 * Migrates help center articles and FAQs from inline mock data to MongoDB.
 * Uses upsert to safely re-run without duplicates.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/seed-help-center.ts                    # seed production
 *   npx tsx scripts/seed-help-center.ts --env=staging      # seed staging
 *   npx tsx scripts/seed-help-center.ts --delete           # wipe & re-seed
 *
 * @version 1.0.0
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import { HelpArticleModel } from '../src/models/help-center/help-article.model.js';
import { HelpFaqModel } from '../src/models/help-center/help-faq.model.js';

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? null;
const hasFlag = (name: string) => args.includes(`--${name}`);

const useStaging = getArg('env') === 'staging';
const doDelete = hasFlag('delete');

// ─── MongoDB Connection ───────────────────────────────────────────────────────
const mongoUri = useStaging
  ? process.env['STAGING_MONGO'] || process.env['STAGING_MONGODB_URI']
  : process.env['MONGO'] || process.env['MONGODB_URI'];

if (!mongoUri) {
  console.error('❌ MONGO or MONGODB_URI environment variable is not set');
  process.exit(1);
}

// ─── Seed Data: Articles ──────────────────────────────────────────────────────
const SEED_ARTICLES = [
  {
    slug: 'how-to-create-your-profile',
    title: 'How to Create Your Profile',
    excerpt: 'Learn how to set up your NXT1 profile and start your recruiting journey.',
    content: `<p>Getting started with NXT1 is easy. Follow these simple steps to create a standout profile that will catch the attention of college coaches.</p>
<h2>Step 1: Sign Up</h2>
<p>Create your account using your email address or sign in with Google, Apple, or Facebook.</p>
<h2>Step 2: Choose Your Role</h2>
<p>Select whether you're an athlete, coach, parent, or scout. This helps us personalize your experience.</p>
<h2>Step 3: Add Your Info</h2>
<p>Fill in your basic information including name, location, school, and graduation year.</p>
<h2>Step 4: Upload Media</h2>
<p>Add a profile photo and upload your highlight videos to showcase your skills.</p>`,
    type: 'guide',
    category: 'getting-started',
    tags: ['profile', 'setup', 'beginner'],
    targetUsers: ['athlete', 'coach', 'parent'],
    readingTimeMinutes: 5,
    publishedAt: new Date('2026-01-15T00:00:00Z'),
    updatedAt: new Date('2026-01-15T00:00:00Z'),
    viewCount: 1250,
    helpfulCount: 89,
    notHelpfulCount: 3,
    isFeatured: true,
    isNew: true,
    isPublished: true,
  },
  {
    slug: 'uploading-your-first-video',
    title: 'Uploading Your First Highlight Video',
    excerpt: 'Step-by-step guide to uploading and showcasing your best highlights.',
    content: `<p>Videos are essential for recruiting. Here's how to upload and optimize your highlight reels.</p>
<h2>Supported Formats</h2>
<p>We support MP4, MOV, and WebM formats up to 500MB.</p>
<h2>Best Practices</h2>
<ul>
<li>Keep videos under 3 minutes</li>
<li>Lead with your best plays</li>
<li>Include your jersey number</li>
<li>Use good lighting and clear audio</li>
</ul>`,
    type: 'tutorial',
    category: 'athletes',
    tags: ['video', 'upload', 'highlights'],
    targetUsers: ['athlete'],
    readingTimeMinutes: 3,
    publishedAt: new Date('2026-01-10T00:00:00Z'),
    updatedAt: new Date('2026-01-12T00:00:00Z'),
    viewCount: 980,
    helpfulCount: 76,
    notHelpfulCount: 2,
    isFeatured: true,
    isPublished: true,
  },
  {
    slug: 'understanding-ncaa-rules',
    title: 'Understanding NCAA Recruiting Rules',
    excerpt: 'Everything you need to know about NCAA recruiting guidelines and timelines.',
    content: `<p>NCAA recruiting has specific rules that both athletes and coaches must follow. Understanding these rules is crucial for a successful recruiting process.</p>
<h2>Division I Timeline</h2>
<p>Coaches can start contacting athletes on June 15 after their sophomore year.</p>
<h2>Division II & III</h2>
<p>Different divisions have different contact rules and timelines.</p>
<h2>Official Visits</h2>
<p>You can take up to 5 official visits for Division I and unlimited for D-II and D-III.</p>`,
    type: 'article',
    category: 'recruiting',
    tags: ['ncaa', 'rules', 'recruiting'],
    targetUsers: ['athlete', 'parent', 'coach'],
    readingTimeMinutes: 8,
    publishedAt: new Date('2026-01-08T00:00:00Z'),
    updatedAt: new Date('2026-01-08T00:00:00Z'),
    viewCount: 2100,
    helpfulCount: 156,
    notHelpfulCount: 5,
    isFeatured: true,
    isPublished: true,
  },
  {
    slug: 'optimizing-your-athlete-profile',
    title: 'Optimizing Your Athlete Profile',
    excerpt: 'Tips and best practices for making your profile stand out to coaches.',
    content:
      '<p>Your profile is your digital first impression. Make it count by completing every section, uploading quality media, and keeping your stats up to date.</p>',
    type: 'guide',
    category: 'athletes',
    tags: ['profile', 'optimization', 'tips'],
    targetUsers: ['athlete'],
    readingTimeMinutes: 6,
    publishedAt: new Date('2026-01-05T00:00:00Z'),
    updatedAt: new Date('2026-01-05T00:00:00Z'),
    viewCount: 1850,
    helpfulCount: 134,
    notHelpfulCount: 4,
    isPublished: true,
  },
  {
    slug: 'premium-features-explained',
    title: 'Premium Features Explained',
    excerpt: 'Discover all the benefits included with your NXT1 Premium subscription.',
    content:
      '<p>NXT1 Premium unlocks powerful features designed to accelerate your recruiting journey and maximize your exposure to college coaches.</p>',
    type: 'article',
    category: 'subscription',
    tags: ['premium', 'subscription', 'features'],
    targetUsers: ['all'],
    readingTimeMinutes: 4,
    publishedAt: new Date('2026-01-03T00:00:00Z'),
    updatedAt: new Date('2026-01-03T00:00:00Z'),
    viewCount: 890,
    helpfulCount: 67,
    notHelpfulCount: 2,
    isPublished: true,
  },
  {
    slug: 'coach-recruitment-tools',
    title: 'Using Coach Recruitment Tools',
    excerpt: 'How to effectively use NXT1 to find and evaluate potential recruits.',
    content:
      '<p>Our coach tools make recruiting easier with smart filters, prospect boards, and AI-powered scouting reports.</p>',
    type: 'guide',
    category: 'coaches',
    tags: ['coach', 'recruiting', 'tools'],
    targetUsers: ['coach'],
    readingTimeMinutes: 7,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    viewCount: 650,
    helpfulCount: 48,
    notHelpfulCount: 1,
    isPublished: true,
  },
  {
    slug: 'supporting-your-athletes-recruitment',
    title: "Supporting Your Athlete's Recruitment",
    excerpt: "A parent's guide to navigating the recruiting process alongside your athlete.",
    content:
      '<p>The recruiting process can feel overwhelming for families. Here is how to be an effective support system without overstepping boundaries.</p>',
    type: 'guide',
    category: 'recruiting',
    tags: ['parent', 'recruiting', 'support'],
    targetUsers: ['parent'],
    readingTimeMinutes: 6,
    publishedAt: new Date('2026-01-14T00:00:00Z'),
    updatedAt: new Date('2026-01-14T00:00:00Z'),
    viewCount: 720,
    helpfulCount: 63,
    notHelpfulCount: 1,
    isFeatured: true,
    isPublished: true,
  },
  {
    slug: 'understanding-scholarship-offers',
    title: 'Understanding Scholarship Offers',
    excerpt: 'What to look for when your athlete receives a scholarship offer.',
    content:
      '<p>Scholarship offers can vary widely. This guide breaks down the different types and what to consider before committing.</p>',
    type: 'article',
    category: 'recruiting',
    tags: ['scholarship', 'offers', 'financial-aid'],
    targetUsers: ['parent', 'athlete'],
    readingTimeMinutes: 8,
    publishedAt: new Date('2026-01-06T00:00:00Z'),
    updatedAt: new Date('2026-01-06T00:00:00Z'),
    viewCount: 1430,
    helpfulCount: 112,
    notHelpfulCount: 3,
    isPublished: true,
  },
  {
    slug: 'discovering-hidden-gems',
    title: 'Discovering Hidden Gems on NXT1',
    excerpt: 'How to use advanced filters and AI scouting tools to find underrated talent.',
    content:
      "<p>NXT1's Moneyball Intelligence tools help you uncover prospects others overlook using AI-driven analysis and advanced filtering.</p>",
    type: 'guide',
    category: 'coaches',
    tags: ['scouting', 'filters', 'moneyball', 'AI'],
    targetUsers: ['recruiter', 'coach'],
    readingTimeMinutes: 7,
    publishedAt: new Date('2026-01-11T00:00:00Z'),
    updatedAt: new Date('2026-01-11T00:00:00Z'),
    viewCount: 540,
    helpfulCount: 45,
    notHelpfulCount: 1,
    isFeatured: true,
    isPublished: true,
  },
  {
    slug: 'building-your-prospect-board',
    title: 'Building Your Prospect Board',
    excerpt: 'Organize and track recruits with custom watchlists and prospect boards.',
    content:
      '<p>The Prospect Board helps you organize your recruiting pipeline effectively with custom watchlists and evaluation tools.</p>',
    type: 'guide',
    category: 'coaches',
    tags: ['prospect', 'watchlist', 'board', 'recruiting'],
    targetUsers: ['recruiter', 'coach'],
    readingTimeMinutes: 5,
    publishedAt: new Date('2026-01-09T00:00:00Z'),
    updatedAt: new Date('2026-01-09T00:00:00Z'),
    viewCount: 420,
    helpfulCount: 38,
    notHelpfulCount: 0,
    isPublished: true,
  },
  {
    slug: 'program-analytics-dashboard',
    title: 'Program Analytics Dashboard Guide',
    excerpt: "Track your program's performance with real-time analytics and reporting.",
    content:
      "<p>The Analytics Dashboard provides comprehensive insights into your program's recruiting and engagement metrics with real-time data.</p>",
    type: 'guide',
    category: 'teams',
    tags: ['analytics', 'dashboard', 'program', 'metrics'],
    targetUsers: ['director', 'coach'],
    readingTimeMinutes: 6,
    publishedAt: new Date('2026-01-07T00:00:00Z'),
    updatedAt: new Date('2026-01-07T00:00:00Z'),
    viewCount: 310,
    helpfulCount: 29,
    notHelpfulCount: 0,
    isFeatured: true,
    isPublished: true,
  },
  {
    slug: 'managing-multi-team-organizations',
    title: 'Managing Multi-Team Organizations',
    excerpt:
      'Set up and manage multiple teams, staff roles, and permissions within your organization.',
    content:
      '<p>Organize your entire program with multi-team management tools for staff roles, permissions, and cross-team coordination.</p>',
    type: 'guide',
    category: 'teams',
    tags: ['teams', 'organization', 'permissions', 'staff'],
    targetUsers: ['director', 'team-admin'],
    readingTimeMinutes: 8,
    publishedAt: new Date('2026-01-04T00:00:00Z'),
    updatedAt: new Date('2026-01-04T00:00:00Z'),
    viewCount: 280,
    helpfulCount: 24,
    notHelpfulCount: 1,
    isPublished: true,
  },
  {
    slug: 'sending-recruiting-emails',
    title: 'How to Send Recruiting Emails',
    excerpt: 'Use Agent X to draft and send personalized emails to college coaches.',
    content:
      '<p>Agent X can help you craft effective recruiting emails tailored to each program, saving you time and increasing your response rate.</p>',
    type: 'guide',
    category: 'recruiting',
    tags: ['email', 'recruiting', 'agent-x', 'outreach'],
    targetUsers: ['athlete'],
    readingTimeMinutes: 5,
    publishedAt: new Date('2026-01-13T00:00:00Z'),
    updatedAt: new Date('2026-01-13T00:00:00Z'),
    viewCount: 1120,
    helpfulCount: 95,
    notHelpfulCount: 2,
    isPublished: true,
  },
  {
    slug: 'managing-your-team-roster',
    title: 'Managing Your Team Roster',
    excerpt: 'Add athletes, assign positions, and keep your roster up to date.',
    content:
      '<p>Keep your team organized with roster management tools for adding athletes, assigning positions, and tracking player development.</p>',
    type: 'guide',
    category: 'teams',
    tags: ['team', 'roster', 'athletes', 'management'],
    targetUsers: ['coach', 'team-admin'],
    readingTimeMinutes: 4,
    publishedAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    viewCount: 480,
    helpfulCount: 42,
    notHelpfulCount: 0,
    isPublished: true,
  },
];

// ─── Seed Data: FAQs ──────────────────────────────────────────────────────────
const SEED_FAQS = [
  {
    question: 'How do I reset my password?',
    answer:
      '<p>Go to Settings > Account > Change Password. You can also use the "Forgot Password" link on the login screen.</p>',
    category: 'account',
    targetUsers: ['all'],
    order: 1,
    helpfulCount: 234,
    isPublished: true,
  },
  {
    question: 'Can coaches see my profile without Premium?',
    answer:
      '<p>Yes, coaches can view basic profile information. Premium unlocks enhanced visibility, priority placement in search results, and direct messaging.</p>',
    category: 'recruiting',
    targetUsers: ['athlete', 'parent'],
    order: 2,
    helpfulCount: 189,
    isPublished: true,
  },
  {
    question: 'What video formats are supported?',
    answer:
      '<p>We support MP4, MOV, and WebM formats. Maximum file size is 500MB, and videos should be under 10 minutes for best results.</p>',
    category: 'athletes',
    targetUsers: ['athlete'],
    order: 3,
    helpfulCount: 156,
    isPublished: true,
  },
  {
    question: 'How do I cancel my subscription?',
    answer:
      '<p>Go to Settings > Subscription > Manage Subscription. You can cancel anytime and retain access until the end of your billing period.</p>',
    category: 'subscription',
    targetUsers: ['all'],
    order: 4,
    helpfulCount: 98,
    isPublished: true,
  },
  {
    question: 'Is my personal information secure?',
    answer:
      '<p>Yes, we use industry-standard encryption and never share your personal information with third parties without your consent.</p>',
    category: 'account',
    targetUsers: ['all'],
    order: 5,
    helpfulCount: 167,
    isPublished: true,
  },
  {
    question: 'How do I add team members?',
    answer:
      '<p>Go to your Team page > Settings > Invite Members. You can invite coaches, staff, and athletes via email.</p>',
    category: 'teams',
    targetUsers: ['coach', 'team-admin'],
    order: 6,
    helpfulCount: 78,
    isPublished: true,
  },
  {
    question: "Can I manage my child's profile?",
    answer:
      "<p>Yes. Parents can be linked to their athlete's account to help manage profile content, review messages, and monitor recruiting activity.</p>",
    category: 'recruiting',
    targetUsers: ['parent'],
    order: 7,
    helpfulCount: 145,
    isPublished: true,
  },
  {
    question: 'How do I create a prospect watchlist?',
    answer:
      '<p>Navigate to the Prospect Board, click "Create Watchlist", and start adding athletes by searching or browsing profiles.</p>',
    category: 'coaches',
    targetUsers: ['recruiter', 'coach'],
    order: 8,
    helpfulCount: 92,
    isPublished: true,
  },
  {
    question: 'How do I set up team permissions?',
    answer:
      '<p>Go to Team Settings > Roles & Permissions. You can assign Admin, Coach, or Viewer roles to each staff member.</p>',
    category: 'teams',
    targetUsers: ['director', 'team-admin'],
    order: 9,
    helpfulCount: 56,
    isPublished: true,
  },
  {
    question: 'How do I use Agent X for recruiting emails?',
    answer:
      '<p>Open Agent X and describe what you need — for example, "Send my stats to every D2 coach in Ohio." Agent X will draft and send personalized emails on your behalf.</p>',
    category: 'recruiting',
    targetUsers: ['athlete'],
    order: 10,
    helpfulCount: 178,
    isPublished: true,
  },
  {
    question: 'What are scout reports?',
    answer:
      "<p>Scout reports are AI-generated evaluations of an athlete's physical, technical, and mental abilities with percentile rankings and tier classifications.</p>",
    category: 'coaches',
    targetUsers: ['coach', 'recruiter'],
    order: 11,
    helpfulCount: 88,
    isPublished: true,
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const sanitizedUri = mongoUri!.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
  console.log(`\n🔌 Connecting to MongoDB: ${sanitizedUri}`);
  await mongoose.connect(mongoUri!);
  console.log('✅ Connected\n');

  try {
    if (doDelete) {
      console.log('🗑️  Deleting existing help center data...');
      const artResult = await HelpArticleModel.deleteMany({});
      const faqResult = await HelpFaqModel.deleteMany({});
      console.log(
        `   Deleted ${artResult.deletedCount} articles, ${faqResult.deletedCount} FAQs\n`
      );
    }

    // Upsert articles
    console.log(`📝 Seeding ${SEED_ARTICLES.length} articles...`);
    let upsertedArticles = 0;
    for (const article of SEED_ARTICLES) {
      const result = await HelpArticleModel.updateOne(
        { slug: article.slug },
        { $set: article },
        { upsert: true }
      );
      if (result.upsertedCount > 0) upsertedArticles++;
    }
    console.log(
      `   ✅ ${upsertedArticles} new, ${SEED_ARTICLES.length - upsertedArticles} updated\n`
    );

    // Upsert FAQs
    console.log(`❓ Seeding ${SEED_FAQS.length} FAQs...`);
    let upsertedFaqs = 0;
    for (const faq of SEED_FAQS) {
      const result = await HelpFaqModel.updateOne(
        { question: faq.question },
        { $set: faq },
        { upsert: true }
      );
      if (result.upsertedCount > 0) upsertedFaqs++;
    }
    console.log(`   ✅ ${upsertedFaqs} new, ${SEED_FAQS.length - upsertedFaqs} updated\n`);

    // Verify
    const totalArticles = await HelpArticleModel.countDocuments();
    const totalFaqs = await HelpFaqModel.countDocuments();
    console.log(`📊 Totals: ${totalArticles} articles, ${totalFaqs} FAQs`);
    console.log('\n✅ Help center seed complete!\n');
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
