/**
 * @fileoverview Drill-specific LLM system prompt builders.
 *
 * Drill diagrams reuse the same SVG render pipeline as play diagrams but require
 * a different LLM prompt — one that teaches the model about drill notation:
 * individual skill work, agility cone patterns, training phases, and coaching
 * station markers rather than competitive play formations.
 */

import type { NormalizedSport, SportPrompt } from '../../play-diagram/shared/diagram.types.js';

// ─── Common drill system section ──────────────────────────────────────────────

const DRILL_SYSTEM_SECTION = `DRILL DIAGRAM RULES (these OVERRIDE the play diagram rules above):
- Diagrams represent TRAINING movement patterns, NOT competitive play formations.
- Player count is flexible: 1–12 players. Label by training role: P1, P2, P3, Coach, QB, WR, etc.
- LosY: for court/field drills, use 60% of fieldHeight as the starting line. For full-court drills, use fieldHeight * 0.8.
- Keep drill diagrams clean and coach-readable:
  - Max 8 players unless the user explicitly asks for full-team reps.
  - Max 6 routes unless the user asks for a full progression tree.
  - Prefer 1-2 word labels only (e.g., "Slant", "Dig", "Read 2", "Station A").
  - Never repeat the same label text across adjacent routes/zones unless intentional station numbering is used.
  - Keep at least 40px spacing between player markers whenever possible.
  - Avoid crossing routes unless the drill explicitly requires route conflict training.
- ROUTE TYPES for drills — use the most accurate type:
  "go"     → sprint straight ahead, direct linear sprint
  "cut"    → direction change, cone cut, angular break, L-cut, V-cut
  "drag"   → lateral shuffle, defensive slide, carioca, backpedal (use dashed line)
  "fade"   → deep retreat, backpedal deep, regression movement
  "space"  → positioning movement, spacing to open area, hold/maintain zone
  "block"  → physical engagement rep, block-and-release, contact drill
  "pick"   → screen mechanics drill, on-ball screen, pick-and-roll mechanics
  "screen" → off-ball screen, shooting off screens, curl cut
- ZONES for drill markers:
  Use small zones (20×20) labeled "C" for CONES (shape: "ellipse")
  Use medium zones (60×40) for STATIONS labeled with station name
  Use medium zones (50×30) labeled "Land" for LANDING ZONES  
  Use medium zones (50×30) labeled "Catch" for TARGET / CATCH AREAS
- CURVE rules: true for arc movements (curved cut, fade, post cut); false for straight sprints and shuffles.
- Space players at least 30px apart. Coaches/trainers stand behind the active drill line.`;

// ─── Sport-specific drill examples ───────────────────────────────────────────

function getBasketballDrillExample(): string {
  return JSON.stringify(
    {
      sport: 'basketball',
      title: '3-Man Weave Drill',
      fieldWidth: 600,
      fieldHeight: 440,
      losY: 360,
      players: [
        { id: 'p1', label: 'P1', x: 180, y: 390, team: 'offense', shape: 'circle' },
        { id: 'p2', label: 'P2', x: 300, y: 390, team: 'offense', shape: 'circle' },
        { id: 'p3', label: 'P3', x: 420, y: 390, team: 'offense', shape: 'circle' },
      ],
      routes: [
        {
          from: 'p1',
          points: [
            [180, 390],
            [300, 310],
            [420, 200],
            [500, 60],
          ],
          label: 'Cut right',
          type: 'cut',
          curve: true,
        },
        {
          from: 'p2',
          points: [
            [300, 390],
            [180, 280],
            [100, 160],
            [200, 60],
          ],
          label: 'Cut left',
          type: 'cut',
          curve: true,
        },
        {
          from: 'p3',
          points: [
            [420, 390],
            [300, 260],
            [300, 140],
            [300, 60],
          ],
          label: 'Trail',
          type: 'go',
          curve: false,
        },
      ],
      zones: [
        {
          id: 'basket',
          label: 'Basket',
          x: 265,
          y: 28,
          width: 70,
          height: 40,
          shape: 'ellipse',
          team: 'offense',
        },
      ],
    },
    null,
    2
  );
}

