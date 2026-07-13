# Foundation 50 Coaches Campaign

## Overview

Exclusive founding group campaign for high school head coaches. Launched July
2026 with a July 31 deadline to create urgency.

**Campaign Key:** `foundation_50_coaches`

## Message Strategy

- **Primary Angle:** Operational simplicity ("one system, not five") +
  intelligence over storage + exclusive founding group prestige
- **Target Audience:** High school head coaches
- **Goal:** Recruit 50 founding coaches; make them feel they NEED it to win
- **Deadline:** July 31, 2026 (hard cutoff for initial cohort)

## Key Messaging Pillars

### 1. Simplify + Speed Operations

- Film review + AI breakdown (replaces Hudl juggling)
- Scout reports with 4-dim eval (physical/technical/mental/potential)
- Unified team workspace (roster + communication + priorities)
- Agent X automation (admin work → 20 minutes instead of 2 hours)

### 2. Intelligence Over Storage

- AI-powered film analysis (not just tape storage)
- Scout report percentile ranking (see who's actually separating)
- Agent X writes summaries, organizes thinking
- "One system, not five" positioning

### 3. Founding Group Status

- Literal 50-coach exclusive cohort (FOMO/scarcity)
- Direct product team access
- Monthly coaching workshops
- Foundation 50 badge on profile
- "You shape what NXT1 becomes for HS programs"

## Email Content Structure

| Section                             | Content                                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Preheader**                       | "Not another tool. One operating system for your entire program."                                                           |
| **Header**                          | Eyebrow: "FOUNDATION 50 COACHES" / Title: "Operating Different This Season" / Subtitle: "50 forward-thinking HS coaches..." |
| **Intro**                           | Opens with coach pain (Hudl + GroupMe + sheets + docs scattered) → "That is IT management, not coaching" → NXT1 solution    |
| **Section 1: One Operating System** | 4 feature boxes: film review, scout reports, team workspace, Agent X                                                        |
| **Section 2: The Founding 50**      | Exclusivity angle + 5 benefits + coach testimonial                                                                          |
| **Section 3: Urgency Box**          | Hard deadline July 31, 2026 / Next intake January                                                                           |
| **Section 4: Action List**          | 4 steps: click (1 min) → see workflow → reply/schedule → go live                                                            |
| **CTAs**                            | Primary: "Join Foundation 50" / Secondary: "See Film Review In Action"                                                      |

## Usage

### Send Test Email to john@nxt1sports.com

From backend root:

```bash
# Option 1: Using compiled script
npx tsx src/services/marketing/email/campaigns/foundation/__tests__/send-test-email.ts

# Option 2: After build
node dist-scripts/send-foundation-50-test-email.js
```

### Programmatic Usage

```typescript
import { sendFoundation50CoachesEmail } from './foundation-50-coaches-email.service.js';

const result = await sendFoundation50CoachesEmail({
  email: 'coach@school.edu',
  firstName: 'Coach Name',
  primarySport: 'Football',
  organizationName: 'School Name',
  environment: runtimeEnvironment,
  coachTestimonial: {
    name: 'Coach John Smith',
    school: 'State Finalist Program',
    quote:
      'We went from 4 platforms to one. That is an assistant coach worth of time back in my season.',
  },
});

// Returns: { status: 'sent', campaignKey: 'foundation_50_coaches', email: 'coach@school.edu' }
```

## Customization

### Testimonials

Pass different coach testimonials via the `coachTestimonial` field. If omitted,
testimonial section is skipped.

### URLs

CTAs link to:

- **Join Foundation 50:** `/foundation-50`
- **See Film Review:** `/foundation-50/film-review`

Ensure these routes exist or update URLs in `buildCoachVariant()`.

### Personalization

- `[Coach Name]` - auto-filled from `firstName` input
- `[Sport]` - auto-filled from `primarySport` input, defaults to "your program"
- `[Organization]` - auto-filled from `organizationName` input
- Testimonial dynamically inserted if provided

## Launch Timeline

| Date       | Action                                                     |
| ---------- | ---------------------------------------------------------- |
| July 1-5   | Send test emails (john@nxt1sports.com) + iterate           |
| July 5-10  | Segment target coach list (HS coaches)                     |
| July 8-15  | Production email send (70-80% of target list)              |
| July 15-25 | Follow-up sends (remaining coaches) + monitor opens/clicks |
| July 31    | Hard deadline (Foundation 50 closes)                       |
| Aug 1+     | Next intake opens January 2027                             |

## Metrics to Track

- **Open Rate:** Target 35-45% (founder group typically higher)
- **Click Rate:** Target 15-20% (exclusive offer typically higher)
- **Join Rate:** Target 10-15% of opens (conversion to Foundation 50)
- **Campaign Duration:** 4 weeks (July 1-31)

## Design

Uses standard NXT1 email template:

- **Primary CTA Color:** Yellow (#ccff00) on dark background
- **Feature Boxes:** Light blue (#f3f7fb) with yellow left border
- **Urgency Box:** Yellow-tinted background (#fff3cd) with bold border
- **Font:** Arial/Helvetica, responsive sizing (13px-30px)

## Testing Checklist

- [ ] Email renders correctly in Gmail, Outlook, Apple Mail
- [ ] Mobile rendering (test on mobile email clients)
- [ ] All personalization fields populate correctly
- [ ] CTAs click through to correct URLs
- [ ] Testimonial displays properly
- [ ] Preheader text visible in inbox
- [ ] Footer links functional
- [ ] No broken images or styles

## Notes

- **Reply-To:** support@nxt1sports.com (handle replies via Zendesk/support
  queue)
- **Unsubscribe:** Use standard email footer (handled by
  `sendOutboundMarketingEmail`)
- **A/B Testing:** Can test subject line variations (currently: "The 50 Coaches
  Building a Cleaner System")
- **Segmentation:** Filter by `role === 'coach'` or `isTeamRole(role) === true`
  if needed
