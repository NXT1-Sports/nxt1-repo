/**
 * @fileoverview Predictive Performance Analysis Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 *
 * Adds forecasting rules for projecting trends from historical performance and
 * contextual data instead of relying on flat descriptive summaries.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class PredictivePerformanceAnalysisSkill extends BaseSkill {
  readonly name = 'predictive_performance_analysis';
  readonly description =
    'Predictive analytics, performance forecasting, historical trend analysis, progression curves, ' +
    'scenario modeling, workload signals, regression indicators, and evidence-based performance projections.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(): string {
    return `## Predictive Performance Analysis Framework

### Forecasting Hierarchy
Build every forecast in this order:
1. **Historical Baseline**: what has actually happened over the relevant sample
2. **Trend Direction**: what is improving, flattening, or regressing
3. **Context Adjustments**: role changes, competition level, opponent quality, volume, health, and workload
4. **Scenario Range**: conservative, expected, and upside outcomes

### Required Inputs
Use or request these inputs before making a forecast when available:
- Recent sample and full-season sample
- Quality of competition
- Opportunity volume and usage trend
- Availability, fatigue, or injury constraints
- Outlier games or abnormal conditions that should be discounted

### Output Format
- **Baseline**: current level supported by evidence
- **Leading Indicators**: the variables most predictive of next-step change
- **Forecast Window**: near-term projection with clear timeframe
- **Scenario Bands**: conservative / expected / upside
- **Confidence**: High, Medium, or Low
- **Action Implication**: what the athlete, coach, or staff should do next

### Forecasting Rules
- Never present a single-point prediction without a range.
- Separate descriptive facts from predictive assumptions.
- Small samples must reduce confidence, not increase certainty.
- Down-weight numbers inflated by weak competition or unusual game scripts.
- Call out what could break the forecast: role changes, opponent jump, health, weather, or usage shifts.

### Best Uses
- Progression curves across seasons or training blocks
- Short-term form trends
- Recruiting response or engagement trajectories
- Lineup, usage, or workload impact forecasting
- Early-warning regression or breakout signals`;
  }
}
