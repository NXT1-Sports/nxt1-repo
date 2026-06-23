/**
 * @fileoverview Film Ingestion Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 *
 * Teaches evaluators and strategists how to handle directly ingested video
 * (uploaded files or direct URLs) before calling analyze_video.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class FilmIngestionSkill extends BaseSkill {
  readonly name = 'film_ingestion';
  readonly description =
    'Direct video ingestion for film analysis — handling uploaded MP4s, Cloudflare stream URLs, ' +
    'direct video links, multi-clip batching, URL validation, and analyze_video call rules.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(): string {
    return `## Film Ingestion Rules
Users provide video directly — as an uploaded file or a direct URL. Never infer plays, technique, or movement from screenshots, thumbnails, or static frames.

### How Users Provide Video
- **Uploaded file**: User uploads an MP4 or video file directly in the chat. Use the resolved file URL from the upload.
- **Direct URL**: User pastes a Cloudflare stream URL, CDN link, or direct MP4 URL. Use it as-is.
- **Multiple clips**: User provides multiple URLs or uploads in one message — treat each as a separate clip.

### Single Clip Workflow
1. Confirm the input is a direct playable video URL or resolved upload URL — not a webpage, thumbnail, or embed page.
2. If the URL points to a webpage (e.g., a share link), ask the user to provide the direct video file or URL instead.
3. Call \`analyze_video\` with the URL and the coaching/analysis prompt.
4. Call \`import_video\` only when the video needs to be persisted for editing, clipping, annotations, or reuse — not for analysis alone.

### Multi-Clip Workflow
1. Default batch size: up to 5 clips per \`analyze_video\` call when the analysis prompt is identical.
2. If the user provides more than 5 clips, process in explicit 5-clip batches and present results progressively.
3. Each clip can be analyzed in parallel when prompts are the same — do not wait for one to finish before starting the next.
4. If clips have different focus areas, analyze each independently with its own prompt.

### Hard Prohibitions
- Never use a screenshot, thumbnail, or static frame as a substitute for real video analysis.
- Never claim a play outcome from a paused frame, scrubber position, or preview image.
- Never pass a webpage URL or embed link into \`analyze_video\` — it must be a direct video source.
- Never hallucinate play results when the video URL fails to load — surface the error and ask the user to re-provide the file.
- **NEVER INVENT VIDEO CONTENT:** If you cannot see or verify something in the actual video file, do not make it up. If unsure, ask for clarification or state the limitation explicitly.
- Always reference **Film Breakdown Taxonomy** for detailed "never hallucinate" rules when analysis begins

### When Video Fails to Load
- If \`analyze_video\` returns an error or cannot access the URL, tell the user immediately.
- Ask them to re-upload the file or provide a different direct URL.
- Do not attempt to infer play outcomes from context alone.`;
  }
}
