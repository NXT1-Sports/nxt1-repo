/**
 * @fileoverview Media Tools
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Tools for creating and manipulating visual/audio/video content.
 *
 * Active tools:
 * - GenerateGraphicTool       — Professional branded graphic generation ✅
 * - AnalyzeVideoTool          — Game film / video analysis via Gemini ✅
 * - AnalyzeImageTool          — Athlete image verification & vision analysis ✅
 * - StageMediaTool            — Thread-scoped ephemeral signed URL staging ✅
 * - RecommendLearningVideosTool — Curated study video recommendations ✅
 *
 * Planned tools:
 * - GenerateMotionGraphicTool — Runway ML motion graphic generation
 * - GenerateHighlightReelTool — Stitch video clips into highlight reels
 * - EnhanceGraphicTool        — AI-enhance an existing image
 */

export { GenerateGraphicTool } from './generate-graphic.tool.js';
export { AnalyzeVideoTool } from './analyze-video.tool.js';
export { AnalyzeFilmReviewSourcesTool } from './analyze-film-review-sources.tool.js';
export { AnalyzeFilmReviewSourceBreakdownsTool } from './analyze-film-review-source-breakdowns.tool.js';
export { AnalyzeImageTool } from './analyze-image.tool.js';
export { EnrichDocumentNotesTool } from './enrich-document-notes.tool.js';
export { RenderPdfPagesTool } from './render-pdf-pages.tool.js';
export { StageMediaTool } from './stage-media.tool.js';
export { ParseDocumentTool } from './parse-document.tool.js';
export { MediaStagingService } from './media-staging.service.js';
export { ExtractHudlVideoTool } from './extract-hudl-video.tool.js';
export { RecommendLearningVideosTool } from './recommend-learning-videos.tool.js';
export { LearningVideoRecommendationService } from './learning-video-recommendation.service.js';
