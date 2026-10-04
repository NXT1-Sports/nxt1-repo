/**
 * @fileoverview SVG path generation for DrawingML preset (`a:prstGeom`) and custom
 * (`a:custGeom`) shape geometry.
 *
 * Covers the presets PowerPoint, Google Slides, Gamma and pptxgenjs emit in practice; unknown
 * presets degrade to a rectangle so the shape's fill and text still render in place.
 */

import { attr, child, children, numAttr } from './pptx-xml';

export interface ShapeGeometry {
  /** One SVG path per sub-path, each with its own fill/stroke switches. */
  readonly paths: readonly GeometryPath[];
}

export interface GeometryPath {
  readonly d: string;
  readonly fill: boolean;
  readonly stroke: boolean;
}

const ANGLE_UNIT = 60000;

/** Presets whose outline is an open stroke with no fillable interior. */
const LINE_PRESETS: ReadonlySet<string> = new Set([
  'line',
  'lineInv',
  'straightConnector1',
  'bentConnector2',
  'bentConnector3',
  'bentConnector4',
  'bentConnector5',
  'curvedConnector2',
  'curvedConnector3',
  'curvedConnector4',
  'curvedConnector5',
  'arc',
  'leftBracket',
  'rightBracket',
  'leftBrace',
  'rightBrace',
  'bracketPair',
  'bracePair',
]);

export function isLinePreset(prst: string): boolean {
  return LINE_PRESETS.has(prst);
}

/** Reads `a:avLst/a:gd` adjust values (`fmla="val 25000"`). */
export function readAdjustValues(geom: Element | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const gd of children(child(geom, 'avLst'), 'gd')) {
    const name = attr(gd, 'name');
    const match = /^val\s+(-?\d+(?:\.\d+)?)$/.exec((attr(gd, 'fmla') ?? '').trim());
    if (name && match) out.set(name, Number(match[1]));
  }
  return out;
}

const f = (n: number): string => (Math.round(n * 100) / 100).toString();

