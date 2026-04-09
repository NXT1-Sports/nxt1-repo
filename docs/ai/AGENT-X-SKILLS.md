# Agent X — Dynamic Skill Loading System

> **2026 ENTERPRISE STANDARD** — This document is the single source of truth for
> the Agent X Dynamic Skill Loading (Domain Knowledge RAG) system. All future
> skills must follow the patterns defined here.

---

## Table of Contents

1. [What Are Skills?](#1-what-are-skills)
2. [The Problem They Solve](#2-the-problem-they-solve)
3. [Architecture Overview](#3-architecture-overview)
4. [How It Works — Step by Step](#4-how-it-works--step-by-step)
5. [File Structure](#5-file-structure)
6. [Skill Inventory](#6-skill-inventory)
7. [Coordinator → Skill Mapping](#7-coordinator--skill-mapping)
8. [Adding a New Skill](#8-adding-a-new-skill)
9. [Configuration & Tuning](#9-configuration--tuning)
10. [Design Decisions & Rationale](#10-design-decisions--rationale)
11. [Testing Patterns](#11-testing-patterns)

---

## 1. What Are Skills?

A **Skill** is a unit of domain knowledge — a rubric, template, rulebook, or set
of heuristics — that an AI coordinator agent uses to do its job correctly.

Skills are **not tools**. The distinction is critical:

|                   | Tools                                          | Skills                                        |
| ----------------- | ---------------------------------------------- | --------------------------------------------- |
| **What they are** | Executable code functions                      | Plain-text domain knowledge                   |
| **What they do**  | Take actions (search, send email, write to DB) | Teach the LLM _how_ to think about a task     |
| **When loaded**   | Always available to the agent                  | Only loaded when semantically relevant        |
| **Runtime cost**  | One API call per invocation                    | One embedding API call per skill per lifetime |

**Example:**

- `search_web` is a **Tool** — it calls an API and returns live results.
- `scouting_rubric` is a **Skill** — it tells the LLM to score players on a
  1–100 scale using a specific Markdown table format.

---

## 2. The Problem They Solve

Without skills, every coordinator agent carries its domain rules directly in its
system prompt:

```
❌ BEFORE (Hardcoded System Prompt)

You are the Performance Coordinator...

## Scout Report Format              ← Always injected (even for film analysis)
| Dimension | Score | Notes |
|---|---|---|
...

## Scoring Calibration             ← Always injected (even for stat lookups)
- 90+ = Elite prospect
...

## Email Writing Rules             ← Wrong agent, but imagine if it was here
...
```

This causes **four compounding problems:**

1. **Token waste** — Rules for tasks the agent isn't doing right now consume
   context window space on every single call.
2. **Context dilution** — An LLM with a 4,000-token system prompt reasons less
   sharply than one with a 300-token prompt + targeted injection.
3. **Tight coupling** — Changing the scout report template means editing the
   agent class. No separation of concerns.
4. **Knowledge drift** — Rules copied across multiple agents diverge over time.
   There is no single source of truth.

**The solution: Retrieval-Augmented Generation (RAG) for Agent Rules.**

Store rules in skills. At runtime, embed the user's intent and semantically
match only the relevant skills. Inject them only when needed.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  SERVER BOOT (bootstrap.ts)                                         │
│                                                                     │
│  SkillRegistry                                                      │
│    ├── ScoutingRubricSkill      (description in RAM, no vector yet) │
│    ├── OutreachCopywritingSkill (description in RAM, no vector yet) │
│    ├── ComplianceRulebookSkill  (description in RAM, no vector yet) │
│    ├── StaticGraphicStyleSkill  (description in RAM, no vector yet) │
│    ├── VideoHighlightStyleSkill (description in RAM, no vector yet) │
│    └── SocialCaptionStyleSkill  (description in RAM, no vector yet) │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                          AgentRouter receives skillRegistry
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│  RUNTIME (per request)                                              │
│                                                                     │
│  User: "Generate a scout report for Marcus Allen"                  │
│                    │                                                │
│                    ▼                                                │
│         llm.embed(intent)   →   1536-dim float vector              │
│                    │                                                │
│                    ▼                                                │
│         SkillRegistry.match(intentVector, embedFn, allowedSkills)  │
│           │                                                         │
│           ├── ScoutingRubricSkill:                                  │
│           │     ├── embed(description) → cached vector (first use) │
│           │     └── cosineSim(intent, skill) = 0.82  ✅ MATCH       │
│           │                                                         │
│           └── [Other allowed skills checked — below threshold]      │
│                    │                                                │
│                    ▼                                                │
│         skillRegistry.buildPromptBlock(matched)                    │
│           └── Returns Markdown block with scouting_rubric rules    │
│                    │                                                │
│                    ▼                                                │
│         systemPrompt + "\n" + skillBlock → LLM                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. How It Works — Step by Step

### Step 1 — Registration (Server Boot)

`bootstrap.ts` instantiates the `SkillRegistry` and registers all skill
instances. At this stage, only the skill metadata (name, description, category)
exists in memory. **No embeddings are computed yet.**

```ts
const skillRegistry = new SkillRegistry();
skillRegistry.register(new ScoutingRubricSkill());
skillRegistry.register(new OutreachCopywritingSkill());
// ...
```

The registry is passed into the `AgentRouter` as a constructor parameter.

---

### Step 2 — Coordinator Declares Its Scope

Each coordinator overrides `getSkills()` on `BaseAgent` to declare which skill
names it is allowed to draw from:

```ts
// PerformanceCoordinatorAgent
override getSkills(): readonly string[] {
  return ['scouting_rubric'];
}

// BrandMediaCoordinatorAgent
override getSkills(): readonly string[] {
  return ['static_graphic_style', 'video_highlight_style', 'social_caption_style'];
}
```

The default implementation on `BaseAgent` returns `[]`, so agents that don't use
skills (`GeneralAgent`, `DataCoordinatorAgent`) require no change.

---

### Step 3 — Intent Embedding

When a coordinator's `execute()` is called with a user intent, the first step of
skill loading embeds the intent text:

```ts
const intentEmbedding = await llm.embed(intent);
// → [0.0023, -0.084, 0.231, ... ]  (1536 floats via openai/text-embedding-3-small)
```

---

### Step 4 — Semantic Matching

`SkillRegistry.match()` is called with the intent vector, the embedding function
(for lazy skill vectorization), and the list of allowed skill names:

```ts
const matched = await skillRegistry.match(
  intentEmbedding,
  (text) => llm.embed(text),
  this.getSkills() // Only consider this coordinator's skills
);
```

For each candidate skill:

1. **Lazy embed**: If `skill._embedding` is `null`, embed `skill.description`
   once and store it in the instance. All subsequent requests reuse the cache.
2. **Score**: Compute cosine similarity between intent vector and skill vector.
3. **Filter**: Only skills with `similarity ≥ DEFAULT_SKILL_THRESHOLD (0.35)`
   are included.
4. **Sort**: Results are ordered by **descending similarity**.

All candidate skills are evaluated **in parallel** via `Promise.all()`.

**Cosine Similarity Formula:**

$$\cos(\theta) = \frac{\vec{A} \cdot \vec{B}}{\|\vec{A}\| \times \|\vec{B}\|}$$

Returns `1.0` for identical direction, `0.0` for orthogonal semantics, `-1.0`
for opposite. In practice, semantically related sports/recruiting text
consistently scores `0.5–0.9`.

---

### Step 5 — Prompt Block Construction

The registry formats matched skills into an injected Markdown block:

```ts
const skillBlock = skillRegistry.buildPromptBlock(matched);
```

Output example:

```markdown
## Loaded Skills (dynamically matched to this task)

### Skill: scouting_rubric (relevance: 0.82)

## Scout Report Format

When generating a scout report, always follow this structure:

### [Name] — [Position] | [School] | Class of [Year]

**Overall Grade: [X]/100** | Dimension | Score | Notes | |---|---|---| ...
```

---

### Step 6 — System Prompt Assembly

The skill block is appended to the coordinator's base system prompt before the
LLM is called:

```ts
const systemContent = skillBlock
  ? `${this.getSystemPrompt(context)}\n${skillBlock}`
  : this.getSystemPrompt(context);

messages = [
  { role: 'system', content: systemContent },
  { role: 'user', content: intent },
];
```

The final system prompt seen by the LLM is **only as large as it needs to be**
for the current task.

---

### Step 7 — Graceful Degradation

The entire embedding → matching → injection flow is wrapped in a `try/catch`:

```ts
try {
  const intentEmbedding = await llm.embed(intent);
  const matched = await skillRegistry.match(...);
  if (matched.length > 0) {
    skillBlock = skillRegistry.buildPromptBlock(matched);
  }
} catch (err) {
  // Skill loading is best-effort — agent still functions without skills
  logger.warn(`[${this.id}] Skill loading failed — proceeding without skills`, { error });
}
```

If the embedding API is temporarily unavailable, the agent proceeds using its
base system prompt. Each coordinator's base prompt contains fallback language:

> _"If a 'Loaded Skills' section appears below, follow it exactly. If no skills
> are loaded, [graceful fallback behavior specific to the task]."_

---

## 5. File Structure

```
backend/src/modules/agent/skills/
│
├── index.ts                              # Barrel — all public exports
├── base.skill.ts                         # BaseSkill abstract class
│                                         #   cosineSimilarity() pure function
│                                         #   DEFAULT_SKILL_THRESHOLD = 0.35
│                                         #   matchIntent() with lazy cache
│
├── skill-registry.ts                     # SkillRegistry class
│                                         #   register() — reject duplicates
│                                         #   get(name) — by name lookup
│                                         #   listAll() — list registered names
│                                         #   match() — semantic matching (parallel)
│                                         #   buildPromptBlock() — format injection
│
├── evaluation/
│   └── scouting-rubric.skill.ts         # name: 'scouting_rubric'
│
├── copywriting/
│   └── outreach-copywriting.skill.ts    # name: 'outreach_copywriting'
│
├── compliance/
│   └── compliance-rulebook.skill.ts     # name: 'compliance_rulebook'
│
├── brand/
│   ├── static-graphic-style.skill.ts    # name: 'static_graphic_style'
│   ├── video-highlight-style.skill.ts   # name: 'video_highlight_style'
│   └── social-caption-style.skill.ts    # name: 'social_caption_style'
│
└── __tests__/
    └── skill-system.spec.ts             # 17 unit tests
```

---

## 6. Skill Inventory

### `scouting_rubric` — Evaluation

**Coordinator:** `PerformanceCoordinatorAgent`

Injects the exact scout report Markdown table format, the 1–100 grading scale
calibrated to NCAA division tiers, and the evaluation rules (no fabricated
stats, cite data sources, gather evidence before scoring).

**Triggers on intents like:** _"Generate a scout report"_, _"Evaluate this
player"_, _"Score his film"_, _"Compare these two prospects"_

---

### `outreach_copywriting` — Copywriting

**Coordinator:** `RecruitingCoordinatorAgent`

Injects the email subject line formula (`Name | Grad Year | Position | Metric`),
the 150-word body structure, the target list building criteria, and the 4-step
outreach campaign sequence (intro → follow-up → visit invite → commit tracking).

**Triggers on intents like:** _"Write an email to the Ohio State coach"_,
_"Build me a target college list"_, _"Draft a follow-up message"_

---

### `compliance_rulebook` — Compliance

**Coordinator:** `ComplianceCoordinatorAgent`

Injects the NCAA Division I/II/III, NAIA, and NJCAA recruiting calendar quick
reference, academic eligibility cutoffs (GPA, core courses, SAT/ACT thresholds
per division), and the compliance verdict format (✅ COMPLIANT / ⚠️ CAUTION / 🚫
BLOCKED with mandatory alternative and next window fields).

**Triggers on intents like:** _"Can the coach contact me this week?"_, _"Is this
email compliant?"_, _"Check my eligibility"_, _"When is the dead period?"_

---

### `static_graphic_style` — Brand

**Coordinator:** `BrandMediaCoordinatorAgent`

Injects the NXT1 ESPN/Bleacher Report visual identity guidelines: bold
sans-serif typography (ALL-CAPS names), dark background + neon accent color
palettes, asymmetric layout composition rules, pill-shaped stat badges, and the
welcome graphic personalization pattern.

**Triggers on intents like:** _"Create a promo graphic"_, _"Make a welcome
card"_, _"Design a stat card"_, _"Generate a commitment graphic"_

---

### `video_highlight_style` — Brand

**Coordinator:** `BrandMediaCoordinatorAgent`

Injects the 4-part highlight reel structure (intro → top plays → stat overlay →
outro), pacing and cut-on-action rules, ESPN/CBS Sports broadcast aesthetic
(lower-thirds, score bug overlays, animated stat countups), and technical
requirements (720p+, 30/60fps, music BPM guidance).

**Triggers on intents like:** _"Cut a highlight reel"_, _"Edit my film"_, _"Make
a recruiting video"_, _"Create a video intro"_

---

### `social_caption_style` — Brand

**Coordinator:** `BrandMediaCoordinatorAgent`

Injects the Overtime/House of Highlights voice and tone guidelines, the hook →
body → hashtag caption structure, the NXT1 hashtag strategy
(`#NXT1 #AgentX #[Sport] #[State]`), and platform-specific rules for Instagram,
Twitter/X, and TikTok.

**Triggers on intents like:** _"Write a caption for this graphic"_, _"Create a
post for my highlight"_, _"Make Instagram copy"_, _"Draft a TikTok caption"_

---

## 7. Coordinator → Skill Mapping

```
PerformanceCoordinatorAgent
  └── scouting_rubric

RecruitingCoordinatorAgent
  └── outreach_copywriting

ComplianceCoordinatorAgent
  └── compliance_rulebook

BrandMediaCoordinatorAgent
  ├── static_graphic_style
  ├── video_highlight_style
  └── social_caption_style

GeneralAgent            (no skills — broad domain)
DataCoordinatorAgent    (no skills — structured DB writes)
PlannerAgent            (no skills — pure reasoning, overrides execute())
```

---

## 8. Adding a New Skill

Follow all 5 steps. Skipping any step will result in the skill never being
loaded.

### Step 1 — Create the skill file

```ts
// backend/src/modules/agent/skills/[category]/my-new.skill.ts
import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class MyNewSkill extends BaseSkill {
  readonly name = 'my_new_skill'; // unique, snake_case, permanent
  readonly category: SkillCategory = 'strategy';

  // ⚠️ CRITICAL: This string is embedded and used for semantic matching.
  // Write it as a rich, semantically descriptive sentence — NOT a title.
  // Include domain-specific keywords that appear in user intent strings.
  readonly description =
    'Strategy playbook for building team game plans, set plays, defensive schemes, ' +
    'timeout management, and opponent scouting reports for basketball coaches.';

  getPromptContext(_params?: Record<string, unknown>): string {
    return [
      '## Game Planning Rules',
      "- Always open with the opponent's top-3 scoring threats.",
      '- ...',
    ].join('\n');
  }
}
```

> **Description writing rule:** The embedding model scores semantic similarity
> between the user intent and the skill description. Write the description as a
> paragraph that _reads like a user intent_ for this skill's domain. Titles like
> `"Game planning skill"` produce poor vectors. Sentences like
> `"Building team game plans and defensive schemes for basketball coaches"`
> produce vectors that reliably cluster near real user requests.

### Step 2 — Add the `SkillCategory` type (if new)

If your category doesn't exist yet, add it to `base.skill.ts`:

```ts
// base.skill.ts
export type SkillCategory =
  | 'evaluation'
  | 'copywriting'
  | 'compliance'
  | 'strategy' // ← add here
  | 'brand';
```

### Step 3 — Export from the barrel

```ts
// backend/src/modules/agent/skills/index.ts
export { MyNewSkill } from './strategy/my-new.skill.js';
```

### Step 4 — Register in bootstrap

```ts
// backend/src/modules/agent/queue/bootstrap.ts
import {
  SkillRegistry,
  ScoutingRubricSkill,
  // ...existing skills...
  MyNewSkill, // ← add here
} from '../skills/index.js';

skillRegistry.register(new MyNewSkill()); // ← add here
```

### Step 5 — Declare in the coordinator

```ts
// backend/src/modules/agent/agents/[coordinator].agent.ts
override getSkills(): readonly string[] {
  return ['my_new_skill'];   // or add to existing array
}
```

### Step 6 — Write tests

See `__tests__/skill-system.spec.ts` for the full pattern. At minimum, verify:

- `matchIntent()` returns `matched: true` for a semantically close embedding
- `matchIntent()` returns `matched: false` for an orthogonal embedding
- `getPromptContext()` returns the expected rule text

---

## 9. Configuration & Tuning

### Similarity Threshold

```ts
// base.skill.ts
export const DEFAULT_SKILL_THRESHOLD = 0.35;
```

| Threshold | Effect                                                                     |
| --------- | -------------------------------------------------------------------------- |
| `0.25`    | Very permissive — more skills loaded per request, more token usage         |
| `0.35`    | **Default** — empirically safe for 1536-dim `text-embedding-3-small`       |
| `0.50`    | Strict — only highly focused intents match; broad requests may miss skills |
| `0.80+`   | Too strict — nearly identical phrasing required                            |

You can also pass a custom threshold per `registry.match()` call if a specific
coordinator needs a tighter or looser match:

```ts
const matched = await skillRegistry.match(
  intentEmbedding,
  embedFn,
  allowedSkillNames,
  0.5 // override threshold for this agent
);
```

### Embedding Model

The embedding model is determined by `OpenRouterService.embed()`:

```
Model: openai/text-embedding-3-small
Dimensions: 1536
Input truncation: 8,000 characters
API: https://openrouter.ai/api/v1/embeddings
```

This model is shared with `VectorMemoryService` and `SemanticCacheService`.
Changing the model requires re-computing all cached skill embeddings (they are
process-scoped RAM and will re-embed automatically on next server restart).

---

## 10. Design Decisions & Rationale

### Why cosine similarity rather than dot product?

Cosine similarity normalizes for vector magnitude, making it length-invariant. A
short description and a long description of the same concept will score high.
Dot product would unfairly favor longer descriptions.

### Why `import type { SkillRegistry }` in `BaseAgent`?

`SkillRegistry` imports `BaseSkill`. `BaseAgent` imports `SkillRegistry` as a
type only. `BaseSkill` does **not** import `BaseAgent`. Therefore there is no
circular dependency. The `import type` is erased at compile time; the runtime
value flows through the `execute()` parameter. A `dynamic import()` inside
`execute()` would add unnecessary async overhead on every agent call.

### Why is `buildPromptBlock()` an instance method, not static?

Callers already hold the `skillRegistry` instance (it was passed as a
constructor parameter). A static method would require the caller to import the
`SkillRegistry` class separately just to call
`SkillRegistry.buildPromptBlock()`. The instance method eliminates that
redundant import.

### Why are skills registered in bootstrap rather than auto-discovered?

Explicit registration is intentional — it keeps the set of active skills
auditable from a single file. Auto-discovery via filesystem glob or decorators
is "magic" that makes it harder to understand what the agent knows at a glance.

### Why does each coordinator declare `getSkills()` rather than the registry finding them automatically?

Scope control. A `ComplianceRulebookSkill` should never be semantically matched
against a brand graphics request, even if the similarity happens to exceed the
threshold by chance. Each coordinator explicitly scopes its own knowledge
domain.

### Why is skill loading best-effort (try/catch) rather than required?

The embedding API (OpenRouter) is a network call. If it's temporarily
unavailable, the agent should still attempt to fulfill the user's request rather
than fail completely. Domain knowledge is a quality enhancement, not a hard
dependency for basic operation.

---

## 11. Testing Patterns

All skill tests live at:

```
backend/src/modules/agent/skills/__tests__/skill-system.spec.ts
```

Run them with:

```bash
cd backend
npx vitest run src/modules/agent/skills/__tests__/skill-system.spec.ts
```

### Testing cosine similarity

```ts
it('should return 1 for identical vectors', () => {
  const v = [1, 2, 3, 4, 5];
  expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
});
```

### Testing `matchIntent()`

Use **input-based mocks** — not call-count-based mocks. The mock should return a
vector based on the text content to avoid coupling to evaluation order:

```ts
// ✅ CORRECT: mock based on input text
embedFn.mockImplementation(async (text: string) => {
  return text.includes('rubric') || text.includes('evaluation')
    ? [0.95, 0.1, 0]
    : [0, 0.1, 0.95];
});

// ❌ FRAGILE: mock based on call order (couples to Map iteration order)
let callCount = 0;
embedFn.mockImplementation(async () => {
  callCount++;
  return callCount === 1 ? [0.95, 0.1, 0] : [0, 0.1, 0.95];
});
```

### Testing `buildPromptBlock()`

Call on the **registry instance** (not as a static method — `buildPromptBlock`
was intentionally made an instance method):

```ts
const block = registry.buildPromptBlock([{ skill, similarity: 0.85 }]);
expect(block).toContain('## Loaded Skills');
expect(block).toContain('scouting_rubric');
```

### Testing embedding cache

Verify `embedFn` is called **once** for the same skill across multiple
`matchIntent()` calls on the same instance:

```ts
const skill = new OutreachCopywritingSkill();
const embedFn = vi.fn().mockResolvedValue([1, 0, 0]);

await skill.matchIntent([0.9, 0.1, 0], embedFn, 0.3);
await skill.matchIntent([0.8, 0.2, 0], embedFn, 0.3);

expect(embedFn).toHaveBeenCalledOnce(); // not twice
```
