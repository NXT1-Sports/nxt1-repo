/**
 * @fileoverview SEO Module Unit Tests
 * @module @nxt1/core/seo
 *
 * Comprehensive tests for SEO types and builder functions.
 * Tests ensure proper metadata generation for all content types.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  buildShareUrl,
  buildProfileSeoConfig,
  buildTeamSeoConfig,
  buildVideoSeoConfig,
  truncateDescription,
  sanitizeMetaText,
  type ShareableProfile,
  type ShareableTeam,
  type ShareableVideo,
  type SeoConfig,
} from './index';

// ============================================
// TEST DATA
// ============================================

const mockProfile: ShareableProfile = {
  type: 'profile',
  id: 'john-smith-123',
  slug: 'john-smith',
  title: 'John Smith',
  description: '',
  athleteName: 'John Smith',
  position: 'Quarterback',
  classYear: 2027,
  school: 'Lincoln High School',
  sport: 'Football',
  location: 'Austin, TX',
  imageUrl: 'https://storage.googleapis.com/nxt1/profiles/john-smith.jpg',
};

const mockTeam: ShareableTeam = {
  type: 'team',
  id: 'lincoln-high-123',
  slug: 'lincoln-high-football',
  title: 'Lincoln High Football',
  description: '',
  teamName: 'Lincoln High Football',
  sport: 'Football',
  location: 'Austin, TX',
  logoUrl: 'https://storage.googleapis.com/nxt1/teams/lincoln-high-logo.png',
  record: '10-2',
};

const mockVideo: ShareableVideo = {
  type: 'video',
  id: 'highlight-abc123',
  slug: 'td-run-john-smith',
  title: '40-Yard TD Run',
  description: '',
  videoTitle: '40-Yard TD Run',
  athleteName: 'John Smith',
  duration: 45,
  thumbnailUrl: 'https://storage.googleapis.com/nxt1/videos/td-run-thumb.jpg',
  views: 12500,
};

// ============================================
// BUILD SHARE URL TESTS
// ============================================

describe('buildShareUrl', () => {
  it('should build profile URL with slug', () => {
    const url = buildShareUrl(mockProfile);
    expect(url).toBe('https://nxt1sports.com/profile/john-smith');
  });

  it('should build profile URL with id when no slug', () => {
    const profileNoSlug = { ...mockProfile, slug: undefined };
    const url = buildShareUrl(profileNoSlug);
    expect(url).toBe('https://nxt1sports.com/profile/john-smith-123');
  });

  it('should build team URL with slug', () => {
    const url = buildShareUrl(mockTeam);
    expect(url).toBe('https://nxt1sports.com/team/lincoln-high-football');
  });

  it('should build video URL with slug', () => {
    const url = buildShareUrl(mockVideo);
    expect(url).toBe('https://nxt1sports.com/video/td-run-john-smith');
  });

  it('should build highlight URL same as video', () => {
    const highlight = { ...mockVideo, type: 'highlight' as const };
    const url = buildShareUrl(highlight);
    expect(url).toBe('https://nxt1sports.com/video/td-run-john-smith');
  });
});

// ============================================
// PROFILE SEO CONFIG TESTS
// ============================================

describe('buildProfileSeoConfig', () => {
  let config: SeoConfig;

  beforeAll(() => {
    config = buildProfileSeoConfig(mockProfile);
  });

  describe('page metadata', () => {
    it('should generate title with name, position, and class year', () => {
      expect(config.page.title).toContain('John Smith');
      expect(config.page.title).toContain('Quarterback');
      expect(config.page.title).toContain('Class of 2027');
      expect(config.page.title).toContain('NXT1 Sports');
    });

    it('should generate description with athlete details', () => {
      expect(config.page.description).toContain('John Smith');
      expect(config.page.description).toContain('Quarterback');
      expect(config.page.description).toContain('Football');
      expect(config.page.description).toContain('Lincoln High School');
    });

    it('should set canonical URL correctly', () => {
      expect(config.page.canonicalUrl).toBe('https://nxt1sports.com/profile/john-smith');
    });

    it('should set image URL from profile', () => {
      expect(config.page.image).toBe(mockProfile.imageUrl);
    });

    it('should generate relevant keywords', () => {
      expect(config.page.keywords).toContain('John Smith');
      expect(config.page.keywords).toContain('Football');
      expect(config.page.keywords).toContain('Quarterback');
      expect(config.page.keywords).toContain('recruiting');
    });
  });

  describe('Open Graph metadata', () => {
    it('should set type to profile', () => {
      expect(config.openGraph?.type).toBe('profile');
    });

    it('should set title to athlete name', () => {
      expect(config.openGraph?.title).toBe('John Smith');
    });

    it('should set image dimensions', () => {
      expect(config.openGraph?.imageWidth).toBe(1200);
      expect(config.openGraph?.imageHeight).toBe(630);
    });

    it('should set site name', () => {
      expect(config.openGraph?.siteName).toBe('NXT1 Sports');
    });

    it('should set locale', () => {
      expect(config.openGraph?.locale).toBe('en_US');
    });
  });

  describe('Twitter metadata', () => {
    it('should set card type to summary_large_image', () => {
      expect(config.twitter?.card).toBe('summary_large_image');
    });

    it('should set site handle', () => {
      expect(config.twitter?.site).toBe('@nxt1sports');
    });

    it('should set image alt text', () => {
      expect(config.twitter?.imageAlt).toContain('John Smith');
      expect(config.twitter?.imageAlt).toContain('profile');
    });
  });

  describe('structured data (JSON-LD)', () => {
    it('should set @context to schema.org', () => {
      expect(config.structuredData?.['@context']).toBe('https://schema.org');
    });

    it('should set @type to Person', () => {
      expect(config.structuredData?.['@type']).toBe('Person');
    });

    it('should include name', () => {
      expect(config.structuredData?.['name']).toBe('John Smith');
    });

    it('should include job title (position)', () => {
      expect(config.structuredData?.['jobTitle']).toBe('Quarterback');
    });

    it('should include affiliation (school) as SportsTeam', () => {
      const affiliation = config.structuredData?.['affiliation'] as Record<string, unknown>;
      expect(affiliation?.['@type']).toBe('SportsTeam');
      expect(affiliation?.['name']).toBe('Lincoln High School');
    });
  });

  describe('edge cases', () => {
    it('should handle profile without position', () => {
      const noPosition = { ...mockProfile, position: undefined };
      const result = buildProfileSeoConfig(noPosition);
      expect(result.page.title).toContain('John Smith');
      expect(result.page.title).not.toContain('undefined');
    });

    it('should handle profile without class year', () => {
      const noYear = { ...mockProfile, classYear: undefined };
      const result = buildProfileSeoConfig(noYear);
      expect(result.page.title).not.toContain('Class of');
    });

    it('should use default image when none provided', () => {
      const noImage = { ...mockProfile, imageUrl: undefined };
      const result = buildProfileSeoConfig(noImage);
      expect(result.page.image).toContain('og-image.jpg');
    });
  });
});

// ============================================
// TEAM SEO CONFIG TESTS
// ============================================

describe('buildTeamSeoConfig', () => {
  let config: SeoConfig;

  beforeAll(() => {
    config = buildTeamSeoConfig(mockTeam);
  });

  it('should generate title with team name and sport', () => {
    expect(config.page.title).toContain('Lincoln High Football');
    expect(config.page.title).toContain('NXT1 Sports');
  });

  it('should generate description with team info', () => {
    expect(config.page.description).toContain('Lincoln High Football');
    expect(config.page.description).toContain('Austin, TX');
  });

  it('should set canonical URL correctly', () => {
    expect(config.page.canonicalUrl).toBe('https://nxt1sports.com/team/lincoln-high-football');
  });

  it('should prefer logo URL for image', () => {
    expect(config.page.image).toBe(mockTeam.logoUrl);
  });

  it('should set Open Graph type to website', () => {
    expect(config.openGraph?.type).toBe('website');
  });

  it('should generate structured data as SportsTeam', () => {
    expect(config.structuredData?.['@type']).toBe('SportsTeam');
    expect(config.structuredData?.['name']).toBe('Lincoln High Football');
    expect(config.structuredData?.['sport']).toBe('Football');
  });
});

// ============================================
// VIDEO SEO CONFIG TESTS
// ============================================

describe('buildVideoSeoConfig', () => {
  let config: SeoConfig;

  beforeAll(() => {
    config = buildVideoSeoConfig(mockVideo);
  });

  it('should generate title with video and athlete name', () => {
    expect(config.page.title).toContain('40-Yard TD Run');
    expect(config.page.title).toContain('John Smith');
    expect(config.page.title).toContain('NXT1 Sports');
  });

  it('should set canonical URL correctly', () => {
    expect(config.page.canonicalUrl).toBe('https://nxt1sports.com/video/td-run-john-smith');
  });

  it('should use thumbnail URL for image', () => {
    expect(config.page.image).toBe(mockVideo.thumbnailUrl);
  });

  it('should set Open Graph type to video.other', () => {
    expect(config.openGraph?.type).toBe('video.other');
  });

  it('should set Twitter card to player', () => {
    expect(config.twitter?.card).toBe('player');
    expect(config.twitter?.player).toBe('https://nxt1sports.com/video/td-run-john-smith');
    expect(config.twitter?.playerWidth).toBe(1280);
    expect(config.twitter?.playerHeight).toBe(720);
  });

  describe('structured data (VideoObject)', () => {
    it('should set @type to VideoObject', () => {
      expect(config.structuredData?.['@type']).toBe('VideoObject');
    });

    it('should include video name', () => {
      expect(config.structuredData?.['name']).toBe('40-Yard TD Run');
    });

    it('should include thumbnail URL', () => {
      expect(config.structuredData?.['thumbnailUrl']).toBe(mockVideo.thumbnailUrl);
    });

    it('should include duration in ISO 8601 format', () => {
      // 45 seconds = PT0M45S
      expect(config.structuredData?.['duration']).toBe('PT0M45S');
    });

    it('should include view count as interaction statistic', () => {
      const stats = config.structuredData?.['interactionStatistic'] as Record<string, unknown>;
      expect(stats?.['@type']).toBe('InteractionCounter');
      expect(stats?.['userInteractionCount']).toBe(12500);
    });

    it('should include author', () => {
      const author = config.structuredData?.['author'] as Record<string, unknown>;
      expect(author?.['@type']).toBe('Person');
      expect(author?.['name']).toBe('John Smith');
    });
  });
});

// ============================================
// UTILITY FUNCTION TESTS
// ============================================

describe('truncateDescription', () => {
  it('should not truncate short text', () => {
    const short = 'This is a short description.';
    expect(truncateDescription(short)).toBe(short);
  });

  it('should truncate long text to 160 characters by default', () => {
    const long = 'A'.repeat(200);
    const result = truncateDescription(long);
    expect(result.length).toBe(160);
    expect(result.endsWith('...')).toBe(true);
  });

  it('should respect custom max length', () => {
    const text = 'A'.repeat(100);
    const result = truncateDescription(text, 50);
    expect(result.length).toBe(50);
  });

  it('should trim trailing whitespace before ellipsis', () => {
    const text = 'This is a test with spaces   ' + 'A'.repeat(200);
    const result = truncateDescription(text, 30);
    expect(result).not.toMatch(/\s+\.\.\.$/);
  });
});

describe('sanitizeMetaText', () => {
  it('should remove HTML tags', () => {
    const html = '<p>Hello <strong>World</strong></p>';
    expect(sanitizeMetaText(html)).toBe('Hello World');
  });

  it('should collapse multiple spaces', () => {
    const text = 'Hello    World   Test';
    expect(sanitizeMetaText(text)).toBe('Hello World Test');
  });

  it('should remove quotes', () => {
    const text = 'He said "Hello World"';
    expect(sanitizeMetaText(text)).toBe('He said Hello World');
  });

  it('should remove newlines', () => {
    const text = 'Line 1\nLine 2\rLine 3';
    expect(sanitizeMetaText(text)).toBe('Line 1 Line 2 Line 3');
  });

  it('should trim whitespace', () => {
    const text = '  Hello World  ';
    expect(sanitizeMetaText(text)).toBe('Hello World');
  });

  it('should handle combined sanitization', () => {
    const messy = '  <p>Hello   "World"\n</p>  ';
    expect(sanitizeMetaText(messy)).toBe('Hello World');
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe('SEO Config Integration', () => {
  it('should produce valid configs for all content types', () => {
    const profileConfig = buildProfileSeoConfig(mockProfile);
    const teamConfig = buildTeamSeoConfig(mockTeam);
    const videoConfig = buildVideoSeoConfig(mockVideo);

    // All configs should have required page metadata
    [profileConfig, teamConfig, videoConfig].forEach((config) => {
      expect(config.page.title).toBeTruthy();
      expect(config.page.description).toBeTruthy();
      expect(config.page.canonicalUrl).toMatch(/^https:\/\/nxt1sports\.com/);
      expect(config.openGraph).toBeDefined();
      expect(config.twitter).toBeDefined();
      expect(config.structuredData).toBeDefined();
    });
  });

  it('should generate unique canonical URLs', () => {
    const profileUrl = buildProfileSeoConfig(mockProfile).page.canonicalUrl;
    const teamUrl = buildTeamSeoConfig(mockTeam).page.canonicalUrl;
    const videoUrl = buildVideoSeoConfig(mockVideo).page.canonicalUrl;

    const urls = new Set([profileUrl, teamUrl, videoUrl]);
    expect(urls.size).toBe(3);
  });

  it('should not have undefined values in page title', () => {
    const minimalProfile: ShareableProfile = {
      type: 'profile',
      id: 'test',
      title: 'Test',
      description: '',
      athleteName: 'Test User',
    };
    const config = buildProfileSeoConfig(minimalProfile);
    expect(config.page.title).not.toContain('undefined');
  });
});
