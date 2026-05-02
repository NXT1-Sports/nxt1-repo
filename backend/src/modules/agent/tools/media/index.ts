/**
 * @fileoverview Media Tools
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Tools for creating and manipulating visual/audio/video content.
 *
 * Active tools:
 * - GenerateGraphicTool       — Professional branded graphic generation ✅
 * - AnalyzeVideoTool          — Game film / video analysis via Gemini ✅
 * - StageMediaTool            — Thread-scoped ephemeral signed URL staging ✅
 *
 * Planned tools:
 * - GenerateMotionGraphicTool — Runway ML motion graphic generation
 * - GenerateHighlightReelTool — Stitch video clips into highlight reels
 * - EnhanceGraphicTool        — AI-enhance an existing image
 * - AnalyzeImageTool          — Describe/analyze an uploaded image
 */

export { GenerateGraphicTool } from './generate-graphic.tool.js';
export { AnalyzeVideoTool } from './analyze-video.tool.js';
export { StageMediaTool } from './stage-media.tool.js';
export { MediaStagingService } from './media-staging.service.js';
