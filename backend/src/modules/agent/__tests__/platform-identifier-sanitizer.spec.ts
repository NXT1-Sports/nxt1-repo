import { describe, expect, it } from 'vitest';
import {
  sanitizeAgentOutputText,
  sanitizeAgentPayload,
} from '../utils/platform-identifier-sanitizer.js';

describe('platform identifier sanitizer', () => {
  it('removes sensitive identifier fields from structured payloads', () => {
    const sanitized = sanitizeAgentPayload({
      id: 'user-123',
      userId: 'user-123',
      teamId: 'team-456',
      organizationId: 'org-789',
      route: '/profile/123456',
      unicode: '123456',
      name: 'Jordan Miles',
      nested: {
        postId: 'post-1',
        title: 'Senior Tape',
      },
    });

    expect(sanitized).toEqual({
      name: 'Jordan Miles',
      nested: {
        title: 'Senior Tape',
      },
    });
  });

  it('redacts identifier-like text without leaking [redacted] token', () => {
    const sanitized = sanitizeAgentOutputText(
      'User id user-123 can be viewed at /profile/123456 and team code FBN123.'
    );

    expect(sanitized).not.toContain('user-123');
    expect(sanitized).toContain('/profile/123456');
    expect(sanitized).not.toContain('FBN123');
    // [redacted] token must never appear in user-visible text
    expect(sanitized).not.toContain('[redacted]');
  });

  it('strips compact ID labels entirely from conversational responses', () => {
    const sanitized = sanitizeAgentOutputText(
      'UserID 19oowBH8EfZ6AYrU4fNuRSreonO2, TeamID mC3D9qg5d9amvcO0otvi, OrgID nB8n9iNsm5M5KBxfGUC9'
    );

    expect(sanitized).not.toContain('19oowBH8EfZ6AYrU4fNuRSreonO2');
    expect(sanitized).not.toContain('mC3D9qg5d9amvcO0otvi');
    expect(sanitized).not.toContain('nB8n9iNsm5M5KBxfGUC9');
    // [redacted] token must never appear in user-visible text
    expect(sanitized).not.toContain('[redacted]');
  });

  it('preserves absolute public team and profile URLs', () => {
    const sanitized = sanitizeAgentOutputText(
      'Team URL: http://localhost:4200/team/crown-point-basketball-mens/2P49TB and athlete URL: http://localhost:4200/profile/football/huy-toan-nguyen/469697'
    );

    expect(sanitized).toContain('http://localhost:4200/team/crown-point-basketball-mens/2P49TB');
    expect(sanitized).toContain('http://localhost:4200/profile/football/huy-toan-nguyen/469697');
  });

  it('preserves relative public team and profile paths for streamed chunks', () => {
    const sanitized = sanitizeAgentOutputText(
      'Use /team/crown-point-basketball-mens/2P49TB and /profile/football/huy-toan-nguyen/469697'
    );

    expect(sanitized).toContain('/team/crown-point-basketball-mens/2P49TB');
    expect(sanitized).toContain('/profile/football/huy-toan-nguyen/469697');
  });

  describe('infrastructure term sanitization', () => {
    it('replaces Firebase Storage with cloud storage', () => {
      const sanitized = sanitizeAgentOutputText(
        'The media was staged into Firebase Storage and is now portable for analysis.'
      );
      expect(sanitized).not.toContain('Firebase Storage');
      expect(sanitized).toContain('cloud storage');
    });

    it('replaces Firebase signed URLs with secure media links', () => {
      const sanitized = sanitizeAgentOutputText(
        'Firebase signed URLs are portable and ready for direct video analysis.'
      );
      expect(sanitized).not.toContain('Firebase');
      expect(sanitized).not.toContain('signed URL');
    });

    it('scrubs raw firebasestorage.googleapis.com URLs', () => {
      const sanitized = sanitizeAgentOutputText(
        'Download from https://firebasestorage.googleapis.com/v0/b/bucket/o/file.mp4?alt=media to proceed.'
      );
      expect(sanitized).not.toContain('firebasestorage.googleapis.com');
    });

    it('replaces Apify-specific terms with friendly equivalents', () => {
      const sanitized = sanitizeAgentOutputText(
        'Acquire a downloader-produced MP4 through Apify MP4 acquisition before analysis.'
      );
      expect(sanitized).not.toContain('Apify');
      expect(sanitized).toContain('video format conversion');
    });

    it('replaces auth-gated and auth-backed with platform-secured', () => {
      const sanitized = sanitizeAgentOutputText(
        'This URL is from an auth-gated video host with auth-backed content.'
      );
      expect(sanitized).not.toContain('auth-gated');
      expect(sanitized).not.toContain('auth-backed');
      expect(sanitized).toContain('platform-secured');
    });

    it('replaces HLS and DASH manifest references', () => {
      const sanitized = sanitizeAgentOutputText(
        'Only HLS manifests are available. Convert DASH manifests before analysis.'
      );
      expect(sanitized).not.toContain('HLS manifests');
      expect(sanitized).not.toContain('DASH manifests');
    });

    it('strips .m3u8 and .mpd file extensions from user-visible text', () => {
      const sanitized = sanitizeAgentOutputText(
        'The stream is available at stream.m3u8 and fallback.mpd formats.'
      );
      expect(sanitized).not.toContain('.m3u8');
      expect(sanitized).not.toContain('.mpd');
    });

    it('replaces generic signed URL references', () => {
      const sanitized = sanitizeAgentOutputText(
        'Use this signed URL for downstream processing, or these signed URLs for batch work.'
      );
      expect(sanitized).not.toContain('signed URL');
      expect(sanitized).not.toContain('signed URLs');
    });

    it('preserves platform app names like Hudl and YouTube', () => {
      const sanitized = sanitizeAgentOutputText(
        'Open your Hudl film session and paste a YouTube link for analysis.'
      );
      expect(sanitized).toContain('Hudl');
      expect(sanitized).toContain('YouTube');
    });
  });
});
