import { describe, expect, it } from 'vitest';

import { USER_ROLES } from '@nxt1/core';

import { buildInviteBrowserShareData, resolveEffectiveInviteType } from './invite-shell.component';

describe('buildInviteBrowserShareData', () => {
  it('folds the invite message and url into a single text body for desktop share targets', () => {
    expect(
      buildInviteBrowserShareData({
        title: 'Invite Team',
        text: 'Join my team on NXT1.',
        url: 'https://nxt1sports.com/join/ABC123',
      })
    ).toEqual({
      title: 'Invite Team',
      text: 'Join my team on NXT1.\n\nhttps://nxt1sports.com/join/ABC123',
    });
  });

  it('keeps working when only a url is available', () => {
    expect(
      buildInviteBrowserShareData({
        title: 'Invite Team',
        url: 'https://nxt1sports.com/join/ABC123',
      })
    ).toEqual({
      title: 'Invite Team',
      text: 'https://nxt1sports.com/join/ABC123',
    });
  });
});

describe('resolveEffectiveInviteType', () => {
  it('forces athlete users onto the general invite path even with team context', () => {
    expect(resolveEffectiveInviteType('team', true, USER_ROLES.ATHLETE)).toBe('general');
  });

  it('falls back to general when a team invite has no concrete team', () => {
    expect(resolveEffectiveInviteType('team', false, USER_ROLES.COACH)).toBe('general');
  });

  it('keeps team invites for non-athlete users with team context', () => {
    expect(resolveEffectiveInviteType('team', true, USER_ROLES.COACH)).toBe('team');
  });
});
