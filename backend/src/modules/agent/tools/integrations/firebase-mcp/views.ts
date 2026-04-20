import { Timestamp, type Firestore, type Query } from 'firebase-admin/firestore';
import type {
  FirebaseMcpQueryInput,
  FirebaseMcpQueryResult,
  FirebaseMcpScope,
  FirebaseMcpViewMetadata,
  FirebaseViewName,
} from './shared.js';
import {
  DEFAULT_FIREBASE_VIEW_LIMIT,
  MAX_FIREBASE_VIEW_LIMIT,
  decodeCursor,
  encodeCursor,
  normalizeViewLimit,
} from './shared.js';

const USERS_COLLECTION = 'Users';
const POSTS_COLLECTION = 'Posts';
const EVENTS_COLLECTION = 'Events';
const RECRUITING_COLLECTION = 'Recruiting';
const PLAYER_STATS_COLLECTION = 'PlayerStats';
const PLAYER_METRICS_COLLECTION = 'PlayerMetrics';
const ROSTER_ENTRIES_COLLECTION = 'RosterEntries';
const TEAMS_COLLECTION = 'Teams';
const ORGANIZATIONS_COLLECTION = 'Organizations';

type PrimitiveRecord = Record<string, unknown>;

interface FirebaseViewDefinition {
  readonly metadata: FirebaseMcpViewMetadata;
  resolve(
    db: Firestore,
    scope: FirebaseMcpScope,
    input: FirebaseMcpQueryInput
  ): Promise<FirebaseMcpQueryResult>;
}

function pickFields(record: PrimitiveRecord, allowedFields: readonly string[]): PrimitiveRecord {
  return sanitizeRecord(
    Object.fromEntries(
      allowedFields
        .map((field) => [field, record[field]])
        .filter(([, value]) => value !== undefined)
    )
  );
}

function sanitizeRecord(record: PrimitiveRecord): PrimitiveRecord {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, normalizeValue(value)])
  );
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }

  if (value && typeof value === 'object') {
    if (
      'path' in (value as Record<string, unknown>) &&
      typeof (value as Record<string, unknown>)['path'] === 'string'
    ) {
      return (value as Record<string, unknown>)['path'];
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        normalizeValue(entry),
      ])
    );
  }

  return value;
}

function limitFor(input: FirebaseMcpQueryInput, metadata: FirebaseMcpViewMetadata): number {
  return Math.min(normalizeViewLimit(input.limit), metadata.maxLimit);
}

function parseStringFilter(input: FirebaseMcpQueryInput, key: string): string | null {
  const raw = input.filters?.[key];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

function parseIsoCursor(input: FirebaseMcpQueryInput): string | null {
  return decodeCursor(input.cursor);
}

function parseTimestampCursor(input: FirebaseMcpQueryInput): Timestamp | null {
  const decoded = decodeCursor(input.cursor);
  if (!decoded) return null;

  const parsedDate = new Date(decoded);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Invalid Firebase MCP timestamp cursor');
  }

  return Timestamp.fromDate(parsedDate);
}

function createdAtCursor(items: PrimitiveRecord[], fieldName: string): string | undefined {
  const lastItem = items.at(-1);
  const sortValue =
    typeof lastItem?.[fieldName] === 'string' ? (lastItem[fieldName] as string) : null;
  return sortValue ? encodeCursor(sortValue) : undefined;
}

async function queryDocuments(query: Query, limit: number): Promise<PrimitiveRecord[]> {
  const snapshot = await query.limit(limit).get();
  return snapshot.docs.map((doc) => sanitizeRecord({ id: doc.id, ...doc.data() }));
}

function sortRecordsDescending(
  items: readonly PrimitiveRecord[],
  fieldName: string
): PrimitiveRecord[] {
  return [...items].sort((left, right) => {
    const leftValue = typeof left[fieldName] === 'string' ? (left[fieldName] as string) : '';
    const rightValue = typeof right[fieldName] === 'string' ? (right[fieldName] as string) : '';
    return rightValue.localeCompare(leftValue);
  });
}

function resolveScopedIds(
  requestedId: string | null,
  availableIds: readonly string[],
  label: 'teamId' | 'organizationId'
): string[] {
  if (requestedId) {
    if (!availableIds.includes(requestedId)) {
      throw new Error(`Requested ${label} is outside the authenticated data scope.`);
    }
    return [requestedId];
  }

  return [...availableIds];
}

function resolveTeamIds(scope: FirebaseMcpScope, input: FirebaseMcpQueryInput): string[] {
  return resolveScopedIds(parseStringFilter(input, 'teamId'), scope.teamIds, 'teamId');
}

function resolveOrganizationIds(scope: FirebaseMcpScope, input: FirebaseMcpQueryInput): string[] {
  return resolveScopedIds(
    parseStringFilter(input, 'organizationId'),
    scope.organizationIds,
    'organizationId'
  );
}

