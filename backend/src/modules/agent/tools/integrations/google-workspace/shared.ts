import type { AgentToolCategory } from '@nxt1/core';
import type { McpToolCallResult, McpToolDefinition } from '../base-mcp-client.service.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';

export interface GoogleWorkspaceOAuthTokenDocument {
  readonly provider: 'google';
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly email?: string;
  readonly grantedScopes?: string;
  readonly lastRefreshedAt?: string;
}

type GoogleWorkspaceService = 'gmail' | 'calendar' | 'drive' | 'docs' | 'sheets' | 'slides';

export interface GoogleWorkspaceToolMetadata {
  readonly service: GoogleWorkspaceService;
  readonly isMutation: boolean;
  readonly summary: string;
}

export interface GoogleWorkspaceResolvedToolMetadata extends GoogleWorkspaceToolMetadata {
  readonly category: AgentToolCategory;
}

export interface GoogleWorkspaceDiscoveredToolDefinition
  extends McpToolDefinition, GoogleWorkspaceResolvedToolMetadata {
  readonly available: true;
}

/**
 * Metadata keyed by the **exact MCP tool name** exposed by the
 * google-workspace-mcp server (v1.27.0, 46 tools).
 * These keys must match what the server returns from `tools/list`.
 */
export const GOOGLE_WORKSPACE_TOOL_METADATA = {
  // ── Calendar (4) ────────────────────────────────────────────────────
  calendar_get_events: {
    service: 'calendar',
    isMutation: false,
    summary: 'Retrieve calendar events within a time range.',
  },
  calendar_get_event_details: {
    service: 'calendar',
    isMutation: false,
    summary: 'Get detailed information for a specific calendar event.',
  },
  create_calendar_event: {
    service: 'calendar',
    isMutation: true,
    summary: 'Create a new Google Calendar event.',
  },
  delete_calendar_event: {
    service: 'calendar',
    isMutation: true,
    summary: 'Delete a Google Calendar event.',
  },

  // ── Gmail (9) ───────────────────────────────────────────────────────
  query_gmail_emails: {
    service: 'gmail',
    isMutation: false,
    summary: 'Search Gmail emails with a search query.',
  },
  gmail_get_message_details: {
    service: 'gmail',
    isMutation: false,
    summary: 'Retrieve a complete Gmail message by ID.',
  },
  gmail_get_attachment_content: {
    service: 'gmail',
    isMutation: false,
    summary: 'Retrieve an attachment from a Gmail message.',
  },
  create_gmail_draft: {
    service: 'gmail',
    isMutation: true,
    summary: 'Create a draft email in Gmail.',
  },
  delete_gmail_draft: {
    service: 'gmail',
    isMutation: true,
    summary: 'Delete a Gmail draft by its draft ID.',
  },
  gmail_send_draft: {
    service: 'gmail',
    isMutation: true,
    summary: 'Send an existing Gmail draft.',
  },
  gmail_reply_to_email: {
    service: 'gmail',
    isMutation: true,
    summary: 'Reply to an existing email (send or save as draft).',
  },
  gmail_bulk_delete_messages: {
    service: 'gmail',
    isMutation: true,
    summary: 'Delete multiple Gmail messages at once.',
  },
  gmail_send_email: {
    service: 'gmail',
    isMutation: true,
    summary: 'Compose and send an email directly via Gmail.',
  },

  // ── Drive (6) ───────────────────────────────────────────────────────
  drive_search_files: {
    service: 'drive',
    isMutation: false,
    summary: 'Search for files in Google Drive.',
  },
  drive_read_file_content: {
    service: 'drive',
    isMutation: false,
    summary: 'Read the content of a Google Drive file.',
  },
  drive_upload_file: {
    service: 'drive',
    isMutation: true,
    summary: 'Upload a file to Google Drive.',
  },
  drive_create_folder: {
    service: 'drive',
    isMutation: true,
    summary: 'Create a new folder in Google Drive.',
  },
  drive_delete_file: {
    service: 'drive',
    isMutation: true,
    summary: 'Delete a file from Google Drive.',
  },
  drive_list_shared_drives: {
    service: 'drive',
    isMutation: false,
    summary: 'List shared drives accessible by the user.',
  },

  // ── Docs (8) ────────────────────────────────────────────────────────
  docs_create_document: {
    service: 'docs',
    isMutation: true,
    summary: 'Create a new Google Document.',
  },
  docs_get_document_metadata: {
    service: 'docs',
    isMutation: false,
    summary: 'Retrieve metadata for a Google Document.',
  },
  docs_get_content_as_markdown: {
    service: 'docs',
    isMutation: false,
    summary: 'Retrieve a Google Document as Markdown.',
  },
  docs_append_text: {
    service: 'docs',
    isMutation: true,
    summary: 'Append text to the end of a Google Document.',
  },
  docs_prepend_text: {
    service: 'docs',
    isMutation: true,
    summary: 'Prepend text to the beginning of a Google Document.',
  },
  docs_insert_text: {
    service: 'docs',
    isMutation: true,
    summary: 'Insert text at a specific location in a Google Document.',
  },
  docs_batch_update: {
    service: 'docs',
    isMutation: true,
    summary: 'Apply raw Google Docs API batch update requests.',
  },
  docs_insert_image: {
    service: 'docs',
    isMutation: true,
    summary: 'Insert an image into a Google Document from a URL.',
  },

  // ── Sheets (7) ──────────────────────────────────────────────────────
  sheets_create_spreadsheet: {
    service: 'sheets',
    isMutation: true,
    summary: 'Create a new Google Spreadsheet.',
  },
  sheets_read_range: {
    service: 'sheets',
    isMutation: false,
    summary: 'Read data from a range in a Google Spreadsheet.',
  },
  sheets_write_range: {
    service: 'sheets',
    isMutation: true,
    summary: 'Write data to a range in a Google Spreadsheet.',
  },
  sheets_append_rows: {
    service: 'sheets',
    isMutation: true,
    summary: 'Append rows of data to a Google Spreadsheet.',
  },
  sheets_clear_range: {
    service: 'sheets',
    isMutation: true,
    summary: 'Clear values from a range in a Google Spreadsheet.',
  },
  sheets_add_sheet: {
    service: 'sheets',
    isMutation: true,
    summary: 'Add a new sheet tab to a Google Spreadsheet.',
  },
  sheets_delete_sheet: {
    service: 'sheets',
    isMutation: true,
    summary: 'Delete a sheet tab from a Google Spreadsheet.',
  },

  // ── Slides (12) ─────────────────────────────────────────────────────
  get_presentation: {
    service: 'slides',
    isMutation: false,
    summary: 'Get a Google Slides presentation with metadata and content.',
  },
  get_slides: {
    service: 'slides',
    isMutation: false,
    summary: 'Retrieve all slides from a presentation.',
  },
  create_presentation: {
    service: 'slides',
    isMutation: true,
    summary: 'Create a new Google Slides presentation.',
  },
  create_slide: {
    service: 'slides',
    isMutation: true,
    summary: 'Add a new slide to a presentation.',
  },
  add_text_to_slide: {
    service: 'slides',
    isMutation: true,
    summary: 'Add text to a slide.',
  },
  add_formatted_text_to_slide: {
    service: 'slides',
    isMutation: true,
    summary: 'Add rich-formatted text to a slide.',
  },
  add_bulleted_list_to_slide: {
    service: 'slides',
    isMutation: true,
    summary: 'Add a bulleted list to a slide.',
  },
  add_table_to_slide: {
    service: 'slides',
    isMutation: true,
    summary: 'Add a table to a slide.',
  },
  add_slide_notes: {
    service: 'slides',
    isMutation: true,
    summary: 'Add presenter notes to a slide.',
  },
  duplicate_slide: {
    service: 'slides',
    isMutation: true,
    summary: 'Duplicate a slide in a presentation.',
  },
  delete_slide: {
    service: 'slides',
    isMutation: true,
    summary: 'Delete a slide from a presentation.',
  },
  create_presentation_from_markdown: {
    service: 'slides',
    isMutation: true,
    summary: 'Create a presentation from structured Markdown content.',
  },
} as const satisfies Record<string, GoogleWorkspaceToolMetadata>;

