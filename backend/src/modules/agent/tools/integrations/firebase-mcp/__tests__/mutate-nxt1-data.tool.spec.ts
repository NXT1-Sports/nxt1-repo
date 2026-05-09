/**
 * @fileoverview Unit tests for MutateNxt1DataTool
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MutateNxt1DataTool } from '../mutate-nxt1-data.tool.js';
import type { ToolExecutionContext } from '../../../base.tool.js';
import type { FirebaseMcpBridgeService } from '../firebase-mcp-bridge.service.js';

function makeBridge(overrides?: Partial<FirebaseMcpBridgeService>): FirebaseMcpBridgeService {
  return {
    mutate: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    query: vi.fn(),
    listViews: vi.fn(),
    ...overrides,
  } as unknown as FirebaseMcpBridgeService;
}

function makeContext(userId = 'user-123'): ToolExecutionContext {
  return { userId, emitStage: vi.fn() };
}

describe('MutateNxt1DataTool', () => {
  let bridge: FirebaseMcpBridgeService;
  let tool: MutateNxt1DataTool;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = makeBridge();
    tool = new MutateNxt1DataTool(bridge);
  });

  // ── Metadata ─────────────────────────────────────────────────────────────

  it('has correct tool name', () => {
    expect(tool.name).toBe('mutate_nxt1_data');
  });

  it('is restricted to data_coordinator', () => {
    expect(tool.allowedAgents).toEqual(['data_coordinator']);
  });

  it('is marked as a mutation', () => {
    expect(tool.isMutation).toBe(true);
  });

  // ── Auth guard ───────────────────────────────────────────────────────────

  it('rejects when no userId in context', async () => {
    const result = await tool.execute(
      { operation: 'delete', collection: 'Awards', documentId: 'doc-1' },
      {} as ToolExecutionContext
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/authenticated/i);
  });

  it('rejects when context is undefined', async () => {
    const result = await tool.execute(
      { operation: 'delete', collection: 'Awards', documentId: 'doc-1' },
      undefined
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/authenticated/i);
  });

  // ── Schema validation ────────────────────────────────────────────────────

  it('rejects missing operation', async () => {
    const result = await tool.execute({ collection: 'Awards', documentId: 'doc-1' }, makeContext());
    expect(result.success).toBe(false);
    expect(bridge.mutate).not.toHaveBeenCalled();
  });

  it('rejects invalid operation value', async () => {
    const result = await tool.execute(
      { operation: 'upsert', collection: 'Awards', documentId: 'doc-1' },
      makeContext()
    );
    expect(result.success).toBe(false);
    expect(bridge.mutate).not.toHaveBeenCalled();
  });

  it('rejects empty collection', async () => {
    const result = await tool.execute(
      { operation: 'delete', collection: '', documentId: 'doc-1' },
      makeContext()
    );
    expect(result.success).toBe(false);
    expect(bridge.mutate).not.toHaveBeenCalled();
  });

  it('rejects empty documentId', async () => {
    const result = await tool.execute(
      { operation: 'delete', collection: 'Awards', documentId: '' },
      makeContext()
    );
    expect(result.success).toBe(false);
    expect(bridge.mutate).not.toHaveBeenCalled();
  });

  // ── Successful delete ────────────────────────────────────────────────────

  it('delegates delete to bridge and returns success', async () => {
    vi.mocked(bridge.mutate).mockResolvedValue({ success: true, message: 'Deleted.' });

    const result = await tool.execute(
      { operation: 'delete', collection: 'Awards', documentId: 'award-abc' },
      makeContext()
    );

    expect(bridge.mutate).toHaveBeenCalledWith(
      { operation: 'delete', collection: 'Awards', documentId: 'award-abc', patch: undefined },
      expect.objectContaining({ userId: 'user-123' })
    );
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['operation']).toBe('delete');
    expect((result.data as Record<string, unknown>)['collection']).toBe('Awards');
    expect((result.data as Record<string, unknown>)['documentId']).toBe('award-abc');
  });

  // ── Successful update ────────────────────────────────────────────────────

  it('delegates update with patch to bridge', async () => {
    const patch = { title: 'State Champion', year: 2026 };
    vi.mocked(bridge.mutate).mockResolvedValue({ success: true, message: 'Updated.' });

    const result = await tool.execute(
      { operation: 'update', collection: 'Awards', documentId: 'award-xyz', patch },
      makeContext('coach-456')
    );

    expect(bridge.mutate).toHaveBeenCalledWith(
      { operation: 'update', collection: 'Awards', documentId: 'award-xyz', patch },
      expect.objectContaining({ userId: 'coach-456' })
    );
    expect(result.success).toBe(true);
  });

  it('accepts organization branding updates', async () => {
    const patch = { mascot: 'Ravens' };
    vi.mocked(bridge.mutate).mockResolvedValue({ success: true, message: 'Updated.' });

    const result = await tool.execute(
      { operation: 'update', collection: 'Organizations', documentId: 'org-123', patch },
      makeContext('director-789')
    );

    expect(bridge.mutate).toHaveBeenCalledWith(
      { operation: 'update', collection: 'Organizations', documentId: 'org-123', patch },
      expect.objectContaining({ userId: 'director-789' })
    );
    expect(result.success).toBe(true);
  });

  // ── Bridge error propagation ─────────────────────────────────────────────

  it('returns error when bridge returns success: false', async () => {
    vi.mocked(bridge.mutate).mockResolvedValue({
      success: false,
      message: 'Forbidden: you do not have permission to manage this document.',
    });

    const result = await tool.execute(
      { operation: 'delete', collection: 'Rankings', documentId: 'rank-1' },
      makeContext()
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/forbidden/i);
  });

  it('returns error when bridge throws', async () => {
    vi.mocked(bridge.mutate).mockRejectedValue(new Error('MCP subprocess crashed'));

    const result = await tool.execute(
      { operation: 'delete', collection: 'Rankings', documentId: 'rank-1' },
      makeContext()
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/mcp subprocess crashed/i);
  });

  it('returns generic error when bridge throws non-Error', async () => {
    vi.mocked(bridge.mutate).mockRejectedValue('unexpected string error');

    const result = await tool.execute(
      { operation: 'delete', collection: 'Intel', documentId: 'intel-1' },
      makeContext()
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Mutation failed.');
  });

  // ── emitStage propagation ────────────────────────────────────────────────

  it('passes full context including emitStage to bridge', async () => {
    const ctx = makeContext();
    await tool.execute({ operation: 'delete', collection: 'Awards', documentId: 'doc-1' }, ctx);
    expect(bridge.mutate).toHaveBeenCalledWith(expect.anything(), ctx);
  });
});
