import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const PLAYBOOKS_COLLECTION = 'TeamPlaybooks';
const TEAMS_COLLECTION = 'Teams';

const GetPlaybookInputSchema = z.object({
  playbookId: z.string().trim().min(1),
  playNameQuery: z.string().trim().min(1).optional(),
});

type TeamPlaybookDoc = {
  readonly id?: string;
  readonly teamId: string;
  readonly sport?: string;
  readonly name?: string;
  readonly title?: string;
  readonly updatedAt?: string;
  readonly createdAt?: string;
  readonly archived?: boolean;
  readonly plays?: readonly unknown[];
};

type PlaybookAlias = {
  readonly teamId: string;
  readonly query: string;
};

function normalizeToken(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function removePlaybookWord(value: string): string {
  return value
    .replace(/\bplaybook\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePlaybookAlias(playbookId: string): PlaybookAlias | null {
  const parts = playbookId
    .split('_')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length < 2) return null;
  const [teamId, ...queryParts] = parts;
  const query = queryParts.join(' ').trim();
  if (!teamId || !query) return null;

  return { teamId, query };
}

function tokens(value: string): string[] {
  return normalizeToken(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function extractPlayLabel(play: Record<string, unknown>): string {
  const directName = typeof play['name'] === 'string' ? play['name'] : undefined;
  const title = typeof play['title'] === 'string' ? play['title'] : undefined;
  const concept = typeof play['concept'] === 'string' ? play['concept'] : undefined;
  const fallback = typeof play['series'] === 'string' ? play['series'] : undefined;
  return directName ?? title ?? concept ?? fallback ?? 'Unnamed Play';
}

function playMatchesQuery(play: Record<string, unknown>, query: string): boolean {
  const normalizedQuery = normalizeToken(query);
  const queryWithoutPlural = normalizedQuery.replace(/\bguns\b/g, 'gun');

  const searchableFields: string[] = [];
  for (const key of ['name', 'title', 'concept', 'series', 'formation']) {
    if (typeof play[key] === 'string') searchableFields.push(play[key] as string);
  }
  const conceptTags = play['conceptTags'];
  if (Array.isArray(conceptTags)) {
    for (const tag of conceptTags) {
      if (typeof tag === 'string') searchableFields.push(tag);
    }
  }

  const corpus = normalizeToken(searchableFields.join(' '));
  const corpusWithoutPlural = corpus.replace(/\bguns\b/g, 'gun');
  if (!corpusWithoutPlural) return false;

  if (corpusWithoutPlural.includes(queryWithoutPlural)) return true;

  const queryTokens = tokens(queryWithoutPlural);
  if (queryTokens.length === 0) return false;
  return queryTokens.every((token) => corpusWithoutPlural.includes(token));
}

export class GetPlaybookTool extends BaseTool {
  readonly name = 'get_playbook';
  readonly description =
    'Get a saved team playbook by ID, including play entries, concept tags, and diagram links.';

  readonly parameters = GetPlaybookInputSchema;
  override readonly allowedAgents = ['router', 'strategy_coordinator', 'data_coordinator'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;
  readonly entityGroup = 'team_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  private async resolvePlaybookByIdOrAlias(
    playbookId: string
  ): Promise<{ readonly id: string; readonly playbook: TeamPlaybookDoc } | null> {
    const directDoc = await this.db.collection(PLAYBOOKS_COLLECTION).doc(playbookId).get();
    if (directDoc.exists) {
      return { id: directDoc.id, playbook: directDoc.data() as TeamPlaybookDoc };
    }

    const alias = parsePlaybookAlias(playbookId);
    if (!alias) return null;

    const aliasQuery = normalizeToken(alias.query);
    const aliasQueryNoSuffix = removePlaybookWord(aliasQuery);
    const teamSnap = await this.db
      .collection(PLAYBOOKS_COLLECTION)
      .where('teamId', '==', alias.teamId)
      .limit(200)
      .get();

    const ranked = teamSnap.docs
      .map((doc) => ({ id: doc.id, playbook: doc.data() as TeamPlaybookDoc }))
      .map(({ id, playbook }) => {
        const playbookName = normalizeToken(playbook.name ?? playbook.title);
        const playbookNameNoSuffix = removePlaybookWord(playbookName);
        const exactName = playbookName === aliasQuery;
        const normalizedName = playbookNameNoSuffix === aliasQueryNoSuffix;
        const fuzzyName =
          playbookName.includes(aliasQuery) ||
          aliasQuery.includes(playbookName) ||
          playbookNameNoSuffix.includes(aliasQueryNoSuffix) ||
          aliasQueryNoSuffix.includes(playbookNameNoSuffix);

        let score = 0;
        if (exactName) score += 8;
        else if (normalizedName) score += 6;
        else if (fuzzyName) score += 3;

        return { id, playbook, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        const left = a.playbook.updatedAt ?? a.playbook.createdAt ?? '';
        const right = b.playbook.updatedAt ?? b.playbook.createdAt ?? '';
        return left > right ? -1 : 1;
      });

    return ranked[0] ?? null;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GetPlaybookInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { playbookId, playNameQuery } = parsed.data;
    const resolved = await this.resolvePlaybookByIdOrAlias(playbookId);
    if (!resolved) {
      return { success: false, error: `Playbook ${playbookId} not found.` };
    }

    const playbook = resolved.playbook;
    const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(playbook.teamId).get();
    if (!teamDoc.exists) {
      return { success: false, error: `Team ${playbook.teamId} not found.` };
    }

    const authorized = await canManageTeamMutationForUser(
      this.db,
      context.userId,
      playbook.teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      return { success: false, error: 'Not authorized to view this playbook.' };
    }

    const plays = Array.isArray(playbook.plays)
      ? (playbook.plays.filter((item) => item && typeof item === 'object') as Record<
          string,
          unknown
        >[])
      : [];

    const matchedPlays =
      typeof playNameQuery === 'string' && playNameQuery.trim().length > 0
        ? plays
            .map((play, index) => ({ play, index }))
            .filter(({ play }) => playMatchesQuery(play, playNameQuery))
            .slice(0, 20)
            .map(({ play, index }) => ({
              index,
              name: extractPlayLabel(play),
              formation: typeof play['formation'] === 'string' ? play['formation'] : undefined,
              conceptTags: Array.isArray(play['conceptTags'])
                ? (play['conceptTags'].filter((tag) => typeof tag === 'string') as string[])
                : undefined,
            }))
        : [];

    return {
      success: true,
      markdown: `Loaded playbook **${playbook.name ?? playbook.title ?? resolved.id}** (${playbook.sport ?? 'unknown sport'}).`,
      data: {
        playbook: {
          id: resolved.id,
          ...playbook,
        },
        ...(playNameQuery
          ? {
              playNameQuery,
              playMatch: {
                matched: matchedPlays.length > 0,
                matchCount: matchedPlays.length,
                matches: matchedPlays,
              },
            }
          : {}),
      },
    };
  }
}
