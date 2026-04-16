/**
 * @fileoverview Agent X Routes — Aggregator
 * @module @nxt1/backend/routes/agent-x
 *
 * REST API for Agent X — the AI agent command center.
 *
 * Architecture (2026 Unified Streaming):
 *   All agent interactions flow through a single POST /chat SSE stream.
 *   When the LLM decides a request requires heavy processing, it invokes
 *   `enqueue_heavy_task` which queues a BullMQ job. Instead of closing the
 *   SSE connection, the Express server subscribes to a Redis PubSub channel
 *   and proxies the worker's streaming output verbatim to the client.
 *
 *   BullMQ Worker → Redis PubSub → Express SSE Proxy → Frontend
 *
 * Route Files:
 *   chat.routes.ts       → /cancel/:id, /resume-job/:operationId, /approvals/:id/resolve,
 *                           /upload, /enqueue, /chat (SSE stream)
 *   dashboard.routes.ts  → /history, /operations-log, /dashboard, /goals
 *   playbook.routes.ts   → /playbook/generate, /playbook/item/:id/status, /briefing/generate
 *   admin.routes.ts      → /pause, /resume, /queue-stats  (admin only)
 *   cron.routes.ts       → /cron/daily-briefings, /cron/summarize-threads, /cron/cleanup-thread-media
 *   threads.routes.ts    → /threads, /threads/:id, /threads/:id/messages, PATCH, archive
 *   firecrawl.routes.ts  → /firecrawl/session/*, /firecrawl/accounts
 *   live-view.routes.ts  → /live-view/*, /health
 *
 * Shared state (singletons, helpers) lives in shared.ts.
 */

import { Router } from 'express';

import chatRouter from './chat.routes.js';
import dashboardRouter from './dashboard.routes.js';
import playbookRouter from './playbook.routes.js';
import adminRouter from './admin.routes.js';
import cronRouter from './cron.routes.js';
import threadsRouter from './threads.routes.js';
import firecrawlRouter from './firecrawl.routes.js';
import liveViewRouter from './live-view.routes.js';

export { setAgentDependencies } from './shared.js';

const router = Router();

// Chat, cancellation, approvals, file upload, SSE streaming
router.use(chatRouter);

// Dashboard, history, operations log, goals
router.use(dashboardRouter);

// Playbook generation & item status, daily briefing
router.use(playbookRouter);

// Admin queue management (admin-only)
router.use(adminRouter);

// Cloud Scheduler triggers (cron-only)
router.use(cronRouter);

// Conversation thread CRUD (MongoDB)
router.use(threadsRouter);

// Firecrawl persistent sign-in sessions
router.use(firecrawlRouter);

// Live-view browser sessions + system health
router.use(liveViewRouter);

export default router;
