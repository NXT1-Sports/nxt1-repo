# Agent X Architecture & Operations

> **2026 ENTERPRISE STANDARD** — This document defines the architectural
> patterns, state management, and best practices for developing and maintaining
> Agent X across the NXT1 platform.

## 1. Overview

Agent X is the central AI command center for the NXT1 platform. It is not just a
standard chatbot; it is a proactive, background-processing operations engine
designed to execute tasks autonomously (e.g., sending emails, designing
graphics, writing scout reports) across both Web and Mobile environments.

Because Agent X coordinates background jobs, push notifications, native OS
intents, and real-time chat, **strict state management and architectural
discipline** are required.

---

## 2. Core Architecture (The 3-Tier System)

Agent X operates on a strict 3-tier architecture that heavily enforces the
"Backend Does the Heavy Lifting" rule.

### Tier 1: The Backend Engine (Node.js/Express)

- **Responsibilities**: OpenRouter integration, LLM prompt orchestration, tool
  execution, multi-stage background job processing.
- **Storage Strategy**:
  - **MongoDB**: Stores heavy chat history, messages, and long-term conversation
    context.
  - **Firestore**: Stores lightweight `agentJobs` (status, tool names,
    timestamps) for real-time listener updates on the client. Documents
    automatically expire using TTL policies to prevent UI clutter.
- **Rule**: The frontend _never_ calls AI APIs directly. All AI and tool logic
  lives here.

### Tier 2: The Shared UI State (`packages/ui/src/agent-x`)

- **Responsibilities**: API communication, state management, chat history
  caching, real-time Firestore listeners.
- **The Singleton Pattern**: `AgentXService` is injected at the root level
  (`providedIn: 'root'`).
- **CRITICAL REQUIREMENT**: Both the Web and Mobile apps **must** inherit this
  exact service from `@nxt1/ui`. Duplicating this service in the mobile app
  creates a split Dependency Injection tree, leading to orphaned state. **There
  is only one single source of truth.**

### Tier 3: The Frontend Shells (Apps: Web & Mobile)

- **Responsibilities**: UI rendering, input collection, haptic feedback, opening
  bottom sheets, and route administration.
- **Rule**: Views contain _zero_ state logic. They solely rely on Angular
  `effect()` listeners subscribing to the shared `AgentXService`.

---

## 3. Cross-Surface State Management (The Queue Pattern)

### The Problem

When a user taps a Push Notification or clicks an Activity Log entry, the app
must route them to the Agent X shell and open a specific conversation thread. If
background services try to manipulate the UI overlay immediately, race
conditions occur (e.g., trying to render a bottom sheet before the parent router
outlet exists).

### The Solution: `queuePendingThread`

We use an asynchronous, queue-based handoff utilizing Angular Signals.

#### 1. The Handoff (Background / Non-UI Services)

When an external intent occurs (like a notification tap), the intercepting
service simply writes the intent to the shared state queue and routes the user.

```typescript
// apps/mobile/src/app/core/services/push-handler.service.ts
import { AgentXService } from '@nxt1/ui';

@Injectable({ providedIn: 'root' })
export class PushHandlerService {
  private agentX = inject(AgentXService);
  private router = inject(Router);

  onNotificationTap(threadId: string) {
    // 1. Queue the intention safely in the unified state
    this.agentX.queuePendingThread(threadId);

    // 2. Route to the primary shell
    this.router.navigate(['/agent-x']);
  }
}
```

#### 2. The Reaction (Agent X Shell Component)

The `AgentXComponent` boots up. Inside its constructor, it runs an Angular
`effect()` that listens to the `pendingThread` signal. Once it detects a queued
thread, it processes the UI change and clears the queue.

