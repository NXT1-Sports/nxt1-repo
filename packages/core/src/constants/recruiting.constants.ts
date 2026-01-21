/**
 * @fileoverview Recruiting Constants
 * @module @nxt1/core/constants
 *
 * NCAA recruiting calendar links and division data.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// RECRUITING CALENDAR LINKS - D1
// ============================================

/**
 * NCAA Division 1 recruiting calendar links by sport
 */
export const RECRUITING_CALENDAR_D1: Record<string, string> = {
  'football fbs':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_FBSMFBRecruitingCalendar.pdf',
  'football fcs':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_FCSMFBRecruitingCalendar.pdf',
  'field hockey':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'basketball mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_MBBRecruitingCalendar.pdf',
  'basketball womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_WBBRecruitingCalendar.pdf',
  baseball:
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_MBARecruitingCalendar.pdf',
  softball:
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_WSBRecruitingCalendar.pdf',
  'soccer mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'soccer womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'lacrosse mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_MLARecruitingCalendar.pdf',
  'lacrosse womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_WBBRecruitingCalendar.pdf',
  'golf mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_MGORecruitingCalendar.pdf',
  'golf womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'track & field mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_XTFRRecruitingCalendar.pdf',
  'track & field womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_XTFRRecruitingCalendar.pdf',
  'cross country mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_XTFRRecruitingCalendar.pdf',
  'cross country womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_XTFRRecruitingCalendar.pdf',
  'volleyball mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'volleyball womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_WVBRecruitingCalendar.pdf',
  wrestling:
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  rowing:
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'ice hockey mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'ice hockey womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'tennis mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'tennis womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'swimming & diving mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'swimming & diving womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'gymnastics mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'gymnastics womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'water polo mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'water polo womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
  'bowling womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D1Rec_OtherSportsRecruitingCalendar.pdf',
} as const;

// ============================================
// RECRUITING CALENDAR LINKS - D2
// ============================================

/**
 * NCAA Division 2 recruiting calendar links by sport
 */
export const RECRUITING_CALENDAR_D2: Record<string, string> = {
  football:
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendar_FB.pdf',
  'field hockey':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'basketball mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendar_MBB.pdf',
  'basketball womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendar_WBB.pdf',
  baseball:
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  softball:
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'soccer mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'soccer womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'lacrosse mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'lacrosse womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'golf mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'golf womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'track & field mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'track & field womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'cross country mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'cross country womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'volleyball mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'volleyball womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  wrestling:
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  rowing:
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'ice hockey mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'ice hockey womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'tennis mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'tennis womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'swimming & diving mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'swimming & diving womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'gymnastics mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'gymnastics womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'water polo mens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'water polo womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
  'bowling womens':
    'https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2022-23/2022-23D2REC_RecCalendars_SOTFB.pdf',
} as const;

// ============================================
// NCAA DIVISIONS
// ============================================

export const NCAA_DIVISIONS = {
  D1: 'D1',
  D2: 'D2',
  D3: 'D3',
  NAIA: 'NAIA',
  NJCAA: 'NJCAA',
} as const;

export type NCADivision = (typeof NCAA_DIVISIONS)[keyof typeof NCAA_DIVISIONS];

export interface DivisionConfig {
  id: NCADivision;
  label: string;
  description: string;
}

export const DIVISION_CONFIGS: readonly DivisionConfig[] = [
  {
    id: 'D1',
    label: 'NCAA Division I',
    description: 'Top tier NCAA athletics',
  },
  {
    id: 'D2',
    label: 'NCAA Division II',
    description: 'Balance of athletics and academics',
  },
  {
    id: 'D3',
    label: 'NCAA Division III',
    description: 'No athletic scholarships',
  },
  {
    id: 'NAIA',
    label: 'NAIA',
    description: 'National Association of Intercollegiate Athletics',
  },
  {
    id: 'NJCAA',
    label: 'NJCAA',
    description: 'Junior College Athletics',
  },
] as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get recruiting calendar link for a sport and division
 */
export function getRecruitingCalendarLink(
  sport: string,
  division: NCADivision
): string | undefined {
  const normalizedSport = sport.toLowerCase().trim();

  if (division === 'D1') {
    return RECRUITING_CALENDAR_D1[normalizedSport];
  }

  if (division === 'D2') {
    return RECRUITING_CALENDAR_D2[normalizedSport];
  }

  // D3, NAIA, NJCAA don't have specific calendars
  return undefined;
}

/**
 * Get division config by ID
 */
export function getDivisionConfig(id: NCADivision): DivisionConfig | undefined {
  return DIVISION_CONFIGS.find((d) => d.id === id);
}

/**
 * Get all divisions as options for dropdowns
 */
export function getDivisionOptions(): Array<{ value: NCADivision; label: string }> {
  return DIVISION_CONFIGS.map((d) => ({ value: d.id, label: d.label }));
}
