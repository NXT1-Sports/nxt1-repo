/**
 * @fileoverview Share Service - Native Social Sharing
 * @module @nxt1/mobile/core/services
 *
 * Production-grade native sharing service for Ionic/Capacitor.
 * Constructs proper shareable URLs that work with the web SSR server.
 *
 * Features:
 * - Native share sheet integration (iOS/Android)
 * - Clipboard fallback for unsupported platforms
 * - URL construction using @nxt1/core/seo types
 * - Analytics tracking for share events
 * - Error handling with user feedback
 *
 * @example
 * ```typescript
 * export class ProfileComponent {
 *   private readonly share = inject(ShareService);
 *
 *   async shareProfile(profile: UserProfile) {
 *     await this.share.shareProfile({
 *       id: profile.uid,
 *       athleteName: profile.displayName,
 *       position: profile.sportProfile?.position,
 *       school: profile.team?.name,
 *     });
 *   }
 * }
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { ToastController, Platform } from '@ionic/angular/standalone';
import { Share, ShareOptions, ShareResult } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
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
import { ANALYTICS_ADAPTER } from '@nxt1/ui';
import { environment } from '../../../environments/environment';

// ============================================
// TYPES
// ============================================

/**
 * Share result with analytics data
 */
export interface ShareResultData {
  /** Whether share was completed (not cancelled) */
  completed: boolean;

  /** Platform where shared (if available) */
  activityType?: string;

  /** Error message if failed */
  error?: string;
}

/**
 * Share options for all content types
 */
export interface ShareContentOptions {
  /** Custom share title (overrides generated) */
  title?: string;

  /** Custom share text (overrides generated) */
  text?: string;

  /** Additional files to share (images, etc.) */
  files?: string[];

  /** Track analytics event */
  trackAnalytics?: boolean;

  /** Additional analytics properties */
  analyticsProps?: Record<string, unknown>;
}

// ============================================
// SERVICE
// ============================================

/**
 * Share Service for native social sharing
 *
 * Handles sharing content from the mobile app via native share sheets.
 * URLs point to the web app where SSR provides proper meta tags for previews.
 */
@Injectable({ providedIn: 'root' })
export class ShareService {
  private readonly toastController = inject(ToastController);
  private readonly platform = inject(Platform);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  /** Whether sharing is currently in progress */
  private readonly _isSharing = signal(false);
  readonly isSharing = computed(() => this._isSharing());

  /** Whether native sharing is available */
  readonly canShare = computed(() => {
    // Web Share API or native Capacitor share
    return this.platform.is('capacitor') || 'share' in navigator;
  });

  // ============================================
  // HIGH-LEVEL SHARING METHODS
  // ============================================

  /**
   * Share an athlete profile
   *
   * @param profile - Profile data to share
   * @param options - Optional share configuration
   * @returns Share result
   *
   * @example
   * ```typescript
   * await this.share.shareProfile({
   *   id: 'john-smith-123',
   *   athleteName: 'John Smith',
   *   position: 'Quarterback',
   *   classYear: 2027,
   *   school: 'Lincoln High School',
   * });
   * ```
   */
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

  /**
   * Share a team page
   *
   * @param team - Team data to share
   * @param options - Optional share configuration
   * @returns Share result
   */
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

  /**
   * Share a video/highlight
   *
   * @param video - Video data to share
   * @param options - Optional share configuration
   * @returns Share result
   */
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

  /**
   * Share a post
   *
   * @param post - Post data to share
   * @param options - Optional share configuration
   * @returns Share result
   */
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

  /**
   * Share app download link
   *
   * @returns Share result
   */
  async shareApp(): Promise<ShareResultData> {
    const result = await this.shareCustom({
      title: 'NXT1 Sports',
      text: 'Check out NXT1 Sports - The ultimate platform for athletic recruiting and highlights!',
      url: 'https://nxt1sports.com',
    });

    this.trackShareEvent(
      {
        type: 'post',
        id: 'nxt1-app',
        title: 'NXT1 Sports',
        description: 'NXT1 Sports app',
      },
      result,
      { trackAnalytics: true }
    );

    return result;
  }

  // ============================================
  // LOW-LEVEL SHARING
  // ============================================

  /**
   * Build environment-aware URL for shareable content.
   * Uses environment.webUrl (localhost for dev/staging, production domain for prod).
   *
   * @param content - Shareable content
   * @returns Full URL string
   */
  private buildEnvironmentUrl(content: ShareableContent): string {
    const identifier = content.slug || content.id;
    const baseUrl = environment.webUrl;

    switch (content.type) {
      case 'profile':
        return `${baseUrl}/profile/${identifier}`;
      case 'team':
        return `${baseUrl}/team/${identifier}`;
      case 'video':
      case 'highlight':
        return `${baseUrl}/video/${identifier}`;
      case 'post':
        return `${baseUrl}/post/${identifier}`;
      default:
        return `${baseUrl}/${content.type}/${identifier}`;
    }
  }

