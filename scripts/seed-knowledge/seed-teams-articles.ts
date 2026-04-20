/**
 * Seed Script — Teams & Programs Help Center Articles
 *
 * Creates 3 articles in the helpArticles collection:
 *   A. Creating and Managing Your Team
 *   B. Joining a Team on NXT1
 *   H. Setting Up a Club or Travel Program
 *
 * Idempotent: upserts by slug. Safe to re-run.
 *
 * Usage (from monorepo root):
 *   MONGO="..." npx tsx scripts/seed-knowledge/seed-teams-articles.ts
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

// ─── Seed Runner ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('🏆 NXT1 Help Center — Teams & Programs Articles Seed');
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
