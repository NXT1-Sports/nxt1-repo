import { C } from '../shared/svg-colors.js';
import type { DiagramLayout, SportRenderer } from '../shared/diagram.types.js';

function resolveBaseballPalette(style?: DiagramLayout['fieldStyle']) {
  switch (style) {
    case 'night':
      return {
        grass: '#2b5b34',
        dirt: '#8c5a2c',
        line: 'rgba(255,255,255,0.88)',
      };
    case 'blueprint':
      return {
        grass: '#123b67',
        dirt: '#1d4d7b',
        line: 'rgba(186,230,253,0.92)',
      };
    case 'chalk':
      return {
        grass: '#2b2b2b',
        dirt: '#3c3c3c',
        line: 'rgba(255,255,255,0.88)',
      };
    default:
      return {
        grass: C.baseballGrass,
        dirt: C.baseballDirt,
        line: C.baseballLine,
      };
  }
}

function renderBaseballLikeField(layout: DiagramLayout, diamondScale: number): string {
  const { fieldWidth, fieldHeight } = layout;
  const cx = fieldWidth / 2;
  const cy = fieldHeight * 0.68;
  const d = 70 * diamondScale;
  const palette = resolveBaseballPalette(layout.fieldStyle);
  const parts: string[] = [];

  parts.push(
    `<rect x="0" y="0" width="${fieldWidth}" height="${fieldHeight}" fill="${palette.grass}"/>`
  );

  const home: [number, number] = [cx, cy + d];
  const first: [number, number] = [cx + d, cy];
  const second: [number, number] = [cx, cy - d];
  const third: [number, number] = [cx - d, cy];

  parts.push(
    `<polygon points="${home[0]},${home[1]} ${first[0]},${first[1]} ${second[0]},${second[1]} ${third[0]},${third[1]}" fill="${palette.dirt}" stroke="${palette.line}" stroke-width="2"/>`
  );

  parts.push(
    `<line x1="${home[0]}" y1="${home[1]}" x2="12" y2="12" stroke="${palette.line}" stroke-width="2"/>`
  );
  parts.push(
    `<line x1="${home[0]}" y1="${home[1]}" x2="${fieldWidth - 12}" y2="12" stroke="${palette.line}" stroke-width="2"/>`
  );

  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="16" fill="${palette.dirt}" stroke="${palette.line}" stroke-width="1.5"/>`
  );

  for (const [x, y] of [home, first, second, third]) {
    parts.push(
      `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="#ffffff" stroke="${palette.line}" stroke-width="1"/>`
    );
  }

  const outfieldRadius = fieldHeight * 0.75;
  parts.push(
    `<path d="M 12 12 A ${outfieldRadius} ${outfieldRadius} 0 0 1 ${fieldWidth - 12} 12" fill="none" stroke="${palette.line}" stroke-width="2" opacity="0.75"/>`
  );

  return parts.join('\n');
}

export const baseballRenderer: SportRenderer = {
  sport: 'baseball',
  defaultLosY: 300,
  renderField(layout: DiagramLayout): string {
    return renderBaseballLikeField(layout, 1);
  },
};

export const softballRenderer: SportRenderer = {
  sport: 'softball',
  defaultLosY: 300,
  renderField(layout: DiagramLayout): string {
    return renderBaseballLikeField(layout, 0.9);
  },
};
