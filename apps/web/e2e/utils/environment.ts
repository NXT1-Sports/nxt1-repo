/**
 * @fileoverview Environment Configuration
 * @module @nxt1/web/e2e/utils
 *
 * Environment-specific configuration for E2E tests.
 * Supports local, staging, and production environments.
 */

/**
 * Environment configuration interface
 */
export interface EnvironmentConfig {
  /** Environment name */
  name: string;
  /** Base URL for the web application */
  baseUrl: string;
  /** API base URL */
  apiUrl: string;
  /** Firebase project ID */
  firebaseProjectId: string;
  /** Whether this is a production environment */
  isProduction: boolean;
  /** Default timeout for operations */
  defaultTimeout: number;
  /** Test user credentials */
  testUser: {
    email: string;
    password: string;
  };
}

/**
 * Environment definitions
 */
const environments: Record<string, EnvironmentConfig> = {
  local: {
    name: 'local',
    baseUrl: 'http://localhost:4200',
    apiUrl: 'http://localhost:3001',
    firebaseProjectId: 'nxt-1-de054',
    isProduction: false,
    defaultTimeout: 30_000,
    testUser: {
      email: process.env.E2E_TEST_USER_EMAIL || 'e2e-test@example.com',
      password: process.env.E2E_TEST_USER_PASSWORD || 'TestPassword123!',
    },
  },
  staging: {
    name: 'staging',
    baseUrl: 'https://staging.nxt1.com',
    apiUrl: 'https://api-staging.nxt1.com',
    firebaseProjectId: 'nxt-1-staging',
    isProduction: false,
    defaultTimeout: 45_000,
    testUser: {
      email: process.env.E2E_TEST_USER_EMAIL || 'e2e-test-staging@example.com',
      password: process.env.E2E_TEST_USER_PASSWORD || 'TestPassword123!',
    },
  },
  production: {
    name: 'production',
    baseUrl: 'https://www.nxt1.com',
    apiUrl: 'https://api.nxt1.com',
    firebaseProjectId: 'nxt-1-de054',
    isProduction: true,
    defaultTimeout: 60_000,
    testUser: {
      // Production tests should use dedicated test accounts
      email: process.env.E2E_TEST_USER_EMAIL || '',
      password: process.env.E2E_TEST_USER_PASSWORD || '',
    },
  },
};

/**
 * Get current environment name from E2E_ENV or NODE_ENV
 */
function getCurrentEnvironmentName(): string {
  return process.env.E2E_ENV || process.env.NODE_ENV || 'local';
}

/**
 * Get environment configuration
 * Falls back to local if environment not found
 */
export function getEnvironment(envName?: string): EnvironmentConfig {
  const name = envName || getCurrentEnvironmentName();
  return environments[name] || environments.local;
}

/**
 * Current environment configuration
 */
export const env = getEnvironment();

/**
 * Check if running in CI environment
 */
export const isCI = Boolean(process.env.CI);

/**
 * Check if visual regression testing is enabled
 */
export const enableVisualRegression = process.env.E2E_VISUAL_REGRESSION === 'true';

/**
 * Slow motion delay for debugging
 */
export const slowMo = parseInt(process.env.E2E_SLOW_MO || '0', 10);
