# Redis-Based Rate Limiting Implementation

## Overview

NXT1 backend now uses Redis-based distributed rate limiting instead of in-memory
rate limiting. This provides consistent rate limiting across multiple server
instances and improved scalability.

## Key Features

### 🚀 **Distributed Rate Limiting**

- **Redis Store**: Shared state across multiple server instances
- **Automatic Fallback**: Falls back to in-memory if Redis is unavailable
- **Smart Key Generation**: Uses user ID when authenticated, IP address
  otherwise

### 🛡️ **Tiered Protection Levels**

| Type      | Window | Limit        | Use Case                                 | Retry After |
| --------- | ------ | ------------ | ---------------------------------------- | ----------- |
| `auth`    | 15 min | 5 requests   | Login, registration, password reset      | 15 min      |
| `billing` | 5 min  | 10 requests  | Payment processing, subscription changes | 5 min       |
| `email`   | 1 hour | 3 requests   | Email sending, invitations               | 1 hour      |
| `upload`  | 15 min | 20 requests  | File uploads, video processing           | 15 min      |
| `search`  | 15 min | 50 requests  | Search queries, discovery endpoints      | 15 min      |
| `api`     | 15 min | 100 requests | Standard API endpoints                   | 15 min      |
| `lenient` | 15 min | 200 requests | Less sensitive endpoints                 | 15 min      |

### 🔧 **Configuration**

#### Environment Variables

```bash
# Redis connection (optional - defaults to localhost)
REDIS_URL=redis://localhost:6379

# Or for Redis Cloud/external
REDIS_URL=redis://username:password@hostname:port
```

#### Usage in Routes

```typescript
import { getRedisRateLimiter } from '../middleware/redis-rate-limit.middleware.js';

// Apply specific rate limiting to route
app.use('/api/v1/auth', await getRedisRateLimiter('auth'), authRoutes);
app.use('/api/v1/billing', await getRedisRateLimiter('billing'), billingRoutes);
app.use('/api/v1/upload', await getRedisRateLimiter('upload'), uploadRoutes);
```

## Implementation Details

### 🏗️ **Architecture**

1. **Redis Store Creation**
   - Uses `@nxt1/cache` service for Redis connection
   - Automatically detects Redis availability
   - Falls back to in-memory if Redis is down

2. **Key Strategy**
   - Format: `nxt1:rate-limit:{type}:{identifier}`
   - Identifier: `user:{userId}` for authenticated requests, `ip:{ipAddress}`
     for anonymous

3. **Error Handling**
   - Maps rate limit types to supported error types
   - Provides consistent error responses
   - Includes retry-after information

### 📊 **Monitoring & Administration**

#### Reset Rate Limits (Dev/Testing)

```typescript
import { resetRateLimit } from '../middleware/redis-rate-limit.middleware.js';

// Reset auth rate limit for specific user
await resetRateLimit('auth', 'user:12345');

// Reset API rate limit for IP
await resetRateLimit('api', 'ip:192.168.1.1');
```

#### Check Rate Limit Status

```typescript
import { getRateLimitStatus } from '../middleware/redis-rate-limit.middleware.js';

const status = await getRateLimitStatus('api', 'user:12345');
console.log({
  remaining: status.remaining, // Requests left in window
  resetTime: status.resetTime, // When window resets
  total: status.total, // Total allowed in window
});
```

### 🚦 **Health Checks**

Rate limiting is automatically skipped for:

- `/health` (production health check)
- `/staging/health` (staging health check)

## Migration from Memory-Based

### Before (Memory-based)

```typescript
import { getRateLimiter } from './middleware/rate-limit.middleware.js';

app.use('/api/v1/auth', getRateLimiter('auth'), authRoutes);
```

### After (Redis-based)

```typescript
import { getRedisRateLimiter } from './middleware/redis-rate-limit.middleware.js';

// Must be inside async function due to await
app.use('/api/v1/auth', await getRedisRateLimiter('auth'), authRoutes);
```

## Benefits

### 🔄 **Scalability**

- **Distributed State**: Multiple server instances share rate limit counters
- **Horizontal Scaling**: Add servers without losing rate limit context
- **Load Balancer Friendly**: Works behind load balancers and proxies

### 🛡️ **Security**

- **DDoS Protection**: Consistent limiting across all entry points
- **Resource Protection**: Prevents abuse of expensive operations
- **Brute Force Prevention**: Strong limits on authentication endpoints

### 🚀 **Performance**

- **Redis Speed**: Sub-millisecond rate limit checks
- **Connection Pooling**: Reuses Redis connections efficiently
- **Graceful Degradation**: Falls back to memory if Redis is unavailable

### 📈 **Observability**

- **Centralized Logging**: All rate limit events logged with context
- **Store Type Tracking**: Logs whether using Redis or memory store
- **User Context**: Tracks authenticated users vs IP addresses

## Production Deployment

### Redis Setup

1. **Redis Installation**

   ```bash
   # Ubuntu/Debian
   sudo apt install redis-server

   # macOS
   brew install redis

   # Docker
   docker run -d -p 6379:6379 redis:alpine
   ```

2. **Redis Configuration**

   ```bash
   # /etc/redis/redis.conf
   maxmemory 256mb
   maxmemory-policy allkeys-lru
   save 900 1
   ```

3. **Environment Setup**

   ```bash
   # Production
   REDIS_URL=redis://prod-redis:6379

   # Staging
   REDIS_URL=redis://staging-redis:6379
   ```

### Monitoring

- Monitor Redis connection status in logs
- Track rate limit hits and store fallbacks
- Set up alerts for Redis downtime
- Monitor rate limit effectiveness against attacks

## Troubleshooting

### Redis Connection Issues

- Logs show "Redis not available, falling back to in-memory"
- Rate limiting still works but isn't distributed
- Check Redis server status and REDIS_URL

### High Rate Limit Hits

- Check logs for patterns in blocked requests
- Consider adjusting limits for specific endpoints
- Monitor for potential DDoS attacks

### Performance Issues

- Redis latency should be <1ms
- Check Redis memory usage and eviction
- Monitor connection pool status
