/**
 * @fileoverview Sync Diff Service — Deterministic Delta Engine
 * @module @nxt1/backend/modules/agent/sync
 *
 * Computes a structured, deterministic diff between the previous DB state
 * and the latest AI-extracted profile data from a daily background sync.
 *
 * This service uses pure structural comparison — NO AI involved.
 * The output `SyncDeltaReport` is a strongly-typed JSON payload that
 * Agent X reads to decide what proactive actions to take.
 *
 * Architecture:
 * ┌────────────────┐   ┌──────────────────┐
 * │ Previous State │   │ New Extracted     │
 * │ (from DB)      │   │ (from AI distill) │
 * └───────┬────────┘   └────────┬─────────┘
 *         │                     │
 *         ▼                     ▼
 * ┌─────────────────────────────────────────┐
 * │          SyncDiffService.diff()         │
 * │  • Identity field comparison            │
 * │  • Season stats structural diff         │
 * │  • Recruiting activity deduplication    │
 * │  • Award detection                      │
 * └────────────────┬────────────────────────┘
 *                  │
 *                  ▼
 *          SyncDeltaReport
 *   (isEmpty === true → Agent stays asleep)
 */

import type {
  SyncDeltaReport,
  SyncStatChange,
  SyncNewCategory,
  SyncNewScheduleEvent,
  SyncNewVideo,
} from '@nxt1/core';

import type {
  DistilledProfile,
  DistilledSeasonStats,
  DistilledIdentity,
  DistilledRecruitingActivity,
  DistilledAward,
  DistilledScheduleEvent,
  DistilledVideo,
  DistilledMetric,
} from '../tools/scraping/distillers/distiller.types.js';

// ─── Types for Previous State ───────────────────────────────────────────────

/**
 * Shape of the "previous state" fetched from the DB before the sync writes.
 * This mirrors what `write_season_stats` and `write_core_identity` store.
 */
export interface PreviousProfileState {
  readonly identity?: Record<string, unknown>;
  readonly academics?: Record<string, unknown>;
  readonly sportInfo?: Record<string, unknown>;
  readonly team?: Record<string, unknown>;
  readonly coach?: Record<string, unknown>;
  readonly metrics?: readonly Record<string, unknown>[];
  readonly seasonStats?: readonly PreviousSeasonEntry[];
  readonly recruiting?: readonly Record<string, unknown>[];
  readonly awards?: readonly Record<string, unknown>[];
  readonly schedule?: readonly PreviousScheduleEntry[];
  readonly videos?: readonly PreviousVideoEntry[];
}

export interface PreviousSeasonEntry {
  readonly season: string;
  readonly category: string;
  readonly columns?: readonly { key: string; label: string }[];
  readonly totals?: Record<string, string | number>;
  readonly averages?: Record<string, string | number>;
}

export interface PreviousScheduleEntry {
  readonly date: string;
  readonly opponent?: string;
  readonly sport?: string;
  readonly eventType?: string;
}

export interface PreviousVideoEntry {
  readonly src: string;
  readonly provider?: string;
  readonly videoId?: string;
}

// ─── Identity Fields to Track ───────────────────────────────────────────────

const TRACKED_IDENTITY_FIELDS: readonly string[] = [
  'firstName',
  'lastName',
  'displayName',
  'height',
  'weight',
  'classOf',
  'city',
  'state',
  'country',
  'profileImage',
  'aboutMe',
];

const TRACKED_ACADEMICS_FIELDS: readonly string[] = [
  'gpa',
  'weightedGpa',
  'satScore',
  'actScore',
  'classRank',
  'classSize',
  'intendedMajor',
];

const TRACKED_SPORT_INFO_FIELDS: readonly string[] = ['sport', 'jerseyNumber', 'side'];

// Team metadata is authoritative on the Team and Organization docs.
// The writer is responsible for building a direct-doc snapshot before diffing.
const TRACKED_TEAM_FIELDS: readonly string[] = [
  'name',
  'type',
  'mascot',
  'conference',
  'division',
  'logoUrl',
  'primaryColor',
  'secondaryColor',
  'city',
  'state',
  'country',
  'seasonRecord',
];

const TRACKED_COACH_FIELDS: readonly string[] = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'title',
];

// ─── Service ────────────────────────────────────────────────────────────────

