import { beforeEach, describe, expect, it, vi } from 'vitest';

const openRouterMocks = vi.hoisted(() => ({
  construct: vi.fn(),
  complete: vi.fn(),
}));

vi.mock('../../llm/openrouter.service.js', () => ({
  OpenRouterService: class MockOpenRouterService {
    constructor(options: unknown) {
      openRouterMocks.construct(options);
    }

    complete = openRouterMocks.complete;
  },
}));

const { generateEmailContent, WEEKLY_RECAP_EMAIL_MODEL } =
  await import('../weekly-recap-email.service.js');

describe('generateEmailContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openRouterMocks.complete.mockResolvedValue({
      content: JSON.stringify({
        subject: 'Your Week 1 Agent X Recap',
        introParagraph: 'Agent X helped you make measurable progress this week.',
        completedActions: ['Reviewed your recruiting checklist'],
        resultsHighlights: ['You have a clearer plan for next week'],
        nextSteps: ['Open your dashboard and review the next action'],
        ctaText: 'Open Dashboard',
        ctaUrl: 'https://app.nxt1sports.com/dashboard',
      }),
    });
  });

  it('uses the free weekly recap email model without changing the automation tier', async () => {
    const db = { collection: vi.fn() };

    await generateEmailContent(
      'John',
      'athlete',
      'basketball',
      'Week 1',
      'Agent X completed your weekly recruiting and performance recap.',
      [],
      db as never,
      { activeGoals: [], completedGoals: [] },
      { operationId: 'weekly-recap-smoke', userId: 'test-user' }
    );

    expect(WEEKLY_RECAP_EMAIL_MODEL).toBe('nvidia/nemotron-3-super-120b-a12b:free');
    expect(openRouterMocks.construct).toHaveBeenCalledWith({ firestore: db });
    expect(openRouterMocks.complete).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        tier: 'task_automation',
        modelOverride: WEEKLY_RECAP_EMAIL_MODEL,
        maxTokens: 700,
        telemetryContext: expect.objectContaining({
          operationId: 'weekly-recap-smoke',
          userId: 'test-user',
          feature: 'weekly-recap-email',
        }),
      })
    );
  });

  it('fills professional section fallbacks when the free model returns sparse JSON', async () => {
    openRouterMocks.complete.mockResolvedValueOnce({
      content: JSON.stringify({
        subject: 'Your Week 1 Recap',
        introParagraph: 'Agent X has your weekly recap ready.',
        ctaText: 'Open Dashboard',
        ctaUrl: 'https://app.nxt1sports.com/dashboard',
      }),
    });

    const content = await generateEmailContent(
      'John',
      'athlete',
      'basketball',
      'Week 1',
      'Agent X completed your weekly recruiting and performance recap.',
      [],
      { collection: vi.fn() } as never,
      { activeGoals: [], completedGoals: [] }
    );

    expect(content.completedActions.length).toBeGreaterThan(0);
    expect(content.resultsHighlights.length).toBeGreaterThan(0);
    expect(content.nextSteps.length).toBeGreaterThan(0);
    expect(content.ctaUrl).toBe('https://app.nxt1sports.com/dashboard');
  });
});
