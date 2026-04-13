/**
 * @fileoverview Cloudflare Stream — Zod Schemas
 * @module @nxt1/backend/modules/agent/tools/integrations/cloudflare-stream
 *
 * Zod schemas for validating Cloudflare Stream API responses and Agent X tool inputs.
 * Used by the CloudflareMcpBridgeService proxy methods and the tool shells.
 */

import { z } from 'zod';

// ─── Response Schemas (validate CF API output) ──────────────────────────────

/** Video status sub-object returned inside every CF Stream video resource. */
const CfVideoStatusSchema = z
  .object({
    state: z.string(),
    pctComplete: z.union([z.string(), z.number()]).optional(),
    errorReasonCode: z.string().optional(),
    errorReasonText: z.string().optional(),
  })
  .passthrough();

/** Playback URLs sub-object. */
const CfPlaybackSchema = z
  .object({
    hls: z.string().optional(),
    dash: z.string().optional(),
  })
  .passthrough();

/** Input dimensions sub-object. */
const CfInputSchema = z
  .object({
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .passthrough();

/** Full video resource returned by most Stream endpoints. */
export const CfStreamVideoSchema = z
  .object({
    uid: z.string(),
    thumbnail: z.string().optional(),
    thumbnailTimestampPct: z.number().optional(),
    readyToStream: z.boolean().optional(),
    readyToStreamAt: z.string().optional(),
    status: CfVideoStatusSchema.optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
    created: z.string().optional(),
    modified: z.string().optional(),
    scheduledDeletion: z.string().optional(),
    size: z.number().optional(),
    preview: z.string().optional(),
    allowedOrigins: z.array(z.string()).optional(),
    requireSignedURLs: z.boolean().optional(),
    uploaded: z.string().optional(),
    uploadExpiry: z.string().optional(),
    maxSizeBytes: z.number().nullable().optional(),
    maxDurationSeconds: z.number().nullable().optional(),
    duration: z.number().optional(),
    input: CfInputSchema.optional(),
    playback: CfPlaybackSchema.optional(),
    watermark: z.record(z.string(), z.unknown()).nullable().optional(),
    clippedFromVideoUID: z.string().optional(),
  })
  .passthrough();

export type CfStreamVideo = z.infer<typeof CfStreamVideoSchema>;

/** Direct upload URL response. */
export const CfDirectUploadSchema = z
  .object({
    uploadURL: z.string(),
    uid: z.string(),
  })
  .passthrough();

export type CfDirectUpload = z.infer<typeof CfDirectUploadSchema>;

/** Clip response (same shape as video, with clippedFromVideoUID). */
export const CfClipSchema = CfStreamVideoSchema;
export type CfClip = z.infer<typeof CfClipSchema>;

/** Watermark profile. */
export const CfWatermarkProfileSchema = z
  .object({
    uid: z.string(),
    name: z.string().optional(),
    size: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    created: z.string().optional(),
  })
  .passthrough();

export type CfWatermarkProfile = z.infer<typeof CfWatermarkProfileSchema>;

/** Caption/subtitle track. */
export const CfCaptionSchema = z
  .object({
    language: z.string(),
    label: z.string().optional(),
    generated: z.boolean().optional(),
    status: z.string().optional(),
  })
  .passthrough();

export type CfCaption = z.infer<typeof CfCaptionSchema>;

/** Download status. */
export const CfDownloadSchema = z
  .object({
    default: z
      .object({
        status: z.string().optional(),
        url: z.string().optional(),
        percentComplete: z.number().optional(),
      })
      .passthrough()
      .optional(),
    audio: z
      .object({
        status: z.string().optional(),
        url: z.string().optional(),
        percentComplete: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type CfDownload = z.infer<typeof CfDownloadSchema>;

/** Token response from create signed token. */
export const CfSignedTokenSchema = z
  .object({
    token: z.string(),
  })
  .passthrough();

export type CfSignedToken = z.infer<typeof CfSignedTokenSchema>;

/** Video list response. */
export const CfVideoListSchema = z.array(CfStreamVideoSchema);
export type CfVideoList = z.infer<typeof CfVideoListSchema>;

/** Watermark list response. */
export const CfWatermarkListSchema = z.array(CfWatermarkProfileSchema);
export type CfWatermarkList = z.infer<typeof CfWatermarkListSchema>;

/** Caption list response. */
export const CfCaptionListSchema = z.array(CfCaptionSchema);
export type CfCaptionList = z.infer<typeof CfCaptionListSchema>;

// ─── Input Schemas (validate Agent X tool inputs) ───────────────────────────

/** import_video tool input. */
export const ImportVideoInputSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  name: z.string().max(256).optional(),
  scheduleDeletionMinutes: z.number().int().min(1).max(1440).optional(),
  waitForReady: z.boolean().optional(),
});

/** clip_video tool input. */
export const ClipVideoInputSchema = z.object({
  videoId: z.string().min(1, 'videoId is required'),
  startTimeSeconds: z.number().min(0),
  endTimeSeconds: z.number().min(0),
  watermarkProfileId: z.string().optional(),
  scheduleDeletionMinutes: z.number().int().min(1).max(1440).optional(),
});

/** generate_thumbnail tool input. */
export const GenerateThumbnailInputSchema = z.object({
  videoId: z.string().min(1, 'videoId is required'),
  timeSeconds: z.number().min(0).optional(),
  height: z.number().int().min(100).max(1080).optional(),
  width: z.number().int().min(100).max(1920).optional(),
  animated: z.boolean().optional(),
  animatedDurationSeconds: z.number().min(1).max(10).optional(),
  animatedFps: z.number().int().min(1).max(15).optional(),
});

/** get_video_details tool input. */
export const GetVideoDetailsInputSchema = z.object({
  videoId: z.string().min(1, 'videoId is required'),
  waitForReady: z.boolean().optional(),
  maxWaitSeconds: z.number().int().min(5).max(600).optional(),
});

/** generate_captions tool input. */
export const GenerateCaptionsInputSchema = z.object({
  videoId: z.string().min(1, 'videoId is required'),
  language: z
    .enum(['en', 'es', 'fr', 'de', 'ja', 'ko', 'pt', 'ru', 'it', 'pl', 'nl', 'cs'])
    .default('en'),
});

/** create_signed_url tool input. */
export const CreateSignedUrlInputSchema = z.object({
  videoId: z.string().min(1, 'videoId is required'),
  expiresInMinutes: z.number().int().min(1).max(43200).optional(),
  downloadable: z.boolean().optional(),
});

/** enable_download tool input. */
export const EnableDownloadInputSchema = z.object({
  videoId: z.string().min(1, 'videoId is required'),
  type: z.enum(['video', 'audio']).default('video'),
});

/** manage_watermark tool input. */
export const ManageWatermarkInputSchema = z.object({
  action: z.enum(['create', 'list']),
  name: z.string().max(256).optional(),
  imageUrl: z.string().url().optional(),
});
