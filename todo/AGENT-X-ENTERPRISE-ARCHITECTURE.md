# Agent X — Enterprise Architecture Upgrade Plan

> **Priority:** 🔴 High  
> **Author:** Master CTO  
> **Created:** April 11, 2026  
> **Status:** Planning  
> **Estimated Phases:** 5  
> **Goal:** Transform Agent X from a hardcoded TypeScript agent system into a
> Markdown-first, hot-reloadable, token-optimized enterprise AI engine.

---

## Executive Summary

Agent X currently works. It routes tasks, calls tools, and produces results. But
the architecture has three structural problems that will compound as we scale:

1. **Agent prompts are compiled into TypeScript** — every personality tweak
   requires a backend deploy.
2. **Tool results are JSON-serialized** — the LLM wastes 30-50% of its context
   window parsing syntax characters (`"`, `{`, `:`, `[`).
3. **No hot-reload, A/B testing, or non-engineer editing** of agent behavior.

This plan upgrades Agent X to an enterprise-grade, Markdown-native agent
architecture that follows the same patterns used by Anthropic's Claude agents,
OpenAI's custom GPTs, and Microsoft's AutoGen framework.

---

## Current Architecture Audit

### What Works (Keep)

| Component                               | Grade | Notes                                                                            |
| --------------------------------------- | ----- | -------------------------------------------------------------------------------- |
| `BaseAgent` ReAct loop                  | A     | Clean iteration with MAX_ITERATIONS cap, observation truncation, skill injection |
| `PlannerAgent` DAG decomposition        | A     | Proper dependency-based task ordering, JSON mode for structured output           |
| Skill system (semantic matching)        | A     | `BaseSkill` → embedding → cosine similarity → dynamic injection                  |
| `GlobalKnowledgeSkill` (vector search)  | A     | Real-time MongoDB Atlas retrieval, cached prompt blocks                          |
| `ContextBuilder` profile hydration      | A-    | Redis-cached, pipe-delimited format is token-efficient                           |
| Tool registry with category permissions | A     | Clean separation of tool access per agent role                                   |
| Delegation (cross-agent handoff)        | A     | `delegate_task` tool + `AgentDelegationException`                                |
| Agent Worker (BullMQ)                   | A     | Job cost tracking, IAP billing, structured progress updates                      |

### What Needs Upgrading

| Component                         | Current Grade | Problem                                                             | Target Grade         |
| --------------------------------- | ------------- | ------------------------------------------------------------------- | -------------------- |
| Agent prompt definitions          | C             | Hardcoded `.join('\n')` arrays in TypeScript                        | A (Markdown files)   |
| Tool result → LLM pipeline        | C             | `JSON.stringify(result.data)` burns tokens                          | A (Markdown-first)   |
| Job context injection             | B-            | `JSON.stringify(visibleContext, null, 2)`                           | A (Markdown)         |
| Skill prompt blocks               | B+            | Already Markdown, but loaded from hardcoded strings                 | A (`.md` files)      |
| Agent definitions in `@nxt1/core` | B             | `AGENT_DESCRIPTORS` is static; can't add agents without code change | A (Dynamic registry) |

---

## Phase 1: Markdown Tool Results (The Token Saver)

> **Impact:** Immediate 30-50% token reduction on every tool call.  
> **Risk:** Zero — fully backward-compatible.  
> **Estimated Effort:** Small  
> **Dependencies:** None

### 1.1 Update `ToolResult` Interface

**File:** `backend/src/modules/agent/tools/base.tool.ts`

Add an optional `markdown` field to `ToolResult`:

```typescript
export interface ToolResult {
  readonly success: boolean;
  readonly data?: unknown; // Raw data (for tests, internal use, structured extraction)
  readonly markdown?: string; // NEW: Pre-rendered Markdown for the LLM context window
  readonly error?: string;
}
```

**Rule:** `markdown` is the LLM-facing representation. `data` is the
machine-facing representation. Both can coexist. `markdown` takes priority when
being fed back into the ReAct loop.

### 1.2 Update the ReAct Loop in `BaseAgent`

**File:** `backend/src/modules/agent/agents/base.agent.ts`

In the `executeTool()` method (around line ~235), change the result
serialization:

```typescript
// BEFORE:
const result = await registry.execute(toolName, input, toolExecContext);
return JSON.stringify(
  result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error }
);

// AFTER:
const result = await registry.execute(toolName, input, toolExecContext);

if (result.success && result.markdown) {
  // Prefer the pre-rendered Markdown — reduces token usage by 30-50%
  return result.markdown;
}

// Fallback: Serialize to JSON for tools that haven't adopted Markdown yet
return JSON.stringify(
  result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error }
);
```

**Why this is safe:** Every existing tool that does NOT return `markdown` falls
through to the existing `JSON.stringify` path. Zero behavioral change.

### 1.3 Convert Job Context to Markdown

**File:** `backend/src/modules/agent/agent.router.ts`

In the `enrichIntentWithContext()` method (around line ~710):

```typescript
// BEFORE:
enriched += `\n\n[Job Context]\n${JSON.stringify(visibleContext, null, 2)}`;

// AFTER:
let contextMd = '\n\n### Job Context\n';
for (const [key, value] of Object.entries(visibleContext)) {
  const formatted =
    typeof value === 'object' ? JSON.stringify(value) : String(value);
  contextMd += `- **${key}**: ${formatted}\n`;
}
enriched += contextMd;
```

