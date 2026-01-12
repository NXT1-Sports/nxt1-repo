/**
 * @fileoverview Root Tailwind Base Configuration
 * @module nxt1-monorepo
 *
 * @deprecated Use @nxt1/config/tailwind preset instead.
 *
 * This file is kept for backward compatibility.
 * Apps should use the shared preset:
 *
 * ```js
 * module.exports = {
 *   presets: [require('@nxt1/config/tailwind')],
 *   content: ['./src/** /*.{html,ts}'],
 * }
 * ```
 */

// Re-export the shared preset for backward compatibility
module.exports = require('./packages/config/tailwind/preset');
