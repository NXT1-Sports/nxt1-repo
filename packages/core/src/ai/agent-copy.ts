import { AGENT_APPROVAL_TOOL_GROUPS } from './agent.constants';
import type { AgentApprovalReasonCode, AgentNotificationOutcomeCode } from './agent.types';

const WORKSPACE_ACTION_TOOLS = new Set<string>(AGENT_APPROVAL_TOOL_GROUPS.workspaceActions);
const AUTOMATION_AND_EXTERNAL_ACTION_TOOLS = new Set<string>(
  AGENT_APPROVAL_TOOL_GROUPS.automationAndExternalActions
);
const DESTRUCTIVE_STORAGE_TOOLS = new Set<string>(AGENT_APPROVAL_TOOL_GROUPS.destructiveStorage);

function humanizeIdentifier(identifier: string): string {
  return identifier.replace(/_/g, ' ');
}

function summarizeResourceMutation(toolName: string): AgentApprovalCopy | null {
  if (toolName.startsWith('write_')) {
    const resource = humanizeIdentifier(toolName.slice('write_'.length));
    const actionSummary = `Create or overwrite ${resource}.`;
    return {
      reasonCode: 'run_tool',
      actionSummary,
      notificationTitle: 'Review Data Write',
      notificationBody: actionSummary,
    };
  }

  if (toolName.startsWith('update_')) {
    const resource = humanizeIdentifier(toolName.slice('update_'.length));
    const actionSummary = `Update ${resource}.`;
    return {
      reasonCode: 'run_tool',
      actionSummary,
      notificationTitle: 'Review Data Update',
      notificationBody: actionSummary,
    };
  }

  if (toolName.startsWith('delete_')) {
    const resource = humanizeIdentifier(toolName.slice('delete_'.length));
    const actionSummary = `Delete ${resource}. This may be irreversible.`;
    return {
      reasonCode: 'run_tool',
      actionSummary,
      notificationTitle: 'Confirm Deletion',
      notificationBody: actionSummary,
    };
  }

  return null;
}

function summarizeWorkspaceAction(toolName: string): AgentApprovalCopy {
  if (toolName === 'run_google_workspace_tool') {
    const actionSummary = "Run a Google Workspace action in the user's connected Google account.";
    return {
      reasonCode: 'run_tool',
      actionSummary,
      notificationTitle: 'Review Workspace Action',
      notificationBody: actionSummary,
    };
  }

  if (toolName === 'run_microsoft_365_tool') {
    const actionSummary = "Run a Microsoft 365 action in the user's connected Microsoft account.";
    return {
      reasonCode: 'run_tool',
      actionSummary,
      notificationTitle: 'Review Workspace Action',
      notificationBody: actionSummary,
    };
  }

  let scope = 'workspace data';
  let notificationTitle = 'Review Workspace Action';

  if (toolName.startsWith('drive_')) {
    scope = 'Google Drive files or folders';
    notificationTitle = 'Review Drive Action';
  } else if (toolName.startsWith('docs_')) {
    scope = 'a Google Doc';
    notificationTitle = 'Review Document Action';
  } else if (toolName.startsWith('sheets_')) {
    scope = 'a Google Sheet';
    notificationTitle = 'Review Spreadsheet Action';
  } else if (toolName.includes('calendar')) {
    scope = 'Google Calendar events';
    notificationTitle = 'Review Calendar Action';
  } else if (
    toolName.includes('slide') ||
    toolName.includes('presentation') ||
    toolName.startsWith('add_')
  ) {
    scope = 'a Google Slides presentation';
    notificationTitle = 'Review Slides Action';
  }

  const actionSummary = `Modify ${scope} using ${humanizeIdentifier(toolName)}.`;

  return {
    reasonCode: 'run_tool',
    actionSummary,
    notificationTitle,
    notificationBody: actionSummary,
  };
}

