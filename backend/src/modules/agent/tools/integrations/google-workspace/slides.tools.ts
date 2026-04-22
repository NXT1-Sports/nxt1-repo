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
import { z } from 'zod';

const EmptySlidesInputSchema = z.object({}).strict();
const PresentationIdSchema = z.object({ presentation_id: z.string().trim().min(1) });
const CreatePresentationInputSchema = z.object({ title: z.string().trim().min(1) });
const CreateSlideInputSchema = z.object({
  presentation_id: z.string().trim().min(1),
  insertion_index: z.coerce.number().int().optional(),
  predefined_layout: z.string().trim().min(1).optional(),
});
const SlideTextBoxInputSchema = z.object({
  presentation_id: z.string().trim().min(1),
  slide_id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  x: z.coerce.number().optional(),
  y: z.coerce.number().optional(),
  width: z.coerce.number().optional(),
  height: z.coerce.number().optional(),
});
const AddFormattedTextToSlideInputSchema = SlideTextBoxInputSchema.extend({
  font_size: z.coerce.number().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: z.string().trim().min(1).optional(),
  alignment: z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED']).optional(),
});
const AddBulletedListToSlideInputSchema = z.object({
  presentation_id: z.string().trim().min(1),
  slide_id: z.string().trim().min(1),
  items: z.array(z.string().trim().min(1)).min(1),
  x: z.coerce.number().optional(),
  y: z.coerce.number().optional(),
  width: z.coerce.number().optional(),
  height: z.coerce.number().optional(),
});
const AddTableToSlideInputSchema = z.object({
  presentation_id: z.string().trim().min(1),
  slide_id: z.string().trim().min(1),
  rows: z.coerce.number().int(),
  columns: z.coerce.number().int(),
  data: z.array(z.array(z.string())).optional(),
  x: z.coerce.number().optional(),
  y: z.coerce.number().optional(),
  width: z.coerce.number().optional(),
  height: z.coerce.number().optional(),
});
const AddSlideNotesInputSchema = z.object({
  presentation_id: z.string().trim().min(1),
  slide_id: z.string().trim().min(1),
  notes: z.string().trim().min(1),
});
const SlideByIdInputSchema = z.object({
  presentation_id: z.string().trim().min(1),
  slide_id: z.string().trim().min(1),
});
const CreatePresentationFromMarkdownInputSchema = z.object({
  title: z.string().trim().min(1),
  markdown: z.string().trim().min(1),
});

// ─── get_presentation ────────────────────────────────────────────────────────

export class GetPresentationTool extends GoogleWorkspaceBaseTool {
  readonly name = 'get_presentation';
  readonly mcpToolName = 'get_presentation' as const;
  readonly description =
    'Retrieve metadata and summary for a Google Slides presentation by its ID.';
  readonly isMutation = false;
  readonly category = 'data' as const;

  readonly parameters = PresentationIdSchema;

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

  readonly parameters = PresentationIdSchema;

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

  readonly parameters = CreatePresentationInputSchema;

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

  readonly parameters = CreateSlideInputSchema;

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

  readonly parameters = SlideTextBoxInputSchema;

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

  readonly parameters = AddFormattedTextToSlideInputSchema;

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

  readonly parameters = AddBulletedListToSlideInputSchema;

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

  readonly parameters = AddTableToSlideInputSchema;

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

  readonly parameters = AddSlideNotesInputSchema;

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

  readonly parameters = SlideByIdInputSchema;

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

  readonly parameters = SlideByIdInputSchema;

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

  readonly parameters = CreatePresentationFromMarkdownInputSchema;

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
    readonly parameters = EmptySlidesInputSchema;
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
