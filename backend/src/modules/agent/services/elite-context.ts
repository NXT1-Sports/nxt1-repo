/**
 * @fileoverview Elite Context Builder — Deep user context for Agent X prompts
 * @module @nxt1/backend/modules/agent/services
 *
 * Builds a rich, role-aware context string from the user's Firestore document
 * so that Agent X playbook and briefing prompts are hyper-personalized.
 *
 * Handles graceful degradation: any missing field is silently omitted,
 * never producing "undefined" or broken sentences.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface SeasonInfo {
  readonly phase: string;
  readonly focus: string;
}

// ─── Sport Season Calendar ──────────────────────────────────────────────────

/** Shorthand season constructors for readability. */
const off = (focus?: string): SeasonInfo => ({
  phase: 'Off-Season',
  focus: focus ?? 'Recovery, skill development, and strength training',
});

const pre = (focus?: string): SeasonInfo => ({
  phase: 'Pre-Season',
  focus: focus ?? 'Conditioning, team building, and scheme installation',
});

const ins = (focus?: string): SeasonInfo => ({
  phase: 'In-Season',
  focus: focus ?? 'Competition, game prep, film review, and peak performance',
});

const post = (focus?: string): SeasonInfo => ({
  phase: 'Post-Season / Playoffs',
  focus: focus ?? 'Playoff preparation, recovery management, and championship pursuit',
});

/**
 * Normalise a sport key so it matches our season map regardless of casing,
 * underscores, or gendered suffixes.
 *
 * "basketball_mens" → "basketball"
 * "Soccer Womens"   → "soccer"
 * "Track & Field"   → "track"
 */
function normaliseSport(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s_]+/g, '_')
    .replace(/_?(mens|womens|men|women)$/i, '')
    .replace(/_+$/, '')
    .trim();
}

/**
 * Map of normalised sport key → 12-element array of season phases (Jan=0 … Dec=11).
 * Based on standard US high-school / college athletic calendars.
 */
