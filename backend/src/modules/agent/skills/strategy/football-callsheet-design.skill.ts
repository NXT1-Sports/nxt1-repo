/**
 * @fileoverview Football Callsheet Design Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 */

import { BaseSkill, type SkillCategory, type SkillReferenceImage } from '../base.skill.js';

const CALLSHEET_REFERENCE_IMAGE_PATH =
  '/reference-assets/callsheet/maumelle-callsheet-reference.png';

function resolveRouteBase(params?: Record<string, unknown>): string | null {
  const explicit =
    typeof params?.['agentRouteBase'] === 'string' ? params['agentRouteBase'].trim() : '';
  if (explicit.length > 0) return explicit.replace(/\/+$/, '');

  const configured = process.env['AGENT_X_CALLSHEET_REFERENCE_IMAGE_URL']?.trim();
  if (configured) return null;

  return `${(process.env['BACKEND_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '')}/api/v1/agent-x`;
}

export class FootballCallsheetDesignSkill extends BaseSkill {
  readonly name = 'football_callsheet_design';
  readonly description =
    'Design game-day football callsheets and play menus as coach-ready printable multi-panel PDFs using the Maumelle-style dense reference layout: one landscape board, many compact side-by-side panels, numbered rows, situational color bands, print setup, and functional color coding. Use editable spreadsheets only when explicitly requested.';
  readonly category: SkillCategory = 'strategy';

  override getReferenceImages(params?: Record<string, unknown>): readonly SkillReferenceImage[] {
    const configured = process.env['AGENT_X_CALLSHEET_REFERENCE_IMAGE_URL']?.trim();
    const routeBase = resolveRouteBase(params);
    const url = configured || (routeBase ? `${routeBase}${CALLSHEET_REFERENCE_IMAGE_PATH}` : '');
    if (!url) return [];

    return [
      {
        url,
        name: 'Maumelle-style staff callsheet reference',
        mimeType: 'image/png',
      },
    ];
  }

