import { C } from '../shared/svg-colors.js';
import type { DiagramLayout, SportRenderer } from '../shared/diagram.types.js';

function resolveFootballPalette(style?: DiagramLayout['fieldStyle']) {
  switch (style) {
    case 'modern':
      return {
        fieldDark: C.fieldDark,
        fieldStripe: C.fieldStripe,
        yardLine: C.yardLine,
        hashMark: C.hashMark,
        los: C.los,
        losText: C.losText,
      };
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
        fieldDark: '#ffffff',
        fieldStripe: '#ffffff',
        yardLine: 'rgba(31, 41, 55, 0.18)',
        hashMark: 'rgba(107, 114, 128, 0.22)',
        los: '#111827',
        losText: 'rgba(55, 65, 81, 0.42)',
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
    const leftBoundaryX = 8;
    const rightBoundaryX = fieldWidth - 8;
    const playableWidth = rightBoundaryX - leftBoundaryX;
    const leftHashX = leftBoundaryX + playableWidth / 3;
    const rightHashX = rightBoundaryX - playableWidth / 3;

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
        `<line x1="${leftHashX}" y1="${y - 6}" x2="${leftHashX}" y2="${y + 6}" stroke="${palette.hashMark}" stroke-width="1.5"/>`,
        `<line x1="${rightHashX}" y1="${y - 6}" x2="${rightHashX}" y2="${y + 6}" stroke="${palette.hashMark}" stroke-width="1.5"/>`
      );
    }

    parts.push(
      `<line x1="${leftBoundaryX}" y1="30" x2="${leftBoundaryX}" y2="${fieldHeight}" stroke="${palette.yardLine}" stroke-width="1.25"/>`,
      `<line x1="${rightBoundaryX}" y1="30" x2="${rightBoundaryX}" y2="${fieldHeight}" stroke="${palette.yardLine}" stroke-width="1.25"/>`,
      `<line x1="${leftBoundaryX}" y1="${fieldHeight}" x2="${rightBoundaryX}" y2="${fieldHeight}" stroke="${palette.yardLine}" stroke-width="1.25"/>`
    );

    parts.push(
      `<line x1="10" y1="${losY}" x2="${fieldWidth - 10}" y2="${losY}" stroke="${palette.los}" stroke-width="2.5" stroke-dasharray="10,5"/>`,
      `<text x="16" y="${losY - 6}" fill="${palette.losText}" font-size="10" font-family="Arial,sans-serif" font-weight="bold">LOS</text>`
    );

    const rows = Math.max(1, Math.floor((fieldHeight - 80) / 80));
    for (let index = 0; index < rows; index += 1) {
      const y = 74 + index * 80;
      const label = String((rows - index) * 10);
      parts.push(
        `<text x="32" y="${y}" fill="${palette.losText}" font-size="10" font-family="Arial,sans-serif" font-weight="700">${label}</text>`,
        `<text x="${fieldWidth - 32}" y="${y}" fill="${palette.losText}" font-size="10" font-family="Arial,sans-serif" font-weight="700">${label}</text>`
      );
    }

    return parts.join('\n');
  },
};
