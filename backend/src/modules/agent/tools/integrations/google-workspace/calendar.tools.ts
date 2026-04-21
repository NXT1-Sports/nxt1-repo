/**
 * @fileoverview Google Calendar First-Class Agent X Tools
 * @module @nxt1/backend/modules/agent/tools/integrations/google-workspace
 *
 * Four Calendar tools matching google-workspace-mcp v1.27.0:
 * calendar_get_events, calendar_get_event_details, create_calendar_event, delete_calendar_event.
 */

import type { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';
import { GoogleWorkspaceBaseTool } from './google-workspace-base.tool.js';

// ─── calendar_get_events ────────────────────────────────────────────────────

export class GetCalendarEventsTool extends GoogleWorkspaceBaseTool {
  readonly name = 'calendar_get_events';
  readonly mcpToolName = 'calendar_get_events' as const;
  readonly description =
    'Retrieve events from a Google Calendar within a specified time range. ' +
    'Use calendar_id "primary" for the main calendar (default).';
  readonly isMutation = false;
  readonly category = 'communication' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      time_min: {
        type: 'string',
        description:
          'Start of time range (inclusive) in RFC3339 format ' +
          '(e.g. "2025-06-01T00:00:00Z"). Required.',
      },
      time_max: {
        type: 'string',
        description: 'End of time range (exclusive) in RFC3339 format. Required.',
      },
      calendar_id: {
        type: 'string',
        description: 'Calendar ID to query. Defaults to "primary".',
      },
      max_results: {
        type: 'number',
        description: 'Maximum events to return.',
      },
      show_deleted: {
        type: 'boolean',
        description: 'Whether to show deleted events.',
      },
    },
    required: ['time_min', 'time_max'],
    additionalProperties: false,
  } as const;

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

  readonly parameters = {
    type: 'object',
    properties: {
      event_id: {
        type: 'string',
        description: 'The calendar event ID to retrieve details for.',
      },
      calendar_id: {
        type: 'string',
        description: 'Calendar ID. Defaults to "primary".',
      },
    },
    required: ['event_id'],
    additionalProperties: false,
  } as const;

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

  readonly parameters = {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Event title/summary.',
      },
      start_time: {
        type: 'string',
        description:
          'Event start time in RFC3339 format (e.g. "2025-06-15T10:00:00-04:00"). ' +
          'For all-day events use date format "2025-06-15".',
      },
      end_time: {
        type: 'string',
        description: 'Event end time in RFC3339 format.',
      },
      calendar_id: {
        type: 'string',
        description: 'Calendar ID. Defaults to "primary".',
      },
      location: {
        type: 'string',
        description: 'Event location.',
      },
      description: {
        type: 'string',
        description: 'Event description/notes.',
      },
      attendees: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of attendee email addresses.',
      },
      send_notifications: {
        type: 'boolean',
        description: 'Whether to send email notifications to attendees.',
      },
      timezone: {
        type: 'string',
        description: 'IANA timezone (e.g. "America/New_York"). Defaults to calendar timezone.',
      },
    },
    required: ['summary', 'start_time', 'end_time'],
    additionalProperties: false,
  } as const;

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

  readonly parameters = {
    type: 'object',
    properties: {
      event_id: {
        type: 'string',
        description: 'The event ID to delete.',
      },
      calendar_id: {
        type: 'string',
        description: 'Calendar ID. Defaults to "primary".',
      },
      send_notifications: {
        type: 'boolean',
        description: 'Whether to send cancellation notifications to attendees. Defaults to true.',
      },
    },
    required: ['event_id'],
    additionalProperties: false,
  } as const;

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
    readonly parameters = { type: 'object' as const, properties: {} };

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
