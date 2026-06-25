import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

type DiagramPartCategory = 'route_tree';

interface DiagramRoutePart {
  readonly id: string;
  readonly category: DiagramPartCategory;
  readonly name: string;
  readonly shorthand: string;
  readonly family: string;
  readonly stemYards: number;
  readonly landmark: string;
  readonly breakDirection: string;
  readonly description: string;
  readonly coachingCues: readonly string[];
  readonly pathD: string;
  readonly breakPoint: { readonly x: number; readonly y: number };
  readonly endPoint: { readonly x: number; readonly y: number };
}

interface GeneratedDiagramPart {
  readonly generatedAtIso: string;
  readonly part: DiagramRoutePart;
  readonly svgUrl: string;
  readonly spec: {
    readonly schema: 'nxt1_diagram_part_v1';
    readonly tool: 'create_play_diagram';
    readonly category: DiagramPartCategory;
    readonly partId: string;
    readonly name: string;
    readonly shorthand: string;
    readonly family: string;
    readonly stemYards: number;
    readonly landmark: string;
    readonly breakDirection: string;
    readonly pathD: string;
    readonly coachingCues: readonly string[];
  };
}

const PART_BUILDER_TEST_IDS = {
  ROUTE_PART_BUTTON: 'part-builder-route-part-button',
  GENERATE_BUTTON: 'part-builder-generate-button',
  SVG_OUTPUT: 'part-builder-svg-output',
  SPEC_JSON: 'part-builder-spec-json',
} as const;

