import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OutstandSocialBridgeService } from '../outstand-social-bridge.service.js';

describe('OutstandSocialBridgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OUTSTAND_API_KEY', 'ost_test_key');
    vi.stubEnv('OUTSTAND_MCP_URL', 'https://mcp.outstand.test/mcp');
  });

  it('normalizes create_post payloads with single post id', async () => {
    const bridge = new OutstandSocialBridgeService();
    const executeToolSpy = vi.spyOn(bridge, 'executeTool').mockResolvedValue({
      content: [
        { type: 'text', text: JSON.stringify({ post_id: 'post_123', status: 'published' }) },
      ],
    });

    const result = await bridge.createPost({
      content: 'hello',
      socialAccountIds: ['acc_1'],
    });

    expect(executeToolSpy).toHaveBeenCalledWith(
      'create_post',
      expect.objectContaining({ content: 'hello', social_account_ids: ['acc_1'] }),
      expect.any(Object)
    );
    expect(result.postIds).toEqual(['post_123']);
    expect(result.status).toBe('published');
  });

  it('extracts auth url from get_auth_url payload', async () => {
    const bridge = new OutstandSocialBridgeService();
    vi.spyOn(bridge, 'executeTool').mockResolvedValue({
      structuredContent: { auth_url: 'https://outstand.so/oauth/start' },
      content: [],
    });

    const authUrl = await bridge.getAuthUrl('x', 'https://app.nxt1sports.com/callback');

    expect(authUrl).toBe('https://outstand.so/oauth/start');
  });

  it('extracts auth url from nested get_auth_url payload', async () => {
    const bridge = new OutstandSocialBridgeService();
    vi.spyOn(bridge, 'executeTool').mockResolvedValue({
      structuredContent: {
        data: {
          url: 'https://outstand.so/oauth/start?nested=1',
        },
      },
      content: [],
    });

    const authUrl = await bridge.getAuthUrl('x', 'https://app.nxt1sports.com/callback');

    expect(authUrl).toBe('https://outstand.so/oauth/start?nested=1');
  });

  it('extracts auth url when tool returns plain text url', async () => {
    const bridge = new OutstandSocialBridgeService();
    vi.spyOn(bridge, 'executeTool').mockResolvedValue({
      content: [{ type: 'text', text: 'https://outstand.so/oauth/start?raw=1' }],
    });

    const authUrl = await bridge.getAuthUrl('instagram', 'https://app.nxt1sports.com/callback');

    expect(authUrl).toBe('https://outstand.so/oauth/start?raw=1');
  });
});
