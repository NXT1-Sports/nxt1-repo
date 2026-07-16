import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSendSlackAlert = vi.fn();
const mockSendWelcomeOnboardingEmail = vi.fn();
const mockEnrollPushDrip = vi.fn();
const mockEnrollSignupDrip = vi.fn();
const mockEnqueueSignupNotionDashboardEntry = vi.fn();
const mockReupsertB2CUsersAccountStartedEntry = vi.fn();

vi.mock('../../../platform/alert.service.js', () => ({
  sendSlackAlert: mockSendSlackAlert,
}));

vi.mock('../../email/campaigns/welcome/welcome-onboarding-email.service.js', () => ({
  sendWelcomeOnboardingEmail: mockSendWelcomeOnboardingEmail,
}));

vi.mock('../push-drip.service.js', () => ({
  enrollPushDrip: mockEnrollPushDrip,
}));

vi.mock('../signup-drip.service.js', () => ({
  enrollSignupDrip: mockEnrollSignupDrip,
}));

vi.mock('../signup-notion-dashboard.service.js', () => ({
  enqueueSignupNotionDashboardEntry: mockEnqueueSignupNotionDashboardEntry,
}));

vi.mock('../b2c-users.service.js', () => ({
  reupsertB2CUsersAccountStartedEntry: mockReupsertB2CUsersAccountStartedEntry,
}));

describe('completed-signup-lifecycle.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendWelcomeOnboardingEmail.mockResolvedValue({ status: 'skipped', reason: 'already-sent' });
    mockEnrollSignupDrip.mockResolvedValue({ status: 'skipped' });
    mockEnrollPushDrip.mockResolvedValue({ status: 'skipped' });
    mockReupsertB2CUsersAccountStartedEntry.mockResolvedValue({
      status: 'existing',
      pageId: 'page_b2c_existing',
      pageUrl: 'https://notion.so/page_b2c_existing',
    });
  });

  it('re-upserts the B2C Users row on onboarding completion so signup-created rows are enriched', async () => {
    const { processCompletedSignupLifecycle } =
      await import('../completed-signup-lifecycle.service.js');

    const result = await processCompletedSignupLifecycle({
      db: {} as never,
      userId: 'user_123',
      environment: 'production',
      role: 'athlete',
      firstName: 'Ava',
      lastName: 'Stone',
      email: 'ava@example.com',
      primarySport: 'Basketball',
      slackAlertAlreadySent: true,
      welcomeEmailAlreadySent: true,
      notionDashboardAlreadySynced: false,
      b2cUsersAlreadySynced: true,
    });

    expect(mockReupsertB2CUsersAccountStartedEntry).toHaveBeenCalledWith({
      db: {} as never,
      userId: 'user_123',
      environment: 'production',
    });
    expect(result.b2cUsersEntry).toEqual({
      status: 'existing',
      pageId: 'page_b2c_existing',
      pageUrl: 'https://notion.so/page_b2c_existing',
    });
    expect(mockEnqueueSignupNotionDashboardEntry).not.toHaveBeenCalled();
  });
});
