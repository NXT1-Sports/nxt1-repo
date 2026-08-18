import { describe, expect, it } from 'vitest';
import { createFilmReviewDrawing } from '../film-review-annotation-sidecar.service.js';

function hasNestedArray(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => Array.isArray(entry) || hasNestedArray(entry));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(hasNestedArray);
  }
  return false;
}

describe('film review annotation sidecar', () => {
  it('writes flat freehand geometry only to the UniversalFiles annotation child document', async () => {
    const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
    const db = {
      collection(collectionName: string) {
        return {
          doc(fileId: string) {
            return {
              collection(subcollectionName: string) {
                return {
                  doc(drawingId: string) {
                    return {
                      set: async (data: Record<string, unknown>) => {
                        writes.push({
                          path: `${collectionName}/${fileId}/${subcollectionName}/${drawingId}`,
                          data,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    await createFilmReviewDrawing({
      db: db as never,
      fileId: 'review-1',
      drawingId: 'drawing-1',
      userId: 'coach-1',
      now: '2026-08-17T00:00:00.000Z',
      request: {
        playId: 'play-1',
        kind: 'freehand',
        bounds: { minX: 0.1, minY: 0.2, maxX: 0.6, maxY: 0.7 },
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.3, y: 0.4 },
          { x: 0.6, y: 0.7 },
        ],
        strokeStartIndexes: [0, 2],
      },
    });

    expect(writes).toEqual([
      expect.objectContaining({
        path: 'UniversalFiles/review-1/filmReviewAnnotations/drawing-1',
        data: expect.objectContaining({
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.3, y: 0.4 },
            { x: 0.6, y: 0.7 },
          ],
          strokeStartIndexes: [0, 2],
        }),
      }),
    ]);
    expect(hasNestedArray(writes[0]?.data)).toBe(false);
    expect(writes[0]?.data['strokes']).toBeUndefined();
  });
});