export interface AgentApprovalCopy {
  readonly reasonCode: AgentApprovalReasonCode;
  readonly actionSummary: string;
  readonly notificationTitle: string;
  readonly notificationBody: string;
}

export interface AgentNotificationCopy {
  readonly outcomeCode: AgentNotificationOutcomeCode;
  readonly title: string;
  readonly body: string;
}

export function resolveAgentApprovalCopy(input: {
  toolName: string;
  toolInput: Readonly<Record<string, unknown>>;
}): AgentApprovalCopy {
  const { toolName, toolInput } = input;

  if (WORKSPACE_ACTION_TOOLS.has(toolName)) {
    return summarizeWorkspaceAction(toolName);
  }

  if (AUTOMATION_AND_EXTERNAL_ACTION_TOOLS.has(toolName)) {
    if (toolName === 'create_support_ticket') {
      const actionSummary = "Create a support ticket and contact support on the user's behalf.";
      return {
        reasonCode: 'run_tool',
        actionSummary,
        notificationTitle: 'Review Support Ticket',
        notificationBody: actionSummary,
      };
    }

    if (toolName === 'schedule_recurring') {
      const actionSummary = 'Create or update a recurring automation.';
      return {
        reasonCode: 'run_tool',
        actionSummary,
        notificationTitle: 'Review Automation Change',
        notificationBody: actionSummary,
      };
    }

    if (toolName === 'cancel_recurring') {
      const actionSummary = 'Cancel a recurring automation.';
      return {
        reasonCode: 'run_tool',
        actionSummary,
        notificationTitle: 'Review Automation Change',
        notificationBody: actionSummary,
      };
    }

    const actionSummary = 'Generate and export a downloadable file.';
    return {
      reasonCode: 'run_tool',
      actionSummary,
      notificationTitle: 'Review Export',
      notificationBody: actionSummary,
    };
  }

  if (DESTRUCTIVE_STORAGE_TOOLS.has(toolName)) {
    const actionSummary = `Delete ${humanizeIdentifier(toolName.slice('delete_'.length))}. This may be irreversible.`;
    return {
      reasonCode: 'run_tool',
      actionSummary,
      notificationTitle: 'Confirm Deletion',
      notificationBody: actionSummary,
    };
  }

  const resourceMutationSummary = summarizeResourceMutation(toolName);
  if (resourceMutationSummary) {
    return resourceMutationSummary;
  }

  switch (toolName) {
    case 'send_email': {
      const toEmail =
        typeof toolInput['toEmail'] === 'string' ? toolInput['toEmail'] : 'the recipient';
      const subject =
        typeof toolInput['subject'] === 'string' ? toolInput['subject'] : 'No subject';
      const actionSummary = `Send an email to ${toEmail} with subject "${subject}".`;
      return {
        reasonCode: 'send_email',
        actionSummary,
        notificationTitle: 'Review Email Draft',
        notificationBody: actionSummary,
      };
    }
    case 'batch_send_email': {
      const recipients = Array.isArray(toolInput['recipients']) ? toolInput['recipients'] : [];
      const recipientCount = recipients.length;
      const subject =
        typeof toolInput['subjectTemplate'] === 'string'
          ? toolInput['subjectTemplate']
          : 'No subject';
      const actionSummary =
        recipientCount > 0
          ? `Send ${recipientCount} emails with subject "${subject}".`
          : `Send a batch email campaign with subject "${subject}".`;

      return {
        reasonCode: 'send_email',
        actionSummary,
        notificationTitle: 'Review Email Campaign',
        notificationBody: actionSummary,
      };
    }
    case 'interact_with_live_view': {
      const prompt =
        typeof toolInput['prompt'] === 'string'
          ? toolInput['prompt'].trim()
          : 'perform a browser action';
      const actionSummary = `Perform this browser action in live view: ${prompt}`;
      return {
        reasonCode: 'interact_with_live_view',
        actionSummary,
        notificationTitle: 'Confirm Live Browser Action',
        notificationBody: actionSummary,
      };
    }
    default: {
      const actionSummary = `Run the ${humanizeIdentifier(toolName)} action.`;
      return {
        reasonCode: 'run_tool',
        actionSummary,
        notificationTitle: 'Review Agent Action',
        notificationBody: actionSummary,
      };
    }
  }
}

