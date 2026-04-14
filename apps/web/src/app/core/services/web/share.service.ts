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
  type ShareableArticle,
  type ShareableProfile,
  type ShareableTeam,
  type ShareablePost,
  type ShareableContent,
  buildShareUrl,
  buildArticleShareTitle,
  buildArticleShareText,
  buildArticleShareDescription,
  buildProfileShareTitle,
  buildProfileShareText,
  buildProfileShareDescription,
  buildTeamShareTitle,
  buildTeamShareText,
  buildTeamShareDescription,
  buildPostShareTitle,
  buildPostShareText,
  buildPostShareDescription,
} from '@nxt1/core/seo';
import { NxtToastService, NxtLoggingService, ANALYTICS_ADAPTER } from '@nxt1/ui/services';

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
      unicode: profile.unicode ?? profile.id,
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
      teamCode: team.teamCode,
      title: team.teamName,
      description: buildTeamShareDescription(team),
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

  async shareArticle(
    article: Omit<ShareableArticle, 'type' | 'description'> & { id: string },
    options?: ShareContentOptions
  ): Promise<ShareResultData> {
    const shareableArticle: ShareableArticle = {
      type: 'article',
      id: article.id,
      slug: article.slug,
      title: article.title,
      description: buildArticleShareDescription(article),
      source: article.source,
      excerpt: article.excerpt,
      sport: article.sport,
      state: article.state,
      imageUrl: article.imageUrl,
    };

    const shareText = options?.text || buildArticleShareText(article);
    const shareTitle = options?.title || buildArticleShareTitle(article);

    return this.shareContent(shareableArticle, {
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
      title: buildPostShareTitle(post),
      description: buildPostShareDescription(post),
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
      this.toast.success('Share link copied.');
      this.logger.info('Share fallback: copy link');
      return { completed: true, method: 'copy_link' };
    } catch (error) {
      this.toast.error("Couldn't copy the share link.");
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
