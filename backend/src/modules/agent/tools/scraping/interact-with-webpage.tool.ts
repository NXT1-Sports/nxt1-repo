/**
 * @fileoverview Interact With Webpage Tool (Browser Sandbox)
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Agent X tool that opens a URL in a headless browser and executes a sequence
 * of actions (click, type, wait, scroll, screenshot) before reading the page.
 *
 * Powered by Firecrawl's Browser Sandbox — a managed headless Chrome instance
 * with residential proxies. The agent can use this to:
 *
 * - Click tabs or buttons to reveal hidden content (e.g., Hudl stats tab)
 * - Type into search bars and submit queries
 * - Navigate paginated results
 * - Wait for dynamic content to load
 * - Take screenshots at any step for visual context
 *
 * IMPORTANT: This tool CANNOT watch videos. It can only extract video URLs.
 * For video analysis, a separate multimodal tool is required.
 */

import { BaseTool, type ToolResult } from '../base.tool.js';
import { FirecrawlService } from './firecrawl.service.js';
import { validateUrl } from './url-validator.js';
import type { ActionOption } from '@mendable/firecrawl-js';

/** The action types we accept from the LLM. */
const VALID_ACTION_TYPES = new Set([
  'click',
  'write',
  'press',
  'wait',
  'scroll',
  'screenshot',
  'scrape',
]);

export class InteractWithWebpageTool extends BaseTool {
  readonly name = 'interact_with_webpage';
  readonly description =
    'Opens a URL in a headless browser and executes a sequence of actions ' +
    '(click, type, wait, scroll) before reading the page content. ' +
    'Use this when you need to interact with a webpage to reveal content ' +
    'that is not visible on initial page load — for example, clicking a ' +
    '"Stats" tab on Hudl, typing into a search bar, navigating pagination, ' +
    'or waiting for dynamic content to load. ' +
    'Each action is executed in order. After all actions complete, the final ' +
    'page content is returned as clean markdown. ' +
    'NOTE: This tool CANNOT watch or analyze videos — it can only extract video URLs.';

  readonly parameters = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to open in the browser.',
      },
      actions: {
        type: 'array',
        description:
          'Ordered list of browser actions to perform. Each action has a "type" and type-specific fields.',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['click', 'write', 'press', 'wait', 'scroll', 'screenshot', 'scrape'],
              description: 'The type of browser action to perform.',
            },
            selector: {
              type: 'string',
              description:
                'CSS selector for the target element (used with "click" and "wait" types).',
            },
            text: {
              type: 'string',
              description: 'Text to type (used with "write" type).',
            },
            key: {
              type: 'string',
              description: 'Keyboard key to press, e.g. "Enter", "Tab" (used with "press" type).',
            },
            milliseconds: {
              type: 'number',
              description: 'Time to wait in milliseconds (used with "wait" type).',
            },
            direction: {
              type: 'string',
              enum: ['up', 'down'],
              description: 'Scroll direction (used with "scroll" type).',
            },
          },
          required: ['type'],
        },
      },
    },
    required: ['url', 'actions'],
  } as const;

  override readonly allowedAgents = [
    'data_coordinator',
    'performance_coordinator',
    'recruiting_coordinator',
    'general',
    'brand_media_coordinator',
  ] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  private readonly firecrawl: FirecrawlService;

  constructor(firecrawl?: FirecrawlService) {
    super();
    this.firecrawl = firecrawl ?? new FirecrawlService();
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const url = this.str(input, 'url');
    if (!url) return this.paramError('url');

    const rawActions = this.arr(input, 'actions');
    if (!rawActions) {
      return this.paramError('actions');
    }

    // Validate URL for SSRF
    try {
      validateUrl(url);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Invalid URL',
      };
    }

    // Validate and sanitize actions
    const actions = this.parseActions(rawActions);
    if (typeof actions === 'string') {
      return { success: false, error: actions };
    }

    if (actions.length === 0) {
      return {
        success: false,
        error: 'At least one action is required. Provide an array of browser actions.',
      };
    }

    if (actions.length > 20) {
      return {
        success: false,
        error: 'Too many actions. Maximum 20 actions per request.',
      };
    }

    try {
      const result = await this.firecrawl.scrapeWithActions(url, actions);

      return {
        success: true,
        data: {
          url: result.url,
          title: result.title,
          scrapedInMs: result.scrapedInMs,
          contentLength: result.markdown.length,
          actionsExecuted: actions.length,
          markdownContent: result.markdown,
          ...(result.actions ? { actionResults: result.actions } : {}),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Browser interaction failed';
      return { success: false, error: message };
    }
  }

  /**
   * Parse and validate the raw actions array from LLM input.
   * Returns validated ActionOption[] or an error string.
   */
  private parseActions(raw: unknown[]): ActionOption[] | string {
    const actions: ActionOption[] = [];

    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (!item || typeof item !== 'object') {
        return `Action at index ${i} must be an object.`;
      }

      const action = item as Record<string, unknown>;
      const type = action['type'];

      if (typeof type !== 'string' || !VALID_ACTION_TYPES.has(type)) {
        return `Action at index ${i} has invalid type "${String(type)}". Valid types: ${Array.from(VALID_ACTION_TYPES).join(', ')}.`;
      }

      switch (type) {
        case 'click': {
          const selector = action['selector'];
          if (typeof selector !== 'string' || !selector.trim()) {
            return `Action at index ${i} (click) requires a "selector" string.`;
          }
          actions.push({ type: 'click', selector: selector.trim() });
          break;
        }
        case 'write': {
          const text = action['text'];
          if (typeof text !== 'string') {
            return `Action at index ${i} (write) requires a "text" string.`;
          }
          actions.push({ type: 'write', text });
          break;
        }
        case 'press': {
          const key = action['key'];
          if (typeof key !== 'string' || !key.trim()) {
            return `Action at index ${i} (press) requires a "key" string (e.g. "Enter", "Tab").`;
          }
          actions.push({ type: 'press', key: key.trim() });
          break;
        }
        case 'wait': {
          const ms = action['milliseconds'];
          const selector = action['selector'];
          if (typeof ms === 'number' && ms > 0) {
            actions.push({ type: 'wait', milliseconds: Math.min(ms, 10_000) });
          } else if (typeof selector === 'string' && selector.trim()) {
            actions.push({ type: 'wait', selector: selector.trim() });
          } else {
            return `Action at index ${i} (wait) requires either "milliseconds" (number) or "selector" (string).`;
          }
          break;
        }
        case 'scroll': {
          const direction = action['direction'];
          if (direction !== 'up' && direction !== 'down') {
            return `Action at index ${i} (scroll) requires "direction" to be "up" or "down".`;
          }
          const scrollSelector = action['selector'];
          actions.push({
            type: 'scroll',
            direction,
            ...(typeof scrollSelector === 'string' && scrollSelector.trim()
              ? { selector: scrollSelector.trim() }
              : {}),
          });
          break;
        }
        case 'screenshot':
          actions.push({ type: 'screenshot' });
          break;
        case 'scrape':
          actions.push({ type: 'scrape' });
          break;
        default:
          return `Unknown action type: "${type}"`;
      }
    }

    return actions;
  }
}