export class SyncDiffService {
  /**
   * Compute a deterministic diff between previous DB state and new extraction.
   *
   * @param userId - The user this sync is for
   * @param sport - Sport key (e.g. "football")
   * @param source - Platform slug (e.g. "maxpreps")
   * @param previous - Existing state read from Firestore before any writes
   * @param extracted - Freshly AI-distilled profile from the scraper
   */
  diff(
    userId: string,
    sport: string,
    source: string,
    previous: PreviousProfileState,
    extracted: DistilledProfile
  ): SyncDeltaReport {
    const identityChanges = this.diffIdentity(previous.identity, extracted.identity);

    // Fold academics, sportInfo, team, coach into identityChanges
    // (field-level diffs — SyncDeltaReport has no separate slots for these)
    const academicsChanges = this.diffFieldSection(
      'academics',
      previous.academics,
      extracted.academics as Record<string, unknown> | undefined,
      TRACKED_ACADEMICS_FIELDS
    );
    const sportInfoChanges = this.diffFieldSection(
      'sportInfo',
      previous.sportInfo,
      extracted.sportInfo as Record<string, unknown> | undefined,
      TRACKED_SPORT_INFO_FIELDS
    );
    const teamChanges = this.diffFieldSection(
      'team',
      previous.team,
      extracted.team as Record<string, unknown> | undefined,
      TRACKED_TEAM_FIELDS
    );
    const coachChanges = this.diffFieldSection(
      'coach',
      previous.coach,
      extracted.coach as Record<string, unknown> | undefined,
      TRACKED_COACH_FIELDS
    );

    const allIdentityChanges = [
      ...identityChanges,
      ...academicsChanges,
      ...sportInfoChanges,
      ...teamChanges,
      ...coachChanges,
    ];

    const { newCategories, statChanges } = this.diffStats(
      previous.seasonStats ?? [],
      extracted.seasonStats ?? []
    );

    // Fold metrics into statChanges (conceptually similar)
    const metricChanges = this.diffMetrics(previous.metrics ?? [], extracted.metrics ?? []);
    const allStatChanges = [...statChanges, ...metricChanges];

    const newRecruitingActivities = this.diffRecruiting(
      previous.recruiting ?? [],
      extracted.recruiting ?? []
    );
    const newAwards = this.diffAwards(previous.awards ?? [], extracted.awards ?? []);
    const newScheduleEvents = this.diffSchedule(previous.schedule ?? [], extracted.schedule ?? []);
    const newVideos = this.diffVideos(previous.videos ?? [], extracted.videos ?? []);

    const totalChanges =
      allIdentityChanges.length +
      newCategories.length +
      allStatChanges.length +
      newRecruitingActivities.length +
      newAwards.length +
      newScheduleEvents.length +
      newVideos.length;

    return {
      userId,
      sport,
      source,
      syncedAt: new Date().toISOString(),
      isEmpty: totalChanges === 0,
      identityChanges: allIdentityChanges,
      newCategories,
      statChanges: allStatChanges,
      newRecruitingActivities,
      newAwards,
      newScheduleEvents,
      newVideos,
      summary: {
        identityFieldsChanged: allIdentityChanges.length,
        newCategoriesAdded: newCategories.length,
        statsUpdated: allStatChanges.length,
        newRecruitingActivities: newRecruitingActivities.length,
        newAwards: newAwards.length,
        newScheduleEvents: newScheduleEvents.length,
        newVideos: newVideos.length,
        totalChanges,
      },
    };
  }

  // ─── Identity Diffing ─────────────────────────────────────────────────

  private diffIdentity(
    prev: Record<string, unknown> | undefined,
    next: DistilledIdentity | undefined
  ): SyncDeltaReport['identityChanges'] {
    if (!next) return [];
    const prevObj = prev ?? {};
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

    for (const field of TRACKED_IDENTITY_FIELDS) {
      const oldVal = prevObj[field] ?? null;
      const newVal = (next as Record<string, unknown>)[field] ?? null;

      // Only report if the NEW value exists and differs
      if (newVal !== null && newVal !== undefined && !this.looseEqual(oldVal, newVal)) {
        changes.push({ field, oldValue: oldVal, newValue: newVal });
      }
    }

    return changes;
  }

  // ─── Generic Field-Section Diffing (academics, sportInfo, team, coach) ──

  /**
   * Compare two flat objects field-by-field, prefixing each change with the
   * section name so consumers can distinguish `team.conference` from
   * `identity.city`, etc.
   */
  private diffFieldSection(
    section: string,
    prev: Record<string, unknown> | undefined,
    next: Record<string, unknown> | undefined,
    trackedFields: readonly string[]
  ): SyncDeltaReport['identityChanges'] {
    if (!next) return [];
    const prevObj = prev ?? {};
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

    for (const field of trackedFields) {
      const oldVal = prevObj[field] ?? null;
      const newVal = next[field] ?? null;

      if (newVal !== null && newVal !== undefined && !this.looseEqual(oldVal, newVal)) {
        changes.push({ field: `${section}.${field}`, oldValue: oldVal, newValue: newVal });
      }
    }

    return changes;
  }

