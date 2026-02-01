/**
 * @fileoverview Fixtures Barrel Export
 * @module @nxt1/web/e2e/fixtures
 *
 * Central export for all test fixtures.
 */

export {
  test,
  expect,
  type TestFixtures,
  type WorkerFixtures,
  type TestUser,
} from './test.fixture';

// MSW (Mock Service Worker) fixtures for API mocking
export { testWithMSW, testWithMSWWorker, type MSWFixture } from './msw.fixture';
