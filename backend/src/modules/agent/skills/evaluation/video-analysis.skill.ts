/**
 * @fileoverview Video Analysis Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 *
 * Teaches evaluators and strategists how to acquire real video media for
 * analysis without hallucinating from UI screenshots or live-view clicks.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class VideoAnalysisSkill extends BaseSkill {
  readonly name = 'video_analysis';
  readonly description =
    'Game film analysis, video breakdown, coach film study, Hudl playlist processing, clip batching, live-view media extraction, protected stream handling, Apify download workflow, Cloudflare import, MP4 analysis, single clip versus playlist decision rules.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(): string {
    return `## Video Analysis Operating Rules
Use real video media for film analysis. Never infer plays, technique, or movement from UI screenshots, thumbnail grids, or repeated live-view clicks.

### Core Principle
- interact_with_live_view is for navigation only.
- read_live_view is for understanding page structure, titles, and clip ordering.
- capture_live_view_screenshot is for visual page evidence, UI debugging, or proving the current browser state; it is not a film-analysis input.
- extract_live_view_media is the entry point for obtaining the real media URLs and authenticated request material from the user's active browser session.
- extract_live_view_playlist is currently DISABLED (not yet stable). For multiple clips, use interact_with_live_view to navigate + extract_live_view_media for each clip.
- analyze_video should only receive a directly playable video URL or a downloadable MP4 URL.
- Before the first page-changing live-view interaction in a film workflow, capture a screenshot or read the page so the user and agent have a grounded checkpoint of the current browser state.

### Single Clip Workflow
1. If the user already provided a direct public video URL or an uploaded Cloudflare video, analyze that real video source.
2. If the clip is inside a signed-in live-view session, use extract_live_view_media first.
3. If extract_live_view_media returns a direct MP4, use that playable URL.
4. If the live-view extractor returns a direct clip URL that requires cookies, referer, origin, or auth headers, do not send that raw URL into analyze_video. Acquire a downloadable MP4 through Apify first.
5. If it returns HLS or DASH manifests, use call_apify_actor with the extracted headers or cookies and set skipMediaPersistence: true so Apify converts the stream into a downloadable MP4.
6. Send the Apify-produced MP4 directly to analyze_video. Use import_video with waitForReady: true, then enable_download, only when the media must be persisted for editing, clipping, captions, or later reuse.

### Playlist Or Multi-Clip Workflow
1. Default to a small bounded set: max 5 clips unless the user explicitly requests a larger count.
2. extract_live_view_playlist is currently DISABLED. Instead: Use read_live_view to inspect the page and identify clips, then use interact_with_live_view to navigate to each clip sequentially, and extract_live_view_media for each.
3. For explicit clip selection (e.g., plays #96-100): Use interact_with_live_view to scroll/navigate to those plays, then extract media from each.
4. Run the clip acquisition steps independently and in parallel whenever possible.
5. Batch up to 5 final playable video URLs into one analyze_video call when the prompt is the same.
6. If more than 5 clips are requested, ask the user to narrow the range or process in explicit 5-clip batches.
7. For "last N plays": Use read_live_view to find the last clips, then interact_with_live_view to navigate and extract_live_view_media for each. If the target rows still cannot be clicked or media URLs are not extractable, ask the user to load the first target play and analyze the currently loaded clip.

### Hard Prohibitions
- Never treat interact_with_live_view as a vision tool.
- Never treat capture_live_view_screenshot as a substitute for real video media.
- Never claim a play outcome from paused UI states, thumbnails, or scrubber positions.
- Never pass protected raw .m3u8 or .mpd URLs directly into analyze_video.
- Never loop through playlist clicks as a substitute for actual media extraction.
- Never attempt to analyze an entire long playlist when the user asked for a small subset such as "last 5"; use bounded scrolling for the target subset only.

### Decision Rules
- If the task is film evaluation, prioritize real media extraction over browser interaction.
- If the task is "first N clips" or "these 10 plays", think in terms of acquisition batches, not manual watching.
- If a page action is needed before extraction, do the minimum UI navigation required, then return to the media pipeline immediately.`;
  }
}
