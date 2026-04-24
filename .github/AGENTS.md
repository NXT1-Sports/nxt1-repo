# NXT1 Enterprise AI Team (Agent Directory)

This document defines the specialized agents available in the NXT1 Monorepo and
the required sequence for executing tasks. When standard Copilot (or Autopilot)
is asked to build, fix, or analyze, it should route tasks to these agents in
this defined order.

## The Standard Autopilot Workflow

When executing a full-stack feature or complex bug fix, explicitly follow this
sequence:

### 1. Architectural Planning

**Subagent To Call:** `@master-cto` _When to use:_ Always start here for new
features or major refactors. The CTO must validate the data models, API
boundaries, and strict architectural direction before any code is written.

### 2. Implementation

**Subagent To Call:** `@full-stack-engineer` _When to use:_ Writes the actual
code. Must be invoked after the CTO approves the design. Also used to implement
SEO or QA recommendations directly into the files.

### 3. Quality & Rules Enforcement

**Subagent To Call:** `@quality-control-specialist` _When to use:_ Invoked
strictly after implementation is complete to aggressively flag NXT1 2026 rule
violations (e.g., missing Angular Signals, monorepo boundary breaks, missing 4
pillars of observability).

### 4. Testing Infrastructure

**Subagent To Call:** `@qa-automation-engineer` _When to use:_ Invoked to write
Playwright E2E tests and Vitest unit tests (with proper mocks and `TEST_IDS`)
after the code is finalized and QC verified.

---

## Domain Specialists (On-Demand)

Invoke these agents instead of the standard pipeline when tackling tasks in
their specific domains:

- **`@ai-integrator`**: Invoke strictly for tasks inside
  `backend/src/modules/agent/`, OpenRouter configurations, or AI worker queue
  optimizations.
- **`@devops-engineer`**: Invoke for GitHub Actions (`.github/workflows/`),
  CI/CD pipelines, Turborepo caching (`turbo.json`), or App Hosting
  configurations.
- **`@seo-strategist`**: Invoke for tasks related to Server-Side Rendering
  (SSR), meta tags, structured data snippets, or marketing page optimizations.

## The Product & Marketing Workflow (GTM A-Team)

When executing campaigns, writing copy, or analyzing growth, follow this
sequential creative pipeline:

### 1. High-Level Vision & Strategy

**Subagent To Call:** `@cmo` _When to use:_ Always start here for new campaigns,
growth strategies, or establishing the voice ("The Ultimate AI Sports
Coordinators") for a new persona.

### 2. Product Translation & Launch Specs

**Subagent To Call:** `@product-marketer` _When to use:_ Takes the CMO's
strategy (or CTO's tech specs) and writes landing page frameworks, release
notes, and App Store descriptions.

### 3. Copy & Content Execution

**Subagent To Call:** `@content-creator` _When to use:_ Takes the product
marketing frameworks and executes the final words: blog posts, email drips,
social threads, and UI micro-copy.

### 4. Visibility & SEO

**Subagent To Call:** `@seo-strategist` _When to use:_ Reviews the content
creator's copy, defines the exact Meta/Title/OpenGraph tags, and hands the tech
specs to the `@full-stack-engineer` for HTML/Angular insertion.

### 5. Analytics & Viral Loops

**Subagent To Call:** `@growth-hacker` _When to use:_ Analyzes `APP_EVENTS` data
and designs A/B tests. Feeds proven growth insights back to the `@master-cto`.

---

## MCP Tools & External Integrations (All Agents)

> **Every agent has full access to all MCP (Model Context Protocol) tools.**
> Agents MUST proactively use these tools rather than making assumptions or
> asking the user to look things up manually.

| MCP Server         | Capability                                                  | Use For                                               |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------------------- |
| **GitHub**         | PRs, issues, repo data, code search                         | Code reviews, PR creation, issue tracking             |
| **GitKraken**      | Git operations, branch management, PR workflows             | Commits, diffs, blame, stash, worktrees               |
| **Notion**         | Query databases, create/update pages, search                | Campaign planning, content calendars, meeting notes   |
| **MongoDB**        | Query collections, aggregations, indexes, schema inspection | Data analysis, debugging, analytics queries           |
| **Stripe**         | Customers, subscriptions, invoices, products, prices        | Payment debugging, subscription management, billing   |
| **Sentry**         | Error tracking, issue search, event analysis                | Bug investigation, error patterns, crash debugging    |
| **Browser/Chrome** | Page navigation, screenshots, DOM interaction               | E2E debugging, visual verification, Lighthouse audits |
| **Web Fetch**      | Fetch and analyze web page content                          | Research, documentation lookup, competitive analysis  |
| **Upstash**        | Library documentation lookup                                | API reference, framework docs, package usage          |

**Rules:**

- ✅ Proactively query MongoDB to understand data shape before writing queries
- ✅ Use GitHub MCP to check existing PRs and issues for context
- ✅ Use Notion MCP to pull campaign briefs before writing copy
- ✅ Use Stripe MCP to verify subscription structure before billing code
- ✅ Use Sentry MCP to find related errors when debugging
- ❌ Never assume data structure without checking MongoDB
- ❌ Never ask user to "check Notion for the brief" — query it yourself
- ❌ Never guess at Stripe product IDs — look them up via MCP