const ROUTE_TREE_PARTS: readonly DiagramRoutePart[] = [
  {
    id: 'slant',
    category: 'route_tree',
    name: 'Slant',
    shorthand: 'SL',
    family: 'Quick Game',
    stemYards: 3,
    landmark: 'Inside shoulder of the nearest underneath defender',
    breakDirection: 'Inside at 45 degrees',
    description: 'Three-step inside break built for rhythm throws, glance tags, and RPO access.',
    coachingCues: [
      'Threaten vertical first',
      'Plant off outside foot',
      'Stay friendly across the QB face',
    ],
    pathD: 'M 180 360 L 180 308 L 384 188',
    breakPoint: { x: 180, y: 308 },
    endPoint: { x: 384, y: 188 },
  },
  {
    id: 'post',
    category: 'route_tree',
    name: 'Post',
    shorthand: 'PST',
    family: 'Vertical',
    stemYards: 10,
    landmark: 'Near upright or opposite hash',
    breakDirection: 'Inside over the top',
    description: 'Vertical stem with an aggressive inside break for middle-field stress.',
    coachingCues: ['Stack the defender', 'Snap the eyes inside', 'Keep speed through the break'],
    pathD: 'M 180 360 L 180 162 L 344 74',
    breakPoint: { x: 180, y: 162 },
    endPoint: { x: 344, y: 74 },
  },
  {
    id: 'go',
    category: 'route_tree',
    name: 'Go',
    shorthand: 'GO',
    family: 'Vertical',
    stemYards: 0,
    landmark: 'Top of numbers or sideline fade lane',
    breakDirection: 'Vertical release',
    description:
      'Straight vertical release that wins with speed, leverage, and late ball tracking.',
    coachingCues: ['Release clean', 'Stack by eight yards', 'Leave room for the throw outside'],
    pathD: 'M 180 360 L 180 74',
    breakPoint: { x: 180, y: 244 },
    endPoint: { x: 180, y: 74 },
  },
  {
    id: 'curl',
    category: 'route_tree',
    name: 'Curl',
    shorthand: 'CRL',
    family: 'Possession',
    stemYards: 10,
    landmark: 'Open window outside the hook defender',
    breakDirection: 'Throttle and turn back',
    description: 'Vertical push with a controlled stop for intermediate spacing and timing.',
    coachingCues: ['Sell go route', 'Drop hips at the stem', 'Show numbers back to the QB'],
    pathD: 'M 180 360 L 180 146 Q 174 184 132 202',
    breakPoint: { x: 180, y: 146 },
    endPoint: { x: 132, y: 202 },
  },
  {
    id: 'out',
    category: 'route_tree',
    name: 'Out',
    shorthand: 'OUT',
    family: 'Sideline',
    stemYards: 8,
    landmark: 'Sideline window at sticks depth',
    breakDirection: 'Outside at 90 degrees',
    description: 'Sharp outside break for spacing concepts, quick outs, and bench families.',
    coachingCues: [
      'Keep shoulders vertical',
      'Win the top of the route',
      'Flatten to the sideline',
    ],
    pathD: 'M 180 360 L 180 184 L 416 184',
    breakPoint: { x: 180, y: 184 },
    endPoint: { x: 416, y: 184 },
  },
  {
    id: 'dig',
    category: 'route_tree',
    name: 'Dig',
    shorthand: 'DIG',
    family: 'Intermediate',
    stemYards: 12,
    landmark: 'Across the opposite hash window',
    breakDirection: 'Inside at 90 degrees',
    description: 'Square-in route that attacks linebackers and second-level windows.',
    coachingCues: [
      'Push vertical to depth',
      'Plant hard off outside foot',
      'Run away across grass',
    ],
    pathD: 'M 180 360 L 180 126 L 430 126',
    breakPoint: { x: 180, y: 126 },
    endPoint: { x: 430, y: 126 },
  },
  {
    id: 'corner',
    category: 'route_tree',
    name: 'Corner',
    shorthand: 'COR',
    family: 'High-Low',
    stemYards: 10,
    landmark: 'Back pylon or deep sideline hole',
    breakDirection: 'Outside over the top',
    description: 'Vertical stem with a high outside break for flood, smash, and red-zone throws.',
    coachingCues: ['Stem at safety leverage', 'Break high and wide', 'Do not drift flat'],
    pathD: 'M 180 360 L 180 162 Q 252 122 404 72',
    breakPoint: { x: 180, y: 162 },
    endPoint: { x: 404, y: 72 },
  },
  {
    id: 'comeback',
    category: 'route_tree',
    name: 'Comeback',
    shorthand: 'CBK',
    family: 'Sideline',
    stemYards: 14,
    landmark: 'Sideline at comeback depth',
    breakDirection: 'Back down the stem',
    description: 'Deep vertical sell with a hard downhill return to the boundary.',
    coachingCues: ['Attack cushion', 'Snap downhill', 'Protect the sideline window'],
    pathD: 'M 180 360 L 180 92 Q 166 148 116 180',
    breakPoint: { x: 180, y: 92 },
    endPoint: { x: 116, y: 180 },
  },
  {
    id: 'flat',
    category: 'route_tree',
    name: 'Flat',
    shorthand: 'FLT',
    family: 'Quick Game',
    stemYards: 1,
    landmark: 'Numbers at 3 to 5 yards',
    breakDirection: 'Immediate outside release',
    description: 'Fast width route for spacing, snag, stick, and flood control throws.',
    coachingCues: [
      'Get width now',
      'Turn eyes after clearing traffic',
      'Stay flat under the first window',
    ],
    pathD: 'M 180 360 Q 232 326 430 314',
    breakPoint: { x: 226, y: 330 },
    endPoint: { x: 430, y: 314 },
  },
  {
    id: 'wheel',
    category: 'route_tree',
    name: 'Wheel',
    shorthand: 'WHL',
    family: 'Vertical',
    stemYards: 2,
    landmark: 'Sideline vertical lane',
    breakDirection: 'Arc up the sideline',
    description: 'Flat release that bends vertical for matchups and coverage busts.',
    coachingCues: ['Sell flat first', 'Bend tight upfield', 'Track over outside shoulder'],
    pathD: 'M 180 360 Q 278 326 360 272 Q 430 214 440 78',
    breakPoint: { x: 360, y: 272 },
    endPoint: { x: 440, y: 78 },
  },
  {
    id: 'seam',
    category: 'route_tree',
    name: 'Seam',
    shorthand: 'SEA',
    family: 'Vertical',
    stemYards: 0,
    landmark: 'Hash or divider vertical lane',
    breakDirection: 'Vertical inside release',
    description: 'Inside vertical route that stresses safeties and hook defenders.',
    coachingCues: ['Release inside', 'Hold the divider', 'Expect ball before the safety closes'],
    pathD: 'M 180 360 L 220 250 L 220 72',
    breakPoint: { x: 220, y: 250 },
    endPoint: { x: 220, y: 72 },
  },
  {
    id: 'drag',
    category: 'route_tree',
    name: 'Drag',
    shorthand: 'DRG',
    family: 'Crossing',
    stemYards: 3,
    landmark: 'Across the field at shallow depth',
    breakDirection: 'Shallow cross',
    description: 'Low crossing route used in mesh, boot, and man-beater concepts.',
    coachingCues: ['Burst off the ball', 'Cross flat under linebackers', 'Keep running away'],
    pathD: 'M 180 360 L 180 314 Q 276 292 450 292',
    breakPoint: { x: 180, y: 314 },
    endPoint: { x: 450, y: 292 },
  },
  {
    id: 'hitch',
    category: 'route_tree',
    name: 'Hitch',
    shorthand: 'HIT',
    family: 'Quick Game',
    stemYards: 5,
    landmark: 'Open grass at five yards',
    breakDirection: 'Settle back to passer',
    description: 'Quick stop route for access throws, spacing, and perimeter rhythm.',
    coachingCues: ['Push through five yards', 'Settle with balance', 'Work back to the ball'],
    pathD: 'M 180 360 L 180 256 Q 170 280 140 288',
    breakPoint: { x: 180, y: 256 },
    endPoint: { x: 140, y: 288 },
  },
];

