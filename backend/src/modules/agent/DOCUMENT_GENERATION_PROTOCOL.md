# Agent X: Artifact Delivery Protocol (2026)

## Effective Date

June 22, 2026

## The Problem

Agent X coordinators were generating massive structured content (training plans,
scout reports, recruiting lists, etc.) and outputting it directly into chat
messages. This resulted in:

- ❌ Thousands of tokens per response
- ❌ Poor user experience (wall of text)
- ❌ No portable artifact (user must copy-paste)
- ❌ Inefficient information delivery

**Example of the WRONG pattern:**

```text
User: "Create a 12-week QB training plan"
Agent X: [outputs 500+ lines of Markdown tables directly in chat]
Result: User reads wall of text, tokens wasted, no downloadable file
```

## The Solution: Artifact Delivery Protocol

### Rule: Best-Fit Artifact First → Chat Summary

All Agent X coordinators now follow a consistent pattern:

1. **Identify** the output shape the user actually needs
2. **Generate** the best-fit artifact with the correct tool
3. **Reference** it in chat with a brief 2-3 sentence summary

**Example of the CORRECT pattern:**

```text
User: "Create a 12-week QB training plan"
Agent X:
  [Builds weeks 1-12, phases, targets internally]
  → Calls dynamic_export to create "QB-OffSeason-Training-Plan.pdf"
  → Returns chat: "I've created a 12-week QB off-season plan [PDF link].
                   It includes arm velocity targets, footwork progressions,
                   and 7-on-7 tournament prep."
Result: User clicks PDF, downloads, integrates into coaching system. Chat is focused.
```

```text
User: "Show our recruiting funnel by stage"
Agent X:
  [Normalizes the stage/count dataset internally]
  → Calls generate_chart_visualization to create a hosted chart image
  → Returns chat: "I've mapped your recruiting funnel [chart link]. It highlights where prospects are dropping between interest and visit stages."
Result: User gets a visual artifact instead of a verbal chart description.
```

```text
User: "Diagram our red-zone bunch mesh"
Agent X:
  [Builds the concept internally]
  → Calls create_play_diagram
  → Calls analyze_image on the returned image URL to verify the concept matches
  → Returns chat: "I've diagrammed the red-zone bunch mesh concept [diagram link]. It includes route spacing, timing, and the primary read progression."
Result: User gets the actual diagram instead of text describing one.
```

## Tool Selection

Choose the artifact tool based on output shape:

| Output Shape                     | Primary Tool                                                       | Examples                                                                                         |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Connected native document/table  | Microsoft 365 tools                                                | Word files, Excel-style tables, PowerPoint decks, OneNote-style docs                             |
| Spreadsheet / workbook export    | `execute_python_code`                                              | XLSX files, trackers, matrices, callsheets, budgets, dashboards, formula workbooks               |
| Exact-layout PDF from HTML/CSS   | `render_html_pdf`                                                  | Sample-matched PDFs, one-page staff sheets, callsheets, wristbands, depth charts, sideline cards |
| Gamma-style report / slide deck  | `dynamic_export`                                                   | Presentation decks, multi-page narrative reports, scout-card packets, briefing decks             |
| Fallback document / table export | `dynamic_export`                                                   | Fallback PDF/XLSX/CSV export when no better dedicated path fits                                  |
| Data visualization / chart       | `generate_chart_visualization`                                     | Trendlines, leaderboards, recruiting funnels, pipeline charts, process maps                      |
| Play / drill / tactical diagram  | `create_play_diagram` for plays, `create_board_diagram` for drills | Route trees, formations, coverage diagrams, drill boards                                         |
| Creative media asset             | `generate_graphic`, Runway, FFmpeg, media tools                    | Commitment graphics, promos, edited clips, thumbnails, captions                                  |

**Connected workspace first rule:** If the user has Microsoft 365 connected and
the requested output is best expressed as a native document, spreadsheet, or
presentation, use the Microsoft workspace tool surface first so the artifact
lives in Word, Excel, or PowerPoint instead of only as a generic export.

