/**
 * @fileoverview Sport Domain Constants (single source of truth)
 * @module @nxt1/core/constants
 *
 * Consolidated sport identifiers, positions, stats, athletic info,
 * display helpers, and emoji utilities. 100% portable, no framework deps.
 *
 * 2026 ROLE: These constants serve three purposes:
 *   1. AGENT X NORMALIZATION — When Agent X scrapes data from MaxPreps, Hudl,
 *      etc., it uses these field definitions to normalize labels, units, and
 *      categories into VerifiedMetric/VerifiedStat objects.
 *   2. MANUAL ENTRY SUGGESTIONS — When a user adds stats/metrics manually,
 *      the UI uses these as dropdown suggestions (with a "Custom" option).
 *   3. GOLDEN PATH PROMPTING — Agent X is prompted to prioritize these fields
 *      when selecting featuredMetrics/featuredStats on the SportProfile.
 *
 * These constants are NOT database schemas. The database stores agnostic
 * VerifiedMetric[] and VerifiedStat[] arrays that accept ANY label/value.
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Field definition for sport-specific metrics and stats.
 *
 * 2026 USAGE:
 * - Agent X uses `field` to normalize scraped data (e.g., "Pass Yds" → field: 'passing_yards')
 * - Agent X uses `label` to set the display-ready label on VerifiedMetric/VerifiedStat
 * - Agent X uses `unit` to set the unit on VerifiedMetric/VerifiedStat
 * - The UI uses `type` and `options` to render manual-entry forms
 * - `required` indicates which fields Agent X should prioritize extracting
 */
export interface FieldDefinition {
  /** Field identifier (snake_case) — used as normalization key */
  field: string;
  /** Display label — copied to VerifiedMetric.label / VerifiedStat.label */
  label: string;
  /** Input type (for manual-entry UI forms) */
  type?: 'text' | 'number' | 'select' | 'time';
  /** Whether field is a priority for Agent X extraction */
  required?: boolean;
  /** Unit of measurement — copied to VerifiedMetric.unit / VerifiedStat.unit */
  unit?: string;
  /** Placeholder text (for manual-entry UI forms) */
  placeholder?: string;
  /** Options for select type (for manual-entry UI forms) */
  options?: string[];
}

export interface StatCategory {
  category: string;
  fields: FieldDefinition[];
}

export interface SportCell {
  name: string;
  icon: string;
  displayName?: string;
}

export interface Sport {
  id: string;
  app_sport: string;
  icon: string;
  order: number;
  positions?: string[];
  active?: boolean;
}

export type SportsMap = Record<string, Sport>;

// ============================================
// HELPERS
// ============================================

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

export function normalizeBaseSportKey(sportName: string): string {
  const normalized = normalizeSportKey(sportName);
  if (!normalized) return '';

  return normalized
    .replace(/^(?:men'?s|women'?s|mens|womens)_/i, '')
    .replace(/_(?:men'?s|women'?s|mens|womens)$/i, '');
}

export function formatSportDisplayName(sportName: string): string {
  if (!sportName) return '';

  // Handle v1 format: "basketball mens" → "Men's Basketball"
  const v1GenderMatch = sportName.match(/^(.+?)\s+(mens|womens)$/i);
  if (v1GenderMatch) {
    const sport = v1GenderMatch[1].trim();
    const gender = v1GenderMatch[2].toLowerCase();
    const genderPrefix = gender === 'mens' ? "Men's" : "Women's";
    return `${genderPrefix} ${toTitleCase(sport)}`;
  }

  // Handle parentheses format: "Basketball (Mens)" → "Men's Basketball"
  const parenGenderMatch = sportName.match(/^(.+?)\s*\((Mens|Womens)\)$/i);
  if (parenGenderMatch) {
    const sport = parenGenderMatch[1].trim();
    const gender = parenGenderMatch[2].toLowerCase();
    const genderPrefix = gender === 'mens' ? "Men's" : "Women's";
    return `${genderPrefix} ${toTitleCase(sport)}`;
  }

  // Handle underscore format: "basketball_mens" → "Men's Basketball"
  if (sportName.includes('_')) {
    const parts = sportName.split('_');
    const lastPart = parts[parts.length - 1].toLowerCase();
    if (lastPart === 'mens' || lastPart === 'womens') {
      const sport = parts.slice(0, -1).join(' ');
      const genderPrefix = lastPart === 'mens' ? "Men's" : "Women's";
      return `${genderPrefix} ${toTitleCase(sport)}`;
    }
    return parts.map((word) => toTitleCase(word)).join(' ');
  }

  return toTitleCase(sportName);
}

// ============================================
// SPORT IDENTIFIERS & NAMES
// ============================================