function getFootballDrillExample(): string {
  return JSON.stringify(
    {
      sport: 'football',
      title: 'WR Route Running — Out Cut',
      fieldWidth: 600,
      fieldHeight: 440,
      losY: 300,
      players: [
        { id: 'wr1', label: 'WR', x: 130, y: 300, team: 'offense', shape: 'circle' },
        { id: 'qb1', label: 'QB', x: 300, y: 340, team: 'offense', shape: 'circle' },
        { id: 'cb1', label: 'CB', x: 135, y: 256, team: 'defense', shape: 'circle' },
      ],
      routes: [
        {
          from: 'wr1',
          points: [
            [130, 300],
            [130, 200],
            [220, 155],
          ],
          label: 'Out',
          type: 'cut',
          curve: true,
        },
        {
          from: 'cb1',
          points: [
            [135, 256],
            [135, 186],
            [220, 155],
          ],
          label: 'Mirror',
          type: 'drag',
          curve: true,
        },
      ],
      zones: [
        {
          id: 'c1',
          label: 'C',
          x: 210,
          y: 145,
          width: 20,
          height: 20,
          shape: 'ellipse',
          team: 'defense',
        },
        {
          id: 'catch',
          label: 'Catch',
          x: 218,
          y: 140,
          width: 50,
          height: 30,
          shape: 'rect',
          team: 'offense',
        },
      ],
    },
    null,
    2
  );
}

function getSoccerDrillExample(): string {
  return JSON.stringify(
    {
      sport: 'soccer',
      title: 'Agility Cone Ladder Drill',
      fieldWidth: 600,
      fieldHeight: 440,
      losY: 264,
      players: [{ id: 'p1', label: 'P1', x: 300, y: 400, team: 'offense', shape: 'circle' }],
      routes: [
        {
          from: 'p1',
          points: [
            [300, 400],
            [200, 300],
            [300, 220],
            [400, 300],
            [300, 140],
          ],
          label: 'Figure-8',
          type: 'cut',
          curve: true,
        },
      ],
      zones: [
        { id: 'c1', label: 'C', x: 190, y: 290, width: 20, height: 20, shape: 'ellipse' },
        { id: 'c2', label: 'C', x: 290, y: 210, width: 20, height: 20, shape: 'ellipse' },
        { id: 'c3', label: 'C', x: 390, y: 290, width: 20, height: 20, shape: 'ellipse' },
        { id: 'start', label: 'Start', x: 260, y: 385, width: 80, height: 30, shape: 'rect' },
      ],
    },
    null,
    2
  );
}

function getBaseballDrillExample(): string {
  return JSON.stringify(
    {
      sport: 'baseball',
      title: 'Outfield Drop Step Drill',
      fieldWidth: 600,
      fieldHeight: 440,
      losY: 280,
      players: [
        { id: 'of1', label: 'OF', x: 300, y: 300, team: 'offense', shape: 'circle' },
        { id: 'coach', label: 'Coach', x: 300, y: 380, team: 'defense', shape: 'square' },
      ],
      routes: [
        {
          from: 'of1',
          points: [
            [300, 300],
            [220, 200],
            [180, 120],
          ],
          label: 'Drop-step left',
          type: 'fade',
          curve: true,
        },
      ],
      zones: [
        {
          id: 'land',
          label: 'Land',
          x: 158,
          y: 104,
          width: 50,
          height: 30,
          shape: 'ellipse',
          team: 'offense',
        },
      ],
    },
    null,
    2
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the drill-specific prompt fragment for a given sport.
 * Used by BoardDiagramService to augment the base play-diagram system prompt
 * when generating drill layout JSON.
 */
export function getDrillPromptForSport(sport: NormalizedSport): SportPrompt {
  let exampleJson: string;

  switch (sport) {
    case 'basketball':
      exampleJson = getBasketballDrillExample();
      break;
    case 'football':
      exampleJson = getFootballDrillExample();
      break;
    case 'soccer':
      exampleJson = getSoccerDrillExample();
      break;
    case 'baseball':
    case 'softball':
      exampleJson = getBaseballDrillExample();
      break;
    default:
      exampleJson = getSoccerDrillExample();
  }

  return {
    systemSection: DRILL_SYSTEM_SECTION,
    exampleJson,
  };
}
