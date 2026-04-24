# Scraper Pipeline Cost Estimation

This document tracks the estimated costs for the Agent X scraper pipeline — the
system that ingests athlete/team profile data from external platforms (MaxPreps,
Hudl, 247Sports, Perfect Game, etc.) into NXT1.

## Architecture Cost Drivers

A single scrape run (one URL) flows through four cost-generating components:

1. **Firecrawl** — External web scraping API (JS rendering, bot bypass)
2. **AI Distiller** — Single LLM call to extract structured data from markdown
3. **Data Coordinator ReAct Loop** — Multi-iteration agent loop that reads
   distilled sections and writes to the database
4. **Infrastructure** — Firestore writes, Redis cooldown, Firebase Storage

### Pipeline Flow

```
URL → Firecrawl (Tier 2) → Markdown
                              ↓
                     AI Distiller (Claude Haiku 4.5)
                              ↓
                     Distilled Profile Index
                              ↓
              Data Coordinator Agent (Qwen 3.6+)
              ┌─ read_distilled_section (×N)
              ├─ write_core_identity
              ├─ write_season_stats
              ├─ write_recruiting_activity
              ├─ write_calendar_events
              ├─ write_athlete_videos
              └─ write_team_identity / write_team_roster
                              ↓
                     Firestore / MongoDB
```

### Key Architecture Details

- **Scrape routing**: Linked-account scrapes are routed **directly** to the
  `data_coordinator` agent (bypasses the PlannerAgent and Router — no extra
  routing LLM call).
- **Stats sub-pages**: MaxPreps and similar platforms render full game-by-game
  stats on a separate sub-page. The pipeline detects these links via
  `STATS_LINK_PATTERNS` and fetches them as additional Firecrawl calls,
  appending the content before AI distillation.
- **12-hour cooldown**: Each URL has a Redis-backed cooldown
  (`SCRAPE_COOLDOWN_MS = 12h`) to prevent redundant scrapes. Bypass with
  `force: true` for manual refreshes.
- **ReAct loop cap**: `MAX_ITERATIONS = 20` (typical runs complete in 8–15).

## Model Pricing (via OpenRouter, as of April 2026)

### AI Distiller

| Parameter         | Value                                             |
| ----------------- | ------------------------------------------------- |
| Model             | `anthropic/claude-haiku-4-5` (tier: `extraction`) |
| Input pricing     | $0.80 / 1M tokens                                 |
| Output pricing    | $4.00 / 1M tokens                                 |
| Max input chars   | 100,000 (~25k tokens)                             |
| Max output tokens | 8,192                                             |
| Temperature       | 0                                                 |
| JSON mode         | Yes                                               |

### Data Coordinator Agent Loop

| Parameter                | Value                                    |
| ------------------------ | ---------------------------------------- |
| Model                    | `qwen/qwen3.6-plus` (tier: `data_heavy`) |
| Input pricing            | $0.40 / 1M tokens                        |
| Output pricing           | $1.20 / 1M tokens                        |
| Max output per iteration | 8,192 tokens                             |
| Temperature              | 0                                        |
| Typical iterations       | 8–15                                     |

### Firecrawl (External API)

| Plan               | Credits/Month | Monthly Cost | Per-Credit (Amortized) |
| ------------------ | ------------- | ------------ | ---------------------- |
| Standard           | 100,000       | $83/mo       | ~$0.00083              |
| Growth             | 500,000       | $333/mo      | ~$0.00067              |
| Scale              | 1,000,000     | $599/mo      | ~$0.00060              |
| Overage (Standard) | 35,000 pack   | $47          | ~$0.00134              |

Each scrape = 1 credit per page. Stats sub-page = 1 additional credit.

## Per-URL Cost Breakdown

### AI Distiller (Claude Haiku 4.5)

| Page Size                 | Input Tokens | Output Tokens | Raw Cost |
| ------------------------- | ------------ | ------------- | -------- |
| Small (5k chars)          | ~1,500       | ~1,500        | $0.0072  |
| Typical (30k chars)       | ~8,000       | ~3,000        | $0.0184  |
| Large + stats (80k chars) | ~20,000      | ~6,000        | $0.0400  |

### Data Coordinator ReAct Loop (Qwen 3.6+)

Each iteration sends the full conversation history (system prompt + all prior
tool calls and observations). Context grows with each iteration:

| Iteration Range                | Approx Input Tokens | Approx Output Tokens |
| ------------------------------ | ------------------- | -------------------- |
| 1 (scrape_and_index)           | ~2,000              | ~200                 |
| 2–3 (read_distilled_section)   | ~3,000–5,000        | ~200–300             |
| 4–6 (more reads)               | ~6,000–10,000       | ~200–300             |
| 7–10 (write\_\* tools)         | ~10,000–15,000      | ~300–500             |
| 11–15 (final writes + summary) | ~15,000–20,000      | ~500–1,000           |

**Typical 12-iteration run totals:**

| Metric                        | Tokens           | Cost              |
| ----------------------------- | ---------------- | ----------------- |
| Total input (all iterations)  | ~100,000–150,000 | $0.040–$0.060     |
| Total output (all iterations) | ~3,000–5,000     | $0.004–$0.006     |
| **Agent loop total**          |                  | **$0.044–$0.066** |

### Total Per-URL Summary

