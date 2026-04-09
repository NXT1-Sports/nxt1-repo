# Agent X Global Document Knowledge Base

> **2026 ENTERPRISE STANDARD** — This document defines how to populate, manage,
> and query the RAG (Retrieval-Augmented Generation) Knowledge Base for Agent X.

## 1. Overview

While "Skills" provide fixed prompt templates to Agent X, the **Global Document
Knowledge Base** provides dynamic, document-level factual retrieval. You use it
to store verified domain data (NCAA/NAIA/NJCAA eligibility manuals, recruiting
calendars, NIL regulations, and platform guides).

Agent X searches this database via **MongoDB Atlas Vector Search** (using
`text-embedding-3-small` embeddings) and automatically injects the most relevant
chunks into its context window before replying.

---

## 2. Prerequisite: The Atlas Vector Index

Before the knowledge base can retrieve anything, you **must** create the
`$vectorSearch` index in MongoDB Atlas.

1. Log into your MongoDB Atlas dashboard.
2. Go to your database cluster and click **Search**.
3. Click **Create Index** -> **Atlas Vector Search** (JSON Editor).
4. Select the `agentGlobalKnowledge` collection (under your backend database).
5. Name the index exactly: `agent_global_knowledge_vector_index`
6. Paste this exact configuration:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "category"
    },
    {
      "type": "filter",
      "path": "version"
    }
  ]
}
```

7. Click **Create** and wait for the status to show Active.

---

## 3. How to Add Documents (Ingestion)

Loading data into the knowledge base is 100% automated. You submit raw text to
the REST API, and the backend handles chunking (2048 chars + overlap),
deduplication (SHA-256), OpenRouter embeddings, and Mongoose document creation.

All routes require the `adminGuard` (you must pass a valid Admin Bearer token).

### Endpoint: `POST /api/v1/knowledge/ingest`

#### Method A: Using cURL or Postman

```bash
curl -X POST https://api.your-domain.com/api/v1/knowledge/ingest \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "NCAA Division I Academic Requirements 2026",
    "category": "eligibility",
    "source": "url",
    "sourceRef": "https://www.ncaa.org/eligibility",
    "content": "Full copy-pasted text of the webpage goes here (up to 5MB)..."
  }'
```

#### Method B: Node.js Migration Script (For large PDFs)

If you need to upload a massive 400-page rulebook, write a quick script in
`backend/scripts/`:

```javascript
import fs from 'fs';

async function uploadRulebook() {
  // Load raw text (e.g., extracted from PDF previously)
  const rawText = fs.readFileSync('./ncaa-d1-manual.txt', 'utf-8');

  const response = await fetch(
    'http://localhost:3000/api/v1/knowledge/ingest',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        title: 'NCAA Division I Manual 2025-2026',
        category: 'ncaa_rules',
        source: 'pdf',
        sourceRef: 'ncaa-d1-manual-2026.pdf',
        content: rawText,
        // Optional: adjust chunk sizes
        chunkSize: 2048,
        chunkOverlap: 256,
      }),
    }
  );

  const result = await response.json();
  console.log(
    `Ingested successfully! Created ${result.data.chunksCreated} chunks. Version: ${result.data.version}`
  );
}

uploadRulebook();
```

> **Note on Versioning:** If you re-upload a document with the _exact same
> `content`_, the system skips it (saves embedding costs). If you upload a
> document with the same `sourceRef` but _changed content_, it increments the
> `version` and automatically deletes the older chunks.

---

## 4. Valid Categories & Sources

When ingesting, you must use one of the strictly enforced types from
`@nxt1/core`:

### `KnowledgeCategory`

- `ncaa_rules`, `naia_rules`, `njcaa_rules`
- `eligibility`, `recruiting_calendar`, `compliance`, `transfer_portal`, `nil`
- `platform_guide`, `help_center`
- `sport_rules`, `training`, `nutrition`, `mental_performance`
- `general`

### `KnowledgeSourceType`

- `pdf`
- `url`
- `manual`
- `help_center`
- `api`

---

## 5. Testing and Managing Data

### Test Retrieval (Dry Run)

Want to see what Agent X will find when a user asks a question?
`POST /api/v1/knowledge/query`

```json
{
  "query": "What is the minimum GPA for D1?",
  "topK": 5
}
```

### List All Documents

See everything that has been successfully added to the knowledge base.
`GET /api/v1/knowledge/documents`

### View Stats

See how many chunks exist per category. `GET /api/v1/knowledge/stats`

### Delete a Document

Made a mistake? Purge all chunks tied to a specific source reference.
`DELETE /api/v1/knowledge/source`

```json
{
  "sourceRef": "ncaa-d1-manual-2026.pdf"
}
```

### Purge an Entire Category

`DELETE /api/v1/knowledge/category`

```json
{
  "category": "platform_guide"
}
```
