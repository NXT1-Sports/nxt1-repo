/**
 * @fileoverview MSW API Handlers for E2E Testing
 * @module @nxt1/web/e2e/mocks
 *
 * Mock Service Worker handlers for intercepting API calls during E2E tests.
 * These handlers provide consistent, predictable responses for testing.
 *
 * @see https://mswjs.io/docs/
 * @version 2.0.0 (2026)
 */

import { http, HttpResponse, delay } from 'msw';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * API base URLs for mocking
 * We need to handle both the dedicated mock URL and the app's actual API URL
 */
const MOCK_API_BASE = process.env['E2E_API_BASE_URL'] || 'http://localhost:3001';
const APP_API_BASE = 'http://localhost:3000/api/v1/staging';

/**
 * Simulate network latency in tests (ms)
 * Set to 0 for faster tests, higher for realistic scenarios
 */
const MOCK_DELAY = parseInt(process.env['E2E_MOCK_DELAY'] || '50', 10);

// =============================================================================
// MOCK DATA
// =============================================================================

/**
 * Mock user data for authenticated responses
 */
export const MOCK_USER = {
  uid: 'test-user-123',
  email: 'e2e-test@nxt1.com',
  displayName: 'E2E Test User',
  profileImg: 'https://ui-avatars.com/api/?name=E2E+Test&background=random',
  emailVerified: true,
  metadata: {
    creationTime: '2025-01-01T00:00:00.000Z',
    lastSignInTime: new Date().toISOString(),
  },
};

/**
 * Mock profile data
 */
export const MOCK_PROFILE = {
  id: 'profile-123',
  userId: MOCK_USER.uid,
  firstName: 'E2E',
  lastName: 'Tester',
  email: MOCK_USER.email,
  role: 'athlete',
  sports: [
    {
      name: 'Football',
      positions: ['Quarterback', 'Wide Receiver'],
      isPrimary: true,
    },
  ],
  location: {
    city: 'Austin',
    state: 'TX',
    country: 'USA',
  },
  graduationYear: 2026,
  height: { feet: 6, inches: 2 },
  weight: 190,
  gpa: 3.8,
  bio: 'Test athlete for E2E testing',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: new Date().toISOString(),
  isOnboarded: true,
  profileCompletion: 85,
};

/**
 * Mock teams data
 */
export const MOCK_TEAMS = [
  {
    id: 'team-001',
    name: 'Riverside High School',
    sport: 'Football',
    type: 'High School',
    city: 'Austin',
    state: 'TX',
    memberCount: 45,
    logoUrl: 'https://ui-avatars.com/api/?name=RHS&background=8b4513',
  },
  {
    id: 'team-002',
    name: 'Austin Elite 7v7',
    sport: 'Football',
    type: 'Club',
    city: 'Austin',
    state: 'TX',
    memberCount: 15,
    logoUrl: 'https://ui-avatars.com/api/?name=AE7&background=ff6b00',
  },
];

/**
 * Mock feed posts
 */