// prettier-ignore
const SPORT_SEASONS: Record<string, readonly SeasonInfo[]> = {
  football: [
    /* Jan */ off(),
    /* Feb */ off(),
    /* Mar */ off('Spring practice and 7-on-7 prep'),
    /* Apr */ off('Spring practice and 7-on-7 prep'),
    /* May */ off('Camps, combines, and 7-on-7 tournaments'),
    /* Jun */ off('Camps, combines, and 7-on-7 tournaments'),
    /* Jul */ pre(),
    /* Aug */ pre('Fall camp and final prep'),
    /* Sep */ ins(),
    /* Oct */ ins(),
    /* Nov */ ins(),
    /* Dec */ post(),
  ],
  basketball: [
    /* Jan */ ins(),
    /* Feb */ ins(),
    /* Mar */ ins(),
    /* Apr */ post(),
    /* May */ off(),
    /* Jun */ off('AAU/club season, camps, and skill work'),
    /* Jul */ off('AAU/club season, camps, and skill work'),
    /* Aug */ off('AAU/club season, open gyms'),
    /* Sep */ off('Fall leagues and team tryouts'),
    /* Oct */ pre(),
    /* Nov */ ins(),
    /* Dec */ ins(),
  ],
  baseball: [
    /* Jan */ pre(),
    /* Feb */ pre('Spring training and scrimmages'),
    /* Mar */ ins(),
    /* Apr */ ins(),
    /* May */ ins(),
    /* Jun */ ins('Summer showcases and travel ball'),
    /* Jul */ off('Summer showcases and travel ball'),
    /* Aug */ off('Fall workouts and showcases'),
    /* Sep */ off('Fall ball and showcases'),
    /* Oct */ off(),
    /* Nov */ off(),
    /* Dec */ off(),
  ],
  softball: [
    /* Jan */ pre(),
    /* Feb */ pre('Spring training and scrimmages'),
    /* Mar */ ins(),
    /* Apr */ ins(),
    /* May */ ins(),
    /* Jun */ off('Summer travel ball and showcases'),
    /* Jul */ off('Summer travel ball and showcases'),
    /* Aug */ off('Fall workouts'),
    /* Sep */ off('Fall ball'),
    /* Oct */ off(),
    /* Nov */ off(),
    /* Dec */ off(),
  ],
  soccer: [
    /* Jan */ off(),
    /* Feb */ off(),
    /* Mar */ pre('Spring season / club season'),
    /* Apr */ ins('Spring season / club season'),
    /* May */ ins('Spring season / club season'),
    /* Jun */ off('Summer camps and club tournaments'),
    /* Jul */ off('Summer camps and club tournaments'),
    /* Aug */ pre(),
    /* Sep */ ins(),
    /* Oct */ ins(),
    /* Nov */ ins(),
    /* Dec */ post(),
  ],
  lacrosse: [
    /* Jan */ off('Winter training and indoor leagues'),
    /* Feb */ pre(),
    /* Mar */ ins(),
    /* Apr */ ins(),
    /* May */ ins(),
    /* Jun */ off('Summer leagues and camps'),
    /* Jul */ off('Summer leagues and camps'),
    /* Aug */ off(),
    /* Sep */ off('Fall ball'),
    /* Oct */ off('Fall ball'),
    /* Nov */ off(),
    /* Dec */ off(),
  ],
  volleyball: [
    /* Jan */ off(),
    /* Feb */ off(),
    /* Mar */ off('Club season and training'),
    /* Apr */ off('Club season and training'),
    /* May */ off('Club season and tournaments'),
    /* Jun */ off('Club season and camps'),
    /* Jul */ off('Camps and open gyms'),
    /* Aug */ pre(),
    /* Sep */ ins(),
    /* Oct */ ins(),
    /* Nov */ ins(),
    /* Dec */ post(),
  ],
  wrestling: [
    /* Jan */ ins(),
    /* Feb */ ins(),
    /* Mar */ post(),
    /* Apr */ off(),
    /* May */ off(),
    /* Jun */ off('Freestyle/Greco season and camps'),
    /* Jul */ off('Freestyle/Greco season and camps'),
    /* Aug */ off('Freestyle/Greco season and camps'),
    /* Sep */ off('Fall conditioning'),
    /* Oct */ pre(),
    /* Nov */ ins(),
    /* Dec */ ins(),
  ],
  track: [
    /* Jan */ off('Winter conditioning and indoor meets'),
    /* Feb */ ins('Indoor season'),
    /* Mar */ ins('Indoor/outdoor transition'),
    /* Apr */ ins(),
    /* May */ ins('Championship season'),
    /* Jun */ off(),
    /* Jul */ off('Summer training and camps'),
    /* Aug */ off(),
    /* Sep */ pre('Cross country / fall conditioning'),
    /* Oct */ ins('Cross country season'),
    /* Nov */ ins('Cross country season / regionals'),
    /* Dec */ off(),
  ],
  swimming: [
    /* Jan */ ins(),
    /* Feb */ ins(),
    /* Mar */ ins('Championship meets'),
    /* Apr */ off(),
    /* May */ off(),
    /* Jun */ off('Summer club season'),
    /* Jul */ off('Summer club season'),
    /* Aug */ off('Summer club season'),
    /* Sep */ pre(),
    /* Oct */ ins(),
    /* Nov */ ins(),
    /* Dec */ ins(),
  ],
  golf: [
    /* Jan */ off(),
    /* Feb */ off(),
    /* Mar */ ins('Spring season'),
    /* Apr */ ins('Spring season'),
    /* May */ ins('Spring season / championships'),
    /* Jun */ off('Summer tournaments'),
    /* Jul */ off('Summer tournaments'),
    /* Aug */ off('Summer tournaments'),
    /* Sep */ ins('Fall season'),
    /* Oct */ ins('Fall season'),
    /* Nov */ off(),
    /* Dec */ off(),
  ],
  ice_hockey: [
    /* Jan */ ins(),
    /* Feb */ ins(),
    /* Mar */ ins(),
    /* Apr */ post(),
    /* May */ off(),
    /* Jun */ off(),
    /* Jul */ off('Summer camps and development'),
    /* Aug */ off('Summer camps and development'),
    /* Sep */ pre(),
    /* Oct */ ins(),
    /* Nov */ ins(),
    /* Dec */ ins(),
  ],
  tennis: [
    /* Jan */ off('Winter training / indoor'),
    /* Feb */ off('Winter training / indoor'),
    /* Mar */ ins('Spring season'),
    /* Apr */ ins('Spring season'),
    /* May */ ins('Spring season / championships'),
    /* Jun */ off('Summer tournaments and camps'),
    /* Jul */ off('Summer tournaments and camps'),
    /* Aug */ off(),
    /* Sep */ ins('Fall season'),
    /* Oct */ ins('Fall season'),
    /* Nov */ off(),
    /* Dec */ off(),
  ],
  rowing: [
    /* Jan */ off('Winter erg training'),
    /* Feb */ off('Winter erg training'),
    /* Mar */ pre('Spring training'),
    /* Apr */ ins('Spring racing season'),
    /* May */ ins('Championship regattas'),
    /* Jun */ off(),
    /* Jul */ off(),
    /* Aug */ off(),
    /* Sep */ pre('Fall training'),
    /* Oct */ ins('Fall racing / Head races'),
    /* Nov */ ins('Fall racing'),
    /* Dec */ off(),
  ],
  gymnastics: [
    /* Jan */ ins(),
    /* Feb */ ins(),
    /* Mar */ ins(),
    /* Apr */ ins('Championship season'),
    /* May */ off(),
    /* Jun */ off('Summer camps and development'),
    /* Jul */ off('Summer camps and development'),
    /* Aug */ off(),
    /* Sep */ pre(),
    /* Oct */ ins(),
    /* Nov */ ins(),
    /* Dec */ ins(),
  ],
  water_polo: [
    /* Jan */ off(),
    /* Feb */ off(),
    /* Mar */ ins('Spring season'),
    /* Apr */ ins('Spring season'),
    /* May */ ins('Spring season'),
    /* Jun */ off('Summer club season'),
    /* Jul */ off('Summer club season'),
    /* Aug */ off(),
    /* Sep */ pre(),
    /* Oct */ ins('Fall season'),
    /* Nov */ ins('Fall season'),
    /* Dec */ post(),
  ],
  bowling: [
    /* Jan */ ins(),
    /* Feb */ ins(),
    /* Mar */ ins('Championship season'),
    /* Apr */ off(),
    /* May */ off(),
    /* Jun */ off(),
    /* Jul */ off(),
    /* Aug */ off(),
    /* Sep */ off(),
    /* Oct */ pre(),
    /* Nov */ ins(),
    /* Dec */ ins(),
  ],
  cross_country: [
    /* Jan */ off(),
    /* Feb */ off(),
    /* Mar */ off(),
    /* Apr */ off('Spring distance training'),
    /* May */ off('Summer base building'),
    /* Jun */ off('Summer base building'),
    /* Jul */ off('Summer mileage peak'),
    /* Aug */ pre(),
    /* Sep */ ins(),
    /* Oct */ ins(),
    /* Nov */ ins('Championship meets'),
    /* Dec */ off(),
  ],
  field_hockey: [
    /* Jan */ off(),
    /* Feb */ off(),
    /* Mar */ off('Spring leagues'),
    /* Apr */ off('Spring leagues'),
    /* May */ off(),
    /* Jun */ off('Summer camps'),
    /* Jul */ off('Summer camps'),
    /* Aug */ pre(),
    /* Sep */ ins(),
    /* Oct */ ins(),
    /* Nov */ post(),
    /* Dec */ off(),
  ],
};

