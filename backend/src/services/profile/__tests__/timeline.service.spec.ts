import { describe, expect, it } from 'vitest';
import type { FeedAuthor } from '@nxt1/core/posts';
import { TimelineService } from '../timeline.service.js';

type MockDoc = {
  readonly id: string;
  readonly data: () => Record<string, unknown>;
};

type QueryState = {
  readonly rows: readonly MockDoc[];
  readonly filters?: ReadonlyArray<{ field: string; op: string; value: unknown }>;
  readonly orderByField?: string;
  readonly orderByDirection?: 'asc' | 'desc';
  readonly limitCount?: number;
};

function valueToComparable(value: unknown): number | string {
  if (value && typeof value === 'object' && 'toDate' in value) {
    return (value as { toDate(): Date }).toDate().getTime();
  }

  if (typeof value === 'string') {
    const asDate = Date.parse(value);
    return Number.isNaN(asDate) ? value : asDate;
  }

  if (typeof value === 'number') {
    return value;
  }

  return String(value ?? '');
}

function buildQuery(state: QueryState) {
  return {
    where(field: string, op: string, value: unknown) {
      return buildQuery({
        ...state,
        filters: [...(state.filters ?? []), { field, op, value }],
      });
    },
    select(..._fields: string[]) {
      return buildQuery(state);
    },
    orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
      return buildQuery({
        ...state,
        orderByField: field,
        orderByDirection: direction,
      });
    },
    limit(count: number) {
      return buildQuery({
        ...state,
        limitCount: count,
      });
    },
    startAfter(_: unknown) {
      return buildQuery(state);
    },
    async get() {
      let docs = [...state.rows];

      for (const filter of state.filters ?? []) {
        docs = docs.filter((doc) => {
          const value = doc.data()[filter.field];
          if (filter.op === '==') {
            return value === filter.value;
          }
          if (filter.op === 'in' && Array.isArray(filter.value)) {
            return filter.value.includes(value);
          }
          if (filter.op === '<') {
            return valueToComparable(value) < valueToComparable(filter.value);
          }
          return true;
        });
      }

      if (state.orderByField) {
        const direction = state.orderByDirection === 'asc' ? 1 : -1;
        docs.sort((left, right) => {
          const leftValue = valueToComparable(left.data()[state.orderByField!]);
          const rightValue = valueToComparable(right.data()[state.orderByField!]);
          if (leftValue < rightValue) return -1 * direction;
          if (leftValue > rightValue) return 1 * direction;
          return 0;
        });
      }

      if (state.limitCount !== undefined) {
        docs = docs.slice(0, state.limitCount);
      }

      return { docs, empty: docs.length === 0 };
    },
  };
}

function createMockDb(datasets: Record<string, readonly MockDoc[]>) {
  return {
    collection(name: string) {
      const rows = datasets[name] ?? [];
      const query = buildQuery({ rows });
      return {
        ...query,
        doc(id: string) {
          return { id, collection: name };
        },
      };
    },
    getAll(..._refs: unknown[]) {
      // Return empty snapshots — engagement enrichment is optional
      return Promise.resolve([]);
    },
  };
}

const author: FeedAuthor = {
  uid: 'athlete-1',
  profileCode: '123456',
  displayName: 'Jordan Miles',
  firstName: 'Jordan',
  lastName: 'Miles',
  role: 'athlete',
  verificationStatus: 'verified',
  isVerified: true,
  sport: 'football',
};

