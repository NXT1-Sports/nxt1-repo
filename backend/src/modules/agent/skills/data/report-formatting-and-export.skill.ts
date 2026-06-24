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
    'Report formatting, executive summaries, table normalization, CSV/PDF/XLSX export readiness, ' +
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

### Coach Document Export Contract
- For callsheets, game plans, practice scripts, scout packets, and other coach-facing deliverables, prefer the multi-section export contract with sections[] instead of one flat table.
- Each section should represent one logical block such as summary, script periods, situational menu, adjustment triggers, call group, or coaching notes.
- Use tables only where a table improves scan speed; keep narrative notes, bullets, and coaching cues in their own sections instead of forcing them into cells.
- Choose format by staff workflow, not by presentation polish alone: if the artifact is meant to be edited, printed from a grid, mirrored from an existing staff sheet, or matched closely to a sample board/matrix, prefer XLSX or the native saved team document path before PDF.
- Callsheets, practice scripts, install sheets, scouting boards, wristband menus, and other coaching sheets should default to XLSX or native saved docs when the user does not explicitly name PDF.
- Words like professional, polished, clean, organized, or branded do not by themselves justify switching a coaching sheet to PDF.
- If the user provides a sample image/screenshot and asks to match it exactly, do not default to PDF first unless the sample is clearly a print-style report. Grid-heavy staff boards, callsheets, and practice matrices should usually route to XLSX.
- When team or organization branding is known, include organizationName, brandPrimaryColor, and logoUrl for PDF exports so the output is presentation-ready without manual rework.
- If the user provides a sample layout, preserve its heading order, section names, abbreviations, and column labels unless they explicitly ask for a redesign.

### Quality Gate
Before finalizing a report, verify:
- schema consistency across all rows
- no duplicate entities in summary tables
- no contradictory totals between section and roll-up views`;
  }
}