/** Aliases for normalised keys that map to an existing calendar. */
const SPORT_ALIASES: Readonly<Record<string, string>> = {
  track_field: 'track',
  swimming_diving: 'swimming',
  hockey: 'ice_hockey',
};

/**
 * Get the season info for a sport at the current date.
 * Returns `null` if the sport is not in our calendar map (graceful degradation).
 */
export function getSeasonInfo(sportRaw: string, now: Date = new Date()): SeasonInfo | null {
  const key = normaliseSport(sportRaw);
  const resolved = SPORT_ALIASES[key] ?? key;
  const calendar = SPORT_SEASONS[resolved];
  if (!calendar) return null;
  return calendar[now.getMonth()] ?? null;
}

// ─── Role Tone / Persona ────────────────────────────────────────────────────

const ROLE_PERSONAS: Readonly<Record<string, string>> = {
  athlete: [
    `Adopt an encouraging, urgent, and mentorship-driven tone.`,
    `Speak like a trusted advisor who genuinely cares about this athlete's development, brand, and future.`,
    `Use motivating language that makes them want to take action immediately.`,
  ].join(' '),

  coach: [
    `Adopt a strategic, peer-to-peer, and professional tone.`,
    `Speak like a fellow coach — data-driven, practical, and focused on winning,`,
    `team culture, and player development. Be concise and actionable.`,
  ].join(' '),

  director: [
    `Adopt an executive, strategic, and organizational tone.`,
    `Think like a program administrator managing budgets, compliance, staff, and the big picture.`,
    `Prioritize efficiency and institutional goals.`,
  ].join(' '),

  recruiter: [
    `Adopt a sharp, evaluative, and professional tone.`,
    `Think like a talent evaluator on the road — focused on prospect identification,`,
    `relationship building, and competitive intel.`,
  ].join(' '),

  parent: [
    `Adopt a supportive, informative, and guiding tone.`,
    `Speak like a knowledgeable family advisor helping a parent navigate the sports landscape,`,
    `finances, scheduling, and their child's wellbeing. Be reassuring and clear.`,
  ].join(' '),
};

