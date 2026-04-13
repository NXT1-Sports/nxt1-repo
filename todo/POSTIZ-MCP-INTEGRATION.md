# Postiz MCP Integration Plan (Agent X)

> **Priority:** 🔴 High  
> **Topic:** AI Social Media Publishing Architecture  
> **Status:** Planning

## Executive Summary

This document outlines the Grade A+ enterprise architecture for integrating
**Postiz (Social Media Management)** into **Agent X** via the Model Context
Protocol (MCP).

Unlike Apify which is used for _web scraping_, Postiz will be strictly used for
_secure social media publishing_. It will operate in two modes:

1. **NXT1 Global Usage:** Agent X tweeting updates for the NXT1 platform itself.
2. **Multi-Tenant User Usage:** Agent X acting as a personalized social media
   manager for NXT1 end-users (coaches, athletes, programs) and publishing
   securely to their specific linked accounts.

---

## 1. Hosting & Infrastructure Setup (Why a Separate Server?)

_You might ask: "Why not just deploy this inside our existing NXT1 backend?"_

**The Architectural Audit Answer:** The NXT1 backend runs on
serverless/ephemeral architecture (Firebase App Hosting, Cloud Functions,
Express). Postiz, however, is a massive stateful monolith (NextJS + NestJS +
Temporal Workers + Redis + Postgres). Merging a continuous background-worker
system like Postiz into a serverless API environment is a guaranteed failure.
Temporal workers need to be "always on" to schedule and dispatch posts reliably.

Therefore, Postiz must run as an **isolated internal microservice**.

- **Server:** Oracle Cloud Free Tier (ARM instance, 4 CPUs, 24GB RAM) OR $5
  Hetzner/DigitalOcean VPS.
- **Deployment:** Standard Docker Compose (`docker compose up -d` running Postiz
  app, Postgres, and Redis).
- **Domain & SSL:** Use a Cloudflare Zero Trust Tunnel routing `social.nxt1.com`
  strictly to the internal Docker port (e.g., `localhost:3000`). This completely
  bypasses the need for Nginx and auto-generates secure SSL certs for OAuth.
- **Provider Keys:** Postiz self-hosted requires our own Developer API keys. We
  must register NXT1 as a verified app on the following developer portals:
  - **Twitter / X Developer Portal**
  - **LinkedIn Developer Portal**
  - **Meta Developer Portal** (for Instagram Professional/Business & Facebook
    Pages)

---

## 2. Two Modes of Operation (Internal Company vs. External Users)

It is critical to distinguish how Postiz MCP is used by the internal NXT1
dev/marketing team versus how it is used by external end-users inside the NXT1
app.

### Mode A: Internal Company Use (VS Code / IDE Integration)

We want our internal team to be able to talk to our IDE agent (like
Copilot/Cursor) and say, "Draft a summary of the latest commit and tweet it."

- **Setup:** The developer edits their local `.vscode/mcp.json` file to include
  the `@oculairmedia/postizz-mcp` tool.
- **Keys:** They use the same `POSTIZ_BASE_URL` and generate a Personal API Key
  from the Postiz dashboard.
- **Routing:** Because they are using their own API key, Postiz automatically
  routes the scheduled posts directly to the NXT1 company social media channels
  (which are linked to the admin account).
- **Result:** The dev team can publish to @NXT1Sports directly from the IDE,
  similar to how they query Sentry or Stripe.

### Mode B: External User Use (Agent X / Web App Integration)

We want coaches, athletes, and programs to log into the NXT1 web app, talk to
Agent X, and have Agent X manage _their_ personal/team social media.

- **Setup:** There is no `mcp.json` here. The Postiz MCP server is instantiated
  purely in the NXT1 Next.js/Express Backend code via the TypeScript SDK's
  `StdioClientTransport`.
- **Routing Constraint:** We **cannot** risk Agent X posting User A's content to
  User B's Twitter account. Since our backend Postiz instance uses a single
  Master API Key, we must enforce tenant isolation at the database level.

#### The Database Tenant Architecture:

1. **User Onboarding:** When a user links a social account to the NXT1 platform,
   we hit the Postiz API to connect that account and receive a
   `postiz_channel_id` (e.g., `ch_98765`).
2. **Database Storage:** We save this `postiz_channel_id` in the user's document
   in Firestore/MongoDB (e.g., `user.social.twitterChannelId`).
3. **Agent X Interception:** When Agent X executes a publishing tool, it does
   _not_ get to pick the channel ID. The tool automatically fetches the
   `postiz_channel_id` belonging to the authenticated session context (the user
   making the request) and forces the MCP bridge to post strictly to that ID.

---

## 3. Backend Integration Blueprint

Follow the same structural pattern as the existing Apify MCP Integration.

### A. The MCP Bridge (`postiz-mcp-bridge.service.ts`)

Located in `backend/src/modules/agent/tools/integrations/`. Uses the
`StdioClientTransport`.

```typescript
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BaseMcpClientService } from './base-mcp-client.service.js';

export class PostizMcpBridgeService extends BaseMcpClientService {
  readonly serverName = 'postiz';

  constructor() {
    super();
    // Validate POSTIZ_BASE_URL and POSTIZ_MASTER_API_KEY in environment
  }

  protected getTransport() {
    return new StdioClientTransport({
      command: 'npx',
      args: ['@oculairmedia/postizz-mcp'],
      env: {
        ...process.env,
        POSTIZ_API_KEY: process.env['POSTIZ_MASTER_API_KEY'],
        POSTIZ_BASE_URL: process.env['POSTIZ_BASE_URL'],
      },
    });
  }

  // Typed proxy method for creating a post
  async createPost(
    channelIds: string[],
    content: string,
    scheduledAt?: string
  ): Promise<unknown> {
    return this.executeTool(
      'create_post',
      { channelIds, content, scheduledAt },
      { timeoutMs: 30000 }
    );
  }
}
```

### B. The Tool Wrapper (`create-postiz-post.tool.ts`)

The Agent X wrapper exposing the capability to the LLM via Zod schema.

- **Name:** `schedule_social_post`
- **Description:** "Schedules a social media post across authorized user
  networks."
- **Schema:** `content` (string, max lengths based on platforms), `platforms`
  (array of 'twitter' | 'linkedin' | 'instagram'), `scheduledTime` (optional ISO
  date).
- **Execution Logic:** Finds the corresponding `postiz_channel_id` for the
  requested platform from the DB, then delegates to
  `postizBridge.createPost([channelId], content, time)`.

### C. Tool Registration (`bootstrap.ts`)

Instantiate and inject the tools into the global Worker environment.

```typescript
const postizBridge = new PostizMcpBridgeService();
const createPostTool = new CreatePostizPostTool(postizBridge);
agentTools.push(createPostTool);
```

---

## 4. Execution Checklist

- [ ] Register Developer Accounts (Twitter, LinkedIn, Meta).
- [ ] Deploy Postiz instance via Docker (VPS + Cloudflare Tunnel).
- [ ] Add `.env` vars to NXT1 Backend (`POSTIZ_MASTER_API_KEY`,
      `POSTIZ_BASE_URL`).
- [ ] Create `PostizMcpBridgeService` inheriting from `BaseMcpClientService`.
- [ ] Create `CreatePostizPostTool` mapped to Agent X prompt limits.
- [ ] Add `postiz_channel_id` mapping logic to Firestore/MongoDB schemas.
- [ ] Write integration tests mocked with MSW & Vitest.
- [ ] Push to staging and attempt to schedule a multi-channel post from the
      Agent X UI.
