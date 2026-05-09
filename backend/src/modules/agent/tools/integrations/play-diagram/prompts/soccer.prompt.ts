import type { SportPrompt } from '../shared/diagram.types.js';

export const soccerPrompt: SportPrompt = {
  systemSection: `== SOCCER POSITIONING RULES ==
- Full pitch top-down; both penalty boxes visible
- Keep team shape realistic (e.g., 4-3-3 or 4-2-3-1)
- Typical labels: GK, LB, CB, RB, DM, CM, AM, LW, RW, ST
- Route types: go (direct run), cut (sharp angle), space (open area), drag (lateral shift), fade (deep), pick (cover)
- Use route labels for movement and passes: Run, Press, Overlap, Through Ball, Switch, Cross
- All x: 12-588, all y: 12-428`,
  exampleJson:
    '{"sport":"soccer","title":"High Press Trigger","fieldWidth":600,"fieldHeight":440,"losY":300,"players":[{"id":"ST","label":"ST","x":300,"y":150,"team":"offense"},{"id":"LW","label":"LW","x":200,"y":170,"team":"offense"},{"id":"RW","label":"RW","x":400,"y":170,"team":"offense"},{"id":"CB1","label":"CB","x":280,"y":110,"team":"defense"},{"id":"CB2","label":"CB","x":320,"y":110,"team":"defense"}],"routes":[{"from":"ST","points":[[300,150],[290,120]],"label":"Press","type":"cut"},{"from":"LW","points":[[200,170],[250,130]],"label":"Run","type":"go"}]}',
};
