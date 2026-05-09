import { escapeXml } from './svg-helpers.js';
import type { DiagramLayout } from './diagram.types.js';

const PLAYER_RADIUS = 13;

function resolveFieldCellStyle(sport: DiagramLayout['sport']): string {
  switch (sport) {
    case 'basketball':
      return 'fillColor=#c8933a;strokeColor=#e8d2ad;';
    case 'soccer':
      return 'fillColor=#3f8756;strokeColor=#b7dfc3;';
    case 'baseball':
      return 'fillColor=#4f8f58;strokeColor=#d9c8a9;';
    case 'softball':
      return 'fillColor=#4f8f58;strokeColor=#d9c8a9;';
    case 'football':
    default:
      return 'fillColor=#3d6b4a;strokeColor=#82b366;';
  }
}

export function layoutToMxGraphModel(layout: DiagramLayout): string {
  const { fieldWidth, fieldHeight, losY } = layout;
  const cells: string[] = [
    '<mxCell id="0"/>',
    '<mxCell id="1" parent="0"/>',
    `<mxCell id="field" value="" style="${resolveFieldCellStyle(layout.sport)}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="${fieldWidth}" height="${fieldHeight}" as="geometry"/></mxCell>`,
    `<mxCell id="los" value="LOS" style="text;html=1;align=left;fontSize=10;fontStyle=1;fontColor=#ffffff;" vertex="1" parent="1"><mxGeometry x="4" y="${losY - 18}" width="36" height="14" as="geometry"/></mxCell>`,
  ];

  for (const p of layout.players) {
    const fill = p.team === 'offense' ? '#d2e3fc' : '#fce8e6';
    const stroke = p.team === 'offense' ? '#1a73e8' : '#d93025';
    cells.push(
      `<mxCell id="${escapeXml(p.id)}" value="${escapeXml(p.label)}" style="ellipse;fillColor=${fill};strokeColor=${stroke};fontStyle=1;fontSize=9;" vertex="1" parent="1">` +
        `<mxGeometry x="${p.x - PLAYER_RADIUS}" y="${p.y - PLAYER_RADIUS}" width="${PLAYER_RADIUS * 2}" height="${PLAYER_RADIUS * 2}" as="geometry"/>` +
        '</mxCell>'
    );
  }

  layout.routes.forEach((route, idx) => {
    if (route.points.length < 2) return;
    const last = route.points[route.points.length - 1];
    const midPoints = route.points
      .slice(1, -1)
      .map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`)
      .join('');

    cells.push(
      `<mxCell id="r${idx}" value="${escapeXml(route.label ?? '')}" style="edgeStyle=elbowEdgeStyle;curved=1;exitX=0.5;exitY=0;exitPerimeter=0;endArrow=block;endFill=1;strokeColor=#1967d2;" edge="1" parent="1" source="${escapeXml(route.from)}">` +
        '<mxGeometry relative="1" as="geometry">' +
        `<mxPoint x="${last[0]}" y="${last[1]}" as="targetPoint"/>` +
        `<Array as="points">${midPoints}</Array>` +
        '</mxGeometry>' +
        '</mxCell>'
    );
  });

  return (
    '<mxfile><diagram>' +
    `<mxGraphModel dx="${fieldWidth}" dy="${fieldHeight}" grid="0" page="0" pageWidth="${fieldWidth}" pageHeight="${fieldHeight}">` +
    `<root>${cells.join('')}</root>` +
    '</mxGraphModel></diagram></mxfile>'
  );
}
