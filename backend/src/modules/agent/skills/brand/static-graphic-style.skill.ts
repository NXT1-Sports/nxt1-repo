/**
 * @fileoverview Static Graphic Style Skill
 * @module @nxt1/backend/modules/agent/skills/brand
 *
 * Provides the Brand & Media Coordinator with the exact visual design
 * guidelines for generating static graphics (promo cards, welcome graphics,
 * stat cards, player cards, announcement designs).
 *
 * This is the SINGLE SOURCE OF TRUTH for static graphic brand guidelines.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class StaticGraphicStyleSkill extends BaseSkill {
  readonly name = 'static_graphic_style';
  readonly description =
    'Sports graphic design guidelines for promo cards, welcome graphics, stat cards, player announcements, commitment graphics, typography, and layout composition.';
  readonly category: SkillCategory = 'brand';

  getPromptContext(_params?: Record<string, unknown>): string {
    return `## Static Graphic Design Guidelines

### Brand Identity
- NXT1 brand identity: bold, modern, premium sports media aesthetic
- Every graphic must feel like it came from ESPN, Bleacher Report, or an official college program
- Always include subtle NXT1 branding ("NXT1 • The Future of Sports Intelligence")

### Typography
- Bold sans-serif typefaces (Montserrat, Oswald, or similar)
- Strong visual hierarchy: ALL-CAPS for athlete names and headings
- High contrast text — white or bright on dark backgrounds
- Name font size must dominate the composition

### Color & Palette
- Choose an original palette that matches the requested mood and improves readability
- Dark backgrounds (#0A0A0F to #1A1A2E) with vibrant accent gradients
- Neon accent highlights for key stats and borders

### Layout & Composition
- Clean composition with dynamic gradients and geometric energy elements
- Asymmetric layouts with strong focal point on the athlete
- Stat callouts in pill-shaped badges or bordered cards
- Subtle motion blur or light streak effects for energy

### Subject Image Fidelity (Mandatory)
- When the user provides an athlete image, treat the task as strict compositing, not free character generation
- The output must preserve the exact person from the source photo (face, skin tone, hair, body proportions, visible identity details)
- Allowed changes: cutout, relighting, color grading, background replacement, typography overlays
- Forbidden changes: new face, different athlete, body double, ethnicity change, jersey number change
- If fidelity cannot be preserved, keep the original subject untouched and only style the background/layout

### Welcome Graphics
- Personalize with user's name, sport, and position
- Athletes: energetic, motivational welcome card
- Teams: official program announcement card
- Call generate_graphic with structured parameters and userId

### Tool Calling Structure (Required)
- Always set graphicType in generate_graphic:
  - athlete graphic -> graphicType: "athlete"
  - team graphic -> graphicType: "team"
- For athlete graphics, provide athleteInfo whenever available:
  - name, sport, position, team
- For team graphics, provide teamInfo whenever available:
  - name, sport, subtitle
- textRequirements must contain only real on-canvas information. Never use placeholders like "athlete" or "team" as standalone text.
- If textRequirements is empty, pass athleteInfo/teamInfo so the tool can default to real identity data.

### Rules
- Keep text on graphics short and impactful — no paragraphs
- NEVER fabricate or hallucinate image URLs — only use URLs from tool results
- NEVER invent a new athlete when a source photo is provided
- ALWAYS call generate_graphic to create visuals — never describe what you "would" create`;
  }
}
