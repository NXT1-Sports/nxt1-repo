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
- extract_live_view_media is the entry point for obtaining the real media URLs and authenticated request material from the user's active browser session.
- extract_live_view_playlist is the entry point for obtaining multiple clip URLs and their auth bundle from a playlist page without opening clips one by one.
- analyze_video should only receive a directly playable video URL or a downloadable MP4 URL.

### Single Clip Workflow
1. If the user already provided a direct public video URL or an uploaded Cloudflare video, analyze that real video source.
2. If the clip is inside a signed-in live-view session, use extract_live_view_media first.
3. If extract_live_view_media returns a direct MP4, use that playable URL.
4. If it returns protected HLS or DASH only, use call_apify_actor with the extracted headers or cookies and set skipMediaPersistence: true.
5. When Apify returns a downloadable MP4 URL, use import_video with waitForReady: true, then enable_download, then analyze the downloadable MP4.

### Playlist Or Multi-Clip Workflow
1. First use extract_live_view_playlist to capture the playlist entries, clip URLs, titles, and auth bundle from the current page.
2. Use read_live_view only if you need extra context about clip order or visible labels that the playlist extractor did not return.
3. Pass the extracted clip URLs plus auth headers or cookies into the downloader workflow instead of opening clips manually in the browser.
4. Run the clip acquisition steps independently and in parallel whenever possible.
5. Batch up to 5 final playable video URLs into one analyze_video call when the prompt is the same.
6. If more than 5 clips are requested, process them in batches instead of serial one-by-one film reviews.

### Hard Prohibitions
- Never treat interact_with_live_view as a vision tool.
- Never claim a play outcome from paused UI states, thumbnails, or scrubber positions.
- Never pass protected raw .m3u8 or .mpd URLs directly into analyze_video.
- Never loop through playlist clicks as a substitute for actual media extraction.

### Decision Rules
- If the task is film evaluation, prioritize real media extraction over browser interaction.
- If the task is "first N clips" or "these 10 plays", think in terms of acquisition batches, not manual watching.
- If a page action is needed before extraction, do the minimum UI navigation required, then return to the media pipeline immediately.`;
  }
}