export const SPORT_IDS = {
  FOOTBALL: 'football',
  FIELD_HOCKEY: 'field_hockey',
  BASKETBALL_MENS: 'basketball_mens',
  BASKETBALL_WOMENS: 'basketball_womens',
  BASEBALL: 'baseball',
  SOFTBALL: 'softball',
  SOCCER_MENS: 'soccer_mens',
  SOCCER_WOMENS: 'soccer_womens',
  LACROSSE_MENS: 'lacrosse_mens',
  LACROSSE_WOMENS: 'lacrosse_womens',
  GOLF_MENS: 'golf_mens',
  GOLF_WOMENS: 'golf_womens',
  TRACK_FIELD_MENS: 'track_field_mens',
  TRACK_FIELD_WOMENS: 'track_field_womens',
  CROSS_COUNTRY_MENS: 'cross_country_mens',
  CROSS_COUNTRY_WOMENS: 'cross_country_womens',
  VOLLEYBALL_MENS: 'volleyball_mens',
  VOLLEYBALL_WOMENS: 'volleyball_womens',
  ROWING_MENS: 'rowing_mens',
  ROWING_WOMENS: 'rowing_womens',
  WRESTLING: 'wrestling',
  BOWLING_WOMENS: 'bowling_womens',
  ICE_HOCKEY_MENS: 'ice_hockey_mens',
  ICE_HOCKEY_WOMENS: 'ice_hockey_womens',
  TENNIS_MENS: 'tennis_mens',
  TENNIS_WOMENS: 'tennis_womens',
  SWIMMING_DIVING_MENS: 'swimming_diving_mens',
  SWIMMING_DIVING_WOMENS: 'swimming_diving_womens',
  GYMNASTICS_MENS: 'gymnastics_mens',
  GYMNASTICS_WOMENS: 'gymnastics_womens',
  WATER_POLO_MENS: 'water_polo_mens',
  WATER_POLO_WOMENS: 'water_polo_womens',
} as const;

export type SportId = (typeof SPORT_IDS)[keyof typeof SPORT_IDS];

export const SPORTS: readonly string[] = [
  'Football',
  'Basketball Mens',
  'Basketball Womens',
  'Baseball',
  'Softball',
  'Soccer Mens',
  'Soccer Womens',
  'Lacrosse Mens',
  'Lacrosse Womens',
  'Volleyball Mens',
  'Volleyball Womens',
  'Golf Mens',
  'Golf Womens',
  'Track & Field Mens',
  'Track & Field Womens',
  'Cross Country Mens',
  'Cross Country Womens',
  'Field Hockey',
  'Ice Hockey Mens',
  'Ice Hockey Womens',
  'Tennis Mens',
  'Tennis Womens',
  'Swimming & Diving Mens',
  'Swimming & Diving Womens',
  'Rowing Mens',
  'Rowing Womens',
  'Wrestling',
  'Gymnastics Mens',
  'Gymnastics Womens',
  'Water Polo Mens',
  'Water Polo Womens',
  'Bowling Womens',
] as const;

export type SportName = (typeof SPORTS)[number];

// ============================================
// POSITIONS & ABBREVIATIONS
// ============================================

export const SPORT_POSITIONS: Record<string, readonly string[]> = {
  football: [
    'Quarterback',
    'Running Back',
    'Full Back',
    'Wide Receiver',
    'Tight End',
    'Center',
    'Offensive Line',
    'Guard',
    'Left Guard',
    'Right Guard',
    'Tackle',
    'Left Tackle',
    'Right Tackle',
    'Defensive Line',
    'Defensive Tackle',
    'Defensive End',
    'Linebacker',
    'Middle Linebacker',
    'Outside Linebacker',
    'Cornerback',
    'Safety',
    'Free Safety',
    'Strong Safety',
    'Kicker',
    'Punter',
    'Long Snapper',
    'Athlete',
  ],
  basketball: ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center'],
  baseball: [
    'Pitcher',
    'Catcher',
    '1st Baseman',
    '2nd Baseman',
    '3rd Baseman',
    'Shortstop',
    'Infielder',
    'Outfielder',
    'Designated Hitter',
  ],
  softball: [
    'Pitcher',
    'Catcher',
    '1st Baseman',
    '2nd Baseman',
    '3rd Baseman',
    'Shortstop',
    'Outfielder',
    'Infielder',
  ],
  soccer: [
    'Forward',
    'Midfielder',
    'Defender',
    'Goal Keeper',
    'Center Back',
    'Full Back',
    'Wing Back',
    'Striker',
  ],
  lacrosse: ['Attackman', 'Midfielder', 'Defender', 'Goal Keeper', 'Face Off Specialist'],
  volleyball: [
    'Outside Hitter',
    'Middle Blocker',
    'Opposite Hitter',
    'Setter',
    'Libero',
    'Defensive Specialist',
    'Serving Specialist',
  ],
  ice_hockey: ['Center', 'Winger', 'Defensemen', 'Goalie'],
  field_hockey: ['Forward/Striker', 'Midfielder', 'Fullback/Defender', 'Sweeper', 'Goalie'],
  tennis: ['Singles Player', 'Doubles Player'],
  golf: ['Golfer'],
  track_field: ['Sprinter', 'Distance Runner', 'Hurdler', 'Jumper', 'Thrower'],
  cross_country: ['Harrier', 'Runner'],
  swimming_diving: ['Swimmer', 'Diver'],
  water_polo: ['Goal Keeper', 'Wing', 'Driver', 'Point', 'Center Forward'],
  wrestling: ['Wrestler'],
  rowing: ['Coxswain', 'Rower'],
  gymnastics: ['All Arounder', 'Vault', 'Uneven Bars', 'Balance Beam', 'Floor Exercise'],
  bowling: ['Table Setter', 'Middle', 'Setup', 'Anchor'],
} as const;

