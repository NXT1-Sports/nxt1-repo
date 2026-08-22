/**
 * @fileoverview Athletic Performance And Combine Tracker Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class AthleticPerformanceAndCombineTrackerSkill extends BaseSkill {
  readonly name = 'athletic_performance_and_combine_tracker';
  readonly description =
    'Design combine, strength, speed, testing, progression, leaderboard, and performance tracker spreadsheets with formulas, percent-of-max tables, position-group rankings, and trend-ready structure.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(): string {
    return `## Athletic Performance And Combine Tracker Spreadsheet Design

### Sheet Count Rule
- Use one sheet for a simple testing leaderboard.
- Use multiple tabs for full tracking: Combine Results, Strength Maxes, Percent Workouts, Position Leaderboards, Progress Trends.

### Common Metrics
- 40-yard dash, 10-yard split, shuttle, vertical, broad jump.
- Bench reps, squat, clean, deadlift, body weight.
- Sport-specific metrics when available.

### Formula Rules
- Use formulas for averages, ranks, improvements, percent change, and percent-of-max prescriptions.
- Use formulas instead of hardcoded rollups so coaches can edit values later.
- For lifting sheets, calculate working sets from maxes with percentage formulas.

### Visual Rules
- Group by position or training group when useful.
- Use conditional formatting for top performers, improvements, and risk flags.
- Keep leaderboards sortable and filterable.

### Quality Gate
- The workbook should make it clear who improved, who leads, and what the next training target is.`;
  }
}
