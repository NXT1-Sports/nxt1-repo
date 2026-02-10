/**
 * @fileoverview Share Service - Web Social Sharing
 * @module @nxt1/web/core/services
 *
 * Centralized Web Share API + clipboard fallback with analytics tracking.
 * Keeps components thin and ensures consistent share tracking across pages.
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  FIREBASE_EVENTS,
  type ShareEventParams,
  type AnalyticsAdapter,
} from '@nxt1/core/analytics';
import {
  type ShareableProfile,
  type ShareableTeam,
  type ShareableVideo,
  type ShareablePost,
  type ShareableContent,
  buildShareUrl,
  buildProfileShareTitle,
  buildProfileShareText,
  buildProfileShareDescription,
  buildTeamShareTitle,
  buildTeamShareText,
  buildVideoShareTitle,
  buildVideoShareText,
  buildPostShareTitle,
  buildPostShareText,
} from '@nxt1/core/seo';
import { NxtToastService, NxtLoggingService, ANALYTICS_ADAPTER } from '@nxt1/ui';

// ============================================
// TYPES
// ============================================

export interface ShareResultData {
  completed: boolean;
  method?: string;
  error?: string;
}

export interface ShareContentOptions {
  title?: string;
  text?: string;
  trackAnalytics?: boolean;
  analyticsProps?: Record<string, unknown>;
}

// ============================================
// SERVICE
// ============================================

@Injectable({ providedIn: 'root' })
export class ShareService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ShareService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  async shareProfile(
    profile: Omit<ShareableProfile, 'type' | 'title' | 'description'> & { id: string },
    options?: ShareContentOptions
  ): Promise<ShareResultData> {
    const shareableProfile: ShareableProfile = {
      type: 'profile',
      id: profile.id,
      slug: profile.slug,
      title: profile.athleteName,
      description: buildProfileShareDescription(profile),
      athleteName: profile.athleteName,
      position: profile.position,
      classYear: profile.classYear,
      school: profile.school,
      sport: profile.sport,
      location: profile.location,
      imageUrl: profile.imageUrl,
    };

    const shareText = options?.text || buildProfileShareText(profile);
    const shareTitle = options?.title || buildProfileShareTitle(profile);

    return this.shareContent(shareableProfile, {
      ...options,
      title: shareTitle,
      text: shareText,
    });
  }

  async shareTeam(
    team: Omit<ShareableTeam, 'type' | 'title' | 'description'> & { id: string },
    options?: ShareContentOptions
  ): Promise<ShareResultData> {
    const shareableTeam: ShareableTeam = {
      type: 'team',
      id: team.id,
      slug: team.slug,
      title: team.teamName,
      description: '',
      teamName: team.teamName,
      sport: team.sport,
      location: team.location,
      logoUrl: team.logoUrl,
      imageUrl: team.imageUrl,
      record: team.record,
    };

    const shareText = options?.text || buildTeamShareText(team);
    const shareTitle = options?.title || buildTeamShareTitle(team);

    return this.shareContent(shareableTeam, {
      ...options,
      title: shareTitle,
      text: shareText,
    });
  }

  async shareVideo(
    video: Omit<ShareableVideo, 'type' | 'title' | 'description'> & { id: string },
    options?: ShareContentOptions
  ): Promise<ShareResultData> {
    const shareableVideo: ShareableVideo = {
      type: 'video',
      id: video.id,
      slug: video.slug,
      title: video.videoTitle,
      description: '',
      videoTitle: video.videoTitle,
      athleteName: video.athleteName,
      thumbnailUrl: video.thumbnailUrl,
      imageUrl: video.imageUrl,
      duration: video.duration,
      views: video.views,
    };

    const shareText = options?.text || buildVideoShareText(video);
    const shareTitle = options?.title || buildVideoShareTitle(video);

    return this.shareContent(shareableVideo, {
      ...options,
      title: shareTitle,
      text: shareText,
    });
  }

  async sharePost(
    post: Omit<ShareablePost, 'type' | 'title' | 'description'> & { id: string; postText: string },
    options?: ShareContentOptions
  ): Promise<ShareResultData> {
    const shareablePost: ShareablePost = {
      type: 'post',
      id: post.id,
      slug: post.slug,
      title: `Post by ${post.authorName}`,
      description: post.postText,
      authorName: post.authorName,
      authorAvatar: post.authorAvatar,
      createdAt: post.createdAt,
      likes: post.likes,
      imageUrl: post.imageUrl,
    };

    const shareText = options?.text || buildPostShareText(post);
    const shareTitle = options?.title || buildPostShareTitle(post);

    return this.shareContent(shareablePost, {
      ...options,
      title: shareTitle,
      text: shareText,
    });
  }

  async shareContent(
    content: ShareableContent,
    options?: ShareContentOptions
  ): Promise<ShareResultData> {
    if (!this.isBrowser) {
      return { completed: false, error: 'Sharing is only available in the browser' };
    }

    const url = buildShareUrl(content);
    const title = options?.title || content.title;
    const text = options?.text || content.description;

    const result = await this.shareCustom({ title, text, url });
    this.trackShareEvent(content, result, options);

    return result;
  }

  // ============================================
  // LOW-LEVEL SHARING
  // ============================================

  private async shareCustom(shareOptions: {
    title?: string;
    text?: string;
    url?: string;
  }): Promise<ShareResultData> {
    if (!this.isBrowser) {
      return { completed: false, error: 'Sharing is only available in the browser' };
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareOptions.title,
          text: shareOptions.text,
          url: shareOptions.url,
        });

        this.logger.info('Share completed via Web Share API');
        return { completed: true, method: 'native_share' };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return { completed: false };
        }

        this.logger.warn('Web Share API failed', { error });
      }
    }

    return this.copyToClipboard(shareOptions.url || shareOptions.text || '');
  }

  private async copyToClipboard(text: string): Promise<ShareResultData> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      this.toast.success('Link copied to clipboard');
      this.logger.info('Share fallback: copy link');
      return { completed: true, method: 'copy_link' };
    } catch (error) {
      this.toast.error('Failed to copy link');
      this.logger.warn('Share fallback copy failed', { error });
      return {
        completed: false,
        error: error instanceof Error ? error.message : 'Clipboard failed',
      };
    }
  }

  private trackShareEvent(
    content: ShareableContent,
    result: ShareResultData,
    options?: ShareContentOptions
  ): void {
    const analytics: AnalyticsAdapter | null = this.analytics ?? null;
    if (!analytics || options?.trackAnalytics === false || !result.completed) return;

    const payload: ShareEventParams & Record<string, unknown> = {
      method: result.method || 'native_share',
      content_type: content.type,
      item_id: content.id,
      ...options?.analyticsProps,
    };

    analytics.trackEvent(FIREBASE_EVENTS.SHARE, payload);
  }
}
