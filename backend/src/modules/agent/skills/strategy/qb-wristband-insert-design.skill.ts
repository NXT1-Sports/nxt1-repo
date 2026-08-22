/**
 * @fileoverview QB Wristband Insert Design Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class QbWristbandInsertDesignSkill extends BaseSkill {
  readonly name = 'qb_wristband_insert_design';
  readonly description =
    'Design QB, signal-caller, catcher, sideline, and position wristband insert ' +
    'layouts as exact-fit PDF printables first, with optional spreadsheet source sheets only when explicitly requested, using physical card layouts (4.75" x 2.5" adult, 4.0" x 3.0" youth), ' +
    'call numbers, high scan readability, and print-ready sizing.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## QB And Signal-Caller Wristband Insert Design

### Physical Form Factor & Dimensions
- A quarterback wristband card MUST be formatted as a physical paper insert that fits inside a clear vinyl window.
- **Adult Standard Size**: **4.75" x 2.5"** (120mm x 64mm).
- **Youth Standard Size**: **4.0" x 3.0"** (102mm x 76mm).
- Multi-window / tri-fold inserts: multiple cards sized to **4.75" x 2.5"** per window tab.
- Common grid layouts:
  - **3 columns x 10 rows** (30 total calls) — standard balanced density.
  - **2 columns x 15 rows** (30 total calls) — vertical split.
  - **1 column x 20 rows** (20 calls) — fast 2-minute / emergency package.
- Set print layout and page geometry to fit the exact card dimensions with minimal margins and cut-line guides.

### Sheet Count & Routing Rules
- Default to one tab for the primary wristband insert card.
- Use additional tabs only for separate card inserts requested by the coach, such as Card 1 (Base/Openers), Card 2 (3rd Down/Red Zone), Two-Minute, or Defense.
- Wristband inserts should default to \`render_html_pdf\` with explicit width/height matching the physical window (**4.75" x 2.5"** adult or **4.0" x 3.0"** youth) and \`@page\` geometry.
- Only use an XLSX/spreadsheet build when the user explicitly asks for an editable source sheet, a call-number mapping table, or a workbook companion to the printable insert.
- When generating as a spreadsheet companion, configure tight column widths, small compact cell padding, and fit-to-page print bounds.

### Readability & Scan Rules (Under Helmet / Under Two Seconds Gate)
- **Call Number IDs**: Large, bold numbers (e.g. **1** to **30**) so the player or signal caller locates the number in under 2 seconds.
- **Call Text**: Short, uppercase, high-contrast text with compact terminology (e.g., \`12 | GL TRIO RT 18 REACH\`, \`24 | EMPTY RT VERTS CHECK\`).
- **No Long Prose**: Avoid descriptive sentences; use concise personnel, formation, play, and tag tokens.
### Functional Color Coding (Universal Football Colors Over Team Branding)
- **Do NOT flood the wristband with team brand colors.** Overusing team colors makes all cells look the same and ruins rapid in-game scanning.
- Restrict team brand colors solely to an optional top header card title or border accent.
- Grid cell backgrounds and call family blocks MUST use universal functional coaching colors:
- Organize the insert into functional color blocks so the play family is recognizable before the text is fully read.
  - 🟩 **Green**: Run / Inside Zone / Outside Zone / Gap / Power
  - 🟦 **Blue**: Dropback Pass / Quick Game / Boot / Sprintout
  - 🟨 **Yellow / Gold / Orange**: RPO / Screens / Gadget / Constraint Plays
  - 🟥 **Red**: Red Zone / Goal Line / 2-Minute Drill / Shot / Hot Blitz Checks
- Ensure strict high contrast: black text on yellow/light-green cells, crisp white text on red/blue cells.
- A quarterback under center must recognize the play type instantly by the color block alone.

### Python Generation Pattern
- Prefer a compact CALLS array (or similarly named structured list) plus reusable render helpers instead of hundreds of manual cell writes.

### Required Fields Per Cell / Slot
- **Call Number** (prominent)
- **Play / Signal Name**
- **Formation / Personnel Tag**
- **Direction / Motion Tag**
- **Alert / Read Key** (when space allows)

### Quality Gate
- A quarterback or signal caller must be able to glance at their wrist and identify the play call under two seconds.
- The output must look and print as an authentic laminated physical wristband insert, not a generic spreadsheet or document table.
- If text overflows cell boundaries or requires squinting, abbreviate the play call tokens to preserve readability.`;
  }
}
