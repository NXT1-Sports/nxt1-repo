/**
 * @fileoverview Google Calendar First-Class Agent X Tools
 * @module @nxt1/backend/modules/agent/tools/integrations/google-workspace
 *
 * Four Calendar tools matching google-workspace-mcp v1.27.0:
 * calendar_get_events, calendar_get_event_details, create_calendar_event, delete_calendar_event.
 */

import type { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';
import { GoogleWorkspaceBaseTool } from './google-workspace-base.tool.js';
import { z } from 'zod';

const EmptyCalendarInputSchema = z.object({}).strict();
const CalendarGetEventsInputSchema = z.object({
  time_min: z.string().trim().min(1),
  time_max: z.string().trim().min(1),
  calendar_id: z.string().trim().min(1).optional(),
  max_results: z.coerce.number().int().optional(),
  show_deleted: z.boolean().optional(),
});
const CalendarGetEventDetailsInputSchema = z.object({
  event_id: z.string().trim().min(1),
  calendar_id: z.string().trim().min(1).optional(),
});
const CreateCalendarEventInputSchema = z.object({
  summary: z.string().trim().min(1),
  start_time: z.string().trim().min(1),
  end_time: z.string().trim().min(1),
  calendar_id: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  attendees: z.array(z.string().trim().min(1)).optional(),
  send_notifications: z.boolean().optional(),
  timezone: z.string().trim().min(1).optional(),
});
const DeleteCalendarEventInputSchema = z.object({
  event_id: z.string().trim().min(1),
  calendar_id: z.string().trim().min(1).optional(),
  send_notifications: z.boolean().optional(),
});

// ─── calendar_get_events ────────────────────────────────────────────────────

export class GetCalendarEventsTool extends GoogleWorkspaceBaseTool {
  readonly name = 'calendar_get_events';
  readonly mcpToolName = 'calendar_get_events' as const;
  readonly description =
    'Retrieve events from a Google Calendar within a specified time range. ' +
    'Use calendar_id "primary" for the main calendar (default).';
  readonly isMutation = false;
  readonly category = 'communication' as const;

  readonly parameters = CalendarGetEventsInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── calendar_get_event_details ─────────────────────────────────────────────

export class GetCalendarEventDetailsTool extends GoogleWorkspaceBaseTool {
  readonly name = 'calendar_get_event_details';
  readonly mcpToolName = 'calendar_get_event_details' as const;
  readonly description =
    'Get detailed information for a specific calendar event by its event ID, ' +
    'including attendees, description, location, and conference details.';
  readonly isMutation = false;
  readonly category = 'communication' as const;

  readonly parameters = CalendarGetEventDetailsInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── create_calendar_event ──────────────────────────────────────────────────

export class CreateCalendarEventTool extends GoogleWorkspaceBaseTool {
  readonly name = 'create_calendar_event';
  readonly mcpToolName = 'create_calendar_event' as const;
  readonly description =
    'Create a new event in a Google Calendar. Supports attendees, location, ' +
    'description, timezone, and notification preferences.';
  readonly isMutation = true;
  readonly category = 'communication' as const;

  readonly parameters = CreateCalendarEventInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── delete_calendar_event ──────────────────────────────────────────────────

export class DeleteCalendarEventTool extends GoogleWorkspaceBaseTool {
  readonly name = 'delete_calendar_event';
  readonly mcpToolName = 'delete_calendar_event' as const;
  readonly description =
    'Delete an event from Google Calendar by its event ID. ' +
    'Optionally sends cancellation notifications to attendees.';
  readonly isMutation = true;
  readonly category = 'communication' as const;

  readonly parameters = DeleteCalendarEventInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── Backwards-compat aliases ───────────────────────────────────────────────

function makeRemovedCalendarTool(
  oldName: string,
  replacement: string
): new (s: GoogleWorkspaceMcpSessionService) => GoogleWorkspaceBaseTool {
  return class extends GoogleWorkspaceBaseTool {
    readonly name = oldName;
    readonly mcpToolName = 'calendar_get_events' as const;
    readonly description = `[REMOVED] ${oldName} use ${replacement} instead.`;
    readonly isMutation = false;
    readonly category = 'communication' as const;
    readonly parameters = EmptyCalendarInputSchema;

    override async execute(): Promise<{ success: false; error: string }> {
      return {
        success: false,
        error: `"${oldName}" has been removed. Use "${replacement}" instead.`,
      };
    }
  };
}

export const ListCalendarsTool = makeRemovedCalendarTool('list_calendars', 'calendar_get_events');
export const ManageCalendarEventTool = makeRemovedCalendarTool(
  'manage_event',
  'create_calendar_event and delete_calendar_event'
);
