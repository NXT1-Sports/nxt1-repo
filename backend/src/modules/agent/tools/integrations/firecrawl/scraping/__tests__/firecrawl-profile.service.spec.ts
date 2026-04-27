import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockScrape, mockInteract, mockStopInteraction, mockDeleteBrowser } = vi.hoisted(() => ({
  mockScrape: vi.fn(),
  mockInteract: vi.fn(),
  mockStopInteraction: vi.fn(),
  mockDeleteBrowser: vi.fn(),
}));

vi.mock('@mendable/firecrawl-js', () => ({
  default: class MockFirecrawl {
    scrape = mockScrape;
    interact = mockInteract;
    stopInteraction = mockStopInteraction;
    deleteBrowser = mockDeleteBrowser;
  },
}));

vi.mock('../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { FirecrawlProfileService } from '../../firecrawl-profile.service.js';

const TEST_USER_ID = 'user-123';
const TEST_PLATFORM = 'catapult_signin';
const TEST_LOGIN_URL =
  'https://sso.catapultsports.info/login?app_url=https://vault.catapultsports.info';
const TEST_SESSION_ID = 'fc-scrape-signin-123';
const TEST_INTERACTIVE_URL = 'https://liveview.firecrawl.dev/session/signin-123';
const TEST_LIVE_VIEW_URL = 'https://liveview.firecrawl.dev/view/signin-123';

function createSuccessfulScrapeResult() {
  return {
    markdown: '# Login',
    metadata: {
      scrapeId: TEST_SESSION_ID,
      title: 'Login',
      url: TEST_LOGIN_URL,
    },
  };
}

function createSuccessfulInteractResult(overrides?: Partial<Record<string, unknown>>) {
  return {
    success: true,
    interactiveLiveViewUrl: TEST_INTERACTIVE_URL,
    liveViewUrl: TEST_LIVE_VIEW_URL,
    stdout: '',
    exitCode: 0,
    ...overrides,
  };
}

describe('FirecrawlProfileService', () => {
  let service: FirecrawlProfileService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockScrape.mockResolvedValue(createSuccessfulScrapeResult());
    mockInteract.mockResolvedValue(createSuccessfulInteractResult());
    mockStopInteraction.mockResolvedValue({ success: true });
    mockDeleteBrowser.mockResolvedValue({ success: true });
    service = new FirecrawlProfileService('test-api-key');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts sign-in sessions directly on the login URL via scrape plus interact', async () => {
    const result = await service.startSignInSession(TEST_USER_ID, TEST_PLATFORM, TEST_LOGIN_URL);

    expect(result).toEqual({
      sessionId: TEST_SESSION_ID,
      interactiveLiveViewUrl: TEST_INTERACTIVE_URL,
      liveViewUrl: TEST_LIVE_VIEW_URL,
      profileName: service.generateProfileName(TEST_USER_ID, TEST_PLATFORM),
    });

    expect(mockScrape).toHaveBeenCalledWith(
      TEST_LOGIN_URL,
      expect.objectContaining({
        profile: {
          name: service.generateProfileName(TEST_USER_ID, TEST_PLATFORM),
          saveChanges: true,
        },
      })
    );
    expect(mockInteract).toHaveBeenCalledWith(
      TEST_SESSION_ID,
      expect.objectContaining({
        code: expect.stringContaining('initialized'),
      })
    );
    expect(mockDeleteBrowser).not.toHaveBeenCalled();
  });

  it('completes sign-in sessions with stopInteraction', async () => {
    await service.completeSignInSession(TEST_SESSION_ID);

    expect(mockStopInteraction).toHaveBeenCalledWith(TEST_SESSION_ID);
    expect(mockDeleteBrowser).not.toHaveBeenCalled();
  });

  it('cleans up with stopInteraction when interactive URL is missing', async () => {
    mockInteract.mockResolvedValueOnce(
      createSuccessfulInteractResult({ interactiveLiveViewUrl: '', liveViewUrl: '' })
    );

    await expect(
      service.startSignInSession(TEST_USER_ID, TEST_PLATFORM, TEST_LOGIN_URL)
    ).rejects.toThrow('interactive live view URL');

    expect(mockStopInteraction).toHaveBeenCalledWith(TEST_SESSION_ID);
  });
});
