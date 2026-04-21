/**
 * @fileoverview Tests for first-class Google Workspace Agent X tools
 * @module @nxt1/backend/modules/agent/tools/integrations/google-workspace
 *
 * Validates that every first-class tool:
 * 1. Has the correct mcpToolName matching the allowlist
 * 2. Delegates execution to the session service
 * 3. Returns structured results on success
 * 4. Returns error results on failure
 * 5. Requires authenticated user context
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../base.tool.js';

// Gmail
import {
  QueryGmailEmailsTool,
  GmailGetMessageDetailsTool,
  GmailSendEmailTool,
  CreateGmailDraftTool,
  GmailReplyToEmailTool,
} from '../gmail.tools.js';

// Calendar
import {
  GetCalendarEventsTool,
  GetCalendarEventDetailsTool,
  CreateCalendarEventTool,
  DeleteCalendarEventTool,
} from '../calendar.tools.js';

// Drive
import {
  DriveSearchFilesTool,
  DriveReadFileContentTool,
  DriveUploadFileTool,
  DriveCreateFolderTool,
  DriveDeleteFileTool,
  DriveListSharedDrivesTool,
} from '../drive.tools.js';

// Docs
import {
  DocsCreateDocumentTool,
  DocsGetDocumentMetadataTool,
  DocsGetContentAsMarkdownTool,
  DocsAppendTextTool,
  DocsPrependTextTool,
  DocsInsertTextTool,
  DocsBatchUpdateTool,
  DocsInsertImageTool,
} from '../docs.tools.js';

// Sheets
import {
  SheetsCreateSpreadsheetTool,
  SheetsReadRangeTool,
  SheetsWriteRangeTool,
  SheetsAppendRowsTool,
  SheetsClearRangeTool,
  SheetsAddSheetTool,
  SheetsDeleteSheetTool,
} from '../sheets.tools.js';

// Slides
import {
  GetPresentationTool,
  GetSlidesTool,
  CreatePresentationTool,
  CreateSlideTool,
  AddTextToSlideTool,
  AddFormattedTextToSlideTool,
  AddBulletedListToSlideTool,
  AddTableToSlideTool,
  AddSlideNotesTool,
  DuplicateSlideTool,
  DeleteSlideTool,
  CreatePresentationFromMarkdownTool,
} from '../slides.tools.js';

import {
  GOOGLE_WORKSPACE_ALLOWED_TOOL_NAME_SET,
  GOOGLE_WORKSPACE_TOOL_METADATA,
} from '../shared.js';

// ─── Mock session service ───────────────────────────────────────────────────

function createMockSessionService() {
  return {
    executeAllowedTool: vi.fn().mockResolvedValue({ status: 'ok' }),
    listAllowedTools: vi.fn().mockResolvedValue([]),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

function createTestContext(overrides?: Partial<ToolExecutionContext>): ToolExecutionContext {
  return {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    environment: 'staging',
    onProgress: vi.fn(),
    ...overrides,
  };
}

// ─── Collect all tool classes ───────────────────────────────────────────────

const TOOL_CLASSES = [
  // Gmail
  QueryGmailEmailsTool,
  GmailGetMessageDetailsTool,
  GmailSendEmailTool,
  CreateGmailDraftTool,
  GmailReplyToEmailTool,
  // Calendar
  GetCalendarEventsTool,
  GetCalendarEventDetailsTool,
  CreateCalendarEventTool,
  DeleteCalendarEventTool,
  // Drive
  DriveSearchFilesTool,
  DriveReadFileContentTool,
  DriveUploadFileTool,
  DriveCreateFolderTool,
  DriveDeleteFileTool,
  DriveListSharedDrivesTool,
  // Docs
  DocsCreateDocumentTool,
  DocsGetDocumentMetadataTool,
  DocsGetContentAsMarkdownTool,
  DocsAppendTextTool,
  DocsPrependTextTool,
  DocsInsertTextTool,
  DocsBatchUpdateTool,
  DocsInsertImageTool,
  // Sheets
  SheetsCreateSpreadsheetTool,
  SheetsReadRangeTool,
  SheetsWriteRangeTool,
  SheetsAppendRowsTool,
  SheetsClearRangeTool,
  SheetsAddSheetTool,
  SheetsDeleteSheetTool,
  // Slides
  GetPresentationTool,
  GetSlidesTool,
  CreatePresentationTool,
  CreateSlideTool,
  AddTextToSlideTool,
  AddFormattedTextToSlideTool,
  AddBulletedListToSlideTool,
  AddTableToSlideTool,
  AddSlideNotesTool,
  DuplicateSlideTool,
  DeleteSlideTool,
  CreatePresentationFromMarkdownTool,
] as const;

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('First-class Google Workspace tools', () => {
  let mockSession: ReturnType<typeof createMockSessionService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = createMockSessionService();
  });

  it('registers exactly 42 first-class tools', () => {
    expect(TOOL_CLASSES).toHaveLength(42);
  });

  it('every tool has an mcpToolName in the allowed set', () => {
    for (const ToolClass of TOOL_CLASSES) {
      const tool = new ToolClass(mockSession as never);
      expect(
        GOOGLE_WORKSPACE_ALLOWED_TOOL_NAME_SET.has(tool.mcpToolName),
        `${tool.name} has mcpToolName "${tool.mcpToolName}" which is not in the allowed set`
      ).toBe(true);
    }
  });

  it('every tool has a unique Agent X name', () => {
    const names = TOOL_CLASSES.map((C) => new C(mockSession as never).name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every tool has a non-empty description', () => {
    for (const ToolClass of TOOL_CLASSES) {
      const tool = new ToolClass(mockSession as never);
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it('every tool has a valid category', () => {
    const validCategories = new Set(['communication', 'data']);
    for (const ToolClass of TOOL_CLASSES) {
      const tool = new ToolClass(mockSession as never);
      expect(
        validCategories.has(tool.category),
        `${tool.name} has invalid category "${tool.category}"`
      ).toBe(true);
    }
  });

  it('returns error when no user context is provided', async () => {
    const tool = new QueryGmailEmailsTool(mockSession as never);
    const result = await tool.execute({ query: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Authenticated user context');
  });

  it('delegates to sessionService.executeAllowedTool on success', async () => {
    const tool = new QueryGmailEmailsTool(mockSession as never);
    const ctx = createTestContext();
    mockSession.executeAllowedTool.mockResolvedValueOnce({ messages: ['msg1'] });

    const result = await tool.execute({ query: 'from:coach@edu' }, ctx);

    expect(result.success).toBe(true);
    expect(mockSession.executeAllowedTool).toHaveBeenCalledWith(
      'query_gmail_emails',
      { query: 'from:coach@edu' },
      ctx
    );
  });

  it('returns error result when sessionService throws', async () => {
    const tool = new GmailSendEmailTool(mockSession as never);
    const ctx = createTestContext();
    mockSession.executeAllowedTool.mockRejectedValueOnce(new Error('Token expired'));

    const result = await tool.execute({ to: ['a@b.com'], subject: 'Hi', body: 'Hello' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Token expired');
  });

  it('reports progress with service name for read tools', async () => {
    const tool = new GetCalendarEventsTool(mockSession as never);
    const ctx = createTestContext();
    await tool.execute(
      {
        time_min: '2026-04-01T00:00:00Z',
        time_max: '2026-04-30T23:59:59Z',
      },
      ctx
    );
    expect(ctx.onProgress).toHaveBeenCalledWith('Reading from Google calendar…');
  });

  it('reports progress with service name for mutation tools', async () => {
    const tool = new CreateCalendarEventTool(mockSession as never);
    const ctx = createTestContext();
    await tool.execute(
      {
        summary: 'Test',
        start_time: '2026-04-20T10:00:00Z',
        end_time: '2026-04-20T11:00:00Z',
      },
      ctx
    );
    expect(ctx.onProgress).toHaveBeenCalledWith('Executing Google calendar action…');
  });

  it('mutation flag matches the metadata for all tools', () => {
    for (const ToolClass of TOOL_CLASSES) {
      const tool = new ToolClass(mockSession as never);
      const meta = GOOGLE_WORKSPACE_TOOL_METADATA[tool.mcpToolName];
      expect(
        tool.isMutation,
        `${tool.name}: isMutation=${tool.isMutation} but metadata says ${meta.isMutation}`
      ).toBe(meta.isMutation);
    }
  });
});
