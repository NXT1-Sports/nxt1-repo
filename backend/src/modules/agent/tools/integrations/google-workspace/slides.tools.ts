/**
 * @fileoverview Google Slides First-Class Agent X Tools
 * @module @nxt1/backend/modules/agent/tools/integrations/google-workspace
 *
 * Twelve Slides tools matching google-workspace-mcp v1.27.0:
 * get_presentation, get_slides, create_presentation, create_slide,
 * add_text_to_slide, add_formatted_text_to_slide, add_bulleted_list_to_slide,
 * add_table_to_slide, add_slide_notes, duplicate_slide, delete_slide,
 * create_presentation_from_markdown.
 */

import type { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';
import { GoogleWorkspaceBaseTool } from './google-workspace-base.tool.js';

// ─── get_presentation ────────────────────────────────────────────────────────

export class GetPresentationTool extends GoogleWorkspaceBaseTool {
  readonly name = 'get_presentation';
  readonly mcpToolName = 'get_presentation' as const;
  readonly description =
    'Retrieve metadata and summary for a Google Slides presentation by its ID.';
  readonly isMutation = false;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      presentation_id: { type: 'string', description: 'The Google Slides presentation ID.' },
    },
    required: ['presentation_id'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── get_slides ──────────────────────────────────────────────────────────────

export class GetSlidesTool extends GoogleWorkspaceBaseTool {
  readonly name = 'get_slides';
  readonly mcpToolName = 'get_slides' as const;
  readonly description = 'Retrieve all slides and their content from a Google Slides presentation.';
  readonly isMutation = false;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      presentation_id: { type: 'string', description: 'The Google Slides presentation ID.' },
    },
    required: ['presentation_id'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── create_presentation ─────────────────────────────────────────────────────

export class CreatePresentationTool extends GoogleWorkspaceBaseTool {
  readonly name = 'create_presentation';
  readonly mcpToolName = 'create_presentation' as const;
  readonly description = 'Create a new, empty Google Slides presentation with a specified title.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title of the new presentation.' },
    },
    required: ['title'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── create_slide ────────────────────────────────────────────────────────────

export class CreateSlideTool extends GoogleWorkspaceBaseTool {
  readonly name = 'create_slide';
  readonly mcpToolName = 'create_slide' as const;
  readonly description = 'Add a new blank or templated slide to an existing presentation.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      presentation_id: { type: 'string', description: 'The Google Slides presentation ID.' },
      insertion_index: {
        type: 'number',
        description: 'Zero-based position to insert the slide. Defaults to end.',
      },
      predefined_layout: {
        type: 'string',
        description: 'Optional predefined layout name, e.g. BLANK, TITLE, TITLE_AND_BODY, etc.',
      },
    },
    required: ['presentation_id'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── add_text_to_slide ───────────────────────────────────────────────────────

export class AddTextToSlideTool extends GoogleWorkspaceBaseTool {
  readonly name = 'add_text_to_slide';
  readonly mcpToolName = 'add_text_to_slide' as const;
  readonly description = 'Add a plain text box to a specific slide in a presentation.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      presentation_id: { type: 'string', description: 'The Google Slides presentation ID.' },
      slide_id: { type: 'string', description: 'The ID of the slide to add text to.' },
      text: { type: 'string', description: 'Text to add.' },
      x: { type: 'number', description: 'Horizontal position in points from left edge.' },
      y: { type: 'number', description: 'Vertical position in points from top edge.' },
      width: { type: 'number', description: 'Width of the text box in points.' },
      height: { type: 'number', description: 'Height of the text box in points.' },
    },
    required: ['presentation_id', 'slide_id', 'text'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── add_formatted_text_to_slide ─────────────────────────────────────────────

export class AddFormattedTextToSlideTool extends GoogleWorkspaceBaseTool {
  readonly name = 'add_formatted_text_to_slide';
  readonly mcpToolName = 'add_formatted_text_to_slide' as const;
  readonly description =
    'Add a formatted text box to a slide with font size, bold, italic, color, and alignment options.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      presentation_id: { type: 'string', description: 'The Google Slides presentation ID.' },
      slide_id: { type: 'string', description: 'The ID of the target slide.' },
      text: { type: 'string', description: 'Text to add.' },
      x: { type: 'number', description: 'Horizontal position in points.' },
      y: { type: 'number', description: 'Vertical position in points.' },
      width: { type: 'number', description: 'Width in points.' },
      height: { type: 'number', description: 'Height in points.' },
      font_size: { type: 'number', description: 'Font size in points.' },
      bold: { type: 'boolean', description: 'Whether to bold the text.' },
      italic: { type: 'boolean', description: 'Whether to italicize the text.' },
      color: {
        type: 'string',
        description: 'Hex color string (e.g. #FF0000) or named color.',
      },
      alignment: {
        type: 'string',
        enum: ['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'],
        description: 'Text alignment.',
      },
    },
    required: ['presentation_id', 'slide_id', 'text'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── add_bulleted_list_to_slide ──────────────────────────────────────────────

export class AddBulletedListToSlideTool extends GoogleWorkspaceBaseTool {
  readonly name = 'add_bulleted_list_to_slide';
  readonly mcpToolName = 'add_bulleted_list_to_slide' as const;
  readonly description = 'Add a bulleted list to a slide from an array of strings.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      presentation_id: { type: 'string', description: 'The Google Slides presentation ID.' },
      slide_id: { type: 'string', description: 'The ID of the target slide.' },
      items: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of bullet point strings.',
      },
      x: { type: 'number', description: 'Horizontal position in points.' },
      y: { type: 'number', description: 'Vertical position in points.' },
      width: { type: 'number', description: 'Width in points.' },
      height: { type: 'number', description: 'Height in points.' },
    },
    required: ['presentation_id', 'slide_id', 'items'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── add_table_to_slide ──────────────────────────────────────────────────────

export class AddTableToSlideTool extends GoogleWorkspaceBaseTool {
  readonly name = 'add_table_to_slide';
  readonly mcpToolName = 'add_table_to_slide' as const;
  readonly description = 'Add a table to a slide with specified rows and columns.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      presentation_id: { type: 'string', description: 'The Google Slides presentation ID.' },
      slide_id: { type: 'string', description: 'The ID of the target slide.' },
      rows: { type: 'number', description: 'Number of rows in the table.' },
      columns: { type: 'number', description: 'Number of columns in the table.' },
      data: {
        type: 'array',
        items: { type: 'array', items: { type: 'string' } },
        description: '2D array of string cell values (rows x columns).',
      },
      x: { type: 'number', description: 'Horizontal position in points.' },
      y: { type: 'number', description: 'Vertical position in points.' },
      width: { type: 'number', description: 'Width in points.' },
      height: { type: 'number', description: 'Height in points.' },
    },
    required: ['presentation_id', 'slide_id', 'rows', 'columns'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── add_slide_notes ─────────────────────────────────────────────────────────

export class AddSlideNotesTool extends GoogleWorkspaceBaseTool {
  readonly name = 'add_slide_notes';
  readonly mcpToolName = 'add_slide_notes' as const;
  readonly description = 'Add or replace speaker notes for a specific slide.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      presentation_id: { type: 'string', description: 'The Google Slides presentation ID.' },
      slide_id: { type: 'string', description: 'The ID of the target slide.' },
      notes: { type: 'string', description: 'Speaker notes text to set.' },
    },
    required: ['presentation_id', 'slide_id', 'notes'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── duplicate_slide ─────────────────────────────────────────────────────────

export class DuplicateSlideTool extends GoogleWorkspaceBaseTool {
  readonly name = 'duplicate_slide';
  readonly mcpToolName = 'duplicate_slide' as const;
  readonly description = 'Duplicate an existing slide within a presentation.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      presentation_id: { type: 'string', description: 'The Google Slides presentation ID.' },
      slide_id: { type: 'string', description: 'The ID of the slide to duplicate.' },
    },
    required: ['presentation_id', 'slide_id'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── delete_slide ────────────────────────────────────────────────────────────

export class DeleteSlideTool extends GoogleWorkspaceBaseTool {
  readonly name = 'delete_slide';
  readonly mcpToolName = 'delete_slide' as const;
  readonly description = 'Delete a specific slide from a presentation.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      presentation_id: { type: 'string', description: 'The Google Slides presentation ID.' },
      slide_id: { type: 'string', description: 'The ID of the slide to delete.' },
    },
    required: ['presentation_id', 'slide_id'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── create_presentation_from_markdown ───────────────────────────────────────

export class CreatePresentationFromMarkdownTool extends GoogleWorkspaceBaseTool {
  readonly name = 'create_presentation_from_markdown';
  readonly mcpToolName = 'create_presentation_from_markdown' as const;
  readonly description =
    'Create a complete Google Slides presentation from Markdown text. ' +
    'Use --- separators to denote slide boundaries. ' +
    'Headings become slide titles; body text becomes content.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title for the new presentation.' },
      markdown: {
        type: 'string',
        description:
          'Markdown content. Use --- to separate slides. Heading 1 (#) becomes slide title.',
      },
    },
    required: ['title', 'markdown'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── Backwards-compat aliases ────────────────────────────────────────────────
/** @deprecated Use GetSlidesTool */
export const GetSlidPageTool = GetSlidesTool;

// Removed tools — stub with helpful error
function makeRemovedSlidesTool(
  oldName: string,
  replacement: string
): new (s: GoogleWorkspaceMcpSessionService) => GoogleWorkspaceBaseTool {
  return class extends GoogleWorkspaceBaseTool {
    readonly name = oldName;
    readonly mcpToolName = 'get_presentation' as const;
    readonly description = `[REMOVED] ${oldName} use ${replacement} instead.`;
    readonly isMutation = false;
    readonly category = 'data' as const;
    readonly parameters = { type: 'object' as const, properties: {} };
    override async execute(): Promise<{ success: false; error: string }> {
      return {
        success: false,
        error: `"${oldName}" has been removed. Use "${replacement}" instead.`,
      };
    }
  };
}

export const GetPageThumbnailTool = makeRemovedSlidesTool('get_page_thumbnail', 'get_slides');
export const BatchUpdatePresentationTool = makeRemovedSlidesTool(
  'batch_update_presentation',
  'add_text_to_slide'
);