```typescript
// packages/ui/src/agent-x/shell/agent-x.component.ts
import { AgentXService } from '../agent-x.service';

@Component({ ... })
export class AgentXComponent {
  private agentX = inject(AgentXService);
  private bottomSheet = inject(NxtBottomSheetService);

  constructor() {
    effect(() => {
      const pendingThreadId = this.agentX.pendingThread();

      if (pendingThreadId) {
        // 1. Open the UI safely (we are guaranteed to be mounted here)
        this.openChatOverlay(pendingThreadId);

        // 2. Clear the queue so it doesn't fire again
        this.agentX.clearPendingThread();
      }
    });
  }
}
```

---

## 4. Signal-Based Service API (`AgentXService`)

The core `AgentXService` exposes its public state purely through mapped,
read-only Signals. It does not leak variables or `BehaviorSubject` observables.

**Key Signals:**

- `messages()`: The reactive list of chat items.
- `isLoading()`: Prevents overlapping submissions and controls UI skeleton
  animations.
- `pendingThread()`: The active queue for cross-surface thread launching.

---

## 5. Development Checklist & Best Practices

If you are modifying Agent X code, you **must** adhere to these 2026 standards:

- [ ] **No Local Mocks**: Never create an `agent-x.service.ts` inside
      `apps/mobile/` or `apps/web/`. Always use
      `export { AgentXService } from '@nxt1/ui';` to prevent Dependency
      Injection fragmentation.
- [ ] **Event-Driven UI**: Do not manually command the UI to open from deep
      services. Use `queuePendingThread(id)` and let the shell component react
      via `effect()`.
- [ ] **Memory Management**: If creating real-time listeners for jobs (e.g.,
      Firestore `onSnapshot`), ensure the listener is explicitly destroyed when
      the thread is closed to prevent massive memory leaks.
- [ ] **Haptics Integration**: All state transitions inside the shell (Job
      completion, Message Arrival) should trigger standard `@nxt1/ui` haptics
      (e.g., `this.haptics.notification('success')`).
- [ ] **Dual Query Architecture**: For UI feeds like the Dashboard Tasks list,
      merge active background jobs (from Firestore) with historic completed
      items (from the backend endpoints) to give users a seamless view of "What
      Agent X is doing" and "What Agent X has done."

---

## 6. Dynamic Skill Loading (Domain Knowledge RAG)

> **CRITICAL PATTERN** — Do NOT hardcode domain-specific rules (rubrics,
> templates, calendars) inside agent system prompts. All domain knowledge lives
> in `Skills` and is loaded dynamically at runtime.

### 6.1 What Problem Does This Solve?

Without skills, every coordinator agent needs a massive system prompt containing
every possible rule for every possible task. This causes:

- **Token waste** — Injecting scouting rubric rules into every email-writing
  request
- **Context dilution** — A 4,000-token system prompt leaves less space for
  reasoning
- **Tight coupling** — Changing the email template means editing the agent class
- **Stale rules** — No single source of truth; rules drift across multiple
  agents

**The solution:** Rules live in skills, skills are stored as vectors at runtime,
and only the rules relevant to the current intent are injected.

---

### 6.2 Architecture Overview

```
User Intent (plain text)
       │
       ▼
OpenRouterService.embed()          ← 1536-dim vector of the intent
       │
       ▼
SkillRegistry.match()
  ├── For each allowed skill:
  │     └── skill.matchIntent()
  │           ├── Lazily embed skill.description (cached in RAM after first call)
  │           └── cosineSimilarity(intentVector, skillVector) → score
  │
  ├── Filter: score ≥ DEFAULT_SKILL_THRESHOLD (0.35)
  └── Sort: descending similarity
       │
       ▼
SkillRegistry.buildPromptBlock()   ← Formats matched skills into Markdown
       │
       ▼
Appended to system prompt          ← Only injected for THIS invocation
       │
       ▼
LLM ReAct Loop (BaseAgent.execute())
```

---

### 6.3 File Structure

