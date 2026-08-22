/**
 * @fileoverview Roster And Depth Chart Design Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class RosterAndDepthChartDesignSkill extends BaseSkill {
  readonly name = 'roster_and_depth_chart_design';
  readonly description =
    'Design roster, depth chart, personnel matrix, position group, class breakdown, and recruiting board spreadsheets with readable hierarchy, rollup formulas, and staff-ready tabs.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## Roster And Depth Chart Spreadsheet Design

### Sheet Count Rule
- Use one sheet for a quick roster, travel roster, or one-page personnel view.
- Use multiple tabs for full packets: Depth Chart, Master Roster, Position Matrix, Class Breakdown.

### Depth Chart Rules
- Group by position family and position.
- Show starters first, then backups, developmental players, and notes.
- Keep jersey number, name, class/year, height/weight, role, and status visible.

### Roster Rules
- Support numerical roster and alphabetical roster views when useful.
- Add filters and freeze panes for large rosters.
- Use formulas for position counts, class counts, roster totals, and physical averages.

### Visual Rules
- Use hierarchy, spacing, and subtle fills to distinguish starters from backups.
- Use context or team colors when available; otherwise use neutral high-contrast grouping.
- Avoid over-coloring large rosters.

### Quality Gate
- Staff should be able to scan who plays, who backs up, and where depth is thin without reading prose.`;
  }
}
