import { logger } from '../../utils/logger.js';

const CLOUDFLARE_GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const MAX_GRAPHQL_LIMIT = 2000;

const PLAYBACK_EVENTS_QUERY = `
query VideoPlaybackEvents(
  $accountTag: string!
  $start: Date
  $end: Date
  $uId: string
  $limit: uint64
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      videoPlaybackEventsAdaptiveGroups(
        filter: { date_geq: $start, date_lt: $end, uid_gt: $uId }
        orderBy: [uid_ASC]
        limit: $limit
      ) {
        count
        sum {
          timeViewedMinutes
        }
        dimensions {
          uid
          clientCountryName
        }
      }
    }
  }
}
`;

const DELIVERY_MINUTES_QUERY = `
query StreamDeliveryMinutes($accountTag: string!, $start: Date, $end: Date, $limit: uint64) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      streamMinutesViewedAdaptiveGroups(
        filter: { date_geq: $start, date_lt: $end }
        orderBy: [sum_minutesViewed_DESC]
        limit: $limit
      ) {
        sum {
          minutesViewed
        }
        dimensions {
          uid
          clientCountryName
        }
      }
    }
  }
}
`;

type GraphQLError = {
  readonly message?: string;
};

type PlaybackGroupRow = {
  readonly count?: unknown;
  readonly sum?: {
    readonly timeViewedMinutes?: unknown;
  };
  readonly dimensions?: {
    readonly uid?: unknown;
    readonly clientCountryName?: unknown;
  };
};

type MinutesGroupRow = {
  readonly sum?: {
    readonly minutesViewed?: unknown;
  };
  readonly dimensions?: {
    readonly uid?: unknown;
    readonly clientCountryName?: unknown;
  };
};

type PlaybackGraphQLResponse = {
  readonly data?: {
    readonly viewer?: {
      readonly accounts?: Array<{
        readonly videoPlaybackEventsAdaptiveGroups?: PlaybackGroupRow[];
      }>;
    };
  };
  readonly errors?: GraphQLError[];
};

type MinutesGraphQLResponse = {
  readonly data?: {
    readonly viewer?: {
      readonly accounts?: Array<{
        readonly streamMinutesViewedAdaptiveGroups?: MinutesGroupRow[];
      }>;
    };
  };
  readonly errors?: GraphQLError[];
};

export type CountryVideoAnalytics = {
  readonly playCount: number;
  readonly playbackMinutesViewed: number;
  readonly deliveryMinutesViewed: number;
};

export type CloudflareVideoAnalyticsRecord = {
  readonly videoUid: string;
  readonly playCount: number;
  readonly playbackMinutesViewed: number;
  readonly deliveryMinutesViewed: number;
  readonly byCountry: Record<string, CountryVideoAnalytics>;
};

function parseNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export class CloudflareAnalyticsService {
  constructor(
    private readonly accountId: string = process.env['CLOUDFLARE_ACCOUNT_ID'] ?? '',
    private readonly apiToken: string = process.env['CLOUDFLARE_API_TOKEN'] ?? ''
  ) {}

  async fetchVideoAnalyticsWindow(
    since: Date,
    until: Date = new Date()
  ): Promise<Map<string, CloudflareVideoAnalyticsRecord>> {
    if (!this.accountId || !this.apiToken) {
      throw new Error(
        'Cloudflare analytics sync requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN'
      );
    }

    const results = new Map<string, CloudflareVideoAnalyticsRecord>();
    const playbackRows = await this.fetchPlaybackRows(since, until);
    const minutesRows = await this.fetchDeliveryMinuteRows(since, until);

    for (const row of playbackRows) {
      const uid = typeof row.dimensions?.uid === 'string' ? row.dimensions.uid.trim() : '';
      if (!uid) continue;

      const countryRaw =
        typeof row.dimensions?.clientCountryName === 'string'
          ? row.dimensions.clientCountryName.trim().toUpperCase()
          : '';
      const country = countryRaw || 'UNKNOWN';
      const playCount = Math.max(0, parseNumber(row.count));
      const playbackMinutesViewed = Math.max(0, parseNumber(row.sum?.timeViewedMinutes));

      const current = results.get(uid) ?? {
        videoUid: uid,
        playCount: 0,
        playbackMinutesViewed: 0,
        deliveryMinutesViewed: 0,
        byCountry: {},
      };

      const countryMetrics = current.byCountry[country] ?? {
        playCount: 0,
        playbackMinutesViewed: 0,
        deliveryMinutesViewed: 0,
      };

      current.byCountry[country] = {
        playCount: countryMetrics.playCount + playCount,
        playbackMinutesViewed: countryMetrics.playbackMinutesViewed + playbackMinutesViewed,
        deliveryMinutesViewed: countryMetrics.deliveryMinutesViewed,
      };

      results.set(uid, {
        ...current,
        playCount: current.playCount + playCount,
        playbackMinutesViewed: current.playbackMinutesViewed + playbackMinutesViewed,
      });
    }

    for (const row of minutesRows) {
      const uid = typeof row.dimensions?.uid === 'string' ? row.dimensions.uid.trim() : '';
      if (!uid) continue;

      const countryRaw =
        typeof row.dimensions?.clientCountryName === 'string'
          ? row.dimensions.clientCountryName.trim().toUpperCase()
          : '';
      const country = countryRaw || 'UNKNOWN';
      const deliveryMinutesViewed = Math.max(0, parseNumber(row.sum?.minutesViewed));

      const current = results.get(uid) ?? {
        videoUid: uid,
        playCount: 0,
        playbackMinutesViewed: 0,
        deliveryMinutesViewed: 0,
        byCountry: {},
      };

      const countryMetrics = current.byCountry[country] ?? {
        playCount: 0,
        playbackMinutesViewed: 0,
        deliveryMinutesViewed: 0,
      };

      current.byCountry[country] = {
        playCount: countryMetrics.playCount,
        playbackMinutesViewed: countryMetrics.playbackMinutesViewed,
        deliveryMinutesViewed: countryMetrics.deliveryMinutesViewed + deliveryMinutesViewed,
      };

      results.set(uid, {
        ...current,
        deliveryMinutesViewed: current.deliveryMinutesViewed + deliveryMinutesViewed,
      });
    }

    return results;
  }

  private async fetchPlaybackRows(since: Date, until: Date): Promise<PlaybackGroupRow[]> {
    const rows: PlaybackGroupRow[] = [];
    let uidCursor: string | null = null;

    while (true) {
      const body: PlaybackGraphQLResponse = await this.executeGraphql<PlaybackGraphQLResponse>(
        PLAYBACK_EVENTS_QUERY,
        {
          accountTag: this.accountId,
          start: toIsoDate(since),
          end: toIsoDate(until),
          uId: uidCursor,
          limit: MAX_GRAPHQL_LIMIT,
        }
      );

      const pageRows: PlaybackGroupRow[] =
        body.data?.viewer?.accounts?.[0]?.videoPlaybackEventsAdaptiveGroups?.filter(Boolean) ?? [];
      rows.push(...pageRows);

      if (pageRows.length < MAX_GRAPHQL_LIMIT) {
        break;
      }

      const lastUidRaw: unknown = pageRows[pageRows.length - 1]?.dimensions?.uid;
      const lastUid: string = typeof lastUidRaw === 'string' ? lastUidRaw.trim() : '';
      if (!lastUid) {
        break;
      }

      uidCursor = lastUid;
    }

    return rows;
  }

  private async fetchDeliveryMinuteRows(since: Date, until: Date): Promise<MinutesGroupRow[]> {
    const body = await this.executeGraphql<MinutesGraphQLResponse>(DELIVERY_MINUTES_QUERY, {
      accountTag: this.accountId,
      start: toIsoDate(since),
      end: toIsoDate(until),
      limit: MAX_GRAPHQL_LIMIT,
    });

    const rows = body.data?.viewer?.accounts?.[0]?.streamMinutesViewedAdaptiveGroups ?? [];
    if (rows.length === MAX_GRAPHQL_LIMIT) {
      logger.warn(
        'Cloudflare Stream delivery metrics returned max row limit; results may be truncated',
        {
          limit: MAX_GRAPHQL_LIMIT,
          since: toIsoDate(since),
          until: toIsoDate(until),
        }
      );
    }

    return rows;
  }

  private async executeGraphql<TResponse>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<TResponse> {
    const response = await fetch(CLOUDFLARE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown error');
      throw new Error(`Cloudflare GraphQL request failed (${response.status}): ${text}`);
    }

    const body = (await response.json()) as TResponse & { errors?: GraphQLError[] };
    if (Array.isArray(body.errors) && body.errors.length > 0) {
      const message = body.errors.map((error) => error.message ?? 'unknown').join('; ');
      throw new Error(`Cloudflare GraphQL returned errors: ${message}`);
    }

    return body as TResponse;
  }
}

let cloudflareAnalyticsService: CloudflareAnalyticsService | null = null;

export function getCloudflareAnalyticsService(): CloudflareAnalyticsService {
  cloudflareAnalyticsService ??= new CloudflareAnalyticsService();
  return cloudflareAnalyticsService;
}
