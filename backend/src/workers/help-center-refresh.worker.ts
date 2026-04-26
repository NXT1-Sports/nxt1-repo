/**
 * @fileoverview Help Center Refresh Service — Agent-Driven Content Generation
 * @module @nxt1/backend/modules/help-center
 *
 * Runs every Sunday at 2 AM UTC via Cloud Scheduler.
 *
 * Pipeline:
 *   1. Pull 5 signal sources:
 *      a. agentGlobalKnowledge (vector read) — what the platform already knows
 *      b. agentMemories (MongoDB) — what users ask Agent X that isn't answered
 *      c. analyticsRollups (7d) — behavioral activity spikes by domain
 *      d. analyticsEvents (agent_task_failed 7d) — what breaks → troubleshooting
 *      e. Web search (Tavily) — current NCAA/NIL/sports intel for grounding
 *
 *   2. Two-pass LLM pipeline:
 *      Pass 1 — Synthesize topic brief (what are the 10-15 content gaps this week?)
 *      Semantic dedup gate — drop topics semantically covered by fresh articles
 *      Pass 2 — Write full articles + FAQs for topics that passed the gate
 *
 *   3. Persist:
 *      - Upsert HelpArticle documents (slug dedup, targetUsers: ['all'])
 *      - Upsert HelpFaq documents (question dedup, targetUsers: ['all'])
 *      - Ingest all upserted content into agentGlobalKnowledge (vector RAG)
 *      - Bust all help center cache keys
 */

import { HELP_CATEGORIES, HELP_CACHE_KEYS } from '@nxt1/core';
import type { HelpCategoryId } from '@nxt1/core';
import { HelpArticleModel } from '../models/help-center/help-article.model.js';
import { HelpFaqModel } from '../models/help-center/help-faq.model.js';
import { AgentMemoryModel } from '../modules/agent/memory/vector.service.js';
import { AnalyticsRollupModel } from '../models/analytics/analytics-rollup.model.js';
import { AnalyticsEventModel } from '../models/analytics/analytics-event.model.js';
import type { OpenRouterService } from '../modules/agent/llm/openrouter.service.js';
import { KnowledgeIngestionService } from '../modules/agent/memory/knowledge-ingestion.service.js';
import { KnowledgeRetrievalService } from '../modules/agent/memory/knowledge-retrieval.service.js';
import { WebSearchTool } from '../modules/agent/tools/integrations/web/web-search.tool.js';
import { getCacheService } from '../services/core/cache.service.js';
import { logger } from '../utils/logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_CATEGORY_IDS = HELP_CATEGORIES.map((c) => c.id) as HelpCategoryId[];

/** Minimum confidence score (0–100) for an LLM-generated content piece. */
const MIN_CONFIDENCE = 70;

/** Freshness window: articles refreshed within this many days are skipped unless there's a critical signal. */
const FRESHNESS_WINDOW_DAYS = 14;

/** Topics recently covered and scored above this cosine similarity are considered duplicates. */
const DEDUP_SCORE_THRESHOLD = 0.88;

/** Minimum articles to maintain per category in the corpus. */
const MIN_ARTICLES_PER_CATEGORY = 2;

/** Maximum new articles to write per run. */
const MAX_ARTICLES_PER_RUN = 6;

/** FAQs to generate per run. */

// ─── Platform Facts ───────────────────────────────────────────────────────────

/**
 * Authoritative NXT1 platform facts injected into every LLM prompt.
 * Prevents hallucinations about platform identity, billing model, and terminology.
 */
