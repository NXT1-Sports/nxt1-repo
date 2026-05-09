import type { SportPrompt } from '../shared/diagram.types.js';

export const footballPrompt: SportPrompt = {
  systemSection: `== FOOTBALL POSITIONING RULES ==
- losY: 300 (line of scrimmage Y position)
- Offense aligns AT losY. Defense aligns 30px upfield (y = losY - 30).
- OL (5 players): x = 210,245,280,315,350 at y = losY, labels: LT,LG,C,RG,RT
- QB shotgun: { id:"QB", x:280, y:330, team:"offense" }
- WRs split wide: X left at x~60, Z right at x~540, slots at x~150 and x~430
- DB mirrors covered receiver x position at y = losY - 30
- Safeties: SS at ~(180,200), FS at ~(420,180)
- All x: 10-590, all y: 10-430
- Route types: go (straight), cut (sharp angle), screen (catch behind LOS), pick (set pick), block (block defender), drag (lateral), space (open area), fade (deep arc)
- Route vocabulary: Post, Corner, Curl, Cross, Vert, Wheel, Dig, Out
- For Cover 2 / Tampa 2 concepts:
  - Include both safeties with label "Deep Half"
  - Include corner labels "Flat" on both sides
  - Include at least one LB label "Hook" or "Hook Curl"
  - Prefer defensive route types: Deep Half -> fade, Hook/Flat/Curl -> space`,
  exampleJson:
    '{"sport":"football","title":"4 Verticals","fieldWidth":600,"fieldHeight":440,"losY":300,"players":[{"id":"LT","label":"LT","x":210,"y":300,"team":"offense"},{"id":"LG","label":"LG","x":245,"y":300,"team":"offense"},{"id":"C","label":"C","x":280,"y":300,"team":"offense"},{"id":"RG","label":"RG","x":315,"y":300,"team":"offense"},{"id":"RT","label":"RT","x":350,"y":300,"team":"offense"},{"id":"QB","label":"QB","x":280,"y":330,"team":"offense"},{"id":"X","label":"X","x":60,"y":295,"team":"offense"},{"id":"Z","label":"Z","x":540,"y":295,"team":"offense"}],"routes":[{"from":"X","points":[[60,295],[60,80]],"label":"Vert","type":"go"},{"from":"Z","points":[[540,295],[540,80]],"label":"Vert","type":"go"}]}',
};
