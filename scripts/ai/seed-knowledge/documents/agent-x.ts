import type { KnowledgeIngestionRequest } from '@nxt1/core/ai';

export const AGENT_X_DOC: Omit<KnowledgeIngestionRequest, 'chunkSize' | 'chunkOverlap'> = {
  title: 'Agent X — Capabilities, Commands, and How It Works',
  category: 'platform_guide',
  source: 'manual',
  sourceRef: 'nxt1://platform-guide/agent-x',
  content: `# Agent X

## What Agent X Is

Agent X is the AI core of the NXT1 platform. It is not a chatbot — it is an autonomous agent that executes multi-step operations, runs background tasks, and delivers proactive intelligence without waiting to be asked. The name is always "Agent X." Never refer to it as "the AI assistant," "the chatbot," or "the virtual assistant."

Agent X is accessible from anywhere in the platform via the floating action button (FAB) in the bottom right corner of the screen, or by navigating directly to the Agent X section from the main navigation.

## How to Invoke Agent X

There are three ways to interact with Agent X:

**Quick Tasks** — Pre-built commands shown on the Agent X home screen, personalized by role. Tap any quick task to execute it instantly. Quick tasks are the fastest way to run common operations.

**Free-form chat** — Type any request in plain language in the chat input. Agent X understands sport-specific context, can ask clarifying questions, and breaks complex requests into sub-tasks automatically. There is no special syntax required.

**Daily Briefing** — Every morning, Agent X prepares a personalized briefing delivered to the command center. It summarizes what matters today: upcoming games or practices, profile activity, team updates, and any recommended actions.

## Quick Tasks by Role

Quick tasks are different for each role. They appear as tap-to-run cards on the Agent X command center and are pre-loaded with a prompt tailored to that role's actual day-to-day needs.

Quick tasks for **Athletes** include:
- Find My Best College Matches — personalized college program recommendations based on your profile
- Improve My Profile — AI feedback on what coaches see and what's missing
- Draft Recruiting Email — write a professional outreach introduction to college coaches
- My Recruiting Timeline — create a personalized action plan based on graduation year

Quick tasks for **Coaches** (high school, club, travel, and independent coaches) include tasks focused on **team management and athlete development** — not college recruiting. Coaches use Agent X to manage their roster, analyze team performance, communicate with athletes and parents, and coordinate schedule and media. Examples:
- Analyze my team's recent performance and identify development priorities
- Draft a team communication or practice announcement
- Generate a progress summary for an individual athlete
- Help me build a game-plan or scouting report on an upcoming opponent

Quick tasks for **Directors** (athletic directors and program administrators at the high school, club, travel, or JUCO level) include program-level oversight and coordination tasks:
- Roster Analysis — identify gaps and composition across teams in the program
- Program Performance Summary — aggregate analytics across all teams
- Draft a program-wide communication or announcement
- Build an intelligence report on the program's current roster

## How Agent X Processes a Request

Understanding how Agent X works under the hood helps users trust the platform and set the right expectations.

When you send a message or tap a quick task, the following happens:

1. **The Chief of Staff (Planner) receives your request.** It reads your full intent and breaks it into the smallest independent sub-tasks possible.
2. **Each sub-task is assigned to a specialist coordinator.** Agent X has several coordinators, each with a specific domain:
   - **Recruiting Coordinator** — drafts outreach emails, builds college target lists, searches transfer portal, tracks responses
   - **Performance Coordinator** — analyzes film, writes scout reports, generates Agent X Intel reports, compares prospects, tracks athletic progression
   - **Brand & Media Coordinator** — generates graphics, cuts highlight reels, creates social media content, designs promo materials
   - **Data Coordinator** — scrapes and imports stats from MaxPreps, Hudl, 247Sports, and other linked platforms; syncs roster data
   - **Compliance Coordinator** — validates governing body rules (NCAA, NAIA, NJCAA), checks eligibility, flags potential violations
   - **General Assistant** — platform help, sports Q&A, anything that doesn't need a specialist
3. **Coordinators run in parallel when possible**, or in sequence when one depends on another's output. Example: analyzing a highlight tape must finish before drafting a personalized email about it.
4. **Long tasks become background operations.** When a task takes more than a few seconds it runs in the background. The operation moves through a live status sequence visible on the command center:
   - **Queued** → waiting to start
   - **Thinking** → the Chief of Staff is planning sub-tasks
   - **Acting** → coordinators are executing tools (importing stats, drafting emails, generating graphics, etc.)
   - **Awaiting Input** → Agent X needs more information from you before it can continue; a prompt appears in the chat
   - **Awaiting Approval** → Agent X is about to perform an action (e.g., send an email) and needs your sign-off first
   - **Streaming Result** → operation is finishing and result is being written back
   - **Completed** → done; result is available
   - **Failed / Cancelled** → the operation did not complete; you can retry
5. **You get notified when it's done.** A notification arrives in Activity when the operation completes. Results appear in the relevant section (your profile, messages, media library).

You do not need to wait or stay on the Agent X screen. Navigate freely — Agent X works while you do other things.

**Important:** Every request goes through this same pipeline whether you type freely in chat or tap a quick task. There is no separate "manual" mode. If something can be done on NXT1, you can ask Agent X to do it.

## Weekly Playbooks

Agent X generates a weekly playbook every Monday morning. A playbook is a structured set of prioritized action items tailored to your role and current goals. Each playbook item has an action button — tapping it executes the action via Agent X immediately.

Playbooks are not static checklists. Agent X updates them mid-week based on new activity, upcoming events, and unfinished items from the previous period.

## Daily Briefings

The daily briefing is a proactive morning summary Agent X prepares automatically. It appears at the top of the Agent X command center. Contents vary by role but typically include:

- Alerts for profile views or incoming messages (athletes)
- Roster activity or upcoming events (coaches)
- New athlete matches or prospect updates (directors)
- Recommended Agent X actions for the day

Briefings are generated fresh each morning based on real platform data. They are not generic — each briefing is specific to the user's current situation.

## Agent X Coordinator Panels

The Agent X command center is organized into **coordinator panels** — specialized AI coordinators, each with a domain-specific set of quick commands and scheduled actions. The panels shown depend on the user's role.

### Coordinator Panels for Athletes

Athletes see four coordinator panels on their command center:

**Recruiting Coordinator**
Your recruiting strategist. Commands include: Find College Programs, Draft Coach Email, My Recruiting Timeline, Eligibility Check, Target List, Compare Schools, Camp Finder, Follow-Up Plan, Coach Fit, Email Follow-Ups, Visit Checklist, Roster Opportunity, Division Match, Contact Calendar, Showcase Strategy, Recruiting Notes.
Scheduled actions: Weekly Coach Outreach, Target List Review, Eligibility Check (monthly), Timeline Reminder.

**Media Coordinator**
Your brand and content strategist. Commands include: Create Post, Highlight Reel, Brand Strategy, Gameday Graphic, Commitment Edit, Caption Pack, Profile Audit, Weekly Content Plan, Media Day Shotlist, Short Form Clips, Offer Announcement, Photo Selects, Story Sequence, Brand Voice, Highlight Hook, Post Schedule.
Scheduled actions: Weekly Content Drop, Monthly Highlight Update, Monthly Social Audit, Weekly Story Batch.

**Scout Coordinator**
Your performance intelligence HQ. Commands include: Scout Report, Analyze Film, Stat Trends, Position Benchmark, Strengths Snapshot, Improvement Plan, Opponent Breakdown, Season Progress, Metric Breakdown, Film Cutups, Trait Ranking, Game Grades, Recruiter Summary, Athletic Profile, Consistency Report, Next Game Focus.
Scheduled actions: Weekly Stat Update, Monthly Scout Report, Weekly Film Breakdown, Bi-Weekly Performance Review.

**Academics Coordinator**
Your eligibility and academic support. Commands include: GPA Tracker, Eligibility Check, Test Prep (SAT/ACT), Course Planner, Transcript Review, Core Courses, Study Plan, Tutor Finder, Credit Check, Semester Roadmap, Eligibility Deadlines, AP Study Plan, Testing Calendar, Grade Recovery, Academic Resume, Advisor Questions.
Scheduled actions: Weekly GPA Check, Test Prep Reminder, Monthly Eligibility Verify, Semester Transcript Review.

---

### Coordinator Panels for Coaches and Directors

Coaches and Directors see four different coordinator panels focused on team management rather than personal recruiting:

**Roster Manager**
View and manage the full roster. Commands include: View Roster, Add Athlete, Roster Gaps, Depth Chart, Graduation Risk, Position Needs, Lineup Planner, Player Notes, Returners Board, Redshirt Plan, Position Battles, Leadership Group, Practice Units, Scholarship Balance, Roster Summary, Development Trackers.
Scheduled actions: Weekly Roster Review, Tryout Reminders, Depth Chart Update, Injury Report Check.

**Scouting Coordinator**
Discover and evaluate recruits. Commands include: Find Recruits, Prospect Board, Evaluate Prospect, Watchlist Update, Region Search, Compare Prospects, Fit Score, Contact Queue, Scouting Board, Evaluation Queue, Transfer Watch, Character Check, Live Viewing Plan, Recruit Map, Offer Readiness, Scheme Fits.
Scheduled actions: Weekly Prospect Scan, Evaluation Review, Pipeline Update, Board Cleanup.

**Media Coordinator (Team)**
Create team content and branded media. Commands include: Team Post, Team Graphics, Team Highlights, Schedule Graphic, Commitment Post, Gameday Hype, Recap Carousel, Season Brand Kit, Recruit Edit Pack, Player Feature, Visit Content, Practice Recap, Signed Graphic, Content Calendar, Photo Day Plan, Brand Approvals.
Scheduled actions: Weekly Content Plan, Gameday Graphic Drops, Monthly Season Recap, Weekly Social Analytics.

**Recruiting Coordinator (Team)**
Build and manage your recruiting pipeline. Commands include: Recruiting Plan, Contact Recruits, Target Class, Compliance Check, Visit Tracker, Offer Board, Pipeline Review, Weekly Priorities, Visit Weekend Plan, Board By Position, Outreach Sequences, Decision Watch, Coach Assignments, Recruiting Calendar, Visit Feedback, Commitment Forecast.
Scheduled actions: Weekly Outreach Batch, Pipeline Review, Compliance Calendar, Camp Scout.

---

## Scheduled Actions (Recurring Automations)

Every coordinator panel has a set of **Scheduled Actions** — recurring automations that Agent X can run on a set schedule (daily, weekly, bi-weekly, monthly) without you having to ask each time.

Examples of what can be scheduled:
- Auto-send recruiting emails to new target coaches every week
- Generate a monthly scout report for your profile
- Refresh your depth chart weekly
- Review your recruiting pipeline bi-weekly
- Send team members a weekly practice update draft

To set up a scheduled action, open the coordinator panel, tap the scheduled action you want, and configure the frequency. You can view all active recurring tasks in the command center under **Active Operations**, and cancel them at any time.

> Agent X never sends emails or posts publicly on a scheduled action without an approval step unless you have explicitly enabled autonomous send for that action.

---

## What Agent X Can Do — Full Capabilities


Agent X has tools across every part of the platform. These are the concrete, user-facing operations it can perform:

### Profile Data — Reading & Writing
Agent X can read and write real data to your NXT1 profile on your behalf. This means you can tell Agent X to fill in your profile sections in plain language and it will do it:

- **Write season stats** — save game-level or season-level stats for any sport
- **Write combine metrics** — height, weight, wingspan, 40-yard dash, vertical, etc.
- **Write awards & honors** — save individual or team awards to your profile
- **Write recruiting activity** — log school interest, visits, conversations, and offers
- **Write schedule** — add games, practices, and events to your calendar
- **Write rankings** — record recruiting ratings from services like 247Sports, On3, Rivals
- **Write connected sources** — link third-party platforms (MaxPreps, Hudl, etc.) to your profile
- **Write core identity fields** — update your primary sport, position, graduation year, and other profile basics
- **Link videos to your profile** — associate uploaded clips with your athlete video section

### Team Data
- **Write team stats** — update aggregate stats for a team
- **Write team roster entries** — add or update players on a team roster
- **Write team news** — post real team news or announcements to a team profile
- **Post on behalf of a team** — create team timeline posts

### Intel Reports
Agent X can generate and refresh AI-authored Intel Reports that appear on the **Intel tab** of any athlete or team profile. These reports go beyond raw stats — Agent X tells a complete story combining verified third-party data, self-reported profile information, and its own analysis.

- **Generate athlete intel report** — create a full AI-authored intelligence report for an athlete profile. Sections include: Agent X Brief, Season Stats, Game Logs, Recruiting Status, Physical Measurements, Academic Profile, Video Highlights, and Awards. Each section has a narrative, structured data points, and citations back to the source platform.
- **Update / refresh intel report** — regenerate the report with the latest data when it becomes stale (reports expire after 30 days)
- **Generate team intel report** — create the same for a team profile, covering roster composition, team performance, and program stats

Intel Reports include **missing data prompts** — if key data is unavailable, the report surfaces action buttons routing the user to fill the gap (e.g. "Connect your Hudl account to include video highlights"). Reports are visible to the profile owner and coaches on shared teams.

### Email
- **Draft recruiting emails** — write a personalized outreach email to a college coach
- **Send emails** — requires your explicit approval before sending; Agent X will show you the draft and ask for sign-off first. It will never send anything without confirmation.

### Video — AI-Powered Editing (Runway)
- **Generate AI video** — create a new video from a text prompt or reference image
- **Edit a video with AI** — transform or enhance an existing video using a text instruction
- **Upscale a video** — improve the resolution and quality of an existing clip
- **Check AI video task status** — the AI video operations run asynchronously; Agent X monitors their progress

### Video — Highlight & Clip Management (Cloudflare Stream)
- **Clip a video** — trim a longer video to a specific time range
- **Generate auto-captions** — add closed captions to any uploaded video
- **Generate thumbnail** — create a still image thumbnail from any point in a video
- **Import video from URL** — bring in a video hosted externally (Hudl, YouTube, etc.)
- **Get video details** — look up metadata, duration, and status of an uploaded video
- **Create signed viewing URL** — generate a secure, time-limited URL to share a private video
- **Enable download** — make a video available for download
- **Manage watermark** — apply or remove a watermark profile
- **Delete video** — permanently remove a video from your library
- **Analyze video** — watch a video and extract insights

### Graphic Generation
- **Generate a graphic** — create a custom image or social media graphic using AI based on a text description

### Timeline & Social
- **Write a timeline post** — compose and publish a post to your NXT1 activity timeline
- **Scan timeline posts** — read recent activity on a user's timeline to inform other operations

### College & Coach Research
- **Search colleges** — find college programs by name, sport, division, state, and other criteria
- **Search college coaches** — look up coaches at specific schools or by sport
- **Get college logos** — retrieve branding assets for a school
- **Get conference logos** — retrieve conference branding assets

### Web & Social Research
- **Search the web** — run a live internet search on any topic
- **Scrape a web page** — read the content of any publicly accessible URL
- **Extract structured data from a web page** — pull specific data fields from a site
- **Map a website** — discover all pages at a given domain
- **Apify actors** — run specialized scrapers and automations for specific platforms
- **Scrape Instagram** — pull public profile or post data from Instagram
- **Scrape Twitter/X** — pull public profile or post data from Twitter/X

### Platform Data
- **Search NXT1** — search users, athletes, coaches, and teams on the platform
- **Query platform data** — run structured queries on NXT1 data

### Recurring Tasks & Scheduling
- **Schedule a recurring task** — set Agent X to run an operation on a repeating schedule (e.g., weekly performance summary every Monday)
- **List recurring tasks** — see what scheduled operations are active
- **Cancel a recurring task** — stop a scheduled automation

### Memory
Agent X maintains memory across sessions. It remembers key facts about you — your goals, preferences, schools of interest, and context from past conversations. It can also be told to save or forget specific things:
- **Save memory** — remember a specific fact for future sessions
- **Search memory** — recall relevant context from past interactions
- **Delete memory** — forget a specific remembered fact

---

## Terminology Reference

Use these terms correctly when discussing Agent X:

- Correct: **Agent X** — Always. Never "AI," "bot," or "assistant"
- Correct: **operations** — Tasks Agent X executes. Never "jobs" or "processes"
- Correct: **command center** — The Agent X home screen. Never "dashboard" in this context
- Correct: **briefing** — The daily morning summary. Never "report" or "digest"
- Correct: **playbook** — The weekly structured action plan. Never "to-do list"
`,
};
