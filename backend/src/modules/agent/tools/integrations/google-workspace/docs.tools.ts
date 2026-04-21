/**
 * @fileoverview Google Docs First-Class Agent X Tools
 * @module @nxt1/backend/modules/agent/tools/integrations/google-workspace
 *
 * Eight Docs tools matching google-workspace-mcp v1.27.0:
 * docs_create_document, docs_get_document_metadata, docs_get_content_as_markdown,
 * docs_append_text, docs_prepend_text, docs_insert_text, docs_batch_update, docs_insert_image.
 */

import type { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';
import { GoogleWorkspaceBaseTool } from './google-workspace-base.tool.js';

// ─── docs_create_document ────────────────────────────────────────────────────

export class DocsCreateDocumentTool extends GoogleWorkspaceBaseTool {
  readonly name = 'docs_create_document';
  readonly mcpToolName = 'docs_create_document' as const;
  readonly description = 'Create a new Google Document with a specified title.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title of the new document.',
      },
    },
    required: ['title'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── docs_get_document_metadata ─────────────────────────────────────────────

export class DocsGetDocumentMetadataTool extends GoogleWorkspaceBaseTool {
  readonly name = 'docs_get_document_metadata';
  readonly mcpToolName = 'docs_get_document_metadata' as const;
  readonly description =
    'Retrieve metadata (title and ID) for a Google Document by its document ID.';
  readonly isMutation = false;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'The Google Doc ID.',
      },
    },
    required: ['document_id'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── docs_get_content_as_markdown ────────────────────────────────────────────

export class DocsGetContentAsMarkdownTool extends GoogleWorkspaceBaseTool {
  readonly name = 'docs_get_content_as_markdown';
  readonly mcpToolName = 'docs_get_content_as_markdown' as const;
  readonly description =
    'Retrieve the content of a Google Document and convert it to Markdown. ' +
    'Preserves basic formatting like headings, bold, italic, and lists.';
  readonly isMutation = false;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'The Google Doc ID.',
      },
    },
    required: ['document_id'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── docs_append_text ───────────────────────────────────────────────────────

export class DocsAppendTextTool extends GoogleWorkspaceBaseTool {
  readonly name = 'docs_append_text';
  readonly mcpToolName = 'docs_append_text' as const;
  readonly description = 'Append text to the end of a specified Google Document.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'The Google Doc ID.',
      },
      text: {
        type: 'string',
        description: 'Text to append to the document.',
      },
      ensure_newline: {
        type: 'boolean',
        description: 'Ensure appended text starts on a new line. Defaults to true.',
      },
    },
    required: ['document_id', 'text'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── docs_prepend_text ──────────────────────────────────────────────────────

export class DocsPrependTextTool extends GoogleWorkspaceBaseTool {
  readonly name = 'docs_prepend_text';
  readonly mcpToolName = 'docs_prepend_text' as const;
  readonly description = 'Prepend text to the beginning of a specified Google Document.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'The Google Doc ID.',
      },
      text: {
        type: 'string',
        description: 'Text to prepend to the document.',
      },
      ensure_newline: {
        type: 'boolean',
        description: 'Ensure text ends with a newline. Defaults to true.',
      },
    },
    required: ['document_id', 'text'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── docs_insert_text ───────────────────────────────────────────────────────

export class DocsInsertTextTool extends GoogleWorkspaceBaseTool {
  readonly name = 'docs_insert_text';
  readonly mcpToolName = 'docs_insert_text' as const;
  readonly description =
    'Insert text at a specific index in a Google Document. ' +
    'For simple appends or prepends, prefer docs_append_text or docs_prepend_text.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'The Google Doc ID.',
      },
      text: {
        type: 'string',
        description: 'Text to insert.',
      },
      index: {
        type: 'number',
        description: 'Character index position where text will be inserted (1-based).',
      },
      segment_id: {
        type: 'string',
        description: 'Optional segment ID for headers/footers.',
      },
    },
    required: ['document_id', 'text'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── docs_batch_update ──────────────────────────────────────────────────────

export class DocsBatchUpdateTool extends GoogleWorkspaceBaseTool {
  readonly name = 'docs_batch_update';
  readonly mcpToolName = 'docs_batch_update' as const;
  readonly description =
    'Apply a list of raw Google Docs API update requests to a document. ' +
    'For advanced users familiar with the Docs API request structure.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'The Google Doc ID.',
      },
      requests: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array of Google Docs API batchUpdate request objects.',
      },
    },
    required: ['document_id', 'requests'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── docs_insert_image ──────────────────────────────────────────────────────

export class DocsInsertImageTool extends GoogleWorkspaceBaseTool {
  readonly name = 'docs_insert_image';
  readonly mcpToolName = 'docs_insert_image' as const;
  readonly description = 'Insert an image into a Google Document from a URL at a specific index.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'The Google Doc ID.',
      },
      image_url: {
        type: 'string',
        description: 'Public URL of the image to insert.',
      },
      index: {
        type: 'number',
        description: 'Character index position where image will be inserted.',
      },
      width: {
        type: 'number',
        description: 'Optional image width in points.',
      },
      height: {
        type: 'number',
        description: 'Optional image height in points.',
      },
    },
    required: ['document_id', 'image_url', 'index'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── Backwards-compat aliases ────────────────────────────────────────────────
/** @deprecated Use DocsGetContentAsMarkdownTool */
export const GetDocContentTool = DocsGetContentAsMarkdownTool;
/** @deprecated Use DocsGetContentAsMarkdownTool */
export const GetDocAsMarkdownTool = DocsGetContentAsMarkdownTool;
/** @deprecated Use DocsCreateDocumentTool */
export const CreateDocTool = DocsCreateDocumentTool;
/** @deprecated Use DocsAppendTextTool */
export const ModifyDocTextTool = DocsAppendTextTool;

// Removed tools — stub with helpful error
function makeRemovedDocTool(oldName: string, replacement: string): typeof GoogleWorkspaceBaseTool {
  return class extends GoogleWorkspaceBaseTool {
    readonly name = oldName;
    readonly mcpToolName = 'docs_get_document_metadata' as const;
    readonly description = `[REMOVED] ${oldName} — use ${replacement} instead.`;
    readonly isMutation = false;
    readonly category = 'data' as const;
    readonly parameters = { type: 'object' as const, properties: {} };
    override async execute(): Promise<{ success: false; error: string }> {
      return {
        success: false,
        error: `"${oldName}" has been removed. Use "${replacement}" instead.`,
      };
    }
  } as unknown as typeof GoogleWorkspaceBaseTool;
}

export const SearchDocsTool = makeRemovedDocTool('search_docs', 'drive_search_files');
export const ExportDocToPdfTool = makeRemovedDocTool(
  'export_doc_to_pdf',
  'docs_get_content_as_markdown'
);
