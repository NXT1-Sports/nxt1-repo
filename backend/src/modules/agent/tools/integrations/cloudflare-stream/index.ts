export { CloudflareMcpBridgeService } from './cloudflare-mcp-bridge.service.js';
/**
 * @fileoverview Cloudflare Stream Tools — Barrel Export
 * @module @nxt1/backend/modules/agent/tools/integrations/cloudflare-stream
 *
 * Agent X tools for ephemeral video processing via Cloudflare Stream.
 * Firebase Storage remains the permanent source of truth — Cloudflare is
 * a temporary compute engine that processes and returns artifacts.
 */

// ── Zod Schemas ─────────────────────────────────────────────────────────
export {
  // Response schemas
  CfStreamVideoSchema,
  CfClipSchema,
  CfWatermarkProfileSchema,
  CfCaptionSchema,
  CfDownloadSchema,
  CfSignedTokenSchema,
  CfVideoListSchema,
  // Input schemas
  ImportVideoInputSchema,
  ClipVideoInputSchema,
  GenerateThumbnailInputSchema,
  GetVideoDetailsInputSchema,
  GenerateCaptionsInputSchema,
  CreateSignedUrlInputSchema,
  EnableDownloadInputSchema,
  ManageWatermarkInputSchema,
} from './schemas.js';

// ── Agent X Tools ───────────────────────────────────────────────────────
export { ImportVideoTool } from './import-video.tool.js';
export { ClipVideoTool } from './clip-video.tool.js';
export { GenerateThumbnailTool } from './generate-thumbnail.tool.js';
export { GetVideoDetailsTool } from './get-video-details.tool.js';
export { GenerateCaptionsTool } from './generate-captions.tool.js';
export { CreateSignedUrlTool } from './create-signed-url.tool.js';
export { EnableDownloadTool } from './enable-download.tool.js';
export { ManageWatermarkTool } from './manage-watermark.tool.js';
export { DeleteVideoTool } from './delete-video.tool.js';
