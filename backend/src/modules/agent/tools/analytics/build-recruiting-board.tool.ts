/**
 * @fileoverview Build Recruiting Board Tool — Prospect pipeline management
 * @module @nxt1/backend/modules/agent/tools/analytics
 *
 * Creates or updates a recruiting board (prospect pipeline) in Firestore for a
 * coach or director. Each board is a prioritized list of prospects with status
 * tracking, fit scores, and notes.
 *
 * Designed for:
 * - **Coaches / Directors** — Managing their recruiting pipeline and prospect tracking.
 * - **Recruiters** — Building and maintaining prospect boards for programs.
 *
 * Storage: `Teams/{teamId}/recruitingBoards/{boardId}`
 *
 * Board operations:
 * - "create"  — Create a new board with an initial set of prospects.
 * - "add"     — Add prospects to an existing board.
 * - "update"  — Update status/notes for a prospect on the board.
 * - "remove"  — Remove a prospect from the board.
 * - "read"    — Read the current board state.
 */

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult } from '../base.tool.js';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const TEAMS_COLLECTION = 'Teams';
const BOARDS_SUBCOLLECTION = 'recruitingBoards';
const MAX_PROSPECTS_PER_BOARD = 100;
const MAX_BOARD_NAME_LENGTH = 100;
const MAX_NOTES_LENGTH = 2000;

const VALID_STATUSES = [
  'prospect',
  'contacted',
  'interested',
  'visited',
  'offered',
  'committed',
  'signed',
  'passed',
] as const;

type ProspectStatus = (typeof VALID_STATUSES)[number];

const VALID_OPERATIONS = ['create', 'add', 'update', 'remove', 'read'] as const;

