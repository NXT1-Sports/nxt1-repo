import { describe, expect, it } from 'vitest';
import {
  AGENT_APPROVAL_POLICIES,
  AGENT_APPROVAL_TOOL_GROUPS,
  AGENT_PLANNED_TOOL_NAMES,
} from './agent.constants';
import { resolveAgentApprovalCopy } from './agent-copy';

describe('agent approval policy', () => {
  it('covers representative tools from each high-risk runtime group', () => {
    const livePolicyNames = new Set(AGENT_APPROVAL_POLICIES.map((policy) => policy.toolName));

    expect(livePolicyNames.has('send_email')).toBe(true);
    expect(livePolicyNames.has('write_core_identity')).toBe(true);
    expect(livePolicyNames.has('delete_timeline_post')).toBe(true);
    expect(livePolicyNames.has('write_team_post')).toBe(true);
    expect(livePolicyNames.has('delete_team_post')).toBe(true);
    expect(livePolicyNames.has('write_intel')).toBe(true);
    expect(livePolicyNames.has('run_google_workspace_tool')).toBe(true);
    expect(livePolicyNames.has('gmail_send_email')).toBe(true);
    expect(livePolicyNames.has('create_support_ticket')).toBe(true);
    expect(livePolicyNames.has('delete_video')).toBe(true);

    for (const plannedTool of AGENT_PLANNED_TOOL_NAMES) {
      expect(livePolicyNames.has(plannedTool)).toBe(false);
    }

    expect(AGENT_APPROVAL_TOOL_GROUPS.workspaceActions).toContain('delete_slide');
  });

  it('builds friendly approval copy for data writes and deletes', () => {
    const writeCopy = resolveAgentApprovalCopy({
      toolName: 'write_core_identity',
      toolInput: {},
    });
    const deleteCopy = resolveAgentApprovalCopy({
      toolName: 'delete_timeline_post',
      toolInput: {},
    });

    expect(writeCopy.notificationTitle).toBe('Review Data Write');
    expect(writeCopy.actionSummary).toBe('Create or overwrite core identity.');
    expect(deleteCopy.notificationTitle).toBe('Confirm Deletion');
    expect(deleteCopy.actionSummary).toBe('Delete timeline post. This may be irreversible.');
  });

  it('builds specific approval copy for workspace and support actions', () => {
    const workspaceCopy = resolveAgentApprovalCopy({
      toolName: 'run_google_workspace_tool',
      toolInput: {},
    });
    const supportCopy = resolveAgentApprovalCopy({
      toolName: 'create_support_ticket',
      toolInput: {},
    });

    expect(workspaceCopy.notificationTitle).toBe('Review Workspace Action');
    expect(workspaceCopy.actionSummary).toContain('Google Workspace action');
    expect(supportCopy.notificationTitle).toBe('Review Support Ticket');
    expect(supportCopy.actionSummary).toContain('support ticket');
  });
});
