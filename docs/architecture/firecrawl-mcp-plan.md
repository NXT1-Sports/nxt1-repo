# Elite Architecture Plan: Firecrawl MCP Integration

## 1. Executive Summary

**Objective:** Integrate the Firecrawl MCP server into the NXT1 backend as a
Grade A+ enterprise utility. **Role in Ecosystem:** While the Apify MCP bridge
handles highly structured, known-platform scraping (e.g., X, Instagram, Hudl),
Firecrawl will serve as the "General Web Superpower" for Agent X—providing
dynamic search, ad-hoc domain mapping, and robust on-the-fly markdown/JSON
extraction from unknown sports and college websites.

## 2. Phase 1: Core Bridge Implementation

**Goal:** Establish a secure, high-performance transport layer inheriting from
our hardened baseline.

- **Service Class:** Implement `FirecrawlMcpBridgeService` extending
  `BaseMcpClientService`.
- **Transport Configuration:** Use Stdio transport spawning
  `npx -y firecrawl-mcp`.
- **Environment Configuration:** Inject the following properties cleanly through
  environment mapping to rely on Firecrawl's native rate-limit handling before
  tripping our macro circuit breaker:
  - `FIRECRAWL_API_KEY`
  - `FIRECRAWL_RETRY_MAX_ATTEMPTS=5`
  - `FIRECRAWL_RETRY_INITIAL_DELAY=1000`
  - `FIRECRAWL_RETRY_MAX_DELAY=10000`
  - `FIRECRAWL_RETRY_BACKOFF_FACTOR=2`

## 3. Phase 2: Read-Through Cache Strategy

**Goal:** Aggressively optimize Firecrawl credit consumption and decrease Agent
X latency.

- **Target Operations:** Apply caching to `firecrawl_map`, `firecrawl_search`,
  and `firecrawl_scrape`.
- **Cache Wrapper:** Use the existing `@nxt1/cache` integration
  (`this.withCache`).
- **Key Generation:** Construct deterministic SHA-256 hashes of the operation
  name and argument payload.
- **TTL Configuration:** Use `CACHE_CONFIG.LONG_TTL` (1-24 hours depending on
  endpoint volatility) since roster and scouting news do not change
  second-to-second.

## 4. Phase 3: Zero-Trust Zod Validation

**Goal:** Prevent LLM hallucination fallout and ensure deterministic downstream
data processing.

- **Input Schemas:** Validate inbound AI tool requests to ensure proper
  formulation (e.g., preventing `batch_scrape` requests with >50 URLs that would
  overflow tokens).
- **Output Schemas:** Parse MCP execution results.
  - `ScrapeResponseSchema`: Ensure `content` or structured JSON is present.
  - `SearchResponseSchema`: Validate array of `title`, `url`, `snippet`.
  - `MapResponseSchema`: Validate array of returned URLs.
- **Extract Payload:** Use the `extractPayload` paradigm to strip excess MCP
  metadata before returning data to the AI context window.

## 5. Phase 4: Agent X Tool Exposure

**Goal:** Equip Agent X with intelligent routing between platforms.

- **Tool Wrappers:** Create explicit LLM tool wrappers (e.g.,
  `call-firecrawl-scrape.tool.ts`, `call-firecrawl-search.tool.ts`).
- **Semantic Routing Rules:** Provide strict system prompt instructions to
  OpenRouter/Agent X:
  - _Rule 1:_ If searching for breaking scouting news -> Use `firecrawl_search`.
  - _Rule 2:_ If extracting roster from an unknown college site -> Use
    `firecrawl_map` then `firecrawl_batch_scrape`.
  - _Rule 3:_ If requesting social media/video metrics -> Defer to Apify.

## 6. Phase 5: Observability & Diagnostics

**Goal:** Maintain 100% visibility into performance and failure rates.

- **APM Tracing:** Implement `PerformanceService` spans around all MCP calls
  with specific trace names (`backend_mcp_firecrawl_scrape`,
  `backend_mcp_firecrawl_search`).
- **Structured Logging:** Hook `NxtLoggingService` to capture request sizing,
  cache hit/miss ratios, and circuit breaker trips.
- **HTTP Error Translation:** Differentiate between `400 Client Errors`
  (malformed URLs) and `429/500 Server Errors` (Firecrawl degradation) to
  prevent false circuit-breaker tripping.

## 7. Phase 6: QA Automation

**Goal:** Enforce 2026 testing standards.

- **Unit Tests (`Vitest`):** Mock the `BaseMcpClientService` transport layer to
  assert cache hit logic, validation failures, and configuration injection.
- **Type Safety:** Compile under strict TS (`tsc --noEmit`) with 0 warnings.

## Execution Protocol

Following Master CTO guidelines:

1. Generate the Zod schemas (`firecrawl-schemas.ts`).
2. Build the bridge service (`firecrawl-mcp-bridge.service.ts`).
3. Construct the AI Tool definitions (`call-firecrawl-*.tool.ts`).
4. Validate with Vitest.
5. Deploy.
