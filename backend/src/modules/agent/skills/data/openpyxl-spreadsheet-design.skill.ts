/**
 * @fileoverview OpenPyXL Spreadsheet Design Skill
 * @module @nxt1/backend/modules/agent/skills/data
 *
 * Universal workbook-quality rules for Python/openpyxl spreadsheet artifacts.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class OpenpyxlSpreadsheetDesignSkill extends BaseSkill {
  readonly name = 'openpyxl_spreadsheet_design';
  readonly description =
    'Universal openpyxl spreadsheet design standards for professional XLSX workbooks: user-directed layout, context-driven colors, column sizing, print setup, formulas, freeze panes, and readable formatting.';
  readonly category: SkillCategory = 'data';

  getPromptContext(): string {
    return `## OpenPyXL Spreadsheet Design Standards

### Priority Order
1. Follow the user's requested tabs, columns, colors, and print format first.
2. If team or organization brand colors are present in context, derive workbook accents from those colors.
3. If no brand colors are available, use restrained high-contrast neutrals and functional tints. Do not force a fixed palette.

### Sheet Count Rule
- Do not create extra tabs just to look sophisticated.
- Use one sheet for single-board or physical print artifacts.
- Use multiple sheets only when the artifact naturally has distinct work areas or the user asks for tabs.

### Required OpenPyXL Hygiene
- Prefer compact, data-driven scripts: define row/section arrays plus reusable render functions, then loop. Do not generate hundreds of manual ws.cell(...) assignments or one massive unclosed list literal.
- Keep Python code complete and bounded: all brackets/quotes closed, helper functions defined before use, workbook saved to OUTPUT_DIR at the end.
- Set every worksheet gridlines on: ws.views.sheetView[0].showGridLines = True.
- Freeze headers when tables scroll: ws.freeze_panes = "A2" or "A3".
- Repeat print headers for long sheets: ws.print_title_rows = "1:2" when useful.
- Fit to page for print artifacts: ws.sheet_properties.pageSetUpPr.fitToPage = True; ws.page_setup.fitToWidth = 1.
- Use narrow margins for sideline sheets and normal margins for office/reporting workbooks.
- Auto-fit columns by scanning content length; keep minimum widths around 10-12 and cap long notes columns.
- Apply wrap_text=True to notes, coaching cues, and descriptions.
- Strip leading # from hex colors before passing them to openpyxl.

### Formula Rules
- Use real Excel formulas for totals, counts, averages, percentages, variances, rep counts, and rollups.
- Prefer named helper variables or computed cell references instead of hardcoded totals.
- Use number formats: currency, percentages, integers, decimals, dates, and times as appropriate.

### Visual Quality Rules
- Make header rows bold with strong contrast.
- Use thin borders for tables and clear section separation.
- Center short codes/numbers; left-align long text.
- Use row heights that prevent clipping.
- Validate the workbook can be opened by Excel by saving to /home/user/outputs with a clear .xlsx file name.`;
  }
}
