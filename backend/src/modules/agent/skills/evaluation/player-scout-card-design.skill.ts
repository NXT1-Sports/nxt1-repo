/**
 * @fileoverview Player Scout Card Design Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class PlayerScoutCardDesignSkill extends BaseSkill {
  readonly name = 'player_scout_card_design';
  readonly description =
    'Design individual player scout cards for coaches and staff across multiple output modes: Gamma/PPTX scout-card decks, report-style PDF packets, printable player cards, and image-based scout cards.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(): string {
    return `## Player Scout Card Design

### Coach Usage Modes
- Coaches use player scout cards in three different ways:
  1. **Meeting / install deck** — slide-by-slide cards for staff or players
  2. **Report / packet PDF** — multi-player scouting packet or opponent personnel packet
  3. **Single card / image asset** — a printable or shareable standalone scout card
- This skill is for **player-focused** cards, not scout-team look cards for practicing opponent plays.

### Routing Rules
- If the user wants a deck, slide packet, player packet, scout-card packet, opponent briefing deck, or report-style PDF with multiple player cards, use \`dynamic_export\` / Gamma.
- If the user wants a printable single-card PDF or one-page sheet of player cards, use \`render_html_pdf\`.
- If the user wants a single graphic/image scout card, social-style stat card, or visual promo-style scout card, use \`generate_graphic\`.
- Use \`execute_python_code\` only if the user explicitly asks for an editable spreadsheet/workbook companion.

### Gamma / Deck Rules
- For \`dynamic_export\`, use one logical player card per section/slide.
- Pass \`imageUrls\` whenever actual player photos, team logos, charts, or film stills exist.
- Gamma is the preferred lane for multi-player packets, opponent personnel decks, and report-style scout cards that coaches will walk through in meetings.
- If no real player image exists, keep the card text-forward; do not invent portraits.

### Printable HTML/PDF Rules
- For \`render_html_pdf\`, build a clean card or multi-card board with strong hierarchy:
  - player name / number / position
  - role summary
  - measurable traits / strengths / alerts
  - usage notes / matchup keys / coaching points
- Real images may be embedded with HTML \`<img>\` tags.
- If the coach asks for a layout with an image region and no actual image is available, include a clearly labeled placeholder region only in the printable HTML/PDF version.

### Graphic Image Rules
- For \`generate_graphic\`, use actual subject imagery when available.
- Do not create empty fake portrait slots for finished image graphics.
- If no player photo exists and the user still wants a visual image card, design a text-forward scout card with typography, iconography, and team/opponent colors rather than a fake headshot panel.

### Card Content
- Player identity: name, number, position, handedness/role when relevant
- Key traits: size/speed/strength/usage metrics
- Top tendencies or signatures
- Matchup caution / attack point / coaching emphasis
- Confidence level when evidence is thin

### Quality Gate
- The card format must match how the coach intends to use it: deck, report packet, printable card, or image.
- Do not default every scout card request into one lane. Choose the lane from how the coach will consume it.`;
  }
}
