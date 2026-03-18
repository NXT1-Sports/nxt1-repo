/**
 * @fileoverview Test: SyncDiffService — Deterministic Delta Engine
 *
 * Run: npx tsx scripts/test-sync-diff.ts
 *
 * This test injects mock "Yesterday" state and "Today" state,
 * then verifies the delta report is accurate.
 */

import { SyncDiffService, type PreviousProfileState } from '../src/modules/agent/sync/index.js';
import type { DistilledProfile } from '../src/modules/agent/tools/scraping/distillers/distiller.types.js';

const diffService = new SyncDiffService();

// ─── Mock: Yesterday's State (what's currently in DB) ───────────────────────

const previousState: PreviousProfileState = {
  identity: {
    firstName: 'Ryder',
    lastName: 'Lyons',
    height: '6-2',
    weight: '195',
    classOf: 2026,
    city: 'Folsom',
    state: 'CA',
    school: 'Folsom High School',
  },
  seasonStats: [
    {
      season: '2024-2025',
      category: 'Passing',
      columns: [
        { key: 'GP', label: 'GP' },
        { key: 'C', label: 'C' },
        { key: 'Att', label: 'Att' },
        { key: 'Yds', label: 'Yds' },
        { key: 'TD', label: 'TD' },
        { key: 'Int', label: 'Int' },
      ],
      totals: { GP: 12, C: 220, Att: 310, Yds: 3200, TD: 30, Int: 7 },
    },
    {
      season: '2024-2025',
      category: 'Rushing',
      columns: [
        { key: 'Car', label: 'Car' },
        { key: 'Yds', label: 'Yds' },
        { key: 'TD', label: 'TD' },
      ],
      totals: { Car: 100, Yds: 350, TD: 12 },
    },
  ],
  recruiting: [
    { category: 'offer', collegeName: 'Oregon State' },
    { category: 'interest', collegeName: 'UCLA' },
  ],
  awards: [{ title: 'All-League First Team', season: '2023-2024' }],
  schedule: [
    { date: '2024-09-06', opponent: 'Oak Ridge', sport: 'football', eventType: 'game' },
    { date: '2024-09-13', opponent: 'Granite Bay', sport: 'football', eventType: 'game' },
    { date: '2024-09-20', opponent: 'Del Oro', sport: 'football', eventType: 'game' },
  ],
  videos: [
    { src: 'https://www.hudl.com/video/3/12345/abc', provider: 'hudl', videoId: 'abc' },
    { src: 'https://www.youtube.com/watch?v=old123', provider: 'youtube', videoId: 'old123' },
  ],
};

// ─── Mock: Today's Extracted State (fresh from AI distiller) ────────────────