```
backend/src/modules/agent/skills/
├── index.ts                       # Barrel export — all public symbols
├── base.skill.ts                  # Abstract BaseSkill + cosineSimilarity + DEFAULT_SKILL_THRESHOLD
├── skill-registry.ts              # SkillRegistry class — register / match / buildPromptBlock
├── evaluation/
│   └── scouting-rubric.skill.ts  # Scout report format, 1–100 grading scale, evaluation rules
├── copywriting/
│   └── outreach-copywriting.skill.ts  # Email templates, subject lines, target list building
├── compliance/
│   └── compliance-rulebook.skill.ts   # NCAA/NAIA/NJCAA calendar, eligibility cutoffs, verdict format
├── brand/
│   ├── static-graphic-style.skill.ts  # Promo cards, player cards, typography, color palettes
│   ├── video-highlight-style.skill.ts # Highlight reel structure, pacing, broadcast aesthetic
│   └── social-caption-style.skill.ts  # Caption voice, hashtag strategy, platform rules
└── __tests__/
    └── skill-system.spec.ts       # 17 unit tests (cosine similarity, matchIntent, registry)
```

---

### 6.4 Skill Lifecycle (Step by Step)

#### Step 1 — Server Boot (`bootstrap.ts`)

```ts
const skillRegistry = new SkillRegistry();
skillRegistry.register(new ScoutingRubricSkill());
skillRegistry.register(new OutreachCopywritingSkill());
skillRegistry.register(new ComplianceRulebookSkill());
skillRegistry.register(new StaticGraphicStyleSkill());
skillRegistry.register(new VideoHighlightStyleSkill());
skillRegistry.register(new SocialCaptionStyleSkill());

const router = new AgentRouter(
  llm,
  toolRegistry,
  contextBuilder,
  guardrailRunner,
  skillRegistry
);
```

All 6 skills are registered. Their description embeddings are **not** computed
yet — they are lazily loaded.

#### Step 2 — Task Dispatch (`AgentRouter`)

The `AgentRouter` passes the `skillRegistry` instance as the 5th argument to
every `agent.execute()` call.

#### Step 3 — Coordinator Declares Its Skills (`BaseAgent.getSkills()`)

Each coordinator overrides `getSkills()` to declare which skills it is permitted
to use:

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

Agents that don't use skills (e.g., `GeneralAgent`, `DataCoordinatorAgent`)
inherit the default:

```ts
// BaseAgent default — no skills
getSkills(): readonly string[] {
  return [];
}
```

#### Step 4 — Intent Embedding (`BaseAgent.execute()`)

```ts
const intentEmbedding = await llm.embed(intent);
```

The user's intent string (e.g., _"Generate a scout report for Marcus Allen"_) is
sent to `openai/text-embedding-3-small` and returned as a 1536-dimensional
vector.

#### Step 5 — Semantic Matching (`SkillRegistry.match()`)

```ts
const matched = await skillRegistry.match(
  intentEmbedding,
  (text) => llm.embed(text),
  allowedSkillNames // Only skills from getSkills()
);
```

For each allowed skill:

1. Check if `skill._embedding` is cached. If not, embed `skill.description` once
   and store it.
2. Compute `cosineSimilarity(intentEmbedding, skill._embedding)`.
3. If score ≥ `0.35`, include in results.

Results are sorted **descending by similarity** so the most relevant skill
context appears first.

**Cosine Similarity Formula:**
$$\cos(\theta) = \frac{A \cdot B}{\|A\| \times \|B\|}$$

Returns `1.0` for identical direction, `0.0` for orthogonal, `-1.0` for
opposite. Embeddings from the same model with semantically related text reliably
score `0.5–0.9`.

#### Step 6 — Prompt Injection (`SkillRegistry.buildPromptBlock()`)

```ts
skillBlock = skillRegistry.buildPromptBlock(matched);
```

Produces a Markdown block:

