/**
 * @fileoverview Sport Domain Constants
 * @module @nxt1/core/constants
 *
 * Single source of truth for sport-related data including positions,
 * display names, and emoji mappings.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// SPORT CELL (UI Display)
// ============================================

export interface SportCell {
  /** Sport name (data key) */
  name: string;
  /** Emoji icon or image URL */
  icon: string;
  /** Formatted display name for UI */
  displayName?: string;
}

export interface Sport {
  /** Document ID */
  id: string;
  /** Display name shown in app */
  app_sport: string;
  /** Icon path or URL */
  icon: string;
  /** Display order */
  order: number;
  /** Optional positions array */
  positions?: string[];
  /** Whether sport is active */
  active?: boolean;
}

export type SportsMap = Record<string, Sport>;

// ============================================
// SPORT DISPLAY NAME FORMATTING
// ============================================

/**
 * Normalize sport name to underscore key format
 */
export function normalizeSportKey(sportName: string): string {
  if (!sportName) return '';

  return sportName
    .toLowerCase()
    .trim()
    .replace(/\s*\(mens\)|\s*\(womens\)/gi, '')
    .replace(/\s+mens$|\s+womens$/gi, '')
    .replace(/\s*&\s*/g, '_')
    .replace(/\s+and\s+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/_$/, '');
}

