/**
 * @fileoverview Media Extraction Zod Schema
 * @module @nxt1/backend/modules/agent/schemas
 *
 * Strict validation schema for the Media Specialist sub-agent output.
 * Covers: video links (YouTube, Hudl, Vimeo), social profile URLs,
 * and media metadata.
 *
 * Media links are deduplicated against existing connectedSources[]
 * before writing to the User doc.
 */

import { z } from 'zod';

// ─── Video Link ─────────────────────────────────────────────────────────────

const VideoPlatformSchema = z
  .enum(['youtube', 'hudl', 'vimeo', 'maxpreps', 'other'])
  .describe('Video hosting platform');

const VideoLinkSchema = z.object({
  url: z.string().url().describe('Direct URL to the video'),
  platform: VideoPlatformSchema,
  title: z.string().optional().describe('Video title if available'),
  thumbnailUrl: z.string().url().optional().describe('Thumbnail image URL'),
  durationSeconds: z.number().positive().optional().describe('Video duration in seconds'),
  publishedAt: z.string().optional().describe('Publish date (ISO or human-readable)'),
  isHighlight: z.boolean().default(false).describe('Whether this is a highlight reel'),
});

// ─── Social Profile ─────────────────────────────────────────────────────────

const SocialPlatformSchema = z
  .enum(['twitter', 'instagram', 'tiktok', 'facebook', 'linkedin', 'snapchat', 'threads', 'other'])
  .describe('Social media platform');

const SocialProfileSchema = z.object({
  url: z.string().url().describe('Profile URL'),
  platform: SocialPlatformSchema,
  handle: z.string().optional().describe('Username/handle without @'),
  followerCount: z
    .number()
    .nonnegative()
    .optional()
    .describe('Number of followers (if publicly visible)'),
  verified: z.boolean().optional().describe('Whether the account is verified'),
});

// ─── Connected Source Reference ─────────────────────────────────────────────

const SourceRefSchema = z.object({
  platform: z.string().min(1).describe('Platform identifier, e.g. "maxpreps", "247sports"'),
  profileUrl: z.string().url().describe('Direct URL to the profile on this platform'),
  displayName: z.string().optional().describe('Profile display name on that platform'),
});

// ─── Root Schema ────────────────────────────────────────────────────────────

export const MediaExtractionSchema = z.object({
  videos: z.array(VideoLinkSchema).default([]).describe('Video links found in scraped content'),
  socialProfiles: z.array(SocialProfileSchema).default([]).describe('Social media profiles found'),
  connectedSources: z
    .array(SourceRefSchema)
    .default([])
    .describe('Third-party platform profile references'),
  profileImageUrl: z.string().url().optional().describe('Profile/headshot image URL if found'),
  bannerImageUrl: z.string().url().optional().describe('Banner/cover image URL if found'),
});

export type MediaExtraction = z.infer<typeof MediaExtractionSchema>;
