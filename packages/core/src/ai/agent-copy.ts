import type { AgentApprovalReasonCode, AgentNotificationOutcomeCode } from './agent.types';

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
    case 'update_profile': {
      const actionSummary = 'Update the user profile with new information.';
      return {
        reasonCode: 'update_profile',
        actionSummary,
        notificationTitle: 'Review Profile Update',
        notificationBody: actionSummary,
      };
    }
    case 'delete_content': {
      const actionSummary = 'Delete content that cannot be recovered.';
      return {
        reasonCode: 'delete_content',
        actionSummary,
        notificationTitle: 'Confirm Deletion',
        notificationBody: actionSummary,
      };
    }
    case 'post_to_social': {
      const actionSummary = "Publish a social media post on the user's behalf.";
      return {
        reasonCode: 'post_to_social',
        actionSummary,
        notificationTitle: 'Review Social Post',
        notificationBody: actionSummary,
      };
    }
    case 'send_sms': {
      const actionSummary = "Send a text message on the user's behalf.";
      return {
        reasonCode: 'send_sms',
        actionSummary,
        notificationTitle: 'Review Text Draft',
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
      const actionSummary = `Run the ${toolName} tool.`;
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
    case 'update_profile':
      return `Review and approve this profile update before saving. ${input.actionSummary}`;
    case 'delete_content':
      return `Review and approve this deletion before continuing. ${input.actionSummary}`;
    case 'post_to_social':
      return `Review and approve this social post before publishing. ${input.actionSummary}`;
    case 'send_sms':
      return `Review and approve this text message before sending. ${input.actionSummary}`;
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
  summary?: string;
}): AgentNotificationCopy {
  const title = input.title?.trim() || 'Agent X Update';
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
    body: summary,
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

function truncateForNotification(text: string): string {
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

function truncateForSms(text: string): string {
  return text.length > 120 ? text.slice(0, 120) : text;
}