  getPromptContext(): string {
    return `## Football Callsheet And Play Menu Design

  ### Default Artifact Route
  - Default to \`render_html_pdf\` for game-day callsheets and play menus. These are sideline print tools first.
  - Use \`execute_python_code\` / XLSX only when the user explicitly asks for Excel, XLSX, spreadsheet, workbook, or editable sheet output.
  - Do not use \`dynamic_export\` as the primary callsheet route unless the user asks for a Gamma-style report/deck/packet instead of a sideline board.

### Sheet Count Rule
  - Default to one unified landscape board for game-day callsheets and play menus.
  - Split into multiple files/pages/tabs only if the user asks, or if the deliverable must separate offense, defense, special teams, or opponent sections.

### Board Layout Rule
- A real football callsheet should usually be a dense multi-panel board across the page, not one long vertical table.
- Build multiple side-by-side panels on the same landscape PDF page using compact cards/panels separated by narrow gutters. For explicit XLSX asks, use equivalent worksheet column groups.
- Each panel can have its own mini-table with compact columns such as #, personnel, formation, and play/call.
- Stack smaller situational sections vertically inside each panel to maximize printed space.
- Use one long vertical table only when the user explicitly asks for a simple list/table export.

### Default Reference Layout: Maumelle-Style Staff Callsheet
Use the canonical reference image at \`backend/src/modules/agent/skills/assets/callsheet/maumelle-callsheet-reference.png\` as the default visual model when no better user sample is supplied. It is a layout reference, not a content template.
- If the runtime has this image attached or hosted as a URL, inspect it visually and mirror its density, lane structure, colored section bars, and row rhythm.
- If the image is not available to the model as a multimodal attachment, follow the textual blueprint below exactly.
- One landscape worksheet with a single full-width title band at the top.
- Dense grid of 6-7 vertical panel lanes across the page.
- Each lane contains stacked mini-sections with colored section headers and numbered rows.
- Row density is high: small readable font, tight row heights, thin borders, minimal whitespace.
- Each mini-section usually has a narrow number/index column plus one or more compact play/call columns.
- Typical top-band sections: 1st Half Script, Openers, 2nd Short, 2nd Medium, 2nd Long, 2nd 12+.
- Typical middle-band sections: 2nd Half Script, 3rd Short, 3rd Medium, 3rd Long, 3rd 12+, 4th Down.
- Typical bottom-band sections: plays/formations worked, short yard/goal line, tricks, red zone, green zone, run series, 3-step series, sprint outs, screens, specials, reminders.
- Use colored header bars to communicate function: blue/green/yellow/red/orange section bands, with exact colors adapted to user/team context.
- If the user supplies their own callsheet image/PDF/XLSX sample, mirror that sample over this default reference.

### Python Generation Pattern
- Use a compact data-driven renderer, not hundreds of manual cell writes.
- Define PANELS as a compact list of dictionaries: lane title, start column, lane width, sections, header fill intent, and numbered rows.
- Define helper functions such as write_panel_header, write_column_headers, write_section_header, write_play_row, and render_panel.
- Loop over PANELS and sections to render the board. This prevents truncated Python code and keeps the workbook editable.
- If many plays are needed, include representative rows first and keep names/notes compact; do not paste an entire playbook database into the Python code.
- Use a section color resolver like resolve_section_fill(section_name, team_colors) so colors are functional and dynamic, not hardcoded to one team.

### Typical Panel Arrangement
- Lane 1: 1st Half Script / 2nd Half Script / Plays-Formations Worked / Run Series
- Lane 2: Openers / 3rd Short / Short Yard-Goal Line Run / 3-Step Series
- Lane 3: 2nd Short / 3rd Medium / Short Yard-Goal Line Pass / Sprint Outs
- Lane 4: 2nd Medium / 3rd Long / Tricks / Screens / Specials
- Lane 5: 2nd Long / 3rd 12+ / Red Zone / XA or constraint runs
- Lane 6: 2nd 12+ / 4th Down / Green Zone / Reminders
- Adapt these panel names to the user's system and request; do not force football terminology that does not fit.

### Callsheet Structure
Organize by coach decision buckets, not generic categories. Typical buckets include:
- Openers / Script
- 1st and 10
- 2nd Down
- 3rd Short / Medium / Long
- Red Zone
- Goal Line / Short Yardage
- Backed Up
- 2-Minute
- 4-Minute
- Shot Plays
- Must-Haves / Best Calls

### Columns
Use compact columns that coaches scan during a game:
- Call / Play
- Formation / Personnel
- Motion / Shift
- Protection / Front / Coverage
- Primary Read / Target
- Hash / Field Zone
- Notes / Alerts / Tags

### Color & Visual Rules (Universal Coaching Colors Over Team Branding)
- **Do NOT flood the callsheet panels with team brand colors.** Callsheets are sideline scan tools, not marketing flyers. Overusing team colors (e.g. making all sections navy, purple, or red) destroys scan speed.
- **Team Brand Colors**: Restrict team colors strictly to the top title banner / header band or logo area.
- **Situational Panel Colors (Universal Football Coaching Standard)**: Every situational section MUST use distinct, high-contrast functional colors so coaches' eyes jump immediately to the right bucket:
  - 🟩 **Green**: 1st & 10, Openers, 1st Half Script, Base Runs, Normal D&D
  - 🟥 **Red**: Red Zone, Goal Line, Hot Blitz / Pressure Checks, Must-Alerts
  - 🟦 **Blue**: 3rd Down Ladders (3rd Short, Medium, Long, 12+), Dropback Pass, Protections
  - 🟨 **Yellow / Gold / Orange**: Shot Plays, 2-Minute Drill, Tricks / Constraints, Screens, Sudden Change
  - 🟪 **Purple / Cyan / Slate**: Special packages, 4-Minute, Personnel groupings, Reminders, Green Zone
- Keep row backgrounds clean (white / light-tint zebra) and section headers bold with high-contrast text (white on dark/saturated headers, dark on yellow/light headers).
- Keep play calls uppercase where fast scanning matters.
- Keep rows compact enough for printing but tall enough for notes to wrap.
- Use fit-to-width print settings and repeat header rows on printed pages.
- Use landscape orientation, tight margins, small but readable fonts, and fit-to-width print setup for sideline boards.
- The finished callsheet should read as one of the functional color-coded boards coaches use first and a file format second.

### Quality Gate
- The final sheet should feel like a sideline tool, not a report.
- It should look like a laminated coach board: multiple color-coded sections, dense columns, minimal whitespace, and no narrative paragraphs.
- Keep everything printable and immediately usable on game day.`;
  }
}
