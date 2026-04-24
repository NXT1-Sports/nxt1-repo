/**
 * @fileoverview Media Tools
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Tools for creating and manipulating visual/audio/video content.
 *
 * Active tools:
 * - GenerateGraphicTool       — Professional branded graphic generation ✅
 * - AnalyzeVideoTool          — Game film / video analysis via Gemini ✅
 *
 * Planned tools:
 * - GenerateMotionGraphicTool — Runway ML motion graphic generation
 * - GenerateHighlightReelTool — Stitch video clips into highlight reels
 * - EnhanceGraphicTool        — AI-enhance an existing image
 * - AnalyzeImageTool          — Describe/analyze an uploaded image
 */

export { GenerateGraphicTool } from './generate-graphic.tool.js';
export { AnalyzeVideoTool } from './analyze-video.tool.js';

// ── MCP-Bridged Runway Tools (2026 architecture) ────────────────────────
export { RunwayGenerateVideoTool } from './runway-generate-video.tool.js';
export { RunwayEditVideoTool } from './runway-edit-video.tool.js';
export { RunwayUpscaleVideoTool } from './runway-upscale-video.tool.js';
export { RunwayCheckTaskTool } from './runway-check-task.tool.js';
