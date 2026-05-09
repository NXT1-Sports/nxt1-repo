/**
 * @fileoverview Agent X route barrel — composes all sub-routers.
 *
 * Sub-routers (in mount order):
 *   chat          — /pause/:id, /cancel/:id, /resume-job/:operationId, /approvals/:id/resolve, /enqueue, /chat
 *   dashboard     — /history, /operations-log, /dashboard, /goals, /upload
 *   generation    — /playbook/generate, /playbook/item/:id/status, /briefing/generate
 *   admin-queue   — /pause, /resume, /queue-stats
 *   cron          — /cron/daily-briefings, /cron/summarize-threads, /cron/cleanup-thread-media,
 *                   /cron/reconcile-job-thread-links
 *   threads       — /threads, /threads/:threadId, /threads/:threadId/messages
 *   firecrawl     — /firecrawl/session/*, /firecrawl/accounts
 *   live-view     — /live-view/start, /live-view/navigate, /live-view/refresh, /live-view/close, /health
 */

import { Router } from 'express';
import chatRoutes from './chat.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import generationRoutes from './generation.routes.js';
import adminQueueRoutes from './admin-queue.routes.js';
import cronRoutes from './cron.routes.js';
import threadsRoutes from './threads.routes.js';
import firecrawlRoutes from './firecrawl.routes.js';
import liveViewRoutes from './live-view.routes.js';
import knowledgeAdminRoutes from './knowledge-admin.routes.js';
import messagesRoutes from './messages.routes.js';
import mediaProxyRoutes from './media-proxy.routes.js';

const router = Router();

router.use(chatRoutes);
router.use(dashboardRoutes);
router.use(generationRoutes);
router.use(adminQueueRoutes);
router.use(cronRoutes);
router.use(threadsRoutes);
router.use(firecrawlRoutes);
router.use(liveViewRoutes);
router.use(knowledgeAdminRoutes);
router.use(messagesRoutes);
router.use(mediaProxyRoutes);

export default router;
