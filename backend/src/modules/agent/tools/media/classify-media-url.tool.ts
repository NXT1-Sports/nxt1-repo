/**
 * @fileoverview Classify Media URL Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Classifies a URL and returns the canonical acquisition strategy, platform,
 * asset kind, and exact corrective tool call syntax. Call this FIRST when
 * you receive any URL that needs media acquisition — it tells you exactly
 * which tool to use next.
 *
 * This is a zero-cost, synchronous operation — no external calls.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { UrlClassifierService } from './url-classifier.service.js';
import { z } from 'zod';

const ClassifyMediaUrlInputSchema = z.object({
  url: z.string().trim().min(1).describe('The URL to classify (any format).'),
});

const classifierSingleton = new UrlClassifierService();

export class ClassifyMediaUrlTool extends BaseTool {
  readonly name = 'classify_media_url';
  readonly entityGroup = 'system_tools' as const;
  readonly description =
    'Classify any URL to determine the correct acquisition strategy and tool to use. ' +
    'Returns: platform (twitter/instagram/youtube/hudl/web/etc.), assetKind ' +
    '(single_tweet/profile/video/image/stream/page), strategy, and the EXACT tool call ' +
    'to use next. Call this first whenever you receive a URL that needs media extraction. ' +
    'Zero cost — no external API calls.';

  readonly parameters = ClassifyMediaUrlInputSchema;
  readonly isMutation = false;
  readonly category = 'system' as const;

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ClassifyMediaUrlInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      };
    }

    const classification = classifierSingleton.classify(parsed.data.url);

    return {
      success: true,
      data: {
        url: parsed.data.url,
        platform: classification.platform,
        assetKind: classification.assetKind,
        strategy: classification.strategy,
        isSocialBlocked: classification.isSocialBlocked,
        nextStep: classification.correctiveExample,
        guidance: buildGuidance(classification.strategy),
      },
    };
  }
}

function buildGuidance(strategy: string): string {
  switch (strategy) {
    case 'scrape_twitter_single_tweet':
      return 'Call scrape_twitter with mode="single_tweet" and tweetUrl. Returns tweet text, imageUrls[], videoUrl, and a mediaArtifact.';
    case 'scrape_twitter_profile':
      return 'Call scrape_twitter with mode="profile_tweets" and the username extracted from the URL.';
    case 'scrape_instagram':
      return 'Call scrape_instagram with the URL. Under the hood this uses Apify actor "apify~instagram-scraper" with directUrls + resultsType="posts". Returns posts with displayUrl (image), videoUrl (MP4), caption, type. Profile URLs return up to 30 recent posts.';
    case 'scrape_tiktok':
      return 'Use Apify actor "clockworks~free-tiktok-scraper". For a profile URL use input { profiles: ["username"], resultsPerPage: 10 }. For a single post URL use input { postURLs: ["url"] }. Returns post metadata, caption, webVideoUrl (canonical TikTok URL), and coverUrl. Note: direct CDN video URLs are NOT available from the free scraper — for video analysis, use the coverUrl image as a proxy or present metadata to the user.';
    case 'scrape_facebook':
      return 'Use Apify actor "apify/facebook-pages-scraper" with input { startUrls: [{ url }], maxPosts: 20 }. Returns page info, posts, images, and video URLs from public Facebook pages. Note: content behind login is not accessible.';
    case 'scrape_linkedin':
      return 'Use Apify actor "anchor/linkedin-profile-scraper" with input { profileUrls: [url] }. Returns name, headline, summary, experience, education, and skills from public LinkedIn profiles. Note: detailed contact info requires login.';
    case 'analyze_video_direct':
      return 'Call analyze_video directly with the URL — no staging needed.';
    case 'stage_direct_video':
      return 'Call stage_media with sourceUrl. Returns a MediaWorkflowArtifact ready for analyze_video.';
    case 'stage_direct_image':
      return 'Call stage_media with sourceUrl. Returns a MediaWorkflowArtifact with mediaKind=image.';
    case 'extract_hudl_video':
      return 'Call extract_hudl_video({ url }) to get direct MP4 sources from a public Hudl highlight page. Returns bestUrl (720p), sources (mobile/sd/hd), and a MediaWorkflowArtifact ready for analyze_video.';
    case 'stage_direct_stream':
      return 'Call stage_media with sourceUrl for HLS/DASH. Returns a MediaWorkflowArtifact. May need call_apify_actor to download if protected.';
    case 'live_view_required':
      return 'Open a live browser session first: open_live_view → extract_live_view_media. Required for fully auth-gated sources where no scraper is available.';
    case 'firecrawl_scrape':
      return (
        'Call scrape_webpage({ url }) — rawHtml is the default and must always be used. ' +
        'rawHtml returns full unmodified HTML including all <script> tags and JS data blobs. ' +
        'Video URLs can be embedded in script tags on ANY page type including articles and news sites. ' +
        'Never use markdown format when looking for media content. ' +
        'IMPORTANT: For fan.hudl.com pages (Next.js app), always pass waitFor: 8000 — they require 8 seconds to hydrate and will return empty video data with shorter waits. ' +
        'See the nextStep field for Hudl CDN-specific extraction patterns (akamaihd.net vs vg.hudl.com).'
      );
    default:
      return 'Use scrape_webpage for general web content.';
  }
}