function polygon(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(x)},${f(y)}`).join(' ') + ' Z';
}

function regularPolygon(w: number, h: number, sides: number, rotation = -Math.PI / 2): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * 2 * Math.PI) / sides;
    pts.push([w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)]);
  }
  return polygon(pts);
}

function star(w: number, h: number, points: number, innerRatio: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rx = i % 2 === 0 ? w / 2 : (w / 2) * innerRatio;
    const ry = i % 2 === 0 ? h / 2 : (h / 2) * innerRatio;
    pts.push([w / 2 + rx * Math.cos(a), h / 2 + ry * Math.sin(a)]);
  }
  return polygon(pts);
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return (
    `M${f(cx - rx)},${f(cy)} A${f(rx)},${f(ry)} 0 1,0 ${f(cx + rx)},${f(cy)} ` +
    `A${f(rx)},${f(ry)} 0 1,0 ${f(cx - rx)},${f(cy)} Z`
  );
}

function roundRectPath(w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr === 0)
    return polygon([
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ]);
  return (
    `M${f(rr)},0 L${f(w - rr)},0 A${f(rr)},${f(rr)} 0 0,1 ${f(w)},${f(rr)} ` +
    `L${f(w)},${f(h - rr)} A${f(rr)},${f(rr)} 0 0,1 ${f(w - rr)},${f(h)} ` +
    `L${f(rr)},${f(h)} A${f(rr)},${f(rr)} 0 0,1 0,${f(h - rr)} ` +
    `L0,${f(rr)} A${f(rr)},${f(rr)} 0 0,1 ${f(rr)},0 Z`
  );
}

/** Rounded corners per corner: [topLeft, topRight, bottomRight, bottomLeft]. */
function cornerRectPath(
  w: number,
  h: number,
  radii: readonly [number, number, number, number]
): string {
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, w / 2, h / 2)));
  const arc = (r: number, x: number, y: number): string =>
    r > 0 ? `A${f(r)},${f(r)} 0 0,1 ${f(x)},${f(y)}` : `L${f(x)},${f(y)}`;
  return (
    `M${f(tl)},0 L${f(w - tr)},0 ${arc(tr, w, tr)} L${f(w)},${f(h - br)} ${arc(br, w - br, h)} ` +
    `L${f(bl)},${f(h)} ${arc(bl, 0, h - bl)} L0,${f(tl)} ${arc(tl, tl, 0)} Z`
  );
}

/** Pie/arc endpoints use the DrawingML visual angle convention (clockwise from +x). */
function ellipsePoint(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  deg: number
): [number, number] {
  const t = (deg * Math.PI) / 180;
  return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
}

function sweepDegrees(start: number, end: number): number {
  let sweep = end - start;
  while (sweep <= 0) sweep += 360;
  while (sweep > 360) sweep -= 360;
  return sweep;
}

export function presetGeometry(
  prst: string,
  w: number,
  h: number,
  adj: Map<string, number>
): ShapeGeometry {
  const ss = Math.min(w, h);
  const a = (name: string, fallback: number): number => adj.get(name) ?? fallback;
  const single = (d: string, fill = true, stroke = true): ShapeGeometry => ({
    paths: [{ d, fill, stroke }],
  });

  switch (prst) {
    case 'rect':
    case 'flowChartProcess':
    case 'flowChartPredefinedProcess':
    case 'flowChartInternalStorage':
    case 'wedgeRectCallout':
    case 'borderCallout1':
    case 'callout1':
    case 'accentCallout1':
    case 'actionButtonBlank':
      return single(
        polygon([
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
        ])
      );
    case 'roundRect':
    case 'flowChartAlternateProcess':
    case 'wedgeRoundRectCallout':
      return single(roundRectPath(w, h, (ss * a('adj', 16667)) / 100000));
    case 'round1Rect': {
      const r = (ss * a('adj', 16667)) / 100000;
      return single(cornerRectPath(w, h, [0, r, 0, 0]));
    }
    case 'round2SameRect': {
      const r1 = (ss * a('adj1', 16667)) / 100000;
      const r2 = (ss * a('adj2', 0)) / 100000;
      return single(cornerRectPath(w, h, [r1, r1, r2, r2]));
    }
    case 'round2DiagRect': {
      const r1 = (ss * a('adj1', 16667)) / 100000;
      const r2 = (ss * a('adj2', 0)) / 100000;
      return single(cornerRectPath(w, h, [r1, r2, r1, r2]));
    }
    case 'snip1Rect': {
      const s = (ss * a('adj', 16667)) / 100000;
      return single(
        polygon([
          [0, 0],
          [w - s, 0],
          [w, s],
          [w, h],
          [0, h],
        ])
      );
    }
    case 'snip2SameRect': {
      const s = (ss * a('adj1', 16667)) / 100000;
      return single(
        polygon([
          [s, 0],
          [w - s, 0],
          [w, s],
          [w, h],
          [0, h],
          [0, s],
        ])
      );
    }
    case 'snipRoundRect': {
      const r = (ss * a('adj1', 16667)) / 100000;
      const s = (ss * a('adj2', 16667)) / 100000;
      return single(
        `M${f(r)},0 L${f(w - s)},0 L${f(w)},${f(s)} L${f(w)},${f(h)} L0,${f(h)} L0,${f(r)} ` +
          `A${f(r)},${f(r)} 0 0,1 ${f(r)},0 Z`
      );
    }
    case 'ellipse':
    case 'flowChartConnector':
    case 'wedgeEllipseCallout':
    case 'cloud':
    case 'cloudCallout':
      return single(ellipsePath(w / 2, h / 2, w / 2, h / 2));
    case 'triangle':
    case 'flowChartExtract': {
      const x = (w * a('adj', 50000)) / 100000;
      return single(
        polygon([
          [x, 0],
          [w, h],
          [0, h],
        ])
      );
    }
    case 'flowChartMerge':
      return single(
        polygon([
          [0, 0],
          [w, 0],
          [w / 2, h],
        ])
      );
    case 'rtTriangle':
      return single(
        polygon([
          [0, 0],
          [w, h],
          [0, h],
        ])
      );
    case 'diamond':
    case 'flowChartDecision':
      return single(
        polygon([
          [w / 2, 0],
          [w, h / 2],
          [w / 2, h],
          [0, h / 2],
        ])
      );
    case 'parallelogram':
    case 'flowChartInputOutput': {
      const o = prst === 'parallelogram' ? (ss * a('adj', 25000)) / 100000 : w / 5;
      return single(
        polygon([
          [o, 0],
          [w, 0],
          [w - o, h],
          [0, h],
        ])
      );
    }
    case 'trapezoid':
    case 'flowChartManualOperation': {
      const o = prst === 'trapezoid' ? (ss * a('adj', 25000)) / 100000 : w / 5;
      return prst === 'trapezoid'
        ? single(
            polygon([
              [o, 0],
              [w - o, 0],
              [w, h],
              [0, h],
            ])
          )
        : single(
            polygon([
              [0, 0],
              [w, 0],
              [w - o, h],
              [o, h],
            ])
          );
    }
    case 'pentagon':
      return single(
        polygon([
          [w / 2, 0],
          [w, h * 0.382],
          [w * 0.809, h],
          [w * 0.191, h],
          [0, h * 0.382],
        ])
      );
    case 'hexagon':
    case 'flowChartPreparation': {
      const o = prst === 'hexagon' ? (ss * a('adj', 25000)) / 100000 : w / 5;
      return single(
        polygon([
          [o, 0],
          [w - o, 0],
          [w, h / 2],
          [w - o, h],
          [o, h],
          [0, h / 2],
        ])
      );
    }
    case 'heptagon':
      return single(regularPolygon(w, h, 7));
    case 'octagon': {
      const o = (ss * a('adj', 29289)) / 100000;
      return single(
        polygon([
          [o, 0],
          [w - o, 0],
          [w, o],
          [w, h - o],
          [w - o, h],
          [o, h],
          [0, h - o],
          [0, o],
        ])
      );
    }
    case 'decagon':
      return single(regularPolygon(w, h, 10));
    case 'dodecagon':
      return single(regularPolygon(w, h, 12));
    case 'homePlate':
    case 'flowChartOffpageConnector': {
      if (prst === 'flowChartOffpageConnector') {
        return single(
          polygon([
            [0, 0],
            [w, 0],
            [w, h * 0.8],
            [w / 2, h],
            [0, h * 0.8],
          ])
        );
      }
      const o = (ss * a('adj', 50000)) / 100000;
      return single(
        polygon([
          [0, 0],
          [w - o, 0],
          [w, h / 2],
          [w - o, h],
          [0, h],
        ])
      );
    }
    case 'chevron': {
      const o = (ss * a('adj', 50000)) / 100000;
      return single(
        polygon([
          [0, 0],
          [w - o, 0],
          [w, h / 2],
          [w - o, h],
          [0, h],
          [o, h / 2],
        ])
      );
    }
    case 'rightArrow':
    case 'leftArrow':
    case 'upArrow':
    case 'downArrow':
      return single(arrowPath(prst, w, h, a('adj1', 50000), a('adj2', 50000)));
    case 'leftRightArrow': {
      const shaft = (h * a('adj1', 50000)) / 100000;
      const head = (ss * a('adj2', 50000)) / 100000;
      const t = (h - shaft) / 2;
      return single(
        polygon([
          [0, h / 2],
          [head, 0],
          [head, t],
          [w - head, t],
          [w - head, 0],
          [w, h / 2],
          [w - head, h],
          [w - head, h - t],
          [head, h - t],
          [head, h],
        ])
      );
    }
    case 'notchedRightArrow': {
      const shaft = (h * a('adj1', 50000)) / 100000;
      const head = (ss * a('adj2', 50000)) / 100000;
      const t = (h - shaft) / 2;
      const notch = (head * shaft) / h;
      return single(
        polygon([
          [0, t],
          [w - head, t],
          [w - head, 0],
          [w, h / 2],
          [w - head, h],
          [w - head, h - t],
          [0, h - t],
          [notch, h / 2],
        ])
      );
    }
    case 'star4':
      return single(star(w, h, 4, a('adj', 12500) / 50000));
    case 'star5':
      return single(star(w, h, 5, 0.382));
    case 'star6':
      return single(star(w, h, 6, 0.577));
    case 'star7':
      return single(star(w, h, 7, 0.6));
    case 'star8':
      return single(star(w, h, 8, a('adj', 38250) / 50000));
    case 'star10':
      return single(star(w, h, 10, 0.75));
    case 'star12':
      return single(star(w, h, 12, a('adj', 37500) / 50000));
    case 'star16':
    case 'star24':
    case 'star32':
      return single(star(w, h, Number(prst.slice(4)), 0.85));
    case 'plus':
    case 'flowChartSummingJunction':
    case 'mathPlus': {
      const o = (ss * a('adj', 25000)) / 100000;
      return single(
        polygon([
          [o, 0],
          [w - o, 0],
          [w - o, o],
          [w, o],
          [w, h - o],
          [w - o, h - o],
          [w - o, h],
          [o, h],
          [o, h - o],
          [0, h - o],
          [0, o],
          [o, o],
        ])
      );
    }
    case 'donut': {
      const t = (ss * a('adj', 25000)) / 100000;
      return single(
        `${ellipsePath(w / 2, h / 2, w / 2, h / 2)} ${ellipsePath(w / 2, h / 2, w / 2 - t, h / 2 - t)}`
      );
    }
    case 'frame': {
      const t = (ss * a('adj1', 12500)) / 100000;
      return single(
        `${polygon([
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
        ])} ` +
          `${polygon([
            [t, t],
            [t, h - t],
            [w - t, h - t],
            [w - t, t],
          ])}`
      );
    }
    case 'flowChartTerminator':
      return single(roundRectPath(w, h, h / 2));
    case 'flowChartDocument':
      return single(
        `M0,0 L${f(w)},0 L${f(w)},${f(h * 0.83)} ` +
          `C${f(w * 0.75)},${f(h * 0.7)} ${f(w * 0.5)},${f(h * 1.05)} ${f(w * 0.25)},${f(h)} ` +
          `C${f(w * 0.1)},${f(h * 0.97)} 0,${f(h * 0.9)} 0,${f(h * 0.88)} Z`
      );
    case 'can':
    case 'flowChartMagneticDisk': {
      const ry = (ss * a('adj', 25000)) / 100000 / 2;
      return {
        paths: [
          {
            d:
              `M0,${f(ry)} A${f(w / 2)},${f(ry)} 0 0,1 ${f(w)},${f(ry)} L${f(w)},${f(h - ry)} ` +
              `A${f(w / 2)},${f(ry)} 0 0,1 0,${f(h - ry)} Z`,
            fill: true,
            stroke: true,
          },
          {
            d: `M0,${f(ry)} A${f(w / 2)},${f(ry)} 0 0,0 ${f(w)},${f(ry)}`,
            fill: false,
            stroke: true,
          },
        ],
      };
    }
    case 'cube': {
      const d = (ss * a('adj', 25000)) / 100000;
      return {
        paths: [
          {
            d: polygon([
              [0, d],
              [w - d, d],
              [w - d, h],
              [0, h],
            ]),
            fill: true,
            stroke: true,
          },
          {
            d: polygon([
              [0, d],
              [d, 0],
              [w, 0],
              [w - d, d],
            ]),
            fill: true,
            stroke: true,
          },
          {
            d: polygon([
              [w - d, d],
              [w, 0],
              [w, h - d],
              [w - d, h],
            ]),
            fill: true,
            stroke: true,
          },
        ],
      };
    }
    case 'heart':
      return single(
        `M${f(w / 2)},${f(h / 4)} C${f(w / 2)},${f(-h / 8)} ${f(-w / 4)},${f(h / 8)} 0,${f(h / 3)} ` +
          `C0,${f(h * 0.62)} ${f(w / 3)},${f(h * 0.8)} ${f(w / 2)},${f(h)} ` +
          `C${f((w * 2) / 3)},${f(h * 0.8)} ${f(w)},${f(h * 0.62)} ${f(w)},${f(h / 3)} ` +
          `C${f(w * 1.25)},${f(h / 8)} ${f(w / 2)},${f(-h / 8)} ${f(w / 2)},${f(h / 4)} Z`
      );
    case 'teardrop':
      return single(
        `M0,${f(h / 2)} A${f(w / 2)},${f(h / 2)} 0 0,1 ${f(w / 2)},0 L${f(w)},0 L${f(w)},${f(h / 2)} ` +
          `A${f(w / 2)},${f(h / 2)} 0 0,1 ${f(w / 2)},${f(h)} A${f(w / 2)},${f(h / 2)} 0 0,1 0,${f(h / 2)} Z`
      );
    case 'pie':
    case 'chord':
    case 'blockArc': {
      const defaultStart = prst === 'blockArc' ? 180 : prst === 'chord' ? 45 : 0;
      const st = a('adj1', defaultStart * ANGLE_UNIT) / ANGLE_UNIT;
      const en = a('adj2', prst === 'blockArc' ? 0 : 270 * ANGLE_UNIT) / ANGLE_UNIT;
      const sweep = sweepDegrees(st, en);
      const large = sweep > 180 ? 1 : 0;
      const [x1, y1] = ellipsePoint(w / 2, h / 2, w / 2, h / 2, st);
      const [x2, y2] = ellipsePoint(w / 2, h / 2, w / 2, h / 2, st + sweep);
      if (prst === 'blockArc') {
        const t = (ss * a('adj3', 25000)) / 100000;
        const [x3, y3] = ellipsePoint(w / 2, h / 2, w / 2 - t, h / 2 - t, st + sweep);
        const [x4, y4] = ellipsePoint(w / 2, h / 2, w / 2 - t, h / 2 - t, st);
        return single(
          `M${f(x1)},${f(y1)} A${f(w / 2)},${f(h / 2)} 0 ${large},1 ${f(x2)},${f(y2)} ` +
            `L${f(x3)},${f(y3)} A${f(w / 2 - t)},${f(h / 2 - t)} 0 ${large},0 ${f(x4)},${f(y4)} Z`
        );
      }
      const arc = `M${f(x1)},${f(y1)} A${f(w / 2)},${f(h / 2)} 0 ${large},1 ${f(x2)},${f(y2)}`;
      return single(prst === 'pie' ? `${arc} L${f(w / 2)},${f(h / 2)} Z` : `${arc} Z`);
    }
    case 'arc': {
      const st = a('adj1', 270 * ANGLE_UNIT) / ANGLE_UNIT;
      const en = a('adj2', 0) / ANGLE_UNIT;
      const sweep = sweepDegrees(st, en);
      const [x1, y1] = ellipsePoint(w / 2, h / 2, w / 2, h / 2, st);
      const [x2, y2] = ellipsePoint(w / 2, h / 2, w / 2, h / 2, st + sweep);
      return single(
        `M${f(x1)},${f(y1)} A${f(w / 2)},${f(h / 2)} 0 ${sweep > 180 ? 1 : 0},1 ${f(x2)},${f(y2)}`,
        false
      );
    }
    case 'line':
    case 'straightConnector1':
      return single(`M0,0 L${f(w)},${f(h)}`, false);
    case 'lineInv':
      return single(`M0,${f(h)} L${f(w)},0`, false);
    case 'bentConnector2':
      return single(`M0,0 L${f(w)},0 L${f(w)},${f(h)}`, false);
    case 'bentConnector3': {
      const x = (w * a('adj1', 50000)) / 100000;
      return single(`M0,0 L${f(x)},0 L${f(x)},${f(h)} L${f(w)},${f(h)}`, false);
    }
    case 'bentConnector4':
    case 'bentConnector5': {
      const x = (w * a('adj1', 50000)) / 100000;
      const y = (h * a('adj2', 50000)) / 100000;
      return single(`M0,0 L${f(x)},0 L${f(x)},${f(y)} L${f(w)},${f(y)} L${f(w)},${f(h)}`, false);
    }
    case 'curvedConnector2':
      return single(`M0,0 C${f(w)},0 ${f(w)},0 ${f(w)},${f(h)}`, false);
    case 'curvedConnector3':
    case 'curvedConnector4':
    case 'curvedConnector5': {
      const x = (w * a('adj1', 50000)) / 100000;
      return single(`M0,0 C${f(x)},0 ${f(x)},${f(h)} ${f(w)},${f(h)}`, false);
    }
    case 'leftBracket':
      return single(
        `M${f(w)},0 A${f(w)},${f(Math.min(w, h / 2))} 0 0,0 0,${f(Math.min(w, h / 2))} ` +
          `L0,${f(h - Math.min(w, h / 2))} A${f(w)},${f(Math.min(w, h / 2))} 0 0,0 ${f(w)},${f(h)}`,
        false
      );
    case 'rightBracket':
      return single(
        `M0,0 A${f(w)},${f(Math.min(w, h / 2))} 0 0,1 ${f(w)},${f(Math.min(w, h / 2))} ` +
          `L${f(w)},${f(h - Math.min(w, h / 2))} A${f(w)},${f(Math.min(w, h / 2))} 0 0,1 0,${f(h)}`,
        false
      );
    case 'leftBrace':
      return single(
        `M${f(w)},0 Q${f(w / 2)},0 ${f(w / 2)},${f(h / 4)} L${f(w / 2)},${f(h / 2 - w / 2)} ` +
          `Q${f(w / 2)},${f(h / 2)} 0,${f(h / 2)} Q${f(w / 2)},${f(h / 2)} ${f(w / 2)},${f(h / 2 + w / 2)} ` +
          `L${f(w / 2)},${f((h * 3) / 4)} Q${f(w / 2)},${f(h)} ${f(w)},${f(h)}`,
        false
      );
    case 'rightBrace':
      return single(
        `M0,0 Q${f(w / 2)},0 ${f(w / 2)},${f(h / 4)} L${f(w / 2)},${f(h / 2 - w / 2)} ` +
          `Q${f(w / 2)},${f(h / 2)} ${f(w)},${f(h / 2)} Q${f(w / 2)},${f(h / 2)} ${f(w / 2)},${f(h / 2 + w / 2)} ` +
          `L${f(w / 2)},${f((h * 3) / 4)} Q${f(w / 2)},${f(h)} 0,${f(h)}`,
        false
      );
    case 'bracketPair': {
      const r = (ss * a('adj', 16667)) / 100000;
      return {
        paths: [
          {
            d: `M${f(r)},0 A${f(r)},${f(r)} 0 0,0 0,${f(r)} L0,${f(h - r)} A${f(r)},${f(r)} 0 0,0 ${f(r)},${f(h)}`,
            fill: false,
            stroke: true,
          },
          {
            d: `M${f(w - r)},0 A${f(r)},${f(r)} 0 0,1 ${f(w)},${f(r)} L${f(w)},${f(h - r)} A${f(r)},${f(r)} 0 0,1 ${f(w - r)},${f(h)}`,
            fill: false,
            stroke: true,
          },
        ],
      };
    }
    case 'mathMinus': {
      const t = (h * a('adj1', 23520)) / 100000;
      return single(
        polygon([
          [0, h / 2 - t / 2],
          [w, h / 2 - t / 2],
          [w, h / 2 + t / 2],
          [0, h / 2 + t / 2],
        ])
      );
    }
    default:
      return single(
        polygon([
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
        ])
      );
  }
}

function arrowPath(prst: string, w: number, h: number, adj1: number, adj2: number): string {
  const horizontal = prst === 'rightArrow' || prst === 'leftArrow';
  // Normalize to a right-pointing arrow in (len × thick) space, then map back.
  const len = horizontal ? w : h;
  const thick = horizontal ? h : w;
  const ss = Math.min(w, h);
  const shaft = (thick * adj1) / 100000;
  const head = Math.min(len, (ss * adj2) / 100000);
  const t = (thick - shaft) / 2;
  const pts: [number, number][] = [
    [0, t],
    [len - head, t],
    [len - head, 0],
    [len, thick / 2],
    [len - head, thick],
    [len - head, thick - t],
    [0, thick - t],
  ];
  const mapped = pts.map(([x, y]): [number, number] => {
    switch (prst) {
      case 'leftArrow':
        return [len - x, y];
      case 'downArrow':
        return [y, x];
      case 'upArrow':
        return [y, len - x];
      default:
        return [x, y];
    }
  });
  return polygon(mapped);
}

/** Builds paths from `a:custGeom/a:pathLst`, scaling each path's own coordinate space to the shape. */
export function customGeometry(custGeom: Element, w: number, h: number): ShapeGeometry {
  const paths: GeometryPath[] = [];
  for (const pathEl of children(child(custGeom, 'pathLst'), 'path')) {
    const pw = numAttr(pathEl, 'w') || w;
    const ph = numAttr(pathEl, 'h') || h;
    const sx = pw ? w / pw : 1;
    const sy = ph ? h / ph : 1;
    const pt = (el: Element | null): [number, number] => [
      (numAttr(el, 'x') ?? 0) * sx,
      (numAttr(el, 'y') ?? 0) * sy,
    ];

    const parts: string[] = [];
    let cx = 0;
    let cy = 0;
    for (const cmd of children(pathEl)) {
      const pts = children(cmd, 'pt');
      switch (cmd.localName) {
        case 'moveTo': {
          [cx, cy] = pt(pts[0] ?? null);
          parts.push(`M${f(cx)},${f(cy)}`);
          break;
        }
        case 'lnTo': {
          [cx, cy] = pt(pts[0] ?? null);
          parts.push(`L${f(cx)},${f(cy)}`);
          break;
        }
        case 'cubicBezTo': {
          const [p1, p2, p3] = pts.map(pt);
          if (p1 && p2 && p3) {
            parts.push(`C${f(p1[0])},${f(p1[1])} ${f(p2[0])},${f(p2[1])} ${f(p3[0])},${f(p3[1])}`);
            [cx, cy] = p3;
          }
          break;
        }
        case 'quadBezTo': {
          const [p1, p2] = pts.map(pt);
          if (p1 && p2) {
            parts.push(`Q${f(p1[0])},${f(p1[1])} ${f(p2[0])},${f(p2[1])}`);
            [cx, cy] = p2;
          }
          break;
        }
        case 'arcTo': {
          const rx = (numAttr(cmd, 'wR') ?? 0) * sx;
          const ry = (numAttr(cmd, 'hR') ?? 0) * sy;
          const st = ((numAttr(cmd, 'stAng') ?? 0) / ANGLE_UNIT) * (Math.PI / 180);
          const sw = ((numAttr(cmd, 'swAng') ?? 0) / ANGLE_UNIT) * (Math.PI / 180);
          if (rx <= 0 || ry <= 0 || sw === 0) break;
          const centerX = cx - rx * Math.cos(st);
          const centerY = cy - ry * Math.sin(st);
          // SVG cannot draw a full ellipse in one arc command; split large sweeps.
          const steps = Math.abs(sw) >= 2 * Math.PI - 1e-6 ? 2 : 1;
          for (let i = 1; i <= steps; i++) {
            const end = st + (sw * i) / steps;
            const ex = centerX + rx * Math.cos(end);
            const ey = centerY + ry * Math.sin(end);
            const segSweep = Math.abs(sw / steps);
            parts.push(
              `A${f(rx)},${f(ry)} 0 ${segSweep > Math.PI ? 1 : 0},${sw > 0 ? 1 : 0} ${f(ex)},${f(ey)}`
            );
            cx = ex;
            cy = ey;
          }
          break;
        }
        case 'close':
          parts.push('Z');
          break;
      }
    }

    if (parts.length > 0) {
      paths.push({
        d: parts.join(' '),
        fill: attr(pathEl, 'fill') !== 'none',
        stroke: attr(pathEl, 'stroke') !== '0' && attr(pathEl, 'stroke') !== 'false',
      });
    }
  }

  return paths.length > 0 ? { paths } : presetGeometry('rect', w, h, new Map());
}