async function loadDocumentsById(
  db: Firestore,
  collectionName: string,
  ids: readonly string[]
): Promise<Record<string, PrimitiveRecord>> {
  const docs = await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const snapshot = await db.collection(collectionName).doc(id).get();
      return snapshot.exists ? [id, sanitizeRecord({ id: snapshot.id, ...snapshot.data() })] : null;
    })
  );

  return Object.fromEntries(
    docs.filter((entry): entry is [string, PrimitiveRecord] => Array.isArray(entry))
  );
}

function applySearchFilter(
  items: readonly PrimitiveRecord[],
  searchTerm: string | null,
  fields: readonly string[]
): PrimitiveRecord[] {
  if (!searchTerm) {
    return [...items];
  }

  const normalizedSearch = searchTerm.toLowerCase();
  return items.filter((item) =>
    fields.some((field) => {
      const value = item[field];
      return typeof value === 'string' && value.toLowerCase().includes(normalizedSearch);
    })
  );
}

async function queryAcrossIds(
  ids: readonly string[],
  buildQuery: (id: string) => Query,
  limit: number,
  sortField: string
): Promise<PrimitiveRecord[]> {
  const snapshots = await Promise.all(ids.map((id) => buildQuery(id).limit(limit).get()));
  const uniqueItems = new Map<string, PrimitiveRecord>();

  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      uniqueItems.set(doc.id, sanitizeRecord({ id: doc.id, ...doc.data() }));
    }
  }

  return sortRecordsDescending([...uniqueItems.values()], sortField).slice(0, limit);
}

async function buildRosterItems(
  db: Firestore,
  rosterEntries: readonly PrimitiveRecord[]
): Promise<PrimitiveRecord[]> {
  const userIds = rosterEntries
    .map((entry) => entry['userId'])
    .filter((userId): userId is string => typeof userId === 'string');
  const teamIds = rosterEntries
    .map((entry) => entry['teamId'])
    .filter((teamId): teamId is string => typeof teamId === 'string');
  const organizationIds = rosterEntries
    .map((entry) => entry['organizationId'])
    .filter((organizationId): organizationId is string => typeof organizationId === 'string');

  const [profilesById, teamsById, organizationsById] = await Promise.all([
    loadDocumentsById(db, USERS_COLLECTION, userIds),
    loadDocumentsById(db, TEAMS_COLLECTION, teamIds),
    loadDocumentsById(db, ORGANIZATIONS_COLLECTION, organizationIds),
  ]);

  return rosterEntries.map((entry) =>
    sanitizeRecord({
      ...pickFields(entry, [
        'id',
        'userId',
        'teamId',
        'organizationId',
        'role',
        'sport',
        'title',
        'status',
        'jerseyNumber',
        'positions',
        'season',
        'classOfWhenJoined',
        'displayName',
        'profileImgs',
        'classOf',
        'height',
        'weight',
        'joinedAt',
        'updatedAt',
        'leftAt',
      ]),
      profile:
        typeof entry['userId'] === 'string'
          ? pickFields(profilesById[entry['userId']] ?? {}, [
              'id',
              'firstName',
              'lastName',
              'displayName',
              'classOf',
              'school',
              'city',
              'state',
              'height',
              'weight',
              'profileImgs',
              'sportInfo',
            ])
          : null,
      team:
        typeof entry['teamId'] === 'string'
          ? pickFields(teamsById[entry['teamId']] ?? {}, [
              'id',
              'name',
              'displayName',
              'teamName',
              'sport',
              'teamType',
              'mascot',
              'conference',
              'division',
              'logoUrl',
              'primaryColor',
              'secondaryColor',
              'city',
              'state',
              'country',
              'slug',
              'isActive',
            ])
          : null,
      organization:
        typeof entry['organizationId'] === 'string'
          ? pickFields(organizationsById[entry['organizationId']] ?? {}, [
              'id',
              'name',
              'logoUrl',
              'primaryColor',
              'secondaryColor',
              'mascot',
              'location',
              'type',
              'status',
            ])
          : null,
    })
  );
}

async function buildHighlightItems(
  db: Firestore,
  posts: readonly PrimitiveRecord[]
): Promise<PrimitiveRecord[]> {
  const userIds = posts
    .map((post) => post['userId'])
    .filter((userId): userId is string => typeof userId === 'string');
  const teamIds = posts
    .map((post) => post['teamId'])
    .filter((teamId): teamId is string => typeof teamId === 'string');
  const organizationIds = posts
    .map((post) => post['organizationId'])
    .filter((organizationId): organizationId is string => typeof organizationId === 'string');

  const [profilesById, teamsById, organizationsById] = await Promise.all([
    loadDocumentsById(db, USERS_COLLECTION, userIds),
    loadDocumentsById(db, TEAMS_COLLECTION, teamIds),
    loadDocumentsById(db, ORGANIZATIONS_COLLECTION, organizationIds),
  ]);

  return posts.map((post) =>
    sanitizeRecord({
      ...pickFields(post, [
        'id',
        'userId',
        'type',
        'visibility',
        'sportId',
        'teamId',
        'organizationId',
        'content',
        'title',
        'images',
        'thumbnailUrl',
        'stats',
        'createdAt',
        'updatedAt',
      ]),
      videoUrl: post['videoUrl'] ?? post['mediaUrl'],
      author:
        typeof post['userId'] === 'string'
          ? pickFields(profilesById[post['userId']] ?? {}, [
              'id',
              'firstName',
              'lastName',
              'displayName',
              'profileImgs',
              'school',
            ])
          : null,
      team:
        typeof post['teamId'] === 'string'
          ? pickFields(teamsById[post['teamId']] ?? {}, ['id', 'name', 'displayName', 'logoUrl'])
          : null,
      organization:
        typeof post['organizationId'] === 'string'
          ? pickFields(organizationsById[post['organizationId']] ?? {}, ['id', 'name', 'logoUrl'])
          : null,
    })
  );
}

