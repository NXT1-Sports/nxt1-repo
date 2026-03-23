/**
 * @fileoverview Unit Tests — InteractWithWebpageTool
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Tests the tool shell in isolation by mocking FirecrawlService.
 * Verifies input validation, SSRF blocking, action parsing (all 7 types),
 * limits, successful execution, and error wrapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InteractWithWebpageTool } from '../interact-with-webpage.tool.js';
import type { FirecrawlService, FirecrawlScrapeResult } from '../firecrawl.service.js';

// ─── Mock FirecrawlService ──────────────────────────────────────────────────

const SAMPLE_MARKDOWN = '# Dashboard\n\nWelcome back, Jalen. You have 3 new messages.';

function createMockFirecrawl(): FirecrawlService {
  const scrapeWithActions = vi.fn<[], Promise<FirecrawlScrapeResult>>().mockResolvedValue({
    url: 'https://example.com/',
    markdown: SAMPLE_MARKDOWN,
    title: 'Dashboard',
    scrapedInMs: 1200,
    actions: { screenshots: ['data:image/png;base64,abc...'] },
  });

  return {
    scrapeText: vi.fn(),
    scrapeWithActions,
    search: vi.fn(),
  } as unknown as FirecrawlService;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const validUrl = 'https://www.maxpreps.com/athlete/jalen/abc';

function validAction(
  type: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const defaults: Record<string, Record<string, unknown>> = {
    click: { type: 'click', selector: '#submit' },
    write: { type: 'write', selector: '#name', text: 'Jalen' },
    press: { type: 'press', key: 'Enter' },
    wait: { type: 'wait', milliseconds: 1000 },
    scroll: { type: 'scroll', direction: 'down' },
    screenshot: { type: 'screenshot' },
    scrape: { type: 'scrape' },
  };
  return { ...(defaults[type] ?? { type }), ...overrides };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('InteractWithWebpageTool', () => {
  let tool: InteractWithWebpageTool;
  let mockFirecrawl: FirecrawlService;

  beforeEach(() => {
    mockFirecrawl = createMockFirecrawl();
    tool = new InteractWithWebpageTool(mockFirecrawl);
  });

  // ── Metadata ──────────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should have the correct tool name', () => {
      expect(tool.name).toBe('interact_with_webpage');
    });

    it('should not be a mutation', () => {
      expect(tool.isMutation).toBe(false);
    });

    it('should require url and actions', () => {
      const params = tool.parameters as Record<string, unknown>;
      expect(params['required']).toContain('url');
      expect(params['required']).toContain('actions');
    });

    it('should allow expected agents', () => {
      expect(tool.allowedAgents).toContain('data_coordinator');
      expect(tool.allowedAgents).toContain('general');
    });
  });

  // ── Input Validation — URL ────────────────────────────────────────────

  describe('input validation — url', () => {
    const actions = [validAction('click')];

    it('should return error when url is missing', async () => {
      const result = await tool.execute({ actions });
      expect(result.success).toBe(false);
      expect(result.error).toContain('url');
    });

    it('should return error when url is empty', async () => {
      const result = await tool.execute({ url: '', actions });
      expect(result.success).toBe(false);
      expect(result.error).toContain('url');
    });

    it('should return error when url is not a string', async () => {
      const result = await tool.execute({ url: 42, actions });
      expect(result.success).toBe(false);
      expect(result.error).toContain('url');
    });
  });

  // ── Input Validation — Actions ────────────────────────────────────────

  describe('input validation — actions', () => {
    it('should return error when actions is missing', async () => {
      const result = await tool.execute({ url: validUrl });
      expect(result.success).toBe(false);
      expect(result.error).toContain('actions');
    });

    it('should return error when actions is empty array', async () => {
      const result = await tool.execute({ url: validUrl, actions: [] });
      expect(result.success).toBe(false);
      expect(result.error).toContain('actions');
    });

    it('should return error when actions is not an array', async () => {
      const result = await tool.execute({ url: validUrl, actions: 'click' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('actions');
    });
  });

  // ── SSRF Protection ───────────────────────────────────────────────────

  describe('SSRF protection', () => {
    const actions = [validAction('click')];

    it('should block localhost', async () => {
      const result = await tool.execute({ url: 'http://localhost:8080', actions });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked host');
    });

    it('should block private IPs', async () => {
      const result = await tool.execute({ url: 'http://10.0.0.1', actions });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked host');
    });

    it('should block cloud metadata endpoints', async () => {
      const result = await tool.execute({ url: 'http://169.254.169.254/latest/', actions });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked host');
    });

    it('should not call Firecrawl when URL is blocked', async () => {
      await tool.execute({ url: 'http://localhost:3000', actions });
      expect(mockFirecrawl.scrapeWithActions).not.toHaveBeenCalled();
    });
  });

  // ── Action Parsing — Valid Actions ────────────────────────────────────

  describe('action parsing — valid actions', () => {
    it('should accept a click action', async () => {
      const result = await tool.execute({ url: validUrl, actions: [validAction('click')] });
      expect(result.success).toBe(true);
    });

    it('should accept a write action', async () => {
      const result = await tool.execute({ url: validUrl, actions: [validAction('write')] });
      expect(result.success).toBe(true);
    });

    it('should accept a press action', async () => {
      const result = await tool.execute({ url: validUrl, actions: [validAction('press')] });
      expect(result.success).toBe(true);
    });

    it('should accept a wait action', async () => {
      const result = await tool.execute({ url: validUrl, actions: [validAction('wait')] });
      expect(result.success).toBe(true);
    });

    it('should accept a scroll action with direction', async () => {
      const result = await tool.execute({ url: validUrl, actions: [validAction('scroll')] });
      expect(result.success).toBe(true);
    });

    it('should accept a scroll action with optional selector', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [validAction('scroll', { selector: '.feed-container' })],
      });
      expect(result.success).toBe(true);
    });

    it('should accept a screenshot action', async () => {
      const result = await tool.execute({ url: validUrl, actions: [validAction('screenshot')] });
      expect(result.success).toBe(true);
    });

    it('should accept a scrape action', async () => {
      const result = await tool.execute({ url: validUrl, actions: [validAction('scrape')] });
      expect(result.success).toBe(true);
    });

    it('should accept a mixed sequence of actions', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [
          validAction('wait', { milliseconds: 500 }),
          validAction('click'),
          validAction('write'),
          validAction('screenshot'),
          validAction('scrape'),
        ],
      });
      expect(result.success).toBe(true);
      expect(mockFirecrawl.scrapeWithActions).toHaveBeenCalledOnce();
    });
  });

  // ── Action Parsing — Invalid Actions ──────────────────────────────────

  describe('action parsing — invalid actions', () => {
    it('should reject unknown action type', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [{ type: 'hover', selector: '#el' }],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid type');
    });

    it('should reject click without selector', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [{ type: 'click' }],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('selector');
    });

    it('should accept write without selector (only text required)', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [{ type: 'write', text: 'hello' }],
      });
      expect(result.success).toBe(true);
    });

    it('should reject write without text', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [{ type: 'write', selector: '#input' }],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('text');
    });

    it('should reject press without key', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [{ type: 'press' }],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('key');
    });

    it('should reject wait without milliseconds', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [{ type: 'wait' }],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('milliseconds');
    });

    it('should reject scroll without direction', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [{ type: 'scroll' }],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('direction');
    });

    it('should reject scroll with invalid direction', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [{ type: 'scroll', direction: 'left' }],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('direction');
    });

    it('should reject action without type', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [{ selector: '#el' }],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('type');
    });
  });

  // ── Action Limits & Caps ──────────────────────────────────────────────

  describe('action limits', () => {
    it('should cap wait at 10 seconds', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [validAction('wait', { milliseconds: 30000 })],
      });

      // Should succeed — the tool caps rather than rejects
      expect(result.success).toBe(true);

      // Verify the capped value was passed to Firecrawl
      const call = vi.mocked(mockFirecrawl.scrapeWithActions).mock.calls[0];
      const passedActions = call[1] as Array<Record<string, unknown>>;
      const waitAction = passedActions.find((a) => a['type'] === 'wait');
      expect(waitAction?.['milliseconds']).toBeLessThanOrEqual(10000);
    });

    it('should reject more than 20 actions', async () => {
      const tooMany = Array.from({ length: 21 }, () => validAction('screenshot'));
      const result = await tool.execute({ url: validUrl, actions: tooMany });

      expect(result.success).toBe(false);
      expect(result.error).toContain('20');
    });

    it('should accept exactly 20 actions', async () => {
      const maxActions = Array.from({ length: 20 }, () => validAction('screenshot'));
      const result = await tool.execute({ url: validUrl, actions: maxActions });

      expect(result.success).toBe(true);
    });
  });

  // ── Successful Execution ──────────────────────────────────────────────

  describe('successful execution', () => {
    it('should return markdown data and metadata', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [validAction('click'), validAction('scrape')],
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['url']).toBe('https://example.com/');
      expect(data['title']).toBe('Dashboard');
      expect(data['scrapedInMs']).toBe(1200);
      expect(data['markdownContent']).toContain('Welcome back');
    });

    it('should include action results (screenshots) when present', async () => {
      const result = await tool.execute({
        url: validUrl,
        actions: [validAction('screenshot')],
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['actionResults']).toBeDefined();
    });

    it('should pass trimmed URL to FirecrawlService', async () => {
      await tool.execute({
        url: '  https://maxpreps.com/athlete  ',
        actions: [validAction('click')],
      });

      const call = vi.mocked(mockFirecrawl.scrapeWithActions).mock.calls[0];
      expect(call[0]).toBe('https://maxpreps.com/athlete');
    });
  });

  // ── Error Handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should wrap Firecrawl errors as ToolResult failures', async () => {
      vi.mocked(mockFirecrawl.scrapeWithActions).mockRejectedValue(
        new Error('SdkError: Firecrawl: 402 Payment Required')
      );

      const result = await tool.execute({
        url: validUrl,
        actions: [validAction('click')],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('402');
    });

    it('should handle non-Error throw values gracefully', async () => {
      vi.mocked(mockFirecrawl.scrapeWithActions).mockRejectedValue('unexpected');

      const result = await tool.execute({
        url: validUrl,
        actions: [validAction('click')],
      });

      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
    });
  });
});
