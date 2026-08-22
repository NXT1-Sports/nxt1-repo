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
    'Report formatting, executive summaries, table normalization, CSV/PDF/XLSX/PPTX export readiness, ' +
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
- For exact-layout PDF output: complete HTML/CSS with explicit page geometry, deterministic typography, and no scripts; route through render_html_pdf instead of dynamic_export or Gamma.
- For sample-matched spatial layouts (depth charts, callsheets, wristbands, staff boards, paper forms), build a fixed .page/.sheet/.canvas with @page size and positioned regions/cards. Do not convert the sample into a generic full-width row, table, or flex list.
- For quarterback / signal-caller wristbands: format specifically as physical paper inserts that fit inside clear vinyl windows (Adult standard: 4.75" x 2.5", Youth standard: 4.0" x 3.0"). Use high-density 3x10 (30 calls) or 2x15 grids, large bold call numbers for under-2-second scanning, compact uppercase tokens, and concept color coding (Run/Pass/RPO/Red Zone).
- render_html_pdf persists an editable HTML source artifact alongside the final PDF. For revisions, reopen that source first and edit the HTML/CSS instead of reverse-engineering the PDF.
- For PPTX-style output: one clear idea/card per slide, strong section titles, short bullets, and charts/images embedded via imageUrls when useful
- Always include generated-at timestamp and source attribution
- Flag missing critical fields instead of silently omitting them

### Export Routing Priority
- One-page or fixed-layout PDFs (callsheets, wristbands, practice scripts, depth charts, sideline sheets, quick-reference boards) should default to render_html_pdf.
- Multi-page narrative reports and slide/presentation artifacts that benefit from Gamma styling should use dynamic_export.
- Editable spreadsheet/workbook asks should prefer 'execute_python_code' first.
- dynamic_export should be the last fallback for PDF/XLSX when the dedicated layout or spreadsheet path is not the correct fit.

### Coach Document Export Contract
- For callsheets, game plans, practice scripts, scout packets, and other coach-facing deliverables, prefer the multi-section export contract with sections[] instead of one flat table.
- Each section should represent one logical block such as summary, script periods, situational menu, adjustment triggers, call group, or coaching notes.
- Use tables only where a table improves scan speed; keep narrative notes, bullets, and coaching cues in their own sections instead of forcing them into cells.
- Choose format by staff workflow, not by presentation polish alone: if the artifact is meant to be edited, prefer 'execute_python_code'/XLSX first; if it must be a print/PDF artifact with fixed layout or sample-matching, use render_html_pdf.
- Choose PPTX when coaches need flash cards, flashcards, a card deck, a slide-by-slide deck, scout-card packet, player-card packet, opponent briefing deck, recruiting pitch deck, parent/staff meeting deck, or presentation-first visual packet.
- Callsheets, practice scripts, install sheets, scouting boards, and other coaching sheets should default to XLSX or native saved docs when the user does not explicitly name PDF.
- Wristband inserts and other physical quick-reference cards should default to render_html_pdf unless the user explicitly asks for an editable spreadsheet/source sheet.
- If those same artifacts are explicitly requested as printable one-pagers or share-ready PDFs, route them to render_html_pdf first rather than dynamic_export.
- Words like professional, polished, clean, organized, or branded do not by themselves justify switching a coaching sheet to PDF.
- If the user provides a sample image/screenshot and asks to match it exactly, preserve the visual geometry. Use render_html_pdf when they want a PDF/printout, and XLSX/native documents only when editability is the primary requirement.
- For exact visual references, match the hierarchy and coordinates first: title bars, section separators, card boxes, whitespace, alignment, and relative distances matter as much as text content.
- When team or organization branding is known, include organizationName, brandPrimaryColor, brandSecondaryColor, and logoUrl for PDF/PPTX exports so the output is presentation-ready without manual rework. For callsheets and wristbands specifically, restrict team colors to the title banner/header area and use universal functional coaching colors (Green for Run/Openers, Red for Red Zone/Alerts, Blue for 3rd Down/Pass, Yellow/Orange for Shots/2-Minute/RPO) for the actual panels and call boxes.
- For PPTX or slide-style exports, if both brand colors are known and the user did not ask for a minimal white deck, prefer \`brandBackgroundMode: "balanced"\` so the deck uses tasteful branded section backgrounds instead of staying entirely white.
- If the user provides a sample layout, preserve its heading order, section names, abbreviations, and column labels unless they explicitly ask for a redesign.

### Quality Gate
Before finalizing a report, verify:
- schema consistency across all rows
- no duplicate entities in summary tables
- no contradictory totals between section and roll-up views`;
  }
}
