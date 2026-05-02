export { FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';

// ── Zod Schemas ─────────────────────────────────────────────────────────
export {
  FfmpegOperationResultSchema,
  TrimVideoInputSchema,
  MergeVideosInputSchema,
  ResizeVideoInputSchema,
  AddTextOverlayInputSchema,
  BurnSubtitlesInputSchema,
  GenerateThumbnailInputSchema,
  ConvertVideoInputSchema,
  CompressVideoInputSchema,
  type FfmpegOperationResult,
  type TrimVideoInput,
  type MergeVideosInput,
  type ResizeVideoInput,
  type AddTextOverlayInput,
  type BurnSubtitlesInput,
  type GenerateThumbnailInput,
  type ConvertVideoInput,
  type CompressVideoInput,
} from './schemas.js';

// ── Agent X Tools ───────────────────────────────────────────────────────
export { FfmpegTrimVideoTool } from './ffmpeg-trim-video.tool.js';
export { FfmpegMergeVideosTool } from './ffmpeg-merge-videos.tool.js';
export { FfmpegResizeVideoTool } from './ffmpeg-resize-video.tool.js';
export { FfmpegAddTextOverlayTool } from './ffmpeg-add-text-overlay.tool.js';
export { FfmpegBurnSubtitlesTool } from './ffmpeg-burn-subtitles.tool.js';
export { FfmpegGenerateThumbnailTool } from './ffmpeg-generate-thumbnail.tool.js';
export { FfmpegConvertVideoTool } from './ffmpeg-convert-video.tool.js';
export { FfmpegCompressVideoTool } from './ffmpeg-compress-video.tool.js';
