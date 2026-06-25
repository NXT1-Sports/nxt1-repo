/**
 * @fileoverview Game Breakdown Automation Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Systematically analyze a full game video and populate breakdown data
 * (ODK, hash, tags, coaching notes) for each play using sport-specific
 * tag schemas.
 *
 * Workflow:
 * 1. Coach uploads full game video and provides film review context
 * 2. Coach optionally provides play list with existing times/data
 * 3. Agent analyzes each play independently with analyze_video
 * 4. Agent extracts breakdown (situation, assignment, execution, result, coaching point)
 * 5. Agent maps breakdown to sport-specific tags (ODK, hash, formation, etc.)
 * 6. Agent writes each breakdown row via update_film_review_source_breakdown
 * 7. Agent reports progress and flags ambiguous plays with LOW confidence
 *
 * Key Features:
 * - Handles both full-breakdown-needed and partial-data-enrichment workflows
 * - Uses coach's existing play data (times, formation calls, etc.) as source of truth
 * - Respects sport-specific tag schemas (football, basketball, soccer, etc.)
 * - Flags ambiguous plays LOW confidence and keeps moving (no blocking)
 * - Systematic and professional — each row is complete and consistent
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class GameBreakdownAutomationSkill extends BaseSkill {
  readonly name = 'game_breakdown_automation';
  readonly description =
    'Systematically analyze a full game video and populate breakdown data (situation, ' +
    "assignment, execution, result, coaching point, tags) for each play using the sport's " +
    'film review tag schema. Handles full-game workflows where coach provides video and ' +
    'optional play list with times/existing data.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## Game Breakdown Automation

### When to Use
- Coach uploads a full game video and wants systematic breakdown of each play
- Coach has some play data (times, formation calls) and wants agent to analyze and enrich
- Coach wants consistent, professional breakdown data with all fields populated per sport standards
- Coach needs break-down-per-play filled into film review (ODK, hash, formation, assignments, etc.)

### Step 0: Gather Required Context (ALWAYS DO THIS FIRST)
Before analyzing any plays, confirm you have everything needed. If anything is missing, ask the user in a single message before proceeding.

**Required information:**
- **Sport**: Football, basketball, soccer, etc. (determines tag schema)
- **Film Review ID**: Which film review document should we populate (e.g., "Game vs. State, 2026-06-22")
- **Game Video**: Confirm the full game video URL/upload is ready
- **Play List** (optional but recommended):
  - If coach has existing play times: confirm start/end times for each play, existing ODK, hash, formation calls, etc.
  - If coach does NOT have play times: Agent can estimate play boundaries from video breaks (slower, less precise)

**Example clarifying message (adapt to what's missing):**
> "Quick setup before we start the breakdown:
> - What sport is this? (Football, basketball, soccer, etc.)
> - Do you have a play list with times, or should I auto-detect plays from the video breaks?
> - If you have play data: formation calls, ODK, hash designations, personnel groupings — anything already filled in?"

### Execution Sequence

#### 1. Validate Sport and Load Tag Schema
- Confirm sport is recognized (football, basketball, soccer, etc.)
- Retrieve sport-specific film review tag schema (defines which fields: ODK, hash, formation, motion, personnel, coverage, etc.)
- Display tag schema so coach can verify it matches their breakdown terminology

#### 2. Build Play List (If Not Provided)
**Option A: Coach Provides Play Times**
- Use coach's list as-is (times, formation calls, existing data = source of truth)
- Agent will analyze within those time boundaries and enrich missing fields

**Option B: Agent Auto-Detects from Video Breaks**
- Scan video for natural breaks (huddle, walk-off, timeout pauses)
- Estimate play start/end times
- Flag to coach: "Detected ~48 plays from breaks — confirm or provide your own list"

#### 3. Analyze Each Play Independently
For each play in the list:

a. **Call \`analyze_video\` with time range and sport context:**
  - Input: full game video URL, play start/end times, \`sportContext\`, and the coach's provided context for this play
  - Also populate: \`focusArea\` (whole-play execution, offensive structure, defensive fit, etc.), \`focusSubject\` (player, unit, or side of ball when known), \`teamContext\`, \`playContext\`, and \`analysisObjectives\`
  - For full-play requests, keep the scope on the entire play structure unless the coach explicitly asks for one athlete
   - Extract: situation (down, distance, field position, time remaining), personnel, formation, motion, play outcome
   - Extract: what each key position executed (route, block, read, responsibility), how they executed (technique, timing, leverage)
   - Extract: result (completion, rush yards, coverage success, etc.)

b. **Build Breakdown per Film Breakdown Taxonomy:**
   - Situation: down, distance, formation, personnel, field context
  - Team & Player: identify OUR team from canonical organization/team colors first, then use existing breakdown data (ODK, offense/defense, formation, personnel) to justify side assignment; use visual jersey evidence as confirmation, not as the only source when structured data exists
   - Assignment: what they appear responsible for
   - Execution: what was observable (technique, timing, physicality)
   - Result: play outcome
   - Coaching Point: one specific correction or reinforcement (own team) or scouting note (opponent)
   - Confidence: HIGH, MEDIUM, or LOW based on video clarity and angle coverage

c. **Map Breakdown to Sport's Tag Schema:**
   - For football: ODK (offensive/defensive key), hash (ball position relative to hash), formation, motion, personnel grouping, play type (run/pass/option), result, coverage type (if defense)
   - For basketball: possession start location, play type (pick-and-roll, iso, transition, etc.), key players, execution quality, offensive/defensive assignment, defensive call
   - For soccer: possession area, build-up play type, key passes, defensive shape, off-ball movement
   - (Use coach's provided calls as source of truth; agent extracts/verifies from video)

d. **Write Breakdown Row via update_film_review_source_breakdown:**
   - Call tool with:
     - filmReviewId: the review you're populating
     - sourceId: the source video ID
     - timeline: array of one TimelineSegment per play with:
       - label: "Play 1: HB Toss" or "1st & 10, HB Power"
       - startSec, endSec: play time range
       - tags: populated with sport schema fields (ODK, hash, formation, coverage, result, etc.)
       - annotation: coaching point and confidence level
   - mergeMode: "append" (adds rows without erasing existing)

#### 4. Handle Ambiguity
- **If camera angle is bad, formation unclear, or execution ambiguous**: Flag confidence = LOW, include what IS visible, move on
- **Do NOT block on clarification** — coach can review and adjust later
- **Report after:** "Play 12 marked LOW confidence — angle didn't show interior line blocking"

#### 5. Progress Reporting
As you work:
- Report after every 5-10 plays: "Completed plays 1-10 of 48. Example: Play 5 (HB Toss, ODK Empty, Hash Right) ✓"
- Note any plays flagged LOW confidence
- If a video chunk fails to load: skip and report, ask coach to verify upload

#### 6. Final Summary
When complete:
- Total plays analyzed: X
- Plays with HIGH/MEDIUM/LOW confidence breakdown
- Any plays requiring coach review
- Tag schema populated: confirm all fields (ODK, hash, formation, etc.) are filled per sport standard
- Ready for coach to review in film review tool

### Critical Rules
- **Source of Truth**: Coach's provided play data (times, ODK, hash, formation) is authoritative. Agent verifies and enriches from video.
- **Own Team Anchor**: Use organization/team branding colors as the primary own-team anchor whenever available. If opponent data is missing, still identify OUR team from canonical colors plus breakdown context.
- **Never Hallucinate**: If you cannot see it clearly in the video, flag LOW confidence. Do NOT invent ODK, hash, or formation if unsure.
- **Sport-Specific Tags**: Always use the sport's tag schema. Football ≠ basketball ≠ soccer tags.
- **Systematic & Professional**: Every row is complete. No blank fields. Every play has a breakdown, coaching point, and confidence level.
- **Reference Film Breakdown Taxonomy**: For detailed "never hallucinate" rules and structured breakdown format.

### Example Output (Per Play)
\`\`\`
Play 5: 1st & 10, HB Toss, 0:47-0:52

Situation: 1st & 10, ball on hash right, own team on offense
Formation: I-Form, 4-wide personnel, motion LT to slot
Play Type: Outside run
Execution: HB read edge, OT pulled, DE outside contain — breach, HB cut back
Result: +8 yards, defended by safety overhang

Coaching Point: DE assignment unclear — confirm if contain or penetrate on this call. Safety overhang was effective, consider repeating.
Confidence: MEDIUM (angle doesn't show backfield depth before mesh point)

Tags: ODK=I-Form Edge / Hash=Right / Personnel=4-Wide / Motion=LT→Slot / PlayType=Outside Run / Result=+8 / Coverage=Safety Overhang
\`\`\`

### Tools Used
- \`analyze_video\` — Analyze play-specific time ranges with sport context
- \`update_film_review_source_breakdown\` — Write breakdown rows to film review
- \`dynamic_export\` — (Optional) Generate summary table of all breakdowns when done`;
  }
}
