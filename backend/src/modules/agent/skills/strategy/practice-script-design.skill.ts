/**
 * @fileoverview Practice Script Design Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class PracticeScriptDesignSkill extends BaseSkill {
  readonly name = 'practice_script_design';
  readonly description =
    'Design practice script, install progression, team period, rep distribution, and staff schedule spreadsheets with period timing, live formulas, tempo tags, and print-ready organization.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## Practice Script Spreadsheet Design

### Sheet Count Rule
- Use one sheet for a single-day compact script.
- Use multiple tabs when the packet naturally includes a master timeline, period-by-period script, rep distribution, and staff notes.

### Structure
Useful tabs/sections include:
- Master Timeline
- Period Script
- Rep Distribution
- Personnel / Field Assignments
- Coaching Emphasis

### Columns
Common columns:
- Time
- Period
- Duration
- Drill / Team Segment
- Play / Concept
- Group / Personnel
- Tempo (AIR, TAG, THUD, LIVE, WRAP)
- Reps
- Location / Field
- Coaching Points

### Formula Rules
- Use formulas for total minutes, total reps, run/pass split, period counts, and group workload.
- Use COUNTIF/SUMIF where period names or play types repeat.
- Keep formulas live so coaches can edit the script later.

### Quality Gate
- Staff should be able to run practice from the sheet without reading paragraphs.
- Print headers and freeze panes must keep period labels visible.`;
  }
}
