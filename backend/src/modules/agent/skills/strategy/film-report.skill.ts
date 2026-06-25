/**
 * @fileoverview Film Report Generation Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * After batch reviewing footage, coaches need reports: tendency analysis, pattern
 * detection, statistical summaries. This skill provides the framework for turning
 * raw timeline data into actionable insights.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class FilmReportSkill extends BaseSkill {
  readonly name = 'film_report_generation';
  readonly description =
    'Film report generation from complete timelines: Aggregate plays by situation, compute tendencies, ' +
    'detect patterns, generate statistical summaries. Turns full-game breakdown data into coach-ready insights.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(_params?: { sport?: string; teamId?: string }): string {
    return `## Film Report Generation

### Purpose
After you have a complete timeline from batch reviewing (via FilmViewingBatchProcessingWorkflowSkill),
turn that raw data into actionable reports coaches want:
- What do they do in high-leverage situations for this sport?
- How efficient are they in scoring/closing situations?
- Which formations/sets/pitch plans are most common?
- What changes by quarter/inning/game state/opponent look?

Always anchor the report to the current sport schema. Do not force football terminology when the film is basketball, baseball, or another sport.

### Key Reports

#### 1. Tendency Reports (Action Distribution)
**Use When:** Coach asks "What do they usually do in this situation?"

**Data Needed:** Complete timeline with sport tags (e.g., PLAY_TYPE, OUTCOME, COVERAGE, SHOT_TYPE, PITCH_TYPE)

**Steps:**
1. Filter timeline plays/events by a sport-valid situation bucket
   - Football example: DN=3 and DIST<=3
   - Basketball example: QUARTER=4 and SCORE_MARGIN between -5 and 5
   - Baseball example: INNING>=7 and RUNNER_STATE contains 'RISP'
2. Count occurrences of each PLAY_TYPE
3. Compute percentages
4. Calculate success rate (OUTCOME favorable / total)
5. Return concise tendencies with sample size and confidence

#### 2. Situational Efficiency Analysis
**Use When:** Coach asks "How efficient are they in clutch/scoring situations?"

**Data Needed:** Timeline with OUTCOME tags and timestamps

**Steps:**
1. Filter events by sport-specific high-leverage context
   - Football: inside 20, goal-to-go, final 2:00
   - Basketball: last 5:00, ATO possessions, paint touches
   - Baseball: late innings, RISP, 2-out sequences
2. Count outcomes (scores, stops, turnovers, quality chances, strand rate)
3. Compute efficiency metrics appropriate to the sport
4. Highlight anomalies with supporting timestamps
5. Return: Situational breakdown with actionable insights

#### 3. Unit / Formation / Lineup Grouping
**Use When:** Coach asks "Which groupings drive outcomes?"

**Data Needed:** Timeline with grouping tags (FORMATION, PERSONNEL, LINEUP, DEFENSIVE_LOOK, BATTER/PITCHER context)

**Steps:**
1. Filter by a baseline situation (game state + matchup context)
2. Count groupings/sets/looks by situation
3. Compute frequency and outcome rates by grouping
4. Find correlations that differ from team baseline
5. Return: Personnel matchup analysis

#### 4. Trend Analysis (Evolution During Game)
**Use When:** Coach asks "Did they adjust at halftime?" or "What changed in Q4?"

**Data Needed:** Timeline with timestamps and tags

**Steps:**
1. Divide timeline into logical phases for the sport (quarters/halves/innings/periods)
2. Compare play-calling distribution per quarter
3. Compute trend deltas between early vs late phases
4. Identify inflection points after key events
5. Return: Game evolution narrative

#### 5. Positional / Player Impact
**Use When:** Coach asks "How do outcomes change with Player X vs Y / lineup A vs B?"

**Data Needed:** Timeline with PLAYER tags and OUTCOME

**Steps:**
1. Filter events where PLAYER or lineup condition is present
2. Compare success rates and volume with vs without condition
3. Compute behavior distribution shifts (action mix, shot profile, pitch plan)
4. Return impact summary with sample-size caveats

### Best Practices for Report Generation

**Aggregate, Don't Narrate**
- Don't list all 150 plays individually
- Group into sport-valid buckets (e.g., down-distance, shot zones, count/inning states)
- Show percentages and key examples

**Reference Timestamps**
- "In the final 5:00 (events at 3:22, 15:47, 28:33): 4 favorable outcomes on 7 events"
- Helps coach validate the analysis by watching those moments

**Highlight Anomalies**
- "Baseline behavior shifts materially under specific lineup/opponent/game-state context"
- These are the insights coaches actually use

**Use Confidence / Sample Size**
- "Late-game trend (n=3): directional only" (small sample, low confidence)
- "Full-game tendency (n=24): stable" (larger sample, higher confidence)

**Match Sport Schema**
- Football: DOWN, DISTANCE, FIELD POSITION, FORMATION, PERSONNEL, PLAY_TYPE, OUTCOME, COVERAGE
- Basketball: QUARTER, SCORE_MARGIN, PLAY_TYPE, OUTCOME, PLAYER, SHOT_TYPE
- Baseball: INNING, COUNT, RUNNER_STATE, PITCH_TYPE, BALL_IN_PLAY_TYPE, OUTCOME
- Use only tags that exist in the data (null = unknown, not missing)

### Example Report Output
\`\`\`
## Game Tendency Report: [Team] vs. [Opponent]

### Situation Tendencies (Sport-Aware)
- **Primary Situation A**: 58% Action-1, 42% Action-2 (n=24)
- **Primary Situation B**: 25% Action-1, 75% Action-2 (n=4)
- **Primary Situation C**: 10% Action-1, 90% Action-2 (n=10)

### Efficiency Snapshot
- **High-leverage window 1**: 3 favorable outcomes on 4 possessions/events
- **High-leverage window 2**: 2 favorable outcomes on 3 possessions/events

### Grouping Impact
- **Grouping X**: used 58%, favorable outcome rate 67%
- **Grouping Y**: used 25%, favorable outcome rate 50%

### Key Adjustments
- Early phase: baseline action mix
- Late phase: shifted action mix under score pressure
- After key event at [timestamp]: measurable tactical adjustment
\`\`\`

### Tools You'll Use
- \`query_nxt1_data\` - Fetch timeline data (already analyzed)
- \`search_nxt1_platform_data\` - Find similar teams for benchmarking
- No vision models needed (data already collected during batch review)
`;
  }
}
