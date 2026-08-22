/**
 * @fileoverview HTML/CSS Design Engineering Skill
 * @module @nxt1/backend/modules/agent/skills/brand
 *
 * Teaches coordinators to approach any HTML/CSS artifact like an elite
 * frontend engineer + designer rather than a generic document formatter.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class HtmlCssDesignEngineeringSkill extends BaseSkill {
  readonly name = 'html_css_design_engineering';
  readonly description =
    'Professional HTML/CSS design engineering for websites, landing pages, fixed-layout PDFs, screenshot recreation, typography, spacing systems, component structure, layout composition, and render-review-refine workflows.';
  readonly category: SkillCategory = 'brand';

  getPromptContext(_params?: Record<string, unknown>): string {
    return `## HTML/CSS Design Engineering

Treat every HTML/CSS deliverable like elite frontend product work, not like a generic export.
The standard is: deliberate composition, strong visual hierarchy, reusable structure, and production-quality layout decisions.

### Core Mindset
- First decide what the layout is, then write code.
- Think in regions, components, spacing rhythm, hierarchy, and alignment before thinking in raw divs.
- The code should feel like it was written by a senior frontend engineer with strong design taste.
- Never settle for “technically valid but visually generic” HTML/CSS when the request is design-sensitive.

### Layout System Selection
- Use CSS Grid when the design is region-based, two-dimensional, or magazine/dashboard-like.
- Use Flexbox for one-dimensional alignment inside already-defined regions.
- Use absolute positioning only when the job is true screenshot/paper-layout recreation and exact geometry matters.
- For exact-match print/PDF layouts, define a fixed paper canvas first and position cards/regions on it intentionally.
- For normal web UI, preserve responsiveness and avoid absolute positioning unless the design truly demands it.

### Visual Quality Rules
- Always establish a clear typography scale: title, section title, label, body, metadata.
- Use a deliberate spacing system instead of random pixel values.
- Use CSS custom properties for colors, spacing, borders, radii, and type sizes when the layout has more than a few elements.
- Preserve whitespace. Empty space is part of the design, not wasted area.
- Avoid default browser-looking output. If it looks like an unstyled internal tool, the design is not finished.

### Composition Rules
- Break the page into visual zones before writing markup.
- Build reusable structural primitives such as card, label band, stat row, player box, header block, and section rail.
- For screenshot/reference recreation, match the reference hierarchy first: title bars, section separators, box sizes, alignment, and inter-box distances.
- Do not flatten a spatial reference into a simple row, list, or table unless the reference itself is a row, list, or table.

### HTML Quality Rules
- Use semantic structure where practical: header, main, section, article, aside, footer.
- Keep DOM structure intentional; avoid deeply nested wrapper soup when one container would do.
- Name classes by role, not by vague appearance only. Examples: position-card, section-band, depth-chart-canvas, roster-column.
- Build repeating elements as clear repeated patterns instead of ad-hoc one-off markup.

### CSS Quality Rules
- Encode hierarchy with weight, size, contrast, and spacing rather than only color.
- Use consistent borders, strokes, and radii across sibling elements.
- Control text wrapping, overflow, truncation, and line height on purpose.
- For print/PDF work, always think about page size, print margins, physical dimensions, and page breaks.
- For screen UI, always think about responsive shrink/stretch behavior and mobile breakpoints.

### Exact Reference Recreation Workflow
- When the user provides a screenshot, mockup, flyer, chart, form, or paper reference, infer:
  - overall canvas size and orientation
  - primary zones
  - box/card dimensions
  - alignment rules
  - whitespace rhythm
  - visual emphasis order
- Then reconstruct the layout with fixed geometry or explicit grid regions.
- Never answer an exact recreation request with a generic evenly spaced row layout unless the reference itself is that simple.

### Frontend Polish Expectations
- The first draft should already have intentional hierarchy and structure.
- If the output is meant to feel premium, the code should include a real design system: spacing tokens, type scale, region logic, and visual consistency.
- When a first pass is likely rough, render-review-refine mentally before finalizing. Ask: does this actually look designed, or merely assembled?

### Anti-Patterns
- Do not dump text into a page and call it a layout.
- Do not use evenly distributed flex rows as a substitute for true composition.
- Do not rely on browser defaults for margins, fonts, heading scales, or table appearance.
- Do not approximate a reference with “close enough” generic blocks when the user clearly wants the same structure.

### Final Quality Gate
Before considering HTML/CSS complete, verify:
- the layout system matches the problem
- hierarchy is obvious at a glance
- whitespace and alignment feel intentional
- repeated elements share a consistent component structure
- the result looks like professional UI/editorial/layout work rather than raw generated markup`;
  }
}