export const GOOGLE_WORKSPACE_ALLOWED_TOOL_NAMES = Object.freeze(
  Object.keys(GOOGLE_WORKSPACE_TOOL_METADATA)
) as readonly (keyof typeof GOOGLE_WORKSPACE_TOOL_METADATA)[];

export type GoogleWorkspaceAllowedToolName = string;

export const GOOGLE_WORKSPACE_ALLOWED_TOOL_NAME_SET = new Set<string>(
  GOOGLE_WORKSPACE_ALLOWED_TOOL_NAMES
);

const GOOGLE_WORKSPACE_DYNAMIC_BLOCKLIST = [/^debug_/i, /^generate_trigger_code$/i] as const;

const GOOGLE_WORKSPACE_DYNAMIC_CALENDAR_NAMES = new Set([
  'get_events',
  'manage_event',
  'list_calendars',
  'query_freebusy',
  'manage_focus_time',
  'manage_out_of_office',
]);

const GOOGLE_WORKSPACE_DYNAMIC_DRIVE_NAMES = new Set(['import_to_google_doc']);

const GOOGLE_WORKSPACE_DYNAMIC_DOC_NAMES = new Set([
  'find_and_replace_doc',
  'export_doc_to_pdf',
  'modify_doc_text',
  'inspect_doc_structure',
  'list_document_comments',
  'manage_document_comment',
]);