function toTitleCase(str: string): string {
  if (!str) return '';

  const specialCases: Record<string, string> = {
    mma: 'MMA',
    'track & field': 'Track & Field',
    esports: 'Esports',
  };

  const lower = str.toLowerCase();
  if (specialCases[lower]) {
    return specialCases[lower];
  }

  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format sport name for professional display
 */
export function formatSportDisplayName(sportName: string): string {
  if (!sportName) return '';

  const genderMatch = sportName.match(/^(.+?)\s*\((Mens|Womens)\)$/i);

  if (genderMatch) {
    const sport = genderMatch[1].trim();
    const gender = genderMatch[2].toLowerCase();
    const genderPrefix = gender === 'mens' ? "Men's" : "Women's";
    return `${genderPrefix} ${toTitleCase(sport)}`;
  }

  if (sportName.includes('_')) {
    return sportName
      .split('_')
      .map((word) => toTitleCase(word))
      .join(' ');
  }

  return toTitleCase(sportName);
}

// ============================================
// POSITION ABBREVIATION MAPPINGS
// ============================================

export const POSITION_MAPPING_BY_SPORT: Record<string, Record<string, string>> = {
  football: {
    quarterback: 'QB',
    'running back': 'RB',
    'full back': 'FB',
    'wide receiver': 'WR',
    'tight end': 'TE',
    center: 'C',
    'offensive line': 'OL',
    'left tackle': 'LT',
    'left guard': 'LG',
    'right guard': 'RG',
    'right tackle': 'RT',
    guard: 'G',
    tackle: 'T',
    'defensive line': 'DL',
    'defensive end': 'DE',
    'defensive tackle': 'DT',
    linebacker: 'LB',
    'middle linebacker': 'LB',
    'outside linebacker': 'LB',
    cornerback: 'CB',
    'corner back': 'CB',
    safety: 'S',
    'free safety': 'FS',
    'strong safety': 'SS',
    kicker: 'K',
    punter: 'P',
    'long snapper': 'LS',
    athlete: 'ATH',
  },
  basketball: {
    'point guard': 'PG',
    'shooting guard': 'SG',
    'small forward': 'SF',
    'power forward': 'PF',
    center: 'C',
  },
  baseball: {
    pitcher: 'P',
    catcher: 'C',
    '1st baseman': '1B',
    '2nd baseman': '2B',
    '3rd baseman': '3B',
    shortstop: 'SS',
    outfielder: 'OF',
    'left fielder': 'LF',
    'center fielder': 'CF',
    'right fielder': 'RF',
    infielder: 'IF',
    'designated hitter': 'DH',
  },
  bowling: {
    'table setter': '',
    middle: '',
    setup: '',
    anchor: '',
  },
  cross_country: {
    harrier: '',
    runner: '',
  },
  field_hockey: {
    'forward/striker': '',
    midfielder: 'M',
    defender: 'D',
    goalie: 'G',
  },
  golf: {
    golfer: '',
  },
  gymnastics: {
    'all around': 'AA',
    vault: 'VT',
    'uneven bars': 'UB',
    'balance beam': 'BB',
    'floor excercise': 'FX',
    'pommel horse': 'PH',
    'still rings': 'SR',
    'parallel bars': 'PB',
    'horizontal bars': 'HB',
  },
  ice_hockey: {
    'left wing': 'LW',
    'right wing': 'RW',
    defensemen: 'D',
    goalie: 'G',
    center: 'C',
  },
  lacrosse: {
    attack: 'A',
    defense: 'D',
    'goal keeper': 'G',
    midfield: 'M',
    'face off specialist': 'FO',
  },
  rowing: {
    coxswain: 'C',
    'stroke seat': 'S',
    'bow seat': 'B',
  },
  soccer: {
    'forward/striker': 'FS',
    midfielder: 'M',
    defender: 'D',
    goalie: 'G',
    'goal keeper': 'GK',
    'center back': 'CB',
    'full back': 'FB',
    'wing back': 'WB',
    'defensive midfielder': 'DM',
    'central midfielder': 'CM',
    'attacking midfielder': 'AM',
    'right wing': 'RW',
    'left wing': 'LW',
    striker: 'ST',
  },
  softball: {
    pitcher: 'P',
    catcher: 'C',
    '1st baseman': '1B',
    '2nd baseman': '2B',
    '3rd baseman': '3B',
    shortstop: 'SS',
    outfielder: 'OF',
    'left fielder': 'LF',
    'center fielder': 'CF',
    'right fielder': 'RF',
    infielder: 'IF',
  },
  swimming_diving: {
    freestyle: 'FR',
    backstroke: 'BK',
    breaststroke: 'BR',
    butterfly: 'FL',
    'individual medley': 'IM',
    relay: 'R',
    diver: 'D',
  },
  tennis: {
    'singles player': 'S',
    'doubles player': 'D',
  },
  track_field: {
    sprinter: 'SPR',
    'high hurdler': 'HH',
    'low hurdler': 'LH',
    'high jump': 'HJ',
    'low jump': 'LJ',
    'triple jump': 'TJ',
    'pole vault': 'PV',
    'shot put': 'SP',
    'discus thrower': 'DT',
    'javelin thrower': 'JT',
    'distance runner': 'DR',
  },
  volleyball: {
    'outside hitter': 'OH',
    'middle blocker': 'MB',
    'right side hitter': 'RS',
    setter: 'S',
    libero: 'L',
    'defensive specialist': 'DS',
  },
  water_polo: {
    'goal keeper': 'GK',
    'center back': 'CB',
    'center forward': 'CF',
    driver: 'DR',
    'wing defender': 'WD',
    point: 'P',
  },
  wrestling: {},
};

export const POSITION_ABBREVIATIONS = POSITION_MAPPING_BY_SPORT;

/**
 * Get position abbreviation
 */
export function getPositionAbbreviation(position: string, sport?: string): string {
  if (!position) return '';

  const normalizedPosition = position.toLowerCase().trim();

  if (sport) {
    const sportKey = normalizeSportKey(sport);
    const sportMapping = POSITION_MAPPING_BY_SPORT[sportKey];

    if (sportMapping && sportMapping[normalizedPosition]) {
      return sportMapping[normalizedPosition];
    }
  }

  for (const sportMapping of Object.values(POSITION_MAPPING_BY_SPORT)) {
    if (sportMapping[normalizedPosition]) {
      return sportMapping[normalizedPosition];
    }
  }

  return position;
}

/**
 * Format position for display with optional abbreviation
 */
export function formatPositionDisplay(
  position: string,
  sport?: string,
  options: {
    showAbbreviation?: boolean;
    abbreviationOnly?: boolean;
    titleCase?: boolean;
  } = {}
): string {
  if (!position) return '';

  const { showAbbreviation = true, abbreviationOnly = false, titleCase = true } = options;

  const abbr = getPositionAbbreviation(position, sport);
  const hasAbbr = abbr !== position && abbr.length > 0;

  if (abbreviationOnly && hasAbbr) {
    return abbr;
  }

  const displayName = titleCase ? toTitleCase(position) : position;

  if (showAbbreviation && hasAbbr) {
    return `${displayName} (${abbr})`;
  }

  return displayName;
}

// ============================================
// DEFAULT SPORTS (SSR/Offline Fallback)
// ============================================

export const DEFAULT_SPORTS: SportCell[] = [
  { name: 'Football', icon: '🏈' },
  { name: 'Basketball (Mens)', icon: '🏀' },
  { name: 'Basketball (Womens)', icon: '🏀' },
  { name: 'Baseball', icon: '⚾' },
  { name: 'Softball', icon: '🥎' },
  { name: 'Soccer (Mens)', icon: '⚽' },
  { name: 'Soccer (Womens)', icon: '⚽' },
  { name: 'Volleyball (Womens)', icon: '🏐' },
  { name: 'Volleyball (Mens)', icon: '🏐' },
  { name: 'Tennis', icon: '🎾' },
  { name: 'Golf', icon: '⛳' },
  { name: 'Swimming', icon: '🏊' },
  { name: 'Track & Field', icon: '🏃' },
  { name: 'Cross Country', icon: '🏃‍♂️' },
  { name: 'Wrestling', icon: '🤼' },
  { name: 'Lacrosse (Mens)', icon: '🥍' },
  { name: 'Lacrosse (Womens)', icon: '🥍' },
  { name: 'Ice Hockey', icon: '🏒' },
  { name: 'Field Hockey', icon: '🏑' },
  { name: 'Gymnastics', icon: '🤸' },
  { name: 'Cheerleading', icon: '📣' },
  { name: 'Dance', icon: '💃' },
  { name: 'Water Polo', icon: '🤽' },
  { name: 'Diving', icon: '🤿' },
  { name: 'Boxing', icon: '🥊' },
  { name: 'MMA', icon: '🥋' },
  { name: 'Rowing', icon: '🚣' },
  { name: 'Skiing', icon: '⛷️' },
  { name: 'Snowboarding', icon: '🏂' },
  { name: 'Surfing', icon: '🏄' },
  { name: 'Skateboarding', icon: '🛹' },
  { name: 'Cycling', icon: '🚴' },
  { name: 'Rugby', icon: '🏉' },
  { name: 'Fencing', icon: '🤺' },
  { name: 'Bowling', icon: '🎳' },
  { name: 'Equestrian', icon: '🏇' },
  { name: 'Triathlon', icon: '🏊‍♂️' },
  { name: 'Esports', icon: '🎮' },
  { name: 'Other', icon: '🏅' },
];

// ============================================
// SPORT EMOJI UTILITIES
// ============================================

export const SPORT_EMOJI_MAP: Record<string, string> = DEFAULT_SPORTS.reduce(
  (acc, sport) => {
    acc[sport.name.toLowerCase()] = sport.icon;
    return acc;
  },
  {} as Record<string, string>
);

export function getSportEmoji(sportName: string): string {
  if (!sportName) return '🏅';

  const normalized = sportName.toLowerCase().trim();

  if (SPORT_EMOJI_MAP[normalized]) {
    return SPORT_EMOJI_MAP[normalized];
  }

  for (const [key, emoji] of Object.entries(SPORT_EMOJI_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return emoji;
    }
  }

  return '🏅';
}

// ============================================
// FIRESTORE COLLECTIONS
// ============================================

export const SPORTS_COLLECTION = 'Sports';
export const ACADEMIC_CATEGORIES_COLLECTION = 'AcademicCategories';

// ============================================
// POSITION GROUPS (For Onboarding UI)
// ============================================

export interface PositionGroup {
  category: string;
  positions: string[];
}

export const SPORT_POSITION_GROUPS: Record<string, PositionGroup[]> = {
  football: [
    {
      category: 'Offense',
      positions: [
        'quarterback',
        'running back',
        'wide receiver',
        'tight end',
        'center',
        'guard',
        'tackle',
      ],
    },
    {
      category: 'Defense',
      positions: ['defensive tackle', 'defensive end', 'linebacker', 'corner back', 'safety'],
    },
    { category: 'Special Teams', positions: ['kicker', 'punter', 'long snapper'] },
  ],
  basketball: [
    {
      category: 'Positions',
      positions: ['point guard', 'shooting guard', 'small forward', 'power forward', 'center'],
    },
  ],
  baseball: [
    {
      category: 'Positions',
      positions: [
        'pitcher',
        'catcher',
        '1st baseman',
        '2nd baseman',
        '3rd baseman',
        'shortstop',
        'infielder',
        'outfielder',
        'designated hitter',
      ],
    },
  ],
  bowling: [{ category: 'Positions', positions: ['table setter', 'middle', 'setup', 'anchor'] }],
  cross_country: [{ category: 'Positions', positions: ['harrier', 'runner'] }],
  field_hockey: [
    {
      category: 'Positions',
      positions: ['forward/striker', 'midfielder', 'fullback/defender', 'sweeper', 'goalie'],
    },
  ],
  golf: [{ category: 'Positions', positions: ['golfer'] }],
  gymnastics: [
    {
      category: 'Positions',
      positions: [
        'acrobat',
        'all arounder',
        'artistic',
        'power tumbling',
        'rhythmic',
        'trampoline',
      ],
    },
  ],
  ice_hockey: [{ category: 'Positions', positions: ['center', 'winger', 'defensemen', 'goalie'] }],
  lacrosse: [
    { category: 'Positions', positions: ['attackman', 'midfielder', 'defender', 'goal keeper'] },
  ],
  rowing: [{ category: 'Positions', positions: ['coxswain', 'rower'] }],
  soccer: [
    { category: 'Positions', positions: ['forward', 'midfielder', 'defender', 'goal keeper'] },
  ],
  softball: [
    {
      category: 'Positions',
      positions: [
        'pitcher',
        'catcher',
        '1st baseman',
        '2nd baseman',
        '3rd baseman',
        'shortstop',
        'outfielder',
        'infielder',
      ],
    },
  ],
  swimming_diving: [{ category: 'Positions', positions: ['swimmer', 'diver'] }],
  tennis: [{ category: 'Positions', positions: ['tennis player'] }],
  track_field: [
    { category: 'Positions', positions: ['sprinter', 'distance runner', 'hurdler', 'jumper'] },
  ],
  volleyball: [
    {
      category: 'Positions',
      positions: [
        'outside hitter',
        'middle blocker',
        'opposite hitter',
        'setter',
        'libero',
        'defensive specialist',
        'serving specialist',
      ],
    },
  ],
  water_polo: [
    {
      category: 'Positions',
      positions: ['goal keeper', 'wing', 'diver', 'point', 'center forward'],
    },
  ],
  wrestling: [{ category: 'Positions', positions: [] }],
};

export const DEFAULT_POSITION_GROUPS: PositionGroup[] = [
  { category: 'General', positions: ['starter', 'reserve', 'specialist', 'captain', 'all-around'] },
];

export function getPositionGroupsForSport(sportName: string): PositionGroup[] {
  if (!sportName) return DEFAULT_POSITION_GROUPS;

  const key = normalizeSportKey(sportName);

  if (SPORT_POSITION_GROUPS[key]) {
    return SPORT_POSITION_GROUPS[key];
  }

  const singleWord = key.replace(/_/g, '');
  if (SPORT_POSITION_GROUPS[singleWord]) {
    return SPORT_POSITION_GROUPS[singleWord];
  }

  return DEFAULT_POSITION_GROUPS;
}

export function getPositionsForSport(sportName: string): string[] {
  const groups = getPositionGroupsForSport(sportName);
  return groups.flatMap((group) => group.positions);
}
