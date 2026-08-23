/**
 * @fileoverview Scout Team Card Design Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class ScoutTeamCardDesignSkill extends BaseSkill {
  readonly name = 'scout_team_card_design';
  readonly description =
    'Design printable full-page scout team play cards for coaches and scout-team players: opponent play/look cards, scout-period assignment cards, mimic cards, central diagram placeholders, and quick-read practice references built from opponent formations, motions, plays, and responsibilities.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## Scout Team Card Design

### What Coaches Actually Want
- Scout team cards are usually practical field tools, not narrative reports.
- Coaches use them to hand a scout-team player or position group a quick opponent-look assignment for practice: what formation to line up in, what motion/tag to use, what play/look to simulate, and what assignment or coaching point matters.
- These are usually **opponent play/look cards**, not opponent player bio cards.
- The default deliverable should feel printable, cuttable, and easy to hand out in practice.

### Clarification Rule
- If the user only says "scout team cards" and does not say whether they mean play/look cards or player/personnel scout cards, ask one concise clarification: "Do you want scout-team play/look cards for practice, or player/personnel scout cards?"
- If the user says "no questions," "do it now," "use test info," "placeholder," or similar, do NOT ask. Proceed as scout-team **play/look cards** with placeholder opponent plays, formations, motions, assignments, and coaching cues.
- Do not interpret a bare scout team card request as opponent player bio/profile cards unless the user explicitly mentions player cards, personnel cards, roster cards, athlete profiles, headshots, measurables, or player-by-player scouting.

### Primary Routing Rule
- Default to \`render_html_pdf\` for scout team cards, scout-team mimic cards, scout role cards, scout practice cards, and printable full-page play/look cards.
- Use \`layoutIntent: "best_fit_operational"\` for ordinary full-page printable scout play cards.
- Use \`layoutIntent: "exact_match"\` only when matching a supplied scout card reference, fixed paper geometry, or a laminated card size exactly.
- Only use \`execute_python_code\` when the user explicitly asks for an editable spreadsheet/workbook companion.
- Do not use \`dynamic_export\` as the primary lane for scout team cards unless the user is really asking for a report/deck/packet rather than printable cards.
- If the user actually wants opponent **player** cards, personnel profiles, or player-by-player scout packets, that is a different deliverable and should use the player scout card lane instead.

### Layout Patterns
- Default output pattern: **one scout play/look card per PDF page**.
- Treat the whole landscape page as the card canvas. The card should fill roughly 90-95% of the printable page width and height, not sit as a shallow strip with blank space below it.
- Do not rely on \`height: 100%\` alone. Define an explicit fixed page wrapper so browser PDF rendering cannot collapse the card height.
- Recommended LETTER landscape HTML/CSS blueprint:
  - \`@page { size: Letter landscape; margin: 0; }\`
  - \`html, body { width: 11in; height: 8.5in; margin: 0; }\`
  - \`.page { width: 11in; height: 8.5in; padding: 0.25in; }\`
  - \`.card { width: 10.5in; height: 8in; display: grid; grid-template-rows: 0.65in 1fr 0.55in; }\`
  - \`.main { display: grid; grid-template-columns: 7.4in 2.7in; min-height: 6.6in; }\`
  - \`.diagram-zone { min-height: 5.8in; }\`
- For LEGAL landscape, scale the card wider but keep the diagram zone at least 5.8in tall.
- Each page/card should have:
  - a shallow top header with card number, opponent/play name, personnel, formation, and situation; keep this header under ~12% of the page height
  - a dominant field-sized DIAGRAM / LOOK CARD placeholder region where the real play diagram or look image goes; target roughly 70-80% of page width and 55-65% of page height
  - surrounding text notes/data blocks for alignment, motion, assignment, scout keys, coaching reminders, tempo, hash, and practice period
  - a compact footer or side rail for opponent, week/date, scout team group, and staff notes
- Prefer a layout like: header band on top, huge central diagram box, narrow side rail or bottom strip for scout keys. Do not make the diagram box a short horizontal strip.
- Use one page with multiple mini cards only if the user explicitly asks for a compact/cut-sheet layout.
- Use two-sided front/back practice cards only when the user explicitly asks for that structure.
- Keep each full-page card scan-fast: big play/look name, compact notes, high-contrast sections, restrained branding.
- Avoid leaving large unused whitespace. If a page has too much empty space, enlarge the diagram placeholder and distribute the notes into side/bottom panels.
- If the diagram placeholder is not the largest block on the page, the layout is wrong.
- If the rendered card occupies only the top third of the page, the CSS is wrong; rebuild with explicit inch-based page/card heights before calling render_html_pdf.

### Card Content
- Opponent formation / personnel / alignment
- Motion / shift / tag / strength call when relevant
- Play / concept / family to mimic
- Scout-team assignment or role reminder
- Coaching point / alert / tendency cue
- Practice period / script bucket / scout emphasis when relevant
- Optional small role label such as QB / RB / WR / H / OL / Front / Coverage shell when the card is position-specific
- Keep the scout-look information as text notes and structured data around the card. Do not write out a fake diagram, route drawing, or field sketch in prose.

### Image & Placeholder Rules
- \`render_html_pdf\` may include real images via HTML \`<img>\` tags for diagrams, screenshots, logos, or scout-look visuals when the asset exists.
- If the coach wants a printable card layout with a future diagram/photo slot and no real image is available, include a clean labeled placeholder block such as "DIAGRAM", "LOOK CARD", or "PHOTO" instead of inventing an image.
- The placeholder should normally be the visual center of the card, with the text/data blocks arranged above, below, or beside it.
- Use placeholders only for printable HTML/CSS card layouts, not for generated graphics that are supposed to look fully finished.
- Placeholder regions should be visually empty or lightly ruled areas with a label. They should not contain invented routes, arrows, formations, player dots, field markings, or diagram-like prose unless a real diagram/image source is provided.
- The placeholder must look like the main field/play area, not a thin input field. Use a large bordered rectangle with room for a coach to draw the play.

### Visual Rules
- Use compact headers, clean borders, muted background fields, and one accent color family per card type.
- Keep team branding mainly in the title strip or footer accent, not in every content cell.
- Prioritize scan speed, cut lines, and print clarity over decorative effects.

### Quality Gate
- The result should look like a coach-prepared practice handout that can be printed immediately.
- A normal scout team play-card PDF should produce one readable full-page card per page, not tiny multi-card grids.
- The card must visually occupy the page. A top-only band with most of the page blank is not acceptable.
- The diagram/look placeholder should visually dominate the card. A skinny middle diagram strip is not acceptable.
- The diagram zone must have a concrete CSS height/min-height, not just a flex percentage.
- It should teach the scout team what opponent **play/look** to simulate, not drift into a recruiting card, roster card, or player biography.
- If the coach asked for cards, do not drift into a worksheet, long report, or slide deck unless they explicitly asked for that format.

### Final Response Reminder
- When delivering scout team cards with placeholder diagram/look slots, mention briefly that the coach can later send real opponent diagram images, look-card screenshots, or play images and you can drop them into the matching slots and rerender the PDF from the saved HTML source.`;
  }
}
