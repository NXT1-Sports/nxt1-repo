import { describe, expect, it } from 'vitest';

import { assessPlaybookExtractionQuality } from '../playbook-extraction-quality.util.js';

describe('assessPlaybookExtractionQuality', () => {
  it('accepts a well-structured football payload', () => {
    const assessment = assessPlaybookExtractionQuality('football', [
      {
        name: '60 Mesh',
        category: 'offense',
        playType: 'pass',
        formation: 'Shotgun Trips',
        personnel: '11',
        conceptTags: ['mesh', 'hot'],
        playBreakdown: 'QB reads mike leverage then works mesh.',
      },
      {
        name: 'Outside Zone',
        category: 'offense',
        playType: 'run',
        formation: 'Gun Doubles',
        personnel: '11',
        conceptTags: ['wide-zone'],
        description: 'Stretch track aiming point at outside leg of tackle.',
      },
      {
        name: 'Tampa Check',
        category: 'defense',
        playType: 'coverage',
        formation: 'Nickel Over',
        personnel: '42',
        conceptTags: ['cover-2'],
        playBreakdown: 'Mike carries seam. Safety caps slot vertical.',
      },
    ]);

    expect(assessment.disposition).toBe('accept');
    expect(assessment.score).toBeGreaterThanOrEqual(90);
  });

  it('routes to review_required for non-football payload with moderate gaps', () => {
    const assessment = assessPlaybookExtractionQuality('basketball', [
      {
        name: 'Horns Twist',
        category: 'offense',
        conceptTags: ['horns'],
      },
      {
        name: 'Spain PNR',
        playType: 'set_play',
        conceptTags: ['pick-and-roll'],
      },
      {
        name: 'Delay Action',
        category: 'offense',
      },
    ]);

    expect(assessment.disposition).toBe('review_required');
    expect(assessment.score).toBeGreaterThan(0);
    expect(assessment.score).toBeLessThan(90);
  });

  it('rejects severely under-structured football extraction', () => {
    const assessment = assessPlaybookExtractionQuality('football', [
      { name: 'Play 1' },
      { name: 'Play 2' },
      { name: 'Play 3' },
      { name: 'Play 4' },
    ]);

    expect(assessment.disposition).toBe('reject');
    expect(assessment.summary.toLowerCase()).toContain('rejected');
  });
});