export const POSITION_ABBREVIATIONS: Record<string, Record<string, string>> = {
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
    'middle linebacker': 'MLB',
    'outside linebacker': 'OLB',
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
  softball: {
    pitcher: 'P',
    catcher: 'C',
    '1st baseman': '1B',
    '2nd baseman': '2B',
    '3rd baseman': '3B',
    shortstop: 'SS',
    outfielder: 'OF',
    infielder: 'IF',
  },
  soccer: {
    forward: 'F',
    'forward/striker': 'ST',
    midfielder: 'MF',
    defender: 'D',
    'goal keeper': 'GK',
    'center back': 'CB',
    'full back': 'FB',
    'wing back': 'WB',
    striker: 'ST',
  },
  lacrosse: {
    attackman: 'A',
    attack: 'A',
    midfielder: 'M',
    defender: 'D',
    'goal keeper': 'G',
    'face off specialist': 'FO',
  },
  volleyball: {
    'outside hitter': 'OH',
    'middle blocker': 'MB',
    'opposite hitter': 'OPP',
    'right side hitter': 'RS',
    setter: 'S',
    libero: 'L',
    'defensive specialist': 'DS',
  },
  ice_hockey: {
    center: 'C',
    'left wing': 'LW',
    'right wing': 'RW',
    winger: 'W',
    defensemen: 'D',
    goalie: 'G',
  },
  water_polo: {
    'goal keeper': 'GK',
    'center back': 'CB',
    'center forward': 'CF',
    driver: 'DR',
    wing: 'W',
    point: 'P',
  },
};

export const POSITION_MAPPING_BY_SPORT = POSITION_ABBREVIATIONS;

// ============================================
// DEFAULT SPORTS (Single Source of Truth)
// ============================================
// ⚠️ MUST MATCH v1 nxt1/src/app/shared/const.ts SPORTS array exactly
// These are the official NCAA sport names used throughout the platform.
// Order matches v1 for consistency across web, mobile, and backend.

export const DEFAULT_SPORTS: SportCell[] = [
  // Core Sports - ordered by popularity/participation
  { name: 'Football', icon: '🏈' },
  { name: 'Basketball Mens', icon: '🏀' },
  { name: 'Basketball Womens', icon: '🏀' },
  { name: 'Baseball', icon: '⚾' },
  { name: 'Softball', icon: '🥎' },
  { name: 'Soccer Mens', icon: '⚽' },
  { name: 'Soccer Womens', icon: '⚽' },
  { name: 'Lacrosse Mens', icon: '🥍' },
  { name: 'Lacrosse Womens', icon: '🥍' },
  { name: 'Volleyball Mens', icon: '🏐' },
  { name: 'Volleyball Womens', icon: '🏐' },
  { name: 'Golf Mens', icon: '⛳' },
  { name: 'Golf Womens', icon: '⛳' },
  { name: 'Track & Field Mens', icon: '🏃' },
  { name: 'Track & Field Womens', icon: '🏃‍♀️' },
  { name: 'Cross Country Mens', icon: '🏃‍♂️' },
  { name: 'Cross Country Womens', icon: '🏃‍♀️' },
  { name: 'Field Hockey', icon: '🏑' },
  { name: 'Ice Hockey Mens', icon: '🏒' },
  { name: 'Ice Hockey Womens', icon: '🏒' },
  { name: 'Tennis Mens', icon: '🎾' },
  { name: 'Tennis Womens', icon: '🎾' },
  { name: 'Swimming & Diving Mens', icon: '🏊' },
  { name: 'Swimming & Diving Womens', icon: '🏊‍♀️' },
  { name: 'Rowing Mens', icon: '🚣' },
  { name: 'Rowing Womens', icon: '🚣‍♀️' },
  { name: 'Wrestling', icon: '🤼' },
  { name: 'Gymnastics Mens', icon: '🤸' },
  { name: 'Gymnastics Womens', icon: '🤸‍♀️' },
  { name: 'Water Polo Mens', icon: '🤽' },
  { name: 'Water Polo Womens', icon: '🤽‍♀️' },
  { name: 'Bowling Womens', icon: '🎳' },
];

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
// ATHLETIC INFO FIELDS BY SPORT
// ============================================

