import { describe, expect, it } from 'vitest';
import { extractMediaAttachmentsFromResultData } from './agent-identity.js';

describe('extractMediaAttachmentsFromResultData', () => {
  it('extracts top-level media URLs', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      imageUrl: 'https://cdn.example.com/card.jpg',
      videoUrl: 'https://cdn.example.com/clip.mp4',
    });

    expect(attachments).toEqual(
      expect.arrayContaining([
        {
          url: 'https://cdn.example.com/card.jpg',
          name: 'image.jpg',
          type: 'image',
        },
        {
          url: 'https://cdn.example.com/clip.mp4',
          name: 'video.mp4',
          type: 'video',
        },
      ])
    );
  });

  it('extracts nested coordinator artifacts when top-level imageUrl is absent', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      dispatch_kind: 'coordinator',
      coordinator_artifacts: {
        imageUrl: 'https://cdn.example.com/generated-welcome.jpg',
      },
    });

    expect(attachments).toEqual([
      {
        url: 'https://cdn.example.com/generated-welcome.jpg',
        name: 'image.jpg',
        type: 'image',
      },
    ]);
  });

  it('extracts media from toolCallRecords output and deduplicates URLs', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      toolCallRecords: [
        {
          toolName: 'delegate_to_coordinator',
          output: {
            coordinator_artifacts: {
              imageUrl: 'https://cdn.example.com/same.jpg',
            },
          },
        },
        {
          toolName: 'generate_graphic',
          output: {
            imageUrl: 'https://cdn.example.com/same.jpg',
            files: [{ url: 'https://cdn.example.com/export.pdf', name: 'report.pdf' }],
          },
        },
      ],
      coordinatorArtifacts: {
        imageUrl: 'https://cdn.example.com/same.jpg',
      },
    });

    expect(attachments).toEqual(
      expect.arrayContaining([
        {
          url: 'https://cdn.example.com/same.jpg',
          name: 'image.jpg',
          type: 'image',
        },
        {
          url: 'https://cdn.example.com/export.pdf',
          name: 'report.pdf',
          type: 'doc',
        },
      ])
    );
    expect(
      attachments.filter((item) => item.url === 'https://cdn.example.com/same.jpg')
    ).toHaveLength(1);
  });

  it('extracts nested diagram URLs from coordinator artifacts payloads', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      coordinatorArtifacts: {
        plays: [
          {
            name: 'Seam Levels',
            diagramUrl: 'https://cdn.example.com/diagram-1.png',
          },
          {
            name: 'Flood 3 Levels',
            diagramUrl: 'https://cdn.example.com/diagram-2.png',
          },
        ],
      },
    });

    expect(attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://cdn.example.com/diagram-1.png',
          type: 'image',
        }),
        expect.objectContaining({
          url: 'https://cdn.example.com/diagram-2.png',
          type: 'image',
        }),
      ])
    );
  });

  it('extracts mediaArtifact and attachments arrays from nested tool outputs', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      toolCallRecords: [
        {
          toolName: 'create_play_diagram',
          status: 'success',
          output: {
            mediaArtifact: {
              url: 'https://cdn.example.com/play-diagram.png',
              type: 'image',
              mimeType: 'image/png',
              name: 'play-diagram.png',
            },
            attachments: [
              {
                url: 'https://cdn.example.com/play-diagram.png',
                type: 'image',
                mimeType: 'image/png',
                name: 'play-diagram.png',
              },
            ],
          },
        },
      ],
    });

    expect(attachments).toEqual([
      expect.objectContaining({
        url: 'https://cdn.example.com/play-diagram.png',
        type: 'image',
      }),
    ]);
  });

  it('pairs ffmpeg thumbnail output with the latest video and suppresses standalone thumbnail image', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      videoUrl: 'https://cdn.example.com/final-reel.mp4',
      toolCallRecords: [
        {
          toolName: 'ffmpeg_merge_videos',
          status: 'success',
          output: {
            videoUrl: 'https://cdn.example.com/final-reel.mp4',
          },
        },
        {
          toolName: 'ffmpeg_generate_thumbnail',
          status: 'success',
          output: {
            imageUrl: 'https://cdn.example.com/final-reel-thumb.jpg',
            thumbnailUrl: 'https://cdn.example.com/final-reel-thumb.jpg',
          },
        },
      ],
    });

    expect(attachments).toEqual([
      {
        url: 'https://cdn.example.com/final-reel.mp4',
        name: 'video.mp4',
        type: 'video',
        thumbnailUrl: 'https://cdn.example.com/final-reel-thumb.jpg',
      },
    ]);
  });

  it('keeps trim-video thumbnailUrl on the generated video attachment', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      toolCallRecords: [
        {
          toolName: 'ffmpeg_trim_video',
          status: 'success',
          output: {
            outputUrl: 'https://cdn.example.com/clips/clip-1.mp4',
            thumbnailUrl: 'https://cdn.example.com/clips/clip-1-thumb.jpg',
          },
        },
      ],
    });

    expect(attachments).toEqual([
      {
        url: 'https://cdn.example.com/clips/clip-1.mp4',
        name: 'video.mp4',
        type: 'video',
        thumbnailUrl: 'https://cdn.example.com/clips/clip-1-thumb.jpg',
      },
    ]);
  });

  it('pairs record-level thumbnailUrl with a single videoUrls output', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      toolCallRecords: [
        {
          toolName: 'stage_media',
          status: 'success',
          output: {
            videoUrls: ['https://cdn.example.com/staged/clip.mp4'],
            thumbnailUrl: 'https://cdn.example.com/staged/clip-thumb.jpg',
          },
        },
      ],
    });

    expect(attachments).toEqual([
      {
        url: 'https://cdn.example.com/staged/clip.mp4',
        name: 'video-0.mp4',
        type: 'video',
        thumbnailUrl: 'https://cdn.example.com/staged/clip-thumb.jpg',
      },
    ]);
  });

  it('pairs record-level thumbnailUrl with a single video inside mediaUrls', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      mediaUrls: [
        'https://cdn.example.com/generated/poster.jpg',
        'https://cdn.example.com/generated/reel.mp4',
      ],
      thumbnailUrl: 'https://cdn.example.com/generated/reel-thumb.jpg',
    });

    expect(attachments).toEqual([
      {
        url: 'https://cdn.example.com/generated/poster.jpg',
        name: 'image-0.jpg',
        type: 'image',
      },
      {
        url: 'https://cdn.example.com/generated/reel.mp4',
        name: 'video-1.mp4',
        type: 'video',
        thumbnailUrl: 'https://cdn.example.com/generated/reel-thumb.jpg',
      },
    ]);
  });

  it('pairs record-level thumbnailUrl with a single video file attachment', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      files: [
        {
          url: 'https://cdn.example.com/generated/reel.mp4',
          name: 'Final Reel',
          mimeType: 'video/mp4',
          type: 'video',
        },
      ],
      thumbnailUrl: 'https://cdn.example.com/generated/reel-thumb.jpg',
    });

    expect(attachments).toEqual([
      {
        url: 'https://cdn.example.com/generated/reel.mp4',
        name: 'Final Reel',
        type: 'video',
        mimeType: 'video/mp4',
        thumbnailUrl: 'https://cdn.example.com/generated/reel-thumb.jpg',
      },
    ]);
  });

  it('pairs record-level thumbnailUrl with a single video mediaArtifact', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      mediaArtifact: {
        url: 'https://cdn.example.com/generated/reel.mp4',
        name: 'Final Reel',
        mimeType: 'video/mp4',
        type: 'video',
      },
      thumbnailUrl: 'https://cdn.example.com/generated/reel-thumb.jpg',
    });

    expect(attachments).toEqual([
      {
        url: 'https://cdn.example.com/generated/reel.mp4',
        name: 'Final Reel',
        type: 'video',
        mimeType: 'video/mp4',
        thumbnailUrl: 'https://cdn.example.com/generated/reel-thumb.jpg',
      },
    ]);
  });

  it('does not expose raw or staged videos when an ffmpeg merge workflow fails', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      videoUrl: 'https://video.twimg.com/ext_tw_video/source.mp4',
      coordinator_artifacts: {
        imageUrl:
          'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/intro.jpg?alt=media',
      },
      toolCallRecords: [
        {
          toolName: 'ffmpeg_trim_video',
          status: 'success',
          output: {
            outputUrl:
              'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/source-trim.mp4?alt=media',
          },
        },
        {
          toolName: 'ffmpeg_merge_videos',
          status: 'failed',
          output: {
            error: 'Circuit breaker OPEN',
          },
        },
      ],
    });

    expect(attachments).toEqual([]);
  });

  it('keeps only the successful final merge video and paired thumbnail for ffmpeg merge workflows', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      videoUrl: 'https://video.twimg.com/ext_tw_video/source.mp4',
      imageUrl: 'https://cdn.example.com/title-card.jpg',
      toolCallRecords: [
        {
          toolName: 'ffmpeg_trim_video',
          status: 'success',
          output: {
            outputUrl: 'https://cdn.example.com/source-trim.mp4',
          },
        },
        {
          toolName: 'ffmpeg_merge_videos',
          status: 'success',
          output: {
            outputUrl: 'https://cdn.example.com/final-reel.mp4',
          },
        },
        {
          toolName: 'ffmpeg_generate_thumbnail',
          status: 'success',
          output: {
            outputUrl: 'https://cdn.example.com/final-reel-thumb.jpg',
          },
        },
      ],
    });

    expect(attachments).toEqual([
      {
        url: 'https://cdn.example.com/final-reel.mp4',
        name: 'video.mp4',
        type: 'video',
        thumbnailUrl: 'https://cdn.example.com/final-reel-thumb.jpg',
      },
    ]);
  });

  it('uses the generated intro card as the final merged video thumbnail', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      coordinatorArtifacts: {
        imageUrl: 'https://cdn.example.com/intro-card.jpg',
      },
      toolCallRecords: [
        {
          toolName: 'ffmpeg_merge_videos',
          status: 'success',
          output: {
            videoUrl: 'https://cdn.example.com/final-reel.mp4',
          },
        },
        {
          toolName: 'ffmpeg_generate_thumbnail',
          status: 'success',
          output: {
            thumbnailUrl: 'https://cdn.example.com/frame-grab.jpg',
          },
        },
      ],
    });

    expect(attachments).toEqual([
      {
        url: 'https://cdn.example.com/final-reel.mp4',
        name: 'video.mp4',
        type: 'video',
        thumbnailUrl: 'https://cdn.example.com/intro-card.jpg',
      },
    ]);
  });

  it('maps routed videoAttachments and still hoists the intro poster', () => {
    const attachments = extractMediaAttachmentsFromResultData({
      imageUrl: 'https://cdn.example.com/intro-card.jpg',
      videoAttachments: [
        {
          url: 'https://cdn.example.com/final-reel.mp4',
          name: 'Final Highlight Reel',
          mimeType: 'video/mp4',
          type: 'video',
        },
      ],
      toolCallRecords: [
        {
          toolName: 'ffmpeg_merge_videos',
          status: 'success',
          output: {
            outputUrl: 'https://cdn.example.com/final-reel.mp4',
          },
        },
      ],
    });

    expect(attachments).toEqual([
      {
        url: 'https://cdn.example.com/final-reel.mp4',
        name: 'Final Highlight Reel',
        type: 'video',
        mimeType: 'video/mp4',
        thumbnailUrl: 'https://cdn.example.com/intro-card.jpg',
      },
    ]);
  });
});