**Downloadable presentation fallback:** When the user wants a downloadable deck
that should be persisted back into Team Files, use `dynamic_export` with
`format="pptx"`. This follows the same artifact persistence flow as PDF/XLSX:
create or update the Team Files document first when possible, then pass
`relatedDocumentId` into `dynamic_export` so the generated presentation attaches
back to the saved record.

**Exact PDF rule:** When the user asks to match a sample image, screenshot,
paper form, staff sheet, or reference layout exactly, use `render_html_pdf` with
complete HTML/CSS instead of Gamma or `dynamic_export`. Also use
`render_html_pdf` for operational PDFs where box placement, columns, page count,
and print geometry matter (callsheets, wristbands, depth charts, sideline cards,
practice matrices). Use `execute_python_code`/XLSX or connected spreadsheet
tools instead when the primary requirement is editability.

**Routing order (mandatory):**

1. One-page or fixed-layout PDFs first -> `render_html_pdf`
2. Presentation decks and Gamma-style reports -> `dynamic_export`
3. Editable spreadsheets/workbooks -> `execute_python_code` first
4. `dynamic_export` is the last fallback for PDF/XLSX when the dedicated path
   above is not the right fit or is unavailable

`render_html_pdf` persists two artifacts: the final PDF export and a sibling
editable HTML source artifact with inline CSS. When the user later asks to
revise that layout, reuse the saved HTML source first instead of reconstructing
the layout from the PDF. If the source artifact is available as an attachment
URL or storagePath, read it with `parse_document`, modify the HTML/CSS, and
rerun `render_html_pdf`.

For spatial references such as depth charts, call sheets, wristbands, staff
boards, and paper forms, translate the reference into a fixed paper canvas with
positioned regions. Do not approximate the reference as a full-width row of text
or a generic flex/table layout. Use `@page`, a fixed `.page`/`.sheet` container,
and absolute-positioned or CSS-grid boxes whose x/y positions mirror the sample.
For quarterback / signal-caller wristbands, enforce standard vinyl-window
dimensions: **4.75" x 2.5"** for adult, **4.0" x 3.0"** for youth, with
high-density 3x10 / 2x15 grid lanes, bold call numbers, and concept color
coding.

## When to Export

**Export these types of content:**

| Content Type                        | Coordinator | Examples                                                            |
| ----------------------------------- | ----------- | ------------------------------------------------------------------- |
| Training plans, workout programs    | Strategy    | Off-season progressions, periodization, conditioning phases         |
| Scout reports, comparisons          | Performance | Physical/Technical/Mental/Potential assessments, prospect tables    |
| Rosters, stats, imports             | Data        | Scraped profiles, normalized data, stat tables                      |
| Target college lists, timelines     | Recruiting  | Program comparisons, visit schedules, outreach tracking             |
| Compliance documents, calendars     | Admin       | Recruiting calendars, dead period schedules, eligibility checklists |
| Brand guidelines, content calendars | Brand       | Social media calendars, hashtag strategies (NOT graphics/videos)    |

**Direct artifact delivery still applies:**

- Graphics, videos, and media files should be generated by their native tool and
  referenced in chat
- Play diagrams should be generated as diagram assets and referenced in chat
- Charts/graphs should be generated visually and referenced in chat
- One-off conversational answers can stay in chat when no artifact adds value

## Implementation Across Coordinators

### Strategy Coordinator

**Exports:** Training plans, game plans, playbooks, timelines, goal frameworks

```text
User: "Create a 12-week off-season plan for our football team"
→ dynamic_export format="pdf"
→ Chat: "I've created your 12-week plan [PDF]. Each position has specific targets and progression phases."
```

### Performance Coordinator

**Exports:** Scout reports, prospect comparisons, evaluation matrices

```text
User: "Compare these 5 QB prospects side-by-side"
→ dynamic_export format="pdf"
→ Chat: "Scout comparison ready [PDF]. Rankings by arm talent, processing, and athleticism."
```

### Data Coordinator

**Exports:** Imported rosters, normalized stat tables, data quality reports