const PLATFORM_FACTS = `
## NXT1 Platform Reference — Authoritative Facts (do not contradict or invent alternatives)

**Platform identity:** NXT1 is a sports intelligence platform \u2014 tagline: "The Future of Sports Intelligence." It is NOT primarily a recruiting platform
or NCAA compliance tool. Core value: AI-powered intelligence and automation for athletes, coaches,
and sports programs.

**The three user roles — use these exact names:**
- Athlete: student or competitive athlete building their sports profile and using AI intelligence
- Coach: high school, club, travel, or JUCO coach managing their team — NOT a college recruiter
- Director: program director or athletic administrator (high school AD, club program director, travel/JUCO org admin) with multi-team program oversight — NOT a college recruiter

**Agent X — the AI core:**
- Always called "Agent X" — never "AI assistant," "chatbot," or "virtual assistant"
- Invoked via the FAB button (bottom right of screen), direct navigation, or quick tasks
- Executes background operations (not "jobs") — users are notified on completion
- Delivers daily briefings (each morning) and weekly playbooks (every Monday)
- Quick tasks are role-specific pre-built commands shown on the Agent X home screen
- The Agent X home is called the "command center" — not "dashboard"

**Billing:** Usage-based, pre-paid wallet model. There are NO subscription tiers, NO Free/Premium/Elite plans.
Users load a wallet balance and pay per operation consumed. Individuals have a personal wallet. Organizations
have an org wallet shared across the program — org admins can set per-team monthly budget sub-limits.
Members can optionally override to their personal wallet via the "use personal billing" toggle.
Auto top-up (configurable threshold + reload amount) is available for both individual and org wallets.

**Teams:** Created by Coaches or Directors. Athletes join via a 6-character team code.
Multiple team memberships are allowed. Coach = day-to-day management.
Director = program-level multi-team oversight.

**Payment methods:** Stripe (credit/debit card), PayPal, Apple In-App Purchase (iOS), Google Play Billing (Android).

**Navigation sections:** Agent X (command center), Athlete Profile, Team Profile, Activity (notifications), Add Sport/Team, Invite, Billing & Usage, Settings, Help Center.
` as const;

/** FAQs to generate per run. */
const MAX_FAQS_PER_RUN = 10;

const CURRENT_YEAR = new Date().getFullYear();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArticleProposal {
  categoryId: HelpCategoryId;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  tags: string[];
  readingTimeMinutes?: number;
  confidence: number;
}

interface FaqProposal {
  categoryId: HelpCategoryId;
  question: string;
  answer: string;
  tags: string[];
  confidence: number;
}

interface TopicBrief {
  articleTopics: Array<{
    categoryId: HelpCategoryId;
    title: string;
    rationale: string;
    urgency: 'gap' | 'refresh' | 'critical';
  }>;
  faqTopics: Array<{
    categoryId: HelpCategoryId;
    question: string;
    rationale: string;
  }>;
}