describe('TimelineService', () => {
  it('excludes unresolved Cloudflare videos from the profile timeline until they are ready', async () => {
    const db = createMockDb({
      Posts: [
        {
          id: 'post-video-inprogress',
          data: () => ({
            userId: 'athlete-1',
            type: 'video',
            sportId: 'football',
            content: 'Pending video',
            cloudflareVideoId: 'cf-pending-1',
            cloudflareStatus: 'inprogress',
            readyToStream: false,
            createdAt: '2026-04-12T12:00:00.000Z',
            updatedAt: '2026-04-12T12:00:00.000Z',
          }),
        },
        {
          id: 'post-video-ready',
          data: () => ({
            userId: 'athlete-1',
            type: 'video',
            sportId: 'football',
            content: 'Ready video',
            cloudflareVideoId: 'cf-ready-1',
            cloudflareStatus: 'ready',
            readyToStream: true,
            mediaUrl: 'https://customer-123.cloudflarestream.com/cf-ready-1/iframe',
            createdAt: '2026-04-11T12:00:00.000Z',
            updatedAt: '2026-04-11T12:00:00.000Z',
          }),
        },
      ],
      Events: [],
      PlayerStats: [],
      Recruiting: [],
      PlayerMetrics: [],
      Rankings: [],
    });

    const service = new TimelineService(db as never);
    const result = await service.getProfileTimeline('athlete-1', author, {
      limit: 20,
      sportId: 'football',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('post-video-ready');
  });

  it('excludes unresolved Cloudflare videos from the team timeline until they are ready', async () => {
    const db = createMockDb({
      Teams: [
        {
          id: 'team-1',
          data: () => ({
            teamCode: 'TEAM01',
            teamName: 'Argyle Eagles',
            teamType: 'high-school',
            sport: 'football',
            isActive: true,
            createdAt: '2026-04-01T12:00:00.000Z',
            updatedAt: '2026-04-01T12:00:00.000Z',
          }),
        },
      ],
      Posts: [
        {
          id: 'team-video-inprogress',
          data: () => ({
            teamId: 'team-1',
            userId: 'athlete-1',
            type: 'video',
            content: 'Pending team video',
            cloudflareVideoId: 'cf-team-pending-1',
            cloudflareStatus: 'inprogress',
            readyToStream: false,
            createdAt: '2026-04-13T12:00:00.000Z',
            updatedAt: '2026-04-13T12:00:00.000Z',
          }),
        },
        {
          id: 'team-video-ready',
          data: () => ({
            teamId: 'team-1',
            userId: 'athlete-1',
            type: 'video',
            content: 'Ready team video',
            cloudflareVideoId: 'cf-team-ready-1',
            cloudflareStatus: 'ready',
            readyToStream: true,
            mediaUrl: 'https://customer-123.cloudflarestream.com/cf-team-ready-1/iframe',
            createdAt: '2026-04-12T12:00:00.000Z',
            updatedAt: '2026-04-12T12:00:00.000Z',
          }),
        },
      ],
      Schedule: [],
      TeamStats: [],
      News: [],
      RosterEntries: [],
      Recruiting: [],
    });

    const service = new TimelineService(db as never);
    const result = await service.getTeamTimeline('TEAM01', {
      limit: 20,
      filter: 'media',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('team-video-ready');
  });

  it('assembles recruiting, metrics, and rankings into the polymorphic timeline', async () => {
    const db = createMockDb({
      Posts: [],
      Events: [],
      PlayerStats: [],
      Recruiting: [
        {
          id: 'recruit-offer',
          data: () => ({
            userId: 'athlete-1',
            ownerType: 'user',
            category: 'offer',
            collegeName: 'Alabama',
            collegeLogoUrl: 'https://cdn.test/alabama.png',
            division: 'D1',
            conference: 'SEC',
            sport: 'football',
            scholarshipType: 'full',
            date: '2026-04-10T12:00:00.000Z',
          }),
        },
        {
          id: 'recruit-commitment',
          data: () => ({
            userId: 'athlete-1',
            ownerType: 'user',
            category: 'commitment',
            collegeName: 'Texas',
            collegeLogoUrl: 'https://cdn.test/texas.png',
            division: 'D1',
            sport: 'football',
            commitmentStatus: 'signed',
            announcedAt: '2026-04-09T12:00:00.000Z',
            date: '2026-04-09T10:00:00.000Z',
          }),
        },
        {
          id: 'recruit-visit',
          data: () => ({
            userId: 'athlete-1',
            ownerType: 'user',
            category: 'visit',
            collegeName: 'Georgia',
            collegeLogoUrl: 'https://cdn.test/georgia.png',
            sport: 'football',
            visitType: 'official',
            date: '2026-04-08T09:00:00.000Z',
          }),
        },
        {
          id: 'recruit-camp',
          data: () => ({
            userId: 'athlete-1',
            ownerType: 'user',
            category: 'camp',
            collegeName: 'LSU',
            collegeLogoUrl: 'https://cdn.test/lsu.png',
            sport: 'football',
            date: '2026-04-07T09:00:00.000Z',
          }),
        },
      ],
      PlayerMetrics: [
        {
          id: 'metric-forty',
          data: () => ({
            userId: 'athlete-1',
            sportId: 'football',
            label: '40-Yard Dash',
            field: '40_yard_dash',
            value: 4.52,
            unit: 's',
            category: 'combine results',
            source: 'combine',
            verifiedBy: 'NXT1 Combine',
            verified: true,
            dateRecorded: '2026-04-06T08:00:00.000Z',
          }),
        },
        {
          id: 'metric-vertical',
          data: () => ({
            userId: 'athlete-1',
            sportId: 'football',
            label: 'Vertical Jump',
            field: 'vertical_jump',
            value: 36,
            unit: 'in',
            category: 'combine results',
            source: 'combine',
            verifiedBy: 'NXT1 Combine',
            verified: true,
            dateRecorded: '2026-04-06T08:00:00.000Z',
          }),
        },
      ],
      Rankings: [
        {
          id: 'ranking-247',
          data: () => ({
            userId: 'athlete-1',
            sportId: 'football',
            name: '247Sports',
            nationalRank: 31,
            stateRank: 3,
            positionRank: 2,
            stars: 4,
            classOf: 2027,
            createdAt: '2026-04-05T12:00:00.000Z',
            updatedAt: '2026-04-05T12:00:00.000Z',
          }),
        },
      ],
    });

    const service = new TimelineService(db as never);
    const result = await service.getProfileTimeline('athlete-1', author, {
      limit: 20,
      sportId: 'football',
    });

    expect(result.success).toBe(true);
    expect(result.data.map((item) => item.feedType)).toEqual([
      'OFFER',
      'COMMITMENT',
      'VISIT',
      'CAMP',
      'METRIC',
      'AWARD',
    ]);

    const offer = result.data[0];
    expect(offer?.feedType).toBe('OFFER');
    if (offer?.feedType === 'OFFER') {
      expect(offer.offerData.collegeName).toBe('Alabama');
      expect(offer.offerData.offerType).toBe('scholarship');
    }

    const commitment = result.data[1];
    expect(commitment?.feedType).toBe('COMMITMENT');
    if (commitment?.feedType === 'COMMITMENT') {
      expect(commitment.commitmentData.collegeName).toBe('Texas');
      expect(commitment.commitmentData.isSigned).toBe(true);
    }

    const metrics = result.data[4];
    expect(metrics?.feedType).toBe('METRIC');
    if (metrics?.feedType === 'METRIC') {
      expect(metrics.metricsData.source).toBe('NXT1 Combine');
      expect(metrics.metricsData.metrics).toHaveLength(2);
    }

    const ranking = result.data[5];
    expect(ranking?.feedType).toBe('AWARD');
    if (ranking?.feedType === 'AWARD') {
      expect(ranking.awardData.organization).toBe('247Sports');
      expect(ranking.awardData.awardName).toContain('Nat #31');
    }
  });

  it('uses canonical roster userId for team recruiting fan-out with legacy playerId fallback', async () => {
    const db = createMockDb({
      Teams: [
        {
          id: 'team-1',
          data: () => ({
            teamCode: 'TEAM01',
            teamName: 'Argyle Eagles',
            teamType: 'high-school',
            sport: 'basketball',
            isActive: true,
            createdAt: '2026-04-01T12:00:00.000Z',
            updatedAt: '2026-04-01T12:00:00.000Z',
          }),
        },
      ],
      Posts: [],
      Schedule: [],
      TeamStats: [],
      News: [],
      RosterEntries: [
        {
          id: 'roster-1',
          data: () => ({
            teamId: 'team-1',
            userId: 'athlete-canonical',
            playerId: 'athlete-legacy-copy',
            status: 'active',
          }),
        },
        {
          id: 'roster-2',
          data: () => ({
            teamId: 'team-1',
            playerId: 'athlete-legacy-only',
            status: 'ghost',
          }),
        },
      ],
      Recruiting: [
        {
          id: 'offer-canonical',
          data: () => ({
            userId: 'athlete-canonical',
            ownerType: 'user',
            category: 'offer',
            collegeName: 'UConn',
            sport: 'basketball',
            date: '2026-04-10T12:00:00.000Z',
          }),
        },
        {
          id: 'offer-legacy',
          data: () => ({
            userId: 'athlete-legacy-only',
            ownerType: 'user',
            category: 'offer',
            collegeName: 'Duke',
            sport: 'basketball',
            date: '2026-04-09T12:00:00.000Z',
          }),
        },
      ],
    });

    const service = new TimelineService(db as never);
    const result = await service.getTeamTimeline('TEAM01', {
      limit: 10,
      filter: 'recruiting',
      sportId: 'basketball',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data.every((item) => item.feedType === 'OFFER')).toBe(true);
    expect(
      result.data
        .filter((item) => item.feedType === 'OFFER')
        .map((item) => (item.feedType === 'OFFER' ? item.offerData.collegeName : null))
    ).toEqual(['UConn', 'Duke']);
  });
});