| Component                | Low        | Typical    | High       |
| ------------------------ | ---------- | ---------- | ---------- |
| Firecrawl (1–2 pages)    | $0.0008    | $0.0012    | $0.0027    |
| AI Distiller (Haiku 4.5) | $0.0072    | $0.0184    | $0.0400    |
| Agent Loop (Qwen 3.6+)   | $0.0300    | $0.0500    | $0.0660    |
| Infrastructure           | $0.0001    | $0.0005    | $0.0010    |
| **Raw Provider Cost**    | **$0.038** | **$0.070** | **$0.110** |

### With Business Margin (User-Facing)

`AI_MARGIN_MULTIPLIER = 3.0` (defined in `cost-resolver.service.ts`):

|                              | Low       | Typical   | High      |
| ---------------------------- | --------- | --------- | --------- |
| **User-billed cost per URL** | **$0.11** | **$0.21** | **$0.33** |

## Batch Cost Projections

| Scenario                         | URLs   | Raw Cost    | User-Billed (3×) |
| -------------------------------- | ------ | ----------- | ---------------- |
| Onboarding (1–3 linked accounts) | 1–3    | $0.04–$0.33 | $0.12–$0.99      |
| Re-sync (all connected accounts) | 2–5    | $0.08–$0.55 | $0.24–$1.65      |
| 100 athletes (bulk enrichment)   | 100    | ~$7.00      | ~$21.00          |
| 1,000 athletes                   | 1,000  | ~$70        | ~$210            |
| 10,000 athletes                  | 10,000 | ~$700       | ~$2,100          |

## Monthly Cost Projections (Platform Scale)

Assuming each user has ~2.5 connected accounts on average, with one initial
scrape at onboarding + one re-sync per month:

| Active Users | Scrapes/Month | Raw AI Cost | Firecrawl Plan | Total Raw/Month |
| ------------ | ------------- | ----------- | -------------- | --------------- |
| 1,000        | ~5,000        | ~$350       | Standard ($83) | ~$433           |
| 5,000        | ~25,000       | ~$1,750     | Growth ($333)  | ~$2,083         |
| 10,000       | ~50,000       | ~$3,500     | Growth ($333)  | ~$3,833         |
| 50,000       | ~250,000      | ~$17,500    | Scale ($599)   | ~$18,099        |

## Cost Distribution (% of Total)

| Component                | % of Raw Cost |
| ------------------------ | ------------- |
| Agent Loop (Qwen 3.6+)   | ~71%          |
| AI Distiller (Haiku 4.5) | ~26%          |
| Firecrawl                | ~2%           |
| Infrastructure           | <1%           |

## Built-In Cost Controls

1. **12-hour cooldown** (`SCRAPE_COOLDOWN_MS`): Prevents re-scraping the same
   URL within 12 hours. Most impactful cost control.
2. **10-minute in-memory cache** (`CACHE_TTL_MS`): Avoids redundant distillation
   if the same URL is referenced within a single agent session.
3. **MAX_ITERATIONS = 20**: Hard cap on agent loop iterations.
4. **MAX_MARKDOWN_CHARS = 100,000**: Input truncation for the AI distiller.
5. **MAX_MARKDOWN_LENGTH = 50,000** (Firecrawl): Caps raw markdown from
   Firecrawl to avoid runaway content.

## Optimization Levers

| Lever                                            | Impact                     | Trade-off                            |
| ------------------------------------------------ | -------------------------- | ------------------------------------ |
| Reduce avg agent iterations (12 → 8)             | ~25% cost reduction        | May reduce data completeness         |
| Batch tool calls (multiple writes per iteration) | ~30–50% agent loop savings | Requires prompt engineering          |
| Switch agent to Gemini 2.0 Flash ($0.10/$0.40)   | ~70% agent loop savings    | Lower quality on complex extractions |
| Switch distiller to GPT-4o-mini ($0.15/$0.60)    | ~80% distiller savings     | Lower extraction accuracy            |
| Upgrade Firecrawl plan at scale                  | ~20–50% per-credit savings | Higher fixed monthly cost            |
| Increase cooldown to 24h                         | ~50% fewer re-scrapes      | Staler data                          |

## Source Code References

- Model catalogue: `backend/src/modules/agent/llm/llm.types.ts`
  (MODEL_CATALOGUE)
- Model pricing: `packages/core/src/ai/agent.constants.ts` (AGENT_MODEL_PRICING)
- Routing defaults: `packages/core/src/ai/agent.constants.ts`
  (MODEL_ROUTING_DEFAULTS)
- Cost resolver: `backend/src/modules/billing/cost-resolver.service.ts`
- AI Distiller:
  `backend/src/modules/agent/tools/scraping/distillers/universal-ai.distiller.ts`
- Data Coordinator: `backend/src/modules/agent/agents/data-coordinator.agent.ts`
- Scrape tool:
  `backend/src/modules/agent/tools/scraping/scrape-and-index-profile.tool.ts`
- Scraper service: `backend/src/modules/agent/tools/scraping/scraper.service.ts`
- Firecrawl service:
  `backend/src/modules/agent/tools/scraping/firecrawl.service.ts`
- Base agent (ReAct loop): `backend/src/modules/agent/agents/base.agent.ts`
- Scrape enqueue: `backend/src/services/agent-scrape.service.ts`