export interface HelpCenterRefreshResult {
  articlesCreated: number;
  articlesUpdated: number;
  faqsCreated: number;
  faqsUpdated: number;
  categoriesRefreshed: string[];
  webSearchUsed: boolean;
  durationMs: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class HelpCenterRefreshWorker {
  private readonly ingestion: KnowledgeIngestionService;
  private readonly retrieval: KnowledgeRetrievalService;
  private readonly webSearch: WebSearchTool;

  constructor(private readonly llm: OpenRouterService) {
    this.ingestion = new KnowledgeIngestionService(llm);
    this.retrieval = new KnowledgeRetrievalService(llm);
    this.webSearch = new WebSearchTool();
  }

  async run(): Promise<HelpCenterRefreshResult> {
    const startTime = Date.now();
    logger.info('[HelpCenterRefresh] Starting weekly refresh run');

    // ── Step 1: Gather all 5 signal sources in parallel ──────────────────
    const [
      globalKnowledgeBlock,
      recentMemories,
      analyticsRollups,
      agentFailures,
      existingArticles,
      webSearchResults,
    ] = await Promise.all([
      this.pullGlobalKnowledge(),
      this.pullAgentMemories(),
      this.pullAnalyticsRollups(),
      this.pullAgentFailures(),
      this.pullExistingArticles(),
      this.pullWebSearch(),
    ]);

    const webSearchUsed = webSearchResults.length > 0;

    // ── Step 2: Pass 1 — Synthesize topic brief ───────────────────────────
    const topicBrief = await this.synthesizeTopicBrief({
      globalKnowledgeBlock,
      recentMemories,
      analyticsRollups,
      agentFailures,
      existingArticles,
      webSearchResults,
    });

    logger.info('[HelpCenterRefresh] Topic brief synthesized', {
      articleTopics: topicBrief.articleTopics.length,
      faqTopics: topicBrief.faqTopics.length,
    });

    // ── Step 3: Semantic dedup gate — run in parallel ─────────────────────
    const now = Date.now();
    const freshnessThresholdMs = FRESHNESS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    const deduplicationChecks = await Promise.allSettled(
      topicBrief.articleTopics.map(async (topic) => {
        const similar = await this.retrieval.retrieve(topic.title, {
          categories: ['help_center'],
          topK: 1,
          scoreThreshold: DEDUP_SCORE_THRESHOLD,
        });

        if (similar.length === 0) return { topic, pass: true };

        // Check if the matching article was recently refreshed
        const matchSourceRef = similar[0].entry.sourceRef;
        const matchSlug = matchSourceRef ? matchSourceRef.split('/').pop() : undefined;
        const existingMatch = matchSlug ? existingArticles.find((a) => a.slug === matchSlug) : null;

        const isRecentlyRefreshed =
          existingMatch?.lastAgentRefresh &&
          now - new Date(existingMatch.lastAgentRefresh).getTime() < freshnessThresholdMs;

        // Drop if recently refreshed and not a critical signal
        const pass = !isRecentlyRefreshed || topic.urgency === 'critical';
        return { topic, pass };
      })
    );

    const approvedTopics = deduplicationChecks
      .filter((r) => r.status === 'fulfilled' && r.value.pass)
      .map(
        (r) =>
          (r as PromiseFulfilledResult<{ topic: TopicBrief['articleTopics'][0]; pass: boolean }>)
            .value.topic
      )
      .slice(0, MAX_ARTICLES_PER_RUN);

    logger.info('[HelpCenterRefresh] Dedup gate complete', {
      proposed: topicBrief.articleTopics.length,
      approved: approvedTopics.length,
    });

    // ── Step 4: Pass 2 — Write articles and FAQs ─────────────────────────
    const { articles: articleProposals, faqs: faqProposals } = await this.writeContent(
      approvedTopics,
      topicBrief.faqTopics,
      webSearchResults,
      globalKnowledgeBlock
    );

    const filteredArticles = articleProposals.filter((a) => a.confidence >= MIN_CONFIDENCE);
    const filteredFaqs = faqProposals.filter((f) => f.confidence >= MIN_CONFIDENCE);

    logger.info('[HelpCenterRefresh] Content written', {
      articles: filteredArticles.length,
      faqs: filteredFaqs.length,
    });

    // ── Step 5: Persist articles ──────────────────────────────────────────
    let articlesCreated = 0;
    let articlesUpdated = 0;
    const refreshedCategories = new Set<string>();
    const now2 = new Date();

    for (const article of filteredArticles) {
      try {
        const existing = await HelpArticleModel.findOne({ slug: article.slug }).lean();
        const existingDoc = existing as Record<string, unknown> | null;
        // Calculate reading time from actual content (200 wpm average, min 1 min)
        const wordCount = article.content.trim().split(/\s+/).length;
        const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200));
        await HelpArticleModel.findOneAndUpdate(
          { slug: article.slug },
          {
            $set: {
              title: article.title,
              excerpt: article.excerpt,
              content: article.content,
              category: article.categoryId,
              tags: article.tags,
              readingTimeMinutes: readingTimeMinutes,
              targetUsers: ['all'],
              isPublished: true,
              isFeatured: false,
              type: 'article',
              publishedAt: existingDoc
                ? ((existingDoc['publishedAt'] as string) ?? now2.toISOString())
                : now2.toISOString(),
              updatedAt: now2.toISOString(),
              lastAgentRefresh: now2,
            },
          },
          { upsert: true, returnDocument: 'after' }
        );

        if (existing) {
          articlesUpdated++;
        } else {
          articlesCreated++;
        }
        refreshedCategories.add(article.categoryId);

        // Ingest into global knowledge for vector RAG
        await this.ingestion.ingest({
          content: `# ${article.title}\n\n${article.excerpt}\n\n${article.content}`,
          category: 'help_center',
          source: 'help_center',
          title: article.title,
          sourceRef: `help-center/article/${article.slug}`,
          metadata: { category: article.categoryId, tags: article.tags },
        });
      } catch (err) {
        logger.error('[HelpCenterRefresh] Failed to upsert article', {
          slug: article.slug,
          error: String(err),
        });
      }
    }

