/**
 * @fileoverview Open Live View Tool
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Agent X tool that opens an interactive browser session (live view) in the
 * user's command center side panel. The tool:
 *
 * 1. Fetches the user's connected accounts from Firestore.
 * 2. Delegates to `LiveViewSessionService.startSession()` which resolves the
 *    destination, reuses authenticated Firecrawl profiles when available, and
 *    creates a streamable browser session.
 * 3. Returns the session as an `autoOpenPanel` instruction — the SSE route
 *    captures this and the frontend shell automatically opens the live-view
 *    iframe panel.
 *
 * Security:
 * - URL validated by LiveViewSessionService (SSRF protection via `validateUrl`).
 * - Persistent profiles use `saveChanges: true` scoped per-user to preserve logins.
 * - Session ownership enforced by userId binding.
 *
 * Idempotency:
 * - If the user already has an active live-view session, this tool navigates the
 *   existing browser to the new URL instead of starting a new session. This
 *   guarantees zero resource leaks regardless of how the LLM calls the tool.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult } from '../../../base.tool.js';
import type { LiveViewSessionService, StartLiveViewRequest } from './live-view-session.service.js';
import { logger } from '../../../../../../utils/logger.js';
import { z } from 'zod';

// ─── Connected Account shape (Firestore `Users/{uid}.connectedAccounts`) ────

interface StoredConnectedAccount {
  readonly type?: string;
  readonly profileName?: string;
  readonly status?: string;
  readonly connectedAt?: string;
  readonly verificationNote?: string;
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class OpenLiveViewTool extends BaseTool {
  readonly name = 'open_live_view';

  readonly description =
    "Opens an interactive browser session (live view) in the user's Agent X command center. " +
    'The browser window appears as a side panel where the user can see and interact with the destination page in real time. ' +
    'Use this when the user asks to browse a website, view their platform profile, visit a college athletics page, ' +
    'check a recruiting portal, or whenever an interactive web view would be useful. ' +
    'If the user has a connected account for the target platform (e.g. Hudl, Gmail), the session is pre-authenticated. ' +
    'Prefer this when the user wants to SEE and interact with the page rather than only extracting data from it.';

  readonly parameters = z.object({
    url: z.string().trim().min(1),
    platformKey: z.string().trim().min(1).optional(),
    userId: z.string().trim().min(1),
  });

  readonly isMutation = false;
  readonly category = 'system' as const;

  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['*'] as const;

  private readonly db: Firestore;
  private readonly sessionService: LiveViewSessionService;

  constructor(sessionService: LiveViewSessionService, db?: Firestore) {
    super();
    this.sessionService = sessionService;
    this.db = db ?? getFirestore();
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const url = this.str(input, 'url');
    const userId = this.str(input, 'userId');
    const platformKey = input['platformKey'] as string | undefined;

    if (!url) return this.paramError('url');
    if (!userId) return this.paramError('userId');

    try {
      // ── Idempotent: reuse active session if one exists ──────────────
      const existingSession = this.sessionService.getActiveSession(userId);

      if (existingSession) {
        // Navigate the existing browser to the new URL instead of creating a new session
        logger.info('[OpenLiveViewTool] Reusing active session (idempotent)', {
          userId,
          existingSessionId: existingSession.sessionId,
          newUrl: url,
        });

        try {
          const navResult = await this.sessionService.navigate(
            existingSession.sessionId,
            userId,
            url
          );

          return {
            success: true,
            data: {
              autoOpenPanel: {
                type: 'live-view',
                url: existingSession.interactiveUrl,
                title: new URL(navResult.resolvedUrl).hostname.replace(/^www\./, ''),
              },
              sessionId: existingSession.sessionId,
              url: navResult.resolvedUrl,
              reusedExistingSession: true,
              expiresAt: existingSession.expiresAt.toISOString(),
              hint:
                'The live view browser has navigated to the new URL. You do NOT need to remember or pass the sessionId — ' +
                'all live-view tools auto-resolve it from the userId.',
            },
          };
        } catch (navErr) {
          // Session expired server-side (Firecrawl 404) — clean up stale entry and fall through to create a new session
          logger.warn('[OpenLiveViewTool] Existing session stale, creating new one', {
            userId,
            staleSessionId: existingSession.sessionId,
            error: navErr instanceof Error ? navErr.message : String(navErr),
          });
          await this.sessionService
            .closeSession(existingSession.sessionId, userId)
            .catch(() => undefined);
        }
      }

      // ── No active session — create a new one ──────────────────────────
      // Fetch connected accounts from Firestore for auth profile reuse
      const userDoc = await this.db.collection('Users').doc(userId).get();
      const connectedAccounts =
        (userDoc.data()?.['connectedAccounts'] as Record<string, StoredConnectedAccount>) ?? {};

      const request: StartLiveViewRequest = {
        url,
        ...(platformKey ? { platformKey } : {}),
      };

      const result = await this.sessionService.startSession(userId, request, connectedAccounts);
      const { session } = result;

      logger.info('[OpenLiveViewTool] Session created', {
        userId,
        sessionId: session.sessionId,
        url: session.resolvedUrl,
        authStatus: session.authStatus,
        platformKey: session.platformKey,
        destinationTier: session.destinationTier,
      });

      // ── Return autoOpenPanel so the SSE route auto-opens the panel ────
      return {
        success: true,
        data: {
          autoOpenPanel: {
            type: 'live-view',
            url: session.interactiveUrl,
            title: session.domainLabel,
            session,
          },
          sessionId: session.sessionId,
          url: session.resolvedUrl,
          domainLabel: session.domainLabel,
          authStatus: session.authStatus,
          destinationTier: session.destinationTier,
          expiresAt: session.expiresAt,
          hint:
            'The live view is now open. You do NOT need to remember or pass the sessionId — all live-view tools ' +
            'auto-resolve it from the userId. You can safely call open_live_view again with a different URL and it will ' +
            'reuse this session automatically. Once a page is open in live view, keep using the live-view tools so every ' +
            'navigation, read, and interaction stays in the same browser the user sees.',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open live view session';
      logger.error('[OpenLiveViewTool] Failed to create session', {
        userId,
        url,
        platformKey,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
