/**
 * @fileoverview Report Formatting And Export Skill
 * @module @nxt1/backend/modules/agent/skills/data
 *
 * Standardizes report structure and export-readiness for downstream consumers.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class ReportFormattingAndExportSkill extends BaseSkill {
  readonly name = 'report_formatting_and_export';
  readonly description =
    'Report formatting, executive summaries, table normalization, CSV/PDF export readiness, ' +
    'field ordering, schema consistency, and decision-ready output packaging.';
  readonly category: SkillCategory = 'data';

  getPromptContext(): string {
    return `## Report Formatting And Export

### Required Report Structure
1. **Executive Summary**: 3-6 bullets with top decisions and key deltas
2. **Data Snapshot**: source list, freshness timestamp, confidence notes
3. **Core Tables**: normalized headers, consistent units, deterministic sort order
4. **Insights Section**: objective findings only, separated from recommendations
5. **Action Block**: next steps with owner and timeline when available

### Table Rules
- Use stable column names and ordering across versions.
- Keep numeric fields machine-parseable (no mixed text like "10 pts (best)").
- Include units explicitly in headers when relevant (e.g., 40yd_seconds).
- Preserve raw source values in metadata when canonicalization was applied.

### Export Readiness Rules
- For CSV: flattened rows, no merged cell assumptions, UTF-8 safe output
- For PDF-style output: concise section headings and consistent row grouping
- Always include generated-at timestamp and source attribution
- Flag missing critical fields instead of silently omitting them

### Quality Gate
Before finalizing a report, verify:
- schema consistency across all rows
- no duplicate entities in summary tables
- no contradictory totals between section and roll-up views`;
  }
}
