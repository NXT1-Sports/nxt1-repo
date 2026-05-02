import { describe, expect, it } from 'vitest';

import { buildVideoWorkflowArtifact } from '../media-workflow.js';

describe('buildVideoWorkflowArtifact', () => {
  it('routes Hudl direct MP4 URLs through Apify even without auth headers', () => {
    const hudlUrl =
      'https://vc.hudl.com/2467/18832/85c/68b32e1bdf4791d91803b85c/68b35bab5a059fc8dfa45c39/Clip_0_1080_3000.mp4?v=4F24106C02E8DD08';

    const artifact = buildVideoWorkflowArtifact({
      sourceUrl: hudlUrl,
      playableUrls: [hudlUrl],
      directMp4Urls: [hudlUrl],
      recommendedHeaders: {},
      sourceTypeHint: 'public_direct',
    });

    expect(artifact.recommendedNextAction).toBe('call_apify_actor');
    expect(artifact.analysisReady).toBe(false);
    expect(artifact.sourceType).toBe('protected_direct');
    expect(artifact.portableUrl).toBeNull();
  });

  it('keeps non-gated direct MP4 URLs as analysis-ready', () => {
    const directUrl = 'https://cdn.example.com/video/clip.mp4';

    const artifact = buildVideoWorkflowArtifact({
      sourceUrl: directUrl,
      playableUrls: [directUrl],
      directMp4Urls: [directUrl],
      recommendedHeaders: {},
      sourceTypeHint: 'public_direct',
    });

    expect(artifact.recommendedNextAction).toBe('analyze_video');
    expect(artifact.analysisReady).toBe(true);
    expect(artifact.sourceType).toBe('public_direct');
    expect(artifact.portableUrl).toBe(directUrl);
  });
});
