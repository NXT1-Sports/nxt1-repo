import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutePythonCodeTool } from '../execute-python-code.tool.js';
import type { ToolExecutionContext } from '../../base.tool.js';
import { ToolRegistry } from '../../tool-registry.js';

function createSandbox(overrides: Partial<ReturnType<typeof createSandboxDefaults>> = {}) {
  return { ...createSandboxDefaults(), ...overrides };
}

function createSandboxDefaults() {
  return {
    files: {
      makeDir: vi.fn().mockResolvedValue(true),
      write: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue([]),
      read: vi.fn().mockResolvedValue(new Uint8Array()),
    },
    runCode: vi.fn().mockResolvedValue({ logs: { stdout: ['ok'], stderr: [] } }),
    kill: vi.fn().mockResolvedValue(true),
  };
}

describe('ExecutePythonCodeTool', () => {
  const fileSave = vi.fn();
  const fileExists = vi.fn();
  const bucketFile = vi.fn();
  const bucket = vi.fn();
  const emitStage = vi.fn();
  let context: ToolExecutionContext;

  beforeEach(() => {
    fileSave.mockReset();
    fileExists.mockReset();
    bucketFile.mockReset();
    bucket.mockReset();
    emitStage.mockReset();

    fileSave.mockResolvedValue(undefined);
    fileExists.mockResolvedValue([true]);
    bucketFile.mockReturnValue({ save: fileSave, exists: fileExists });
    bucket.mockReturnValue({ file: bucketFile });

    context = {
      threadId: 'thread-123',
      userId: 'user-123',
      environment: 'staging',
      emitStage,
    };
  });

  it('runs Python with inline JSON injected into data.json and globals', async () => {
    const sandbox = createSandbox();
    const create = vi.fn().mockResolvedValue(sandbox);
    const tool = new ExecutePythonCodeTool({ create }, 'e2b_test_key', { bucket } as never);

    const result = await tool.execute(
      {
        code: 'print(sum(item["value"] for item in numbers))',
        dataSources: [
          {
            sourceType: 'inline_json',
            alias: 'numbers',
            value: [{ value: 2 }, { value: 3 }],
          },
        ],
      },
      context
    );

    expect(result.success).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'e2b_test_key',
        allowInternetAccess: false,
      })
    );
    expect(sandbox.files.write).toHaveBeenCalledWith(
      '/home/user/data.json',
      expect.stringContaining('numbers')
    );
    expect(sandbox.runCode).toHaveBeenCalledWith(
      expect.stringContaining('print(sum(item["value"] for item in numbers))'),
      expect.objectContaining({ language: 'python' })
    );
    expect(sandbox.kill).toHaveBeenCalled();
  });

  it('uploads supported generated artifacts as export attachments', async () => {
    const workbookBytes = Buffer.from('PK\x03\x04fake-xlsx');
    const sandbox = createSandbox({
      files: {
        ...createSandboxDefaults().files,
        list: vi.fn().mockResolvedValue([
          {
            name: 'Elite Budget.xlsx',
            path: '/home/user/outputs/Elite Budget.xlsx',
            type: 'file',
            size: workbookBytes.length,
          },
        ]),
        read: vi.fn().mockResolvedValue(new Uint8Array(workbookBytes)),
      },
    });
    const tool = new ExecutePythonCodeTool(
      { create: vi.fn().mockResolvedValue(sandbox) },
      'e2b_test_key',
      { bucket } as never
    );

    const result = await tool.execute(
      {
        code: 'print("built workbook")',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(fileSave).toHaveBeenCalledWith(
      workbookBytes,
      expect.objectContaining({
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    );
    const data = result.data as {
      attachments: readonly [{ name: string; mimeType: string; artifactRole: string }];
    };
    expect(data.attachments[0]).toMatchObject({
      name: 'Elite Budget.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      artifactRole: 'export',
    });
  });

  it('returns Python execution errors without uploading artifacts', async () => {
    const sandbox = createSandbox({
      runCode: vi.fn().mockResolvedValue({
        logs: { stdout: [], stderr: ['boom'] },
        error: { name: 'NameError', value: 'missing variable', traceback: 'traceback text' },
      }),
    });
    const tool = new ExecutePythonCodeTool(
      { create: vi.fn().mockResolvedValue(sandbox) },
      'e2b_test_key',
      { bucket } as never
    );

    const result = await tool.execute({ code: 'print(missing)' }, context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('NameError: missing variable');
    expect(fileSave).not.toHaveBeenCalled();
    expect(sandbox.kill).toHaveBeenCalled();
  });

  it('returns actionable guidance for incomplete or truncated Python scripts', async () => {
    const sandbox = createSandbox({
      runCode: vi.fn().mockResolvedValue({
        logs: { stdout: [], stderr: [] },
        error: {
          name: '_IncompleteInputError',
          value: 'incomplete input (1845708089.py, line 405)',
          traceback: 'File "1845708089.py", line 405\n_IncompleteInputError: incomplete input',
        },
      }),
    });
    const tool = new ExecutePythonCodeTool(
      { create: vi.fn().mockResolvedValue(sandbox) },
      'e2b_test_key',
      { bucket } as never
    );

    const result = await tool.execute({ code: 'rows = [\n  ["unfinished"' }, context);

    expect(result.success).toBe(false);
    expect(result.isValidationError).toBe(true);
    expect(result.error).toContain('incomplete or truncated');
    expect(result.error).toContain('data-driven script');
    expect(result.error).toContain('render helper functions');
    expect(fileSave).not.toHaveBeenCalled();
  });

  it('requires thread context for artifact-safe execution', async () => {
    const tool = new ExecutePythonCodeTool({ create: vi.fn() }, 'e2b_test_key', {
      bucket,
    } as never);

    const result = await tool.execute({ code: 'print("hi")' }, { userId: 'user-123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('threadId');
  });

  it('exposes execute_python_code to strategy coordinator registry definitions', () => {
    const tool = new ExecutePythonCodeTool({ create: vi.fn() }, 'e2b_test_key', {
      bucket,
    } as never);
    const registry = new ToolRegistry();
    registry.register(tool);

    const definition = registry
      .getDefinitions('strategy_coordinator')
      .find((candidate) => candidate.name === 'execute_python_code');

    expect(definition).toBeDefined();
    expect(definition?.category).toBe('data');
  });
});