### 1.4 Adopt Markdown in Top Token-Heavy Tools

Convert the tools that generate the largest `data` payloads. Priority by token
impact:

| Tool                     | File                                                        | Token Impact                          | Conversion                              |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------- | --------------------------------------- |
| `search_colleges`        | `tools/database/search-colleges.tool.ts` (987 lines)        | 🔴 Huge — returns 25 college DTOs     | Markdown table of colleges              |
| `search_college_coaches` | `tools/database/search-college-coaches.tool.ts` (428 lines) | 🔴 Huge — returns nested coach arrays | Markdown list per college → coaches     |
| `search_memory`          | `tools/database/search-memory.tool.ts`                      | 🟡 Medium — returns memory chunks     | Already semi-text, add Markdown headers |
| `scrape_webpage`         | `tools/scraping/scrape-webpage.tool.ts`                     | 🟢 Already Markdown                   | Already returns `markdownContent`       |
| `web_search`             | `tools/integrations/web-search.tool.ts`                     | 🟡 Medium — returns search results    | Markdown numbered list                  |
| `search_apify_actors`    | `tools/integrations/search-apify-actors.tool.ts`            | 🟢 Already Markdown                   | Apify MCP already returns Markdown      |

**Example conversion for `search_colleges`:**

```typescript
// At end of execute(), before the final return:
const markdown = [
  `## College Search Results (${results.length} programs)`,
  `**Sport:** ${sport} | **Filters:** ${buildFilterSummary(input)}`,
  '',
  '| # | College | Division | Conference | State | GPA | Acceptance | Tuition |',
  '|---|---|---|---|---|---|---|---|',
  ...results.map(
    (c, i) =>
      `| ${i + 1} | **${c.name}** | ${c.division} | ${c.conference} | ${c.state} | ${c.averageGPA ?? '—'} | ${c.acceptanceRate ? c.acceptanceRate + '%' : '—'} | ${c.totalCost ? '$' + c.totalCost.toLocaleString() : '—'} |`
  ),
  '',
  results
    .map(
      (c, i) =>
        `### ${i + 1}. ${c.name}\n` +
        (c.questionnaire ? `- 📋 Questionnaire: ${c.questionnaire}\n` : '') +
        (c.sportLandingUrl ? `- 🔗 Sport Page: ${c.sportLandingUrl}\n` : '') +
        (c.twitter ? `- 🐦 Twitter: ${c.twitter}\n` : '') +
        (c.camp ? `- ⛺ Camp: ${c.camp}\n` : '')
    )
    .join('\n'),
].join('\n');

return {
  success: true,
  data: { count: results.length, sport, colleges: results }, // Keep for tests
  markdown, // Feed this to the LLM
};
```

### 1.5 Helper: `toMarkdownTable()`

Create a shared utility for converting arrays of objects to Markdown tables:

**File:** `backend/src/modules/agent/tools/markdown-helpers.ts` (NEW)

```typescript
/**
 * Convert an array of objects into a Markdown table.
 * Only includes the specified columns.
 */
export function toMarkdownTable<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; label: string; format?: (val: unknown) => string }[]
): string {
  const header = '| ' + columns.map((c) => c.label).join(' | ') + ' |';
  const separator = '|' + columns.map(() => '---').join('|') + '|';
  const body = rows
    .map(
      (row) =>
        '| ' +
        columns
          .map((c) => {
            const val = row[c.key];
            return c.format ? c.format(val) : (val ?? '—');
          })
          .join(' | ') +
        ' |'
    )
    .join('\n');
  return [header, separator, body].join('\n');
}

/**
 * Convert an array of objects into a Markdown numbered list with bold keys.
 */
export function toMarkdownList<T extends Record<string, unknown>>(
  rows: T[],
  titleKey: keyof T,
  detailKeys: {
    key: keyof T;
    label: string;
    format?: (val: unknown) => string;
  }[]
): string {
  return rows
    .map((row, i) => {
      const title = `${i + 1}. **${row[titleKey]}**`;
      const details = detailKeys
        .filter((d) => row[d.key] != null)
        .map(
          (d) =>
            `   - ${d.label}: ${d.format ? d.format(row[d.key]) : row[d.key]}`
        )
        .join('\n');
      return `${title}\n${details}`;
    })
    .join('\n\n');
}
```

---

## Phase 2: Markdown Agent Definitions (The Big One)

> **Impact:** Hot-reloadable agent personalities. No deploy needed for prompt
> changes.  
> **Risk:** Low — new class wrapping existing pattern.  
> **Estimated Effort:** Medium  
> **Dependencies:** None (can run parallel to Phase 1)

### 2.1 Create Agent Prompt Directory

```
backend/src/modules/agent/prompts/
├── general.md
├── recruiting-coordinator.md
├── data-coordinator.md
├── performance-coordinator.md
├── compliance-coordinator.md
└── brand-media-coordinator.md
```

### 2.2 Markdown File Format (YAML Frontmatter + Body)

Each `.md` file defines the full agent specification:

```markdown
---
id: recruiting_coordinator
name: Recruiting Coordinator
tier: copywriting
tools:
  - search_memory
  - search_web
  - scrape_webpage
  - open_live_view
  - navigate_live_view
  - interact_with_live_view
  - read_live_view
  - close_live_view
  - send_email
  - ask_user
