/**
 * @fileoverview Video Highlight Style Skill
 * @module @nxt1/backend/modules/agent/skills/brand
 *
 * Provides the Brand & Media Coordinator with domain knowledge for
 * creating and editing highlight reels, video intros, and game film
 * overlays with correct pacing, transitions, and sports broadcast style.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class VideoHighlightStyleSkill extends BaseSkill {
  readonly name = 'video_highlight_style';
  readonly description =
    'Highlight reel editing guidelines with explicit tool orchestration for generate_graphic, runway_generate_video, runway_edit_video, runway_upscale_video, runway_check_task, ffmpeg_trim_video, ffmpeg_merge_videos, ffmpeg_add_text_overlay, ffmpeg_burn_subtitles, ffmpeg_convert_video, and ffmpeg_compress_video.';
  readonly category: SkillCategory = 'brand';

  getPromptContext(_params?: Record<string, unknown>): string {
    return `## Video Highlight Guidelines

### Highlight Reel Structure
1. **Intro (3–5 sec)**: Name plate with position, school, class year, and sport-specific tagline
2. **Top Plays (60–90 sec)**: Best 8–12 clips, strongest first. Mix game film and workout footage.
3. **Stat Overlay (5 sec)**: Key verified stats displayed over slow-motion clip
4. **Outro (3–5 sec)**: NXT1 branding + profile link + contact info

### Pacing & Transitions
- Cut on the action — never let a clip linger after the play ends
- Use 0.5–1s transitions (wipe, cross-dissolve, or hard cut)
- Target 90–120 seconds total for recruiting highlights
- Match music BPM to cut rhythm (hip-hop, trap, or orchestral energy)

### Broadcast Aesthetic
- ESPN / CBS Sports visual language: lower-thirds, score bug style overlays
- Name plates: sport color gradient bar with white bold text
- Stats: animated number countup on glassmorphism cards
- Game clock and score overlays when relevant context exists

### Technical Requirements
- Minimum 720p resolution, prefer 1080p
- 30fps for game film, 60fps for slow-motion highlights
- Audio: mix music at -12dB under commentary/ambient game audio

### Tool Orchestration (Required)
Use concrete tool pipelines for production-grade outputs:

1. **Create/animate intro cards**
- Use generate_graphic for title cards, commitment cards, and stat cards.
- Use runway_generate_video to animate static cards into motion openers.
- Use runway_check_task to verify async completion before proceeding.

2. **Build highlight sequence**
- Call ALL ffmpeg_trim_video operations simultaneously as a single parallel batch to isolate each play.
- Do not wait for one trim to finish before starting the next. Only call ffmpeg_merge_videos after all trims have resolved.
- Use ffmpeg_merge_videos to assemble intro + highlights + outro.
- Use ffmpeg_add_text_overlay for athlete name, position, and verified metrics.

3. **Polish and delivery**
- Use runway_edit_video for cinematic AI transforms only when explicitly requested.
- Use runway_upscale_video for quality refinement.
- Use ffmpeg_burn_subtitles when captions are requested.
- Use ffmpeg_convert_video and ffmpeg_compress_video for platform-ready delivery.

### URL & Asset Handling
- Treat tool output URLs as source-of-truth and chain them directly into next tool calls.
- Use stage_media if an external URL needs normalization or stable signed access.
- Keep a strict output lineage: introUrl, clipUrls, mergedUrl, finalUrl.

### Quality Gate (Before Final Response)
- Confirm Runway tasks are complete and not pending.
- Confirm final asset resolution and format match user destination (feed, story, landscape film review).
- Confirm on-screen text contains only user-requested copy and verified stats.
- Confirm no fabricated footage, logos, overlays, or URLs.

### Rules
- NEVER fabricate highlight clips — only use actual film URLs from the database or user uploads
- If no video exists, explain what footage is needed and how to upload it
- Always ask for the user's music preference before adding audio`;
  }
}
