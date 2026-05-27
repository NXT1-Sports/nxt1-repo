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
5. Motion quality gate — the Runway opener must show clear camera movement, parallax, kinetic type, profile/subject reveal, and polished lighting/energy. If it is static or weak, run one regenerate/upscale pass before FFmpeg.
6. \`ffmpeg_trim_video\` — isolate best moments from source clips.
7. \`ffmpeg_merge_videos\` — combine intro motion + top plays + outro with maxIntroSeconds=4 when the first input is the motion intro.
8. \`ffmpeg_generate_thumbnail\` — validate final playback and poster metadata immediately after merge.
9. \`ffmpeg_add_text_overlay\` — short lower-thirds only; use title cards for full-reel text.
10. Optional: \`ffmpeg_resize_video\`, \`ffmpeg_burn_subtitles\`, \`ffmpeg_convert_video\`, \`ffmpeg_compress_video\`.

### Pipeline B — Existing Film → Broadcast Polish
1. \`ffmpeg_trim_video\` — cut each selected play.
2. \`ffmpeg_merge_videos\` — join in ranked play order.
3. \`generate_graphic\` — optional title card or thumbnail when branding/text is needed.
4. \`ffmpeg_add_text_overlay\` and/or \`ffmpeg_burn_subtitles\` only for short timed windows.
5. \`ffmpeg_convert_video\` + \`ffmpeg_compress_video\` for delivery.

### Pipeline C — Poster + Reel Package
1. \`generate_graphic\` — social poster.
2. \`runway_generate_video\` — motion teaser from poster.
3. \`ffmpeg_merge_videos\` — append teaser to highlight reel with maxIntroSeconds=4 when the teaser is used as the opener.
4. \`ffmpeg_generate_thumbnail\` — generate poster frame metadata for the final reel (not a separate deliverable unless requested).
5. \`write_timeline_post\` — publish final media URL (only when user asks to post).

### Pipeline Execution Rules
- Prefer tool execution over descriptive-only responses when user asks to create/edit media.
- Reuse prior tool outputs as direct inputs to the next step.
- Never claim completion before async Runway jobs are confirmed complete via \`runway_check_task\`.
- Never claim a final highlight reel before \`ffmpeg_merge_videos\` and \`ffmpeg_generate_thumbnail\` both succeed on the merged output.
- Preserve provenance internally, but final user-facing delivery should expose only the finished final media URL unless the user explicitly requested source/intermediate assets.
- On tool failure: continue with one sensible fallback path, but do not attach raw source videos, staged trims, or generated intro art as the final reel.`;
  }
}