skills:
  - outreach_copywriting
  - global_knowledge
---

You are the Recruiting Coordinator for NXT1 Agent X — the most effective AI
recruiting engine in high school sports. User profile context (name, sport,
position, class year, stats) is provided in the task description.

## Your Identity

- You are a seasoned D1 recruiting coordinator, email copywriter, and college
  research specialist.
- You know how coaches think, what they look for in recruits, and how to get
  their attention.
- You write emails that coaches actually read — short, direct, data-backed, and
  personal.
- You build target lists based on fit, not wishful thinking.

## Your Capabilities

1. **Email Drafting** — Write personalized coach emails that follow proven
   high-conversion templates.
2. **Program Research** — Use search_web to find coach directories, staff
   emails, program depth charts, and needs.
3. **Target List Building** — Identify best-fit programs by division,
   conference, state, and academic profile.
4. **Outreach Planning** — Sequence campaigns: initial email → follow-up → visit
   invite → commit tracking.
5. **Email Sending** — Use send_email to dispatch approved emails via the
   athlete's connected email account.
6. **Memory Recall** — Use search_memory to retrieve stored preferences, past
   outreach, and coach responses.

(If a "Loaded Skills" section appears below, follow its email writing rules,
target list criteria, and outreach sequencing exactly. If no skills are loaded,
use general recruiting email best practices and keep emails under 150 words.)
```

### 2.3 Create `MarkdownAgent` Class

**File:** `backend/src/modules/agent/agents/markdown-agent.ts` (NEW)

```typescript
import { BaseAgent } from './base.agent.js';
import { MODEL_ROUTING_DEFAULTS } from '@nxt1/core';
import type {
  AgentIdentifier,
  AgentSessionContext,
  ModelRoutingConfig,
} from '@nxt1/core';

export interface AgentDefinition {
  readonly id: AgentIdentifier;
  readonly name: string;
  readonly tier: string;
  readonly tools: readonly string[];
  readonly skills: readonly string[];
  readonly prompt: string;
}

export class MarkdownAgent extends BaseAgent {
  readonly id: AgentIdentifier;
  readonly name: string;
  private readonly systemPrompt: string;
  private readonly tools: readonly string[];
  private readonly skillNames: readonly string[];
  private readonly routing: ModelRoutingConfig;

  constructor(definition: AgentDefinition) {
    super();
    this.id = definition.id;
    this.name = definition.name;
    this.systemPrompt = definition.prompt;
    this.tools = definition.tools;
    this.skillNames = definition.skills;
    this.routing =
      MODEL_ROUTING_DEFAULTS[definition.tier] ?? MODEL_ROUTING_DEFAULTS['chat'];
  }

  getSystemPrompt(_context: AgentSessionContext): string {
    return this.systemPrompt;
  }

  getAvailableTools(): readonly string[] {
    return this.tools;
  }

  override getSkills(): readonly string[] {
    return this.skillNames;
  }

  getModelRouting(): ModelRoutingConfig {
    return this.routing;
  }
}
```

### 2.4 Create Agent Loader (YAML Frontmatter Parser)

**File:** `backend/src/modules/agent/agents/agent-loader.ts` (NEW)

Reads `.md` files from the `prompts/` directory, parses YAML frontmatter, and
returns `AgentDefinition` objects.

```typescript
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AgentDefinition } from './markdown-agent.js';
import type { AgentIdentifier } from '@nxt1/core';
import { logger } from '../../../utils/logger.js';

const PROMPTS_DIR = resolve(import.meta.dirname, '../prompts');

interface ParsedFrontmatter {
  id: AgentIdentifier;
  name: string;
  tier: string;
  tools: string[];
  skills: string[];
}

/**
 * Parse YAML frontmatter from a Markdown string.
 * Supports the subset needed for agent definitions: scalars and arrays.
 */
function parseFrontmatter(content: string): {
  meta: ParsedFrontmatter;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('Missing YAML frontmatter');

  const yaml = match[1];
  const body = match[2].trim();

  const meta: Record<string, unknown> = {};
  let currentKey = '';
  for (const line of yaml.split('\n')) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value) {
        meta[currentKey] = value;
      } else {
        meta[currentKey] = []; // Start of array
      }
    } else if (line.match(/^\s+-\s+(.+)$/)) {
      const item = line.match(/^\s+-\s+(.+)$/)![1].trim();
      (meta[currentKey] as string[]).push(item);
    }
  }

  return {
    meta: meta as unknown as ParsedFrontmatter,
    body,
  };
}

/**
 * Load all agent definitions from the prompts/ directory.
 * Returns a Map keyed by AgentIdentifier.
 */
