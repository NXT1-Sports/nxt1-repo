import type { SportPrompt } from '../shared/diagram.types.js';

export const softballPrompt: SportPrompt = {
  systemSection: `== SOFTBALL POSITIONING RULES ==
- Diamond view similar to baseball with slightly tighter spacing
- Typical labels: P, C, 1B, 2B, 3B, SS, LF, CF, RF
- Route types: go (direct run), cut (sharp angle), space (open field), drag (lateral shift), fade (backing up), pick (cover)
- Route labels: Shift, Cover, Relay, Cutoff, Charge
- Keep movement concise and role-specific
- All x: 12-588, all y: 12-428`,
  exampleJson:
    '{"sport":"softball","title":"Slap Hit Coverage","fieldWidth":600,"fieldHeight":440,"losY":300,"players":[{"id":"P","label":"P","x":300,"y":300,"team":"defense"},{"id":"C","label":"C","x":300,"y":355,"team":"defense"},{"id":"SS","label":"SS","x":260,"y":270,"team":"defense"},{"id":"2B","label":"2B","x":340,"y":270,"team":"defense"}],"routes":[{"from":"SS","points":[[260,270],[240,320]],"label":"Cover","type":"cut"},{"from":"2B","points":[[340,270],[320,320]],"label":"Cover","type":"cut"}]}',
};
