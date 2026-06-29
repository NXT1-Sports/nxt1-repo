import { describe, expect, it } from 'vitest';

import type { ProfileEvent } from './profile.types';
import {
  filterScheduleEvents,
  getScheduleSeasons,
  getSeasonForDate,
  mapProfileEventsToScheduleRows,
} from './profile-schedule.helpers';

function makeEvent(overrides: Partial<ProfileEvent>): ProfileEvent {
  return {
    id: overrides.id ?? 'event-1',
    type: overrides.type ?? 'game',
    name: overrides.name ?? 'NXT1 Academy vs Rival Prep',
    startDate: overrides.startDate ?? '2025-09-01T18:00:00.000Z',
    location: overrides.location,
    opponent: overrides.opponent,
    result: overrides.result,
    isAllDay: overrides.isAllDay,
    logoUrl: overrides.logoUrl,
    description: overrides.description,
    endDate: overrides.endDate,
    url: overrides.url,
    graphicUrl: overrides.graphicUrl,
  };
}

describe('profile-schedule.helpers', () => {
  it('derives season labels with the Aug/Jan boundary', () => {
    expect(getSeasonForDate('2025-08-15T12:00:00.000Z')).toBe('2025-2026');
    expect(getSeasonForDate('2026-01-10T12:00:00.000Z')).toBe('2025-2026');
  });

  it('returns unique seasons in descending order for schedule events', () => {
    const events = [
      makeEvent({ id: 'a', startDate: '2024-09-10T00:00:00.000Z', type: 'game' }),
      makeEvent({ id: 'b', startDate: '2025-02-11T00:00:00.000Z', type: 'practice' }),
      makeEvent({ id: 'c', startDate: '2025-09-12T00:00:00.000Z', type: 'game' }),
    ];

    expect(getScheduleSeasons(events)).toEqual(['2025-2026', '2024-2025']);
  });

  it('filters to requested season while preserving chronological order', () => {
    const events = [
      makeEvent({ id: 'late', startDate: '2025-11-10T00:00:00.000Z', type: 'game' }),
      makeEvent({ id: 'early', startDate: '2025-08-10T00:00:00.000Z', type: 'game' }),
      makeEvent({ id: 'old', startDate: '2024-10-10T00:00:00.000Z', type: 'game' }),
    ];

    const filtered = filterScheduleEvents(events, '2025-2026');

    expect(filtered.map((event) => event.id)).toEqual(['early', 'late']);
  });

  it('maps schedule events into display rows with fallback values', () => {
    const rows = mapProfileEventsToScheduleRows(
      [
        makeEvent({
          id: 'row-1',
          name: 'NXT1 Academy vs Rival Prep',
          startDate: '2099-09-01T18:00:00.000Z',
        }),
      ],
      {
        teamName: 'NXT1 Academy',
      }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'row-1',
      homeTeam: 'NXT1 Academy',
      awayTeam: 'Rival Prep',
      statusLabel: 'Upcoming',
      statusValue: 'Scheduled',
      location: 'Location TBA',
    });
  });
});
