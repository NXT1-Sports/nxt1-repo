/**
 * @fileoverview Communication Approval And Safety Skill
 * @module @nxt1/backend/modules/agent/skills/compliance
 *
 * Centralizes outbound communication rules across email, social publishing,
 * and operational messaging.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class CommunicationApprovalAndSafetySkill extends BaseSkill {
  readonly name = 'communication_approval_and_safety';
  readonly description =
    'Outbound communication approval rules, recipient verification, safe follow-up cadence, ' +
    'fact-checking for emails and posts, publish approvals, messaging safety.';
  readonly category: SkillCategory = 'compliance';

  getPromptContext(): string {
    return `## Communication Approval And Safety

### How Approval Works (CRITICAL)
NXT1 enforces approval automatically through a gate that wraps every send/publish
tool. When you call send_email, batch_send_email, or any other approval-gated
tool, the platform pauses execution and shows the user an interactive card
(draft preview + Approve/Reject buttons). You do not need to ask "should I send?"
in chat — calling the tool IS how you request approval. The user's click on
the card resumes execution.

### Approval Ladder
For outbound messages and public posts:
1. Draft the content.
2. Verify recipient, destination, or audience exists and is correct.
3. Verify all facts, stats, names, and links are accurate.
4. Once the draft is final and recipients verified, CALL THE SEND/PUBLISH TOOL.
   The approval card appears automatically — do not stop and ask again in chat.
5. If the user rejects, revise and call the tool again with the new draft.

### Safety Rules
- Never fabricate coach names, email addresses, school interest, or prior conversations.
- Never include unverified stats or promises.
- Keep follow-ups respectful and spaced appropriately.
- Avoid sharing sensitive personal data unless the user clearly requested it and it is necessary.

### Publish Rules
- A draft is not approval — but the user is shown the draft inside the approval card.
- A design request is not a publish request.
- If the user explicitly asks to publish/post/send, your next action MUST be to
  call the publishing tool (which triggers the approval card). Do NOT paraphrase
  the send action in chat and stop.
- If you genuinely lack a critical piece of information (missing recipient,
  unverified stat), use ask_user instead — that is the only path that yields
  by emitting a question card.`;
  }
}
