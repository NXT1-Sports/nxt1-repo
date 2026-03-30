import type {
  FeedAuthor,
  FeedItem,
  FeedItemAward,
  FeedItemCamp,
  FeedItemCommitment,
  FeedItemEvent,
  FeedItemMetric,
  FeedItemNews,
  FeedItemOffer,
  FeedItemPost,
  FeedItemStat,
  FeedItemVisit,
} from '@nxt1/core';

const now = Date.now();

const PRIMARY_AUTHOR: FeedAuthor = {
  uid: 'athlete-001',
  profileCode: 'marcus-thompson-26',
  displayName: 'Marcus Thompson',
  firstName: 'Marcus',
  lastName: 'Thompson',
  avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop',
  role: 'athlete',
  verificationStatus: 'verified',
  isVerified: true,
  sport: 'Football',
  position: 'QB',
  schoolName: 'Mater Dei High School',
  classYear: '2026',
};

const SECONDARY_AUTHOR: FeedAuthor = {
  uid: 'athlete-002',
  profileCode: 'jaylen-davis-27',
  displayName: 'Jaylen Davis',
  firstName: 'Jaylen',
  lastName: 'Davis',
  avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop',
  role: 'athlete',
  verificationStatus: 'verified',
  isVerified: true,
  sport: 'Basketball',
  position: 'PG',
  schoolName: 'Oak Hill Academy',
  classYear: '2027',
};

function buildBase(id: string, author: FeedAuthor, offsetMs: number) {
  const createdAt = new Date(now - offsetMs).toISOString();

  return {
    id,
    author,
    engagement: {
      likeCount: 128,
      commentCount: 14,
      shareCount: 9,
      viewCount: 3200,
      bookmarkCount: 21,
      reactionCount: 128,
      repostCount: 5,
    },
    userEngagement: {
      isLiked: false,
      isBookmarked: false,
      isReposted: false,
      isFollowingAuthor: true,
      isReacted: false,
      reactionType: null,
    },
    isPinned: false,
    isFeatured: false,
    createdAt,
    updatedAt: createdAt,
  } as const;
}

