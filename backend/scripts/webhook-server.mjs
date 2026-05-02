/**
 * GitHub Webhook Listener
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs on the server, listens for POST requests from GitHub on push events.
 * The server pulls code, builds, and reloads PM2 without needing inbound SSH.
 *
 * Setup:
 *   1. npm install express @octokit/webhooks   (in this directory)
 *   2. WEBHOOK_SECRET=xxx PORT=9001 node webhook-server.mjs
 *   3. pm2 start webhook-server.mjs --name nxt1-webhook
 *   4. Add webhook in GitHub repo: Settings → Webhooks
 *      - Payload URL: http://your-server:9001/webhook
 *      - Content type: application/json
 *      - Secret: value of WEBHOOK_SECRET
 *      - Events: Just the "push" event
 * ─────────────────────────────────────────────────────────────────────────────
 */

import express from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { execSync } from 'child_process';
import { writeFileSync, appendFileSync } from 'fs';

const PORT = process.env.PORT || 9001;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const DEPLOY_BRANCHES = (process.env.DEPLOY_BRANCHES || 'main,develop').split(',');
const DEPLOY_SCRIPT =
  process.env.DEPLOY_SCRIPT || '/home/vyacheslav_rud1996/nxt1-repo/backend/scripts/deploy.sh';
const LOG_FILE = process.env.LOG_FILE || '/home/ngocsonxx98/webhook.log';

if (!WEBHOOK_SECRET) {
  console.error('❌ WEBHOOK_SECRET environment variable is required');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  appendFileSync(LOG_FILE, line);
}

function verifySignature(req, rawBody) {
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) return false;
  const expected = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')}`;
  // Timing-safe compare to prevent timing attacks
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function runDeploy(branch, env) {
  log(`🚀 Starting deploy — branch: ${branch}, env: ${env}`);
  try {
    const output = execSync(
      `BRANCH=${branch} NODE_ENV=${env} bash ${DEPLOY_SCRIPT}`,
      { encoding: 'utf8', stdio: 'pipe', timeout: 300_000 } // 5 min timeout
    );
    log(`✅ Deploy succeeded:\n${output}`);
    return { success: true };
  } catch (err) {
    log(`❌ Deploy failed:\n${err.stderr || err.message}`);
    return { success: false, error: err.message };
  }
}

// ── Express Server ────────────────────────────────────────────────────────────
const app = express();

// Parse raw body first so we can verify the signature
app.use('/webhook', express.raw({ type: 'application/json', limit: '1mb' }));

let isDeploying = false; // Prevent concurrent deploys

app.post('/webhook', (req, res) => {
  // 1. Verify GitHub signature
  if (!verifySignature(req, req.body)) {
    log('⚠️  Invalid webhook signature — rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-github-event'];
  if (event !== 'push') {
    return res.status(200).json({ message: `Event "${event}" ignored` });
  }

  const payload = JSON.parse(req.body.toString());
  const ref = payload.ref || ''; // refs/heads/main
  const branch = ref.replace('refs/heads/', '');
  const pusher = payload.pusher?.name || 'unknown';
  const commit = payload.head_commit?.id?.slice(0, 8) || '';
  const message = payload.head_commit?.message?.split('\n')[0] || '';

  log(`📦 Push event — branch: ${branch}, pusher: ${pusher}, commit: ${commit} "${message}"`);

  if (!DEPLOY_BRANCHES.includes(branch)) {
    log(`ℹ️  Branch "${branch}" not in deploy list [${DEPLOY_BRANCHES.join(', ')}] — skipped`);
    return res.status(200).json({ message: 'Branch not configured for deploy' });
  }

  if (isDeploying) {
    log('⏳ Deploy already in progress — queuing...');
    return res.status(202).json({ message: 'Deploy already in progress, will run after' });
  }

  // Respond immediately so GitHub doesn't timeout (GitHub waits 10s)
  res.status(202).json({ message: 'Deploy started', branch, commit });

  // Run deploy async
  isDeploying = true;
  const env = branch === 'main' ? 'production' : 'staging';
  setImmediate(() => {
    try {
      runDeploy(branch, env);
    } finally {
      isDeploying = false;
    }
  });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', isDeploying, pid: process.pid });
});

app.listen(PORT, '127.0.0.1', () => {
  log(`🎣 Webhook listener started on 127.0.0.1:${PORT}`);
  log(`   Watching branches: ${DEPLOY_BRANCHES.join(', ')}`);
});
