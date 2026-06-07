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
    'Highlight reel editing guidelines with explicit tool orchestration for generate_graphic, runway_generate_video, runway_upscale_video, runway_check_task, ffmpeg_trim_video, ffmpeg_merge_videos, ffmpeg_add_text_overlay, ffmpeg_burn_subtitles, ffmpeg_convert_video, and ffmpeg_compress_video.';
  readonly category: SkillCategory = 'brand';

  getPromptContext(_params?: Record<string, unknown>): string {
    return `## Video Highlight Guidelines

### Highlight Reel Structure
1. **Intro (3–4 sec)**: Name plate with position, school, class year, and sport-specific tagline
2. **Top Plays (60–90 sec)**: Use all usable uploaded clips in strongest-first order for small batches. For long raw game film, select the best 8–12 full play windows.
3. **Stat Overlay (5 sec)**: Key verified stats displayed over slow-motion clip
4. **Outro (3–4 sec)**: NXT1 branding + profile link + contact info

### Pacing & Transitions
- For uploaded clips under about 30 seconds, preserve the full clip unless there is obvious dead air or the user asks for a quick social cut
- For longer clips, select the full play sequence, not only the impact moment; include 2–3 seconds before the key action and 4–6 seconds after when timestamps allow
- Avoid default 3–7 second cuts unless the user explicitly asks for shorts, teasers, TikTok/Reels-style quick cuts, top moments, best moments, or a short target duration
- Cut on the action while preserving the complete play context
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
- Use runway_generate_video to animate static cards into motion openers with visible camera movement, parallax, kinetic typography, athlete/profile reveal, light sweeps, depth, and a clean final frame. The opener should feel like a premium sports broadcast package, not a still image exported as video.
- Use runway_check_task to verify async completion before proceeding.
- If the Runway output is static, frozen, or too subtle, run one corrective pass with stronger motion language or runway_upscale_video for sharpness/quality before merging.

2. **Build highlight sequence**
- Call ffmpeg_trim_video for each selected play, full-play window, or preserved short source clip with concrete start/end times or duration; never call it with empty arguments.
- If preserving a short source clip, use startTime="0" and endTime equal to the source duration from get_video_details or analyze_video.
- Only call ffmpeg_merge_videos after all trims have resolved.
- Use ffmpeg_merge_videos to assemble intro + highlights + outro. For branded reels with a Runway/graphic opener as the first input, pass maxIntroSeconds=4 so the intro cannot freeze past the intended 3–4 second timeline.
- Use ffmpeg_add_text_overlay only for short lower-thirds/stat cards of 15 seconds or less. Use generate_graphic title cards for full-reel branding.

3. **Polish and delivery**
- Use the generated intro-card image URL from generate_graphic as the canonical thumbnail/poster for the merged reel. The final chat attachment should show the intro slide as the video thumbnail whenever an intro card exists.
- Still call ffmpeg_generate_thumbnail on the final merged video immediately after ffmpeg_merge_videos completes as playback validation and as the fallback poster when no intro-card image exists. Use time="00:00:02" first; if that frame is black/blank or unusable, retry at time="00:00:00".
- Treat both the intro-card poster and any ffmpeg frame grab as **video poster metadata** for the merged reel, not as separate standalone deliverables. In normal highlight responses, return the final video only. Mention or link the poster separately **only** when the user explicitly asks for a poster image/screenshot/frame export.
- Do not send Hudl clips, game film, merged reels, uploaded videos, or FFmpeg outputs to Runway video-to-video. Runway is only for animating generated graphics/images or refining Runway-generated motion outputs.
- Use runway_upscale_video only for Runway-generated outputs.
- Use ffmpeg_burn_subtitles when captions are requested.
- Use ffmpeg_convert_video and ffmpeg_compress_video only for final delivery requirements, not as routine prerequisites before merge.

### URL & Asset Handling
- Treat tool output URLs as source-of-truth and chain them directly into next tool calls.
- Use stage_media if an external URL needs normalization or stable signed access.
- Keep a strict output lineage: introUrl, clipUrls, mergedUrl, finalUrl.

### Quality Gate (Before Final Response)
- Confirm Runway tasks are complete and not pending.
- Confirm the Runway opener has visible motion and is not a static/frozen title card.
- Confirm ffmpeg_merge_videos and ffmpeg_generate_thumbnail both succeeded before presenting a highlight reel as final. If an intro card exists, confirm its image URL is used as the merged video's thumbnailUrl; if not, confirm the ffmpeg thumbnailUrl is used. If merge or thumbnail validation fails, do not attach raw source clips, staged intermediate clips, or generated intro art as the final deliverable.
- Confirm final asset resolution and format match user destination (feed, story, landscape film review).
- Confirm on-screen text contains only user-requested copy and verified stats.
- Confirm no fabricated footage, logos, overlays, or URLs.

### Rules
- NEVER fabricate highlight clips — only use actual film URLs from the database or user uploads
- If no video exists, explain what footage is needed and how to upload it
- Always ask for the user's music preference before adding audio`;
  }
}
