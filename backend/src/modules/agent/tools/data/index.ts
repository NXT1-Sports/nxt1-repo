/**
 * @fileoverview Data Tools
 * @module @nxt1/backend/modules/agent/tools/data
 *
 * Tools for generating and exporting structured data as downloadable documents.
 *
 * Current tools:
 * - DynamicExportTool — Unconstrained PDF/CSV generation from any structured data ✅
 *
 * Planned tools:
 * - QueryExportTool   — Large-dataset export via direct DB query (bypasses LLM rows)
 * - TemplateExportTool — Pre-designed branded report templates (scout reports, etc.)
 */

export { DynamicExportTool } from './dynamic-export.tool.js';
