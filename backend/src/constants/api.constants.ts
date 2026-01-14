/**
 * @fileoverview API Constants
 * @module @nxt1/backend
 */

export const API_VERSION = 'v1';
export const API_BASE_PATH = '/api';

/**
 * API Environments
 */
export const ENVIRONMENTS = {
  PRODUCTION: 'production',
  STAGING: 'staging',
  DEVELOPMENT: 'development',
} as const;

/**
 * Route prefixes
 */
export const ROUTE_PREFIXES = {
  PROD: `${API_BASE_PATH}/${API_VERSION}`,
  STAGING: `${API_BASE_PATH}/${API_VERSION}/staging`,
} as const;