```text
User: "Import this roster CSV and normalize the names"
→ dynamic_export format="csv"
→ Chat: "Imported 42 athletes [CSV]. Names normalized, duplicates flagged."
```

### Recruiting Coordinator

**Exports:** Target college lists, outreach schedules, campaign tracking

```text
User: "Build a target list of D1/D2 schools in the Southeast"
→ dynamic_export format="pdf"
→ Chat: "Built target list of 30 schools [PDF]. Sorted by football program strength."
```

### Admin Coordinator

**Exports:** Recruiting calendars, compliance checklists, eligibility reports

```text
User: "Show me the NCAA recruiting calendar for 2026"
→ dynamic_export format="pdf"
→ Chat: "2026 recruiting calendar [PDF]. Includes contact windows, dead periods, and portal dates."
```

### Brand Coordinator

**Exports:** Social media calendars, content strategies (structured only; not
graphics)

```text
User: "Create a social media content calendar for Q1"
→ dynamic_export format="pdf"
→ Chat: "Content calendar ready [PDF]. 12 posts with captions and posting times."
```

## Technical Requirements

### Visual / Diagram Tools

- `generate_chart_visualization` returns a hosted chart image URL for charts,
  funnels, leaderboards, and process visuals.
- `create_play_diagram` returns hosted play-diagram candidate images for play
  requests; verify returned play images with `analyze_image` before presenting
  them as valid in chat
- `create_board_diagram` returns hosted board diagrams for drill requests URLs
  for tactical diagrams and drill boards.
- Native media tools (`generate_graphic`, Runway, FFmpeg, thumbnail/caption
  tools) return media artifacts that should be referenced directly in chat.

### Tool: `dynamic_export`

`dynamic_export` now supports both:

- **Simple / legacy flat exports** using top-level `columns`, `rows`,
  `bodyParagraphs`, and `bulletPoints`
- **Preferred multi-section exports** using `sections[]`, where each section can
  carry its own heading, description, table, narrative, bullets, and embedded
  PDF/XLSX/PPTX images

Use `sections` by default for coach-facing artifacts like callsheets, practice
scripts, game plans, install schedules, scouting packets, and multi-block
reports. Use the flat payload only for simple one-table exports or lightweight
single-block PDFs.

### Preferred Multi-Section Contract

```typescript
dynamic_export({
  format: "pdf" | "csv" | "xlsx" | "pptx",
  fileName: "descriptive-name.pdf",        // e.g., "QB-Training-Plan.pdf", "Saturday-Callsheet.xlsx", or "Scout-Cards.pptx"
  title: "User-Friendly Title",            // e.g., "12-Week QB Off-Season Training Plan"
  description: "Optional context",         // e.g., "May 2026 – July/August camp season"
  sections?: [
    {
      title: "Section Heading",
      description: "Optional section context",
      columns?: [
        { key: "week", label: "Week" },
        { key: "focus", label: "Focus Area" },
      ],
      rows?: [
        ["1-3", "Foundation"],
        ["4-7", "Intermediate"],
      ],
      bodyParagraphs?: [
        "Optional narrative for this section...",
      ],
      bulletPoints?: [
        "Optional section bullet 1",
        "Optional section bullet 2",
      ],
      imageUrls?: [
        "https://.../diagram.png",         // PDF/XLSX: embedded into the section
      ]
    }
  ],
  imageUrls?: [                             // PDF/XLSX: document-level images
    "https://.../chart.png",
  ],
  brandPrimaryColor?: "#0055AA",          // Optional team/org accent color for PDF
  organizationName?: "Crown Point Bulldogs",
  logoUrl?: "https://.../logo.png",

  // Legacy/simple path still supported:
  columns?: [                               // Simple CSV/XLSX or one-table PDF
    { key: "week", label: "Week" },
    { key: "focus", label: "Focus Area" },
  ],
  rows?: [                                  // Matches top-level column order
    ["1-3", "Foundation"],
    ["4-7", "Intermediate"],
  ],
  bodyParagraphs?: [                       // Simple PDF narrative
    "Introduction paragraph...",
    "Section paragraph...",
  ],
  bulletPoints?: [                         // Optional simple PDF bullets
    "Key point 1",
    "Key point 2",
  ]
})
```

