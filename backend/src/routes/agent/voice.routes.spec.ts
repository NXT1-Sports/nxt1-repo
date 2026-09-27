import { describe, it } from 'vitest';
import voiceRoutes from './voice.routes.js';
import { expectExpressRouter } from '../__tests__/route-test.utils.js';

describe('agent voice routes', () => {
  it('registers the voice transcription endpoint', () => {
    expectExpressRouter(voiceRoutes, [{ method: 'post', path: '/voice/transcribe' }]);
  });
});
