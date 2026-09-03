/**
 * @fileoverview Football Matchup Starters Card Design Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 */

import { BaseSkill, type SkillCategory, type SkillReferenceImage } from '../base.skill.js';

const MATCHUP_STARTERS_REFERENCE_IMAGE_PATH =
  '/reference-assets/football/matchup-starters-reference.png';

function resolveRouteBase(params?: Record<string, unknown>): string | null {
  const explicit =
    typeof params?.['agentRouteBase'] === 'string' ? params['agentRouteBase'].trim() : '';
  if (explicit.length > 0) return explicit.replace(/\/+$/, '');

  const configured = process.env['AGENT_X_MATCHUP_STARTERS_REFERENCE_IMAGE_URL']?.trim();
  if (configured) return null;

  return `${(process.env['BACKEND_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '')}/api/v1/agent-x`;
}

export class FootballMatchupStartersCardDesignSkill extends BaseSkill {
  readonly name = 'football_matchup_starters_card_design';
  readonly description =
    'Design printable football matchup starters cards that mirror coach-supplied lineup board references: offensive and defensive starters by matchup and position, 11v11 split-board layouts, fixed geometry player tiles, and front/back staff-ready exports.';
  readonly category: SkillCategory = 'strategy';

  override getReferenceImages(params?: Record<string, unknown>): readonly SkillReferenceImage[] {
    const configured = process.env['AGENT_X_MATCHUP_STARTERS_REFERENCE_IMAGE_URL']?.trim();
    const routeBase = resolveRouteBase(params);
    const url =
      configured || (routeBase ? `${routeBase}${MATCHUP_STARTERS_REFERENCE_IMAGE_PATH}` : '');
    if (!url) return [];

    return [
      {
        url,
        name: 'Football matchup starters card reference',
        mimeType: 'image/png',
      },
    ];
  }

  getPromptContext(): string {
    return `## Football Matchup Starters Card Design

### What This Artifact Is
- This is NOT a generic depth chart, not a scout-team play card, and not a play diagram.
- Treat it as a **Matchup Starters Card**: a coach-facing football board showing offensive and defensive starters by matchup and position in a fixed 11v11 layout.
- The coach usually wants a sheet that mirrors a known staff format exactly, with player tiles arranged by side of ball and role rather than a simple list of first string / second string.

### Primary Routing Rule
- Default to \`render_html_pdf\` for this artifact.
- When the user supplies a sample image, says "make it look exactly like this," or the physical geometry matters, use \`layoutIntent: "exact_match"\`.
- Do NOT route this artifact to \`create_play_diagram\`; this is a lineup board/card layout, not a drawn play concept.
- Do NOT route this artifact to \`execute_python_code\` unless the user explicitly asks for an editable spreadsheet or workbook companion.

### Reference Layout Rule
- Use the canonical reference image at \`backend/src/modules/agent/skills/assets/football/matchup-starters-reference.png\` when no better user sample is supplied.
- If the runtime has this image attached or hosted as a URL, inspect it visually and mirror the tile sizes, split-board hierarchy, color accents, and information density.
- If the image is not available to the model as a multimodal attachment, follow the textual blueprint below exactly.
- If the user supplies their own sample card, preserve that sample's section order, abbreviations, grouping, and spacing over the default reference.

### Layout Blueprint
- Default page: LETTER landscape.
- Use explicit print geometry:
  - \`@page { size: Letter landscape; margin: 0; }\`
  - \`html, body { width: 11in; height: 8.5in; margin: 0; }\`
  - \`.sheet { position: relative; width: 11in; height: 8.5in; padding: 0.2in 0.24in; }\`
- Treat the front side as one dense board that occupies the page edge to edge with minimal waste.
- The front side should usually read as:
  - top band for metadata such as opponent, date, week, and quick coordinators notes
  - offensive starter area on one half of the page
  - defensive starter area on the other half of the page
  - a clear midfield divider or center rule separating the two units
  - small side or footer modules for notes, coordinator reminders, and schedule details
- Use fixed-position or deterministic grid placement for player tiles. Do NOT let the layout reflow freely like a responsive web page when matching a sample.
- Player tiles should read quickly: jersey number, name, position, small matchup note, and optional stat/tendency note.
- Use headshots only when real images exist; otherwise fall back to initials/jersey-first tiles.

### Content Rules
- Prioritize offensive and defensive starters by matchup and position.
- Support matchup-specific labels when useful: field/boundary, left/right, strong/weak, Mike/Will/Sam, nickel, rover, edge, slot, H, X, Z, etc.
- Allow small contextual notes such as height/weight, year/class, stat highlights, or coaching tags when the sample format expects them.
- Do not invent stats, photos, or opponent details that are not present in context.
- If information is missing, prefer a clean blank or short placeholder label over fabricated content.

### Front / Back Rule
- If the user asks for front and back, build a deliberate 2-page paired export.
- Page 1 is the front-side matchup starters board.
- Page 2 is the back-side companion board using the same geometry discipline.
- The back side may contain assignments, tendency cues, alternate packages, reminders, or matchup notes, but it must still look like a designed coaching artifact rather than a loose notes page.
- Duplex printing is a print setting AFTER the two-page artifact is prepared. Do not assume printer duplex alone can create the back-side design.

### Visual Rules
- Keep the artifact scan-fast and coach-first.
- Use restrained football document color coding: offense and defense should be visually distinct without turning the whole page into a branding poster.
- Preserve the sample's hierarchy and density before trying to beautify it.
- When the user says exact match, prioritize geometry, spacing, and board structure over stylistic reinterpretation.

### Quality Gate
- The result should look like a real coach-prepared lineup board that could be printed immediately.
- It should materially resemble the supplied sample in structure and density.
- It must not collapse into a simple roster table or ordinary depth chart.
- It must not drift into a play diagram, slide deck, or generic report.
- For exact-match requests, the page should feel fixed and intentional, not fluid or web-like.`;
  }
}
