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
});