function sanitizeForSvg(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildRoutePartSvg(part: DiagramRoutePart): string {
  const title = sanitizeForSvg(part.name);
  const shorthand = sanitizeForSvg(part.shorthand);
  const family = sanitizeForSvg(part.family);
  const landmark = sanitizeForSvg(part.landmark);

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="720" viewBox="0 0 1120 720">',
    '<defs>',
    '<marker id="route-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#f7d35c"/></marker>',
    '<pattern id="field-grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M 48 0 L 0 0 0 48" fill="none" stroke="#244368" stroke-width="1" opacity="0.42"/></pattern>',
    '</defs>',
    '<rect width="1120" height="720" fill="#071526"/>',
    '<rect x="44" y="44" width="1032" height="632" rx="10" fill="#0d2742" stroke="#2c5175" stroke-width="2"/>',
    '<rect x="44" y="44" width="1032" height="632" rx="10" fill="url(#field-grid)"/>',
    '<line x1="44" y1="360" x2="1076" y2="360" stroke="#e9f2ff" stroke-width="2" stroke-dasharray="10 10" opacity="0.68"/>',
    '<line x1="44" y1="552" x2="1076" y2="552" stroke="#f7d35c" stroke-width="3" opacity="0.86"/>',
    '<text x="74" y="92" fill="#f4f8ff" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="800">Route Tree Part</text>',
    `<text x="76" y="132" fill="#a8bdd7" font-family="Inter, Arial, sans-serif" font-size="22">${title} (${shorthand}) | ${family}</text>`,
    '<g transform="translate(390 82)">',
    `<path d="${part.pathD}" fill="none" stroke="#f7d35c" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#route-arrow)"/>`,
    `<path d="${part.pathD}" fill="none" stroke="#54d98c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#route-arrow)"/>`,
    '<circle cx="180" cy="360" r="22" fill="#f4f8ff" stroke="#0b1728" stroke-width="5"/>',
    `<circle cx="${part.breakPoint.x}" cy="${part.breakPoint.y}" r="10" fill="#f7d35c" stroke="#071526" stroke-width="4"/>`,
    `<circle cx="${part.endPoint.x}" cy="${part.endPoint.y}" r="8" fill="#54d98c" stroke="#071526" stroke-width="4"/>`,
    '<text x="145" y="412" fill="#e8f1ff" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800">WR</text>',
    '</g>',
    '<g transform="translate(76 548)">',
    '<rect x="0" y="0" width="390" height="86" rx="8" fill="#08182b" stroke="#244368"/>',
    '<text x="22" y="34" fill="#f4f8ff" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="800">Landmark</text>',
    `<text x="22" y="64" fill="#a8bdd7" font-family="Inter, Arial, sans-serif" font-size="17">${landmark}</text>`,
    '</g>',
    '</svg>',
  ].join('');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

@Component({
  selector: 'app-part-builder',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="part-builder">
      <aside class="part-builder__sidebar">
        <header class="part-builder__header">
          <p class="part-builder__eyebrow">Part Builder</p>
          <h1>Part Builder</h1>
          <p class="part-builder__intro">
            Build one clean SVG part at a time for the play diagram tool.
          </p>
        </header>

        <section class="part-builder__panel part-builder__panel--controls">
          <div class="part-builder__panel-head">
            <h2>Diagram</h2>
            <p>Select the exact part to generate.</p>
          </div>

          <div class="part-builder__tool-row" aria-label="Diagram type">
            <button type="button" class="part-builder__tool-tab part-builder__tool-tab--active">
              Play Diagram
            </button>
          </div>

          <div class="part-builder__section-label">
            <span>Route Tree</span>
            <small>{{ routeParts.length }} parts</small>
          </div>

          <div class="part-builder__route-list" role="listbox" aria-label="Route tree parts">
            @for (part of routeParts; track part.id) {
              <button
                type="button"
                class="part-builder__route-part"
                [class.part-builder__route-part--active]="selectedPartId() === part.id"
                [attr.aria-selected]="selectedPartId() === part.id"
                [attr.data-testid]="testIds.ROUTE_PART_BUTTON"
                (click)="selectPart(part.id)"
              >
                <span class="part-builder__route-main">
                  <span class="part-builder__route-name">{{ part.name }}</span>
                  <span class="part-builder__route-badge">{{ part.shorthand }}</span>
                </span>
                <span class="part-builder__route-meta"
                  >{{ part.family }} | {{ part.stemYards }} yd stem</span
                >
              </button>
            }
          </div>

          <div class="part-builder__selected-part">
            <p class="part-builder__selected-kicker">Selected Part</p>
            <h3>{{ selectedPart().name }}</h3>
            <p>{{ selectedPart().description }}</p>
          </div>

          <button
            type="button"
            class="part-builder__primary-btn"
            [attr.data-testid]="testIds.GENERATE_BUTTON"
            (click)="generate()"
          >
            Generate {{ selectedPart().name }}
          </button>
        </section>
      </aside>

      <section class="part-builder__content">
        @if (!generatedPart()) {
          <section class="part-builder__empty-state">
            <p class="part-builder__empty-kicker">Ready</p>
            <h2>{{ selectedPart().name }} Route</h2>
            <p>Select a route on the left, then generate the SVG part here.</p>
          </section>
        } @else {
          <section class="part-builder__output-grid">
            <article class="part-builder__panel part-builder__panel--output">
              <div class="part-builder__panel-head">
                <div>
                  <h2>SVG Part Output</h2>
                  <p>{{ generatedPart()!.part.name }} route tree part</p>
                </div>
                <span class="part-builder__status-pill">Generated</span>
              </div>

              <div class="part-builder__svg-stage" [attr.data-testid]="testIds.SVG_OUTPUT">
                <img
                  [src]="generatedPart()!.svgUrl"
                  [alt]="generatedPart()!.part.name + ' route SVG part'"
                />
              </div>
            </article>

            <article class="part-builder__panel">
              <h2>Part Definition</h2>
              <dl class="part-builder__definition-list">
                <div>
                  <dt>Name</dt>
                  <dd>{{ generatedPart()!.part.name }}</dd>
                </div>
                <div>
                  <dt>Family</dt>
                  <dd>{{ generatedPart()!.part.family }}</dd>
                </div>
                <div>
                  <dt>Landmark</dt>
                  <dd>{{ generatedPart()!.part.landmark }}</dd>
                </div>
                <div>
                  <dt>Break</dt>
                  <dd>{{ generatedPart()!.part.breakDirection }}</dd>
                </div>
              </dl>

              <h3>Coaching Cues</h3>
              <ul class="part-builder__cue-list">
                @for (cue of generatedPart()!.part.coachingCues; track cue) {
                  <li>{{ cue }}</li>
                }
              </ul>
            </article>

            <article class="part-builder__panel part-builder__panel--json">
              <h2>Part Spec JSON</h2>
              <pre [attr.data-testid]="testIds.SPEC_JSON">{{ generatedPartJson() }}</pre>
            </article>
          </section>
        }
      </section>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: #05070b;
      }

      .part-builder {
        width: min(1420px, 100%);
        margin: 0 auto;
        padding: 1.5rem;
        color: #eef5ff;
        display: grid;
        grid-template-columns: 360px minmax(0, 1fr);
        gap: 1.25rem;
        align-items: start;
      }

      .part-builder__sidebar {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        position: sticky;
        top: 1.5rem;
        max-height: calc(100vh - 3rem);
        overflow: auto;
      }

      .part-builder__header h1 {
        margin: 0.25rem 0 0.45rem;
        font-size: 2rem;
        line-height: 1.05;
      }

      .part-builder__eyebrow,
      .part-builder__selected-kicker,
      .part-builder__empty-kicker {
        margin: 0;
        font-size: 0.72rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #7ed6a2;
        font-weight: 800;
      }

      .part-builder__intro {
        margin: 0;
        color: #a9b8cc;
        font-size: 0.92rem;
        line-height: 1.45;
      }

      .part-builder__content {
        min-width: 0;
      }

      .part-builder__panel,
      .part-builder__empty-state {
        background: #101722;
        border: 1px solid #253244;
        border-radius: 8px;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      .part-builder__panel {
        padding: 1rem;
      }

      .part-builder__panel--controls {
        display: flex;
        flex-direction: column;
        gap: 0.95rem;
      }

      .part-builder__panel-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
      }

      .part-builder__panel-head h2,
      .part-builder__panel-head h3,
      .part-builder__selected-part h3,
      .part-builder__empty-state h2 {
        margin: 0;
      }

      .part-builder__panel-head p,
      .part-builder__selected-part p,
      .part-builder__empty-state p {
        margin: 0.35rem 0 0;
        color: #a9b8cc;
        font-size: 0.85rem;
        line-height: 1.45;
      }

      .part-builder__tool-row {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.45rem;
      }

      .part-builder__tool-tab,
      .part-builder__route-part,
      .part-builder__primary-btn {
        font: inherit;
      }

      .part-builder__tool-tab {
        border: 1px solid #2c3d54;
        border-radius: 8px;
        background: #0b111b;
        color: #dbe8fa;
        min-height: 42px;
        text-align: left;
        padding: 0 0.8rem;
        font-weight: 800;
      }

      .part-builder__tool-tab--active {
        border-color: #f7d35c;
        box-shadow: inset 3px 0 0 #f7d35c;
      }

      .part-builder__section-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: #eef5ff;
        font-weight: 800;
      }

      .part-builder__section-label small {
        color: #8fa0b6;
        font-size: 0.74rem;
      }

      .part-builder__route-list {
        display: grid;
        gap: 0.45rem;
      }

      .part-builder__route-part {
        border: 1px solid #27364a;
        border-radius: 8px;
        background: #0b111b;
        color: #e7f0ff;
        padding: 0.68rem 0.72rem;
        cursor: pointer;
        text-align: left;
        transition:
          border-color 140ms ease,
          background 140ms ease,
          transform 140ms ease;
      }

      .part-builder__route-part:hover,
      .part-builder__route-part--active {
        border-color: #54d98c;
        background: #10251d;
        transform: translateY(-1px);
      }

      .part-builder__route-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }

      .part-builder__route-name {
        font-weight: 850;
      }

      .part-builder__route-badge,
      .part-builder__status-pill {
        border-radius: 999px;
        border: 1px solid rgba(247, 211, 92, 0.42);
        background: rgba(247, 211, 92, 0.12);
        color: #ffeaa4;
        font-size: 0.68rem;
        font-weight: 850;
        padding: 0.16rem 0.45rem;
      }

      .part-builder__route-meta {
        display: block;
        margin-top: 0.22rem;
        color: #91a3ba;
        font-size: 0.75rem;
      }

      .part-builder__selected-part {
        border-top: 1px solid #27364a;
        padding-top: 0.9rem;
      }

      .part-builder__primary-btn {
        width: 100%;
        min-height: 48px;
        border: 0;
        border-radius: 8px;
        background: linear-gradient(90deg, #1d64ff 0%, #278a5e 100%);
        color: #ffffff;
        font-weight: 850;
        cursor: pointer;
      }

      .part-builder__primary-btn:hover {
        filter: brightness(1.08);
      }

      .part-builder__empty-state {
        min-height: 520px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 2rem;
        background: linear-gradient(90deg, rgba(247, 211, 92, 0.08), transparent 42%), #101722;
      }

      .part-builder__output-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(300px, 0.75fr);
        gap: 1rem;
      }

      .part-builder__panel--output,
      .part-builder__panel--json {
        grid-column: 1 / -1;
      }

      .part-builder__svg-stage {
        margin-top: 1rem;
        border: 1px solid #2a3a50;
        border-radius: 8px;
        overflow: hidden;
        background: #05070b;
      }

      .part-builder__svg-stage img {
        display: block;
        width: 100%;
        height: auto;
      }

      .part-builder__definition-list {
        margin: 0;
        display: grid;
        gap: 0.65rem;
      }

      .part-builder__definition-list div {
        border: 1px solid #27364a;
        border-radius: 8px;
        padding: 0.65rem;
        background: #0b111b;
      }

      .part-builder__definition-list dt {
        color: #8fa0b6;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 800;
      }

      .part-builder__definition-list dd {
        margin: 0.2rem 0 0;
        color: #eef5ff;
        font-weight: 700;
      }

      .part-builder__cue-list {
        margin: 0.4rem 0 0;
        padding-left: 1.1rem;
        color: #dbe8fa;
      }

      .part-builder__cue-list li + li {
        margin-top: 0.3rem;
      }

      pre {
        margin: 0.4rem 0 0;
        white-space: pre-wrap;
        word-break: break-word;
        background: #0b111b;
        color: #dbe8fa;
        border: 1px solid #27364a;
        border-radius: 8px;
        padding: 0.85rem;
        max-height: 340px;
        overflow: auto;
        font-size: 0.78rem;
      }

      h2,
      h3 {
        letter-spacing: 0;
      }

      h3 {
        margin: 1rem 0 0.25rem;
      }

      @media (max-width: 980px) {
        .part-builder {
          grid-template-columns: 1fr;
        }

        .part-builder__sidebar {
          position: static;
          max-height: none;
        }
      }

      @media (max-width: 720px) {
        .part-builder {
          padding: 1rem;
        }

        .part-builder__output-grid {
          grid-template-columns: 1fr;
        }

        .part-builder__panel-head {
          flex-direction: column;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartBuilderComponent {
  protected readonly testIds = PART_BUILDER_TEST_IDS;
  protected readonly routeParts = ROUTE_TREE_PARTS;
  protected readonly selectedPartId = signal(ROUTE_TREE_PARTS[0].id);
  protected readonly generatedPart = signal<GeneratedDiagramPart | null>(null);

  protected readonly selectedPart = computed(() => {
    return (
      ROUTE_TREE_PARTS.find((part) => part.id === this.selectedPartId()) ?? ROUTE_TREE_PARTS[0]
    );
  });

  protected readonly generatedPartJson = computed(() => {
    const output = this.generatedPart();
    if (!output) return '{}';
    return JSON.stringify(output.spec, null, 2);
  });

  protected selectPart(partId: string): void {
    this.selectedPartId.set(partId);
  }

  protected generate(): void {
    const part = this.selectedPart();

    this.generatedPart.set({
      generatedAtIso: new Date().toISOString(),
      part,
      svgUrl: buildRoutePartSvg(part),
      spec: {
        schema: 'nxt1_diagram_part_v1',
        tool: 'create_play_diagram',
        category: part.category,
        partId: part.id,
        name: part.name,
        shorthand: part.shorthand,
        family: part.family,
        stemYards: part.stemYards,
        landmark: part.landmark,
        breakDirection: part.breakDirection,
        pathD: part.pathD,
        coachingCues: part.coachingCues,
      },
    });
  }
}
