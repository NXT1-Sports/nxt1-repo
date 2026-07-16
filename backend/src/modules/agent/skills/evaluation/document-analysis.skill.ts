/**
 * @fileoverview Document Analysis Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 *
 * Orchestrates the full document analysis pipeline: parsing uploaded documents,
 * rendering PDF pages for visual review when needed, and analyzing extracted/rendered
 * images using vision models.
 *
 * Loaded by: PerformanceCoordinatorAgent, DataCoordinatorAgent, StrategyCoordinatorAgent
 * Invokes: parse_document, render_pdf_pages, analyze_image tools (media tier)
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class DocumentAnalysisSkill extends BaseSkill {
  readonly name = 'document_analysis';
  readonly description =
    'Parse uploaded documents (PDFs, Word, Excel, HTML), extract text and images, ' +
    'render PDF pages for diagram-heavy playbooks or film breakdowns, analyze extracted/rendered images with vision, ' +
    'and synthesize multi-modal analysis for tactics, formations, strategy, scouting, and coaching insights.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(): string {
    return `## Document Analysis Pipeline

Use \`parse_document\` → \`render_pdf_pages\` (if needed) → \`analyze_image\` to convert uploaded documents into actionable insights.

### Document Parse Workflow

**When user uploads a document:**
1. Call \`parse_document\` with the document URL or storage path.
2. Inspect the returned \`metadata\`:
   - \`parseMode\`: 'ocr' (PDF with OCR) | 'auto' (non-PDF) | 'fallback' (local PDF text extraction)
   - \`requiresVisionReview\`: true if diagram-heavy (playbook, formation, coverage, route sheet, tactical diagram detected)
   - \`visionAssetSource\`: 'firecrawl_images' (images extracted) | 'rendered_pages_required' (no images, pages need rendering) | 'none' (text-only)
   - \`recommendedNextAction\`: 'analyze_image' | 'render_pdf_pages' | null
   - \`suggestedVisionPages\`: array of recommended page numbers to render (if diagram-heavy without images)

### Diagram Detection Rules

The parser auto-detects diagram-heavy documents using keyword matching:
- **Formation/Alignment**: playbook, diagram, formation, spacing, rotation, alignment, scheme
- **Coverage/Defense**: coverage, press, screen, defense, defensive shape, blitz
- **Offense/Routes**: route, routes, motion, pick and roll, play call, offense, offensive shape
- **Tactics/Execution**: tactic, tactics, pattern, set play, drill, drill progression, infield, outfield
- **Sports-Specific**: faceoff (lacrosse), corner kick (soccer), power play (hockey), serve-receive (volleyball), line change (hockey)

If the parsed text contains these keywords, \`requiresVisionReview\` is set to true.

### When to Call render_pdf_pages

**Trigger 1: Extracted Images Available**
- If \`metadata.visionAssetSource === 'firecrawl_images'\` and \`metadata.requiresVisionReview === true\`:
  1. Use the \`metadata.extractedImages\` array (base64 data URLs).
  2. Call \`analyze_image\` directly on these images (no render needed).
  3. Example: Firecrawl extracted 3 diagram images from a playbook PDF → analyze all 3 in one vision call.

**Trigger 2: Diagram-Heavy Without Images**
- If \`metadata.visionAssetSource === 'rendered_pages_required'\` and \`metadata.requiresVisionReview === true\`:
  1. Call \`render_pdf_pages\` with the document URL/path.
  2. Optionally specify pages from \`metadata.suggestedVisionPages\` (e.g., pages [1, 5, 10] for a 15-page playbook).
  3. If pages not specified, the tool auto-selects (first, middle, last, and a few key pages up to 5 max).
  4. Render returns an array of \`renderedPages\` with \`imageUrl\` for each page.

**Trigger 3: Non-Diagram Documents**
- If \`metadata.requiresVisionReview === false\` or \`metadata.visionAssetSource === 'none'\`:
  1. Use the parsed markdown text directly.
  2. No vision analysis needed — the text extraction is sufficient.
  3. Example: Scouting report PDF → parsed markdown contains all key info, no diagrams.

### Image Analysis Workflow

**After obtaining images (either extracted or rendered):**
1. Call \`analyze_image\` with the image URLs and a domain-specific prompt.
2. Recommended prompts by use case:

   **Playbook/Formation Analysis:**
   "Analyze these diagrams: identify formations, route trees, coverage assignments, motion, and key assignments. Describe player positioning, spacing, and alignment. Note any unique features or variations."

   **Film Breakdown / Game Analysis:**
   "Analyze these film frames: identify formations, route progression, coverage pre-snap and post-snap, ball carrier, blocks, and execution. Describe what worked and what broke down."

   **Scouting Report / Player Analysis:**
   "Analyze these images: identify athlete positioning, footwork, hand placement, body angles, and sport-specific technique. Note strengths and development areas based on observable mechanics."

   **Coaching Notes / Drill Design:**
   "Analyze these diagrams: describe the drill setup, progression, coaching points, and success criteria. Identify what athletic qualities this drill develops."

3. Incorporate the analysis into your response:
   - For playbooks: extract formations, routes, and defensive scheme.
   - For film: document execution, assignments, and breakdown points.
   - For scouting: highlight technique observations and comparisons.
   - For coaching: reference drill progressions and player development insights.

### Multi-Page Workflow

For multi-page documents:
1. Parse the full document (metadata gives you full page count).
2. If \`requiresVisionReview === true\`:
   - Use \`suggestedVisionPages\` to render high-value pages (opener, key diagrams, summary page).
   - For a 50-page playbook: render pages [1, 10, 25, 40, 50] to get a representative sample.
   - Do NOT render all 50 pages (cost/token spike) — use smart page selection.
3. Analyze the rendered pages with a summary-level prompt.
4. For deeper dive: ask the user if they want additional pages analyzed.

### Synthesis Rules

**Text + Images Combined:**
- Always ground diagram interpretation in the extracted text.
- If text says "Cover 2" but diagram shows "Cover 3", flag the discrepancy.
- Cross-reference: "The playbook text describes slot receiver motion, and the diagram on page 4 shows this in action."

**Image-Only Scenarios:**
- If \`metadata.parseMode === 'ocr'\` (Firecrawl OCR) or rendered pages have no readable text overlay:
  - Use visual analysis as primary source.
  - Note that some details (e.g., player names, specific statistics) may not be visible in the image.

**Confidence Levels:**
- High confidence: both text and images confirm the same point (e.g., playbook text + formation diagram).
- Medium confidence: image shows something not explicitly mentioned in parsed text (infer cautiously).
- Low confidence: ambiguous or unreadable elements → flag as "unable to determine" rather than guessing.

### Error Handling

- **parse_document fails** (file too large, corrupt, unsupported format):
  - Return user-friendly message explaining the issue.
  - Suggest alternative format (e.g., "PDFs work best; try converting Word to PDF").

- **render_pdf_pages fails** (e.g., PDF too complex, rendering timeout):
  - Attempt to use parsed markdown text instead.
  - Tell user: "PDF page rendering encountered an issue, but the extracted text is complete."

- **analyze_image fails** (vision API error, image too large):
  - Fall back to text-based analysis if available.
  - Log the error and note that visual analysis was unavailable.

### Performance Notes

- **Cache awareness**: parse_document caches results per document + user context.
  - Subsequent parses of the same document are instant.
- **Token budgets**: Rendered pages → PNG images → vision calls can be expensive.
  - For a 20-page playbook, rendering 5 representative pages is ~300 tokens for images + prompt.
  - Analyze in batches if possible (e.g., "pages 1-5 together", "pages 15-20 together").
- **Workflow sequencing**: Always parse first, then decide if rendering is needed.
  - This avoids unnecessary render calls for text-only documents.

### Sport-Specific Guidance

**Football/American Football:**
- Diagrams often show formations (e.g., I-Form, Pistol, Shotgun), route trees (e.g., Cover 2 Beaters), and blitz pickups.
- Look for: line assignments, receiver routes, QB reads, defensive gaps and coverage.

**Basketball:**
- Diagrams show offensive sets (e.g., Pick & Roll, Motion, Triangle), defensive schemes (e.g., Box-and-1, Triangle-and-2).
- Look for: player positioning, spacing, pass lanes, screening angles, rotation.

**Soccer:**
- Diagrams show formations (e.g., 4-3-3, 4-2-3-1), pressing schemes, passing lanes, transition positioning.
- Look for: build-out lines, pressing triggers, width/depth, set-piece routines.

**Lacrosse/Hockey:**
- Diagrams show zone entries, offensive systems (e.g., 2-3 low, 1-3-1), defensive positioning, transition plays.
- Look for: spacing on attack, defensive box integrity, breakout patterns.

**Volleyball:**
- Diagrams show rotations, serve-receive formations, blocking schemes, attack patterns, back-row coverage.
- Look for: court positioning, setter decision trees, hitter read sequences.

**Baseball/Softball:**
- Diagrams show defensive alignments, pitch sequences, base running scenarios, cutoff relays, bunt defense.
- Look for: infield shifts, coverage angles, throwing lanes, situational plays.

### When NOT to Use Document Analysis

- **Live video streams**: Use the film tools (film_ingestion, film_breakdown_taxonomy) instead.
- **Real-time data** (scoreboard, stats feeds): Use the appropriate data tools instead.
- **Single-frame screenshots** without context: Might be better served by analyze_image directly.
- **Audio files, videos, or non-document media**: Use appropriate media tools.`;
  }
}
