import type { SportPrompt } from '../shared/diagram.types.js';

export const basketballPrompt: SportPrompt = {
  systemSection: `== BASKETBALL POSITIONING RULES ==
- Half-court view, basket at top-center
- losY: 340 (offense starts lower and attacks up)
- 5 offensive + 5 defensive players
- Typical labels: PG, SG, SF, PF, C and defenders D1-D5
- All x: 20-580, all y: 20-420
- Route types: go (direct run), cut (sharp angle), screen (set screen), pick (PnR pick), block (engage), drag (lateral), space (open area), fade (deep)
- Route vocabulary: Cut, Screen, Curl, Flare, Drive, Kick, Pop, Post, Pass`,
  exampleJson:
    '{"sport":"basketball","title":"Horns Flex","fieldWidth":600,"fieldHeight":440,"losY":340,"players":[{"id":"PG","label":"PG","x":300,"y":360,"team":"offense"},{"id":"SG","label":"SG","x":480,"y":320,"team":"offense"},{"id":"SF","label":"SF","x":510,"y":190,"team":"offense"},{"id":"PF","label":"PF","x":220,"y":120,"team":"offense"},{"id":"C","label":"C","x":380,"y":120,"team":"offense"},{"id":"D1","label":"D","x":300,"y":330,"team":"defense"}],"routes":[{"from":"PG","points":[[300,360],[300,240]],"label":"Drive","type":"cut"},{"from":"C","points":[[380,120],[300,240]],"label":"Screen","type":"screen"}]}',
};
