/** Sport-flavored "thinking" phrases shown while Agent X works, keyed by normalized sport name. */
const SPORT_THINKING_PHRASES: Readonly<Record<string, readonly string[]>> = {
  football: [
    'Reading the defense...',
    'Drawing up the next drive...',
    'Checking the playbook...',
    'Scanning the secondary...',
  ],
  basketball: [
    'Running the pick and roll...',
    'Finding the open lane...',
    'Setting up the next possession...',
    'Reading the help defense...',
  ],
  baseball: [
    'Studying the pitch sequence...',
    'Checking the scouting report...',
    'Working the count...',
    'Setting the lineup...',
  ],
  softball: [
    'Studying the pitch sequence...',
    'Working the count...',
    'Setting the lineup...',
    'Reading the infield...',
  ],
  soccer: [
    'Building out from the back...',
    'Finding the through ball...',
    'Reading the press...',
    'Setting up the set piece...',
  ],
  volleyball: [
    'Reading the block...',
    'Setting up the rotation...',
    'Calling the next set...',
    'Tracking the serve...',
  ],
  lacrosse: [
    'Working the fast break...',
    'Reading the ride...',
    'Setting up the offense...',
    'Scanning the crease...',
  ],
  hockey: [
    'Reading the forecheck...',
    'Setting up the power play...',
    'Changing the lines...',
    'Finding the open ice...',
  ],
  tennis: [
    'Reading the serve...',
    'Working the baseline...',
    'Constructing the point...',
    'Studying the matchup...',
  ],
  golf: [
    'Reading the green...',
    'Checking the yardage...',
    'Picking the right club...',
    'Lining up the putt...',
  ],
  track: [
    'Checking the splits...',
    'Setting the pace...',
    'Dialing in the start...',
    'Timing the handoff...',
  ],
  swimming: [
    'Checking the splits...',
    'Setting the pace...',
    'Timing the turn...',
    'Dialing in the stroke...',
  ],
  wrestling: [
    'Setting up the takedown...',
    'Scouting the matchup...',
    'Working the angles...',
    'Checking the bracket...',
  ],
};

const SPORT_ALIASES: Readonly<Record<string, string>> = {
  trackandfield: 'track',
  trackfield: 'track',
  crosscountry: 'track',
  icehockey: 'hockey',
  fieldhockey: 'hockey',
  swimmingdiving: 'swimming',
  swimanddive: 'swimming',
  mensbasketball: 'basketball',
  womensbasketball: 'basketball',
  menssoccer: 'soccer',
  womenssoccer: 'soccer',
  menslacrosse: 'lacrosse',
  womenslacrosse: 'lacrosse',
};

function normalizeSportKey(sport: string | null | undefined): string {
  const compact = (sport ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return SPORT_ALIASES[compact] ?? compact;
}

/** All thinking phrases for a sport, or an empty list when the sport is unknown. */
export function getSportThinkingPhrases(sport: string | null | undefined): readonly string[] {
  return SPORT_THINKING_PHRASES[normalizeSportKey(sport)] ?? [];
}

/** Picks a sport-flavored phrase by rotation index, or null when the sport has none. */
export function getSportThinkingPhrase(
  sport: string | null | undefined,
  variant = 0
): string | null {
  const phrases = getSportThinkingPhrases(sport);
  if (phrases.length === 0) return null;
  const index = ((Math.trunc(variant) % phrases.length) + phrases.length) % phrases.length;
  return phrases[index] ?? null;
}