    // ── Step 6: Persist FAQs ──────────────────────────────────────────────
    let faqsCreated = 0;
    let faqsUpdated = 0;

    for (const faq of filteredFaqs) {
      try {
        const existing = await HelpFaqModel.findOne({ question: faq.question }).lean();
        const existingFaqDoc = existing as Record<string, unknown> | null;
        await HelpFaqModel.findOneAndUpdate(
          { question: faq.question },
          {
            $set: {
              question: faq.question,
              answer: faq.answer,
              category: faq.categoryId,
              tags: faq.tags,
              targetUsers: ['all'],
              isPublished: true,
              lastAgentRefresh: now2,
              order: 0,
              helpfulCount: existingFaqDoc ? ((existingFaqDoc['helpfulCount'] as number) ?? 0) : 0,
            },
          },
          { upsert: true, returnDocument: 'after' }
        );

        if (existing) {
          faqsUpdated++;
        } else {
          faqsCreated++;
        }
        refreshedCategories.add(faq.categoryId);

        // Ingest FAQ into global knowledge
        await this.ingestion.ingest({
          content: `Q: ${faq.question}\n\nA: ${faq.answer}`,
          category: 'help_center',
          source: 'help_center',
          title: `FAQ: ${faq.question}`,
          sourceRef: `help-center/faq/${faq.question.toLowerCase().replace(/\s+/g, '-').slice(0, 80)}`,
        });
      } catch (err) {
        logger.error('[HelpCenterRefresh] Failed to upsert FAQ', {
          question: faq.question.slice(0, 60),
          error: String(err),
        });
      }
    }

    // ── Step 7: Bust cache ────────────────────────────────────────────────
    await this.bustCache(Array.from(refreshedCategories));

    const result: HelpCenterRefreshResult = {
      articlesCreated,
      articlesUpdated,
      faqsCreated,
      faqsUpdated,
      categoriesRefreshed: Array.from(refreshedCategories),
      webSearchUsed,
      durationMs: Date.now() - startTime,
    };

