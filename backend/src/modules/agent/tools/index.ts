/**
 * @fileoverview Tool System — Barrel Export
 * @module @nxt1/backend/modules/agent/tools
 */

export { BaseTool, type ToolResult } from './base.tool.js';
export { ToolRegistry } from './tool-registry.js';

// Category re-exports (tools will be added as they are implemented)
// export { ... } from './database/index.js';
// export { ... } from './media/index.js';
// export { ... } from './comms/index.js';
