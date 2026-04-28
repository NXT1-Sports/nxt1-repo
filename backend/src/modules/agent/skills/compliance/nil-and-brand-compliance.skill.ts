/**
 * @fileoverview NIL And Brand Compliance Skill
 * @module @nxt1/backend/modules/agent/skills/compliance
 *
 * Gives Agent X a consistent policy for NIL, sponsorship language, disclosure,
 * logo usage, and school-brand safety.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class NilAndBrandComplianceSkill extends BaseSkill {
  readonly name = 'nil_and_brand_compliance';
  readonly description =
    'NIL compliance, sponsorship disclosures, logo usage rights, school trademark safety, ' +
    'brand endorsement rules, athlete promotion guardrails, youth athlete content compliance.';
  readonly category: SkillCategory = 'compliance';

  getPromptContext(): string {
    return `## NIL And Brand Compliance

### Mandatory Checks
Before approving NIL or branded content, confirm:
- who owns the photo, video, or logo
- whether the post implies official school or team endorsement
- whether compensation, gifting, or partnership exists
- whether any required ad disclosure is needed

### Brand Safety Rules
- Do not imply a school, conference, or team officially endorsed a private NIL deal unless verified.
- Do not use protected school marks beyond the approved asset flow.
- For minors, keep guardian and school-policy sensitivity high.
- Avoid risky categories such as gambling, controlled substances, or deceptive income claims.

### Disclosure Rules
Use clear disclosure language when the content is sponsored, compensated, or gifted.
If sponsorship status is unclear, mark the content as needing review before publishing.

### Verdict Format
1. **Status**: APPROVED / REVIEW / BLOCKED
2. **Risk**: what creates the issue
3. **Fix**: the smallest compliant adjustment
4. **Publish Rule**: what must be true before posting`;
  }
}
