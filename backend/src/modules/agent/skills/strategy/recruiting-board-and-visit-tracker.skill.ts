/**
 * @fileoverview Recruiting Board And Visit Tracker Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class RecruitingBoardAndVisitTrackerSkill extends BaseSkill {
  readonly name = 'recruiting_board_and_visit_tracker';
  readonly description =
    'Design recruiting target boards, offer comparison sheets, visit trackers, college lists, coach contact tables, and outreach pipeline spreadsheets with decision-ready scoring and status tracking.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## Recruiting Board And Visit Tracker Spreadsheet Design

### Sheet Count Rule
- Use one sheet for a simple target list or visit checklist.
- Use multiple tabs for recruiting operations: Target Board, Program Comparison, Coach Contacts, Visit Calendar, Outreach Pipeline.

### Recruiting Board Fields
Useful fields include:
- School / Program
- Division / Conference
- Fit Score
- Academic Fit
- Athletic Fit
- Coach Contact
- Offer / Interest Stage
- Last Contact
- Next Action
- Visit Date
- Notes

### Formula Rules
- Use score formulas only when scoring inputs are defined.
- Use COUNTIF for stage counts and visit status counts.
- Use dates and conditional formatting for upcoming or overdue actions.

### Visual Rules
- Make pipeline status obvious without turning the sheet into a rainbow.
- Use filters and frozen headers for long program lists.
- Keep contact info readable and copyable.

### Quality Gate
- The sheet should help a coach or athlete decide the next recruiting action immediately.`;
  }
}