export function loadAgentDefinitions(): Map<AgentIdentifier, AgentDefinition> {
  const definitions = new Map<AgentIdentifier, AgentDefinition>();

  const files = readdirSync(PROMPTS_DIR).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    try {
      const raw = readFileSync(join(PROMPTS_DIR, file), 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      definitions.set(meta.id, {
        id: meta.id,
        name: meta.name,
        tier: meta.tier,
        tools: meta.tools ?? [],
        skills: meta.skills ?? [],
        prompt: body,
      });
      logger.info(`[AgentLoader] Loaded agent: ${meta.id} from ${file}`);
    } catch (err) {
      logger.error(`[AgentLoader] Failed to parse ${file}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return definitions;
}
```

### 2.5 Update Bootstrap to Use Markdown Agents

**File:** `backend/src/modules/agent/queue/bootstrap.ts`

Replace the hardcoded agent instantiation with dynamic loading:

```typescript
// BEFORE:
import { GeneralAgent } from '../agents/general.agent.js';
import { RecruitingCoordinatorAgent } from '../agents/recruiting-coordinator.agent.js';
// ... 4 more imports

router.registerAgent(new GeneralAgent());
router.registerAgent(new RecruitingCoordinatorAgent());
// ... 4 more registrations

// AFTER:
import { MarkdownAgent } from '../agents/markdown-agent.js';
import { loadAgentDefinitions } from '../agents/agent-loader.js';

const definitions = loadAgentDefinitions();
for (const [id, def] of definitions) {
  router.registerAgent(new MarkdownAgent(def));
  logger.info(`[Bootstrap] Registered markdown agent: ${id}`);
}
```

### 2.6 Keep `PlannerAgent` in TypeScript

The `PlannerAgent` is the ONE agent that should NOT be converted to Markdown.
Why:

- It uses `jsonMode: true` and has a custom `execute()` override that parses
  JSON and validates the DAG structure.
- Its system prompt dynamically injects `AGENT_DESCRIPTORS` at runtime.
- It is the orchestration engine, not a domain specialist.

The Planner stays as TypeScript. Everything else becomes `.md`.

### 2.7 Extract Existing Prompts to `.md` Files

For each of the 5 current specialist agents, extract their `getSystemPrompt()`
return value into the corresponding `.md` file — preserving every line of the
existing prompt verbatim. No prompt changes in this phase, only extraction.

| Agent         | Source File (lines)                                     | Target `.md` File                    |
| ------------- | ------------------------------------------------------- | ------------------------------------ |
| General       | `general.agent.ts` (23-64)                              | `prompts/general.md`                 |
| Recruiting    | `recruiting-coordinator.agent.ts` (26-53)               | `prompts/recruiting-coordinator.md`  |
| Data          | `data-coordinator.agent.ts` (32-271)                    | `prompts/data-coordinator.md`        |
| Performance   | `performance-coordinator.agent.ts` (26-51)              | `prompts/performance-coordinator.md` |
| Compliance    | `compliance-coordinator.agent.ts` (28-63)               | `prompts/compliance-coordinator.md`  |
| Brand & Media | `brand-media-coordinator.agent.ts` (63-93, const block) | `prompts/brand-media-coordinator.md` |

### 2.8 Delete Old Agent Files

Once all tests pass with the `MarkdownAgent`, delete:

- `general.agent.ts`
- `recruiting-coordinator.agent.ts`
- `data-coordinator.agent.ts`
- `performance-coordinator.agent.ts`
- `compliance-coordinator.agent.ts`
- `brand-media-coordinator.agent.ts`

Keep `base.agent.ts`, `markdown-agent.ts`, `agent-loader.ts`,
`planner.agent.ts`.

---

## Phase 3: Markdown Skills (Consistency)

> **Impact:** Skills become editable without deploys, matching the agent
> pattern.  
> **Risk:** Zero — same extraction pattern as Phase 2.  
> **Estimated Effort:** Small  
> **Dependencies:** Phase 2 (same loader pattern)

### 3.1 Create Skill Prompt Directory

```
backend/src/modules/agent/prompts/
├── agents/          # Agent definitions
│   ├── general.md
│   ├── recruiting-coordinator.md
│   └── ...
└── skills/          # Skill definitions
    ├── scouting-rubric.md
    ├── outreach-copywriting.md
    ├── compliance-rulebook.md
    ├── social-caption-style.md
    ├── static-graphic-style.md
    └── video-highlight-style.md
```

### 3.2 Skill Markdown Format

```markdown
---
name: scouting_rubric
category: evaluation
description: >
  Sport-specific player evaluation rubrics, scouting report templates, grading
  scales, prospect scoring, athlete assessment, Physical Technical Mental
  Potential dimensions.
---

## Scout Report Format

When generating a scout report, always follow this structure:

### [Name] — [Position] | [School] | Class of [Year]

**Overall Grade: [X]/100**

| Dimension | Score | Notes                             |
| --------- | ----- | --------------------------------- |
| Physical  | /100  | Height, weight, speed, strength   |
| Technical | /100  | Sport-specific skills, mechanics  |
| Mental    | /100  | IQ, decision-making, coachability |
| Potential | /100  | Ceiling, developmental timeline   |

...
```

### 3.3 Create `MarkdownSkill` + Loader

Same pattern as `MarkdownAgent` + `agent-loader.ts`. The `MarkdownSkill` extends
`BaseSkill` and loads its `getPromptContext()` from the `.md` body.

**Exception:** `GlobalKnowledgeSkill` stays in TypeScript — it has a custom
`matchIntent()` override and real-time vector retrieval logic.

---

## Phase 4: Dynamic Agent Registry (Future-Proofing)

> **Impact:** Add new agents without code changes or deploys.  
> **Risk:** Medium — changes the `AgentIdentifier` type.  
> **Estimated Effort:** Medium  
> **Dependencies:** Phase 2

### 4.1 Problem

Currently, `AgentIdentifier` in `@nxt1/core` is a string literal union:

```typescript
export type AgentIdentifier =
  | 'router'
  | 'data_coordinator'
  | 'recruiting_coordinator'
  | 'brand_media_coordinator'
  | 'performance_coordinator'
  | 'compliance_coordinator'
  | 'general';
```

Adding a new agent requires editing this type AND adding to `AGENT_DESCRIPTORS`.
This means a package build + deploy just to add a new coordinator.

### 4.2 Solution: Dynamic Agent Descriptors

Change `AgentIdentifier` to `string` (branded):

```typescript
export type AgentIdentifier = string & { readonly __brand: 'AgentIdentifier' };
```

Make `AGENT_DESCRIPTORS` a runtime-populated `Map` that the loader fills from
the `.md` files instead of a hardcoded object.

Update the Planner's system prompt to read from the dynamic registry instead of
the static `AGENT_DESCRIPTORS` constant.

### 4.3 Impact Matrix

| Component                           | Change Needed                                      |
| ----------------------------------- | -------------------------------------------------- |
| `@nxt1/core` `AgentIdentifier` type | Widen from literal union to branded string         |
| `@nxt1/core` `AGENT_DESCRIPTORS`    | Convert from `const` to mutable `Map`              |
| `PlannerAgent.getSystemPrompt()`    | Read from runtime registry instead of static const |
| Frontend agent status display       | No change (already renders any `agentId` string)   |
| BullMQ job payloads                 | No change (already typed as `AgentIdentifier`)     |

---

## Phase 5: Advanced Capabilities (Post-MVP)

> **These are stretch goals after Phases 1-4 are production-stable.**

### 5.1 Prompt Versioning & A/B Testing

Store agent prompt versions in MongoDB with metadata:

```typescript
interface AgentPromptVersion {
  agentId: string;
  version: number;
  prompt: string; // Full Markdown body
  createdAt: Date;
  createdBy: string; // userId of editor
  isActive: boolean;
  abTestGroup?: 'A' | 'B';
  metrics?: {
    avgTokensUsed: number;
    avgLatencyMs: number;
    successRate: number;
    userSatisfactionScore: number;
  };
}
```

The `AgentLoader` checks MongoDB first (for live overrides), then falls back to
the filesystem `.md` files. This allows hot-patching in production without a
deploy.

### 5.2 Admin Dashboard for Prompt Editing

Build a simple admin UI where authorized users (CTO, domain experts) can:

- View all agents and their current prompts
- Edit prompts in a Markdown editor with live preview
- Save new versions (appends to version history)
- Roll back to a previous version
- Enable/disable A/B test groups
- View per-agent performance metrics (tokens, latency, success rate)

### 5.3 Prompt Observability

Add per-agent metrics tracking:

| Metric                  | Source                     | Purpose                          |
| ----------------------- | -------------------------- | -------------------------------- |
| Prompt token count      | OpenRouter response        | Track prompt growth over time    |
| Completion token count  | OpenRouter response        | Cost tracking per agent          |
| Tool call count per run | ReAct loop iterations      | Efficiency (fewer = better)      |
| Delegation frequency    | `delegate_task` calls      | Detect over-delegation           |
| Error rate              | Catch blocks in ReAct loop | Detect broken tool interactions  |
| Average latency         | Job start → complete       | Performance regression detection |

### 5.4 Context Window Budget System

Implement a token budget allocator that distributes the model's context window
across competing needs:

```
Total Context Budget: 128K tokens (e.g., for Claude 3.5 Sonnet)
├── System Prompt:        ~2K  (agent + skills)
├── User Context:         ~500 (profile, sport, school)
├── Thread History:       ~4K  (recent messages)
├── Tool Observations:   ~8K  (capped per tool via MAX_OBSERVATION_LENGTH)
├── Working Memory:       ~2K  (intermediate reasoning)
└── Response Budget:      ~4K  (max_tokens for generation)
                         ─────
                         ~20K used → 108K headroom
```

When a tool observation exceeds its budget, the system should:

1. Prefer `markdown` (already shorter by design)
2. If still over budget, truncate with a `...[truncated, showing top N]` note
3. Track truncation events as observability metrics

---

## Implementation Order & Dependencies

```
Phase 1 (Token Savings)          Phase 2 (Markdown Agents)
├── 1.1 ToolResult interface     ├── 2.1 prompts/ directory
├── 1.2 BaseAgent ReAct loop     ├── 2.2 .md file format
├── 1.3 Job context MD           ├── 2.3 MarkdownAgent class
├── 1.4 Convert heavy tools      ├── 2.4 Agent loader
├── 1.5 markdown-helpers.ts      ├── 2.5 Bootstrap update
│                                ├── 2.6 Keep Planner in TS
│   Can run in parallel ←───────→│  Can run in parallel
│                                ├── 2.7 Extract prompts
│                                └── 2.8 Delete old agents
│                                         │
│                                         ▼
│                                Phase 3 (Markdown Skills)
│                                ├── 3.1 skills/ directory
│                                ├── 3.2 Skill .md format
│                                └── 3.3 MarkdownSkill + loader
│                                         │
│                                         ▼
│                                Phase 4 (Dynamic Registry)
│                                ├── 4.1 Widen AgentIdentifier
│                                ├── 4.2 Dynamic AGENT_DESCRIPTORS
│                                └── 4.3 Update PlannerAgent
│                                         │
│                                         ▼
│                                Phase 5 (Advanced — Post-MVP)
│                                ├── 5.1 Prompt versioning
│                                ├── 5.2 Admin dashboard
│                                ├── 5.3 Observability
│                                └── 5.4 Token budget system
```

---

## File Change Summary

### New Files

| File                                                                | Phase | Purpose                                           |
| ------------------------------------------------------------------- | ----- | ------------------------------------------------- |
| `backend/src/modules/agent/tools/markdown-helpers.ts`               | 1     | `toMarkdownTable()`, `toMarkdownList()` utilities |
| `backend/src/modules/agent/agents/markdown-agent.ts`                | 2     | Generic agent that loads from `.md` definition    |
| `backend/src/modules/agent/agents/agent-loader.ts`                  | 2     | YAML frontmatter parser + filesystem loader       |
| `backend/src/modules/agent/prompts/general.md`                      | 2     | General Agent prompt definition                   |
| `backend/src/modules/agent/prompts/recruiting-coordinator.md`       | 2     | Recruiting Coordinator prompt                     |
| `backend/src/modules/agent/prompts/data-coordinator.md`             | 2     | Data Coordinator prompt                           |
| `backend/src/modules/agent/prompts/performance-coordinator.md`      | 2     | Performance Coordinator prompt                    |
| `backend/src/modules/agent/prompts/compliance-coordinator.md`       | 2     | Compliance Coordinator prompt                     |
| `backend/src/modules/agent/prompts/brand-media-coordinator.md`      | 2     | Brand & Media Coordinator prompt                  |
| `backend/src/modules/agent/prompts/skills/scouting-rubric.md`       | 3     | Scouting skill definition                         |
| `backend/src/modules/agent/prompts/skills/outreach-copywriting.md`  | 3     | Copywriting skill definition                      |
| `backend/src/modules/agent/prompts/skills/compliance-rulebook.md`   | 3     | Compliance skill definition                       |
| `backend/src/modules/agent/prompts/skills/social-caption-style.md`  | 3     | Social caption skill                              |
| `backend/src/modules/agent/prompts/skills/static-graphic-style.md`  | 3     | Graphic style skill                               |
| `backend/src/modules/agent/prompts/skills/video-highlight-style.md` | 3     | Video highlight skill                             |

### Modified Files

| File                                                                      | Phase | Change                                                 |
| ------------------------------------------------------------------------- | ----- | ------------------------------------------------------ |
| `backend/src/modules/agent/tools/base.tool.ts`                            | 1     | Add `markdown` to `ToolResult`                         |
| `backend/src/modules/agent/agents/base.agent.ts`                          | 1     | Prefer `markdown` in ReAct observation pipeline        |
| `backend/src/modules/agent/agent.router.ts`                               | 1     | Convert job context to Markdown                        |
| `backend/src/modules/agent/tools/database/search-colleges.tool.ts`        | 1     | Add `markdown` to return                               |
| `backend/src/modules/agent/tools/database/search-college-coaches.tool.ts` | 1     | Add `markdown` to return                               |
| `backend/src/modules/agent/tools/integrations/web-search.tool.ts`         | 1     | Add `markdown` to return                               |
| `backend/src/modules/agent/queue/bootstrap.ts`                            | 2     | Replace hardcoded agents with `loadAgentDefinitions()` |
| `backend/src/modules/agent/agents/index.ts`                               | 2     | Update barrel exports                                  |
| `packages/core/src/ai/agent.types.ts`                                     | 4     | Widen `AgentIdentifier` type                           |
| `packages/core/src/ai/agent.constants.ts`                                 | 4     | Make `AGENT_DESCRIPTORS` dynamic                       |

### Deleted Files (Phase 2.8)

| File                                                                | Replaced By                          |
| ------------------------------------------------------------------- | ------------------------------------ |
| `backend/src/modules/agent/agents/general.agent.ts`                 | `prompts/general.md`                 |
| `backend/src/modules/agent/agents/recruiting-coordinator.agent.ts`  | `prompts/recruiting-coordinator.md`  |
| `backend/src/modules/agent/agents/data-coordinator.agent.ts`        | `prompts/data-coordinator.md`        |
| `backend/src/modules/agent/agents/performance-coordinator.agent.ts` | `prompts/performance-coordinator.md` |
| `backend/src/modules/agent/agents/compliance-coordinator.agent.ts`  | `prompts/compliance-coordinator.md`  |
| `backend/src/modules/agent/agents/brand-media-coordinator.agent.ts` | `prompts/brand-media-coordinator.md` |

---

## Testing Strategy

### Phase 1 Tests

- [ ] Existing tool tests still pass (JSON fallback path)
- [ ] New tools returning `markdown` field are fed to model correctly
- [ ] `toMarkdownTable()` and `toMarkdownList()` helpers produce valid Markdown
- [ ] `search_colleges` with `markdown` returns a valid table
- [ ] BaseAgent ReAct loop prefers `markdown` over `JSON.stringify` when
      available

### Phase 2 Tests

- [ ] `parseFrontmatter()` correctly extracts YAML scalars and arrays
- [ ] `loadAgentDefinitions()` loads all 6 `.md` files from `prompts/`
- [ ] `MarkdownAgent` correctly delegates to `getSystemPrompt()`,
      `getAvailableTools()`, `getSkills()`
- [ ] Bootstrap creates all agents from `.md` files
- [ ] PlannerAgent still works (stays in TypeScript)
- [ ] Full integration: user message → planner → coordinator → tool → result
      (end-to-end)

### Phase 3 Tests

- [ ] `MarkdownSkill` correctly loads from `.md` files
- [ ] Skill semantic matching still works with loaded skills
- [ ] `GlobalKnowledgeSkill` (TypeScript) still functions alongside Markdown
      skills

### Phase 4 Tests

- [ ] New agent `.md` file is automatically discovered without code changes
- [ ] PlannerAgent includes dynamically registered agents in its catalogue
- [ ] Existing `AgentIdentifier` values still work across the system

---

## Success Metrics

| Metric                                            | Current                                     | Target                  | How to Measure             |
| ------------------------------------------------- | ------------------------------------------- | ----------------------- | -------------------------- |
| Token usage per tool observation                  | ~2,000-8,000 (JSON)                         | ~800-3,000 (Markdown)   | OpenRouter usage dashboard |
| Cost per agent operation                          | ~$0.08-0.15                                 | ~$0.04-0.08             | Billing module metrics     |
| Deploy-to-prompt-change cycle                     | ~5 min (full deploy)                        | ~0 (hot reload)         | Manual timing              |
| Agent personality files editable by non-engineers | No                                          | Yes                     | `.md` files in prompts/    |
| Time to add a new agent                           | ~30 min (new TS file + imports + bootstrap) | ~5 min (new `.md` file) | Manual timing              |

---

## Phase 6: Runtime Engine Hardening (Post-Audit)

> **Added:** June 2026 — based on a full codebase audit comparing Agent X to
> Copilot-class agent runtimes (Anthropic Claude, VS Code Copilot, AutoGen).  
> **Scope:** 3 missing capabilities + 2 partial upgrades.  
> **Prerequisites:** None — all are independent of Phases 1-5.

### Audit Summary

Before defining this phase, we audited all 8 originally identified gaps against
the actual codebase. Three were **already fully implemented**:

| Capability                        | Status           | Where It Lives                                                                                                                                                                                                                                                     |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session / Conversation Memory     | ✅ Already built | `AgentChatService` (MongoDB threads + messages), `ContextBuilder.getRecentThreadHistory()` (20-msg injection), `MemorySummarizationService` (daily vector extraction)                                                                                              |
| Tool RAG (Dynamic Tool Selection) | ✅ Already built | `BaseTool._embedding` + `matchIntent()`, `ToolRegistry.match()` (cosine similarity, threshold 0.35), wired in `AgentRouter` at direct routing AND DAG execution paths                                                                                              |
| Proactive Agent Intelligence      | ✅ Already built | `AgentTriggerService` (autonomous wake-up), `trigger.listeners.ts` (profile_view, coach_reply, daily_sync_complete, runDailyBriefings), `AgentGenerationService` (briefings + playbooks), `SyncDiffService`, `IntelGenerationService`, `ScheduleRecurringTaskTool` |

The remaining 5 items below are the **actual gaps** to close.

---

### 6.1 Parallel Tool Execution in ReAct Loop

**Status:** 🔴 Missing  
**Impact:** 2-5× latency reduction when the LLM requests multiple independent
tools in a single turn.

**Current behavior** (`base.agent.ts` ~line 270):

```typescript
// Sequential — each tool blocks the next
for (const toolCall of result.toolCalls) {
  const observation = await this.executeTool(toolCall, registry, userId);
  messages.push({
    role: 'tool',
    content: observation,
    tool_call_id: toolCall.id,
  });
}
```

**Target behavior:**

```typescript
// Parallel — independent tools execute concurrently
const observations = await Promise.all(
  result.toolCalls.map(async (toolCall) => ({
    toolCall,
    observation: await this.executeTool(toolCall, registry, userId),
  }))
);

for (const { toolCall, observation } of observations) {
  messages.push({
    role: 'tool',
    content: observation,
    tool_call_id: toolCall.id,
  });
}
```

**Considerations:**

- Mutation tools (`isMutation === true`) should still run sequentially to
  preserve ordering guarantees (e.g., create then update).
- Read-only tools can safely run in parallel.
- Group tool calls: parallel batch for reads, then sequential for mutations.

---

### 6.2 Mid-Loop Context Compression (Sliding Window)

**Status:** 🟡 Partial  
**What exists:** Per-observation truncation (8K chars), per-message history cap
(20 msgs × 500 chars), `ContextBuilder.compressToPrompt()` for profile data.  
**What's missing:** The cumulative `messages[]` array inside a single ReAct run
grows unbounded across iterations. A 15-iteration run can exceed 100K tokens.

**Implementation plan:**

```typescript
// After every N iterations (e.g., 5), compress the conversation so far
if (iteration > 0 && iteration % COMPRESSION_INTERVAL === 0) {
  const compressed = await this.compressMessages(messages, context);
  messages.length = 0;
  messages.push(
    { role: 'system', content: systemPrompt },
    { role: 'assistant', content: compressed }
  );
}
```

**Compression strategy:**

- Use a cheap/fast model (extraction tier) to summarize completed tool steps.
- Preserve: system prompt, last 3 messages, any pending tool results.
- Discard: intermediate reasoning, completed tool observations.
- Track `totalTokensUsed` to trigger compression dynamically rather than on a
  fixed interval.

---

### 6.3 Structured Retry Protocol for Tool Failures

**Status:** 🔴 Missing  
**What exists:** Task-level retries (`TASK_MAX_RETRIES = 2` in `AgentRouter`),
LLM-level fallback chains (`MODEL_FALLBACK_CHAIN`).  
**What's missing:** When a tool fails inside the ReAct loop, the error is
serialized back to the LLM as an observation. The LLM may or may not retry —
there's no structured protocol.

**Implementation plan:**

```typescript
interface ToolRetryPolicy {
  maxRetries: number; // Default: 2
  backoffMs: number; // Default: 1000
  retryableErrors: string[]; // e.g., ['ECONNRESET', 'TIMEOUT', '429']
  isTransient: (error: Error) => boolean;
}
```

**Behavior:**

- Tool base class gets a `retryPolicy` property (opt-in per tool).
- `executeTool()` wraps execution in a retry loop with exponential backoff.
- Only transient errors (network, rate-limit, timeout) trigger retries.
- Validation errors, auth errors, and business logic errors fail immediately.
- Each retry is logged as a breadcrumb for debugging.
- After exhausting retries, the error observation is fed to the LLM as today.

---

### 6.4 Automated Content Safety Pipeline (Guardrails)

**Status:** 🟡 Partial  
**What exists:** `meta-llama/llama-guard-3-8b` registered in `MODEL_CATALOGUE`
(moderation tier), `ApprovalGateService` for human-in-the-loop on mutations,
`isMutation` flag on tools, `blocked_by_guardrail` status tracking.  
**What's missing:** No automated pre/post classification pipeline. The
moderation model is defined but never called in the request flow.

**Implementation plan:**

```
User message → [PRE-GUARD: classify input] → Agent routing → LLM response
            → [POST-GUARD: classify output] → Stream to user

Pre-guard:  Block prompt injection, jailbreak, harmful content
Post-guard: Block PII leakage, harmful output, off-topic drift
```

**Architecture:**

```typescript
// backend/src/modules/agent/guardrails/guardrail.service.ts
export class GuardrailService {
  async classifyInput(message: string): Promise<GuardrailResult> {
    // Call llama-guard-3-8b via OpenRouter (moderation tier)
    // Return: { safe: boolean, category?: string, confidence: number }
  }

  async classifyOutput(response: string): Promise<GuardrailResult> {
    // Same model, different prompt template for output classification
  }
}
```

**Integration points:**

- `AgentRouter.run()` — call `classifyInput()` before routing.
- `BaseAgent.runLoop()` — call `classifyOutput()` on final response before
  streaming to user.
- Bypass for trusted internal operations (trigger-initiated, system-initiated).
- Rate-limit guard calls to avoid cost explosion (cache recent classifications).

---

### 6.5 Evaluation & Regression Testing Pipeline

**Status:** 🔴 Missing  
**Impact:** Without evals, prompt changes and model upgrades are blind — no way
to detect regressions before they hit production.

**Implementation plan:**

```
backend/src/modules/agent/
├── evals/
│   ├── eval.runner.ts            # Orchestrates eval suites
│   ├── eval.types.ts             # EvalCase, EvalResult, EvalSuite interfaces
│   ├── eval.reporter.ts          # JSON + Markdown report generation
│   ├── suites/
│   │   ├── routing.eval.ts       # Does PlannerAgent pick correct agents?
│   │   ├── tool-selection.eval.ts # Does Tool RAG find the right tools?
│   │   ├── skill-matching.eval.ts # Does SkillRegistry match correct skills?
│   │   ├── response-quality.eval.ts # LLM-as-judge scoring
│   │   └── guardrail.eval.ts     # Do guardrails catch adversarial inputs?
│   └── golden/
│       ├── routing.golden.json   # Expected agent assignments per intent
│       ├── tools.golden.json     # Expected tool selections per intent
│       └── responses.golden.json # High-quality reference responses
```

**Eval types:**

| Type              | What It Tests                           | Scoring                             |
| ----------------- | --------------------------------------- | ----------------------------------- |
| **Deterministic** | Routing, tool selection, skill matching | Exact match against golden answers  |
| **LLM-as-Judge**  | Response quality, helpfulness, accuracy | GPT-4o scores 1-5 on rubric         |
| **Adversarial**   | Guardrail effectiveness                 | Should-block / should-pass accuracy |
| **Latency**       | End-to-end response time                | P50, P95, P99 percentiles           |

**CI integration:**

- Run deterministic evals on every PR touching `agent/` module.
- Run LLM-as-Judge evals nightly (cost-controlled).
- Block merges if routing accuracy drops below 95%.
- Store results in MongoDB `agent_eval_runs` collection for trend analysis.

---

### Phase 6 Success Metrics

| Metric                         | Current                             | Target                               | How to Measure                |
| ------------------------------ | ----------------------------------- | ------------------------------------ | ----------------------------- |
| Multi-tool turn latency        | Sequential (sum of all tools)       | Parallel (max of read tools)         | OpenRouter + tool timing logs |
| Max tokens per ReAct run       | Unbounded (~100K+ on complex tasks) | Capped at ~30K via compression       | Token counter in BaseAgent    |
| Tool failure recovery rate     | 0% (errors go straight to LLM)      | 80%+ transient errors auto-recovered | Retry success metrics         |
| Harmful content blocked (pre)  | 0% (no classifier)                  | 99%+ on adversarial test suite       | Guardrail eval suite          |
| Routing accuracy on eval suite | Unknown                             | 95%+                                 | Deterministic eval runner     |
| Prompt regression detection    | None                                | Automated on every PR                | CI pipeline                   |
