import { C } from '../shared/svg-colors.js';
import type { DiagramLayout, SportRenderer } from '../shared/diagram.types.js';

export const footballRenderer: SportRenderer = {
  sport: 'football',
  defaultLosY: 300,
  renderField(layout: DiagramLayout): string {
    const { fieldWidth, fieldHeight, losY } = layout;
    const parts: string[] = [];

    parts.push(
      `<rect x="0" y="0" width="${fieldWidth}" height="${fieldHeight}" fill="${C.fieldDark}"/>`
    );

    for (let y = 0; y < fieldHeight; y += 80) {
      parts.push(
        `<rect x="0" y="${y}" width="${fieldWidth}" height="40" fill="${C.fieldStripe}" opacity="0.55"/>`
      );
    }

    for (let y = 40; y < fieldHeight; y += 40) {
      parts.push(
        `<line x1="0" y1="${y}" x2="${fieldWidth}" y2="${y}" stroke="${C.yardLine}" stroke-width="1"/>`
      );
    }

    for (let y = 20; y < fieldHeight; y += 40) {
      parts.push(
        `<line x1="182" y1="${y - 6}" x2="182" y2="${y + 6}" stroke="${C.hashMark}" stroke-width="1.5"/>`,
        `<line x1="418" y1="${y - 6}" x2="418" y2="${y + 6}" stroke="${C.hashMark}" stroke-width="1.5"/>`
      );
    }

    parts.push(
      `<line x1="10" y1="${losY}" x2="${fieldWidth - 10}" y2="${losY}" stroke="${C.los}" stroke-width="2.5" stroke-dasharray="10,5"/>`,
      `<text x="16" y="${losY - 6}" fill="${C.losText}" font-size="10" font-family="Arial,sans-serif" font-weight="bold">LOS</text>`
    );

    return parts.join('\n');
  },
};
