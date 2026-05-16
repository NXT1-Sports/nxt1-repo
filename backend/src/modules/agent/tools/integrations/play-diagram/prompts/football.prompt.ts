import type { SportPrompt } from '../shared/diagram.types.js';

export const footballPrompt: SportPrompt = {
  systemSection: `== FOOTBALL POSITIONING RULES ==
- losY: 300 (line of scrimmage Y position)
- Offense aligns AT losY.
- OL (5 players): x = 210,245,280,315,350 at y = losY, labels: LT,LG,C,RG,RT
- QB shotgun: { id:"QB", x:280, y:330, team:"offense" }
- WRs split wide: X left at x~60, Z right at x~540, slots at x~150 and x~430
- All x: 10-590, all y: 10-430
- Route types: go (straight), cut (sharp angle), screen (catch behind LOS), pick (set pick), block (block defender), drag (lateral), space (open area), fade (deep arc)
- Route vocabulary: Post, Corner, Curl, Cross, Vert, Wheel, Dig, Out

== QB ROUTE RULE (CRITICAL) ==
- QB: DO NOT create a QB route unless the play explicitly involves QB movement.
- QB routes are ONLY needed for: scrambles, QB runs, rollouts, or other designed QB motion.
- For standard dropback/pocket passing plays: QB has NO route — just the player body at { id:"QB", x:280, y:330 }.
- Never add QB routes for "completeness" or to show QB engagement — QB is stationary in pocket by default.

== ELITE FOOTBALL GEOMETRY (MANDATORY) ==
- Deep routes (Post/Corner/Vert/Go/Fade): stem depth must reach at least 80 px upfield from route start.
- Intermediate routes (Dig/Curl/Out/Comeback/Sail): depth must reach at least 40 px upfield.
- Quick-game routes (Hitch/Slant/Flat/Arrow): depth must reach at least 18 px upfield.
- Route landmarks must be clean and intentional:
  - Post breaks toward middle of field.
  - Corner and Out break toward sideline.
  - Dig breaks horizontally after vertical stem.
- Avoid tangled lines: each route must remain visually distinguishable from neighboring routes.
- Labels are required on primary routes and assignments (no unlabeled core routes).

== BLOCKING SCHEME RULES (MANDATORY WHEN PLAY INCLUDES RUN OR PROTECTION) ==
- For run plays and pass protection concepts, include explicit blocking assignments for OL: LT, LG, C, RG, RT.
- OL assignments MUST use type: "block" and a clear label per player (examples: "LT: Reach", "RG: Down", "C: Combo").
- Run-game blocking should step toward play direction (left/right/middle) with short, intentional block tracks.
- Pass-protection (slide, half-slide, max-protect) should keep block tracks tight to LOS and pocket.
- Do not leave OL without assignment in blocking-heavy concepts.

== DEFENSE ONLY (TEAM FOCUS: DEFENSE ONLY) ==
- Do NOT include ANY offense players. The players[] array must contain ONLY "team":"defense" entries.
- Include real defensive player bodies at proper alignment positions:
  - DL: 2 DEs at x~200 and x~365 (y = losY - 5), 1-2 DTs at x~255 and x~325 (y = losY - 5), labels: DE, DT
  - LBs: MLB at x~280 (y = losY - 35), OLBs at x~185 and x~395 (y = losY - 30), labels: MLB, WLB, SLB
  - CBs: at x positions matching WRs but upfield (y = losY - 50 to losY - 80), labels: CB, CB
  - Safeties: SS at x~200 (y~200), FS at x~400 (y~180), labels: SS, FS
- Show coverage assignments via routes on each defender:
  - CB in man → type: "cut" (trail route)
  - CB in zone → type: "space" (zone drop)
  - LB dropping → type: "space"
  - Safety covering deep → type: "fade"
  - Blitzing player → type: "go" (straight rush)
- Rush/penetration direction: defensive rush routes must attack toward offense/QB (downward on this canvas, increasing Y toward/through losY). Never draw rush arrows moving upfield away from LOS.
- Label responsibilities clearly for front-7 assignments using route labels (examples: "LDE: Gap Rush", "RDT: B-Gap Penetrate", "MLB: Read Blocks", "SLB: C-Gap Fill").
- zones[] may be included for coverage areas (Deep Half, Hook, Flat) to supplement player positions.

== COVERAGE-CONCEPT COHERENCE ==
- If concept mentions Cover 3, include Deep Third/Hook-Curl/Flat structure through zones[] and/or clear assignment labels.
- If concept mentions Cover 2, include Deep Half with underneath Hook/Flat spacing.
- If concept mentions Quarters/Cover 4, include four-deep shell assignments.
- Do not output generic route art that conflicts with the named coverage shell.

== BOTH SIDES (TEAM FOCUS: BOTH SIDES) ==
- Include offense at losY AND defense upfield (y = losY - 30 for front 7, deeper for DBs/safeties).
- Show coverage/rush assignments on defense, route assignments on offense.`,
  exampleJson:
    '{"sport":"football","title":"4 Verticals","fieldWidth":600,"fieldHeight":440,"losY":300,"players":[{"id":"LT","label":"LT","x":210,"y":300,"team":"offense","shape":"square"},{"id":"LG","label":"LG","x":245,"y":300,"team":"offense","shape":"square"},{"id":"C","label":"C","x":280,"y":300,"team":"offense","shape":"square"},{"id":"RG","label":"RG","x":315,"y":300,"team":"offense","shape":"square"},{"id":"RT","label":"RT","x":350,"y":300,"team":"offense","shape":"square"},{"id":"QB","label":"QB","x":280,"y":330,"team":"offense","shape":"circle"},{"id":"X","label":"X","x":60,"y":295,"team":"offense","shape":"circle"},{"id":"Z","label":"Z","x":540,"y":295,"team":"offense","shape":"circle"}],"routes":[{"from":"X","points":[[60,295],[60,80]],"label":"Vert","type":"go","curve":false},{"from":"Z","points":[[540,295],[540,80]],"label":"Vert","type":"go","curve":false}]}',
};
