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

**Step 0: Establish the team's real language before video analysis**
Before calling \`analyze_video\` for team film, inspect any existing strategy context already provided in the request, selected files, hydrated film rows, or prior tool results. If the team's terminology is still incomplete, inspect saved strategy artifacts with \`list_universal_team_documents\` and \`get_universal_team_document\` before labeling concepts.
- Prioritize playbooks, callsheets, game plans, install sheets, and coach-provided play lists/timestamps.
- Use the team's verified vocabulary as the source of truth for play names, tags, checks, concept families, and coaching language.
- If no usable team terminology exists after a reasonable search, state that clearly and fall back to neutral sport terminology instead of inventing team-specific language.

**Step 1: Inspect the saved review and source**
Call \`get_film_review\` and \`list_film_review_sources\` first. Identify the full-game sourceId and any existing breakdown rows. If rows already contain reliable play windows, use them as the source of truth.

**Step 2: Build or confirm play windows**
If no play windows exist, use \`analyze_video\` on bounded time ranges from the full-game source (pass \`filmReviewId\`, \`sourceId\`, and \`timeRange\`) to identify plays. Work in practical chunks and keep a running list of start/end seconds. If the video does not expose reliable boundaries, ask the user for a sheet/timestamps instead of inventing rows.

**Step 3: Create physical clip sources only when requested**
When the user asks to cut the full game into clips, create one clip per confirmed play window:
1. Use \`ffmpeg_trim_video\` with \`inputPath\`, \`startTime\`, and \`endTime\` when you have a playable URL.
2. Use \`clip_video\` when the source is Cloudflare and you have \`cloudflareVideoId\`.
3. Call \`add_film_review_source\` for each created clip with a stable source id, order, title, videoUrl, thumbnailUrl when available, and durationSec.

**Step 4: Write the game breakdown table**
For each new clip source, call \`update_film_review_source_breakdown\` with that new sourceId and a timeline row tied to the clip. If you are only populating rows against the original full-game source, call \`update_film_review_source_breakdown\` once with all rows tied to that original sourceId. This tool replaces the source-scoped rows you send; do not claim append behavior unless you included the complete intended row set.

**Step 5: Populate schema-backed tags on existing clip rows**
When the review already has clip sources and rows, use \`analyze_film_review_source_breakdowns\` to fill requested tags such as \`defFront\`, \`playType\`, or other schema-backed fields.
1. Pass no more than 5 \`sourceIds\` per call.
2. For more than 5 clips, work strictly in saved batches: analyze the first 5, wait for the patch to finish, inspect the returned result for insufficient or ambiguous clips, then call the tool again for the next 5.
3. Do not run multiple \`analyze_film_review_source_breakdowns\` calls in parallel against the same \`filmReviewId\`. Parallel writes to the same review can trigger revision conflicts even when each call is individually valid.
4. Request only the tag ids you actually need when the task is narrow. Example: use \`requestedTagIds: ['defFront']\` when the coach only wants defensive fronts.
5. If a clip ends before the snap or the requested tag is not verifiable, preserve the row and mark the result as insufficient or non-applicable instead of guessing.

**Step 6: Verify and summarize**
Re-read the review/source list when needed. Final reply should include created clip count, updated row count, any low-confidence plays, and whether the clips were placed in a requested Files folder.

### Sport-Specific Tags
Tags are automatically enforced per sport:
- **Football**: ODK, DN, DIST, PLAY_TYPE, FORMATION, OUTCOME
- **Basketball**: PLAY_TYPE, OUTCOME, PLAYER, SHOT_TYPE
- **Baseball**: PITCH_TYPE, OUTCOME, RUNNER_MOVEMENT
- Unknown fields automatically set to null (no hallucination)

### Key Rules
- Never call nonexistent batch tools. Use the real tool chain: get/list film review -> analyze_video time ranges -> ffmpeg_trim_video or clip_video -> add_film_review_source -> update_film_review_source_breakdown.
- Read-only discovery work can run in sequence or parallel when it does not mutate the same review.
- Any tool that patches the same \`filmReviewId\` must be sequenced deterministically to avoid revision conflicts.
- For \`analyze_film_review_source_breakdowns\`, always use at most 5 clips per call and process additional clips as sequential saved batches.
- Never skip windows (ensures complete review)
- Enforce sport schema at each step (prevents tag hallucination)
- Ground concept names, tags, and coaching language in verified team documentation whenever available; do not invent team-specific terminology.
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
