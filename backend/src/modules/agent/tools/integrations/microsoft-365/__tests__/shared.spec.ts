import { describe, expect, it } from 'vitest';
import {
  extractMicrosoft365ErrorMessage,
  extractMicrosoft365Payload,
  filterMicrosoft365ToolDefinitions,
  resolveMicrosoft365ToolMetadata,
  truncateMicrosoft365Payload,
} from '../shared.js';

describe('Microsoft 365 shared helpers', () => {
  it('filters dynamic tool definitions and infers metadata', () => {
    const result = filterMicrosoft365ToolDefinitions([
      {
        name: 'list-mail-messages',
        description: 'List outlook messages',
        inputSchema: { type: 'object' },
      },
      {
        name: 'send-mail-message',
        description: 'Send an outlook message',
      },
      {
        name: 'login',
        description: 'blocked auth helper',
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((tool) => tool.name)).toEqual(['list-mail-messages', 'send-mail-message']);
    expect(result[0]).toMatchObject({ service: 'mail', isMutation: false, available: true });
    expect(result[1]).toMatchObject({ service: 'mail', isMutation: true, available: true });
  });

  it('extracts structured payload first', () => {
    const payload = extractMicrosoft365Payload({
      content: [{ type: 'text', text: '{"ignored":true}' }],
      structuredContent: { ok: true, source: 'structured' },
    });

    expect(payload).toEqual({ ok: true, source: 'structured' });
  });

  it('parses text payload as json when possible', () => {
    const payload = extractMicrosoft365Payload({
      content: [{ type: 'text', text: '{"ok":true,"count":3}' }],
    });

    expect(payload).toEqual({ ok: true, count: 3 });
  });

  it('extracts readable error messages from tool payload', () => {
    const message = extractMicrosoft365ErrorMessage({
      isError: true,
      content: [{ type: 'text', text: '{"error":"Missing auth"}' }],
    });

    expect(message).toBe('Missing auth');
  });

  it('truncates oversized payloads', () => {
    const payload = truncateMicrosoft365Payload('a'.repeat(80), 20);
    expect(payload).toBe('aaaaaaaaaaaaaaaaaaaa\n\n... [OUTPUT TRUNCATED — exceeds context limit]');
  });

  it('resolves metadata for known catalog tools', () => {
    const tools = filterMicrosoft365ToolDefinitions([
      { name: 'list-calendar-events', description: 'List events' },
    ]);
    const metadata = resolveMicrosoft365ToolMetadata('list-calendar-events');
    expect(metadata).toMatchObject({ service: 'calendar', isMutation: false });
    expect(tools[0].service).toBe('calendar');
  });
});
