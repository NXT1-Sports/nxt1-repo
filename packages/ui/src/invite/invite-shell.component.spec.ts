import { describe, expect, it } from 'vitest';

import { buildInviteBrowserShareData } from './invite-shell.component';

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
