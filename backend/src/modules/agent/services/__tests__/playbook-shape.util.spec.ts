import { describe, expect, it } from 'vitest';

import type { AgentDashboardGoal } from '@nxt1/core';

import {
  getPlaybookTargetItemCount,
  normalizeGeneratedPlaybookItems,
} from '../playbook-shape.util.js';

const activeGoals: AgentDashboardGoal[] = [
  {
    id: 'goal-recruiting',
    text: 'Get athletes recruited',
    category: 'recruiting',
    createdAt: '2026-04-27T00:00:00.000Z',
  },
  {
    id: 'goal-film',
    text: 'Review film',
    category: 'development',
    createdAt: '2026-04-27T00:00:00.000Z',
  },
];

describe('playbook-shape.util', () => {
  it('keeps two weekly tasks plus two items for each active goal', () => {
    const normalized = normalizeGeneratedPlaybookItems(
      [
        {
          id: 'weekly-1',
          title: 'Update roster sheet',
          goal: { id: 'recurring', label: 'Weekly Tasks' },
        },
        {
          id: 'film-1',
          title: 'Review first-half clips',
          goal: { id: 'goal-film', label: 'Review film' },
        },
        {
          id: 'recruiting-1',
          title: 'Send coach outreach batch',
          goal: { id: 'goal-recruiting', label: 'Get athletes recruited' },
        },
        {
          id: 'weekly-2',
          title: 'Check recruiting replies',
          goal: { id: 'recurring', label: 'Weekly Tasks' },
        },
        {
          id: 'film-2',
          title: 'Tag teaching clips',
          goal: { id: 'goal-film', label: 'Review film' },
        },
        {
          id: 'recruiting-2',
          title: 'Update target list',
          goal: { id: 'goal-recruiting', label: 'Get athletes recruited' },
        },
        {
          id: 'overflow',
          title: 'Extra recruiting item',
          goal: { id: 'goal-recruiting', label: 'Get athletes recruited' },
        },
      ],
      activeGoals
    );

    expect(normalized?.map((item) => item.id)).toEqual([
      'weekly-1',
      'weekly-2',
      'recruiting-1',
      'recruiting-2',
      'film-1',
      'film-2',
    ]);
    expect(normalized).toHaveLength(getPlaybookTargetItemCount(activeGoals.length));
  });

  it('returns null when any goal does not have two items', () => {
    const normalized = normalizeGeneratedPlaybookItems(
      [
        {
          id: 'weekly-1',
          title: 'Weekly one',
          goal: { id: 'recurring', label: 'Weekly Tasks' },
        },
        {
          id: 'weekly-2',
          title: 'Weekly two',
          goal: { id: 'recurring', label: 'Weekly Tasks' },
        },
        {
          id: 'recruiting-1',
          title: 'One recruiting item only',
          goal: { id: 'goal-recruiting', label: 'Get athletes recruited' },
        },
        {
          id: 'film-1',
          title: 'Film one',
          goal: { id: 'goal-film', label: 'Review film' },
        },
        {
          id: 'film-2',
          title: 'Film two',
          goal: { id: 'goal-film', label: 'Review film' },
        },
      ],
      activeGoals
    );

    expect(normalized).toBeNull();
  });
});
