import { C } from '../shared/svg-colors.js';
import type { DiagramLayout, SportRenderer } from '../shared/diagram.types.js';

export const basketballRenderer: SportRenderer = {
  sport: 'basketball',
  defaultLosY: 340,
  renderField(layout: DiagramLayout): string {
    const { fieldWidth, fieldHeight } = layout;
    const cx = fieldWidth / 2;
    const parts: string[] = [];

    parts.push(
      `<rect x="0" y="0" width="${fieldWidth}" height="${fieldHeight}" fill="${C.courtFloor}"/>`
    );
    parts.push(
      `<rect x="10" y="10" width="${fieldWidth - 20}" height="${fieldHeight - 20}" fill="none" stroke="${C.courtLine}" stroke-width="2"/>`
    );

    const laneLeft = cx - 60;
    const laneRight = cx + 60;
    const baseline = 30;
    const laneBottom = 170;

    parts.push(
      `<rect x="${laneLeft}" y="${baseline}" width="120" height="${laneBottom - baseline}" fill="${C.courtLane}" stroke="${C.courtLine}" stroke-width="1.5"/>`
    );
    parts.push(
      `<line x1="${cx - 30}" y1="${baseline + 4}" x2="${cx + 30}" y2="${baseline + 4}" stroke="${C.courtLine}" stroke-width="3"/>`
    );
    parts.push(
      `<circle cx="${cx}" cy="${baseline + 14}" r="9" fill="none" stroke="${C.courtLine}" stroke-width="2"/>`
    );

    parts.push(
      `<path d="M ${laneLeft} ${laneBottom} A 60 60 0 0 0 ${laneRight} ${laneBottom}" fill="none" stroke="${C.courtLine}" stroke-width="1.5"/>`
    );
    parts.push(
      `<path d="M ${laneLeft} ${laneBottom} A 60 60 0 0 1 ${laneRight} ${laneBottom}" fill="none" stroke="${C.courtLine}" stroke-width="1.5" stroke-dasharray="6,4"/>`
    );

    const basketY = baseline + 14;
    // Three-point arc: radius 220px centred on the basket.
    // The corner straight lines are placed at cx ± cornerHW so that
    // cornerHW < r3 — guaranteeing the arc always reaches them.
    // (Using the sideline walls at x=10/590 would require cornerHW=290 > r3=220,
    //  producing NaN from sqrt and silently dropping the arc.)
    const r3 = 220;
    const cornerHW = 190; // half-width of corner lines
    const cornerJoinY = basketY + Math.round(Math.sqrt(r3 * r3 - cornerHW * cornerHW)); // ≈ basketY+111
    const cornerLeft = cx - cornerHW;
    const cornerRight = cx + cornerHW;

    // Arc — sweeps downward (away from basket) between the two corner join points.
    // sweep-flag=0 (counter-clockwise) traces the minor arc through (cx, basketY+r3),
    // i.e. the arc that bows TOWARD center court. sweep=1 goes the wrong way — up through
    // (cx, basketY-r3) behind the backboard, making the arc appear to hug the basket.
    parts.push(
      `<path d="M ${cornerLeft} ${cornerJoinY} A ${r3} ${r3} 0 0 0 ${cornerRight} ${cornerJoinY}" fill="none" stroke="${C.courtLine}" stroke-width="1.5"/>`
    );
    // Corner straight segments from baseline to where the arc begins.
    parts.push(
      `<line x1="${cornerLeft}"  y1="${baseline}" x2="${cornerLeft}"  y2="${cornerJoinY}" stroke="${C.courtLine}" stroke-width="1.5"/>`
    );
    parts.push(
      `<line x1="${cornerRight}" y1="${baseline}" x2="${cornerRight}" y2="${cornerJoinY}" stroke="${C.courtLine}" stroke-width="1.5"/>`
    );

    parts.push(
      `<line x1="10" y1="${fieldHeight - 10}" x2="${fieldWidth - 10}" y2="${fieldHeight - 10}" stroke="${C.courtLine}" stroke-width="2"/>`
    );
    parts.push(
      `<circle cx="${cx}" cy="${fieldHeight - 10}" r="40" fill="none" stroke="${C.courtLine}" stroke-width="1.5"/>`
    );

    return parts.join('\n');
  },
};
