# Backend Performance Monitoring

> **Enterprise-grade performance tracking for NXT1 Backend API**  
> Automatic request monitoring across all 30+ routes with zero configuration.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [How It Works](#how-it-works)
4. [Metrics Collected](#metrics-collected)
5. [Usage](#usage)
6. [Testing Guide](#testing-guide)
7. [API Reference](#api-reference)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The Backend Performance Monitoring system automatically tracks **every API
request** passing through the Express server, recording duration, success rates,
cache effectiveness, and detailed statistics.

### Key Features

- ✅ **Zero-config automatic tracking** — All routes monitored without code
  changes
- 📊 **Comprehensive metrics** — Duration, success rate, cache hit rate, P95
  latency
- 🎯 **Per-route statistics** — Individual metrics for each endpoint
- 🔍 **Debug endpoint** — Real-time stats via `/api/v1/debug/performance`
- 💾 **In-memory storage** — Last 1000 requests retained for analysis
- 🚀 **Production-ready** — Minimal overhead, efficient metric aggregation

### What Gets Tracked

```typescript
Every HTTP request records:
├── Trace Name (e.g., "backend_teams_get_all")
├── Duration (milliseconds)
├── HTTP Status Code
├── Success/Failure (status < 400 = success)
├── Cache Status (hit/miss from Redis)
├── Request Method & Path
└── Timestamp
```

---

## Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                     Express Application                         │
├─────────────────────────────────────────────────────────────────┤
│  1. Request arrives → /api/v1/teams?limit=5                     │
│  2. performanceMiddleware starts timer                          │
│  3. Request flows through route handlers                        │
│  4. Response prepared (cache check, data fetch)                 │
│  5. performanceMiddleware stops timer & records metrics         │
│  6. Response sent to client                                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Metrics Storage                             │
├─────────────────────────────────────────────────────────────────┤
│  In-Memory Array (last 1000 metrics)                            │
│  ├── traceName: "backend_teams_get_all"                         │
│  ├── duration: 2455ms                                           │
│  ├── success: true                                              │
│  ├── cached: false                                              │
│  └── timestamp: 2026-02-16T14:57:23.123Z                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  Debug Endpoint                                 │
├─────────────────────────────────────────────────────────────────┤
│  GET /api/v1/debug/performance                                  │
│  Returns:                                                       │
│    - Total requests                                             │
│    - Average duration                                           │
│    - Success rate                                               │
│    - Per-trace statistics (avg, min, max, P95, cache hit rate) │
│    - Recent 10 metrics                                          │
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
backend/
├── src/
│   ├── middleware/
│   │   └── performance.middleware.ts   (Core tracking logic)
│   ├── index.ts                        (Global middleware applied)
│   └── routes/
│       ├── teams.routes.ts             (Auto-tracked)
│       ├── feed.routes.ts              (Auto-tracked)
│       ├── athletes.routes.ts          (Auto-tracked)
│       └── ... (all 30+ routes)        (Auto-tracked)
└── BACKEND-PERFORMANCE-MONITORING.md   (This file)
```

---

## How It Works

### 1. Middleware Integration

The performance middleware is registered **globally** in `src/index.ts`:

```typescript
// src/index.ts
import { performanceMiddleware } from './middleware/performance.middleware.js';

app.use(performanceMiddleware); // ← Applied to ALL routes
```

### 2. Request Lifecycle

```typescript
// Incoming request: GET /api/v1/teams?limit=5

Step 1: performanceMiddleware intercepts request
  → Starts timer: startTime = Date.now()
  → Generates trace name: "backend_teams_get_all"
  → Overrides res.end() to capture completion

Step 2: Request flows to route handler
  → Teams controller processes request
  → Checks Redis cache (cached = true/false)
  → Fetches data from Firestore if needed
  → Prepares response

Step 3: Response sent
  → res.json({ teams: [...], cached: true })
  → res.end() called

Step 4: performanceMiddleware captures metrics
  → Stops timer: duration = Date.now() - startTime
  → Records: { traceName, duration, success, cached, ... }
  → Logs to console
  → Stores in memory (last 1000)

Step 5: Response delivered to client
```

### 3. Trace Name Generation

The middleware automatically generates semantic trace names:

```typescript
Route Pattern                      → Trace Name
──────────────────────────────────────────────────────────────
GET  /api/v1/teams                 → backend_teams_get_all
GET  /api/v1/teams/abc123          → backend_teams_get_by_id
POST /api/v1/teams                 → backend_teams_create
GET  /api/v1/feed                  → backend_http_request_get_api_v1_feed
GET  /api/v1/athletes              → backend_http_request_get_api_v1_athletes
...
```

---

## Metrics Collected

### Per-Request Metrics

Each request records the following data:

| Metric       | Type      | Description                              | Example                 |
| ------------ | --------- | ---------------------------------------- | ----------------------- |
| `traceName`  | `string`  | Semantic name identifying the operation  | `backend_teams_get_all` |
| `duration`   | `number`  | Request processing time in milliseconds  | `2455`                  |
| `timestamp`  | `Date`    | When the request was made                | `2026-02-16T...`        |
| `success`    | `boolean` | Whether request succeeded (status < 400) | `true`                  |
| `httpStatus` | `number`  | HTTP status code                         | `200`                   |
| `method`     | `string`  | HTTP method                              | `GET`                   |
| `path`       | `string`  | Request path                             | `/api/v1/teams`         |
| `cached`     | `string`  | Whether response came from cache         | `"true"`/`"false"`      |

### Aggregated Statistics

The debug endpoint returns aggregated stats per trace:

| Metric         | Description                              | Formula                     |
| -------------- | ---------------------------------------- | --------------------------- |
| `count`        | Total number of requests                 | `requests.length`           |
| `avgDuration`  | Average response time                    | `sum(durations) / count`    |
| `minDuration`  | Fastest request (usually cached)         | `min(durations)`            |
| `maxDuration`  | Slowest request (usually cold start)     | `max(durations)`            |
| `p95Duration`  | 95th percentile latency                  | `durations.sort()[95%]`     |
| `successRate`  | Percentage of successful requests        | `(successes / count) * 100` |
| `cacheHitRate` | Percentage of requests served from cache | `(cached / count) * 100`    |

---

## Usage

### Accessing Performance Stats

Performance monitoring is **always active** — no setup required. Access stats
anytime:

```bash
# Get current performance statistics
curl http://localhost:3000/api/v1/debug/performance
```

**Response structure:**

```json
{
  "success": true,
  "data": {
    "status": "success",
    "message": "Performance monitoring is working",
    "stats": {
      "totalRequests": 100,
      "averageDuration": 245,
      "successRate": 98,
      "byTrace": {
        "backend_teams_get_all": {
          "count": 25,
          "avgDuration": 1200,
          "minDuration": 7,
          "maxDuration": 2455,
          "p95Duration": 2000,
          "successRate": 100,
          "cacheHitRate": 72
        },
        "backend_http_request_get_api_v1_feed": {
          "count": 30,
          "avgDuration": 150,
          "minDuration": 45,
          "maxDuration": 500,
          "p95Duration": 350,
          "successRate": 100,
          "cacheHitRate": 85
        }
      }
    },
    "recentMetrics": [
      {
        "traceName": "backend_teams_get_all",
        "duration": 1027,
        "success": true,
        "httpStatus": 200,
        "timestamp": "2026-02-16T14:57:23.123Z",
        "attributes": {
          "method": "GET",
          "path": "/api/v1/teams",
          "cached": "false"
        }
      }
    ]
  }
}
```

### Example: Analyzing Cache Effectiveness

```bash
# 1. Make first request (no cache)
curl http://localhost:3000/api/v1/teams/mhrflxu5w5uaszf3gbts

# 2. Make second request (cached)
curl http://localhost:3000/api/v1/teams/mhrflxu5w5uaszf3gbts

# 3. Check performance difference
curl http://localhost:3000/api/v1/debug/performance | jq '.data.stats.byTrace.backend_teams_get_by_id'
```

**Expected output:**

```json
{
  "count": 2,
  "avgDuration": 517,
  "minDuration": 7, // ← Cached request (350x faster!)
  "maxDuration": 1027, // ← First request (no cache)
  "p95Duration": 1027,
  "successRate": 100,
  "cacheHitRate": 50 // 1 of 2 requests cached
}
```

**Key Insight:** Cache improves performance by **147x** (1027ms → 7ms)

---

## Testing Guide

### Basic Health Check

```bash
# 1. Verify server is running
curl http://localhost:3000/health

# Expected: {"status":"Production OK","timestamp":"2026-02-16T..."}

# 2. Check performance endpoint
curl http://localhost:3000/api/v1/debug/performance

# Expected: {"success":true,"data":{...}}
```

### Generate Test Traffic

```bash
# Create requests to multiple endpoints
curl http://localhost:3000/api/v1/teams?limit=5
curl http://localhost:3000/api/v1/feed
curl http://localhost:3000/api/v1/athletes
curl http://localhost:3000/api/v1/colleges
curl http://localhost:3000/api/v1/videos

# Check accumulated metrics
curl http://localhost:3000/api/v1/debug/performance | jq '.data.stats.totalRequests'
```

### Test Cache Performance

```bash
# Measure first request (no cache)
time curl -s http://localhost:3000/api/v1/teams?limit=5 > /dev/null

# Measure second request (cached)
time curl -s http://localhost:3000/api/v1/teams?limit=5 > /dev/null

# View detailed stats
curl http://localhost:3000/api/v1/debug/performance | jq '.data.stats.byTrace.backend_teams_get_all'
```

### Load Test (Optional)

```bash
# Generate 100 requests with ApacheBench
ab -n 100 -c 10 http://localhost:3000/api/v1/teams

# Check performance impact
curl http://localhost:3000/api/v1/debug/performance | jq '.data.stats'
```

### Verify Specific Routes

```bash
# Test different HTTP methods
curl -X POST http://localhost:3000/api/v1/teams -H "Content-Type: application/json" -d '{...}'
curl -X GET  http://localhost:3000/api/v1/teams/abc123
curl -X PATCH http://localhost:3000/api/v1/teams/abc123 -d '{...}'
curl -X DELETE http://localhost:3000/api/v1/teams/abc123

# Check metrics per method
curl http://localhost:3000/api/v1/debug/performance | jq '.data.stats.byTrace | keys'
```

---

## API Reference

### GET `/api/v1/debug/performance`

Returns comprehensive performance statistics for all tracked requests.

**Request:**

```http
GET /api/v1/debug/performance HTTP/1.1
Host: localhost:3000
```

**Response:** `200 OK`

```typescript
{
  success: boolean;
  data: {
    status: "success" | "error";
    message: string;
    stats: {
      totalRequests: number;        // Total tracked requests
      averageDuration: number;      // Avg duration across all requests (ms)
      successRate: number;          // % of successful requests (0-100)
      byTrace: {
        [traceName: string]: {
          count: number;            // Number of requests for this trace
          avgDuration: number;      // Average duration (ms)
          minDuration: number;      // Fastest request (ms)
          maxDuration: number;      // Slowest request (ms)
          p95Duration: number;      // 95th percentile latency (ms)
          successRate: number;      // % successful (0-100)
          cacheHitRate: number;     // % cached (0-100)
        };
      };
    };
    recentMetrics: Array<{
      traceName: string;
      duration: number;
      success: boolean;
      httpStatus: number;
      timestamp: string;            // ISO 8601 format
      attributes: {
        method: string;
        path: string;
        cached: "true" | "false";
      };
    }>;
  };
}
```

**Example:**

```bash
# Pretty-print with jq
curl -s http://localhost:3000/api/v1/debug/performance | jq

# Get only total requests
curl -s http://localhost:3000/api/v1/debug/performance | jq '.data.stats.totalRequests'

# Get stats for specific trace
curl -s http://localhost:3000/api/v1/debug/performance | jq '.data.stats.byTrace.backend_teams_get_all'

# Get recent metrics
curl -s http://localhost:3000/api/v1/debug/performance | jq '.data.recentMetrics[]'
```

---

## Best Practices

### 1. Regular Monitoring

```bash
# Add to cron job or monitoring dashboard
*/5 * * * * curl -s http://localhost:3000/api/v1/debug/performance | jq '.data.stats' >> /var/log/performance.log
```

### 2. Performance Thresholds

Set alerts based on metrics:

```javascript
const stats = await fetch('/api/v1/debug/performance').then((r) => r.json());

// Alert if P95 latency exceeds 500ms
if (stats.data.stats.byTrace.backend_teams_get_all.p95Duration > 500) {
  console.warn('⚠️ High latency detected on teams endpoint');
}

// Alert if cache hit rate drops below 50%
if (stats.data.stats.byTrace.backend_teams_get_all.cacheHitRate < 50) {
  console.warn('⚠️ Low cache hit rate - consider increasing TTL');
}

// Alert if success rate drops below 95%
if (stats.data.stats.successRate < 95) {
  console.error('🚨 High error rate detected!');
}
```

### 3. Cache Optimization

Use metrics to tune cache settings:

```typescript
// Analysis from metrics:
// - avgDuration without cache: 2455ms
// - avgDuration with cache: 7ms
// - Performance improvement: 350x

// Action: Increase cache TTL for frequently accessed data
const CACHE_TTL_INDIVIDUAL = 10 * 60; // 10 minutes (was 5)
const CACHE_TTL_BULK = 20 * 60; // 20 minutes (was 10)
```

### 4. Identify Slow Endpoints

```bash
# Find endpoints with highest P95 latency
curl -s http://localhost:3000/api/v1/debug/performance | jq '
  .data.stats.byTrace |
  to_entries |
  sort_by(.value.p95Duration) |
  reverse |
  .[0:5] |
  map({trace: .key, p95: .value.p95Duration})
'
```

### 5. Production Deployment

**Environment Variables:**

```bash
# .env
NODE_ENV=production
PERFORMANCE_METRICS_ENABLED=true
PERFORMANCE_MAX_METRICS=1000  # Keep last 1000 metrics
```

**Monitoring Integration:**

```typescript
// Export metrics to external service (Datadog, New Relic, etc.)
setInterval(async () => {
  const stats = await fetch('/api/v1/debug/performance').then((r) => r.json());

  // Send to monitoring service
  await datadog.gauge('backend.avg_duration', stats.data.stats.averageDuration);
  await datadog.gauge('backend.success_rate', stats.data.stats.successRate);
  await datadog.gauge('backend.total_requests', stats.data.stats.totalRequests);
}, 60000); // Every minute
```

---

## Troubleshooting

### Issue: No metrics showing

**Symptoms:** `/api/v1/debug/performance` returns `totalRequests: 0`

**Solutions:**

1. Verify middleware is registered:

   ```bash
   grep -n "performanceMiddleware" backend/src/index.ts
   # Should show: app.use(performanceMiddleware);
   ```

2. Check server logs:

   ```bash
   # Look for [Performance] log entries
   tail -f logs/backend.log | grep Performance
   ```

3. Restart server:
   ```bash
   npm start
   ```

### Issue: Metrics not updating

**Symptoms:** Request count stays constant after new requests

**Solutions:**

1. Verify requests are reaching server:

   ```bash
   # Check server logs
   tail -f logs/backend.log
   ```

2. Check if middleware is before route handlers:
   ```typescript
   // backend/src/index.ts - Correct order:
   app.use(performanceMiddleware); // Must be BEFORE routes
   app.use('/api/v1/teams', teamsRoutes);
   ```

### Issue: High memory usage

**Symptoms:** Server memory consumption increasing over time

**Solutions:**

1. Check metric storage limit:

   ```typescript
   // backend/src/middleware/performance.middleware.ts
   const MAX_METRICS = 1000; // Adjust if needed
   ```

2. Reduce retention window:

   ```typescript
   const MAX_METRICS = 500; // Keep only last 500 metrics
   ```

3. Implement metric rotation:
   ```typescript
   // Clear metrics periodically
   setInterval(() => {
     clearPerformanceMetrics();
   }, 3600000); // Clear every hour
   ```

### Issue: Trace names too generic

**Symptoms:** All traces show as `backend_http_request_get_api_v1_...`

**Solutions:**

1. Add specific trace mappings in middleware:
   ```typescript
   // backend/src/middleware/performance.middleware.ts
   function getTraceNameFromRequest(req: Request): string {
     // Add custom mappings
     if (path.startsWith('/api/v1/feed')) {
       return 'backend_feed_load';
     }
     // ... existing code
   }
   ```

---

## Advanced Configuration

### Custom Trace Names

Add trace name constants for new routes:

```typescript
// backend/src/middleware/performance.middleware.ts
export const BACKEND_TRACE_NAMES = {
  // Existing traces...

  // New traces
  FEED_LOAD: 'backend_feed_load',
  ATHLETES_SEARCH: 'backend_athletes_search',
  VIDEOS_UPLOAD: 'backend_videos_upload',

  // Generic
  HTTP_REQUEST: 'backend_http_request',
} as const;
```

### Export Metrics to File

```typescript
// backend/src/middleware/performance.middleware.ts
import fs from 'fs';

export function exportMetrics(filepath: string): void {
  const stats = getPerformanceStats();
  fs.writeFileSync(filepath, JSON.stringify(stats, null, 2));
  logger.info(`Metrics exported to ${filepath}`);
}

// Usage:
exportMetrics('./performance-report.json');
```

### Integration with Prometheus

```typescript
// backend/src/routes/metrics.routes.ts
import { Router } from 'express';
import { getPerformanceStats } from '../middleware/performance.middleware.js';

const router = Router();

router.get('/metrics', (req, res) => {
  const stats = getPerformanceStats();

  // Convert to Prometheus format
  let prometheus = '';
  Object.entries(stats.byTrace).forEach(([trace, metrics]) => {
    prometheus += `backend_request_duration_milliseconds{trace="${trace}"} ${metrics.avgDuration}\n`;
    prometheus += `backend_request_success_rate{trace="${trace}"} ${metrics.successRate}\n`;
    prometheus += `backend_request_cache_hit_rate{trace="${trace}"} ${metrics.cacheHitRate}\n`;
  });

  res.type('text/plain').send(prometheus);
});

export default router;
```

---

## Summary

### What You Get

- ✅ **Automatic tracking** of all API requests
- 📊 **Detailed metrics** per endpoint
- 🎯 **Cache effectiveness** monitoring
- 🔍 **Real-time debugging** via HTTP endpoint
- 🚀 **Production-ready** with minimal overhead

### Key Metrics

| Metric         | Purpose                 |
| -------------- | ----------------------- |
| `avgDuration`  | Identify slow endpoints |
| `p95Duration`  | Set performance SLAs    |
| `cacheHitRate` | Optimize cache strategy |
| `successRate`  | Monitor system health   |

### Next Steps

1. ✅ **Monitor regularly** — Check `/api/v1/debug/performance` daily
2. 📈 **Set baselines** — Record typical metrics for each endpoint
3. ⚠️ **Configure alerts** — Trigger on P95 > 500ms or successRate < 95%
4. 🔧 **Optimize** — Use metrics to guide performance improvements

---

**Questions?** Check the [Troubleshooting](#troubleshooting) section or review
server logs.

**Performance monitoring is now active across all 30+ backend routes!** 🎉
