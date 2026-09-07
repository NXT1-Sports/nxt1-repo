import { describe, expect, it } from 'vitest';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';
import {
  EditablePptxRendererService,
  type EditablePptxDeckSchema,
} from '../editable-pptx-renderer.service.js';

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function deckSchema(overrides?: Partial<EditablePptxDeckSchema>): EditablePptxDeckSchema {
  return {
    schemaVersion: 'editable-pptx.v1',
    title: 'Staff Briefing',
    aspectRatio: 'widescreen_16_9',
    theme: {
      primaryColor: '#0F766E',
      accentColor: '#F59E0B',
      textColor: '#111827',
    },
    slides: [
      {
        title: 'Week Plan',
        elements: [
          {
            type: 'shape',
            shape: 'roundRect',
            x: 0.35,
            y: 0.35,
            w: 12.55,
            h: 6.8,
            fillColor: '#FFFFFF',
            lineColor: '#D1D5DB',
          },
          {
            type: 'text',
            text: 'Editable PowerPoint Briefing',
            x: 0.7,
            y: 0.65,
            w: 7.2,
            h: 0.45,
            fontSize: 22,
            bold: true,
          },
          {
            type: 'badge',
            label: 'STAFF',
            x: 10.9,
            y: 0.68,
            w: 1.35,
            h: 0.3,
          },
          {
            type: 'divider',
            x: 0.7,
            y: 1.3,
            w: 11.8,
            h: 0.05,
            color: '#0F766E',
          },
          {
            type: 'statCard',
            label: 'Install Blocks',
            value: 4,
            caption: 'Practice-ready segments',
            x: 0.75,
            y: 1.65,
            w: 2.5,
            h: 1.1,
          },
          {
            type: 'table',
            x: 0.75,
            y: 3.05,
            w: 6.1,
            h: 2.4,
            headerRow: true,
            rows: [
              ['Period', 'Focus', 'Owner'],
              ['1', 'Tempo', 'OC'],
              ['2', 'Pressure pickup', 'OL'],
            ],
          },
          {
            type: 'image',
            data: TINY_PNG_DATA_URL,
            altText: 'Chart snapshot',
            x: 7.4,
            y: 1.65,
            w: 2.2,
            h: 1.4,
          },
          {
            type: 'group',
            x: 7.4,
            y: 3.45,
            w: 3.4,
            h: 1.4,
            children: [
              {
                type: 'shape',
                shape: 'rect',
                x: 0,
                y: 0,
                w: 3.2,
                h: 0.7,
                fillColor: '#F3F4F6',
                lineColor: '#D1D5DB',
              },
              {
                type: 'text',
                text: 'Grouped native objects',
                x: 0.14,
                y: 0.2,
                w: 2.6,
                h: 0.24,
                fontSize: 10,
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('EditablePptxRendererService', () => {
  it('renders a valid native editable PPTX deck with required element types', async () => {
    const service = new EditablePptxRendererService();

    const result = await service.render(
      deckSchema({
        slides: [
          {
            ...deckSchema().slides[0],
            notes: 'Open with the weekly install priorities, then move into staff owners.',
          },
        ],
      })
    );

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.subarray(0, 2).toString('utf8')).toBe('PK');
    expect(result.buffer.toString('binary')).toContain('ppt/slides/slide1.xml');
    expect(result.buffer.toString('binary')).toContain('ppt/notesSlides/notesSlide1.xml');
    expect(result.metadata).toEqual({
      schemaVersion: 'editable-pptx.v1',
      slideCount: 1,
      aspectRatio: 'widescreen_16_9',
      warnings: [],
      verified: true,
    });
  });

  it('returns warnings and marks metadata unverified when elements exceed slide bounds', async () => {
    const service = new EditablePptxRendererService();

    const result = await service.render(
      deckSchema({
        aspectRatio: 'standard_4_3',
        slides: [
          {
            elements: [
              {
                type: 'text',
                text: 'Too wide for a 4:3 slide',
                x: 9.4,
                y: 0.5,
                w: 1.2,
                h: 0.4,
              },
            ],
          },
        ],
      })
    );

    expect(result.metadata.verified).toBe(false);
    expect(result.metadata.aspectRatio).toBe('standard_4_3');
    expect(result.metadata.warnings).toEqual([
      'slides[0].elements[0] extends outside 10x7.5in slide bounds.',
    ]);
  });

  it('rejects invalid absolute geometry before writing a deck', async () => {
    const service = new EditablePptxRendererService();

    await expect(
      service.render(
        deckSchema({
          slides: [
            {
              elements: [
                {
                  type: 'text',
                  text: 'Bad box',
                  x: 0,
                  y: 0,
                  w: 0,
                  h: 0.5,
                },
              ],
            },
          ],
        })
      )
    ).rejects.toMatchObject({
      code: 'AGENT_VALIDATION_FAILED',
    } satisfies Partial<AgentEngineError>);
  });
});