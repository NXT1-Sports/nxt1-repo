/**
 * @fileoverview Clip-Derived Metrics Framework Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 *
 * Gives the Performance Coordinator a repeatable framework for generating
 * player statistics and impact metrics directly from film clips.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class ClipDerivedMetricsFrameworkSkill extends BaseSkill {
  readonly name = 'clip_derived_metrics_framework';
  readonly description =
    'Watch film clips and analyze requested player(s) stats across clips, including ' +
    'touch counts, key plays, consistency scoring, efficiency metrics, and performance summary.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(): string {
    return `## Clip-Derived Metrics Framework

### When to Use
- User asks for "player stats" or "athlete metrics" from selected clips
- Coach wants to pull stats for one or more players across game film (instead of doing it manually)
- User wants performance scorecards or consistency evaluation from clips
- User wants impact metrics aggregated from film review

### ⚠️ CRITICAL: Never Hallucinate Stats
Do NOT invent stat numbers or confidence where you don't have clear evidence:
- If a touch was ambiguous (did the athlete catch it or did defender?), flag it with LOW confidence, do NOT guess
- If a player was rarely on screen, do NOT extrapolate their stats — report what you saw only
- If footage is unclear or from bad angle, state it explicitly: "stats pulled from [angle], may miss off-ball actions"
- Use Consistency Score LOW when you cannot verify execution quality due to film limitations
- Always reference **Film Breakdown Taxonomy** for detailed "never hallucinate" rules

### Step 0: Gather Required Context (ALWAYS DO THIS FIRST)
Before analyzing any clips, confirm you have all the information needed. If anything is missing, ask the user in a single message before proceeding.

**Required information:**
- **Which player(s)?** — For a named-player request, use the supplied name and/or jersey number. For a team-wide request such as "all offensive player stats," discover visible jersey numbers from each selected clip and use an "Unknown #" label only when the jersey cannot be read.
- **What stats to pull?** — Ask if not specified:
  - General stats (touches, key plays, consistency, efficiency)? 
  - Position-specific stats (e.g., QB: completions, decisions; WR: routes, separation; DB: coverage, tackles)?
  - Custom focus (e.g., only red zone plays, only run blocking)?
- **Which clips?** — Confirm which game film or clips are in scope (if not already loaded in session)

**If all context is already provided in the user's message, skip directly to Step 1.**

Only ask which player(s) to track when the request is neither a named-player request nor an explicit team-wide request.

Example clarifying message (adapt to what's missing):
> "Before I pull these stats, a couple quick things:
> - Which players should I track? (name or jersey number)
> - Any specific stats you want me to focus on, or should I pull the standard breakdown (touches, key plays, consistency, efficiency)?
> - Are these clips from tonight's game, or a specific set?"

### Execution Sequence
1. **Identify Athletes in Each Clip**
  - Use the player names/jersey numbers confirmed in Step 0, or discover offensive player jersey numbers for an explicit team-wide request
   - Document metadata per clip: date, opponent, drive/quarter context
   - Note position and team affiliation for each tracked player

2. **Analyze Each Clip for Requested Stats**
   - Call \`analyze_video\` on each clip, focused on the confirmed players and stat types:
     - **Touches**: every engagement — catches, runs, blocks, tackles, coverages, etc.
     - **Key Plays**: 1-2 standout moments per clip (positive or negative)
     - **Consistency**: execution discipline and repeatability
     - **Efficiency**: % of plays resulting in positive outcomes or high-quality decisions
     - **Position-specific extras**: if coach requested (e.g., targets vs. catches for WR, pre-snap reads for QB)

3. **Aggregate Across All Clips**
   - Sum total touches per player
   - Count total key plays per player
   - Derive consistency score (0–100 scale: 100 = flawless execution, 0 = frequent errors)
   - Calculate efficiency percentage
   - Note any clips where a player was absent or had limited snaps

4. **Report Stats to User**
  - If multiple players, clips, phases, or metric categories were aggregated, call \`generate_chart_visualization\` first to create a coach-facing visual for the clearest comparison or trend: touches by player, efficiency by player, consistency leaderboard, or progression across clips
  - Use \`chartType: "auto"\` unless the user requested a specific chart form. The chart data must be a non-empty array of row objects with a player/clip/category label and numeric metric fields.
  - Skip chart generation when the output is a single player with only one verified metric, when sample size is too small to visualize responsibly, or when the metric depends on unclear film evidence.
   - Call \`dynamic_export\` to produce a clean metrics card per player, or a multi-player leaderboard if multiple players were tracked
  - If a chart was generated, include the chart \`imageUrl\`/\`chartUrl\` in the export via \`imageUrls\`
   - Include: name, position, jersey #, clips analyzed, touches, key plays, consistency score, efficiency %, any position-specific stats requested
   - Format should be coaching-ready — clear enough to use in a film session or practice plan

### Metric Definitions
- **Touches**: total engaging moments (catches, completions, runs, blocks, tackles, interceptions, coverage snaps, etc.)
- **Key Plays**: standout moments (explosive gains, critical catches, game-changing defense, excellent or poor decisions)
- **Consistency Score** (0–100):
  - 90–100: Near-flawless execution, rare errors
  - 80–89: Strong execution with occasional lapses
  - 70–79: Reliable but some errors, inconsistent at times
  - 60–69: Noticeable gaps in discipline or technique
  - Below 60: Frequent execution or decision errors
- **Efficiency**: % of touches/plays resulting in positive outcomes or quality decisions

### Output Format
- **Player**: name, jersey #, position
- **Clips Analyzed**: game/date, opponent, total clips
- **Touches**: total count
- **Key Plays**: total count + brief descriptions
- **Consistency Score**: 0–100 with brief explanation
- **Efficiency**: percentage and brief interpretation
- **Notes**: any position-specific stats or coaching flags raised during analysis

### Quality Checklist
- Context confirmed with user before analysis begins (or already provided)
- Each clip analyzed independently before aggregation
- Stats grounded in observable actions, not assumptions
- Chart generated for verified multi-row comparisons or trends when chart-worthy data exists
- Output is coaching-ready — clear, scannable, actionable`;
  }
}