const GOOGLE_WORKSPACE_DYNAMIC_SHEETS_NAMES = new Set([
  'append_table_rows',
  'create_table_with_data',
]);

const GOOGLE_WORKSPACE_DYNAMIC_SLIDES_NAMES = new Set([
  'get_page',
  'get_page_thumbnail',
  'batch_update_presentation',
  'list_presentation_comments',
  'manage_presentation_comment',
  'set_publish_settings',
]);

const GOOGLE_WORKSPACE_MUTATION_PREFIX =
  /^(create_|draft_|send_|append_|modify_|update_|delete_|manage_|batch_update_|format_|resize_|copy_|insert_|set_|import_|duplicate_|add_)/;

const GOOGLE_WORKSPACE_MUTATION_NAMES = new Set(['find_and_replace_doc']);

function getGoogleWorkspaceCategory(service: GoogleWorkspaceService): AgentToolCategory {
  return service === 'gmail' || service === 'calendar' ? 'communication' : 'data';
}

function isBlockedGoogleWorkspaceToolName(name: string): boolean {
  return GOOGLE_WORKSPACE_DYNAMIC_BLOCKLIST.some((pattern) => pattern.test(name));
}

function inferGoogleWorkspaceService(name: string): GoogleWorkspaceService | null {
  if (isBlockedGoogleWorkspaceToolName(name)) return null;
  if (name in GOOGLE_WORKSPACE_TOOL_METADATA) {
    return GOOGLE_WORKSPACE_TOOL_METADATA[name as keyof typeof GOOGLE_WORKSPACE_TOOL_METADATA]
      .service;
  }
  if (name.includes('gmail')) return 'gmail';
  if (name.includes('drive') || GOOGLE_WORKSPACE_DYNAMIC_DRIVE_NAMES.has(name)) return 'drive';
  if (
    name.includes('presentation') ||
    name.includes('slide') ||
    GOOGLE_WORKSPACE_DYNAMIC_SLIDES_NAMES.has(name)
  ) {
    return 'slides';
  }
  if (
    name.includes('spreadsheet') ||
    name.includes('sheet') ||
    GOOGLE_WORKSPACE_DYNAMIC_SHEETS_NAMES.has(name)
  ) {
    return 'sheets';
  }
  if (
    name.includes('calendar') ||
    GOOGLE_WORKSPACE_DYNAMIC_CALENDAR_NAMES.has(name) ||
    /(^|_)(event|events)(_|$)/.test(name)
  ) {
    return 'calendar';
  }
  if (
    name.includes('doc') ||
    name.includes('document') ||
    GOOGLE_WORKSPACE_DYNAMIC_DOC_NAMES.has(name)
  ) {
    return 'docs';
  }
  return null;
}

function inferGoogleWorkspaceMutation(name: string): boolean {
  if (name in GOOGLE_WORKSPACE_TOOL_METADATA) {
    return GOOGLE_WORKSPACE_TOOL_METADATA[name as keyof typeof GOOGLE_WORKSPACE_TOOL_METADATA]
      .isMutation;
  }
  if (GOOGLE_WORKSPACE_MUTATION_NAMES.has(name)) return true;
  return GOOGLE_WORKSPACE_MUTATION_PREFIX.test(name);
}

function sanitizeGoogleWorkspaceInputSchema(
  inputSchema?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!inputSchema) return undefined;

  const nextSchema: Record<string, unknown> = { ...inputSchema };
  const rawProperties = nextSchema['properties'];
  if (rawProperties && typeof rawProperties === 'object' && !Array.isArray(rawProperties)) {
    const properties = { ...(rawProperties as Record<string, unknown>) };
    delete properties['user_google_email'];
    nextSchema['properties'] = properties;
  }

  if (Array.isArray(nextSchema['required'])) {
    nextSchema['required'] = (nextSchema['required'] as unknown[]).filter(
      (value): value is string => typeof value === 'string' && value !== 'user_google_email'
    );
  }

  return nextSchema;
}

