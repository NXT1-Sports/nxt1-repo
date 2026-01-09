/**
 * @fileoverview Sport Configuration Constants
 * @module @nxt1/core/constants
 *
 * Complete sport-specific field definitions:
 * - Sport identifiers and display names
 * - Positions per sport
 * - Position abbreviations
 * - Athletic info/metrics fields per sport
 * - Stats categories per sport
 *
 * SOURCE OF TRUTH for all sport field configurations.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// SPORT IDENTIFIERS
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

// ============================================
// SPORTS LIST (Display Names)
// ============================================

export const SPORTS: readonly string[] = [
  'football',
  'field hockey',
  'basketball mens',
  'basketball womens',
  'baseball',
  'softball',
  'soccer mens',
  'soccer womens',
  'lacrosse mens',
  'lacrosse womens',
  'golf mens',
  'golf womens',
  'track & field mens',
  'track & field womens',
  'cross country mens',
  'cross country womens',
  'volleyball mens',
  'volleyball womens',
  'rowing mens',
  'rowing womens',
  'wrestling',
  'bowling womens',
  'ice hockey mens',
  'ice hockey womens',
  'tennis mens',
  'tennis womens',
  'swimming & diving mens',
  'swimming & diving womens',
  'gymnastics mens',
  'gymnastics womens',
  'water polo mens',
  'water polo womens',
] as const;

export type SportName = (typeof SPORTS)[number];

// ============================================
// FIELD DEFINITION TYPES
// ============================================

export interface FieldDefinition {
  /** Field identifier (snake_case) */
  field: string;
  /** Display label */
  label: string;
  /** Input type */
  type?: 'text' | 'number' | 'select' | 'time';
  /** Whether field is required */
  required?: boolean;
  /** Unit of measurement */
  unit?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Options for select type */
  options?: string[];
}

export interface StatCategory {
  category: string;
  fields: FieldDefinition[];
}

// ============================================
// POSITIONS BY SPORT
// ============================================

export const SPORT_POSITIONS: Record<string, readonly string[]> = {
  football: [
    'Quarterback',
    'Running Back',
    'Wide Receiver',
    'Tight End',
    'Center',
    'Guard',
    'Tackle',
    'Defensive Tackle',
    'Defensive End',
    'Linebacker',
    'Corner Back',
    'Safety',
    'Kicker',
    'Punter',
    'Long Snapper',
    'Athlete',
  ],
  basketball: [
    'Point Guard',
    'Shooting Guard',
    'Small Forward',
    'Power Forward',
    'Center',
  ],
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
  lacrosse: [
    'Attackman',
    'Midfielder',
    'Defender',
    'Goal Keeper',
    'Face Off Specialist',
  ],
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
  field_hockey: [
    'Forward/Striker',
    'Midfielder',
    'Fullback/Defender',
    'Sweeper',
    'Goalie',
  ],
  tennis: ['Singles Player', 'Doubles Player'],
  golf: ['Golfer'],
  track_field: ['Sprinter', 'Distance Runner', 'Hurdler', 'Jumper', 'Thrower'],
  cross_country: ['Harrier', 'Runner'],
  swimming_diving: ['Swimmer', 'Diver'],
  water_polo: ['Goal Keeper', 'Wing', 'Driver', 'Point', 'Center Forward'],
  wrestling: ['Wrestler'],
  rowing: ['Coxswain', 'Rower'],
  gymnastics: [
    'All Arounder',
    'Vault',
    'Uneven Bars',
    'Balance Beam',
    'Floor Exercise',
  ],
  bowling: ['Table Setter', 'Middle', 'Setup', 'Anchor'],
} as const;

// ============================================
// POSITION ABBREVIATIONS
// ============================================

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
    { field: 'tournament_score_differential', label: 'Tournament Score Differential', type: 'text' },
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
// HELPER FUNCTIONS
// ============================================

/**
 * Normalize sport name to key format
 * e.g., "Basketball (Mens)" -> "basketball"
 */
export function normalizeSportKey(sportName: string): string {
  return sportName
    .toLowerCase()
    .replace(/\s*\(mens\)|\s*\(womens\)/gi, '')
    .replace(/\s+&\s+/g, '_')
    .replace(/\s+/g, '_')
    .trim();
}

/**
 * Get positions for a sport
 */
export function getPositionsForSport(sportName: string): readonly string[] {
  const key = normalizeSportKey(sportName);
  return SPORT_POSITIONS[key] ?? [];
}

/**
 * Get athletic info fields for a sport
 */
export function getAthleticInfoForSport(sportName: string): readonly FieldDefinition[] {
  const key = normalizeSportKey(sportName);
  return ATHLETIC_INFO_FIELDS[key] ?? [];
}

/**
 * Get stats categories for a sport
 */
export function getStatsForSport(
  sportName: string
): Record<string, readonly FieldDefinition[]> | undefined {
  const key = normalizeSportKey(sportName);
  return SPORT_STATS[key];
}

/**
 * Get position abbreviation
 */
export function getPositionAbbreviation(sportName: string, position: string): string {
  const key = normalizeSportKey(sportName);
  const sportAbbreviations = POSITION_ABBREVIATIONS[key];
  if (!sportAbbreviations) return position;

  const normalized = position.toLowerCase();
  return sportAbbreviations[normalized] ?? position;
}

/**
 * Get required athletic info fields for a sport
 */
export function getRequiredAthleticInfo(sportName: string): readonly FieldDefinition[] {
  return getAthleticInfoForSport(sportName).filter((f) => f.required);
}

/**
 * Check if a sport exists
 */
export function isValidSport(sportName: string): boolean {
  const key = normalizeSportKey(sportName);
  return key in SPORT_POSITIONS || key in ATHLETIC_INFO_FIELDS;
}

/**
 * Get all sport names
 */
export function getAllSports(): readonly string[] {
  return SPORTS;
}