export const MOCK_POLYMORPHIC_FEED: readonly FeedItem[] = [
  {
    ...buildBase('feed-post-video-demo', PRIMARY_AUTHOR, 1000 * 60 * 45),
    feedType: 'POST',
    visibility: 'public',
    postType: 'video',
    title: 'Friday Night Tape',
    content:
      'Short cut-up from tonight. Pocket movement felt sharp and the deep ball timing is coming together.',
    media: [
      {
        id: 'video-1',
        type: 'video',
        url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
        thumbnailUrl:
          'https://images.unsplash.com/photo-1547347298-4074fc3086f0?w=960&h=540&fit=crop',
        width: 960,
        height: 540,
        duration: 27,
        altText: 'Quarterback rollout and throw during game action',
      },
    ],
    hashtags: ['#QB1', '#FridayNightLights'],
    commentsDisabled: false,
  } as FeedItemPost,
  {
    ...buildBase('feed-event-demo', PRIMARY_AUTHOR, 1000 * 60 * 90),
    feedType: 'EVENT',
    referenceId: 'event-demo-1',
    eventData: {
      eventTitle: 'CIF State Semifinal',
      opponent: 'St. John Bosco',
      opponentLogoUrl: 'https://ui-avatars.com/api/?name=SJB&background=1f2937&color=ffffff',
      venue: 'Rose Bowl Stadium',
      dateTime: new Date(now + 1000 * 60 * 60 * 24 * 2).toISOString(),
      isHome: true,
      result: 'Kickoff 7:30 PM',
      status: 'upcoming',
    },
  } as FeedItemEvent,
  {
    ...buildBase('feed-stat-demo', PRIMARY_AUTHOR, 1000 * 60 * 60 * 3),
    feedType: 'STAT',
    referenceId: 'stat-demo-1',
    statData: {
      context: 'Week 8 vs Central High',
      gameDate: new Date(now - 1000 * 60 * 60 * 24 * 2).toISOString(),
      gameResult: 'W 42-14',
      opponent: 'Central High',
      stats: [
        { label: 'PASS YDS', value: 342, unit: 'yds', isHighlight: true },
        { label: 'PASS TD', value: 4, isHighlight: true },
        { label: 'COMP %', value: 78, unit: '%' },
        { label: 'RUSH YDS', value: 45, unit: 'yds' },
      ],
      seasonTotals: [
        { label: 'TOTAL YDS', value: 2150, unit: 'yds' },
        { label: 'TOTAL TD', value: 24 },
      ],
    },
  } as FeedItemStat,
  {
    ...buildBase('feed-metric-demo', SECONDARY_AUTHOR, 1000 * 60 * 60 * 6),
    feedType: 'METRIC',
    referenceId: 'metric-demo-1',
    metricsData: {
      source: 'Elite 11 Regional',
      measuredAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
      category: 'Combine Results',
      metrics: [
        { label: '40 YARD', value: 4.45, unit: 's', verified: true, previousValue: 4.52 },
        { label: 'VERTICAL', value: 38, unit: 'in', verified: true, previousValue: 36 },
        { label: 'BROAD', value: 124, unit: 'in', verified: true },
      ],
    },
  } as FeedItemMetric,
  {
    ...buildBase('feed-offer-demo', PRIMARY_AUTHOR, 1000 * 60 * 60 * 12),
    feedType: 'OFFER',
    referenceId: 'offer-demo-1',
    offerData: {
      collegeName: 'University of Alabama',
      collegeLogoUrl: 'https://ui-avatars.com/api/?name=BAMA&background=9e1b32&color=ffffff',
      offerType: 'scholarship',
      sport: 'Football',
      division: 'D1',
      conference: 'SEC',
    },
  } as FeedItemOffer,
  {
    ...buildBase('feed-commitment-demo', SECONDARY_AUTHOR, 1000 * 60 * 60 * 18),
    feedType: 'COMMITMENT',
    referenceId: 'commitment-demo-1',
    commitmentData: {
      collegeName: 'Kentucky',
      collegeLogoUrl: 'https://ui-avatars.com/api/?name=UK&background=0033a0&color=ffffff',
      sport: 'Basketball',
      division: 'D1',
      commitDate: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
      isSigned: false,
    },
  } as FeedItemCommitment,
  {
    ...buildBase('feed-visit-demo', PRIMARY_AUTHOR, 1000 * 60 * 60 * 24),
    feedType: 'VISIT',
    referenceId: 'visit-demo-1',
    visitData: {
      collegeName: 'Ohio State',
      collegeLogoUrl: 'https://ui-avatars.com/api/?name=OSU&background=ce0f3d&color=ffffff',
      visitType: 'official',
      location: 'Columbus, OH',
      visitDate: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
      sport: 'Football',
      graphicUrl:
        'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800&h=520&fit=crop',
    },
  } as FeedItemVisit,
  {
    ...buildBase('feed-camp-demo', SECONDARY_AUTHOR, 1000 * 60 * 60 * 30),
    feedType: 'CAMP',
    referenceId: 'camp-demo-1',
    campData: {
      campName: 'UA Next Camp Series',
      organization: 'Under Armour',
      campType: 'camp',
      location: 'Atlanta, GA',
      eventDate: new Date(now - 1000 * 60 * 60 * 30).toISOString(),
      result: 'Top Performer',
      logoUrl: 'https://ui-avatars.com/api/?name=UA&background=000000&color=ffffff',
      graphicUrl:
        'https://images.unsplash.com/photo-1518604666860-9ed391f76460?w=800&h=520&fit=crop',
    },
  } as FeedItemCamp,
  {
    ...buildBase('feed-award-demo', PRIMARY_AUTHOR, 1000 * 60 * 60 * 36),
    feedType: 'AWARD',
    referenceId: 'award-demo-1',
    awardData: {
      awardName: 'Player of the Week',
      organization: 'MaxPreps',
      category: 'MVP',
      season: '2025',
      icon: 'trophy',
    },
  } as FeedItemAward,
  {
    ...buildBase('feed-news-demo', SECONDARY_AUTHOR, 1000 * 60 * 60 * 48),
    feedType: 'NEWS',
    referenceId: 'news-demo-1',
    newsData: {
      headline: 'Jaylen Davis erupts for 45 and breaks school scoring record',
      source: 'ESPN High School',
      sourceLogoUrl: 'https://ui-avatars.com/api/?name=ESPN&background=ff0000&color=ffffff',
      excerpt:
        'In a nationally watched matchup, the sophomore guard took over late and delivered a signature performance.',
      articleUrl: 'https://example.com/news/jaylen-davis-record-game',
      imageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=960&h=540&fit=crop',
      publishedAt: new Date(now - 1000 * 60 * 60 * 48).toISOString(),
      category: 'Recruiting',
    },
  } as FeedItemNews,
];
