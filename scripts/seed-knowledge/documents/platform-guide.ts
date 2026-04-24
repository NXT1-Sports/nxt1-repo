import type { KnowledgeIngestionRequest } from '@nxt1/core/ai';

export const PLATFORM_GUIDE_DOC: Omit<KnowledgeIngestionRequest, 'chunkSize' | 'chunkOverlap'> = {
  title: 'NXT1 Platform Guide — What NXT1 Is and How It Works',
  category: 'platform_guide',
  source: 'manual',
  sourceRef: 'nxt1://platform-guide/overview',
  content: `# NXT1 Platform Guide

## What NXT1 Is

NXT1 is a sports intelligence platform. It is not a social network, a recruiting database, or a scheduling tool — it is an AI-powered command center that actively works on behalf of athletes, coaches, and sports programs. The platform is built around a single core idea: sports professionals should be able to describe what they need in plain language and have an intelligent system execute it.

The primary interface is **Agent X**, an AI agent that runs operations, delivers intelligence, and coordinates workflows across the entire platform. Users do not navigate menus to accomplish tasks — they instruct Agent X and it acts.

NXT1's brand tagline is **"The Future of Sports Intelligence."** Every feature is built with sport-specific context: position-aware analysis, sport-specific terminology, and an understanding of the real pressures athletes and coaches face.

## User Roles

NXT1 has three user roles. Each role sees a different version of the platform tuned to their needs.

**Athlete** — A student athlete or competitive player. Athletes use NXT1 to build their sports profile, access AI-driven performance intelligence, and communicate with coaches and programs. Agent X helps athletes understand their data, prepare for evaluations, and manage their sports career.

**Coach** — A high school coach, club coach, travel coach, or independent trainer. Coaches use NXT1 to manage their team roster, track athlete development, communicate with players and parents, and coordinate schedules and media. Agent X helps coaches analyze team performance, draft communications, build game plans, and generate progress reports for individual athletes.

**Director** — A program director or athletic administrator — for example, the athletic director of a high school, the head of a club program, or the administrator of a travel or JUCO organization. Directors manage multiple teams under a single program umbrella and have broader oversight than a Coach. Agent X gives Directors program-level analytics and coordination tools across their full organization.

When signing up, every user selects one of these three roles. The role shapes the Agent X quick commands shown, the dashboard layout, and what actions are available. Role selection happens during onboarding and can be updated in account settings.

## Core Navigation

NXT1 is organized around a set of primary sections. The bottom tab bar on mobile gives quick access to the most-used destinations; the full set of sections is accessible via the sidenav (swipe from the left or tap the menu icon).

**Agent X** — The command center. The primary interface of the platform. Where you interact with Agent X, review active background operations, check your daily briefing, and execute quick tasks. Agent X is also accessible by tapping the Agent X button anywhere in the app.

**Athlete Profile** — Your public-facing sports profile. Includes career stats, media (highlight reels, photos), achievements, and contact information. For athletes, this is what coaches and programs evaluate. Coaches and Directors also have profiles showing their program and credentials.

**Team Profile** — Team pages showing roster, stats, media, and program information. Coaches and Directors manage their team from here. Athletes view the teams they belong to.

**Activity (Notifications)** — Your notification feed. Incoming messages, team updates, Agent X operation completions, profile views, and platform alerts all appear here.

**Add Sport / Team** — Quick action to add a new sport to your profile or join a new team via team code. Athletes can belong to multiple teams (e.g., a high school team and a club team simultaneously).

**Invite** — Referral and sharing tools. Invite teammates, coaches, or contacts to join NXT1. Accessible from the sidenav.

**Billing & Usage** — Your usage dashboard. View current wallet balance, current spend, payment history, saved payment methods, and (for organizations) team budget allocations. Accessible from the sidenav.

**Settings** — Account settings, privacy controls, notification preferences, connected accounts, and data management. Accessible from the sidenav.

**Help Center** — AI-powered help articles, FAQs, video tutorials, and direct support. Accessible from the sidenav.

## Onboarding Flow

New users complete a short onboarding sequence when they first sign up:

1. Select role (Athlete, Coach, or Director)
2. Add sport and position
3. Complete profile basics (name, school or program, graduation year for athletes)
4. Connect with a team (optional, can be done later via team code)
5. Receive a personalized Agent X welcome briefing

Onboarding takes approximately three minutes. The platform is usable immediately after completing the role selection step — the remaining steps improve the quality of Agent X responses and team features.

## Platform Philosophy

NXT1 is active, not passive. Most sports platforms require users to initiate every action. NXT1's model is different: Agent X monitors your profile, your team, and your sport and proactively surfaces intelligence, flags opportunities, and executes tasks in the background. The result is a platform that works while you practice, compete, and sleep.

---

## Profile Structure

Every user profile is organized into three tabs:

**Intel** — The AI intelligence layer. This is where the Agent X Intel Report lives — a multi-section AI-authored analysis of the athlete's performance, recruiting status, academics, video highlights, and awards. The Intel tab is the first thing many coaches see when visiting an athlete's profile. Each section has a narrative by Agent X plus cited data points from connected sources.

**Timeline** — The social activity feed for the profile. Posts, shared clips, milestone announcements, and public updates from the profile owner. Works like a professional sports-specific feed for this individual.

**Connect** — Contact and recruiting connection details. Allows coaches and programs to express interest and initiate contact. For athletes, this is where recruiting outreach is managed.

### Edit Profile — Sections (Athletes)

When athletes edit their own profile, updates are organized into these sections:

| Section | What It Contains |
|---------|-----------------|
| **Basic Info** | Name, username, bio, graduation year, location |
| **Photos** | Profile photo, cover/banner photo |
| **Sports Info** | Sport(s), position(s), years of experience, team affiliations |
| **Academics** | GPA, test scores (SAT/ACT), school name, intended major |
| **Physical** | Height, weight, combine measurements, athletic metrics |
| **Contact** | Email, phone, preferred contact method, public availability |
| **Preferences** | Privacy settings, notification preferences, display options |

### Manage Team — Sections (Coaches & Directors)

Coaches and Directors manage their team through the Manage Team interface, organized into tabs and sections:

**Tabs:** Overview · Roster · Schedule · Stats · Staff · Sponsors

| Section | What It Controls |
|---------|-----------------|
| **Team Info** | Team name, mascot, abbreviation, sport, season, colors |
| **Roster** | View and manage all players — name, number, position, class year, height/weight |
| **Schedule** | Games, practices, and events with date, time, location, opponent, home/away |
| **Stats** | Team aggregated stats for the season |
| **Staff** | Coaches and support staff on the team |
| **Sponsors** | Sponsor names, logos, and links |
| **Images** | Team photos, banners, and media assets |
| **About** | Team bio and program description |
| **Contact** | Team contact information and public details |
| **Accounts** | Connected accounts and data integrations for the team |

### Connected Sources

Connecting external platforms to your NXT1 profile powers Agent X with more — more data, more context, and more accurate intelligence. When you link a source, Agent X can automatically pull in your stats, film, rankings, and evaluations and use that data in everything it does for you: generating intel reports, finding college matches, drafting recruiting emails, and building performance analysis.

Connected sources can be linked globally (apply to all your sports) or scoped to a specific sport or team.

**Supported platforms include:**
- MaxPreps — high school stats and game logs
- Hudl — video highlights and film
- 247Sports, Rivals, On3 — recruiting ratings and rankings
- Perfect Game, Prep Baseball Report — baseball-specific evaluations
- NCSA Athletic Recruiting — recruiting profiles
- USA Football — football-specific data

To connect a source, go to your profile → Edit Profile → Sports Info → Connected Sources, or ask Agent X: *"Connect my MaxPreps profile."*

Data from connected sources is labeled with a verified badge and the platform's favicon in your intelligence views, so coaches can see exactly where each number came from.

---

## Adding Sports and Teams

**Add Sport** — Users can add multiple sports to their profile. Navigate to Add Sport from the app's navigation or ask Agent X. The wizard guides you through selecting the sport, adding a position, and connecting any relevant external platforms.

**Add Team** — Joining or creating a new team is done through the same wizard. Athletes can belong to multiple teams simultaneously (e.g., a high school varsity team and a club team). Coaches and Directors can manage multiple teams. See the Teams guide for full details on joining and creating teams.

---

## Settings Overview

Settings are organized into six sections:

| Section | What It Controls |
|---------|----------------|
| **Account** | Email, password, role, biometrics, sign-out, account deletion |
| **Preferences** | Dark/light mode, notifications, language, display options, privacy, profile visibility |
| **Billing** | Payment methods, wallet management, transaction history, credits |
| **Tools** | Connected accounts, data sync settings, platform integrations |
| **Support** | Access to Help Center, submit a support ticket, app version info |
| **Legal** | Terms of Service, Privacy Policy |
`.trim(),
};