type BoardOperation = (typeof VALID_OPERATIONS)[number];

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProspectEntry {
  readonly userId: string;
  readonly name: string;
  readonly position: string;
  readonly classOf: number | null;
  readonly status: ProspectStatus;
  readonly priority: number;
  readonly notes: string;
  readonly addedAt: string;
  readonly updatedAt: string;
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class BuildRecruitingBoardTool extends BaseTool {
  readonly name = 'build_recruiting_board';

  readonly description =
    'Creates, reads, or updates a recruiting prospect board for a team.\n\n' +
    'A recruiting board is a prioritized pipeline of prospects with status ' +
    'tracking (prospect → contacted → interested → visited → offered → committed → signed).\n\n' +
    'Operations:\n' +
    '- "create" — Create a new board with a name and optional initial prospects.\n' +
    '- "add" — Add one or more prospects to an existing board.\n' +
    '- "update" — Update status, priority, or notes for a prospect.\n' +
    '- "remove" — Remove a prospect from the board.\n' +
    '- "read" — Read the current board state.\n\n' +
    'Parameters:\n' +
    '- teamId (required): Firestore ID of the team.\n' +
    '- operation (required): One of "create", "add", "update", "remove", "read".\n' +
    '- boardId (optional): Required for add/update/remove/read. Omit for create.\n' +
    '- boardName (optional): Name for a new board (create only).\n' +
    '- sport (optional): Sport key for the board (create only).\n' +
    '- prospects (optional): Array of prospect objects for create/add.\n' +
    '- prospect (optional): Single prospect object for update/remove.';

  readonly parameters = {
    type: 'object',
    properties: {
      teamId: {
        type: 'string',
        description: 'Firestore document ID of the team.',
      },
      operation: {
        type: 'string',
        enum: VALID_OPERATIONS,
        description: 'Board operation to perform.',
      },
      boardId: {
        type: 'string',
        description: 'Existing board document ID. Required for add/update/remove/read.',
      },
      boardName: {
        type: 'string',
        description: 'Display name for a new board (create only). Max 100 characters.',
      },
      sport: {
        type: 'string',
        description: 'Sport key for the board (e.g. "football"). Used when creating.',
      },
      prospects: {
        type: 'array',
        description:
          'Array of prospect objects to add. Each: { userId, name, position, classOf, status?, priority?, notes? }.',
        items: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            name: { type: 'string' },
            position: { type: 'string' },
            classOf: { type: 'number' },
            status: { type: 'string', enum: VALID_STATUSES },
            priority: { type: 'number' },
            notes: { type: 'string' },
          },
          required: ['userId', 'name', 'position'],
        },
      },
      prospect: {
        type: 'object',
        description:
          'Single prospect object for update/remove: { userId, status?, priority?, notes? }.',
        properties: {
          userId: { type: 'string' },
          status: { type: 'string', enum: VALID_STATUSES },
          priority: { type: 'number' },
          notes: { type: 'string' },
        },
        required: ['userId'],
      },
    },
    required: ['teamId', 'operation'],
  } as const;

  override readonly allowedAgents = ['recruiting_coordinator', 'performance_coordinator'] as const;

  readonly isMutation = true;
  readonly category = 'database' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const teamId = this.str(input, 'teamId');
    if (!teamId) return this.paramError('teamId');

    const operation = this.str(input, 'operation') as BoardOperation | null;
    if (!operation || !VALID_OPERATIONS.includes(operation)) {
      return {
        success: false,
        error: `Invalid operation. Must be one of: ${VALID_OPERATIONS.join(', ')}.`,
      };
    }

    logger.debug('[BuildRecruitingBoard] Executing', { teamId, operation });

    try {
      switch (operation) {
        case 'create':
          return await this.createBoard(teamId, input);
        case 'add':
          return await this.addProspects(teamId, input);
        case 'update':
          return await this.updateProspect(teamId, input);
        case 'remove':
          return await this.removeProspect(teamId, input);
        case 'read':
          return await this.readBoard(teamId, input);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Recruiting board operation failed';
      logger.error('[BuildRecruitingBoard] Error', { teamId, operation, error: message });
      return { success: false, error: message };
    }
  }

  // ─── Operations ───────────────────────────────────────────────────────

  private async createBoard(teamId: string, input: Record<string, unknown>): Promise<ToolResult> {
    const boardName = this.str(input, 'boardName') ?? 'Recruiting Board';
    if (boardName.length > MAX_BOARD_NAME_LENGTH) {
      return {
        success: false,
        error: `Board name exceeds ${MAX_BOARD_NAME_LENGTH} characters.`,
      };
    }

    const sport = this.str(input, 'sport') ?? '';
    const rawProspects = this.arr(input, 'prospects') ?? [];
    const prospects = this.parseProspects(rawProspects).slice(0, MAX_PROSPECTS_PER_BOARD);
    const boardRef = this.db
      .collection(TEAMS_COLLECTION)
      .doc(teamId)
      .collection(BOARDS_SUBCOLLECTION)
      .doc();

    await boardRef.set({
      name: boardName,
      sport,
      prospects,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      data: {
        boardId: boardRef.id,
        teamId,
        boardName,
        sport,
        prospectCount: prospects.length,
        message:
          `Created recruiting board "${boardName}" with ${prospects.length} prospect(s). ` +
          `Board ID: ${boardRef.id}.`,
      },
    };
  }

  private async addProspects(teamId: string, input: Record<string, unknown>): Promise<ToolResult> {
    const boardId = this.str(input, 'boardId');
    if (!boardId) return this.paramError('boardId');

    const boardRef = this.db
      .collection(TEAMS_COLLECTION)
      .doc(teamId)
      .collection(BOARDS_SUBCOLLECTION)
      .doc(boardId);

    const boardDoc = await boardRef.get();
    if (!boardDoc.exists) {
      return { success: false, error: `Board "${boardId}" not found for team "${teamId}".` };
    }

    const existing = (boardDoc.data()?.['prospects'] ?? []) as ProspectEntry[];
    const rawNew = this.arr(input, 'prospects') ?? [];
    const newProspects = this.parseProspects(rawNew);

    // Deduplicate by userId
    const existingIds = new Set(existing.map((p) => p.userId));
    const toAdd = newProspects.filter((p) => !existingIds.has(p.userId));

    const merged = [...existing, ...toAdd].slice(0, MAX_PROSPECTS_PER_BOARD);

    await boardRef.update({
      prospects: merged,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      data: {
        boardId,
        addedCount: toAdd.length,
        skippedDuplicates: newProspects.length - toAdd.length,
        totalProspects: merged.length,
        message: `Added ${toAdd.length} prospect(s) to board "${boardId}". Total: ${merged.length}.`,
      },
    };
  }

  private async updateProspect(
    teamId: string,
    input: Record<string, unknown>
  ): Promise<ToolResult> {
    const boardId = this.str(input, 'boardId');
    if (!boardId) return this.paramError('boardId');

    const prospectInput = this.obj(input, 'prospect');
    if (!prospectInput) return this.paramError('prospect');

    const userId = typeof prospectInput['userId'] === 'string' ? prospectInput['userId'] : null;
    if (!userId) {
      return { success: false, error: 'prospect.userId is required for update.' };
    }

    const boardRef = this.db
      .collection(TEAMS_COLLECTION)
      .doc(teamId)
      .collection(BOARDS_SUBCOLLECTION)
      .doc(boardId);

    const boardDoc = await boardRef.get();
    if (!boardDoc.exists) {
      return { success: false, error: `Board "${boardId}" not found.` };
    }

    const prospects = (boardDoc.data()?.['prospects'] ?? []) as ProspectEntry[];
    const idx = prospects.findIndex((p) => p.userId === userId);
    if (idx === -1) {
      return { success: false, error: `Prospect "${userId}" not found on board.` };
    }

    const now = new Date().toISOString();
    const updated: ProspectEntry = {
      ...prospects[idx],
      ...(this.isValidStatus(prospectInput['status'])
        ? { status: prospectInput['status'] as ProspectStatus }
        : {}),
      ...(typeof prospectInput['priority'] === 'number'
        ? { priority: prospectInput['priority'] as number }
        : {}),
      ...(typeof prospectInput['notes'] === 'string'
        ? { notes: (prospectInput['notes'] as string).slice(0, MAX_NOTES_LENGTH) }
        : {}),
      updatedAt: now,
    };

    const newProspects = [...prospects];
    newProspects[idx] = updated;

    await boardRef.update({
      prospects: newProspects,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      data: {
        boardId,
        updatedProspect: updated,
        message: `Updated prospect "${userId}" on board "${boardId}".`,
      },
    };
  }

  private async removeProspect(
    teamId: string,
    input: Record<string, unknown>
  ): Promise<ToolResult> {
    const boardId = this.str(input, 'boardId');
    if (!boardId) return this.paramError('boardId');

    const prospectInput = this.obj(input, 'prospect');
    if (!prospectInput) return this.paramError('prospect');

    const userId = typeof prospectInput['userId'] === 'string' ? prospectInput['userId'] : null;
    if (!userId) {
      return { success: false, error: 'prospect.userId is required for remove.' };
    }

    const boardRef = this.db
      .collection(TEAMS_COLLECTION)
      .doc(teamId)
      .collection(BOARDS_SUBCOLLECTION)
      .doc(boardId);

    const boardDoc = await boardRef.get();
    if (!boardDoc.exists) {
      return { success: false, error: `Board "${boardId}" not found.` };
    }

    const prospects = (boardDoc.data()?.['prospects'] ?? []) as ProspectEntry[];
    const filtered = prospects.filter((p) => p.userId !== userId);

    if (filtered.length === prospects.length) {
      return { success: false, error: `Prospect "${userId}" not found on board.` };
    }

    await boardRef.update({
      prospects: filtered,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      data: {
        boardId,
        removedUserId: userId,
        remainingProspects: filtered.length,
        message: `Removed prospect "${userId}" from board. ${filtered.length} prospect(s) remaining.`,
      },
    };
  }

  private async readBoard(teamId: string, input: Record<string, unknown>): Promise<ToolResult> {
    const boardId = this.str(input, 'boardId');
    if (!boardId) return this.paramError('boardId');

    const boardRef = this.db
      .collection(TEAMS_COLLECTION)
      .doc(teamId)
      .collection(BOARDS_SUBCOLLECTION)
      .doc(boardId);

    const boardDoc = await boardRef.get();
    if (!boardDoc.exists) {
      return { success: false, error: `Board "${boardId}" not found for team "${teamId}".` };
    }

    const data = boardDoc.data() as Record<string, unknown>;
    const prospects = (data['prospects'] ?? []) as ProspectEntry[];

    // Summary by status
    const statusSummary: Record<string, number> = {};
    for (const p of prospects) {
      statusSummary[p.status] = (statusSummary[p.status] ?? 0) + 1;
    }

    return {
      success: true,
      data: {
        boardId,
        teamId,
        boardName: data['name'] ?? '',
        sport: data['sport'] ?? '',
        totalProspects: prospects.length,
        statusSummary,
        prospects: prospects.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)),
        message:
          `Board "${data['name']}" has ${prospects.length} prospect(s). ` +
          Object.entries(statusSummary)
            .map(([status, count]) => `${status}: ${count}`)
            .join(', ') +
          '.',
      },
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private parseProspects(raw: unknown[]): ProspectEntry[] {
    const now = new Date().toISOString();

    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        userId: String(item['userId'] ?? ''),
        name: String(item['name'] ?? ''),
        position: String(item['position'] ?? 'Unknown'),
        classOf: typeof item['classOf'] === 'number' ? item['classOf'] : null,
        status: this.isValidStatus(item['status'])
          ? (item['status'] as ProspectStatus)
          : 'prospect',
        priority: typeof item['priority'] === 'number' ? item['priority'] : 99,
        notes: typeof item['notes'] === 'string' ? item['notes'].slice(0, MAX_NOTES_LENGTH) : '',
        addedAt: now,
        updatedAt: now,
      }))
      .filter((p) => p.userId.length > 0 && p.name.length > 0);
  }

  private isValidStatus(val: unknown): val is ProspectStatus {
    return typeof val === 'string' && VALID_STATUSES.includes(val as ProspectStatus);
  }
}
