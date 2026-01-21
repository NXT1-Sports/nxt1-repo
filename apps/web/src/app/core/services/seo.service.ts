/**
 * @fileoverview SEO Service - Dynamic Meta Tag Management
 * @module @nxt1/web/core/services
 *
 * Production-grade SEO service for dynamic meta tag updates.
 * SSR-safe - works on both server and client.
 *
 * Features:
 * - Dynamic page titles and descriptions
 * - Open Graph meta tags for social sharing
 * - Twitter Card meta tags
 * - JSON-LD structured data injection
 * - Canonical URL management
 * - SSR-compatible (updates during server render)
 *
 * @example
 * ```typescript
 * // In a profile component
 * export class ProfileComponent implements OnInit {
 *   private readonly seo = inject(SeoService);
 *   private readonly route = inject(ActivatedRoute);
 *
 *   ngOnInit() {
 *     this.seo.updateForProfile({
 *       athleteName: 'John Smith',
 *       position: 'Quarterback',
 *       classYear: 2027,
 *       school: 'Lincoln High School',
 *       imageUrl: 'https://...',
 *     });
 *   }
 * }
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import {
  type SeoConfig,
  type PageMetadata,
  type ShareableProfile,
  type ShareableTeam,
  type ShareableVideo,
  buildProfileSeoConfig,
  buildTeamSeoConfig,
  buildVideoSeoConfig,
  truncateDescription,
  sanitizeMetaText,
} from '@nxt1/core/seo';

// ============================================
// CONSTANTS
// ============================================

/** Default site name */
const SITE_NAME = 'NXT1 Sports';

/** Default site description */
const DEFAULT_DESCRIPTION =
  'The ultimate sports content platform. Discover amazing athletic highlights, training videos, and sports content from athletes worldwide.';

/** Default OG image */
const DEFAULT_OG_IMAGE = 'https://nxt1sports.com/assets/images/og-image.jpg';

/** Base URL for canonical links */
const BASE_URL = 'https://nxt1sports.com';

/** Twitter site handle */
const TWITTER_SITE = '@nxt1sports';

// ============================================
// SERVICE
// ============================================

