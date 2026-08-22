/**
 * @fileoverview Team Budget And Financials Skill
 * @module @nxt1/backend/modules/agent/skills/data
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class TeamBudgetAndFinancialsSkill extends BaseSkill {
  readonly name = 'team_budget_and_financials';
  readonly description =
    'Design athletic budget, equipment, travel, operations, booster, expense, and financial planning spreadsheets with dashboards, variance formulas, accounting formats, and clean rollups.';
  readonly category: SkillCategory = 'data';

  getPromptContext(): string {
    return `## Team Budget And Financial Spreadsheet Design

### When To Use
Use this for team budgets, booster ledgers, equipment plans, travel costs, event budgets, staff operations, fundraising trackers, and financial comparison workbooks.

### Workbook Structure
- Use multiple tabs when there are separate financial categories: Summary, Equipment, Travel, Staff/Operations, Fundraising, Monthly Cash Flow.
- Use a single sheet when the user asks for a quick budget tracker or one-page ledger.
- Put an executive summary/dashboard first only when the workbook has enough data to justify it.

### Dashboard Standards
- Use KPI cards for total budget, projected spend, actual spend, remaining balance, and variance percentage.
- Use merged cells only for dashboard cards and section headers; avoid merged cells in raw tables.
- Keep formulas live: SUM, SUMIF/SUMIFS, AVERAGE, COUNTIF, variance, variance percent.

### Accounting Rules
- Apply accounting number formats to money cells.
- Use percentage formats for variance percent and allocation percent.
- Use double bottom borders for final total rows.
- Separate budget, actual, projected, variance, and notes into clear columns.
- Highlight over-budget lines with conditional formatting when useful.

### Quality Gate
- All totals must be formulas, not static numbers.
- Every category total should reconcile to the dashboard total.
- Freeze the header row and auto-fit all columns before saving.`;
  }
}