export const ATHLETIC_INFO_FIELDS: Record<string, readonly FieldDefinition[]> = {
  football: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'jersey_number', label: 'Jersey Number', type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: '40_yard_dash', label: '40 Yard Dash', type: 'text', unit: 'sec' },
    { field: '5_10_5_shuttle', label: '5-10-5 Shuttle', type: 'text', unit: 'sec' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
    { field: 'broad_jump', label: 'Broad Jump', type: 'text', unit: 'in' },
    { field: 'max_bench', label: 'Max Bench', type: 'text', unit: 'lbs' },
    { field: 'max_squat', label: 'Max Squat', type: 'text', unit: 'lbs' },
  ],
  basketball: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'jersey_number', label: 'Jersey Number', type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: 'wing_span', label: 'Wing Span', type: 'text' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
    { field: 'no_step_vertical_jump', label: 'No Step Vertical Jump', type: 'text', unit: 'in' },
    { field: '3_4_sprint_time', label: '3/4 Sprint Time', type: 'text', unit: 'sec' },
    { field: '20m_sprint_time', label: '20m Sprint Time', type: 'text', unit: 'sec' },
    { field: 'lane_agility_time', label: 'Lane Agility Time', type: 'text', unit: 'sec' },
    { field: 'reactive_shuttle_time', label: 'Reactive Shuttle Time', type: 'text', unit: 'sec' },
    { field: 'max_bench', label: 'Max Bench', type: 'text', unit: 'lbs' },
  ],
  baseball: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'jersey_number', label: 'Jersey Number', type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: 'pitch_speed', label: 'Pitch Speed', type: 'text', unit: 'mph' },
    { field: 'home_to_1st_base', label: 'Home to 1st Base', type: 'text', unit: 'sec' },
    { field: '3_cone_drill', label: '3 Cone Drill', type: 'text', unit: 'sec' },
    { field: '60_yard_dash', label: '60 Yard Dash', type: 'text', unit: 'sec' },
    { field: '20_yard_dash', label: '20 Yard Dash', type: 'text', unit: 'sec' },
    { field: '5_10_5_shuttle', label: '5-10-5 Shuttle', type: 'text', unit: 'sec' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
    { field: 'broad_jump', label: 'Broad Jump', type: 'text', unit: 'in' },
    { field: 'rotational_power_ball_throw', label: 'Rotational Power Ball Throw', type: 'text' },
    { field: 'medicine_ball_throw', label: 'Medicine Ball Throw', type: 'text' },
  ],
  softball: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'jersey_number', label: 'Jersey Number', type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: 'pitch_speed', label: 'Pitch Speed', type: 'text', unit: 'mph' },
    { field: 'home_to_1st_base', label: 'Home to 1st Base', type: 'text', unit: 'sec' },
    { field: '3_cone_drill', label: '3 Cone Drill', type: 'text', unit: 'sec' },
    { field: '60_yard_dash', label: '60 Yard Dash', type: 'text', unit: 'sec' },
    { field: '20_yard_dash', label: '20 Yard Dash', type: 'text', unit: 'sec' },
    { field: '5_10_5_shuttle', label: '5-10-5 Shuttle', type: 'text', unit: 'sec' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
    { field: 'broad_jump', label: 'Broad Jump', type: 'text', unit: 'in' },
  ],
  soccer: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'jersey_number', label: 'Jersey Number', type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: '30m_dash', label: '30m Dash', type: 'text', unit: 'sec' },
    { field: '5_10_5_shuttle', label: '5-10-5 Shuttle', type: 'text', unit: 'sec' },
    { field: '505_agility_test', label: '505 Agility Test', type: 'text', unit: 'sec' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
  ],
  lacrosse: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'jersey_number', label: 'Jersey Number', type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: '10_yard_split', label: '10 Yard Split', type: 'text', unit: 'sec' },
    { field: '40_yard_dash', label: '40 Yard Dash', type: 'text', unit: 'sec' },
    { field: 'shot_speed', label: 'Shot Speed', type: 'text', unit: 'mph' },
    { field: 'shuttle_run', label: 'Shuttle Run', type: 'text', unit: 'sec' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
    { field: 'power_ball_toss', label: 'Power Ball Toss', type: 'text' },
  ],
  volleyball: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'jersey_number', label: 'Jersey Number', type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: 'approach_jump', label: 'Approach Jump', type: 'text', unit: 'in' },
    { field: 'broad_jump', label: 'Broad Jump', type: 'text', unit: 'in' },
    { field: 'standing_reach', label: 'Standing Reach', type: 'text', unit: 'in' },
    { field: '5_10_5_shuttle', label: '5-10-5 Shuttle', type: 'text', unit: 'sec' },
  ],
  ice_hockey: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'jersey_number', label: 'Jersey Number', type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: 'wing_span', label: 'Wing Span', type: 'text' },
    { field: 'wingate_test', label: 'Wingate Test', type: 'text' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
    { field: 'broad_jump', label: 'Broad Jump', type: 'text', unit: 'in' },
    { field: '5_10_5_shuttle', label: '5-10-5 Shuttle', type: 'text', unit: 'sec' },
    { field: 'max_bench', label: 'Max Bench', type: 'text', unit: 'lbs' },
  ],
  tennis: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'jersey_number', label: 'Jersey Number', type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: '20m_sprint', label: '20m Sprint', type: 'text', unit: 'sec' },
    { field: '5_10_5_shuttle', label: '5-10-5 Shuttle', type: 'text', unit: 'sec' },
    { field: '505_agility_test', label: '505 Agility Test', type: 'text', unit: 'sec' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
  ],
  golf: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'jersey_number', label: 'Jersey Number', type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: 'average_score', label: 'Average Score', type: 'text' },
    { field: 'fairways_in_regulation_pct', label: 'Fairways in Regulation %', type: 'text' },
    { field: 'greens_in_regulation_pct', label: 'Greens in Regulation %', type: 'text' },
    { field: 'putting_average', label: 'Putting Average', type: 'text' },
    { field: 'handicap', label: 'Handicap', type: 'text' },
    { field: 'average_drive_distance', label: 'Average Drive Distance', type: 'text', unit: 'yds' },
    {
      field: 'tournament_score_differential',
      label: 'Tournament Score Differential',
      type: 'text',
    },
  ],
  track_field: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: 'max_squat', label: 'Max Squat', type: 'text', unit: 'lbs' },
    { field: 'broad_jump', label: 'Broad Jump', type: 'text', unit: 'in' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
    { field: 'max_bench', label: 'Max Bench', type: 'text', unit: 'lbs' },
  ],
  cross_country: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'jersey_number', label: 'Jersey Number', type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: '800_meter_time', label: '800 Meter Time', type: 'text' },
    { field: 'mile_time', label: 'Mile Time', type: 'text' },
    { field: '2_mile_time', label: '2 Mile Time', type: 'text' },
    { field: '5k_time', label: '5K Time', type: 'text' },
    { field: '10k_time', label: '10K Time', type: 'text' },
  ],
  swimming_diving: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: 'vo2_max_test', label: 'VO2 Max Test', type: 'text' },
    { field: 'broad_jump', label: 'Broad Jump', type: 'text', unit: 'in' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
  ],
  water_polo: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: 'vo2_max_test', label: 'VO2 Max Test', type: 'text' },
    { field: 'water_vertical_jump', label: 'Water Vertical Jump', type: 'text', unit: 'in' },
    { field: 'wist', label: 'WIST', type: 'text' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
    { field: 'bench_press', label: 'Bench Press', type: 'text', unit: 'lbs' },
  ],
  wrestling: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: 'wing_span', label: 'Wing Span', type: 'text' },
    { field: 'max_bench', label: 'Max Bench', type: 'text', unit: 'lbs' },
    { field: 'dead_lift', label: 'Dead Lift', type: 'text', unit: 'lbs' },
    { field: 'squat', label: 'Squat', type: 'text', unit: 'lbs' },
    { field: '1_mile_time', label: '1 Mile Time', type: 'text' },
    { field: '40_yard_dash', label: '40 Yard Dash', type: 'text', unit: 'sec' },
    { field: '5_10_5_shuttle', label: '5-10-5 Shuttle', type: 'text', unit: 'sec' },
    { field: 'record', label: 'Record', type: 'text' },
    { field: 'takedowns', label: 'Takedowns', type: 'text' },
    { field: 'falls', label: 'Falls', type: 'text' },
  ],
  gymnastics: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: 'gymnastics_level', label: 'Gymnastics Level', type: 'text' },
  ],
  field_hockey: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'jersey_number', label: 'Jersey Number', type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: '20m_shuttle_run', label: '20m Shuttle Run', type: 'text', unit: 'sec' },
    { field: '5_10_5_shuttle', label: '5-10-5 Shuttle', type: 'text', unit: 'sec' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
    { field: 'max_bench', label: 'Max Bench', type: 'text', unit: 'lbs' },
    { field: 'max_squat', label: 'Max Squat', type: 'text', unit: 'lbs' },
  ],
  rowing: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: '500m_ergo_test', label: '500m Ergo Test', type: 'text' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
    { field: 'strokes_per_minute', label: 'Strokes Per Minute', type: 'text' },
    { field: '2k_erg_time', label: '2K Erg Time', type: 'text' },
  ],
  bowling: [
    { field: 'height', label: 'Height', required: true },
    { field: 'weight', label: 'Weight', required: true, unit: 'lbs' },
    { field: 'highlight_link', label: 'Highlight Link', required: true, type: 'text' },
    { field: 'jersey_number', label: 'Jersey Number', type: 'text' },
    { field: 'accolades', label: 'Accolades', type: 'text' },
    { field: 'release_rpm', label: 'Release RPM', type: 'text' },
    { field: 'release_ratio', label: 'Release Ratio', type: 'text' },
    { field: 'broad_jump', label: 'Broad Jump', type: 'text', unit: 'in' },
    { field: 'vertical_jump', label: 'Vertical Jump', type: 'text', unit: 'in' },
    { field: 'grip_strength', label: 'Grip Strength', type: 'text' },
  ],
} as const;

