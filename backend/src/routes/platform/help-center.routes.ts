/**
 * @fileoverview Help Center Routes
 * @module @nxt1/backend/routes/help-center
 *
 * Fully implemented help center routes.
 * Matches HELP_API_ENDPOINTS from @nxt1/core/help-center/constants.
 *
 * Route mount point: /api/v1/help-center (set in index.ts)
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { appGuard, optionalAuth } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import * as helpCenterService from '../../services/platform/help-center.service.js';
import type { HelpCategoryId, HelpContentType, HelpUserType } from '@nxt1/core';

const router: ExpressRouter = Router();

// ============================================
// PUBLIC / OPTIONAL-AUTH ROUTES (read)
// ============================================

/**
 * Get help center home page data
 * GET /api/v1/help-center
 */
router.get('/', optionalAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = await helpCenterService.getHome();

    res.json({ success: true, data });
  } catch (err) {
    logger.error('[HelpCenter] GET / failed', { error: String(err) });
    res.status(500).json({ success: false, error: 'Failed to load help center' });
  }
});

/**
 * Get category detail with articles
 * GET /api/v1/help-center/categories/:id
 */
router.get('/categories/:id', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = req.params['id'] as HelpCategoryId;
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query['limit'] as string) || 12));

    const data = await helpCenterService.getCategoryDetail(categoryId, page, limit);

    if (!data) {
      res.status(404).json({ success: false, error: `Category "${categoryId}" not found` });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    logger.error('[HelpCenter] GET /categories/:id failed', {
      categoryId: req.params['id'],
      error: String(err),
    });
    res.status(500).json({ success: false, error: 'Failed to load category' });
  }
});

/**
 * Get article by slug
 * GET /api/v1/help-center/articles/:slug
 */
router.get('/articles/:slug', async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = req.params['slug'] as string;
    if (!slug) {
      res.status(400).json({ success: false, error: 'Slug is required' });
      return;
    }

    const data = await helpCenterService.getArticle(slug);

    if (!data) {
      res.status(404).json({ success: false, error: `Article "${slug}" not found` });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    logger.error('[HelpCenter] GET /articles/:slug failed', {
      slug: req.params['slug'],
      error: String(err),
    });
    res.status(500).json({ success: false, error: 'Failed to load article' });
  }
});

/**
 * Search help center content
 * GET /api/v1/help-center/search
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = (req.query['query'] as string) || '';
    const categoriesParam = req.query['categories'] as string;
    const typesParam = req.query['types'] as string;
    const userType = (req.query['userType'] as string) || undefined;
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query['limit'] as string) || 12));

    const data = await helpCenterService.search({
      query,
      categories: categoriesParam ? (categoriesParam.split(',') as HelpCategoryId[]) : undefined,
      types: typesParam ? (typesParam.split(',') as HelpContentType[]) : undefined,
      userType: userType as HelpUserType | undefined,
      page,
      limit,
    });

    res.json({ success: true, data });
  } catch (err) {
    logger.error('[HelpCenter] GET /search failed', { error: String(err) });
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

/**
 * Get FAQs
 * GET /api/v1/help-center/faqs
 */
router.get('/faqs', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = (req.query['category'] as HelpCategoryId) || undefined;
    const userType = (req.query['userType'] as string) || undefined;

    const data = await helpCenterService.getFaqs(categoryId, userType);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[HelpCenter] GET /faqs failed', { error: String(err) });
    res.status(500).json({ success: false, error: 'Failed to load FAQs' });
  }
});

// ============================================
// AUTH-REQUIRED ROUTES (write)
// ============================================

/**
 * Submit article feedback (helpful / not helpful)
 * POST /api/v1/help-center/articles/:id/feedback
 */
router.post(
  '/articles/:id/feedback',
  appGuard,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const articleId = req.params['id'] as string;
      const userId = req.user?.uid;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { isHelpful, feedback } = req.body as { isHelpful?: boolean; feedback?: string };
      if (typeof isHelpful !== 'boolean') {
        res.status(400).json({ success: false, error: 'isHelpful (boolean) is required' });
        return;
      }

      const data = await helpCenterService.submitFeedback(articleId, userId, isHelpful, feedback);
      res.json({ success: true, data });
    } catch (err) {
      logger.error('[HelpCenter] POST /articles/:id/feedback failed', {
        articleId: req.params['id'],
        error: String(err),
      });
      res.status(500).json({ success: false, error: 'Failed to submit feedback' });
    }
  }
);

/**
 * Send AI chat message (future)
 * POST /api/v1/help-center/chat
 */
router.post('/chat', appGuard, (_req: Request, res: Response) => {
  res.status(501).json({ success: false, error: 'AI chat not yet implemented' });
});

/**
 * Submit support ticket (future)
 * POST /api/v1/help-center/support
 */
router.post('/support', appGuard, (_req: Request, res: Response) => {
  res.status(501).json({ success: false, error: 'Support tickets not yet implemented' });
});

export default router;