```markdown
## Loaded Skills (dynamically matched to this task)

### Skill: scouting_rubric (relevance: 0.82)

## Scout Report Format

When generating a scout report, always follow this structure:

### [Name] — [Position] | [School] | Class of [Year]

**Overall Grade: [X]/100** ...
```

This is **appended to the bottom of the system prompt**, directly before the LLM
call.

#### Step 7 — Graceful Degradation

The entire embedding + matching flow is wrapped in a `try/catch` inside
`execute()`. If the embedding API is unavailable, the agent logs a warning and
proceeds using its base system prompt. Each coordinator's prompt contains
fallback instructions:

> _"If a 'Loaded Skills' section appears below, follow it exactly. If no skills
> are loaded, [graceful fallback behavior]."_

---

### 6.5 Adding a New Skill

**1. Create the skill file:**

```ts
// backend/src/modules/agent/skills/[category]/my-new.skill.ts
import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class MyNewSkill extends BaseSkill {
  readonly name = 'my_new_skill'; // Unique snake_case identifier
  readonly description = // THIS IS WHAT GETS EMBEDDED
    'Concise description of what relevant intents look like. Include key domain words.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(_params?: Record<string, unknown>): string {
    return `## My Rules\n- Rule 1\n- Rule 2`; // Injected verbatim into prompt
  }
}
```

> **Critical:** The `description` field must read like a sentence that would
> appear near the user intents it should match. It directly determines semantic
> matching accuracy. Do NOT write it as a title — write it as a semantically
> rich paragraph.

**2. Export from the barrel:**

```ts
// backend/src/modules/agent/skills/index.ts
export { MyNewSkill } from './strategy/my-new.skill.js';
```

**3. Register in bootstrap:**

```ts
// backend/src/modules/agent/queue/bootstrap.ts
import { ..., MyNewSkill } from '../skills/index.js';