function getRolePersona(role: string): string {
  return ROLE_PERSONAS[role] ?? ROLE_PERSONAS['athlete'];
}

// ─── Elite Context Builder ──────────────────────────────────────────────────

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Build a rich, dynamic context paragraph from the user's Firestore data.
 * Every field is optional — if missing, that sentence is silently skipped.
 *
 * Returns a multi-line string ready to inject directly into an LLM prompt.
 */
export function buildEliteContext(
  userData: Record<string, unknown>,
  now: Date = new Date()
): string {
  const role = str(userData['role']) || 'athlete';
  const displayName = str(userData['displayName']);
  const location = buildLocation(userData);
  const primarySport = resolvePrimarySport(userData);
  const season = primarySport ? getSeasonInfo(primarySport, now) : null;

  const currentMonth = MONTH_NAMES[now.getMonth()];
  const currentYear = now.getFullYear();

  const lines: string[] = [];

  // 1 — Identity sentence (who is this user?)
  lines.push(buildIdentityLine(role, userData, displayName, primarySport, location));

  // 2 — Season / calendar context
  if (season && primarySport) {
    lines.push(
      `It is currently ${currentMonth} ${currentYear}.` +
        ` For ${primarySport}, this is the ${season.phase} period.` +
        ` Focus areas: ${season.focus}.`
    );
  } else {
    lines.push(`It is currently ${currentMonth} ${currentYear}.`);
  }

  // 3 — Role-specific deep context (profile gaps, team count, etc.)
  const roleContext = buildRoleContext(role, userData);
  if (roleContext) lines.push(roleContext);

  // 4 — Persona / tone instruction
  lines.push(getRolePersona(role));

  // 5 — Goal-vs-season harmonization mandate
  lines.push(
    [
      `CRITICAL: The user's stated goals are your #1 priority.`,
      `Use the calendar/season timing and their profile data as the ENVIRONMENT`,
      `and CONTEXT for HOW they should execute those goals right now —`,
      `never override or deprioritize their goals in favor of generic seasonal advice.`,
    ].join(' ')
  );

  return lines.join('\n\n');
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/** Safe string extraction — returns empty string for nullish / non-string values. */
function str(val: unknown): string {
  if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  return '';
}

function getActiveSportProfile(
  userData: Record<string, unknown>
): Record<string, unknown> | undefined {
  const sports = userData['sports'];
  if (!Array.isArray(sports) || sports.length === 0) return undefined;

  const activeSportIndex =
    typeof userData['activeSportIndex'] === 'number' ? (userData['activeSportIndex'] as number) : 0;

  return (
    (sports[activeSportIndex] as Record<string, unknown> | undefined) ??
    (sports[0] as Record<string, unknown> | undefined)
  );
}

/** V2-first: resolve team/org name from sports[].team.name, then legacy fields. */
function resolveV2TeamName(userData: Record<string, unknown>): string {
  const v2Name = getActiveSportProfile(userData)?.['team'] as Record<string, unknown> | undefined;
  return str(v2Name?.['name']) || str(userData['teamName']);
}

/** Build "City, State" location string from various possible field shapes. */
function buildLocation(userData: Record<string, unknown>): string {
  const city = str(userData['city']);
  const state = str(userData['state']);
  if (city && state) return `${city}, ${state}`;
  if (state) return state;
  if (city) return city;
  return str(userData['location']);
}

/**
 * Resolve the user's primary sport from whichever field source exists.
 * Checks: top-level `sport` → `sports[0].sport` → role-specific sport fields.
 */
export function resolvePrimarySport(userData: Record<string, unknown>): string {
  const activeSport = getActiveSportProfile(userData);
  const activeSportName = activeSport && str(activeSport['sport']);
  if (activeSportName) return activeSportName;

  const explicitPrimarySport = str(userData['primarySport']);
  if (explicitPrimarySport) return explicitPrimarySport;

  const topSport = str(userData['sport']);
  if (topSport) return topSport;

  const coach = userData['coach'] as Record<string, unknown> | undefined;
  if (coach) {
    const arr = coach['coachingSports'];
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0]);
  }

  const recruiter = userData['recruiter'] as Record<string, unknown> | undefined;
  if (recruiter) {
    const arr = recruiter['sports'];
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0]);
  }

  const director = userData['director'] as Record<string, unknown> | undefined;
  if (director) {
    const arr = director['overseeSports'];
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0]);
  }

  return '';
}