// ============================================
// STATS FIELDS BY SPORT
// ============================================

export const SPORT_STATS: Record<string, Record<string, readonly FieldDefinition[]>> = {
  football: {
    offense: [
      { field: 'passing_yards', label: 'Passing Yards' },
      { field: 'passing_touchdowns', label: 'Passing Touchdowns' },
      { field: 'completion_pct', label: 'Completion %' },
      { field: 'rushing_yards', label: 'Rushing Yards' },
      { field: 'rushing_touchdowns', label: 'Rushing Touchdowns' },
      { field: 'pancakes', label: 'Pancakes' },
      { field: 'receptions', label: 'Receptions' },
      { field: 'receiving_yards', label: 'Receiving Yards' },
      { field: 'receiving_touchdowns', label: 'Receiving Touchdowns' },
    ],
    defense: [
      { field: 'total_tackles', label: 'Total Tackles' },
      { field: 'tackles_for_loss', label: 'Tackles for Loss' },
      { field: 'average_tackles_per_game', label: 'Average Tackles Per Game' },
      { field: 'sacks', label: 'Sacks' },
      { field: 'forced_fumbles', label: 'Forced Fumbles' },
      { field: 'interceptions', label: 'Interceptions' },
      { field: 'passes_defended', label: 'Passes Defended' },
      { field: 'defensive_touchdowns', label: 'Defensive Touchdowns' },
    ],
    special_teams: [
      { field: 'kickoff_return_yards', label: 'Kickoff Return Yards' },
      { field: 'average_kickoff_return_yards', label: 'Average Kickoff Return Yards' },
      { field: 'punt_return_yards', label: 'Punt Return Yards' },
      { field: 'average_punt_return_yards', label: 'Average Punt Return Yards' },
      { field: 'kickoff_return_touchdowns', label: 'Kickoff Return Touchdowns' },
      { field: 'punt_return_touchdowns', label: 'Punt Return Touchdowns' },
      { field: 'extra_points_made', label: 'Extra Points Made' },
      { field: 'field_goals_made', label: 'Field Goals Made' },
      { field: 'longest_field_goal', label: 'Longest Field Goal' },
      { field: 'punting_yard_average', label: 'Punting Yard Average' },
      { field: 'longest_punt', label: 'Longest Punt' },
      { field: 'blocked_punts_field_goals', label: 'Blocked Punts/Field Goals' },
    ],
  },
  basketball: {
    offense: [
      { field: 'points_per_game', label: 'Points Per Game' },
      { field: 'field_goal_pct', label: 'Field Goal %' },
      { field: '3_point_pct', label: '3 Point %' },
      { field: 'free_throw_pct', label: 'Free Throw %' },
      { field: 'offensive_rebounds_per_game', label: 'Offensive Rebounds Per Game' },
      { field: 'assists_per_game', label: 'Assists Per Game' },
    ],
    defense: [
      { field: 'blocks_per_game', label: 'Blocks Per Game' },
      { field: 'steals_per_game', label: 'Steals Per Game' },
      { field: 'defensive_rebounds_per_game', label: 'Defensive Rebounds Per Game' },
    ],
  },
  baseball: {
    offense: [
      { field: 'batting_average', label: 'Batting Average' },
      { field: 'home_runs', label: 'Home Runs' },
      { field: 'slugging_pct', label: 'Slugging %' },
      { field: 'rbi', label: 'RBI' },
      { field: 'runs', label: 'Runs' },
      { field: 'on_base_pct', label: 'On Base %' },
      { field: 'stolen_bases', label: 'Stolen Bases' },
    ],
    defense: [
      { field: 'era', label: 'ERA' },
      { field: 'strike_outs', label: 'Strike Outs' },
      { field: 'no_hitters', label: 'No Hitters' },
      { field: 'fielding_percentage', label: 'Fielding Percentage' },
    ],
  },
  softball: {
    offense: [
      { field: 'batting_average', label: 'Batting Average' },
      { field: 'home_runs', label: 'Home Runs' },
      { field: 'slugging_pct', label: 'Slugging %' },
      { field: 'rbi', label: 'RBI' },
      { field: 'runs', label: 'Runs' },
      { field: 'on_base_pct', label: 'On Base %' },
      { field: 'stolen_bases', label: 'Stolen Bases' },
    ],
    defense: [
      { field: 'era', label: 'ERA' },
      { field: 'strike_outs', label: 'Strike Outs' },
      { field: 'no_hitters', label: 'No Hitters' },
      { field: 'fielding_percentage', label: 'Fielding Percentage' },
    ],
  },
  soccer: {
    offense: [
      { field: 'goals_scored', label: 'Goals Scored' },
      { field: 'assists', label: 'Assists' },
      { field: 'assists_per_game', label: 'Assists Per Game' },
      { field: 'points', label: 'Points' },
      { field: 'points_per_game', label: 'Points Per Game' },
      { field: 'shots_on_goal', label: 'Shots On Goal' },
      { field: 'shots_on_goal_pct', label: 'Shots On Goal %' },
    ],
    defense: [
      { field: 'steals', label: 'Steals' },
      { field: 'saves_per_match', label: 'Saves Per Match' },
      { field: 'goals_saved', label: 'Goals Saved' },
      { field: 'saved_pct', label: 'Saved %' },
      { field: 'goals_against_average', label: 'Goals Against Average' },
    ],
  },
  lacrosse: {
    offense: [
      { field: 'goals', label: 'Goals' },
      { field: 'assists', label: 'Assists' },
      { field: 'points', label: 'Points' },
      { field: 'points_per_game', label: 'Points Per Game' },
      { field: 'assists_per_game', label: 'Assists Per Game' },
      { field: 'ground_balls_per_game', label: 'Ground Balls Per Game' },
      { field: 'shooting_pct', label: 'Shooting %' },
    ],
    defense: [
      { field: 'take_aways', label: 'Take Aways' },
      { field: 'goals_against_average', label: 'Goals Against Average' },
      { field: 'goals_allowed', label: 'Goals Allowed' },
      { field: 'goals_saved', label: 'Goals Saved' },
      { field: 'save_pct', label: 'Save %' },
      { field: 'steals', label: 'Steals' },
    ],
  },
  volleyball: {
    offense: [
      { field: 'serving_aces', label: 'Serving Aces' },
      { field: 'aces_per_game', label: 'Aces per Game' },
      { field: 'assists_per_game', label: 'Assists per Game' },
      { field: 'assists', label: 'Assists' },
      { field: 'digs', label: 'Digs' },
      { field: 'digs_per_game', label: 'Digs per Game' },
      { field: 'hitting_pct', label: 'Hitting %' },
      { field: 'kills', label: 'Kills' },
      { field: 'kills_per_game', label: 'Kills per Game' },
    ],
    defense: [
      { field: 'blocks_per_game', label: 'Blocks per Game' },
      { field: 'block_assists', label: 'Block Assists' },
      { field: 'solo_blocks', label: 'Solo Blocks' },
      { field: 'total_blocks', label: 'Total Blocks' },
    ],
  },
  ice_hockey: {
    offense: [
      { field: 'points', label: 'Points' },
      { field: 'goals', label: 'Goals' },
      { field: 'assists', label: 'Assists' },
      { field: 'shots_on_goal', label: 'Shots on Goal' },
      { field: 'shooting_pct', label: 'Shooting %' },
    ],
    defense: [
      { field: 'saves', label: 'Saves' },
      { field: 'saves_pct', label: 'Saves %' },
      { field: 'shut_out_save_pct', label: 'Shut Out Save %' },
      { field: 'shots_against', label: 'Shots Against' },
      { field: 'goals_against_average', label: 'Goals Against Average' },
    ],
  },
  tennis: {
    all: [
      { field: 'aces', label: 'Aces' },
      { field: 'break_points', label: 'Break Points' },
      { field: 'games_won', label: 'Games Won' },
      { field: '1st_serve_points_won', label: '1st Serve Points Won' },
      { field: '2nd_serve_points_won', label: '2nd Serve Points Won' },
      { field: 'points_won', label: 'Points Won' },
      { field: 'win_pct_on_1st_serve', label: 'Win % on 1st Serve' },
      { field: 'win_pct_on_2nd_serve', label: 'Win % on 2nd Serve' },
    ],
  },
  track_field: {
    track: [
      { field: '100_meter', label: '100 Meter' },
      { field: '200_meter', label: '200 Meter' },
      { field: '400_meter', label: '400 Meter' },
      { field: '800_meter', label: '800 Meter' },
      { field: '1500_meter', label: '1500 Meter' },
      { field: '1600_meter', label: '1600 Meter' },
      { field: '3000_meter', label: '3000 Meter' },
      { field: '3200_meter', label: '3200 Meter' },
      { field: '5k', label: '5K' },
      { field: '2000_steeple', label: '2000 Steeple' },
      { field: '3000_steeple', label: '3000 Steeple' },
      { field: '100_meter_hurdles', label: '100 Meter Hurdles' },
      { field: '300_meter_hurdles', label: '300 Meter Hurdles' },
      { field: '400_meter_hurdles', label: '400 Meter Hurdles' },
    ],
    field: [
      { field: 'high_jump', label: 'High Jump' },
      { field: 'long_jump', label: 'Long Jump' },
      { field: 'triple_jump', label: 'Triple Jump' },
      { field: 'pole_vault', label: 'Pole Vault' },
      { field: 'discus', label: 'Discus' },
      { field: 'hammer', label: 'Hammer' },
      { field: 'javelin', label: 'Javelin' },
      { field: 'shot_put', label: 'Shot Put' },
    ],
  },
  swimming_diving: {
    swimming: [
      { field: '50_free_time', label: '50 Free Time' },
      { field: '100_fly_time', label: '100 Fly Time' },
      { field: '100_free_time', label: '100 Free Time' },
      { field: '100_back_time', label: '100 Back Time' },
      { field: '100_breast_time', label: '100 Breast Time' },
      { field: '200_free_time', label: '200 Free Time' },
      { field: '200_individual_medley_time', label: '200 Individual Medley Time' },
      { field: '500_free_time', label: '500 Free Time' },
    ],
    diving: [
      { field: 'one_meter_total_points', label: 'One Meter Total Points' },
      { field: 'one_meter_dives', label: 'One Meter Dives' },
      { field: 'three_meter_total_points', label: 'Three Meter Total Points' },
      { field: 'three_meter_dives', label: 'Three Meter Dives' },
      { field: 'platform_5_meter_total_points', label: 'Platform 5 Meter Total Points' },
      { field: 'platform_5_meter_dives', label: 'Platform 5 Meter Dives' },
      { field: 'platform_10_meter_total_points', label: 'Platform 10 Meter Total Points' },
      { field: 'platform_10_meter_dives', label: 'Platform 10 Meter Dives' },
    ],
  },
  water_polo: {
    offense: [
      { field: 'points', label: 'Points' },
      { field: 'goals', label: 'Goals' },
      { field: 'goals_per_game', label: 'Goals Per Game' },
      { field: 'assists', label: 'Assists' },
      { field: 'assists_per_game', label: 'Assists Per Game' },
    ],
    defense: [
      { field: 'saves', label: 'Saves' },
      { field: 'shut_outs', label: 'Shut Outs' },
      { field: 'steals', label: 'Steals' },
      { field: 'goals_against_average', label: 'Goals Against Average' },
    ],
  },
  field_hockey: {
    offense: [
      { field: 'goals', label: 'Goals' },
      { field: 'goals_per_game', label: 'Goals Per Game' },
      { field: 'assists', label: 'Assists' },
      { field: 'assists_per_game', label: 'Assists Per Game' },
      { field: 'points', label: 'Points' },
    ],
    defense: [
      { field: 'defensive_saves', label: 'Defensive Saves' },
      { field: 'goals_against_average', label: 'Goals Against Average' },
      { field: 'saves_pct', label: 'Saves %' },
      { field: 'steals', label: 'Steals' },
    ],
  },
  bowling: {
    all: [
      { field: 'bowling_average', label: 'Bowling Average' },
      { field: 'average_tournament_score', label: 'Average Tournament Score' },
      { field: 'field_average', label: 'Field Average' },
      { field: 'average_differential', label: 'Average Differential' },
      { field: 'high_score', label: 'High Score' },
    ],
  },
} as const;

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
        'full back',
        'wide receiver',
        'tight end',
        'center',
        'offensive line',
        'guard',
        'left guard',
        'right guard',
        'tackle',
        'left tackle',
        'right tackle',
      ],
    },
    {
      category: 'Defense',
      positions: [
        'defensive line',
        'defensive tackle',
        'defensive end',
        'linebacker',
        'middle linebacker',
        'outside linebacker',
        'cornerback',
        'safety',
        'free safety',
        'strong safety',
      ],
    },
    { category: 'Special Teams', positions: ['kicker', 'punter', 'long snapper'] },
    { category: 'Athlete', positions: ['athlete'] },
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

