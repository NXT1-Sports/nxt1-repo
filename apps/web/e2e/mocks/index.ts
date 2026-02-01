/**
 * @fileoverview MSW Mocks Barrel Export
 * @module @nxt1/web/e2e/mocks
 *
 * Central export for all MSW mock utilities.
 */

// Server utilities
export {
  server,
  startMockServer,
  stopMockServer,
  resetMockHandlers,
  useMockHandler,
  mockErrors,
} from './server';

// Handlers
export { handlers, errorHandlers } from './handlers';

// Mock data
export { MOCK_USER, MOCK_PROFILE, MOCK_TEAMS, MOCK_POSTS, MOCK_NOTIFICATIONS } from './handlers';