### Format Behavior

- **PDF**: Best for readable multi-section documents with headings, narrative,
  checklists, diagrams, and branded presentation.
- **HTML PDF (`render_html_pdf`)**: Best for exact-match or fixed-geometry PDF
  output. Build a complete HTML document with inline CSS, explicit page size,
  print-safe dimensions, and no scripts. Use this when the user cares about how
  every section sits on the page. For exact-match reference layouts, include
  `@page`, a fixed `.page`/`.sheet`/`.canvas` with width and height, and
  coordinate/grid positioned elements.
- **CSV**: Best for flat/raw data. When `sections` are provided, CSV serializes
  them sequentially with repeated headers. It is inherently lossy compared to
  PDF/XLSX.
- **XLSX**: Best for spreadsheet/workbook deliverables. When `sections` are
  provided, they render in order on a single worksheet as grouped blocks. Do not
  assume one worksheet per section unless native Microsoft spreadsheet tools are
  being used instead.

### Validation Rules

- **CSV/XLSX** require tabular content either:
  - at the top level via `columns` + `rows`, or
  - inside at least one `sections[]` entry with `columns` + `rows`
- **PDF** requires at least one of:
  - tabular content
  - `bodyParagraphs`
  - `bulletPoints`
  - `description`
  - `imageUrls`
  - narrative/image content inside `sections[]`

### Coach Document Guidance

For coach-facing exports, prefer a sectioned structure instead of one monolithic
table. Typical section patterns include:

- Callsheet: opening script, 3rd down menu, red zone, backed up, 2-minute,
  reminders
- Practice script: daily objectives, time blocks, drill sequence, coaching
  points, success criteria
- Game plan: identity, attack plan, pressure answers, adjustment triggers,
  situational package
- Scouting packet: summary, tendencies, personnel notes, comparison tables,
  recommended counters

This produces exports that feel closer to how coaches actually consume the
artifact instead of flattening the whole plan into a single raw table.

**Output:**

- Returns
  `{ success: true, data: { downloadUrl, storagePath, fileName, mimeType, format, sizeBytes, rowCount, columnCount } }`
- URL is a signed backend/Firebase download link (valid 7 days)
- Include this URL in chat response for user download

### Chat Summary Format

After artifact generation, respond to user with this structure:

```text
I've created [asset type] for you [artifact link].

[1-2 sentence summary of what's in the artifact]
[Optional action suggestion]
```

**Examples:**

✅ "I've created your 12-week training plan [PDF]. The plan includes arm
velocity targets, footwork progressions, and 7-on-7 tournament prep schedules
for each week."

✅ "Built a target list of 30 schools [PDF]. All schools ranked by fit score
with contact information for coaching staff."

✅ "Here's the recruiting calendar [PDF]. Includes contact windows, dead
periods, transfer portal dates, and compliance reminders."

## FAQ

**Q: What if the content is very long (100+ pages)?** A: Export it anyway. Use
dynamic_export with appropriate fileName and structure. Prefer `sections[]` so
the artifact remains navigable and logically grouped.

**Q: Can I include images in exports?** A: Yes, for PDFs. Use `imageUrls` at the
document level or inside `sections[]` to embed charts, play diagrams, drill
boards, or other hosted images directly in the PDF. CSV and XLSX remain table-
first formats and do not embed those images.