// ============================================
// HELPERS (ACCESSORS)
// ============================================

export function getPositionAbbreviation(position: string, sportName?: string): string {
  if (!position) return '';

  const normalizedPosition = position.toLowerCase().trim();

  if (sportName) {
    const sportKey = normalizeSportKey(sportName);
    const sportMapping = POSITION_ABBREVIATIONS[sportKey];
    if (sportMapping && sportMapping[normalizedPosition]) {
      return sportMapping[normalizedPosition];
    }
  }

  for (const sportMapping of Object.values(POSITION_ABBREVIATIONS)) {
    if (sportMapping[normalizedPosition]) {
      return sportMapping[normalizedPosition];
    }
  }

  // No abbreviation found — return title-cased original (never lowercase)
  return position.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

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

export function getPositionsForSport(sportName: string): readonly string[] {
  const key = normalizeSportKey(sportName);
  if (SPORT_POSITIONS[key]) {
    return SPORT_POSITIONS[key];
  }

  const groups = SPORT_POSITION_GROUPS[key];
  if (groups) {
    return groups.flatMap((group) => group.positions);
  }

  const compactKey = key.replace(/_/g, '');
  if (SPORT_POSITION_GROUPS[compactKey]) {
    return SPORT_POSITION_GROUPS[compactKey].flatMap((group) => group.positions);
  }

  return [];
}

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

export function getAthleticInfoForSport(sportName: string): readonly FieldDefinition[] {
  const key = normalizeSportKey(sportName);
  return ATHLETIC_INFO_FIELDS[key] ?? [];
}

export function getRequiredAthleticInfo(sportName: string): readonly FieldDefinition[] {
  return getAthleticInfoForSport(sportName).filter((f) => f.required);
}

export function getStatsForSport(
  sportName: string
): Record<string, readonly FieldDefinition[]> | undefined {
  const key = normalizeSportKey(sportName);
  return SPORT_STATS[key];
}

export function isValidSport(sportName: string): boolean {
  const key = normalizeSportKey(sportName);
  return key in SPORT_POSITIONS || key in ATHLETIC_INFO_FIELDS;
}

export function getAllSports(): readonly string[] {
  return SPORTS;
}

// ============================================
// FIRESTORE COLLECTION KEYS
// ============================================

export const SPORTS_COLLECTION = 'Sports';
export const ACADEMIC_CATEGORIES_COLLECTION = 'AcademicCategories';
