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
  it('filters remote tool definitions down to the supported Gmail send surface', () => {
    const result = filterGoogleWorkspaceToolDefinitions([
      {
        name: 'gmail_send_email',
        description: 'Send messages',
        inputSchema: { type: 'object' },
      },
      {
        name: 'query_gmail_emails',
        description: 'Unsupported for current scope set',
      },
      {
        name: 'docs_create_document',
        description: 'Create a doc',
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result.map((tool) => tool.name)).toEqual(['gmail_send_email']);
    expect(result[0]).toMatchObject({
      service: 'gmail',
      isMutation: true,
      available: true,
    });
  });

  it('recognizes the send-only Google Workspace tool name', () => {
    expect(isGoogleWorkspaceAllowedToolName('gmail_send_email')).toBe(true);
    expect(isGoogleWorkspaceAllowedToolName('query_gmail_emails')).toBe(false);
    expect(isGoogleWorkspaceAllowedToolName('get_events')).toBe(false);
    expect(isGoogleWorkspaceAllowedToolName('search_gmail_messages')).toBe(false);
    expect(isGoogleWorkspaceAllowedToolName('manage_gmail_filter')).toBe(false);
    expect(isGoogleWorkspaceAllowedToolName('search_contacts')).toBe(false);
    expect(GOOGLE_WORKSPACE_ALLOWED_TOOL_NAMES.includes('gmail_send_email')).toBe(true);
  });

  it('drops unsupported runtime-discovered schemas outside the send-only surface', () => {
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

    expect(result).toEqual([]);
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
