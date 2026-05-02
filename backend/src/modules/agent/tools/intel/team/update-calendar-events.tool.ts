/**
 * @fileoverview Update Calendar Events Tool — Partial-patch calendar events
 * @module @nxt1/backend/modules/agent/tools/intel
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const CALENDAR_COLLECTION = 'Calendar';

const UpdateCalendarEventsInputSchema = z.object({
  docId: z.string().trim().min(1),
  teamId: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  date: z.string().trim().min(1).optional(),
  time: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
});

export class UpdateCalendarEventsTool extends BaseTool {
  readonly name = 'update_calendar_events';
  readonly description = 'Partial-updates a calendar event.';
  readonly parameters = UpdateCalendarEventsInputSchema;
  override readonly allowedAgents = ['data_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'team_tools' as const;
  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateCalendarEventsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { docId, teamId } = parsed.data;
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    const teamDoc = await this.db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists || teamDoc.data()?.['ownerId'] !== context.userId) {
      return { success: false, error: 'Not authorized to update calendar events for this team.' };
    }

    context?.emitStage?.('submitting_job', { icon: 'database', phase: 'update_calendar_events' });

    const docRef = this.db.collection(CALENDAR_COLLECTION).doc(docId);
    const patch: Record<string, unknown> = {};

    if (parsed.data.title !== undefined) patch['title'] = parsed.data.title;
    if (parsed.data.date !== undefined) patch['date'] = parsed.data.date;
    if (parsed.data.time !== undefined) patch['time'] = parsed.data.time;
    if (parsed.data.location !== undefined) patch['location'] = parsed.data.location;
    if (parsed.data.description !== undefined) patch['description'] = parsed.data.description;

    if (Object.keys(patch).length === 0)
      return { success: true, data: { docId, teamId, message: 'No fields to update' } };

    patch['updatedAt'] = new Date();

    try {
      await docRef.update(patch);
      const cache = getCacheService();
      await Promise.allSettled([cache.delByPrefix(`team:${teamId}:`)]);

      logger.info('[UpdateCalendarEventsTool] Event updated', { docId, teamId });
      return { success: true, data: { docId, teamId } };
    } catch (error) {
      logger.error('[UpdateCalendarEventsTool] Failed to update event', {
        err: error instanceof Error ? error.message : String(error),
        docId,
        teamId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update event.',
      };
    }
  }
}
