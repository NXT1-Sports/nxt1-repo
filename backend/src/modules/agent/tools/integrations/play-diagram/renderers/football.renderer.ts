import { C } from '../shared/svg-colors.js';
import type { DiagramLayout, SportRenderer } from '../shared/diagram.types.js';

function resolveFootballPalette(style?: DiagramLayout['fieldStyle']) {
  switch (style) {
    case 'night':
      return {
        fieldDark: '#203f2d',
        fieldStripe: '#2e5a41',
        yardLine: 'rgba(255,255,255,0.18)',
        hashMark: 'rgba(255,255,255,0.26)',
        los: '#f8fafc',
        losText: 'rgba(248,250,252,0.78)',
      };
    case 'blueprint':
      return {
        fieldDark: '#123b67',
        fieldStripe: '#1b4f87',
        yardLine: 'rgba(147, 197, 253, 0.35)',
        hashMark: 'rgba(125, 211, 252, 0.55)',
        los: '#e0f2fe',
        losText: 'rgba(224,242,254,0.88)',
      };
    case 'chalk':
      return {
        fieldDark: '#2a2a2a',
        fieldStripe: '#363636',
        yardLine: 'rgba(255,255,255,0.12)',
        hashMark: 'rgba(255,255,255,0.28)',
        los: '#ffffff',
        losText: 'rgba(255,255,255,0.82)',
      };
    default:
      return {
        fieldDark: C.fieldDark,
        fieldStripe: C.fieldStripe,
        yardLine: C.yardLine,
        hashMark: C.hashMark,
        los: C.los,
        losText: C.losText,
      };
  }
}

export const footballRenderer: SportRenderer = {
  sport: 'football',
  defaultLosY: 300,
  renderField(layout: DiagramLayout): string {
    const { fieldWidth, fieldHeight, losY } = layout;
    const palette = resolveFootballPalette(layout.fieldStyle);
    const parts: string[] = [];

    parts.push(
      `<rect x="0" y="0" width="${fieldWidth}" height="${fieldHeight}" fill="${palette.fieldDark}"/>`
    );

    for (let y = 0; y < fieldHeight; y += 80) {
      parts.push(
        `<rect x="0" y="${y}" width="${fieldWidth}" height="40" fill="${palette.fieldStripe}" opacity="0.55"/>`
      );
    }

    for (let y = 40; y < fieldHeight; y += 40) {
      parts.push(
        `<line x1="0" y1="${y}" x2="${fieldWidth}" y2="${y}" stroke="${palette.yardLine}" stroke-width="1"/>`
      );
    }

    for (let y = 20; y < fieldHeight; y += 40) {
      parts.push(
        `<line x1="182" y1="${y - 6}" x2="182" y2="${y + 6}" stroke="${palette.hashMark}" stroke-width="1.5"/>`,
        `<line x1="418" y1="${y - 6}" x2="418" y2="${y + 6}" stroke="${palette.hashMark}" stroke-width="1.5"/>`
      );
    }

    parts.push(
      `<line x1="10" y1="${losY}" x2="${fieldWidth - 10}" y2="${losY}" stroke="${palette.los}" stroke-width="2.5" stroke-dasharray="10,5"/>`,
      `<text x="16" y="${losY - 6}" fill="${palette.losText}" font-size="10" font-family="Arial,sans-serif" font-weight="bold">LOS</text>`
    );

    return parts.join('\n');
  },
};