export function resolveAgentApprovalPrompt(input: {
  reasonCode: AgentApprovalReasonCode;
  actionSummary: string;
}): string {
  switch (input.reasonCode) {
    case 'send_email':
      return `Review and approve this email draft before sending. ${input.actionSummary}`;
    case 'interact_with_live_view':
      return `Confirm this live browser action before continuing. ${input.actionSummary}`;
    default:
      return `Review and approve this agent action before continuing. ${input.actionSummary}`;
  }
}

export function resolveAgentYieldCopy(input: {
  reason: 'needs_approval';
  actionSummary: string;
}): AgentNotificationCopy & { readonly smsBody: string };
export function resolveAgentYieldCopy(input: {
  reason: 'needs_input';
  promptToUser: string;
}): AgentNotificationCopy & { readonly smsBody: string };
export function resolveAgentYieldCopy(
  input:
    | {
        reason: 'needs_approval';
        actionSummary: string;
      }
    | {
        reason: 'needs_input';
        promptToUser: string;
      }
): AgentNotificationCopy & { readonly smsBody: string } {
  if (input.reason === 'needs_approval') {
    const body = truncateForNotification(input.actionSummary);
    return {
      outcomeCode: 'approval_required',
      title: 'Approval Required',
      body,
      smsBody: `[NXT1] Approval required: ${truncateForSms(input.actionSummary)}. Open the app to review.`,
    };
  }

  const body = truncateForNotification(input.promptToUser);

  return {
    outcomeCode: 'input_required',
    title: 'Response Needed',
    body,
    smsBody: `[NXT1] Response needed: ${truncateForSms(input.promptToUser)}. Open the app to respond.`,
  };
}

export function resolveAgentSuccessNotificationCopy(input: {
  title?: string;
  threadTitle?: string;
  summary?: string;
}): AgentNotificationCopy {
  const title = input.threadTitle?.trim() || input.title?.trim() || 'Agent X Update';
  const summary = input.summary?.trim() ?? '';

  if (!summary || summary.toLowerCase() === title.toLowerCase()) {
    return {
      outcomeCode: 'success_default',
      title,
      body: 'Open Agent X to review it.',
    };
  }

  return {
    outcomeCode: 'success_default',
    title,
    body: truncateToFirstSentence(summary),
  };
}

export function resolveAgentFailureNotificationCopy(errorMessage: string): AgentNotificationCopy {
  return {
    outcomeCode: 'task_failed',
    title: 'Agent X ran into an issue',
    body:
      errorMessage.length <= 100
        ? `${errorMessage} Tap to retry.`
        : 'Something went wrong with your request. Tap to retry.',
  };
}

/**
 * Returns human-readable success copy for an approved tool call.
 * Used in the card's resolved badge and in the auto-injected confirmation
 * message appended to the chat thread after approval.
 */
