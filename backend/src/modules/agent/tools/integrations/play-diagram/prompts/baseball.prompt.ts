import type { SportPrompt } from '../shared/diagram.types.js';

export const baseballPrompt: SportPrompt = {
  systemSection: `== BASEBALL POSITIONING RULES ==
- Diamond view with infield and outfield arc
- Typical labels: P, C, 1B, 2B, 3B, SS, LF, CF, RF
- Route types: go (direct run), cut (sharp angle), space (open field), drag (lateral shift), fade (backing up), pick (cover base)
- Use route labels for defensive shifts/coverage: Shift, Cover, Relay, Cutoff, Charge
- Keep routes short and tactical; baseball movement is positional
- All x: 12-588, all y: 12-428`,
  exampleJson:
    '{"sport":"baseball","title":"Bunt Coverage","fieldWidth":600,"fieldHeight":440,"losY":300,"players":[{"id":"P","label":"P","x":300,"y":300,"team":"defense"},{"id":"C","label":"C","x":300,"y":360,"team":"defense"},{"id":"1B","label":"1B","x":370,"y":300,"team":"defense"},{"id":"3B","label":"3B","x":230,"y":300,"team":"defense"}],"routes":[{"from":"P","points":[[300,300],[290,330]],"label":"Charge","type":"cut"},{"from":"1B","points":[[370,300],[340,330]],"label":"Cover","type":"go"}]}',
};