  // ─── Metrics Diffing ──────────────────────────────────────────────────

  /**
   * Compare previous metrics array (from PlayerMetrics docs) with newly
   * extracted metrics. Deduplicates by `field` key and reports value changes.
   * Results are folded into `statChanges` in the final report.
   */
  private diffMetrics(
    prev: readonly Record<string, unknown>[],
    next: readonly DistilledMetric[]
  ): SyncStatChange[] {
    if (!next.length) return [];

    // Build lookup: field → previous value
    const prevMap = new Map<string, unknown>();
    for (const entry of prev) {
      const field = entry['field'] as string | undefined;
      if (field) prevMap.set(field.toLowerCase(), entry['value']);
    }

    const changes: SyncStatChange[] = [];
    for (const metric of next) {
      const key = metric.field.toLowerCase();
      const oldVal = prevMap.get(key) ?? null;
      const newVal = metric.value;

      if (newVal !== null && newVal !== undefined && !this.looseEqual(oldVal, newVal)) {
        const change: SyncStatChange = {
          category: metric.category ?? 'metrics',
          key: metric.field,
          label: metric.label,
          oldValue: (oldVal as string | number | null) ?? null,
          newValue: newVal,
          ...(typeof oldVal === 'number' && typeof newVal === 'number'
            ? { delta: +(newVal - oldVal).toFixed(2) }
            : {}),
        };
        changes.push(change);
      }
    }

    return changes;
  }

  // ─── Season Stats Diffing ─────────────────────────────────────────────

  private diffStats(
    prev: readonly PreviousSeasonEntry[],
    next: readonly DistilledSeasonStats[]
  ): { newCategories: SyncNewCategory[]; statChanges: SyncStatChange[] } {
    const newCategories: SyncNewCategory[] = [];
    const statChanges: SyncStatChange[] = [];

    // Build lookup: "2024-2025::Passing" → previous entry
    const prevMap = new Map<string, PreviousSeasonEntry>();
    for (const entry of prev) {
      prevMap.set(`${entry.season}::${entry.category}`, entry);
    }

    for (const entry of next) {
      const key = `${entry.season}::${entry.category}`;
      const prevEntry = prevMap.get(key);

      if (!prevEntry) {
        // Entirely new category / season we've never seen
        newCategories.push({
          season: entry.season,
          category: entry.category,
          columns: entry.columns.map((c) => c.key),
          totalCount: Object.keys(entry.totals ?? {}).length,
        });
        continue;
      }

      // Compare totals (the most meaningful stat diff)
      if (entry.totals && prevEntry.totals) {
        for (const [statKey, newVal] of Object.entries(entry.totals)) {
          const oldVal = prevEntry.totals[statKey] ?? null;
          if (this.looseEqual(oldVal, newVal)) continue;

          const change: SyncStatChange = {
            category: entry.category,
            key: statKey,
            label: entry.columns.find((c) => c.key === statKey)?.label ?? statKey,
            oldValue: oldVal,
            newValue: newVal,
            ...(typeof oldVal === 'number' && typeof newVal === 'number'
              ? { delta: +(newVal - oldVal).toFixed(2) }
              : {}),
          };

          statChanges.push(change);
        }
      }

      // Compare averages too
      if (entry.averages && prevEntry.averages) {
        for (const [statKey, newVal] of Object.entries(entry.averages)) {
          const oldVal = prevEntry.averages[statKey] ?? null;
          if (this.looseEqual(oldVal, newVal)) continue;

          const change: SyncStatChange = {
            category: entry.category,
            key: `avg_${statKey}`,
            label: `Avg ${entry.columns.find((c) => c.key === statKey)?.label ?? statKey}`,
            oldValue: oldVal,
            newValue: newVal,
            ...(typeof oldVal === 'number' && typeof newVal === 'number'
              ? { delta: +(newVal - oldVal).toFixed(2) }
              : {}),
          };

          statChanges.push(change);
        }
      }
    }

    return { newCategories, statChanges };
  }

  // ─── Recruiting Diffing ───────────────────────────────────────────────