export const MOCK_POSTS = [
  {
    id: 'post-001',
    type: 'highlight',
    title: 'Game-winning touchdown',
    body: 'Check out this highlight from last Friday!',
    mediaUrl: 'https://example.com/video/highlight-001.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&h=300',
    authorId: MOCK_USER.uid,
    author: {
      name: 'E2E Tester',
      avatarUrl: MOCK_USER.profileImg,
    },
    likeCount: 42,
    commentCount: 8,
    isLiked: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'post-002',
    type: 'text',
    title: 'Training update',
    body: 'Great practice today. Working on route running and hand-eye coordination.',
    authorId: MOCK_USER.uid,
    author: {
      name: 'E2E Tester',
      avatarUrl: MOCK_USER.profileImg,
    },
    likeCount: 15,
    commentCount: 3,
    isLiked: true,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

/**
 * Mock notifications
 */
export const MOCK_NOTIFICATIONS = [
  {
    id: 'notif-001',
    type: 'like',
    title: 'New like',
    body: 'Coach Smith liked your highlight',
    isRead: false,
    createdAt: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: 'notif-002',
    type: 'follow',
    title: 'New follower',
    body: 'University of Texas started following you',
    isRead: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

// =============================================================================
// API RESPONSE HELPERS
// =============================================================================

/**
 * Create a standardized API success response
 */
function apiSuccess<T>(data: T, message?: string) {
  return HttpResponse.json({
    success: true,
    data,
    message: message || 'Success',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create a standardized API error response
 */
function apiError(status: number, code: string, message: string) {
  return HttpResponse.json(
    {
      success: false,
      error: {
        code,
        message,
      },
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Create handler for a path that works with both API bases
 * This ensures mocks work regardless of which API URL the app uses
 */
function createDualHandler(
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  handler: Parameters<typeof http.get>[1]
) {
  return [
    http[method](`${MOCK_API_BASE}${path}`, handler),
    http[method](`${APP_API_BASE}${path}`, handler),
  ];
}

/**
 * All MSW handlers for E2E testing
 * Organized by feature/domain
 */
export const handlers = [
  // ===========================================================================
  // AUTH ENDPOINTS (APP API - matches the actual app's API calls)
  // ===========================================================================

  /**
   * Get user profile by UID - CRITICAL for login flow
   * The app calls: GET /auth/profile/:uid after Firebase login
   */
  http.get(`${APP_API_BASE}/auth/profile/:uid`, async (info) => {
    await delay(MOCK_DELAY);
    const { uid } = info.params;

    // Return mock profile for any UID (simulates existing user)
    return apiSuccess({
      id: uid,
      email: MOCK_USER.email,
      firstName: 'E2E',
      lastName: 'Tester',
      role: 'athlete',
      planTier: null,
      onboardingCompleted: true,
      completeSignUp: true,
      isCollegeCoach: false,
      isRecruit: true,
      profileImg: MOCK_USER.profileImg,
      sports: [{ sport: 'Football', positions: ['Quarterback'], order: 0 }],
    });
  }),

  // ===========================================================================
  // AUTH ENDPOINTS (MOCK API)
  // ===========================================================================

  /**
   * Firebase Auth - Verify ID Token
   * Used to validate Firebase JWT tokens
   */
  http.post(`${MOCK_API_BASE}/api/v1/auth/verify`, async () => {
    await delay(MOCK_DELAY);
    return apiSuccess({
      valid: true,
      user: MOCK_USER,
    });
  }),

  /**
   * Get current user session
   */
  http.get(`${MOCK_API_BASE}/api/v1/auth/session`, async () => {
    await delay(MOCK_DELAY);
    return apiSuccess({
      user: MOCK_USER,
      isAuthenticated: true,
    });
  }),

  /**
   * Sign out
   */
  http.post(`${MOCK_API_BASE}/api/v1/auth/signout`, async () => {
    await delay(MOCK_DELAY);
    return apiSuccess({ signedOut: true });
  }),

  // ===========================================================================
  // PROFILE ENDPOINTS
  // ===========================================================================

  /**
   * Get current user's profile
   */
  http.get(`${MOCK_API_BASE}/api/v1/profile/me`, async () => {
    await delay(MOCK_DELAY);
    return apiSuccess(MOCK_PROFILE);
  }),

  /**
   * Get profile by ID
   */
  http.get(`${MOCK_API_BASE}/api/v1/profile/:id`, async (info) => {
    await delay(MOCK_DELAY);
    const { id } = info.params;

    if (id === MOCK_PROFILE.id || id === MOCK_USER.uid) {
      return apiSuccess(MOCK_PROFILE);
    }

    return apiError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
  }),

  /**
   * Update profile
   */
  http.put(`${MOCK_API_BASE}/api/v1/profile/:id`, async (info) => {
    await delay(MOCK_DELAY);
    const updates = (await info.request.json()) as Partial<typeof MOCK_PROFILE>;

    return apiSuccess({
      ...MOCK_PROFILE,
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  }),

  /**
   * Update onboarding progress
   */
  http.post(`${MOCK_API_BASE}/api/v1/profile/onboarding`, async (info) => {
    await delay(MOCK_DELAY);
    const data = (await info.request.json()) as Record<string, unknown>;

    return apiSuccess({
      ...MOCK_PROFILE,
      ...data,
      updatedAt: new Date().toISOString(),
    });
  }),

  // ===========================================================================
  // TEAM ENDPOINTS
  // ===========================================================================

  /**
   * Get user's teams
   */
  http.get(`${MOCK_API_BASE}/api/v1/teams`, async () => {
    await delay(MOCK_DELAY);
    return apiSuccess(MOCK_TEAMS);
  }),

  /**
   * Get team by ID
   */
  http.get(`${MOCK_API_BASE}/api/v1/teams/:id`, async (info) => {
    await delay(MOCK_DELAY);
    const team = MOCK_TEAMS.find((t) => t.id === info.params['id']);

    if (team) {
      return apiSuccess(team);
    }

    return apiError(404, 'TEAM_NOT_FOUND', 'Team not found');
  }),

  /**
   * Join team with code
   */
  http.post(`${MOCK_API_BASE}/api/v1/teams/join`, async (info) => {
    await delay(MOCK_DELAY);
    const { code } = (await info.request.json()) as { code: string };

    // Simulate valid/invalid codes
    if (code === 'VALID123' || code === 'TEST-CODE') {
      return apiSuccess({
        team: MOCK_TEAMS[0],
        joined: true,
      });
    }

    return apiError(400, 'INVALID_CODE', 'Invalid team code');
  }),

  // ===========================================================================
  // FEED/POST ENDPOINTS
  // ===========================================================================

  /**
   * Get feed posts
   */
  http.get(`${MOCK_API_BASE}/api/v1/feed`, async (info) => {
    await delay(MOCK_DELAY);
    const url = new URL(info.request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    return apiSuccess({
      posts: MOCK_POSTS,
      pagination: {
        page,
        limit,
        total: MOCK_POSTS.length,
        hasMore: false,
      },
    });
  }),

  /**
   * Get single post
   */
  http.get(`${MOCK_API_BASE}/api/v1/posts/:id`, async (info) => {
    await delay(MOCK_DELAY);
    const post = MOCK_POSTS.find((p) => p.id === info.params['id']);

    if (post) {
      return apiSuccess(post);
    }

    return apiError(404, 'POST_NOT_FOUND', 'Post not found');
  }),

  /**
   * Create post
   */
  http.post(`${MOCK_API_BASE}/api/v1/posts`, async (info) => {
    await delay(MOCK_DELAY);
    const data = (await info.request.json()) as Partial<(typeof MOCK_POSTS)[0]>;

    const newPost = {
      id: `post-${Date.now()}`,
      ...data,
      authorId: MOCK_USER.uid,
      author: {
        name: 'E2E Tester',
        avatarUrl: MOCK_USER.profileImg,
      },
      likeCount: 0,
      commentCount: 0,
      isLiked: false,
      createdAt: new Date().toISOString(),
    };

    return apiSuccess(newPost, 'Post created successfully');
  }),

  /**
   * Like/unlike post
   */
  http.post(`${MOCK_API_BASE}/api/v1/posts/:id/like`, async (info) => {
    await delay(MOCK_DELAY);
    return apiSuccess({
      postId: info.params['id'],
      liked: true,
      likeCount: 43,
    });
  }),

  // ===========================================================================
  // NOTIFICATION ENDPOINTS
  // ===========================================================================

  /**
   * Get notifications
   */
  http.get(`${MOCK_API_BASE}/api/v1/notifications`, async () => {
    await delay(MOCK_DELAY);
    return apiSuccess({
      notifications: MOCK_NOTIFICATIONS,
      unreadCount: MOCK_NOTIFICATIONS.filter((n) => !n.isRead).length,
    });
  }),

  /**
   * Mark notifications as read
   */
  http.post(`${MOCK_API_BASE}/api/v1/notifications/read`, async () => {
    await delay(MOCK_DELAY);
    return apiSuccess({ marked: true });
  }),

  // ===========================================================================
  // SEARCH ENDPOINTS
  // ===========================================================================

  /**
   * Search athletes
   */
  http.get(`${MOCK_API_BASE}/api/v1/search/athletes`, async (info) => {
    await delay(MOCK_DELAY);
    const url = new URL(info.request.url);
    const query = url.searchParams.get('q') || '';

    // Return mock results based on query
    const results = query
      ? [
          {
            id: 'athlete-001',
            name: 'Sample Athlete',
            sport: 'Football',
            position: 'Quarterback',
            graduationYear: 2026,
            location: 'Austin, TX',
          },
        ]
      : [];

    return apiSuccess({
      results,
      total: results.length,
    });
  }),

  /**
   * Search colleges
   */
  http.get(`${MOCK_API_BASE}/api/v1/search/colleges`, async () => {
    await delay(MOCK_DELAY);
    return apiSuccess({
      results: [
        {
          id: 'college-001',
          name: 'University of Texas',
          location: 'Austin, TX',
          division: 'D1',
          conference: 'SEC',
        },
        {
          id: 'college-002',
          name: 'Texas A&M University',
          location: 'College Station, TX',
          division: 'D1',
          conference: 'SEC',
        },
      ],
      total: 2,
    });
  }),

  // ===========================================================================
  // UPLOAD ENDPOINTS
  // ===========================================================================

  /**
   * Upload file (profile photo, video, etc.)
   */
  http.post(`${MOCK_API_BASE}/api/v1/upload`, async () => {
    await delay(MOCK_DELAY * 2); // Simulate slower upload

    return apiSuccess({
      url: 'https://storage.googleapis.com/nxt1-uploads/mock-upload-123.jpg',
      path: 'uploads/mock-upload-123.jpg',
      type: 'image/jpeg',
      size: 1024000,
    });
  }),

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * API health check
   */
  http.get(`${MOCK_API_BASE}/api/v1/health`, async () => {
    return apiSuccess({
      status: 'healthy',
      version: '1.0.0',
      environment: 'e2e-test',
    });
  }),
];

/**
 * Handlers for error scenarios
 * Import these when testing error states
 */
export const errorHandlers = {
  /**
   * Simulate 500 Internal Server Error
   */
  serverError: http.all(`${MOCK_API_BASE}/*`, async () => {
    await delay(MOCK_DELAY);
    return apiError(500, 'INTERNAL_ERROR', 'Internal server error');
  }),

  /**
   * Simulate 401 Unauthorized
   */
  unauthorized: http.all(`${MOCK_API_BASE}/*`, async () => {
    await delay(MOCK_DELAY);
    return apiError(401, 'UNAUTHORIZED', 'Authentication required');
  }),

  /**
   * Simulate network timeout
   */
  timeout: http.all(`${MOCK_API_BASE}/*`, async () => {
    await delay(30000); // 30 second delay to trigger timeout
    return apiSuccess({});
  }),

  /**
   * Simulate rate limiting
   */
  rateLimited: http.all(`${MOCK_API_BASE}/*`, async () => {
    await delay(MOCK_DELAY);
    return HttpResponse.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          retryAfter: 60,
        },
      },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
        },
      }
    );
  }),
};

export default handlers;
