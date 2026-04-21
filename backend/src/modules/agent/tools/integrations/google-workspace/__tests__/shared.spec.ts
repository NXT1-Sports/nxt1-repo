import { describe, expect, it } from 'vitest';
import {
  extractGoogleWorkspaceErrorMessage,
  extractGoogleWorkspacePayload,
  filterGoogleWorkspaceToolDefinitions,
  GOOGLE_WORKSPACE_ALLOWED_TOOL_NAMES,
  isGoogleWorkspaceAllowedToolName,
  truncateGoogleWorkspacePayload,
} from '../shared.js';

describe('Google Workspace shared helpers', () => {
  it('filters remote tool definitions down to supported Google Workspace services', () => {
    const result = filterGoogleWorkspaceToolDefinitions([
      {
        name: 'query_gmail_emails',
        description: 'Search messages',
        inputSchema: { type: 'object' },
      },
      {
        name: 'manage_gmail_filter',
        description: 'Unsupported for current scope set',
      },
      {
        name: 'docs_create_document',
        description: 'Create a doc',
      },
    ]);

    expect(result).toHaveLength(3);
    expect(result.map((tool) => tool.name)).toEqual([
      'query_gmail_emails',
      'manage_gmail_filter',
      'docs_create_document',
    ]);
    expect(result[0]).toMatchObject({
      service: 'gmail',
      isMutation: false,
      available: true,
    });
    expect(result[1]).toMatchObject({
      service: 'gmail',
      isMutation: true,
      available: true,
    });
    expect(result[2]).toMatchObject({
      service: 'docs',
      isMutation: true,
      available: true,
    });
  });

  it('recognizes allowed tool names only', () => {
    expect(isGoogleWorkspaceAllowedToolName('query_gmail_emails')).toBe(true);
    expect(isGoogleWorkspaceAllowedToolName('get_events')).toBe(true);
    expect(isGoogleWorkspaceAllowedToolName('search_gmail_messages')).toBe(true);
    expect(isGoogleWorkspaceAllowedToolName('manage_gmail_filter')).toBe(true);
    expect(isGoogleWorkspaceAllowedToolName('search_contacts')).toBe(false);
    expect(GOOGLE_WORKSPACE_ALLOWED_TOOL_NAMES.includes('create_presentation')).toBe(true);
  });

  it('sanitizes runtime-discovered schemas and keeps current MCP names', () => {
    const result = filterGoogleWorkspaceToolDefinitions([
      {
        name: 'get_events',
        description: 'Get calendar events',
        inputSchema: {
          type: 'object',
          properties: {
            user_google_email: { type: 'string' },
            calendar_id: { type: 'string' },
          },
          required: ['user_google_email', 'calendar_id'],
        },
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'get_events',
      service: 'calendar',
      isMutation: false,
      available: true,
    });
    expect(result[0].inputSchema).toEqual({
      type: 'object',
      properties: {
        calendar_id: { type: 'string' },
      },
      required: ['calendar_id'],
    });
  });

  it('extracts structured content first from MCP results', () => {
    const payload = extractGoogleWorkspacePayload({
      content: [{ type: 'text', text: '{"ignored":true}' }],
      structuredContent: { ok: true, source: 'structured' },
    });

    expect(payload).toEqual({ ok: true, source: 'structured' });
  });

  it('parses JSON text payloads when structured content is absent', () => {
    const payload = extractGoogleWorkspacePayload({
      content: [{ type: 'text', text: '{"ok":true,"count":2}' }],
    });

    expect(payload).toEqual({ ok: true, count: 2 });
  });

  it('extracts readable error messages from MCP error payloads', () => {
    const message = extractGoogleWorkspaceErrorMessage({
      isError: true,
      content: [{ type: 'text', text: '{"error":"Missing Google credentials"}' }],
    });

    expect(message).toBe('Missing Google credentials');
  });

  it('truncates oversized string payloads for agent-safe responses', () => {
    const longText = 'a'.repeat(60);
    const payload = truncateGoogleWorkspacePayload(longText, 20);

    expect(payload).toBe('aaaaaaaaaaaaaaaaaaaa\n\n... [OUTPUT TRUNCATED — exceeds context limit]');
  });
});