const VIEW_DEFINITIONS: Record<FirebaseViewName, FirebaseViewDefinition> = {
  user_profile_snapshot: {
    metadata: {
      name: 'user_profile_snapshot',
      title: 'User Profile Snapshot',
      description:
        "Read the authenticated user's athlete profile including identity, academics, sport info, team, coach, awards, and media-ready profile context.",
      filterHelp: [
        'No filters. Returns a single sanitized profile snapshot for the authenticated user.',
      ],
      defaultLimit: 1,
      maxLimit: 1,
    },
    async resolve(db, scope) {
      const [snapshot, awardsSnap] = await Promise.all([
        db.collection(USERS_COLLECTION).doc(scope.userId).get(),
        db.collection('Awards').where('userId', '==', scope.userId).get(),
      ]);
      const data = snapshot.exists ? sanitizeRecord({ id: snapshot.id, ...snapshot.data() }) : null;
      const awardDocs = awardsSnap.docs.map((d) => sanitizeRecord({ id: d.id, ...d.data() }));
      const item = data
        ? sanitizeRecord({
            id: data['id'],
            firstName: data['firstName'],
            lastName: data['lastName'],
            displayName: data['displayName'],
            aboutMe: data['aboutMe'],
            height: data['height'],
            weight: data['weight'],
            classOf: data['classOf'],
            school: data['school'],
            academics: data['academics'],
            sportInfo: data['sportInfo'],
            team: data['team'],
            coach: data['coach'],
            awards: awardDocs.length > 0 ? awardDocs : (data['awards'] ?? []),
            teamHistory: data['teamHistory'],
            profileImgs: data['profileImgs'],
            city: data['city'],
            state: data['state'],
            country: data['country'],
            updatedAt: data['updatedAt'],
          })
        : null;

      return {
        view: 'user_profile_snapshot',
        count: item ? 1 : 0,
        items: item ? [item] : [],
      };
    },
  },
  user_timeline_feed: {
    metadata: {
      name: 'user_timeline_feed',
      title: 'User Timeline Feed',
      description:
        'Read timeline posts owned by the authenticated user. Useful for reviewing highlights, announcements, stats posts, and recently published content.',
      filterHelp: [
        'Supported filters: type, visibility, teamId, sportId.',
        'Use cursor to paginate older posts returned in descending createdAt order.',
      ],
      defaultLimit: DEFAULT_FIREBASE_VIEW_LIMIT,
      maxLimit: MAX_FIREBASE_VIEW_LIMIT,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      let query: Query = db.collection(POSTS_COLLECTION).where('userId', '==', scope.userId);

      const type = parseStringFilter(input, 'type');
      if (type) query = query.where('type', '==', type);

      const visibility = parseStringFilter(input, 'visibility');
      if (visibility) query = query.where('visibility', '==', visibility);

      const teamId = parseStringFilter(input, 'teamId');
      if (teamId) query = query.where('teamId', '==', teamId);

      const sportId = parseStringFilter(input, 'sportId');
      if (sportId) query = query.where('sportId', '==', sportId);

      const cursor = parseTimestampCursor(input);
      query = query.orderBy('createdAt', 'desc');
      if (cursor) query = query.where('createdAt', '<', cursor);

      const items = await queryDocuments(query, limit);
      const redactedItems = items.map((item) =>
        sanitizeRecord({
          ...pickFields(item, [
            'id',
            'userId',
            'content',
            'type',
            'visibility',
            'teamId',
            'sportId',
            'images',
            'videoUrl',
            'hashtags',
            'mentions',
            'stats',
            'title',
            'createdAt',
            'updatedAt',
          ]),
          videoUrl: item['videoUrl'] ?? item['mediaUrl'],
        })
      );

      return {
        view: 'user_timeline_feed',
        count: redactedItems.length,
        items: redactedItems,
        nextCursor:
          redactedItems.length === limit ? createdAtCursor(redactedItems, 'createdAt') : undefined,
        appliedFilters: input.filters,
      };
    },
  },
  user_schedule_events: {
    metadata: {
      name: 'user_schedule_events',
      title: 'User Schedule Events',
      description:
        'Read calendar events for the authenticated user, including games, practices, camps, and travel. Use this for schedule coordination and planning.',
      filterHelp: [
        'Supported filters: sport, eventType, fromDate, toDate.',
        'Use cursor to paginate older events returned in descending date order.',
      ],
      defaultLimit: DEFAULT_FIREBASE_VIEW_LIMIT,
      maxLimit: MAX_FIREBASE_VIEW_LIMIT,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      let query: Query = db
        .collection(EVENTS_COLLECTION)
        .where('userId', '==', scope.userId)
        .where('ownerType', '==', 'user');

      const sport = parseStringFilter(input, 'sport');
      if (sport) query = query.where('sport', '==', sport);

      const eventType = parseStringFilter(input, 'eventType');
      if (eventType) query = query.where('eventType', '==', eventType);

      const fromDate = parseStringFilter(input, 'fromDate');
      if (fromDate) query = query.where('date', '>=', fromDate);

      const toDate = parseStringFilter(input, 'toDate');
      if (toDate) query = query.where('date', '<=', toDate);

      const cursor = parseIsoCursor(input);
      query = query.orderBy('date', 'desc');
      if (cursor) query = query.where('date', '<', cursor);

      const items = await queryDocuments(query, limit);
      const redactedItems = items.map((item) =>
        pickFields(item, [
          'id',
          'userId',
          'ownerType',
          'sport',
          'eventType',
          'title',
          'date',
          'endDate',
          'opponent',
          'location',
          'result',
          'source',
          'createdAt',
          'updatedAt',
        ])
      );

      return {
        view: 'user_schedule_events',
        count: redactedItems.length,
        items: redactedItems,
        nextCursor:
          redactedItems.length === limit ? createdAtCursor(redactedItems, 'date') : undefined,
        appliedFilters: input.filters,
      };
    },
  },
  user_recruiting_status: {
    metadata: {
      name: 'user_recruiting_status',
      title: 'User Recruiting Status',
      description:
        'Read recruiting activity around the authenticated user such as offers, interest, visits, and commitments.',
      filterHelp: [
        'Supported filters: sport, category, division, scholarshipType.',
        'Use cursor to paginate older recruiting records returned in descending date order.',
      ],
      defaultLimit: DEFAULT_FIREBASE_VIEW_LIMIT,
      maxLimit: MAX_FIREBASE_VIEW_LIMIT,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      let query: Query = db
        .collection(RECRUITING_COLLECTION)
        .where('userId', '==', scope.userId)
        .where('ownerType', '==', 'user');

      const sport = parseStringFilter(input, 'sport');
      if (sport) query = query.where('sport', '==', sport);

      const category = parseStringFilter(input, 'category');
      if (category) query = query.where('category', '==', category);

      const division = parseStringFilter(input, 'division');
      if (division) query = query.where('division', '==', division);

      const scholarshipType = parseStringFilter(input, 'scholarshipType');
      if (scholarshipType) query = query.where('scholarshipType', '==', scholarshipType);

      const cursor = parseIsoCursor(input);
      query = query.orderBy('date', 'desc');
      if (cursor) query = query.where('date', '<', cursor);

      const items = await queryDocuments(query, limit);
      const redactedItems = items.map((item) =>
        pickFields(item, [
          'id',
          'userId',
          'ownerType',
          'sport',
          'category',
          'collegeName',
          'division',
          'conference',
          'scholarshipType',
          'coachName',
          'coachEmail',
          'date',
          'source',
          'createdAt',
          'updatedAt',
        ])
      );

      return {
        view: 'user_recruiting_status',
        count: redactedItems.length,
        items: redactedItems,
        nextCursor:
          redactedItems.length === limit ? createdAtCursor(redactedItems, 'date') : undefined,
        appliedFilters: input.filters,
      };
    },
  },
  user_season_stats: {
    metadata: {
      name: 'user_season_stats',
      title: 'User Season Stats',
      description:
        'Read structured season stats and game logs for the authenticated user. Best for performance analysis and verified stat summaries.',
      filterHelp: [
        'Supported filters: sportId, season, category.',
        'If season is omitted, the server returns up to the most recent matching documents.',
      ],
      defaultLimit: 5,
      maxLimit: 10,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      let query: Query = db.collection(PLAYER_STATS_COLLECTION).where('userId', '==', scope.userId);

      const sportId = parseStringFilter(input, 'sportId');
      if (sportId) query = query.where('sportId', '==', sportId);

      const season = parseStringFilter(input, 'season');
      if (season) query = query.where('season', '==', season);

      const category = parseStringFilter(input, 'category');
      if (category) query = query.where('category', '==', category);

      query = query.orderBy('season', 'desc');
      const items = await queryDocuments(query, limit);
      const redactedItems = items.map((item) =>
        pickFields(item, [
          'id',
          'userId',
          'sportId',
          'season',
          'category',
          'columns',
          'stats',
          'totals',
          'averages',
          'games',
          'gameLogs',
          'source',
          'updatedAt',
        ])
      );

      return {
        view: 'user_season_stats',
        count: redactedItems.length,
        items: redactedItems,
        appliedFilters: input.filters,
      };
    },
  },
  user_physical_metrics: {
    metadata: {
      name: 'user_physical_metrics',
      title: 'User Physical Metrics',
      description:
        'Read physical and combine metrics for the authenticated user, such as forty time, shuttle, vertical, bench, and position-specific testing.',
      filterHelp: ['Supported filters: sportId, category, field.'],
      defaultLimit: 15,
      maxLimit: MAX_FIREBASE_VIEW_LIMIT,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      let query: Query = db
        .collection(PLAYER_METRICS_COLLECTION)
        .where('userId', '==', scope.userId);

      const sportId = parseStringFilter(input, 'sportId');
      if (sportId) query = query.where('sportId', '==', sportId);

      const category = parseStringFilter(input, 'category');
      if (category) query = query.where('category', '==', category);

      const field = parseStringFilter(input, 'field');
      if (field) query = query.where('field', '==', field);

      query = query.orderBy('dateRecorded', 'desc');
      const items = await queryDocuments(query, limit);
      const redactedItems = items.map((item) =>
        pickFields(item, [
          'id',
          'userId',
          'sportId',
          'field',
          'label',
          'value',
          'unit',
          'category',
          'dateRecorded',
          'source',
          'updatedAt',
        ])
      );

      return {
        view: 'user_physical_metrics',
        count: redactedItems.length,
        items: redactedItems,
        appliedFilters: input.filters,
      };
    },
  },
  user_team_membership: {
    metadata: {
      name: 'user_team_membership',
      title: 'User Team Membership',
      description:
        "Read the authenticated user's roster membership and hydrate associated team records. Useful for team context, roles, and organization linkage.",
      filterHelp: ['Supported filters: sport, status.'],
      defaultLimit: 10,
      maxLimit: 20,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      let query: Query = db
        .collection(ROSTER_ENTRIES_COLLECTION)
        .where('userId', '==', scope.userId);

      const sport = parseStringFilter(input, 'sport');
      if (sport) query = query.where('sport', '==', sport);

      const status = parseStringFilter(input, 'status');
      if (status) query = query.where('status', '==', status);

      const rosterEntries = await queryDocuments(query, limit);
      const items = await buildRosterItems(db, rosterEntries);

      return {
        view: 'user_team_membership',
        count: items.length,
        items,
        appliedFilters: input.filters,
      };
    },
  },
  user_highlight_videos: {
    metadata: {
      name: 'user_highlight_videos',
      title: 'User Highlight Videos',
      description:
        'Read highlight video posts owned by the authenticated user. Useful for highlight review, sharing, and media operations.',
      filterHelp: [
        'Supported filters: sportId, visibility.',
        'Use cursor to paginate older highlight posts returned in descending createdAt order.',
      ],
      defaultLimit: DEFAULT_FIREBASE_VIEW_LIMIT,
      maxLimit: MAX_FIREBASE_VIEW_LIMIT,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      let query: Query = db
        .collection(POSTS_COLLECTION)
        .where('userId', '==', scope.userId)
        .where('type', '==', 'video');

      const sportId = parseStringFilter(input, 'sportId');
      if (sportId) query = query.where('sportId', '==', sportId);

      const visibility = parseStringFilter(input, 'visibility');
      if (visibility) query = query.where('visibility', '==', visibility);

      const cursor = parseTimestampCursor(input);
      query = query.orderBy('createdAt', 'desc');
      if (cursor) query = query.where('createdAt', '<', cursor);

      const items = await queryDocuments(query, limit);
      const redactedItems = await buildHighlightItems(db, items);

      return {
        view: 'user_highlight_videos',
        count: redactedItems.length,
        items: redactedItems,
        nextCursor:
          redactedItems.length === limit ? createdAtCursor(redactedItems, 'createdAt') : undefined,
        appliedFilters: input.filters,
      };
    },
  },
  user_active_goals: {
    metadata: {
      name: 'user_active_goals',
      title: 'User Active Goals',
      description:
        "Read the authenticated user's active Agent X goals. Use this to understand what the user is working toward before generating advice, playbooks, or outreach.",
      filterHelp: ['No filters. Returns all active goals for the authenticated user.'],
      defaultLimit: 10,
      maxLimit: 20,
    },
    async resolve(db, scope) {
      const userSnap = await db.collection(USERS_COLLECTION).doc(scope.userId).get();
      if (!userSnap.exists) {
        return { view: 'user_active_goals', count: 0, items: [] };
      }

      const rawGoals = (userSnap.data()?.['agentGoals'] ?? []) as Array<Record<string, unknown>>;
      const items = rawGoals.map((g) =>
        sanitizeRecord({
          id: g['id'],
          text: g['text'],
          category: g['category'],
          icon: g['icon'],
          createdAt: g['createdAt'],
        })
      );

      return { view: 'user_active_goals', count: items.length, items };
    },
  },

  user_goal_history: {
    metadata: {
      name: 'user_goal_history',
      title: 'User Goal History',
      description:
        "Read the authenticated user's goal history, including active and completed goals with their playbook cycle counts and progress metrics. " +
        'Use this to understand long-term goal progress, identify completed goals, and provide context-aware coaching.',
      filterHelp: [
        'Supported filters: isCompleted (true/false), category.',
        'Use cursor to paginate older records returned in descending lastSeenAt order.',
      ],
      defaultLimit: DEFAULT_FIREBASE_VIEW_LIMIT,
      maxLimit: 20,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      let query: Query = db
        .collection(USERS_COLLECTION)
        .doc(scope.userId)
        .collection('goal_history')
        .orderBy('lastSeenAt', 'desc');

      const isCompleted = input.filters?.['isCompleted'];
      if (typeof isCompleted === 'boolean') {
        query = query.where('isCompleted', '==', isCompleted);
      }

      const category = parseStringFilter(input, 'category');
      if (category) query = query.where('category', '==', category);

      const cursor = parseIsoCursor(input);
      if (cursor) query = query.where('lastSeenAt', '<', cursor);

      const items = await queryDocuments(query, limit);
      const redactedItems = items.map((item) =>
        pickFields(item, [
          'id',
          'text',
          'category',
          'icon',
          'playbookCount',
          'itemsTotal',
          'itemsCompleted',
          'isCompleted',
          'completedAt',
          'firstSeenAt',
          'lastSeenAt',
          'latestPlaybookId',
        ])
      );

      return {
        view: 'user_goal_history',
        count: redactedItems.length,
        items: redactedItems,
        nextCursor:
          redactedItems.length === limit ? createdAtCursor(redactedItems, 'lastSeenAt') : undefined,
        appliedFilters: input.filters,
      };
    },
  },

  user_current_playbook: {
    metadata: {
      name: 'user_current_playbook',
      title: 'User Current Playbook',
      description:
        "Read the authenticated user's most recent Agent X weekly playbook, including all task items with their status (pending, in-progress, complete, snoozed). " +
        'Use this to understand what tasks the user has been assigned, what they have completed, and what is still in progress this week.',
      filterHelp: ['No filters. Always returns the single most recent playbook.'],
      defaultLimit: 1,
      maxLimit: 1,
    },
    async resolve(db, scope) {
      const snap = await db
        .collection(USERS_COLLECTION)
        .doc(scope.userId)
        .collection('agent_playbooks')
        .orderBy('generatedAt', 'desc')
        .limit(1)
        .get();

      if (snap.empty) {
        return { view: 'user_current_playbook', count: 0, items: [] };
      }

      const doc = snap.docs[0];
      const data = doc.data();
      const rawItems = (data['items'] ?? []) as Array<Record<string, unknown>>;
      const rawGoals = (data['goals'] ?? []) as Array<Record<string, unknown>>;

      const playbook = sanitizeRecord({
        playbookId: doc.id,
        generatedAt: data['generatedAt'],
        role: data['role'],
        goals: rawGoals.map((g) =>
          sanitizeRecord({ id: g['id'], text: g['text'], category: g['category'] })
        ),
        items: rawItems.map((item) =>
          sanitizeRecord({
            id: item['id'],
            title: item['title'],
            description: item['description'],
            status: item['status'],
            actionType: item['actionType'],
            goalId: (item['goal'] as Record<string, unknown> | undefined)?.['id'],
            goalText: (item['goal'] as Record<string, unknown> | undefined)?.['text'],
          })
        ),
        summary: {
          total: rawItems.length,
          completed: rawItems.filter((i) => i['status'] === 'complete').length,
          snoozed: rawItems.filter((i) => i['status'] === 'snoozed').length,
          inProgress: rawItems.filter((i) => i['status'] === 'in-progress').length,
          pending: rawItems.filter((i) => i['status'] === 'pending').length,
        },
      });

      return { view: 'user_current_playbook', count: 1, items: [playbook] };
    },
  },

  team_profile_snapshot: {
    metadata: {
      name: 'team_profile_snapshot',
      title: 'Team Profile Snapshot',
      description:
        'Read accessible team profiles for the authenticated viewer, including branding, sport, and organization linkage.',
      filterHelp: [
        'Supported filters: teamId. Omit teamId to return every accessible team profile.',
      ],
      defaultLimit: 5,
      maxLimit: 20,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      const teamIds = resolveTeamIds(scope, input).slice(0, limit);
      const teamsById = await loadDocumentsById(db, TEAMS_COLLECTION, teamIds);

      const items = teamIds
        .map((teamId) => teamsById[teamId])
        .filter((team): team is PrimitiveRecord => Boolean(team))
        .map((team) =>
          pickFields(team, [
            'id',
            'name',
            'displayName',
            'teamName',
            'sport',
            'sportName',
            'teamType',
            'organizationId',
            'mascot',
            'conference',
            'division',
            'logoUrl',
            'primaryColor',
            'secondaryColor',
            'city',
            'state',
            'country',
            'slug',
            'isActive',
            'updatedAt',
          ])
        );

      return {
        view: 'team_profile_snapshot',
        count: items.length,
        items,
        appliedFilters: input.filters,
      };
    },
  },
  team_roster_members: {
    metadata: {
      name: 'team_roster_members',
      title: 'Team Roster Members',
      description:
        "Read roster members across the authenticated viewer's accessible teams, with linked member, team, and organization context.",
      filterHelp: [
        'Supported filters: teamId, sport, status, role, search.',
        'Omit teamId to search across all accessible teams.',
      ],
      defaultLimit: 15,
      maxLimit: 50,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      const teamIds = resolveTeamIds(scope, input);
      if (teamIds.length === 0) {
        return { view: 'team_roster_members', count: 0, items: [], appliedFilters: input.filters };
      }

      const sport = parseStringFilter(input, 'sport');
      const status = parseStringFilter(input, 'status');
      const role = parseStringFilter(input, 'role');
      const search = parseStringFilter(input, 'search');

      const rosterEntries = await queryAcrossIds(
        teamIds,
        (teamId) => {
          let query: Query = db.collection(ROSTER_ENTRIES_COLLECTION).where('teamId', '==', teamId);
          if (sport) query = query.where('sport', '==', sport);
          if (status) query = query.where('status', '==', status);
          if (role) query = query.where('role', '==', role);
          return query;
        },
        limit,
        'updatedAt'
      );

      const filteredRosterEntries = applySearchFilter(rosterEntries, search, ['displayName']);
      const items = (await buildRosterItems(db, filteredRosterEntries)).slice(0, limit);

      return {
        view: 'team_roster_members',
        count: items.length,
        items,
        appliedFilters: input.filters,
      };
    },
  },
  team_timeline_feed: {
    metadata: {
      name: 'team_timeline_feed',
      title: 'Team Timeline Feed',
      description:
        "Read timeline posts associated with the authenticated viewer's accessible teams. Useful for reviewing team announcements, highlight posts, stat updates, and published team content.",
      filterHelp: [
        'Supported filters: teamId, type, visibility, sportId.',
        'Omit teamId to search across all accessible teams.',
        'Use cursor to paginate older posts returned in descending createdAt order.',
      ],
      defaultLimit: DEFAULT_FIREBASE_VIEW_LIMIT,
      maxLimit: MAX_FIREBASE_VIEW_LIMIT,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      const teamIds = resolveTeamIds(scope, input);
      if (teamIds.length === 0) {
        return {
          view: 'team_timeline_feed',
          count: 0,
          items: [],
          appliedFilters: input.filters,
        };
      }

      const type = parseStringFilter(input, 'type');
      const visibility = parseStringFilter(input, 'visibility');
      const sportId = parseStringFilter(input, 'sportId');
      const cursor = parseTimestampCursor(input);

      const posts = await queryAcrossIds(
        teamIds,
        (teamId) => {
          let query: Query = db.collection(POSTS_COLLECTION).where('teamId', '==', teamId);
          if (type) query = query.where('type', '==', type);
          if (visibility) query = query.where('visibility', '==', visibility);
          if (sportId) query = query.where('sportId', '==', sportId);
          query = query.orderBy('createdAt', 'desc');
          if (cursor) query = query.where('createdAt', '<', cursor);
          return query;
        },
        limit,
        'createdAt'
      );

      const redactedItems = posts.map((item) =>
        sanitizeRecord({
          ...pickFields(item, [
            'id',
            'userId',
            'teamId',
            'content',
            'type',
            'visibility',
            'sportId',
            'images',
            'videoUrl',
            'hashtags',
            'mentions',
            'stats',
            'title',
            'createdAt',
            'updatedAt',
          ]),
          videoUrl: item['videoUrl'] ?? item['mediaUrl'],
        })
      );

      return {
        view: 'team_timeline_feed',
        count: redactedItems.length,
        items: redactedItems,
        nextCursor:
          redactedItems.length === limit ? createdAtCursor(redactedItems, 'createdAt') : undefined,
        appliedFilters: input.filters,
      };
    },
  },
  team_highlight_videos: {
    metadata: {
      name: 'team_highlight_videos',
      title: 'Team Highlight Videos',
      description: "Read highlight posts attached to the authenticated viewer's accessible teams.",
      filterHelp: [
        'Supported filters: teamId, sportId, visibility.',
        'Use cursor to paginate older highlights returned in descending createdAt order.',
      ],
      defaultLimit: DEFAULT_FIREBASE_VIEW_LIMIT,
      maxLimit: MAX_FIREBASE_VIEW_LIMIT,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      const teamIds = resolveTeamIds(scope, input);
      if (teamIds.length === 0) {
        return {
          view: 'team_highlight_videos',
          count: 0,
          items: [],
          appliedFilters: input.filters,
        };
      }

      const sportId = parseStringFilter(input, 'sportId');
      const visibility = parseStringFilter(input, 'visibility');
      const cursor = parseTimestampCursor(input);

      const posts = await queryAcrossIds(
        teamIds,
        (teamId) => {
          let query: Query = db
            .collection(POSTS_COLLECTION)
            .where('teamId', '==', teamId)
            .where('type', '==', 'video');
          if (sportId) query = query.where('sportId', '==', sportId);
          if (visibility) query = query.where('visibility', '==', visibility);
          query = query.orderBy('createdAt', 'desc');
          if (cursor) query = query.where('createdAt', '<', cursor);
          return query;
        },
        limit,
        'createdAt'
      );

      const items = await buildHighlightItems(db, posts);
      return {
        view: 'team_highlight_videos',
        count: items.length,
        items,
        nextCursor: items.length === limit ? createdAtCursor(items, 'createdAt') : undefined,
        appliedFilters: input.filters,
      };
    },
  },
  organization_profile_snapshot: {
    metadata: {
      name: 'organization_profile_snapshot',
      title: 'Organization Profile Snapshot',
      description:
        'Read accessible organization profiles for the authenticated viewer, including branding and status.',
      filterHelp: [
        'Supported filters: organizationId. Omit organizationId to return every accessible organization profile.',
      ],
      defaultLimit: 5,
      maxLimit: 20,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      const organizationIds = resolveOrganizationIds(scope, input).slice(0, limit);
      const organizationsById = await loadDocumentsById(
        db,
        ORGANIZATIONS_COLLECTION,
        organizationIds
      );

      const items = organizationIds
        .map((organizationId) => organizationsById[organizationId])
        .filter((organization): organization is PrimitiveRecord => Boolean(organization))
        .map((organization) =>
          pickFields(organization, [
            'id',
            'name',
            'type',
            'status',
            'logoUrl',
            'primaryColor',
            'secondaryColor',
            'mascot',
            'location',
            'teamCount',
            'updatedAt',
          ])
        );

      return {
        view: 'organization_profile_snapshot',
        count: items.length,
        items,
        appliedFilters: input.filters,
      };
    },
  },
  organization_roster_members: {
    metadata: {
      name: 'organization_roster_members',
      title: 'Organization Roster Members',
      description:
        "Read roster members across the authenticated viewer's accessible organizations, with linked member, team, and organization context.",
      filterHelp: [
        'Supported filters: organizationId, sport, status, role, search.',
        'Omit organizationId to search across all accessible organizations.',
      ],
      defaultLimit: 20,
      maxLimit: 50,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      const organizationIds = resolveOrganizationIds(scope, input);
      if (organizationIds.length === 0) {
        return {
          view: 'organization_roster_members',
          count: 0,
          items: [],
          appliedFilters: input.filters,
        };
      }

      const sport = parseStringFilter(input, 'sport');
      const status = parseStringFilter(input, 'status');
      const role = parseStringFilter(input, 'role');
      const search = parseStringFilter(input, 'search');

      const rosterEntries = await queryAcrossIds(
        organizationIds,
        (organizationId) => {
          let query: Query = db
            .collection(ROSTER_ENTRIES_COLLECTION)
            .where('organizationId', '==', organizationId);
          if (sport) query = query.where('sport', '==', sport);
          if (status) query = query.where('status', '==', status);
          if (role) query = query.where('role', '==', role);
          return query;
        },
        limit,
        'updatedAt'
      );

      const filteredRosterEntries = applySearchFilter(rosterEntries, search, ['displayName']);
      const items = (await buildRosterItems(db, filteredRosterEntries)).slice(0, limit);

      return {
        view: 'organization_roster_members',
        count: items.length,
        items,
        appliedFilters: input.filters,
      };
    },
  },
  organization_highlight_videos: {
    metadata: {
      name: 'organization_highlight_videos',
      title: 'Organization Highlight Videos',
      description:
        "Read highlight posts attached to the authenticated viewer's accessible organizations.",
      filterHelp: [
        'Supported filters: organizationId, sportId, visibility.',
        'Use cursor to paginate older highlights returned in descending createdAt order.',
      ],
      defaultLimit: DEFAULT_FIREBASE_VIEW_LIMIT,
      maxLimit: MAX_FIREBASE_VIEW_LIMIT,
    },
    async resolve(db, scope, input) {
      const limit = limitFor(input, this.metadata);
      const organizationIds = resolveOrganizationIds(scope, input);
      if (organizationIds.length === 0) {
        return {
          view: 'organization_highlight_videos',
          count: 0,
          items: [],
          appliedFilters: input.filters,
        };
      }

      const sportId = parseStringFilter(input, 'sportId');
      const visibility = parseStringFilter(input, 'visibility');
      const cursor = parseTimestampCursor(input);

      const posts = await queryAcrossIds(
        organizationIds,
        (organizationId) => {
          let query: Query = db
            .collection(POSTS_COLLECTION)
            .where('organizationId', '==', organizationId)
            .where('type', '==', 'video');
          if (sportId) query = query.where('sportId', '==', sportId);
          if (visibility) query = query.where('visibility', '==', visibility);
          query = query.orderBy('createdAt', 'desc');
          if (cursor) query = query.where('createdAt', '<', cursor);
          return query;
        },
        limit,
        'createdAt'
      );

      const items = await buildHighlightItems(db, posts);
      return {
        view: 'organization_highlight_videos',
        count: items.length,
        items,
        nextCursor: items.length === limit ? createdAtCursor(items, 'createdAt') : undefined,
        appliedFilters: input.filters,
      };
    },
  },
};

export function listFirebaseViewMetadata(): readonly FirebaseMcpViewMetadata[] {
  return Object.values(VIEW_DEFINITIONS).map((definition) => definition.metadata);
}

export async function executeFirebaseViewQuery(
  db: Firestore,
  scope: FirebaseMcpScope,
  input: FirebaseMcpQueryInput
): Promise<FirebaseMcpQueryResult> {
  const definition = VIEW_DEFINITIONS[input.view];
  if (!definition) {
    throw new Error(`Unsupported Firebase MCP view: ${input.view}`);
  }

  return definition.resolve(db, scope, input);
}