  private diffRecruiting(
    prev: readonly Record<string, unknown>[],
    next: readonly DistilledRecruitingActivity[]
  ): ReadonlyArray<Record<string, unknown>> {
    if (!next.length) return [];

    const newActivities: Record<string, unknown>[] = [];

    for (const activity of next) {
      // Deduplicate by college + category composite key
      const matchKey = `${activity.category}::${activity.collegeName ?? ''}`.toLowerCase();
      const exists = prev.some((p) => {
        const prevKey = `${p['category'] ?? ''}::${p['collegeName'] ?? ''}`.toLowerCase();
        return prevKey === matchKey;
      });

      if (!exists) {
        newActivities.push(activity as unknown as Record<string, unknown>);
      }
    }

    return newActivities;
  }

  // ─── Award Diffing ────────────────────────────────────────────────────

  private diffAwards(
    prev: readonly Record<string, unknown>[],
    next: readonly DistilledAward[]
  ): ReadonlyArray<Record<string, unknown>> {
    if (!next.length) return [];

    const newAwards: Record<string, unknown>[] = [];

    for (const award of next) {
      const matchKey = `${award.title}::${award.season ?? ''}`.toLowerCase();
      const exists = prev.some((p) => {
        const prevKey = `${p['title'] ?? ''}::${p['season'] ?? ''}`.toLowerCase();
        return prevKey === matchKey;
      });

      if (!exists) {
        newAwards.push(award as unknown as Record<string, unknown>);
      }
    }

    return newAwards;
  }

  // ─── Schedule Diffing ──────────────────────────────────────────────

  private diffSchedule(
    prev: readonly PreviousScheduleEntry[],
    next: readonly DistilledScheduleEvent[]
  ): SyncNewScheduleEvent[] {
    if (!next.length) return [];

    // Build set of existing schedule keys: "date_day::opponent"
    const existingKeys = new Set<string>();
    for (const entry of prev) {
      existingKeys.add(this.scheduleKey(entry.date, entry.opponent, entry.eventType));
    }

    const newEvents: SyncNewScheduleEvent[] = [];
    for (const event of next) {
      const key = this.scheduleKey(
        event.date,
        event.opponent,
        (event as { eventType?: string }).eventType
      );
      if (!existingKeys.has(key)) {
        newEvents.push({
          date: event.date,
          opponent: event.opponent,
          location: event.location,
          result: event.result,
          score: event.score,
        });
      }
    }

    return newEvents;
  }

  /**
   * Schedule dedup key: date (day portion) + opponent (lowercased).
   * Mirrors WriteCalendarEventsTool.dedupeKey() logic.
   */
  private scheduleKey(date: string, opponent?: string, eventType?: string): string {
    const day = date.split('T')[0] || 'nodate';
    const type = (eventType ?? 'other').toLowerCase().trim();
    const opp = (opponent ?? 'unknown').toLowerCase().trim();
    return `${day}::${type}::${opp}`;
  }

  // ─── Video Diffing ────────────────────────────────────────────────────

  private diffVideos(
    prev: readonly PreviousVideoEntry[],
    next: readonly DistilledVideo[]
  ): SyncNewVideo[] {
    if (!next.length) return [];

    // Deduplicate by normalized video src URL
    const existingSrcs = new Set<string>();
    for (const entry of prev) {
      existingSrcs.add(this.normalizeVideoSrc(entry.src));
    }

    const newVideos: SyncNewVideo[] = [];
    for (const video of next) {
      const normalized = this.normalizeVideoSrc(video.src);
      if (!existingSrcs.has(normalized)) {
        existingSrcs.add(normalized); // Prevent duplicates within the same batch
        newVideos.push({
          src: video.src,
          provider: video.provider,
          videoId: video.videoId,
          title: video.title,
        });
      }
    }

    return newVideos;
  }

  /**
   * Normalize a video URL for comparison: lowercase, strip trailing slashes and fragments.
   * Preserves query params since platforms like YouTube use them for video IDs.
   */
  private normalizeVideoSrc(src: string): string {
    try {
      const url = new URL(src);
      // Sort query params for consistent comparison
      url.searchParams.sort();
      return `${url.protocol}//${url.host}${url.pathname}${url.search}`
        .toLowerCase()
        .replace(/\/+$/, '');
    } catch {
      // Not a valid URL — compare as-is, lowercased
      return src.toLowerCase().trim();
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  /**
   * Loose equality check: handles string-vs-number coercion
   * (e.g., DB stores "3485" but AI returns 3485).
   */
  private looseEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || a === undefined) return b === null || b === undefined;

    // String-number comparison (DB may store as string)
    const aStr = String(a);
    const bStr = String(b);
    return aStr === bStr;
  }
}