    logger.info('[HelpCenterRefresh] Run complete', result as unknown as Record<string, unknown>);
    return result;
  }

  // ─── Private Signal Pullers ───────────────────────────────────────────────

  private async pullGlobalKnowledge(): Promise<string> {
    try {
      const results = await this.retrieval.retrieve(
        'NXT1 sports intelligence platform guide agent x teams account billing troubleshooting',
        { categories: ['help_center', 'platform_guide'], topK: 15 }
      );
      return results.length > 0
        ? this.retrieval.buildPromptBlock(results)
        : '(No existing help center knowledge found in global knowledge base.)';
    } catch (err) {
      logger.warn('[HelpCenterRefresh] Global knowledge pull failed', { error: String(err) });
      return '(Global knowledge unavailable.)';
    }
  }

  private async pullAgentMemories(): Promise<string> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const memories = await AgentMemoryModel.find({
        createdAt: { $gte: sevenDaysAgo.toISOString() },
      })
        .sort({ createdAt: -1 })
        .limit(500)
        .select('content tags createdAt')
        .lean();

      if (memories.length === 0) return '(No recent agent memories found.)';

      const summary = memories
        .map((m) => {
          const content = typeof m.content === 'string' ? m.content : String(m.content ?? '');
          return content.slice(0, 200);
        })
        .join('\n---\n')
        .slice(0, 8000);

      return `## Recent Agent Memory Signals (${memories.length} memories, last 7 days)\n\n${summary}`;
    } catch (err) {
      logger.warn('[HelpCenterRefresh] Agent memory pull failed', { error: String(err) });
      return '(Agent memories unavailable.)';
    }
  }

  private async pullAnalyticsRollups(): Promise<string> {
    try {
      const rollups = await AnalyticsRollupModel.find({ timeframe: '7d' })
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean();

      if (rollups.length === 0) return '(No analytics rollups available.)';

      const summary = rollups
        .map((r) => {
          const doc = r as unknown as Record<string, unknown>;
          const domain = doc['domain'] ?? 'unknown';
          const counts = doc['countsByEventType'] ?? {};
          const topEvents = Object.entries(counts as Record<string, number>)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          return `Domain: ${domain} | Events: ${topEvents}`;
        })
        .join('\n');

      return `## Analytics Activity Rollups (last 7 days)\n\n${summary}`;
    } catch (err) {
      logger.warn('[HelpCenterRefresh] Analytics rollup pull failed', { error: String(err) });
      return '(Analytics rollups unavailable.)';
    }
  }

  private async pullAgentFailures(): Promise<string> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const failures = await AnalyticsEventModel.find({
        domain: 'system',
        eventType: 'agent_task_failed',
        occurredAt: { $gte: sevenDaysAgo },
      })
        .sort({ occurredAt: -1 })
        .limit(50)
        .lean();

      if (failures.length === 0) return '(No agent task failures in last 7 days.)';

      const summary = failures
        .map((f) => {
          const doc = f as unknown as Record<string, unknown>;
          const meta = (doc['metadata'] ?? {}) as Record<string, unknown>;
          return `Task: ${meta['taskType'] ?? 'unknown'} | Error: ${String(meta['error'] ?? 'unknown').slice(0, 100)}`;
        })
        .join('\n');

      return `## Agent Task Failures (last 7 days — ${failures.length} failures)\n\n${summary}`;
    } catch (err) {
      logger.warn('[HelpCenterRefresh] Agent failure pull failed', { error: String(err) });
      return '(Agent failures unavailable.)';
    }
  }

  private async pullExistingArticles(): Promise<
    Array<{
      slug: string;
      title: string;
      category: string;
      lastAgentRefresh: Date | null;
      updatedAt: string;
    }>
  > {
    try {
      return (await HelpArticleModel.find(
        {},
        {
          slug: 1,
          title: 1,
          category: 1,
          lastAgentRefresh: 1,
          updatedAt: 1,
        }
      ).lean()) as unknown as Array<{
        slug: string;
        title: string;
        category: string;
        lastAgentRefresh: Date | null;
        updatedAt: string;
      }>;
    } catch (err) {
      logger.warn('[HelpCenterRefresh] Existing articles pull failed', { error: String(err) });
      return [];
    }
  }

  private async pullWebSearch(): Promise<string> {
    const queries = [
      `NCAA athlete eligibility NIL rules ${CURRENT_YEAR}`,
      `sports recruiting tips high school athletes ${CURRENT_YEAR}`,
      `sports performance analytics AI training insights`,
    ];

    const results: string[] = [];

    for (const query of queries) {
      try {
        const result = await this.webSearch.execute({ query, maxResults: 3, includeAnswer: true });
        if (result.success && result.data) {
          const resultText =
            typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
          results.push(`### Web Search: "${query}"\n\n${resultText.slice(0, 1500)}`);
        }
      } catch (err) {
        logger.warn('[HelpCenterRefresh] Web search failed for query', {
          query,
          error: String(err),
        });
      }
    }

    if (results.length === 0) return '';
    return `## Web Search Results (current sports & NCAA intel)\n\n${results.join('\n\n')}`;
  }

  // ─── LLM Pass 1: Synthesize Topic Brief ──────────────────────────────────

  private async synthesizeTopicBrief(signals: {
    globalKnowledgeBlock: string;
    recentMemories: string;
    analyticsRollups: string;
    agentFailures: string;
    existingArticles: Array<{
      slug: string;
      title: string;
      category: string;
      lastAgentRefresh: Date | null;
      updatedAt: string;
    }>;
    webSearchResults: string;
  }): Promise<TopicBrief> {
    const now = Date.now();
    const freshnessWindowMs = FRESHNESS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    const categoryCoverage = this.buildCategoryCoverageMap(signals.existingArticles);
    const existingArticleList = signals.existingArticles
      .map((a) => {
        const ageMs = now - new Date(a.updatedAt).getTime();
        const ageDays = Math.floor(ageMs / 86400000);
        const freshness =
          a.lastAgentRefresh && now - new Date(a.lastAgentRefresh).getTime() < freshnessWindowMs
            ? `RECENTLY REFRESHED (${ageDays}d ago) — skip unless critical`
            : ageDays < 60
              ? `eligible for refresh (${ageDays}d old)`
              : `STALE — prioritize refresh (${ageDays}d old)`;
        return `- [${a.category}] "${a.title}" (slug: ${a.slug}) — ${freshness}`;
      })
      .join('\n');

    const categoryGaps = VALID_CATEGORY_IDS.map((id) => {
      const count = categoryCoverage.get(id) ?? 0;
      const label = HELP_CATEGORIES.find((c) => c.id === id)?.label ?? id;
      const status =
        count < MIN_ARTICLES_PER_CATEGORY
          ? `⚠️ NEEDS CONTENT (${count} articles)`
          : `${count} articles`;
      return `- ${label} (${id}): ${status}`;
    }).join('\n');

    const prompt = `You are the content strategist for NXT1, an AI-powered sports intelligence platform.
Your task is to identify the most valuable help center content to create this week.

${PLATFORM_FACTS}

## Available Content Categories
${VALID_CATEGORY_IDS.map((id) => {
  const cat = HELP_CATEGORIES.find((c) => c.id === id);
  return `- ${id}: ${cat?.label} — ${cat?.description}`;
}).join('\n')}

## Current Category Coverage
${categoryGaps}

## Existing Articles (with freshness status)
${existingArticleList || '(No articles yet — create foundational content for all categories)'}

## Signal Sources

${signals.globalKnowledgeBlock}

${signals.recentMemories}

${signals.analyticsRollups}

${signals.agentFailures}

${signals.webSearchResults}

## Your Task
Based on all signals above, identify the top content needs. Prioritize:
1. Categories below minimum coverage (${MIN_ARTICLES_PER_CATEGORY} articles each)
2. Topics users ask Agent X that aren't covered in existing help content
3. Domains with high activity spikes (from analytics rollups)
4. Agent failures that should have troubleshooting articles
5. Stale articles that need refreshing with new information

RULES:
- DO NOT propose articles for "RECENTLY REFRESHED" items unless the urgency is "critical"
- Ensure balanced distribution across all 5 categories
- Maximum ${MAX_ARTICLES_PER_RUN} article topics
- Maximum ${MAX_FAQS_PER_RUN} FAQ topics (short Q&A pairs from user questions)

Respond with ONLY valid JSON matching this structure:
{
  "articleTopics": [
    {
      "categoryId": "getting-started" | "agent-x" | "teams" | "account" | "troubleshooting",
      "title": "Article title",
      "rationale": "Why this is needed (1-2 sentences)",
      "urgency": "gap" | "refresh" | "critical"
    }
  ],
  "faqTopics": [
    {
      "categoryId": "getting-started" | "agent-x" | "teams" | "account" | "troubleshooting",
      "question": "Exact question a user would ask",
      "rationale": "Why this FAQ is needed"
    }
  ]
}`;

    const raw = await this.llm.complete([{ role: 'user', content: prompt }], {
      tier: 'evaluator',
      temperature: 0.3,
      maxTokens: 2000,
    });

    return this.parseJson<TopicBrief>(raw.content ?? '', { articleTopics: [], faqTopics: [] });
  }

  // ─── LLM Pass 2: Write Full Content ──────────────────────────────────────

  private async writeContent(
    approvedTopics: TopicBrief['articleTopics'],
    faqTopics: TopicBrief['faqTopics'],
    webSearchResults: string,
    globalKnowledgeBlock: string
  ): Promise<{ articles: ArticleProposal[]; faqs: FaqProposal[] }> {
    if (approvedTopics.length === 0 && faqTopics.length === 0) {
      return { articles: [], faqs: [] };
    }

    const articleRequests = approvedTopics
      .map(
        (t, i) =>
          `Article ${i + 1}: [${t.categoryId}] "${t.title}" (urgency: ${t.urgency})\nRationale: ${t.rationale}`
      )
      .join('\n\n');

    const faqRequests = faqTopics
      .slice(0, MAX_FAQS_PER_RUN)
      .map((f, i) => `FAQ ${i + 1}: [${f.categoryId}] "${f.question}"`)
      .join('\n');

    const prompt = `You are the senior content strategist for NXT1, an AI-powered sports intelligence platform.
Write elite, SEO-optimized help center articles that feel like they came from a world-class product team.

${PLATFORM_FACTS}

Tone: Confident, direct, expert. Like having a sports industry insider walk you through exactly what to do.
NEVER write marketing fluff. Every sentence must be actionable or informative.

## Reference Knowledge
${globalKnowledgeBlock}

${webSearchResults ? `## Current Sports Intel (ground articles in real-world accuracy)\n${webSearchResults}` : ''}

## Mandatory Article Structure (follow for EVERY article)
Each article markdown MUST use this exact structure:

**Bold opening sentence** — One punchy sentence that states exactly what this article covers.

2–3 short intro paragraphs (no heading). Context, why it matters, who it's for. No padding.

## Section Title (2–4 H2 sections total)
1–2 short paragraphs OR a tight bullet list (3–6 items). Max 3 sentences per paragraph.
Bullets start with a verb. Max 15 words each.

> **Pro tip:** One key insight or shortcut inside a blockquote.

Closing paragraph (1–2 sentences): what to do next or what to explore.

Content rules:
- Use ## for H2 sections ONLY. Never use # (the UI renders the title above the content).
- Bold (**text**) critical terms only — never entire sentences.
- Target 400–550 words. Quality over length. No padding.
- NO "## Introduction" or "## Conclusion" as headings — jump straight into value.
- NO filler phrases like "In this article we will..." or "We hope this helped."
- Every sentence must give the user information they can act on immediately.

${articleRequests}

## FAQs to Write
Each FAQ answer: 2–3 sentences max. Lead with the direct answer, then explain why.

${faqRequests}

Respond with ONLY valid JSON matching this structure exactly:
{
  "articles": [
    {
      "categoryId": "agent-x",
      "title": "Full article title",
      "slug": "url-safe-slug-max-60-chars",
      "content": "Full markdown content here...",
      "excerpt": "1-2 sentence excerpt",
      "tags": ["tag1", "tag2", "tag3"],
      "confidence": 85
    }
  ],
  "faqs": [
    {
      "categoryId": "getting-started",
      "question": "Exact question",
      "answer": "Direct 2-4 sentence answer",
      "tags": ["tag1", "tag2"],
      "confidence": 90
    }
  ]
}`;

    const raw = await this.llm.complete([{ role: 'user', content: prompt }], {
      tier: 'chat',
      temperature: 0.5,
      maxTokens: 8000,
    });

    const parsed = this.parseJson<{ articles: ArticleProposal[]; faqs: FaqProposal[] }>(
      raw.content ?? '',
      {
        articles: [],
        faqs: [],
      }
    );

    // Validate category IDs
    parsed.articles = parsed.articles.filter((a) => VALID_CATEGORY_IDS.includes(a.categoryId));
    parsed.faqs = parsed.faqs.filter((f) => VALID_CATEGORY_IDS.includes(f.categoryId));

    return parsed;
  }

  // ─── Cache Busting ────────────────────────────────────────────────────────

  private async bustCache(categories: string[]): Promise<void> {
    const cache = getCacheService();

    const keysToDelete = [
      HELP_CACHE_KEYS.HOME,
      HELP_CACHE_KEYS.FAQS,
      ...categories.map((id) => `${HELP_CACHE_KEYS.CATEGORY}${id}`),
    ];

    await Promise.allSettled(keysToDelete.map((key) => cache.del(key)));
    logger.info('[HelpCenterRefresh] Cache busted', { keys: keysToDelete });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildCategoryCoverageMap(
    articles: Array<{ category: string }>
  ): Map<HelpCategoryId, number> {
    const map = new Map<HelpCategoryId, number>(VALID_CATEGORY_IDS.map((id) => [id, 0]));
    for (const a of articles) {
      const id = a.category as HelpCategoryId;
      if (map.has(id)) {
        map.set(id, (map.get(id) ?? 0) + 1);
      }
    }
    return map;
  }

  private parseJson<T>(raw: string, fallback: T): T {
    try {
      // Extract JSON block from markdown code fences if present
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : raw;
      return JSON.parse(jsonStr.trim()) as T;
    } catch (err) {
      logger.error('[HelpCenterRefresh] Failed to parse LLM JSON response', {
        error: String(err),
        rawPreview: raw.slice(0, 200),
      });
      return fallback;
    }
  }
}