const extractedProfile: DistilledProfile = {
  platform: 'maxpreps',
  profileUrl: 'https://www.maxpreps.com/ca/folsom/folsom-bulldogs/athletes/ryder-lyons/',
  identity: {
    firstName: 'Ryder',
    lastName: 'Lyons',
    height: '6-3', // CHANGED: grew an inch
    weight: '200', // CHANGED: gained 5 lbs
    classOf: 2026,
    city: 'Folsom',
    state: 'CA',
    school: 'Folsom High School',
  },
  seasonStats: [
    {
      season: '2024-2025',
      category: 'Passing',
      columns: [
        { key: 'GP', label: 'GP' },
        { key: 'C', label: 'C' },
        { key: 'Att', label: 'Att' },
        { key: 'Yds', label: 'Yds' },
        { key: 'TD', label: 'TD' },
        { key: 'Int', label: 'Int' },
      ],
      games: [],
      totals: { GP: 14, C: 265, Att: 345, Yds: 3485, TD: 36, Int: 9 }, // CHANGED
    },
    {
      season: '2024-2025',
      category: 'Rushing',
      columns: [
        { key: 'Car', label: 'Car' },
        { key: 'Yds', label: 'Yds' },
        { key: 'TD', label: 'TD' },
      ],
      games: [],
      totals: { Car: 122, Yds: 405, TD: 15 }, // CHANGED
    },
    {
      season: '2024-2025',
      category: 'Receiving', // NEW CATEGORY
      columns: [
        { key: 'Rec', label: 'Rec' },
        { key: 'Yds', label: 'Yds' },
        { key: 'TD', label: 'TD' },
      ],
      games: [],
      totals: { Rec: 3, Yds: 45, TD: 1 },
    },
  ],
  recruiting: [
    { category: 'offer', collegeName: 'Oregon State' },
    { category: 'interest', collegeName: 'UCLA' },
    { category: 'commitment', collegeName: 'BYU', division: 'D1', date: '2025-12-03' }, // NEW
  ],
  awards: [
    { title: 'All-League First Team', season: '2023-2024' },
    { title: 'Section MVP', season: '2024-2025' }, // NEW
  ],
  schedule: [
    { date: '2024-09-06', opponent: 'Oak Ridge' }, // existing
    { date: '2024-09-13', opponent: 'Granite Bay' }, // existing
    { date: '2024-09-20', opponent: 'Del Oro' }, // existing
    { date: '2024-09-27', opponent: 'Jesuit', location: 'Folsom Field', result: 'W 35-21' }, // NEW
    { date: '2024-10-04', opponent: 'Vista del Lago', result: 'W 42-14' }, // NEW
  ],
  videos: [
    { src: 'https://www.hudl.com/video/3/12345/abc', provider: 'hudl' as const, videoId: 'abc' }, // existing
    {
      src: 'https://www.youtube.com/watch?v=old123',
      provider: 'youtube' as const,
      videoId: 'old123',
    }, // existing
    {
      src: 'https://www.hudl.com/video/3/12345/def',
      provider: 'hudl' as const,
      videoId: 'def',
      title: 'Week 4 Highlights',
    }, // NEW
    {
      src: 'https://www.youtube.com/watch?v=new456',
      provider: 'youtube' as const,
      videoId: 'new456',
    }, // NEW
  ],
};

// ─── Run the Diff ───────────────────────────────────────────────────────────

console.log('🧪 Testing SyncDiffService...\n');

const delta = diffService.diff(
  'user_ryder_lyons_123',
  'football',
  'maxpreps',
  previousState,
  extractedProfile
);

console.log('═══════════════════════════════════════════');
console.log('📊 SYNC DELTA REPORT');
console.log('═══════════════════════════════════════════\n');

console.log(`isEmpty: ${delta.isEmpty}`);
console.log(`Total Changes: ${delta.summary.totalChanges}\n`);

console.log('── Identity Changes ──');
if (delta.identityChanges.length === 0) {
  console.log('  (none)');
} else {
  for (const c of delta.identityChanges) {
    console.log(`  ${c.field}: ${JSON.stringify(c.oldValue)} → ${JSON.stringify(c.newValue)}`);
  }
}

console.log('\n── New Categories ──');
if (delta.newCategories.length === 0) {
  console.log('  (none)');
} else {
  for (const c of delta.newCategories) {
    console.log(`  ${c.season} ${c.category}: ${c.columns.join(', ')} (${c.totalCount} totals)`);
  }
}

console.log('\n── Stat Changes ──');
if (delta.statChanges.length === 0) {
  console.log('  (none)');
} else {
  for (const c of delta.statChanges) {
    const deltaStr = c.delta !== undefined ? ` (${c.delta > 0 ? '+' : ''}${c.delta})` : '';
    console.log(`  ${c.category} ${c.label}: ${c.oldValue} → ${c.newValue}${deltaStr}`);
  }
}

console.log('\n── New Recruiting ──');
if (delta.newRecruitingActivities.length === 0) {
  console.log('  (none)');
} else {
  for (const r of delta.newRecruitingActivities) {
    console.log(`  ${r['category']}: ${r['collegeName']} (${r['division'] ?? 'unknown'})`);
  }
}

console.log('\n── New Awards ──');
if (delta.newAwards.length === 0) {
  console.log('  (none)');
} else {
  for (const a of delta.newAwards) {
    console.log(`  ${a['title']} (${a['season'] ?? 'no season'})`);
  }
}

