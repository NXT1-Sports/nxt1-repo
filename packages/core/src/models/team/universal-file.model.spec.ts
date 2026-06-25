import { describe, expect, it } from 'vitest';
import {
  getUniversalFileClassification,
  getUniversalPrimaryClassification,
} from './universal-file.model';

describe('universal file classification', () => {
  it('prefers universal classification fields over legacy documentSubtype aliases', () => {
    const classification = getUniversalFileClassification({
      type: 'file',
      documentSubtype: 'legacy_game_plan',
      classification: {
        primary: 'game_plan',
        route: 'game-plans',
        labels: ['strategy'],
      },
    });

    expect(classification).toEqual({
      primary: 'game-plans',
      route: 'game-plans',
      labels: ['strategy', 'game-plans'],
    });
    expect(
      getUniversalPrimaryClassification({
        type: 'file',
        documentSubtype: 'legacy_game_plan',
        classification: {
          primary: 'game_plan',
          route: 'game-plans',
        },
      })
    ).toBe('game-plans');
  });

  it('does not classify file records from documentSubtype alone anymore', () => {
    expect(
      getUniversalFileClassification({
        type: 'file',
        documentSubtype: 'callsheet',
        classification: undefined,
      })
    ).toBeNull();

    expect(
      getUniversalPrimaryClassification({
        type: 'file',
        documentSubtype: 'callsheet',
        classification: undefined,
      })
    ).toBeUndefined();
  });
});