/**
 * SEO Service for managing dynamic meta tags
 *
 * SSR-safe service that updates meta tags for:
 * - Search engine optimization
 * - Social media sharing previews
 * - Structured data (JSON-LD)
 *
 * Works on both server (for SSR) and client (for SPA navigation).
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);

  /** Track if we're in browser for DOM operations */
  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  // ============================================
  // HIGH-LEVEL API (Use these in components)
  // ============================================

  /**
   * Update meta tags for an athlete profile page
   *
   * @param profile - Profile data for SEO
   *
   * @example
   * ```typescript
   * this.seo.updateForProfile({
   *   id: 'john-smith',
   *   athleteName: 'John Smith',
   *   position: 'QB',
   *   classYear: 2027,
   *   school: 'Lincoln High',
   *   sport: 'Football',
   *   location: 'Austin, TX',
   *   imageUrl: 'https://storage.googleapis.com/...',
   * });
   * ```
   */
  updateForProfile(
    profile: Omit<ShareableProfile, 'type' | 'title' | 'description'> & { id: string }
  ): void {
    const shareableProfile: ShareableProfile = {
      type: 'profile',
      id: profile.id,
      slug: profile.slug,
      title: profile.athleteName,
      description: '', // Will be generated
      athleteName: profile.athleteName,
      position: profile.position,
      classYear: profile.classYear,
      school: profile.school,
      sport: profile.sport,
      location: profile.location,
      imageUrl: profile.imageUrl,
    };

    const config = buildProfileSeoConfig(shareableProfile);
    this.applySeoConfig(config);
  }

  /**
   * Update meta tags for a team page
   *
   * @param team - Team data for SEO
   *
   * @example
   * ```typescript
   * this.seo.updateForTeam({
   *   id: 'lincoln-high-football',
   *   teamName: 'Lincoln High Football',
   *   sport: 'Football',
   *   location: 'Austin, TX',
   *   logoUrl: 'https://storage.googleapis.com/...',
   *   record: '10-2',
   * });
   * ```
   */
  updateForTeam(
    team: Omit<ShareableTeam, 'type' | 'title' | 'description'> & { id: string }
  ): void {
    const shareableTeam: ShareableTeam = {
      type: 'team',
      id: team.id,
      slug: team.slug,
      title: team.teamName,
      description: '', // Will be generated
      teamName: team.teamName,
      sport: team.sport,
      location: team.location,
      logoUrl: team.logoUrl,
      imageUrl: team.imageUrl,
      record: team.record,
    };

    const config = buildTeamSeoConfig(shareableTeam);
    this.applySeoConfig(config);
  }

  /**
   * Update meta tags for a video page
   *
   * @param video - Video data for SEO
   *
   * @example
   * ```typescript
   * this.seo.updateForVideo({
   *   id: 'abc123',
   *   videoTitle: '40-yard TD Run',
   *   athleteName: 'John Smith',
   *   thumbnailUrl: 'https://storage.googleapis.com/...',
   *   duration: 45,
   *   views: 1234,
   * });
   * ```
   */
  updateForVideo(
    video: Omit<ShareableVideo, 'type' | 'title' | 'description'> & { id: string }
  ): void {
    const shareableVideo: ShareableVideo = {
      type: 'video',
      id: video.id,
      slug: video.slug,
      title: video.videoTitle,
      description: '', // Will be generated
      videoTitle: video.videoTitle,
      athleteName: video.athleteName,
      thumbnailUrl: video.thumbnailUrl,
      imageUrl: video.imageUrl,
      duration: video.duration,
      views: video.views,
    };

    const config = buildVideoSeoConfig(shareableVideo);
    this.applySeoConfig(config);
  }

  /**
   * Update meta tags for a generic page
   *
   * @param config - Page metadata configuration
   *
   * @example
   * ```typescript
   * this.seo.updatePage({
   *   title: 'Explore Athletes',
   *   description: 'Discover top athletic talent from across the country.',
   *   keywords: ['recruiting', 'athletes', 'sports'],
   * });
   * ```
   */
  updatePage(config: PageMetadata): void {
    this.applySeoConfig({
      page: config,
    });
  }

  /**
   * Reset meta tags to default homepage values
   * Call this on navigation to pages without specific SEO needs
   */
  resetToDefaults(): void {
    this.applySeoConfig({
      page: {
        title: `${SITE_NAME} - The Sports Content Platform`,
        description: DEFAULT_DESCRIPTION,
        canonicalUrl: BASE_URL,
        image: DEFAULT_OG_IMAGE,
      },
    });
  }

  // ============================================
  // LOW-LEVEL API
  // ============================================

  /**
   * Apply a full SEO configuration
   * Use the high-level methods instead when possible
   *
   * @param config - Complete SEO configuration
   */
  applySeoConfig(config: SeoConfig): void {
    const { page, openGraph, twitter, structuredData } = config;

    // Set page title
    const fullTitle = page.title.includes(SITE_NAME) ? page.title : `${page.title} | ${SITE_NAME}`;
    this.title.setTitle(fullTitle);

    // Core meta tags
    this.updateMetaTag('description', truncateDescription(sanitizeMetaText(page.description)));

    if (page.keywords?.length) {
      this.updateMetaTag('keywords', page.keywords.join(', '));
    }

    // Robots
    const robotsContent = this.buildRobotsContent(page.noIndex, page.noFollow);
    this.updateMetaTag('robots', robotsContent);

    // Canonical URL
    const canonicalUrl = page.canonicalUrl || this.getCurrentUrl();
    this.updateLinkTag('canonical', canonicalUrl);

    // Open Graph tags
    this.updateOpenGraphTags(page, openGraph);

    // Twitter tags
    this.updateTwitterTags(page, openGraph, twitter);

    // Structured data (JSON-LD)
    if (structuredData) {
      this.updateStructuredData(structuredData);
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Update a meta tag by name
   */
  private updateMetaTag(name: string, content: string): void {
    this.meta.updateTag({ name, content });
  }

  /**
   * Update a meta tag by property (for Open Graph)
   */
  private updatePropertyTag(property: string, content: string): void {
    this.meta.updateTag({ property, content });
  }

  /**
   * Update Open Graph meta tags
   */
  private updateOpenGraphTags(page: PageMetadata, og?: Partial<SeoConfig['openGraph']>): void {
    this.updatePropertyTag('og:type', og?.type || 'website');
    this.updatePropertyTag('og:site_name', og?.siteName || SITE_NAME);
    this.updatePropertyTag('og:title', og?.title || page.title);
    this.updatePropertyTag(
      'og:description',
      truncateDescription(sanitizeMetaText(og?.description || page.description))
    );
    this.updatePropertyTag('og:url', og?.url || page.canonicalUrl || this.getCurrentUrl());
    this.updatePropertyTag('og:image', og?.image || page.image || DEFAULT_OG_IMAGE);
    this.updatePropertyTag('og:locale', og?.locale || 'en_US');

    if (og?.imageWidth) {
      this.updatePropertyTag('og:image:width', String(og.imageWidth));
    }
    if (og?.imageHeight) {
      this.updatePropertyTag('og:image:height', String(og.imageHeight));
    }
    if (og?.video) {
      this.updatePropertyTag('og:video', og.video);
    }
  }

  /**
   * Update Twitter Card meta tags
   */
  private updateTwitterTags(
    page: PageMetadata,
    og?: Partial<SeoConfig['openGraph']>,
    twitter?: Partial<SeoConfig['twitter']>
  ): void {
    this.meta.updateTag({ name: 'twitter:card', content: twitter?.card || 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:site', content: twitter?.site || TWITTER_SITE });

    if (twitter?.creator) {
      this.meta.updateTag({ name: 'twitter:creator', content: twitter.creator });
    }

    // Twitter falls back to OG then page
    this.meta.updateTag({
      name: 'twitter:title',
      content: twitter?.title || og?.title || page.title,
    });
    this.meta.updateTag({
      name: 'twitter:description',
      content: truncateDescription(
        sanitizeMetaText(twitter?.description || og?.description || page.description)
      ),
    });
    this.meta.updateTag({
      name: 'twitter:image',
      content: twitter?.image || og?.image || page.image || DEFAULT_OG_IMAGE,
    });

    if (twitter?.imageAlt || page.imageAlt) {
      this.meta.updateTag({
        name: 'twitter:image:alt',
        content: twitter?.imageAlt || page.imageAlt || '',
      });
    }

    // Video player card
    if (twitter?.player) {
      this.meta.updateTag({ name: 'twitter:player', content: twitter.player });
      if (twitter.playerWidth) {
        this.meta.updateTag({ name: 'twitter:player:width', content: String(twitter.playerWidth) });
      }
      if (twitter.playerHeight) {
        this.meta.updateTag({
          name: 'twitter:player:height',
          content: String(twitter.playerHeight),
        });
      }
    }
  }

  /**
   * Update or create a link tag (for canonical URL)
   */
  private updateLinkTag(rel: string, href: string): void {
    // Only manipulate DOM in browser
    if (!this.isBrowser) {
      // For SSR, we need to use a different approach
      // Angular's Meta service doesn't handle link tags
      // This will be handled by the initial HTML
      return;
    }

    let link: HTMLLinkElement | null = this.document.querySelector(`link[rel="${rel}"]`);

    if (link) {
      link.href = href;
    } else {
      link = this.document.createElement('link');
      link.rel = rel;
      link.href = href;
      this.document.head.appendChild(link);
    }
  }

  /**
   * Update JSON-LD structured data
   */
  private updateStructuredData(data: Record<string, unknown>): void {
    // Only manipulate DOM in browser for non-SSR updates
    if (!this.isBrowser) {
      // For SSR, structured data should be in the initial HTML
      // or handled by a transfer state mechanism
      return;
    }

    // Remove existing JSON-LD script
    const existingScript = this.document.querySelector('script[type="application/ld+json"]');
    if (existingScript) {
      existingScript.remove();
    }

    // Create new JSON-LD script
    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    this.document.head.appendChild(script);
  }

  /**
   * Build robots meta content
   */
  private buildRobotsContent(noIndex?: boolean, noFollow?: boolean): string {
    const directives: string[] = [];

    directives.push(noIndex ? 'noindex' : 'index');
    directives.push(noFollow ? 'nofollow' : 'follow');
    directives.push('max-image-preview:large');
    directives.push('max-snippet:-1');
    directives.push('max-video-preview:-1');

    return directives.join(', ');
  }

  /**
   * Get current full URL for canonical
   */
  private getCurrentUrl(): string {
    return `${BASE_URL}${this.router.url}`;
  }
}
