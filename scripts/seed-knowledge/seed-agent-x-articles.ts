/**
 * Seed Script — Agent X & AI Help Center Articles (Tier 1)
 *
 * Creates 3 articles in the helpArticles collection:
 *   1. How Agent X Works — Operations, Status, and What to Expect
 *   2. Your Daily Briefing and Weekly Playbook
 *   3. How to Talk to Agent X — Writing Effective Commands
 *
 * Idempotent: upserts by slug. Safe to re-run.
 *
 * Usage (from monorepo root):
 *   MONGO="..." npx tsx scripts/seed-knowledge/seed-agent-x-articles.ts
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

// ─── Seed Runner ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('🤖 NXT1 Help Center — Agent X & AI Articles Seed (Tier 1)');
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
