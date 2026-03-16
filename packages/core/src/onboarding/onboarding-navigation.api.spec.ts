import { describe, expect, it } from 'vitest';
import {
  createEmptySportEntry,
  validateProfile,
  validateSport,
  validateStep,
  type OnboardingFormData,
} from './onboarding-navigation.api';

function buildSportEntry(sport: string, positions: string[] = []) {
  const entry = createEmptySportEntry(sport, true);
  entry.positions = positions;
  return entry;
}

describe('onboarding navigation profile validation', () => {
  it('requires class year for athlete profiles', () => {
    expect(
      validateProfile(
        {
          firstName: 'Maya',
          lastName: 'Johnson',
          classYear: null,
        },
        'athlete'
      )
    ).toBe(false);

    expect(
      validateProfile(
        {
          firstName: 'Maya',
          lastName: 'Johnson',
          classYear: 2028,
        },
        'athlete'
      )
    ).toBe(true);
  });

  it('does not require class year for non-athlete profiles', () => {
    expect(
      validateProfile(
        {
          firstName: 'Chris',
          lastName: 'Taylor',
          classYear: null,
        },
        'coach'
      )
    ).toBe(true);
  });

  it('uses the pending role when validating the profile step', () => {
    const formData: Partial<OnboardingFormData> = {
      userType: 'athlete',
      profile: {
        firstName: 'Jordan',
        lastName: 'Lee',
        classYear: null,
      },
    };

    expect(validateStep('profile', formData, 'athlete')).toBe(false);

    expect(
      validateStep(
        'profile',
        {
          ...formData,
          profile: {
            firstName: 'Jordan',
            lastName: 'Lee',
            classYear: 2027,
          },
        },
        'athlete'
      )
    ).toBe(true);
  });
});

describe('onboarding navigation sport validation', () => {
  it('requires a position for athlete sports that expose positions', () => {
    expect(
      validateSport(
        {
          sports: [buildSportEntry('Football')],
        },
        'athlete'
      )
    ).toBe(false);

    expect(
      validateSport(
        {
          sports: [buildSportEntry('Football', ['Quarterback'])],
        },
        'athlete'
      )
    ).toBe(true);
  });

  it('requires a coach title in the sport step for coaches', () => {
    expect(
      validateSport(
        {
          sports: [buildSportEntry('Basketball')],
          coachTitle: null,
        },
        'coach'
      )
    ).toBe(false);

    expect(
      validateSport(
        {
          sports: [buildSportEntry('Basketball')],
          coachTitle: 'head-coach',
        },
        'coach'
      )
    ).toBe(true);
  });

  it('uses the pending role when validating the sport step', () => {
    const formData: Partial<OnboardingFormData> = {
      userType: 'coach',
      sport: {
        sports: [buildSportEntry('Baseball')],
        coachTitle: null,
      },
    };

    expect(validateStep('sport', formData, 'coach')).toBe(false);

    expect(
      validateStep(
        'sport',
        {
          ...formData,
          sport: {
            sports: [buildSportEntry('Baseball')],
            coachTitle: 'assistant-coach',
          },
        },
        'coach'
      )
    ).toBe(true);
  });
});