function resolveGoogleWorkspaceToolMetadata(
  name: string,
  description?: string
): GoogleWorkspaceResolvedToolMetadata | null {
  const legacy =
    GOOGLE_WORKSPACE_TOOL_METADATA[name as keyof typeof GOOGLE_WORKSPACE_TOOL_METADATA];
  if (legacy) {
    return {
      ...legacy,
      category: getGoogleWorkspaceCategory(legacy.service),
    };
  }

  const service = inferGoogleWorkspaceService(name);
  if (!service) return null;

  return {
    service,
    isMutation: inferGoogleWorkspaceMutation(name),
    summary: description?.trim() || `Google ${service} tool: ${name}`,
    category: getGoogleWorkspaceCategory(service),
  };
}

export function isGoogleWorkspaceAllowedToolName(
  value: string
): value is GoogleWorkspaceAllowedToolName {
  return resolveGoogleWorkspaceToolMetadata(value) !== null;
}

export function isGoogleWorkspaceMutationTool(name: GoogleWorkspaceAllowedToolName): boolean {
  return getGoogleWorkspaceToolMetadata(name).isMutation;
}

export function getGoogleWorkspaceToolMetadata(
  name: GoogleWorkspaceAllowedToolName
): GoogleWorkspaceResolvedToolMetadata {
  const metadata = resolveGoogleWorkspaceToolMetadata(name);
  if (!metadata) {
    throw new AgentEngineError(
      'AGENT_VALIDATION_FAILED',
      `Unsupported Google Workspace tool: ${name}`,
      {
        metadata: { toolName: name },
      }
    );
  }
  return metadata;
}

export function extractGoogleWorkspacePayload(result: McpToolCallResult): unknown {
  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    return result.structuredContent;
  }

  const textBlocks = result.content
    .flatMap((content) => {
      if (content.type === 'text' && content.text) return [content.text];
      if (typeof content.data === 'string' && content.data.trim().length > 0) {
        return [content.data];
      }
      return [] as string[];
    })
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  if (textBlocks.length === 0) return null;

  const combined = textBlocks.join('\n');
  try {
    return JSON.parse(combined);
  } catch {
    return textBlocks.length === 1 ? textBlocks[0] : combined;
  }
}

export function extractGoogleWorkspaceErrorMessage(result: McpToolCallResult): string {
  const payload = extractGoogleWorkspacePayload(result);

  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload.trim();
  }

  if (payload && typeof payload === 'object') {
    const message =
      ('message' in payload && typeof payload.message === 'string' && payload.message.trim()) ||
      ('error' in payload && typeof payload.error === 'string' && payload.error.trim()) ||
      ('detail' in payload && typeof payload.detail === 'string' && payload.detail.trim());

    if (message) return message;
  }

  return 'Google Workspace MCP tool returned an error.';
}

export function truncateGoogleWorkspacePayload(data: unknown, maxChars = 50_000): unknown {
  if (typeof data === 'string') {
    return data.length <= maxChars
      ? data
      : `${data.slice(0, maxChars)}\n\n... [OUTPUT TRUNCATED — exceeds context limit]`;
  }

  const json = JSON.stringify(data, null, 2);
  if (json.length <= maxChars) return data;

  return {
    truncated: true,
    preview: `${json.slice(0, maxChars)}\n\n... [OUTPUT TRUNCATED — exceeds context limit]`,
  };
}

export function filterGoogleWorkspaceToolDefinitions(
  definitions: readonly McpToolDefinition[]
): ReadonlyArray<GoogleWorkspaceDiscoveredToolDefinition> {
  const seenNames = new Set<string>();

  return definitions.flatMap((definition) => {
    if (seenNames.has(definition.name)) return [];
    seenNames.add(definition.name);

    const metadata = resolveGoogleWorkspaceToolMetadata(definition.name, definition.description);
    if (!metadata) return [];

    const sanitizedSchema = sanitizeGoogleWorkspaceInputSchema(definition.inputSchema);

    return [
      {
        ...definition,
        ...(sanitizedSchema ? { inputSchema: sanitizedSchema } : {}),
        ...metadata,
        available: true as const,
      },
    ];
  });
}

export function describeAllowedGoogleWorkspaceTools(): string {
  return 'Google Workspace tools are discovered live from the MCP server at runtime. Use list_google_workspace_tools to inspect the current tool surface.';
}