skillRegistry.register(new MyNewSkill());
```

**4. Declare in the coordinator:**

```ts
override getSkills(): readonly string[] {
  return ['my_new_skill'];
}
```

**5. Write tests** (see `__tests__/skill-system.spec.ts` for patterns).

---

### 6.6 Skill Reference Table

| Skill Name              | Coordinator            | Category      | What It Injects                                                              |
| ----------------------- | ---------------------- | ------------- | ---------------------------------------------------------------------------- |
| `scouting_rubric`       | PerformanceCoordinator | `evaluation`  | Scout report Markdown table, 1–100 grade scale, evaluation rules             |
| `outreach_copywriting`  | RecruitingCoordinator  | `copywriting` | Email subject formula, 150-word body rules, 4-step campaign sequencing       |
| `compliance_rulebook`   | ComplianceCoordinator  | `compliance`  | NCAA/NAIA/NJCAA calendar, GPA/SAT cutoffs, ✅/⚠️/🚫 verdict format           |
| `static_graphic_style`  | BrandMediaCoordinator  | `brand`       | ESPN/Bleacher Report aesthetic, typography, color palettes, layout rules     |
| `video_highlight_style` | BrandMediaCoordinator  | `brand`       | Highlight reel structure, pacing, broadcast overlay style, tech requirements |
| `social_caption_style`  | BrandMediaCoordinator  | `brand`       | Caption voice/tone, hashtag strategy, platform-specific rules (IG/X/TikTok)  |

---

### 6.7 Key Design Decisions & Rationale

| Decision                                         | Why                                                                                                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Embedding threshold `0.35`**                   | Empirically safe for 1536-dim space. High enough to avoid irrelevant matches; low enough to catch paraphrased intents. Tune per skill if needed.                 |
| **`import type { SkillRegistry }` in BaseAgent** | No circular dependency: `SkillRegistry → BaseSkill`, never `→ BaseAgent`. Type-only import is erased at compile time; runtime value flows through the parameter. |
| **`buildPromptBlock` is an instance method**     | Callers already hold the `skillRegistry` instance. Instance method eliminates a redundant class import at call sites.                                            |
| **Skill description is prose, not a title**      | The embedding model scores semantic similarity. Prose descriptions produce vectors that cluster near real user intent strings; short titles do not.              |
| **All 6 skills imported from barrel**            | Single import line in bootstrap. Adding a new skill never requires touching bootstrap's import block, just the `register()` call.                                |
| **Coordinator declares `getSkills()`**           | The coordinator — not the registry — decides scope. This prevents a `ComplianceRulebookSkill` from being loaded into a brand graphics task.                      |

---

## 7. Global Document Knowledge Base (MongoDB Atlas Vector Search)

While "Skills" (Section 6) provide hardcoded, categorical prompt guidelines, the
**Global Document Knowledge Base** provides dynamic, document-level factual
retrieval. This system allows Agent X to ground its responses in verified domain
data (NCAA/NAIA/NJCAA eligibility manuals, recruiting calendars, NIL
regulations, and platform guides).

### 7.1 Architecture Overview

The system uses a pure Retrieval-Augmented Generation (RAG) pipeline backed by
**MongoDB Atlas Vector Search** and **OpenAI `text-embedding-3-small`**
embeddings (1536 dimensions).

1. **Ingestion Pipeline (`KnowledgeIngestionService`)**:
   - Accepts raw text (up to 5MB) via an `adminGuard`-protected REST API.
   - Computes a SHA-256 content hash for deduplication.
   - Chunks text intelligently (paragraph-aware, 2048 chars max, 256 char
     overlap).
   - Generates embeddings in concurrent batches (limit 10).
   - Upserts into the `agentGlobalKnowledge` collection and increments the
     document `version` to seamlessly replace stale chunks.

2. **Retrieval Pipeline (`KnowledgeRetrievalService`)**:
   - Embeds the user's intent.
   - Executes a MongoDB `$vectorSearch` pipeline against the
     `agent_global_knowledge_vector_index`.
   - Filters results client-side by a strict cosine similarity score threshold
     (default `0.70`).
   - Builds a dense, token-optimized Markdown block citing the original
     `sourceRef` and `title`.

3. **Agent Integration (`GlobalKnowledgeSkill`)**:
   - The knowledge base is hooked into the agent pipeline exactly like a
     standard Skill.
   - `GlobalKnowledgeSkill` extends `BaseSkill` but overrides `matchIntent()` to
     _always_ return `true` with a similarity of `0.80`.
   - Instead of returning a hardcoded string in `getPromptContext()`,
     `BaseAgent.execute()` detects the skill and eagerly triggers
     `await m.skill.retrieveForIntent(intent)` before prompt assembly.

### 7.2 Mongoose Schema & Atlas Index

Documents are stored permanently (no TTL) in the `AgentGlobalKnowledge` model.

**Required Atlas Search Index (`agent_global_knowledge_vector_index`)**:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "category"
    },
    {
      "type": "filter",
      "path": "version"
    }
  ]
}
```

### 7.3 Admin REST API

Administrators manage the knowledge base via `/api/v1/knowledge/*` (all require
`adminGuard`):

- `POST /ingest` — Submit text/Markdown to be chunked, embedded, and stored.
- `GET /documents` — List all unique ingested documents.
- `GET /stats` — Retrieve category breakdowns and total chunk counts.
- `POST /query` — Test the semantic retrieval pipeline directly.
- `DELETE /source` — Purge a document by its original `sourceRef`.
- `DELETE /category` — Purge an entire category.

### 7.4 Types & Categories

Shared types live in `@nxt1/core` (`packages/core/src/ai/agent.types.ts`). The
`KnowledgeCategory` dictates the semantic grouping:

- `ncaa_rules`, `naia_rules`, `njcaa_rules`, `eligibility`
- `recruiting_calendar`, `transfer_portal`, `nil`, `compliance`
- `platform_guide`, `help_center`
- `sport_rules`, `training`, `nutrition`, `mental_performance`
