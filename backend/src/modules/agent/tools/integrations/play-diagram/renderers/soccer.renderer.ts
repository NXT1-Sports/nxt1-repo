import { C } from '../shared/svg-colors.js';
import type { DiagramLayout, SportRenderer } from '../shared/diagram.types.js';

function resolveSoccerPalette(style?: DiagramLayout['fieldStyle']) {
  switch (style) {
    case 'night':
      return {
        grass: '#22513a',
        line: 'rgba(255,255,255,0.86)',
      };
    case 'blueprint':
      return {
        grass: '#123b67',
        line: 'rgba(186,230,253,0.92)',
      };
    case 'chalk':
      return {
        grass: '#2b2b2b',
        line: 'rgba(255,255,255,0.88)',
      };
    default:
      return {
        grass: C.soccerGrass,
        line: C.soccerLine,
      };
  }
}

export const soccerRenderer: SportRenderer = {
  sport: 'soccer',
  defaultLosY: 300,
  renderField(layout: DiagramLayout): string {
    const { fieldWidth, fieldHeight } = layout;
    const cx = fieldWidth / 2;
    const cy = fieldHeight / 2;
    const palette = resolveSoccerPalette(layout.fieldStyle);
    const parts: string[] = [];

    parts.push(
      `<rect x="0" y="0" width="${fieldWidth}" height="${fieldHeight}" fill="${palette.grass}"/>`
    );
    parts.push(
      `<rect x="12" y="12" width="${fieldWidth - 24}" height="${fieldHeight - 24}" fill="none" stroke="${palette.line}" stroke-width="2"/>`
    );
    parts.push(
      `<line x1="12" y1="${cy}" x2="${fieldWidth - 12}" y2="${cy}" stroke="${palette.line}" stroke-width="2"/>`
    );
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="46" fill="none" stroke="${palette.line}" stroke-width="2"/>`
    );

    const boxWidth = 200;
    const boxDepth = 70;
    const sixWidth = 90;
    const sixDepth = 28;

    const leftBoxX = cx - boxWidth / 2;
    const rightBoxX = leftBoxX;

    parts.push(
      `<rect x="${leftBoxX}" y="12" width="${boxWidth}" height="${boxDepth}" fill="none" stroke="${palette.line}" stroke-width="2"/>`
    );
    parts.push(
      `<rect x="${cx - sixWidth / 2}" y="12" width="${sixWidth}" height="${sixDepth}" fill="none" stroke="${palette.line}" stroke-width="2"/>`
    );

    parts.push(
      `<rect x="${rightBoxX}" y="${fieldHeight - 12 - boxDepth}" width="${boxWidth}" height="${boxDepth}" fill="none" stroke="${palette.line}" stroke-width="2"/>`
    );
    parts.push(
      `<rect x="${cx - sixWidth / 2}" y="${fieldHeight - 12 - sixDepth}" width="${sixWidth}" height="${sixDepth}" fill="none" stroke="${palette.line}" stroke-width="2"/>`
    );

    parts.push(
      `<rect x="${cx - 28}" y="4" width="56" height="8" fill="none" stroke="${palette.line}" stroke-width="2"/>`
    );
    parts.push(
      `<rect x="${cx - 28}" y="${fieldHeight - 12}" width="56" height="8" fill="none" stroke="${palette.line}" stroke-width="2"/>`
    );

    return parts.join('\n');
  },
};