// ─── Identity Line Builders (one per role) ──────────────────────────────────

function buildIdentityLine(
  role: string,
  userData: Record<string, unknown>,
  displayName: string,
  primarySport: string,
  location: string
): string {
  const name = displayName || 'the user';

  switch (role) {
    case 'athlete':
      return buildAthleteIdentity(userData, name, primarySport, location);
    case 'coach':
      return buildCoachIdentity(userData, name, primarySport, location);
    case 'parent':
      return buildParentIdentity(userData, name, primarySport, location);
    case 'director':
      return buildDirectorIdentity(userData, name, location);
    case 'recruiter':
      return buildRecruiterIdentity(userData, name, primarySport, location);
    default:
      return `${name} is a ${role} on the NXT1 platform${location ? ` in ${location}` : ''}.`;
  }
}

function buildAthleteIdentity(
  userData: Record<string, unknown>,
  name: string,
  sport: string,
  location: string
): string {
  const parts: string[] = [`${name} is an athlete`];

  const classOf = userData['classOf'];
  if (classOf && typeof classOf === 'number') parts.push(`Class of ${classOf}`);

  const positions = resolvePositions(userData);
  if (positions) parts.push(positions);

  if (sport) parts.push(`in ${sport}`);

  const physicals = buildPhysicals(userData);
  if (physicals) parts.push(`(${physicals})`);

  const team = resolveV2TeamName(userData) || str(userData['school']);
  if (team) parts.push(`playing for ${team}`);

  if (location) parts.push(`in ${location}`);

  const academics = buildAcademics(userData);
  if (academics) parts.push(`— Academics: ${academics}`);

  return parts.join(', ').replace(/, —/, ' —') + '.';
}

function buildCoachIdentity(
  userData: Record<string, unknown>,
  name: string,
  sport: string,
  location: string
): string {
  const coach = userData['coach'] as Record<string, unknown> | undefined;
  const title = (coach && str(coach['title'])) || 'Coach';
  const team = resolveV2TeamName(userData);
  const level = resolveCoachingLevel(userData);

  const parts: string[] = [`${name} is a ${title}`];
  if (level) parts.push(`at the ${level} level`);
  if (sport) parts.push(`for ${sport}`);
  if (team) parts.push(`at ${team}`);
  if (location) parts.push(`in ${location}`);

  return parts.join(' ') + '.';
}

function buildParentIdentity(
  userData: Record<string, unknown>,
  name: string,
  sport: string,
  location: string
): string {
  const parent = userData['parent'] as Record<string, unknown> | undefined;
  const relationship = (parent && str(parent['relationship'])) || 'parent/guardian';

  const parts: string[] = [`${name} is a ${relationship} of a student-athlete`];
  if (sport) parts.push(`in ${sport}`);
  if (location) parts.push(`based in ${location}`);

  return parts.join(' ') + '.';
}

function buildDirectorIdentity(
  userData: Record<string, unknown>,
  name: string,
  location: string
): string {
  const director = userData['director'] as Record<string, unknown> | undefined;
  const title = (director && str(director['title'])) || 'Athletic Director';
  // V2-first: sports[].team.name → legacy director.organization → teamName
  const org = resolveV2TeamName(userData) || (director && str(director['organization']));

  const parts: string[] = [`${name} is a ${title}`];
  if (org) parts.push(`at ${org}`);
  if (location) parts.push(`in ${location}`);

  return parts.join(' ') + '.';
}