  /**
   * Share any shareable content
   *
   * @param content - Shareable content
   * @param options - Share options
   * @returns Share result
   */
  async shareContent(
    content: ShareableContent,
    options?: ShareContentOptions
  ): Promise<ShareResultData> {
    const url = this.buildEnvironmentUrl(content);

    const result = await this.shareCustom({
      title: options?.title || content.title,
      text: options?.text || content.description,
      url,
      files: options?.files,
    });

    this.trackShareEvent(content, result, options);

    return result;
  }

  /**
   * Share with custom parameters (lowest level)
   *
   * @param shareOptions - Native share options
   * @returns Share result
   */
  async shareCustom(shareOptions: ShareOptions): Promise<ShareResultData> {
    if (this._isSharing()) {
      return { completed: false, error: 'Share already in progress' };
    }

    this._isSharing.set(true);

    try {
      // Check if sharing is available
      const canShareResult = await Share.canShare();

      if (!canShareResult.value) {
        // Fall back to clipboard
        return this.copyToClipboard(shareOptions.url || shareOptions.text || '');
      }

      // Trigger haptic feedback
      await this.triggerHaptic();

      // Execute native share
      const result: ShareResult = await Share.share({
        title: shareOptions.title,
        text: shareOptions.text,
        url: shareOptions.url,
        dialogTitle: shareOptions.dialogTitle || 'Share via',
        files: shareOptions.files,
      });

      // Success feedback
      if (result.activityType) {
        await this.showToast('Shared successfully!', 'success');
      }

      return {
        completed: !!result.activityType,
        activityType: result.activityType,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to share';

      // User cancelled - not an error
      if (errorMessage.includes('cancel') || errorMessage.includes('Cancel')) {
        return { completed: false };
      }

      // Actual error - try clipboard fallback
      console.error('[ShareService] Share failed:', error);
      return this.copyToClipboard(shareOptions.url || shareOptions.text || '');
    } finally {
      this._isSharing.set(false);
    }
  }

  /**
   * Copy link to clipboard (fallback for when native share unavailable)
   *
   * @param text - Text to copy
   * @returns Share result
   */
  async copyToClipboard(text: string): Promise<ShareResultData> {
    try {
      // Use Web Clipboard API (works in Capacitor WebView)
      await navigator.clipboard.writeText(text);
      await this.triggerHaptic();
      await this.showToast('Link copied to clipboard!', 'success');

      return { completed: true, activityType: 'clipboard' };
    } catch (error) {
      console.error('[ShareService] Clipboard write failed:', error);
      await this.showToast('Failed to copy link', 'danger');

      return {
        completed: false,
        error: error instanceof Error ? error.message : 'Clipboard failed',
      };
    }
  }

  /**
   * Copy any text to clipboard (public API)
   *
   * @param text - Text to copy
   * @param showFeedback - Whether to show toast feedback
   */
  async copy(text: string, showFeedback: boolean = true): Promise<boolean> {
    try {
      // Use Web Clipboard API (works in Capacitor WebView)
      await navigator.clipboard.writeText(text);
      await this.triggerHaptic();

      if (showFeedback) {
        await this.showToast('Copied!', 'success');
      }

      return true;
    } catch (error) {
      console.error('[ShareService] Copy failed:', error);

      if (showFeedback) {
        await this.showToast('Failed to copy', 'danger');
      }

      return false;
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Trigger haptic feedback
   */
  private async triggerHaptic(): Promise<void> {
    try {
      if (this.platform.is('capacitor')) {
        await Haptics.impact({ style: ImpactStyle.Light });
      }
    } catch {
      // Haptics not available - ignore
    }
  }

  /**
   * Show toast message
   */
  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'warning' = 'success'
  ): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom',
      color,
      cssClass: 'share-toast',
    });

    await toast.present();
  }

  private trackShareEvent(
    content: ShareableContent,
    result: ShareResultData,
    options?: ShareContentOptions
  ): void {
    const analytics: AnalyticsAdapter | null = this.analytics ?? null;
    if (!analytics || options?.trackAnalytics === false || !result.completed) return;

    const payload: ShareEventParams & Record<string, unknown> = {
      method: this.resolveShareMethod(result.activityType),
      content_type: content.type,
      item_id: content.id,
      ...options?.analyticsProps,
    };

    analytics.trackEvent(FIREBASE_EVENTS.SHARE, payload);
  }

  private resolveShareMethod(activityType?: string): string {
    if (!activityType) return 'native_share';
    if (activityType === 'clipboard') return 'copy_link';
    return activityType;
  }
}
