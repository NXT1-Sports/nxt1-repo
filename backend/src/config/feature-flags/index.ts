/**
 * @fileoverview Backend Feature Flags Module Barrel Export
 * @module @nxt1/backend/config/feature-flags
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

export {
  FeatureFlagsService,
  type FlagsCacheStats,
  getFeatureFlagsService,
  getFeatureFlagValueSync,
  isFeatureEnabledSync,
  resetFeatureFlagsService,
} from './feature-flags.service.js';