function buildRecruiterIdentity(
  userData: Record<string, unknown>,
  name: string,
  sport: string,
  location: string
): string {
  const recruiter = userData['recruiter'] as Record<string, unknown> | undefined;
  const title = (recruiter && str(recruiter['title'])) || 'Recruiter';
  const institution = recruiter && str(recruiter['institution']);
  // V2-first: sports[].team.name → legacy recruiter.organization
  const organization = resolveV2TeamName(userData) || (recruiter && str(recruiter['organization']));
  const division = recruiter && str(recruiter['division']);

  const parts: string[] = [`${name} is a ${title}`];
  if (division) parts.push(`(${division})`);
  if (institution) parts.push(`at ${institution}`);
  else if (organization) parts.push(`at ${organization}`);
  if (sport) parts.push(`for ${sport}`);
  if (location) parts.push(`in ${location}`);

  return parts.join(' ') + '.';
}

// ─── Field Extractors ───────────────────────────────────────────────────────

/** Resolve positions from the sports array or a top-level `position` field. */
function resolvePositions(userData: Record<string, unknown>): string {
  const activeSport = getActiveSportProfile(userData);
  if (activeSport) {
    const pos = activeSport['positions'];
    if (Array.isArray(pos) && pos.length > 0) return pos.join('/');

    const singlePos = str(activeSport['position']);
    if (singlePos) return singlePos;
  }
  const topPos = userData['position'];
  if (typeof topPos === 'string' && topPos.trim()) return topPos.trim();
  return '';
}

/** Build "height, weight" string, omitting any missing value. */
function buildPhysicals(userData: Record<string, unknown>): string {
  const parts: string[] = [];
  const measurables = userData['measurables'] as
    | Array<{ field: string; value: string | number }>
    | undefined;
  const height =
    str(userData['height']) ||
    measurables?.find((m) => m.field === 'height')?.value?.toString() ||
    '';
  const weight =
    str(userData['weight']) ||
    measurables?.find((m) => m.field === 'weight')?.value?.toString() ||
    '';
  if (height) parts.push(height);
  if (weight) parts.push(weight);
  return parts.join(', ');
}

/** Build academics summary string, omitting any missing value. */
function buildAcademics(userData: Record<string, unknown>): string {
  const parts: string[] = [];
  const gpa = userData['gpa'];
  if (gpa && (typeof gpa === 'number' || (typeof gpa === 'string' && gpa.trim()))) {
    parts.push(`GPA ${gpa}`);
  }
  return parts.join(', ');
}

// ─── Role-Specific Deep Context ─────────────────────────────────────────────

/**
 * Resolve the coaching level from the user's team type.
 * Checks sports[0].team.type.
 * Returns a display-friendly label or empty string.
 */
function resolveCoachingLevel(userData: Record<string, unknown>): string {
  // Try sports array first (primary sport team type)
  const team = getActiveSportProfile(userData)?.['team'] as Record<string, unknown> | undefined;
  const type = team && str(team['type']);
  if (type) return coachingLevelLabel(type);

  return '';
}

export function getRolePromptScaffolding(userData: Record<string, unknown>): string {
  const role = str(userData['role']) || 'athlete';
  const lines: string[] = [];

  const roleContext = buildRoleContext(role, userData);
  if (roleContext) lines.push(roleContext);

  lines.push(getRolePersona(role));

  return lines.join('\n');
}

/** Map team type slugs to display-friendly coaching level labels. */
function coachingLevelLabel(type: string): string {
  switch (type.toLowerCase()) {
    case 'high-school':
    case 'high_school':
    case 'hs':
      return 'high school';
    case 'middle-school':
    case 'middle_school':
    case 'ms':
      return 'middle school';
    case 'club':
      return 'club';
    case 'college':
      return 'college';
    case 'juco':
      return 'junior college';
    case 'organization':
      return 'organization';
    default:
      return type;
  }
}

/** Check if the coaching level represents a college/recruiting-focused role. */
function isCollegeLevelCoach(userData: Record<string, unknown>): boolean {
  const level = resolveCoachingLevel(userData);
  return level === 'college' || level === 'junior college';
}

/**
 * Build role-specific supplementary context beyond the identity line.
 * Returns `null` if there is nothing meaningful to add.
 */
function buildRoleContext(role: string, userData: Record<string, unknown>): string | null {
  switch (role) {
    case 'athlete':
      return buildAthleteRoleContext(userData);
    case 'coach':
      return buildCoachRoleContext(userData);
    case 'parent':
      return buildParentRoleContext(userData);
    case 'director':
      return buildDirectorRoleContext(userData);
    case 'recruiter':
      return buildRecruiterRoleContext(userData);
    default:
      return null;
  }
}

