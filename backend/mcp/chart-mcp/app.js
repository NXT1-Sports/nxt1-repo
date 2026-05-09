import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import express from 'express';

const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST?.trim() || '0.0.0.0';
const INTERNAL_HOST = process.env.CHART_MCP_INTERNAL_HOST?.trim() || '127.0.0.1';
const INTERNAL_PORT = Number.parseInt(process.env.CHART_MCP_INTERNAL_PORT ?? '1122', 10);
const MCP_PATH = normalizePath(process.env.CHART_MCP_PATH, '/mcp');
const TOKEN_HEADER = (process.env.CHART_MCP_TOKEN_HEADER ?? 'x-chart-mcp-token')
  .trim()
  .toLowerCase();
const TOKEN = process.env.CHART_MCP_BEARER_TOKEN?.trim() || '';
const UPSTREAM_READY_TIMEOUT_MS = Number.parseInt(
  process.env.CHART_MCP_UPSTREAM_READY_TIMEOUT_MS ?? '15000',
  10
);

if (!TOKEN) {
  console.error('[chart-mcp] CHART_MCP_BEARER_TOKEN is required');
  process.exit(1);
}

let child = startUpstream();
let upstreamExitedAt = null;
let upstreamReady = false;
let upstreamReadyPromise = waitForUpstreamReady();

function normalizePath(value, fallback) {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function buildUpstreamEnv() {
  const env = {
    ...process.env,
    VIS_REQUEST_SERVER:
      process.env.CHART_MCP_VIS_REQUEST_SERVER?.trim() || process.env.VIS_REQUEST_SERVER,
    SERVICE_ID: process.env.CHART_MCP_SERVICE_ID?.trim() || process.env.SERVICE_ID,
    DISABLED_TOOLS: process.env.CHART_MCP_DISABLED_TOOLS?.trim() || process.env.DISABLED_TOOLS,
  };

  if (!env.VIS_REQUEST_SERVER) delete env.VIS_REQUEST_SERVER;
  if (!env.SERVICE_ID) delete env.SERVICE_ID;
  if (!env.DISABLED_TOOLS) delete env.DISABLED_TOOLS;

  return env;
}

function startUpstream() {
  const binaryName = process.platform === 'win32' ? 'mcp-server-chart.cmd' : 'mcp-server-chart';
  const binaryPath = path.join(process.cwd(), 'node_modules', '.bin', binaryName);
  console.log(`[chart-mcp] Starting upstream: ${binaryPath}`);
  const childProcess = spawn(
    binaryPath,
    [
      '--transport',
      'streamable',
      '--host',
      INTERNAL_HOST,
      '--port',
      String(INTERNAL_PORT),
      '--endpoint',
      MCP_PATH,
    ],
    {
      env: buildUpstreamEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  childProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[chart-mcp] ${chunk}`);
  });
  childProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[chart-mcp] ${chunk}`);
  });
  childProcess.on('error', (error) => {
    upstreamReady = false;
    upstreamExitedAt = new Date().toISOString();
    console.error('[chart-mcp] Upstream spawn failed', error);
  });
  childProcess.on('exit', (code, signal) => {
    upstreamReady = false;
    upstreamExitedAt = new Date().toISOString();
    console.error(`[chart-mcp] Upstream exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
  });

  return childProcess;
}

function isUpstreamRunning() {
  return !!child && child.exitCode === null && !child.killed;
}

function checkUpstreamPort() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: INTERNAL_HOST, port: INTERNAL_PORT });
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForUpstreamReady() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < UPSTREAM_READY_TIMEOUT_MS) {
    if (!isUpstreamRunning()) return false;
    if (await checkUpstreamPort()) {
      upstreamReady = true;
      console.log(
        `[chart-mcp] Upstream ready on http://${INTERNAL_HOST}:${INTERNAL_PORT}${MCP_PATH}`
      );
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  upstreamReady = false;
  console.error('[chart-mcp] Upstream did not become ready before timeout', {
    timeoutMs: UPSTREAM_READY_TIMEOUT_MS,
    pid: child?.pid ?? null,
    running: isUpstreamRunning(),
  });
  return false;
}

function ensureAuthorized(req, res, next) {
  const provided = req.header(TOKEN_HEADER);
  if (!provided || provided.trim() !== TOKEN) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  next();
}

async function proxyRequest(req, res) {
  if (!isUpstreamRunning()) {
    res.status(503).json({ success: false, error: 'Chart MCP upstream is unavailable' });
    return;
  }

  if (!upstreamReady) {
    const ready = await upstreamReadyPromise;
    if (!ready) {
      res.status(503).json({
        success: false,
        error: 'Chart MCP upstream is not ready',
        pid: child?.pid ?? null,
        upstreamExitedAt,
      });
      return;
    }
  }

  try {
    const upstreamUrl = new URL(req.originalUrl, `http://${INTERNAL_HOST}:${INTERNAL_PORT}`);
    const headers = new Headers();

    for (const [rawKey, rawValue] of Object.entries(req.headers)) {
      if (!rawValue) continue;
      const key = rawKey.toLowerCase();
      if (key === 'host' || key === 'content-length' || key === TOKEN_HEADER) {
        continue;
      }

      const value = Array.isArray(rawValue) ? rawValue.join(', ') : rawValue;
      headers.set(rawKey, value);
    }

    const bodyAllowed = req.method !== 'GET' && req.method !== 'HEAD';
    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: bodyAllowed && Buffer.isBuffer(req.body) && req.body.length > 0 ? req.body : undefined,
    });

    res.status(upstreamResponse.status);
    upstreamResponse.headers.forEach((value, key) => {
      if (key === 'connection' || key === 'keep-alive' || key === 'transfer-encoding') {
        return;
      }
      res.setHeader(key, value);
    });

    if (!upstreamResponse.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstreamResponse.body).pipe(res);
  } catch (error) {
    console.error('[chart-mcp] Proxy request failed', error);
    res.status(502).json({ success: false, error: 'Chart MCP proxy request failed' });
  }
}

const app = express();

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    server: 'chart-mcp',
    upstreamRunning: isUpstreamRunning(),
    upstreamReady,
    upstreamExitedAt,
    endpoint: MCP_PATH,
  });
});

app.use(express.raw({ type: '*/*', limit: '2mb' }));
app.use(MCP_PATH, ensureAuthorized, proxyRequest);

const server = app.listen(PORT, HOST, () => {
  console.log(`[chart-mcp] Listening on http://${HOST}:${PORT}${MCP_PATH}`);
});

async function shutdown(signal) {
  console.log(`[chart-mcp] ${signal} received, shutting down`);
  server.close();
  if (isUpstreamRunning()) {
    child.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
