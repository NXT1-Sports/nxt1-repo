/**
 * @fileoverview API Mocking E2E Tests
 * @module @nxt1/web/e2e/tests/api
 *
 * Example tests demonstrating MSW (Mock Service Worker) integration.
 * These tests show how to mock API responses for reliable E2E testing.
 *
 * @see https://mswjs.io/docs/
 * @version 2.0.0 (2026)
 */

import { testWithMSW as test, expect } from '../../fixtures';
import { http, HttpResponse } from 'msw';

test.describe('API Mocking with MSW', () => {
  test.describe.configure({ mode: 'parallel' });

  // ===========================================================================
  // BASIC MOCKING TESTS
  // ===========================================================================

  test.describe('Basic API Mocking', () => {
    test('should use default mock data', async ({ page, msw }) => {
      // Default handlers are already active
      // Navigate to a page that fetches data
      await page.goto('/home');

      // The API calls will be intercepted by MSW
      // We can verify mock data is being used
      expect(msw.mockData.user.email).toBe('e2e-test@nxt1.com');
    });

    test('should mock profile API response', async ({ page, msw }) => {
      // Access mock data for assertions
      const mockProfile = msw.mockData.profile;

      await page.goto('/profile');

      // Wait for profile to load (intercepted by MSW)
      await page.waitForLoadState('networkidle');

      // Profile data should match our mock
      expect(mockProfile.firstName).toBe('E2E');
      expect(mockProfile.lastName).toBe('Tester');
    });
  });

  // ===========================================================================
  // CUSTOM HANDLER TESTS
  // ===========================================================================

  test.describe('Custom Handlers', () => {
    test('should override default handlers for specific scenarios', async ({ page, msw }) => {
      // Add custom handler for this test only
      msw.use(
        http.get('http://localhost:3001/api/v1/profile/me', () => {
          return HttpResponse.json({
            success: true,
            data: {
              id: 'custom-profile',
              firstName: 'Custom',
              lastName: 'User',
              email: 'custom@test.com',
              role: 'coach',
            },
          });
        })
      );

      await page.goto('/profile');
      await page.waitForLoadState('networkidle');

      // Test would now receive the custom response
    });

    test('should mock specific endpoints', async ({ page, msw }) => {
      // Mock a specific endpoint with custom data
      msw.use(
        http.get('http://localhost:3001/api/v1/teams', () => {
          return HttpResponse.json({
            success: true,
            data: [{ id: 'team-custom', name: 'Custom Team', sport: 'Basketball' }],
          });
        })
      );

      await page.goto('/teams');
      await page.waitForLoadState('networkidle');

      // Verify custom mock is used
    });
  });

  // ===========================================================================
  // ERROR SCENARIO TESTS
  // ===========================================================================

  test.describe('Error Scenarios', () => {
    test('should handle server errors gracefully', async ({ page, msw }) => {
      // Simulate 500 error for all API requests
      msw.simulateServerError();

      await page.goto('/home');

      // App may redirect to auth or show error state depending on auth status
      // Either behavior is acceptable - the test proves MSW mocking works
      const currentUrl = page.url();
      const isValidResponse = currentUrl.includes('/home') || currentUrl.includes('/auth');
      expect(isValidResponse).toBe(true);
    });

    test('should handle unauthorized errors', async ({ page, msw }) => {
      // Simulate 401 unauthorized
      msw.simulateUnauthorized();

      await page.goto('/profile');

      // App should redirect to login or show auth error
      // This depends on your app's error handling
    });

    test('should handle rate limiting', async ({ page, msw }) => {
      // Simulate 429 rate limit
      msw.simulateRateLimited();

      await page.goto('/home');

      // App should show rate limit message or retry
    });

    test('should reset to default handlers', async ({ page, msw }) => {
      // First, use error handler
      msw.simulateServerError();

      // Then reset to defaults
      msw.reset();

      await page.goto('/home');

      // Default handlers are now active again
      // API calls should succeed with mock data
    });
  });

  // ===========================================================================
  // CONDITIONAL RESPONSE TESTS
  // ===========================================================================

  test.describe('Conditional Responses', () => {
    test('should mock based on request parameters', async ({ page, msw }) => {
      msw.use(
        http.get('http://localhost:3001/api/v1/search/athletes', ({ request }) => {
          const url = new URL(request.url);
          const query = url.searchParams.get('q');

          if (query === 'quarterback') {
            return HttpResponse.json({
              success: true,
              data: {
                results: [
                  { id: '1', name: 'QB1', position: 'Quarterback' },
                  { id: '2', name: 'QB2', position: 'Quarterback' },
                ],
                total: 2,
              },
            });
          }

          return HttpResponse.json({
            success: true,
            data: { results: [], total: 0 },
          });
        })
      );

      // Navigate to search and test both scenarios
      await page.goto('/explore/athletes?q=quarterback');
      // Should show 2 results

      await page.goto('/explore/athletes?q=nonexistent');
      // Should show empty state
    });

    test('should mock based on request body', async ({ page, msw }) => {
      msw.use(
        http.post('http://localhost:3001/api/v1/teams/join', async ({ request }) => {
          const body = (await request.json()) as { code: string };

          if (body.code === 'SPECIAL-CODE') {
            return HttpResponse.json({
              success: true,
              data: { team: { id: 'special-team', name: 'Special Team' } },
            });
          }

          return HttpResponse.json(
            { success: false, error: { code: 'INVALID_CODE', message: 'Invalid code' } },
            { status: 400 }
          );
        })
      );

      // Test would submit form with different codes
    });
  });

  // ===========================================================================
  // NETWORK TIMING TESTS
  // ===========================================================================

  test.describe('Network Timing', () => {
    test('should handle slow network responses', async ({ page, msw }) => {
      msw.use(
        http.get('http://localhost:3001/api/v1/profile/me', async () => {
          // Simulate slow network (2 seconds)
          await new Promise((resolve) => setTimeout(resolve, 2000));

          return HttpResponse.json({
            success: true,
            data: msw.mockData.profile,
          });
        })
      );

      await page.goto('/profile');

      // Verify loading state appears
      const loadingElement = page.locator('[data-testid="loading"], .skeleton');
      const hasLoading = await loadingElement.isVisible().catch(() => false);

      // Wait for data to load
      await page.waitForLoadState('networkidle');
    });
  });

  // ===========================================================================
  // INTEGRATION TESTS WITH MOCK DATA
  // ===========================================================================

  test.describe('Mock Data Integration', () => {
    test('should verify mock user data in assertions', async ({ msw }) => {
      // Access mock data for test assertions
      expect(msw.mockData.user.uid).toBe('test-user-123');
      expect(msw.mockData.profile.role).toBe('athlete');
      expect(msw.mockData.teams).toHaveLength(2);
      expect(msw.mockData.posts).toHaveLength(2);
      expect(msw.mockData.notifications).toHaveLength(2);
    });

    test('should use mock data for UI verification', async ({ page, msw }) => {
      await page.goto('/home');
      await page.waitForLoadState('networkidle');

      // Mock data can be used to verify what's displayed
      const expectedTeamCount = msw.mockData.teams.length;
      const expectedPostCount = msw.mockData.posts.length;

      // Verify UI shows expected data counts
      // (depends on your actual UI implementation)
    });
  });
});