function buildAthleteRoleContext(userData: Record<string, unknown>): string | null {
  const missing: string[] = [];
  if (!str(userData['contactEmail'])) missing.push('contact email');
  if (!str(userData['phone'])) missing.push('phone number');
  if (!str(userData['hudlUrl'])) missing.push('Hudl profile link');

  if (missing.length > 0) {
    return `Profile gaps detected: missing ${missing.join(', ')}. Consider tasks to complete their profile.`;
  }
  return null;
}

function buildCoachRoleContext(userData: Record<string, unknown>): string | null {
  const coach = userData['coach'] as Record<string, unknown> | undefined;
  const lines: string[] = [];

  // Coaching level context — critical for differentiating HS/club vs college
  const level = resolveCoachingLevel(userData);
  if (level && !isCollegeLevelCoach(userData)) {
    lines.push(
      `This is a ${level} coach. Focus on player development, team culture, game preparation,` +
        ` parent communication, and program building. Do NOT suggest college-level recruiting tasks` +
        ` like scouting prospects or managing a recruiting pipeline — that is not relevant for ${level} coaches.`
    );
  } else if (isCollegeLevelCoach(userData)) {
    lines.push(
      `This is a ${level} coach. Recruiting, prospect evaluation, compliance,` +
        ` and roster management are key priorities alongside game preparation and player development.`
    );
  }

  // Multi-team management — V2-first: count sports entries, fall back to legacy managedTeamCodes
  const sports = userData['sports'] as unknown[] | undefined;
  const managedTeamCount =
    (Array.isArray(sports) && sports.length > 1 ? sports.length : 0) ||
    (coach
      ? (() => {
          const managedTeams = coach['managedTeamCodes'];
          return Array.isArray(managedTeams) && managedTeams.length > 1 ? managedTeams.length : 0;
        })()
      : 0);
  if (managedTeamCount > 1) {
    lines.push(
      `This coach manages ${managedTeamCount} teams.` +
        ` Consider tasks that span team management, roster coordination, and cross-team scheduling.`
    );
  }

  return lines.length > 0 ? lines.join(' ') : null;
}

function buildParentRoleContext(userData: Record<string, unknown>): string | null {
  const parentFallback =
    `This parent is actively supporting their child's athletic journey.` +
    ` Focus on scheduling, financial planning, communication with coaches,` +
    ` and emotional/physical wellness of their athlete.`;

  const parent = userData['parent'] as Record<string, unknown> | undefined;
  if (!parent) return parentFallback;

  const managed = parent['managedAthleteIds'];
  if (Array.isArray(managed) && managed.length > 1) {
    return (
      `This parent manages ${managed.length} student-athletes.` +
      ` Consider tasks that help them stay organized across multiple schedules,` +
      ` finances, and recruiting timelines.`
    );
  }

  return parentFallback;
}

function buildDirectorRoleContext(userData: Record<string, unknown>): string | null {
  const base = 'Focus on tasks spanning operations, compliance, budgeting, and staff management.';
  const director = userData['director'] as Record<string, unknown> | undefined;

  if (!director) return `This director oversees the athletic program. ${base}`;

  const overseeSports = director['overseeSports'];
  if (Array.isArray(overseeSports) && overseeSports.length > 0) {
    const sportList = overseeSports.slice(0, 5).join(', ');
    return `This director oversees ${overseeSports.length} sport programs (${sportList}). ${base}`;
  }

  return `This director oversees the athletic program. ${base}`;
}

function buildRecruiterRoleContext(userData: Record<string, unknown>): string | null {
  const base =
    'Focus on prospect evaluation, relationship building, and talent pipeline management.';
  const recruiter = userData['recruiter'] as Record<string, unknown> | undefined;

  if (!recruiter) return base;

  const lines: string[] = [];
  const division = str(recruiter['division']);
  if (division) lines.push(`Recruiting at the ${division} level.`);

  const regions = recruiter['regions'];
  if (Array.isArray(regions) && regions.length > 0) {
    lines.push(`Active recruiting regions: ${regions.join(', ')}.`);
  }

  lines.push(base);
  return lines.join(' ');
}

// ─── Recurring Habit Menus (Role × Season) ──────────────────────────────────

interface RecurringHabitMenu {
  readonly inSeason: readonly string[];
  readonly offSeason: readonly string[];
  readonly general: readonly string[];
}

