import { describe, expect, it } from 'vitest';
import {
  AGENT_APPROVAL_POLICIES,
  AGENT_APPROVAL_TOOL_GROUPS,
  AGENT_PLANNED_TOOL_NAMES,
} from './agent.constants';
import { resolveAgentApprovalCopy } from './agent-copy';

describe('agent approval policy', () => {
  it('requires approvals only for communication tools', () => {
    const livePolicyNames = new Set(AGENT_APPROVAL_POLICIES.map((policy) => policy.toolName));

    expect(livePolicyNames.has('send_email')).toBe(true);
    expect(livePolicyNames.has('batch_send_email')).toBe(true);
    expect(livePolicyNames.has('gmail_send_email')).toBe(true);

    expect(livePolicyNames.has('write_core_identity')).toBe(false);
    expect(livePolicyNames.has('delete_timeline_post')).toBe(false);
    expect(livePolicyNames.has('run_google_workspace_tool')).toBe(false);
    expect(livePolicyNames.has('create_support_ticket')).toBe(false);

    for (const plannedTool of AGENT_PLANNED_TOOL_NAMES) {
      expect(livePolicyNames.has(plannedTool)).toBe(false);
    }

    expect(new Set(AGENT_APPROVAL_TOOL_GROUPS.communication).size).toBe(
      AGENT_APPROVAL_POLICIES.length
    );
  });

  it('builds friendly approval copy for email tools', () => {
    const sendCopy = resolveAgentApprovalCopy({
      toolName: 'send_email',
      toolInput: {
        toEmail: 'coach@example.com',
        subject: 'Hello coach',
      },
    });

    const batchCopy = resolveAgentApprovalCopy({
      toolName: 'batch_send_email',
      toolInput: {
        recipients: [{ toEmail: 'a@example.com' }, { toEmail: 'b@example.com' }],
        subjectTemplate: 'NXT1 update',
      },
    });

    expect(sendCopy.notificationTitle).toBe('Review Email Draft');
    expect(sendCopy.actionSummary).toContain('coach@example.com');
    expect(batchCopy.notificationTitle).toBe('Review Email Campaign');
    expect(batchCopy.actionSummary).toContain('Send 2 emails');
  });
});
