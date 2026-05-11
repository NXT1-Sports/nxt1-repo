import { z } from 'zod';

export const OUTSTAND_SOCIAL_PLATFORMS = ['x', 'instagram', 'youtube', 'tiktok'] as const;

export const OutstandSocialPlatformSchema = z.enum(OUTSTAND_SOCIAL_PLATFORMS);

export type OutstandSocialPlatform = z.infer<typeof OutstandSocialPlatformSchema>;

const IsoDateTimeSchema = z.string().datetime({ offset: true });

const IsoDateTimeFromMixedSchema = z.preprocess((value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const asMs = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(asMs);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return value;
}, IsoDateTimeSchema);

export const OutstandSocialAccountSchema = z.object({
  id: z.string().min(1),
  network: OutstandSocialPlatformSchema,
  username: z.string().min(1),
  displayName: z.string().optional(),
  profileUrl: z.string().url().optional(),
  followerCount: z.number().int().nonnegative().optional(),
  connectedAt: IsoDateTimeSchema.optional(),
  isActive: z.boolean().default(true),
});

export type OutstandSocialAccount = z.infer<typeof OutstandSocialAccountSchema>;

export const PublishPostToSocialsInputSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  platforms: z.array(OutstandSocialPlatformSchema).min(1),
  mediaIds: z.array(z.string().trim().min(1)).max(16).optional(),
  firstComment: z.string().trim().min(1).max(2_200).optional(),
  threadContent: z.array(z.string().trim().min(1).max(10_000)).max(32).optional(),
  scheduledAt: IsoDateTimeFromMixedSchema.optional(),
  platformOverrides: z.record(z.string(), z.unknown()).optional(),
});

export type PublishPostToSocialsInput = z.infer<typeof PublishPostToSocialsInputSchema>;

export const OutstandCreatePostResultSchema = z.object({
  postIds: z.array(z.string().min(1)).min(1),
  scheduledAt: IsoDateTimeSchema.optional(),
  status: z.string().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export type OutstandCreatePostResult = z.infer<typeof OutstandCreatePostResultSchema>;

export const SchedulePostSeriesItemSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  platforms: z.array(OutstandSocialPlatformSchema).min(1),
  scheduledAt: IsoDateTimeFromMixedSchema,
  mediaIds: z.array(z.string().trim().min(1)).max(16).optional(),
  firstComment: z.string().trim().min(1).max(2_200).optional(),
  threadContent: z.array(z.string().trim().min(1).max(10_000)).max(32).optional(),
  platformOverrides: z.record(z.string(), z.unknown()).optional(),
});

export const SchedulePostSeriesInputSchema = z.object({
  posts: z.array(SchedulePostSeriesItemSchema).min(1).max(50),
  failFast: z.boolean().optional().default(false),
});

export type SchedulePostSeriesInput = z.infer<typeof SchedulePostSeriesInputSchema>;

export const GetPostAnalyticsInputSchema = z.object({
  postId: z.string().trim().min(1),
});

export type GetPostAnalyticsInput = z.infer<typeof GetPostAnalyticsInputSchema>;

export const GetProfileAnalyticsInputSchema = z.object({
  platforms: z.array(OutstandSocialPlatformSchema).min(1).optional(),
  daysBack: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(90)]).optional(),
});

export type GetProfileAnalyticsInput = z.infer<typeof GetProfileAnalyticsInputSchema>;

export const OutstandPostAnalyticsSchema = z.object({
  postId: z.string().min(1),
  likes: z.number().nonnegative().default(0),
  comments: z.number().nonnegative().default(0),
  shares: z.number().nonnegative().default(0),
  views: z.number().nonnegative().default(0),
  impressions: z.number().nonnegative().default(0),
  reach: z.number().nonnegative().default(0),
  engagementRate: z.number().nonnegative().default(0),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export type OutstandPostAnalytics = z.infer<typeof OutstandPostAnalyticsSchema>;

export const OutstandAccountMetricsSchema = z.object({
  socialAccountId: z.string().min(1),
  followerCount: z.number().nonnegative().default(0),
  engagementRate: z.number().nonnegative().default(0),
  likes: z.number().nonnegative().default(0),
  comments: z.number().nonnegative().default(0),
  shares: z.number().nonnegative().default(0),
  views: z.number().nonnegative().default(0),
  impressions: z.number().nonnegative().default(0),
  reach: z.number().nonnegative().default(0),
  startDate: IsoDateTimeSchema.optional(),
  endDate: IsoDateTimeSchema.optional(),
  trendPoints: z
    .array(
      z.object({
        date: z.string().min(1),
        followerCount: z.number().nonnegative().optional(),
        engagementRate: z.number().nonnegative().optional(),
        likes: z.number().nonnegative().optional(),
        comments: z.number().nonnegative().optional(),
        shares: z.number().nonnegative().optional(),
        views: z.number().nonnegative().optional(),
      })
    )
    .default([]),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export type OutstandAccountMetrics = z.infer<typeof OutstandAccountMetricsSchema>;

export const GetConnectedSocialAccountsInputSchema = z.object({
  platforms: z.array(OutstandSocialPlatformSchema).min(1).optional(),
});

export type GetConnectedSocialAccountsInput = z.infer<typeof GetConnectedSocialAccountsInputSchema>;

export const OutstandCallbackPlatformSchema = OutstandSocialPlatformSchema;

export type OutstandCallbackPlatform = z.infer<typeof OutstandCallbackPlatformSchema>;

export const OutstandConnectUrlInputSchema = z.object({
  platform: OutstandSocialPlatformSchema,
  callbackUrl: z.string().url(),
});

export type OutstandConnectUrlInput = z.infer<typeof OutstandConnectUrlInputSchema>;
