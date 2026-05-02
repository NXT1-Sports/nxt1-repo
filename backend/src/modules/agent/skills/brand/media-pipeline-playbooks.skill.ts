/**
 * @fileoverview Media Pipeline Playbooks Skill
 * @module @nxt1/backend/modules/agent/skills/brand
 *
 * Step-by-step tool chains for the three core media production workflows
 * executed by the Brand Coordinator: graphic-to-highlight, film polish,
 * and poster+reel package. Extracted from the system prompt so the
 * coordinator prompt stays lean while the playbooks remain dynamically
 * injectable per-request.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class MediaPipelinePlaybooksSkill extends BaseSkill {
  readonly name = 'media_pipeline_playbooks';
  readonly description =
    'Step-by-step tool chains for brand media production: graphic-to-highlight reel (Pipeline A), existing film broadcast polish (Pipeline B), and poster+reel package (Pipeline C).';
  readonly category: SkillCategory = 'brand';

  getPromptContext(_params?: Record<string, unknown>): string {
    return `## Media Pipeline Playbooks

Execute media requests via these explicit tool chains. Never substitute ad-hoc replies for a pipeline when one applies.

### Pipeline A — Graphic → Motion → Final Highlight
1. \`generate_graphic\` — title card / branding frame.
2. \`stage_media\` — normalize or persist media URLs for downstream tools (if needed).
3. \`runway_generate_video\` — animate the graphic into motion.
4. \`runway_check_task\` — poll until complete; capture output URL.
5. \`ffmpeg_trim_video\` — isolate best moments from source clips.
6. \`ffmpeg_merge_videos\` — combine intro motion + top plays + outro.
7. \`ffmpeg_add_text_overlay\` — player name, position, verified stats.
8. Optional: \`ffmpeg_resize_video\`, \`ffmpeg_burn_subtitles\`, \`ffmpeg_convert_video\`, \`ffmpeg_compress_video\`.

### Pipeline B — Existing Film → Broadcast Polish
1. \`ffmpeg_trim_video\` — cut each selected play.
2. \`ffmpeg_merge_videos\` — join in ranked play order.
3. \`runway_edit_video\` — cinematic AI treatment (only when user requests it).
4. \`runway_check_task\` — poll for async completion.
5. \`ffmpeg_add_text_overlay\` and/or \`ffmpeg_burn_subtitles\`.
6. \`ffmpeg_convert_video\` + \`ffmpeg_compress_video\` for delivery.

### Pipeline C — Poster + Reel Package
1. \`generate_graphic\` — social poster.
2. \`runway_generate_video\` — motion teaser from poster.
3. \`ffmpeg_merge_videos\` — append teaser to highlight reel.
4. \`ffmpeg_generate_thumbnail\` — share thumbnail.
5. \`write_timeline_post\` — publish final media URL (only when user asks to post).

### Pipeline Execution Rules
- Prefer tool execution over descriptive-only responses when user asks to create/edit media.
- Reuse prior tool outputs as direct inputs to the next step.
- Never claim completion before async Runway jobs are confirmed complete via \`runway_check_task\`.
- Preserve provenance: report which output URL came from which tool.
- On tool failure: continue with a fallback path using available outputs instead of stopping.`;
  }
}