console.log('\n── New Schedule Events ──');
if (delta.newScheduleEvents.length === 0) {
  console.log('  (none)');
} else {
  for (const s of delta.newScheduleEvents) {
    console.log(`  ${s.date} vs ${s.opponent ?? 'TBD'} ${s.result ?? ''}`);
  }
}

console.log('\n── New Videos ──');
if (delta.newVideos.length === 0) {
  console.log('  (none)');
} else {
  for (const v of delta.newVideos) {
    console.log(`  [${v.provider}] ${v.title ?? v.src}`);
  }
}

console.log('\n── Summary ──');
console.log(JSON.stringify(delta.summary, null, 2));

// ─── Assertions ─────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════');
console.log('✅ ASSERTIONS');
console.log('═══════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

assert('Report is NOT empty', !delta.isEmpty);
assert('2 identity changes (height, weight)', delta.identityChanges.length === 2);
assert(
  'Height changed to 6-3',
  delta.identityChanges.some((c) => c.field === 'height' && c.newValue === '6-3')
);
assert(
  'Weight changed to 200',
  delta.identityChanges.some((c) => c.field === 'weight' && c.newValue === '200')
);
assert('1 new category (Receiving)', delta.newCategories.length === 1);
assert('New category is Receiving', delta.newCategories[0]?.category === 'Receiving');
assert('Stat changes detected (Passing + Rushing)', delta.statChanges.length > 0);
assert(
  'Passing Yds increased (+285)',
  delta.statChanges.some((c) => c.category === 'Passing' && c.key === 'Yds' && c.delta === 285)
);
assert(
  'Passing TD increased (+6)',
  delta.statChanges.some((c) => c.category === 'Passing' && c.key === 'TD' && c.delta === 6)
);
assert('1 new recruiting activity (BYU commitment)', delta.newRecruitingActivities.length === 1);
assert('New recruiting is BYU', delta.newRecruitingActivities[0]?.['collegeName'] === 'BYU');
assert('1 new award (Section MVP)', delta.newAwards.length === 1);
assert('New award is Section MVP', delta.newAwards[0]?.['title'] === 'Section MVP');

// Schedule assertions
assert('2 new schedule events (Jesuit, Vista del Lago)', delta.newScheduleEvents.length === 2);
assert(
  'First new event is vs Jesuit',
  delta.newScheduleEvents.some((s) => s.opponent === 'Jesuit')
);
assert(
  'Second new event is vs Vista del Lago',
  delta.newScheduleEvents.some((s) => s.opponent === 'Vista del Lago')
);
assert(
  'Jesuit event has result',
  delta.newScheduleEvents.find((s) => s.opponent === 'Jesuit')?.result === 'W 35-21'
);

// Video assertions
assert('2 new videos detected', delta.newVideos.length === 2);
assert(
  'New Hudl video detected',
  delta.newVideos.some((v) => v.provider === 'hudl' && v.videoId === 'def')
);
assert(
  'New YouTube video detected',
  delta.newVideos.some((v) => v.provider === 'youtube' && v.videoId === 'new456')
);
assert(
  'Hudl video has title',
  delta.newVideos.find((v) => v.videoId === 'def')?.title === 'Week 4 Highlights'
);

// Summary includes all dimensions
assert('Summary includes newScheduleEvents count', delta.summary.newScheduleEvents === 2);
assert('Summary includes newVideos count', delta.summary.newVideos === 2);
assert(
  'Total changes includes all dimensions',
  delta.summary.totalChanges ===
    delta.summary.identityFieldsChanged +
      delta.summary.newCategoriesAdded +
      delta.summary.statsUpdated +
      delta.summary.newRecruitingActivities +
      delta.summary.newAwards +
      delta.summary.newScheduleEvents +
      delta.summary.newVideos
);

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('\n❌ SOME ASSERTIONS FAILED');
  process.exit(1);
} else {
  console.log('\n✅ ALL ASSERTIONS PASSED — Delta Engine is working perfectly!');
}