export function resolveApprovalSuccessText(toolName: string): {
  readonly badge: string;
  readonly message: string;
} {
  switch (toolName) {
    // ── Email ──────────────────────────────────────────────────────────
    case 'send_email':
      return { badge: 'Email sent', message: 'Email sent successfully.' };
    case 'batch_send_email':
      return { badge: 'Campaign sent', message: 'Email campaign sent successfully.' };

    // ── Timeline / Team posts ──────────────────────────────────────────
    case 'write_timeline_post':
      return { badge: 'Post published', message: 'Timeline post published successfully.' };
    case 'update_timeline_post':
      return { badge: 'Post updated', message: 'Timeline post updated successfully.' };
    case 'write_team_post':
      return { badge: 'Team post published', message: 'Team post published successfully.' };
    case 'update_team_post':
      return { badge: 'Team post updated', message: 'Team post updated successfully.' };

    // ── Profile / Identity ─────────────────────────────────────────────
    case 'write_core_identity':
    case 'update_core_identity':
      return { badge: 'Profile updated', message: 'Core profile updated successfully.' };
    case 'write_athletic_profile':
    case 'update_athletic_profile':
      return { badge: 'Profile updated', message: 'Athletic profile updated successfully.' };
    case 'write_academic_profile':
    case 'update_academic_profile':
      return { badge: 'Academics updated', message: 'Academic profile updated successfully.' };
    case 'write_recruiting_preferences':
    case 'update_recruiting_preferences':
      return { badge: 'Preferences saved', message: 'Recruiting preferences saved successfully.' };

    // ── Stats & Performance ────────────────────────────────────────────
    case 'write_season_stats':
    case 'update_season_stats':
      return { badge: 'Stats saved', message: 'Season stats saved successfully.' };
    case 'write_career_stats':
    case 'update_career_stats':
      return { badge: 'Stats saved', message: 'Career stats saved successfully.' };
    case 'write_game_log':
    case 'update_game_log':
      return { badge: 'Game log saved', message: 'Game log entry saved successfully.' };
    case 'write_highlights':
    case 'update_highlights':
      return { badge: 'Highlights saved', message: 'Highlights saved successfully.' };
    case 'write_awards':
    case 'update_awards':
      return { badge: 'Awards saved', message: 'Awards saved successfully.' };

    // ── Team management ────────────────────────────────────────────────
    case 'write_team_roster':
    case 'update_team_roster':
      return { badge: 'Roster saved', message: 'Team roster saved successfully.' };
    case 'write_team_schedule':
    case 'update_team_schedule':
      return { badge: 'Schedule saved', message: 'Team schedule saved successfully.' };
    case 'write_team_info':
    case 'update_team_info':
      return { badge: 'Team updated', message: 'Team info updated successfully.' };

    // ── Scout reports ──────────────────────────────────────────────────
    case 'write_scout_report':
    case 'update_scout_report':
      return { badge: 'Report saved', message: 'Scout report saved successfully.' };

    // ── Automation ─────────────────────────────────────────────────────
    case 'schedule_recurring':
      return { badge: 'Automation set', message: 'Recurring automation scheduled successfully.' };
    case 'cancel_recurring':
      return { badge: 'Automation cancelled', message: 'Recurring automation cancelled.' };

    // ── Deletions ──────────────────────────────────────────────────────
    default: {
      if (toolName.startsWith('delete_')) {
        const resource = toolName.slice('delete_'.length).replace(/_/g, ' ');
        return { badge: 'Deleted', message: `${resource} deleted successfully.` };
      }
      if (toolName.startsWith('write_')) {
        const resource = toolName.slice('write_'.length).replace(/_/g, ' ');
        return { badge: 'Saved', message: `${resource} saved successfully.` };
      }
      if (toolName.startsWith('update_')) {
        const resource = toolName.slice('update_'.length).replace(/_/g, ' ');
        return { badge: 'Updated', message: `${resource} updated successfully.` };
      }
      return { badge: 'Approved', message: 'Action approved and completed.' };
    }
  }
}

function truncateForNotification(text: string): string {
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

function truncateToFirstSentence(text: string, maxLen = 120): string {
  if (text.length <= maxLen) return text;
  const match = text.match(/^.+?[.!?](?:\s|$)/s);
  if (match && match[0].trim().length <= maxLen) return match[0].trim();
  return `${text.slice(0, maxLen - 1).trimEnd()}\u2026`;
}

function truncateForSms(text: string): string {
  return text.length > 120 ? text.slice(0, 120) : text;
}