**Q: What if the user wants both the export AND inline chat discussion?** A:
Export first (artifact), then provide 2-3 sentence summary. If the user asks
follow-up questions about specific content, quote relevant sections from chat
(don't re-paste the whole export).

**Q: When should I NOT use dynamic_export?** A: When a dedicated artifact tool
is a better fit, such as charts, diagrams, graphics, videos, thumbnails, exact
HTML/CSS PDFs via `render_html_pdf`, or other native media outputs.

**Q: How do I know if content should be a PDF vs. CSV vs. XLSX?** A: Choose the
format based on how the user will actually use the artifact, not just what looks
professional in chat. Use PDF for print-first or share-first readable documents
where the primary value is narrative, presentation, or quick viewing. Use CSV
for pure flat data tables (stats, rosters, lists). Use XLSX when the user needs
an editable grid, workbook, matrix, staff board, operational sheet, or a layout
that should behave like a spreadsheet. For callsheets, practice script matrices,
install boards, scouting matrices, and any request that references an existing
staff sheet or asks to "match this layout exactly," choose by the requested end
state: use `render_html_pdf` for exact printable/PDF output, and prefer XLSX or
a native saved team document first when the artifact needs to stay editable.

**Q: Should I still use top-level `columns` and `rows`?** A: Yes, for simple
one-table exports. For coach documents and richer structured artifacts, prefer
`sections[]`.

**Q: Can PDFs be team-branded?** A: Yes. Pass `organizationName`,
`brandPrimaryColor`, and `logoUrl` when the user wants a team-branded export.

## System Prompt Guidance (for LLMs)

Every Agent X coordinator system prompt now includes:

```text
## ARTIFACT DELIVERY PROTOCOL (CRITICAL — Must Follow)
**RULE: Best-Fit Artifact First → Chat Summary**

When a user requests an output that should exist as an artifact:
- Choose the correct tool for the shape of the output
- Use `render_html_pdf` for one-page or fixed-layout printable PDFs
- Use `execute_python_code` for XLSX, Excel, spreadsheets, workbooks, and editable grid artifacts
- Use `dynamic_export` for Gamma-style reports/PPTX decks, CSV exports, and PDF/XLSX fallback only
- Use chart tools for visual analytics
- Use diagram tools for tactical visuals
- Use native media tools for graphics/video/audio

EXECUTION FLOW:
  1. Generate the artifact with the correct tool
  2. In chat: provide a 2-3 sentence summary with artifact link(s)
  3. Never paste large content blocks directly in chat
  4. Never describe a chart/diagram/graphic as complete unless the tool actually returned it

KEY: The artifact is the deliverable. The chat is the story.
```

This directive ensures coordinators prioritize artifact generation over chat
bloat.

## Planner Agent Direction

The Planner Agent includes this guidance:

```text
11. ARTIFACT DELIVERY PROTOCOL (MANDATORY): When a task will generate a user-facing
  artifact, add a description directive that selects the correct output tool
  (render_html_pdf for fixed-layout PDFs, execute_python_code for XLSX/spreadsheets,
  dynamic_export for Gamma-style reports/PPTX plus fallback, chart visualization,
  play/board diagram, or native media tool)
  and tells the coordinator to reference the artifact in the chat summary
  instead of pasting raw content.
```

This ensures task planning at the orchestration level guides coordinators toward
export-first behavior.

## Rollout & Enforcement

- ✅ All coordinator system prompts updated (May 9, 2026)
- ✅ `render_html_pdf` fixed-layout PDF lane in place
- ✅ `execute_python_code` Python/openpyxl spreadsheet lane restored
- ✅ `dynamic_export` restricted to Gamma/report lane plus fallback behavior
- ✅ Chart and diagram tools recognized as first-class artifact outputs
- ✅ Planner Agent directing best-fit artifact routing
- ⏳ Monitor coordinator responses for compliance
- ⏳ Update memory/training if patterns drift

## Success Metrics

After rollout, expect:

- 📉 Average chat message length: ~200 tokens (down from 2000+)
- 📈 User downloads: structured exports available as artifacts
- 💾 Artifact reusability: users can integrate PDFs into workflows
- 🎯 Chat clarity: focused, actionable summaries instead of walls of text

---

**Document Version:** 1.0  
**Last Updated:** May 9, 2026  
**Coordinator Coverage:** Strategy, Performance, Data, Recruiting, Admin,
Brand  
**Primary Tools:** `render_html_pdf`, `execute_python_code`, `dynamic_export`,
chart visualization, diagram generation, native media tools