const ROLE_HABITS: Readonly<Record<string, RecurringHabitMenu>> = {
  athlete: {
    inSeason: [
      "Upload this week's game film or highlights so coaches can see your latest performance",
      'Update your stats from the latest game or competition',
      'Log your recovery, sleep, and wellness check-in for the week',
    ],
    offSeason: [
      'Sync your profile — update height, weight, and any new training metrics',
      'Log your strength and conditioning progress for the week',
      'Review and update your academic GPA and test scores',
    ],
    general: ['Sync your profile to make sure coaches are seeing your latest info'],
  },

  coach: {
    inSeason: [
      'Review updated athlete profiles and recent stat uploads from your roster',
      'Generate or review opponent scout report for the upcoming matchup',
      'Audit your team depth chart and check for roster updates',
    ],
    offSeason: [
      'Review player development plans and update training goals',
      'Audit roster academic standing and eligibility compliance',
      'Update offseason training plans and share with athletes',
    ],
    general: ['Review your team analytics dashboard for the week'],
  },

  /** College/JUCO coaches get recruiting-focused habits. */
  coach_college: {
    inSeason: [
      'Review updated athlete profiles and recent stat uploads from your roster',
      'Generate or review opponent scout report for the upcoming matchup',
      'Audit your team depth chart and check for roster updates',
    ],
    offSeason: [
      'Review your recruiting prospect board and update evaluations',
      'Audit roster academic standing and eligibility compliance',
      'Update offseason training plans and share with athletes',
    ],
    general: ['Review your team analytics dashboard for the week'],
  },

  parent: {
    inSeason: [
      "Review your athlete's weekly schedule, game times, and travel logistics",
      "Check your athlete's latest stats and recovery status",
    ],
    offSeason: [
      'Review upcoming camp, club, and showcase costs and budget accordingly',
      "Track your athlete's academic progress and recruiting milestones",
    ],
    general: ["Sync your athlete's profile to ensure it reflects the latest info"],
  },

  director: {
    inSeason: [
      'Review compliance alerts and eligibility updates across all programs',
      'Audit facility scheduling and resolve any booking conflicts',
      'Check coach and staff platform engagement metrics',
    ],
    offSeason: [
      'Review departmental budget allocations and upcoming fiscal needs',
      'Audit coaching staff evaluations and offseason hiring pipeline',
      'Review athlete retention and transfer portal activity',
    ],
    general: ['Run a department-wide analytics review for the week'],
  },

  recruiter: {
    inSeason: [
      'Update your prospect evaluation board with weekend game observations',
      'Log high-school coach communications and follow-ups from the week',
      'Review weekend film of committed prospects and watchlist athletes',
    ],
    offSeason: [
      'Refresh your recruiting target list and update prospect rankings',
      'Review camp and showcase invitee lists for upcoming events',
      'Audit your communication cadence with top prospects',
    ],
    general: ['Sync your recruiting pipeline — update contact logs and prospect notes'],
  },
};

/**
 * Build the recurring habit instruction block for the LLM prompt.
 * Returns a formatted string telling the AI which habits to choose from.
 *
 * @param userData - Optional user data for coaching level differentiation.
 */
export function getRecurringHabitsPrompt(
  role: string,
  sportRaw?: string,
  now: Date = new Date(),
  userData?: Record<string, unknown>
): string {
  // For coaches, use college-specific habits when applicable
  let menuKey = role;
  if (role === 'coach' && userData && isCollegeLevelCoach(userData)) {
    menuKey = 'coach_college';
  }

  const menu = ROLE_HABITS[menuKey] ?? ROLE_HABITS[role] ?? ROLE_HABITS['athlete'];
  const season = sportRaw ? getSeasonInfo(sportRaw, now) : null;

  const isInSeason = season?.phase === 'In-Season' || season?.phase === 'Post-Season / Playoffs';
  const habits = isInSeason ? menu.inSeason : menu.offSeason;
  const alwaysHabits = menu.general;

  const allHabits = [...habits, ...alwaysHabits];
  const numbered = allHabits.map((h, i) => `  ${i + 1}. ${h}`).join('\n');

  return [
    `RECURRING WEEKLY HABITS (select 2 from this menu and adapt the wording to the user's context):`,
    numbered,
    `Make the habit task titles short and action-oriented. Adapt the language to feel personal — reference their sport, team, or season.`,
  ].join('\n');
}
