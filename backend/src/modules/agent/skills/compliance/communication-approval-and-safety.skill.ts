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

### Approval Ladder
For outbound messages and public posts, follow this order:
1. Draft the content
2. Verify recipient, destination, or audience
3. Verify all facts, stats, names, and links
4. Confirm the user explicitly wants it sent or published
5. Execute the send/post action

### Safety Rules
- Never fabricate coach names, email addresses, school interest, or prior conversations.
- Never include unverified stats or promises.
- Keep follow-ups respectful and spaced appropriately.
- Avoid sharing sensitive personal data unless the user clearly requested it and it is necessary.

### Publish Rules
- A draft is not approval.
- A design request is not a publish request.
- If the user asks to publish, post, or send, do it only after the destination and facts are verified.
- If approval is unclear, ask one concise approval question instead of guessing.`;
  }
}
