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
  buildPostSeoConfig,
  buildInviteShareTitle,
  buildInviteShareText,
  buildInviteUiCopy,
  buildProfileShareTitle,
  buildProfileShareText,
  buildProfileShareDescription,
  buildTeamShareTitle,
  buildTeamShareText,
  buildTeamShareDescription,
  buildPostShareTitle,
  buildPostShareText,
  buildPostShareDescription,
  buildArticleShareTitle,
  buildArticleShareText,
  buildArticleShareDescription,
  truncateDescription,
  sanitizeMetaText,
  appendUTMParams,
  buildUTMShareUrl,
  UTM_MEDIUM,
  UTM_CAMPAIGN,
  type ShareableArticle,
  type ShareableProfile,
  type ShareableTeam,
  type ShareableVideo,
  type ShareablePost,
  type SeoConfig,
} from './index';
import { USER_ROLES } from '../constants/user.constants';

// ============================================
// TEST DATA
// ============================================

const mockProfile: ShareableProfile = {
  type: 'profile',
  id: 'profile-doc-123',
  unicode: '123456',
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
  id: 'team-doc-123',
  teamCode: 'FBN123',
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

const mockArticle: ShareableArticle = {
  type: 'article',
  id: 'pulse-article-123',
  slug: 'texas-football-recruiting-rises',
  title: 'Texas recruiting momentum rises heading into spring',
  description: 'Part of NXT1 Pulse, the live sports intelligence feed on NXT1.',
  source: 'ESPN',
  excerpt: 'Recruiting activity continues to accelerate as spring evaluations open across Texas.',
  sport: 'football',
  state: 'Texas',
  imageUrl: 'https://storage.googleapis.com/nxt1/pulse/texas-recruiting.jpg',
};

const mockPost = {
  id: 'post-123',
  slug: 'big-win-friday-night',
  authorName: 'John Smith',
  authorAvatar: 'https://storage.googleapis.com/nxt1/profiles/john-smith.jpg',
  createdAt: '2026-04-10T12:00:00.000Z',
  likes: 42,
  imageUrl: 'https://storage.googleapis.com/nxt1/posts/post-123.jpg',
  postText: 'Big win tonight. Proud of the work, proud of the team, and ready for what comes next.',
};

const mockSeoPost: ShareablePost = {
  type: 'post',
  id: 'post-123',
  slug: 'big-win-friday-night',
  userUnicode: 'john-smith-99',
  postType: 'game-update',
  title: 'Big win Friday night',
  description:
    'Big win tonight. Proud of the work, proud of the team, and ready for what comes next.',
  authorName: 'John Smith',
  authorAvatar: 'https://storage.googleapis.com/nxt1/profiles/john-smith.jpg',
  createdAt: '2026-04-10T12:00:00.000Z',
  likes: 42,
  imageUrl: 'https://storage.googleapis.com/nxt1/posts/post-123.jpg',
};

const mockInviteTeam = {
  id: 'team-doc-123',
  name: 'Lincoln High Football',
  sport: 'Football',
  memberCount: 48,
  teamCode: 'FBN123',
};

// ============================================
// BUILD SHARE URL TESTS
// ============================================

describe('buildShareUrl', () => {
  it('should build profile URL with slug', () => {
    const url = buildShareUrl(mockProfile);
    expect(url).toBe('https://nxt1sports.com/profile/football/john-smith/123456');
  });

  it('should build profile URL from athlete metadata even when no slug exists', () => {
    const profileNoSlug = { ...mockProfile, slug: undefined };
    const url = buildShareUrl(profileNoSlug);
    expect(url).toBe('https://nxt1sports.com/profile/football/john-smith/123456');
  });

  it('should build team URL with slug', () => {
    const url = buildShareUrl(mockTeam);
    expect(url).toBe('https://nxt1sports.com/team/lincoln-high-football/FBN123');
  });

  it('should support a custom base URL for local and staging share links', () => {
    const url = buildShareUrl(mockProfile, 'http://localhost:4200');
    expect(url).toBe('http://localhost:4200/profile/football/john-smith/123456');
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

  it('should build pulse article URL', () => {
    const url = buildShareUrl(mockArticle);
    expect(url).toBe('https://nxt1sports.com/explore/pulse/pulse-article-123');
  });
});

describe('share copy builders', () => {
  it('should generate upgraded profile share copy', () => {
    expect(buildProfileShareTitle(mockProfile)).toBe('John Smith Athlete Profile | NXT1');
    expect(buildProfileShareText(mockProfile)).toBe(
      'See my athletic profile & learn more about me on NXT1, the sports intelligence platform.\nJohn Smith • Quarterback • Lincoln High School • Austin, TX'
    );
    expect(buildProfileShareDescription(mockProfile)).toBe(
      'Quarterback | Football | Lincoln High School | Class of 2027. Athlete profile on NXT1. Film, stats, and real-time sports intelligence.'
    );
  });

  it('should generate upgraded team share copy', () => {
    expect(buildTeamShareTitle(mockTeam)).toBe('Lincoln High Football Team Hub | NXT1');
    expect(buildTeamShareText(mockTeam)).toBe(
      'Get to know our athletes & program.\nPowered by NXT1, the sports intelligence platform.\nLincoln High Football • Football • Austin, TX'
    );
    expect(buildTeamShareDescription(mockTeam)).toBe(
      'Football | Austin, TX | Record 10-2. NXT1 Team Hub with roster, schedule, highlights, and sports intelligence.'
    );
  });

  it('should generate upgraded post share copy', () => {
    expect(buildPostShareTitle(mockPost)).toBe('John Smith on NXT1');
    expect(buildPostShareText(mockPost)).toBe(
      'Check out my journey on NXT1, the sports intelligence platform.\nJohn Smith'
    );
    expect(buildPostShareDescription(mockPost)).toBe(
      'Latest update from John Smith on NXT1: Big win tonight. Proud of the work, proud of the team, and ready for what comes next.'
    );
  });

  it('should generate upgraded article share copy', () => {
    expect(buildArticleShareTitle(mockArticle)).toBe(
      'Texas recruiting momentum rises heading into spring | NXT1 Pulse'
    );
    expect(buildArticleShareText(mockArticle)).toBe(
      'Catch this story on NXT1, the sports intelligence platform.\nTexas recruiting momentum rises heading into spring • ESPN'
    );
    expect(buildArticleShareDescription(mockArticle)).toBe(
      'ESPN | Football | Texas. NXT1 Pulse briefing with sports intelligence and source context.'
    );
  });

  it('should generate general athlete invite share copy', () => {
    expect(
      buildInviteShareTitle({
        inviteType: 'general',
        senderRole: USER_ROLES.ATHLETE,
      })
    ).toBe("You're Invited to Join NXT1");
    expect(
      buildInviteShareText({
        inviteType: 'general',
        senderRole: USER_ROLES.ATHLETE,
        senderName: 'John Smith',
        senderPosition: 'QB',
        senderSchool: 'Lincoln High School',
        senderLocation: 'Austin, TX',
      })
    ).toBe(
      "You've been invited to join NXT1 — the sports intelligence platform built for athletes, coaches, and programs. Sign up free.\nJohn Smith • QB • Lincoln High School • Austin, TX"
    );
    expect(
      buildInviteUiCopy({
        inviteType: 'general',
        senderRole: USER_ROLES.ATHLETE,
        senderName: 'John Smith',
        senderPosition: 'QB',
        senderSchool: 'Lincoln High School',
        senderLocation: 'Austin, TX',
      })
    ).toEqual({
      title: 'Earn $5 in Agent X Credits',
      subtitle:
        'Invite teammates and friends to NXT1. Every time someone joins through your link, you earn $5 in Agent X credits.',
      shareText:
        "You've been invited to join NXT1 — the sports intelligence platform built for athletes, coaches, and programs. Sign up free.\nJohn Smith • QB • Lincoln High School • Austin, TX",
      howItWorksText:
        'Share your invite link or QR code. When someone joins through your invite, they land inside NXT1 and you earn $5 in Agent X credits automatically.',
    });
  });

  it('should generate team invite share copy from the centralized builder', () => {
    expect(
      buildInviteShareTitle({
        inviteType: 'team',
        senderRole: USER_ROLES.COACH,
        team: mockInviteTeam,
      })
    ).toBe("You're Invited to Join Lincoln High Football on NXT1");
    expect(
      buildInviteShareText({
        inviteType: 'team',
        senderRole: USER_ROLES.COACH,
        team: mockInviteTeam,
        senderLocation: 'Austin, TX',
      })
    ).toBe(
      "You've been invited to join Lincoln High Football on NXT1 — the sports intelligence platform built for athletes, coaches, and programs.\nLincoln High Football • Football • Austin, TX"
    );
    expect(
      buildInviteUiCopy({
        inviteType: 'team',
        senderRole: USER_ROLES.COACH,
        team: mockInviteTeam,
        senderLocation: 'Austin, TX',
      })
    ).toEqual({
      title: 'Invite Players & Staff to Your Team',
      subtitle:
        'Send this invite to connect your players and staff directly to your team on NXT1 — one place for communication, schedules, and sports intelligence.',
      shareText:
        "You've been invited to join Lincoln High Football on NXT1 — the sports intelligence platform built for athletes, coaches, and programs.\nLincoln High Football • Football • Austin, TX",
      howItWorksText:
        'Share this link or QR code with your players and staff. Once they accept, they are connected directly to Lincoln High Football on NXT1.',
    });
  });

  it('should generate coach invite share copy with sender identity', () => {
    expect(
      buildInviteShareText({
        inviteType: 'general',
        senderRole: USER_ROLES.COACH,
        senderName: 'Coach Smith',
        senderSchool: 'Lincoln High School',
        senderSport: 'Football',
        team: {
          name: 'Lincoln High Football',
          sport: 'Football',
        },
      })
    ).toBe(
      "You've been invited to join our program on NXT1 — the sports intelligence platform built for athletes, coaches, and programs.\nCoach Smith • Lincoln High School • Football"
    );
  });

  it('should generate athletic director invite share copy with sender identity', () => {
    expect(
      buildInviteShareText({
        inviteType: 'general',
        senderRole: USER_ROLES.DIRECTOR,
        senderName: 'Alex Director',
        senderSchool: 'Lincoln High School',
        team: {
          name: 'Lincoln High Football',
          sport: 'Football',
        },
      })
    ).toBe(
      "You've been invited to join our program on NXT1 — the sports intelligence platform built for athletes, coaches, and programs.\nAlex Director • Lincoln High School"
    );
  });

  it('should fallback to personal referral copy when coach only has school but no team', () => {
    expect(
      buildInviteShareTitle({
        inviteType: 'general',
        senderRole: USER_ROLES.COACH,
        senderSchool: 'Lincoln High School',
      })
    ).toBe("You're Invited to Join NXT1");

    expect(
      buildInviteShareText({
        inviteType: 'general',
        senderRole: USER_ROLES.COACH,
        senderName: 'Coach Smith',
        senderSchool: 'Lincoln High School',
      })
    ).toBe(
      "You've been invited to join NXT1 — the sports intelligence platform built for athletes, coaches, and programs. Sign up free.\nCoach Smith • Lincoln High School"
    );
  });

  it('should fallback coach invite copy to personal referral when no team context exists', () => {
    expect(
      buildInviteShareTitle({
        inviteType: 'general',
        senderRole: USER_ROLES.COACH,
      })
    ).toBe("You're Invited to Join NXT1");

    expect(
      buildInviteShareText({
        inviteType: 'general',
        senderRole: USER_ROLES.COACH,
        senderName: 'Coach Smith',
      })
    ).toBe(
      "You've been invited to join NXT1 — the sports intelligence platform built for athletes, coaches, and programs. Sign up free.\nCoach Smith"
    );

    expect(
      buildInviteUiCopy({
        inviteType: 'general',
        senderRole: USER_ROLES.COACH,
        senderName: 'Coach Smith',
      })
    ).toEqual({
      title: 'Earn $5 in Agent X Credits',
      subtitle:
        'Invite teammates and friends to NXT1. Every time someone joins through your link, you earn $5 in Agent X credits.',
      shareText:
        "You've been invited to join NXT1 — the sports intelligence platform built for athletes, coaches, and programs. Sign up free.\nCoach Smith",
      howItWorksText:
        'Share your invite link or QR code. When someone joins through your invite, they land inside NXT1 and you earn $5 in Agent X credits automatically.',
    });
  });

  it('should fallback director invite copy to personal referral when no team context exists', () => {
    expect(
      buildInviteShareTitle({
        inviteType: 'general',
        senderRole: USER_ROLES.DIRECTOR,
      })
    ).toBe("You're Invited to Join NXT1");

    expect(
      buildInviteShareText({
        inviteType: 'general',
        senderRole: USER_ROLES.DIRECTOR,
        senderName: 'Alex Director',
      })
    ).toBe(
      "You've been invited to join NXT1 — the sports intelligence platform built for athletes, coaches, and programs. Sign up free.\nAlex Director"
    );
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
      expect(config.page.canonicalUrl).toBe(
        'https://nxt1sports.com/profile/football/john-smith/123456'
      );
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
    expect(config.page.canonicalUrl).toBe(
      'https://nxt1sports.com/team/lincoln-high-football/FBN123'
    );
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
// POST SEO CONFIG TESTS
// ============================================

describe('buildPostSeoConfig', () => {
  let config: SeoConfig;

  beforeAll(() => {
    config = buildPostSeoConfig(mockSeoPost);
  });

  it('should generate canonical URL with user unicode and post id', () => {
    expect(config.page.canonicalUrl).toBe('https://nxt1sports.com/post/john-smith-99/post-123');
  });

  it('should set Open Graph type to article', () => {
    expect(config.openGraph?.type).toBe('article');
  });

  it('should set Twitter card to summary_large_image', () => {
    expect(config.twitter?.card).toBe('summary_large_image');
  });

  it('should include post keywords', () => {
    expect(config.page.keywords).toContain('John Smith');
    expect(config.page.keywords).toContain('game-update');
    expect(config.page.keywords).toContain('sports post');
  });

  describe('structured data (SocialMediaPosting)', () => {
    it('should set @type to SocialMediaPosting', () => {
      expect(config.structuredData?.['@type']).toBe('SocialMediaPosting');
    });

    it('should include publish date and author', () => {
      expect(config.structuredData?.['datePublished']).toBe('2026-04-10T12:00:00.000Z');
      const author = config.structuredData?.['author'] as Record<string, unknown>;
      expect(author?.['@type']).toBe('Person');
      expect(author?.['name']).toBe('John Smith');
    });
  });

  describe('edge cases', () => {
    it('should fallback to /post/:postId when user unicode is missing', () => {
      const noUnicode = { ...mockSeoPost, userUnicode: undefined };
      const result = buildPostSeoConfig(noUnicode);
      expect(result.page.canonicalUrl).toBe('https://nxt1sports.com/post/post-123');
    });

    it('should use default image when no post image/avatar exists', () => {
      const noImage = { ...mockSeoPost, imageUrl: undefined, authorAvatar: undefined };
      const result = buildPostSeoConfig(noImage);
      expect(result.page.image).toContain('og-image.jpg');
    });

    it('should respect custom base URL for canonical generation', () => {
      const result = buildPostSeoConfig(mockSeoPost, 'https://app.nxt1sports.com/');
      expect(result.page.canonicalUrl).toBe(
        'https://app.nxt1sports.com/post/john-smith-99/post-123'
      );
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
    const postConfig = buildPostSeoConfig(mockSeoPost);

    // All configs should have required page metadata
    [profileConfig, teamConfig, videoConfig, postConfig].forEach((config) => {
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
    const postUrl = buildPostSeoConfig(mockSeoPost).page.canonicalUrl;

    const urls = new Set([profileUrl, teamUrl, videoUrl, postUrl]);
    expect(urls.size).toBe(4);
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

// ============================================
// UTM TRACKING TESTS
// ============================================

describe('appendUTMParams', () => {
  it('should append all provided UTM params', () => {
    const result = appendUTMParams('https://nxt1sports.com/profile/football/john-doe/123456', {
      source: 'nxt1',
      medium: 'share',
      campaign: 'profile',
      content: 'football',
    });
    expect(result).toBe(
      'https://nxt1sports.com/profile/football/john-doe/123456?utm_source=nxt1&utm_medium=share&utm_campaign=profile&utm_content=football'
    );
  });

  it('should append only required params when optional ones are omitted', () => {
    const result = appendUTMParams('https://nxt1sports.com/team/lincoln-high/ABC123', {
      medium: 'qr',
      campaign: 'team',
    });
    expect(result).toContain('utm_medium=qr');
    expect(result).toContain('utm_campaign=team');
    expect(result).not.toContain('utm_source');
    expect(result).not.toContain('utm_content');
  });

  it('should NOT overwrite existing UTM params (first-write wins)', () => {
    const urlWithExistingUTM =
      'https://nxt1sports.com/profile/football/john-doe/123?utm_medium=email&utm_campaign=outreach';
    const result = appendUTMParams(urlWithExistingUTM, {
      source: 'nxt1',
      medium: 'share',
      campaign: 'profile',
    });
    // Existing medium=email must NOT be overwritten
    expect(result).toContain('utm_medium=email');
    expect(result).not.toContain('utm_medium=share');
    // New source is added since it did not exist
    expect(result).toContain('utm_source=nxt1');
  });

  it('should return the original string unchanged for empty input', () => {
    expect(appendUTMParams('', { medium: 'share', campaign: 'profile' })).toBe('');
  });

  it('should return the original string unchanged for relative paths', () => {
    const rel = '/profile/football/john-doe/123456';
    expect(appendUTMParams(rel, { medium: 'share', campaign: 'profile' })).toBe(rel);
  });
});

describe('buildUTMShareUrl', () => {
  it('should build a UTM-tagged profile share URL', () => {
    const base = 'https://nxt1sports.com/profile/football/john-smith/123456';
    const result = buildUTMShareUrl(base, UTM_MEDIUM.SHARE, UTM_CAMPAIGN.PROFILE, 'football');
    expect(result).toBe(
      'https://nxt1sports.com/profile/football/john-smith/123456?utm_source=nxt1&utm_medium=share&utm_campaign=profile&utm_content=football'
    );
  });

  it('should build a UTM-tagged team QR URL without content', () => {
    const base = 'https://nxt1sports.com/team/lincoln-high-football/ABC123';
    const result = buildUTMShareUrl(base, UTM_MEDIUM.QR, UTM_CAMPAIGN.TEAM);
    expect(result).toBe(
      'https://nxt1sports.com/team/lincoln-high-football/ABC123?utm_source=nxt1&utm_medium=qr&utm_campaign=team'
    );
  });

  it('should build a copy_link URL for article', () => {
    const base = 'https://nxt1sports.com/explore/pulse/article-123';
    const result = buildUTMShareUrl(base, UTM_MEDIUM.COPY_LINK, UTM_CAMPAIGN.ARTICLE);
    expect(result).toContain('utm_medium=copy_link');
    expect(result).toContain('utm_campaign=article');
    expect(result).toContain('utm_source=nxt1');
  });

  it('should work with localhost base for development', () => {
    const base = 'http://localhost:4200/profile/football/john-doe/123456';
    const result = buildUTMShareUrl(base, UTM_MEDIUM.SHARE, UTM_CAMPAIGN.PROFILE);
    expect(result).toContain('utm_source=nxt1');
    expect(result).toContain('utm_medium=share');
    expect(result).toContain('utm_campaign=profile');
    expect(result).toMatch(/^http:\/\/localhost:4200/);
  });

  it('SEO canonical URL should NOT contain UTM params', () => {
    // buildProfileSeoConfig always calls buildShareUrl without UTM — verify this isolation
    const config = buildProfileSeoConfig(mockProfile);
    expect(config.page.canonicalUrl).not.toContain('utm_');
    expect(config.openGraph?.url).not.toContain('utm_');
  });
});
