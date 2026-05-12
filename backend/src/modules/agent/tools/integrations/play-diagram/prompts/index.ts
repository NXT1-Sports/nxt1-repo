import type { NormalizedSport, SportPrompt } from '../shared/diagram.types.js';
import { baseballPrompt } from './baseball.prompt.js';
import { basketballPrompt } from './basketball.prompt.js';
import { footballPrompt } from './football.prompt.js';
import { soccerPrompt } from './soccer.prompt.js';
import { softballPrompt } from './softball.prompt.js';

const PROMPTS: Record<NormalizedSport, SportPrompt> = {
  football: footballPrompt,
  basketball: basketballPrompt,
  soccer: soccerPrompt,
  baseball: baseballPrompt,
  softball: softballPrompt,
};

export function getPromptForSport(sport: NormalizedSport): SportPrompt {
  return PROMPTS[sport] ?? footballPrompt;
}

export function buildSystemPrompt(sport: NormalizedSport): string {
  const prompt = getPromptForSport(sport);
  return `You are an expert sports diagram generator. Output a single JSON object describing a play diagram layout. No markdown, no explanation - raw JSON only.

CANVAS: 600 wide x 440 tall (pixels). Origin is top-left.

OUTPUT SCHEMA:
{
  "sport": string,
  "title": string,
  "fieldWidth": 600,
  "fieldHeight": 440,
  "losY": number,
  "players": [{ "id": string, "label": string, "x": number, "y": number, "team": "offense"|"defense", "shape": "circle"|"square"|"diamond" }],
  "routes": [{ "from": string, "points": [[x,y], ...], "label": string, "type": "go"|"cut"|"screen"|"pick"|"block"|"drag"|"space"|"fade", "curve": true|false }]
}

PLAYER SHAPE RULES — every player MUST have a "shape" field:
- "square"  → linemen: LT, LG, C, RG, RT, OL, OG, OT, DT, DL, DE, NT (physically dominant, immovable)
- "diamond" → specialists / deep: FS, SS, K, P, PK, LS (range, coverage, field-wide presence)
- "circle"  → all other skill positions: QB, RB, WR, TE, LB, CB, ML, SG, PF, C, PG, SF, GK, ST, CF, etc.

ROUTE TYPE RULES — every route MUST have a "type" field. Choose the most accurate type:
- "go"     → straight run or fly route, direct linear movement
- "cut"    → sharp angle change, quick break, drive to basket, slant
- "screen" → player catching a pass behind the line or receiving a screen
- "pick"   → player setting a screen/pick for a teammate (PnR, ball screen)
- "block"  → lineman engaging a defender, blocking assignment
- "drag"   → slow lateral drift, shallow crossing, drag route (use dashed line)
- "space"  → player moving to open space, spacing the floor (use thin dashed line)
- "fade"   → deep fading route, fade to corner, backing up territory

CURVE RULES — set "curve" on every route:
- true  → routes with 3+ waypoints describing an arc, fade, post, or corner (visually smoothed)
- false → straight-line assignments: go routes with 2 points, block assignments (sharp/linear)
- When in doubt for skill positions, use true

${prompt.systemSection}

EXAMPLE JSON:
${prompt.exampleJson}`;
}
