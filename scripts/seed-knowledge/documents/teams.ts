import type { KnowledgeIngestionRequest } from '@nxt1/core/ai';

export const TEAMS_DOC: Omit<KnowledgeIngestionRequest, 'chunkSize' | 'chunkOverlap'> = {
  title: 'Teams and Program Management on NXT1',
  category: 'platform_guide',
  source: 'manual',
  sourceRef: 'nxt1://platform-guide/teams',
  content: `# Teams and Program Management

## What Teams Are

A Team on NXT1 is a shared workspace for a roster of athletes managed by one or more coaches or directors. Teams connect athletes and coaches on a single platform where they can share media, communicate, access combined analytics, and coordinate activities.

Teams are created by Coaches or Directors. Athletes join teams using a unique team code or via a direct invitation link.

## Creating a Team

Only **Coach** and **Director** role users can create teams. To create a team:

1. Navigate to the Teams section from main navigation
2. Tap "Create Team"
3. Enter team name, sport, and optional season/year information
4. The platform generates a unique 6-character team code automatically
5. Share the code with athletes to invite them

A team can represent any type of program: high school team, club team, travel squad, college program, or training group. The sport selection determines what stats fields and performance metrics are available for the team.

## Joining a Team

Athletes join teams in one of two ways:

**Via invite link** — The coach or director sends an invite link through any channel (SMS, WhatsApp, email, QR code, etc.). The athlete taps the link, signs up or signs in, and is automatically placed on the team. No code entry or manual confirmation needed.

**Via team code** — If the athlete has the 6-character code, they can go to Add Sport / Team and enter it manually to request to join.

An athlete can belong to multiple teams simultaneously (e.g., a high school team and a club team). Each team membership is listed separately in the Teams section.

## Roster Management

Coaches and Directors with admin access to a team can:

- View the full roster with each athlete's profile and stats
- Remove athletes from the roster
- View at-a-glance performance summaries for all roster members
- Track player status (active, inactive, injured, pending, invited)

Roster data is pulled directly from each athlete's NXT1 profile. Athletes control what is public vs. visible only to their teams.

## Coach vs. Director on a Team

Both Coaches and Directors can administer teams, but with different scope:

**Coach** — Manages day-to-day team operations: roster, communications, media sharing, and individual athlete progress. A Coach's focus is the specific team they manage.

**Director** — Has program-level oversight. Can manage multiple teams under a single program umbrella, view aggregated program analytics, and coordinate staff. A Director is typically a high school athletic director, a club program director, or a travel or JUCO organization administrator.

A team can have multiple Coaches. Coaches added to a team by a Director inherit management permissions for that team only.

## Team Communications

Teams have a shared communications channel. Coaches and Directors can:

- Post announcements to the full roster
- Send direct messages to individual athletes
- Share media (video clips, images, documents) with the team
- Draft team communications via Agent X using intelligent templates

Agent X can draft team notifications, practice reminders, and motivational messages. A Coach can describe what they want to communicate and Agent X writes the message, which the Coach then reviews and sends.

## Program Analytics

Coaches and Directors have access to program-level analytics for their teams:

- Roster-wide performance trend summaries
- Individual athlete progress over time
- Media engagement (how often team-shared content is viewed)
- Activity levels (who is actively using the platform vs. inactive)

Analytics are accessible from the Teams section under each team's detail view. Agent X can generate natural language summaries of program analytics on demand via the quick tasks in the command center.
`,
};
