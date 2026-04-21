/**
 * Seed Script — Getting Started Help Center Articles
 *
 * Creates 4 articles in the helpArticles collection:
 *   1. Welcome to NXT1 (all users)
 *   2. Quick-Start: Athletes
 *   3. Quick-Start: Coaches
 *   4. Quick-Start: Program Directors
 *
 * Idempotent: upserts by slug. Safe to re-run.
 *
 * Usage (from monorepo root):
 *   MONGO="..." npx tsx scripts/seed-knowledge/seed-getting-started-articles.ts
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
  // ARTICLE 1: Welcome to NXT1 (all users)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'welcome-to-nxt1',
    title: 'Welcome to NXT1 — Your Sports Intelligence Command Center',
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
      metaTitle: 'Welcome to NXT1 — Getting Started with Your Sports Intelligence Command Center',
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

// ─── Seed Runner ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('📝 NXT1 Help Center — Getting Started Articles Seed');
  console.log('══════════════════════════════════════════════════════');
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

  console.log('\n══════════════════════════════════════════════════════');
  console.log('📊 Seed Complete');
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Duration: ${duration}s`);
  console.log('══════════════════════════════════════════════════════\n');

  await disconnectFromMongoDB();
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
