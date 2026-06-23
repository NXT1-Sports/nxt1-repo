/**
 * @fileoverview Film Viewing & Batch Processing Workflow Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Coaches and coordinators use this skill to efficiently orchestrate batch
 * analysis of native NXT1 TeamFilmReviews. It handles iterating over clips,
 * tags, and plays within a film session, allowing the agent to process timelines
 * efficiently without losing context.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class FilmViewingBatchProcessingWorkflowSkill extends BaseSkill {
  readonly name = 'film_viewing_batch_processing_workflow';
  readonly description =
    'Batch video review workflow: Split full game footage into time windows (5-min chunks). Analyze each window systematically. ' +
    'Collect results into complete timeline. Provides structured methodology for reviewing entire games deterministically.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(_params?: { sport?: string; teamId?: string }): string {
    return `## Batch Video Review Workflow

### Purpose
When a coach wants to systematically review an entire game or long footage, use batch processing to:
1. Split footage into 5-minute windows (with overlap for continuity)
2. Analyze each window independently to avoid AI context limits
3. Collect all results into a complete timeline
4. Ensure no footage is missed, no analysis skipped

### When to Use This Workflow
- Coach says: "Break down the full game"
- Coach says: "Analyze the entire 2nd half"
- Coach says: "Review all their defensive plays"
- You need systematic, deterministic analysis of long footage

### The Batch Processing Steps

**Step 1: Invoke Batch Windowing**
Call \`batch_full_video\` with:
- \`filmReviewId\`: The TeamFilmReviews document ID
- \`sourceId\`: The source video (raw game footage)
- Tool automatically calculates 5-minute windows with overlap
- Returns: window definitions and checkpoint

**Step 2: Analyze Each Window**
For each window returned:
1. Call \`analyze_video\` with:
   - \`url\`: The source video URL
   - \`windowStart\`: The window's startSec
   - \`windowEnd\`: The window's endSec
   - \`sport\`: The sport (for schema enforcement)
2. Tool returns: plays/segments with sport-specific tags
3. Store results in memory for aggregation

**Step 3: Aggregate Into Complete Timeline**
Once all windows analyzed:
1. Compile all window results into one timeline
2. Renumber plays sequentially
3. Call \`update_film_review_source_breakdown\` with:
   - \`mergeMode\`: 'append'
   - \`timeline\`: All aggregated results
4. Persists complete breakdown to TeamFilmReviews

### Sport-Specific Tags
Tags are automatically enforced per sport:
- **Football**: ODK, DN, DIST, PLAY_TYPE, FORMATION, OUTCOME
- **Basketball**: PLAY_TYPE, OUTCOME, PLAYER, SHOT_TYPE
- **Baseball**: PITCH_TYPE, OUTCOME, RUNNER_MOVEMENT
- Unknown fields automatically set to null (no hallucination)

### Key Rules
- Always use batch_full_video first (calculates windows correctly)
- Analyze windows in sequence or parallel (agent decides efficiency)
- Never skip windows (ensures complete review)
- Enforce sport schema at each step (prevents tag hallucination)
- Reference timestamps when discussing plays (helps coach find footage)

### Output
A complete, structured timeline with:
- All plays from entire footage
- Sport-specific tags filled where visible, null where not
- Timestamps for every play
- Ready for downstream reporting or highlight generation
`;
  }
}
