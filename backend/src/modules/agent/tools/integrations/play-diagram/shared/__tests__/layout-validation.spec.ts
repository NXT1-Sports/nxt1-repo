import { describe, expect, it } from 'vitest';

import { evaluateLayoutQualityForSport } from '../layout-validation.js';
import type { DiagramLayout } from '../diagram.types.js';

function baseFootballLayout(): DiagramLayout {
  return {
    sport: 'football',
    title: 'Test',
    fieldWidth: 600,
    fieldHeight: 440,
    losY: 300,
    players: [
      { id: 'LT', label: 'LT', x: 210, y: 300, team: 'offense', shape: 'square' },
      { id: 'LG', label: 'LG', x: 245, y: 300, team: 'offense', shape: 'square' },
      { id: 'C', label: 'C', x: 280, y: 300, team: 'offense', shape: 'square' },
      { id: 'RG', label: 'RG', x: 315, y: 300, team: 'offense', shape: 'square' },
      { id: 'RT', label: 'RT', x: 350, y: 300, team: 'offense', shape: 'square' },
      { id: 'QB', label: 'QB', x: 280, y: 332, team: 'offense', shape: 'circle' },
      { id: 'X', label: 'X', x: 70, y: 295, team: 'offense', shape: 'circle' },
      { id: 'Z', label: 'Z', x: 530, y: 295, team: 'offense', shape: 'circle' },
      { id: 'DE1', label: 'DE', x: 220, y: 295, team: 'defense', shape: 'square' },
      { id: 'DE2', label: 'DE', x: 360, y: 295, team: 'defense', shape: 'square' },
      { id: 'MLB', label: 'MLB', x: 280, y: 265, team: 'defense', shape: 'circle' },
    ],
    routes: [
      { from: 'X', label: 'Post', type: 'cut', points: [[70, 295], [70, 170], [160, 120]] },
      { from: 'Z', label: 'Corner', type: 'cut', points: [[530, 295], [530, 175], [560, 120]] },
      { from: 'DE1', label: 'Gap Rush', type: 'go', points: [[220, 295], [220, 322]] },
    ],
    zones: [],
  };
}

describe('evaluateLayoutQualityForSport', () => {
  it('flags critical when route source player does not exist', () => {
    const layout = baseFootballLayout();
    layout.routes = [
      ...layout.routes,
      { from: 'UNKNOWN', label: 'Ghost', type: 'go', points: [[10, 10], [20, 20]] },
    ];

    const report = evaluateLayoutQualityForSport(layout, 'Cover 3');

    expect(report.hasCritical).toBe(true);
    expect(report.findings.some((item) => item.code === 'diagram/routes/missing-source-player')).toBe(
      true
    );
  });

  it('flags critical when football rush points away from LOS', () => {
    const layout = baseFootballLayout();
    layout.routes = [
      ...layout.routes,
      { from: 'MLB', label: 'Blitz', type: 'go', points: [[280, 265], [280, 210]] },
    ];

    const report = evaluateLayoutQualityForSport(layout, 'blitz package');

    expect(report.hasCritical).toBe(true);
    expect(report.findings.some((item) => item.code === 'football/rush/wrong-direction')).toBe(true);
  });

  it('flags major for shallow intermediate routes', () => {
    const layout = baseFootballLayout();
    layout.routes = [
      { from: 'X', label: 'Dig', type: 'cut', points: [[70, 295], [70, 274], [120, 274]] },
    ];

    const report = evaluateLayoutQualityForSport(layout, 'dig concept');

    expect(report.hasCritical).toBe(false);
    expect(report.hasMajor).toBe(true);
    expect(
      report.findings.some((item) => item.code === 'football/route/depth-too-shallow-intermediate')
    ).toBe(true);
  });

  it('flags minor for missing route labels', () => {
    const layout = baseFootballLayout();
    layout.routes = [{ from: 'X', type: 'go', points: [[70, 295], [70, 150]] }];

    const report = evaluateLayoutQualityForSport(layout, 'vert concept');

    expect(report.hasCritical).toBe(false);
    expect(report.findings.some((item) => item.code === 'diagram/route/missing-label')).toBe(true);
  });

  it('flags critical for football position not in hardlist', () => {
    const layout = baseFootballLayout();
    layout.players = [
      ...layout.players,
      { id: 'COACH', label: 'Coach', x: 100, y: 100, team: 'offense', shape: 'circle' },
    ];

    const report = evaluateLayoutQualityForSport(layout, 'test');

    expect(report.hasCritical).toBe(true);
    expect(report.findings.some((item) => item.code === 'diagram/players/invalid-position')).toBe(
      true
    );
  });

  it('accepts slot aliases under football hardlist', () => {
    const layout = baseFootballLayout();
    layout.players = [
      ...layout.players,
      { id: 'SL1', label: 'SL', x: 150, y: 295, team: 'offense', shape: 'circle' },
    ];

    const report = evaluateLayoutQualityForSport(layout, 'slot concept');

    expect(report.findings.some((item) => item.code === 'diagram/players/invalid-position')).toBe(
      false
    );
  });

  it('flags major when blocking concepts are missing OL block assignments', () => {
    const layout = baseFootballLayout();

    const report = evaluateLayoutQualityForSport(layout, 'inside zone run blocking scheme');

    expect(report.hasMajor).toBe(true);
    expect(
      report.findings.some((item) => item.code === 'football/blocking/missing-ol-assignments')
    ).toBe(true);
  });

  it('passes OL assignment check when all blockers have block routes', () => {
    const layout = baseFootballLayout();
    layout.routes = [
      ...layout.routes,
      { from: 'LT', label: 'LT: Reach', type: 'block', points: [[210, 300], [198, 282]] },
      { from: 'LG', label: 'LG: Combo', type: 'block', points: [[245, 300], [236, 282]] },
      { from: 'C', label: 'C: Drive', type: 'block', points: [[280, 300], [280, 282]] },
      { from: 'RG', label: 'RG: Combo', type: 'block', points: [[315, 300], [324, 282]] },
      { from: 'RT', label: 'RT: Reach', type: 'block', points: [[350, 300], [362, 282]] },
    ];

    const report = evaluateLayoutQualityForSport(layout, 'inside zone run blocking scheme');

    expect(
      report.findings.some((item) => item.code === 'football/blocking/missing-ol-assignments')
    ).toBe(false);
  });
});
