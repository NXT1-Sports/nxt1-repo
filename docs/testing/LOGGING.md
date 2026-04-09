# Centralized Logging System

> **Enterprise-grade logging for NXT1 monorepo** - 100% production-ready with
> zero hardcoded values, following 2026 best practices.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│   Components - Log user actions, errors, events              │
├─────────────────────────────────────────────────────────────┤
│                      SERVICE LAYER                           │
│   LoggingService (Angular) - Orchestrates logging logic      │
├─────────────────────────────────────────────────────────────┤
│                 ⭐ @nxt1/core/logging ⭐                      │
│   Pure TypeScript - Logger, Transports, Types                │
├─────────────────────────────────────────────────────────────┤
│                   INFRASTRUCTURE LAYER                       │
│   Transports: Console, HTTP, Sentry, Analytics               │
└─────────────────────────────────────────────────────────────┘
```

### Package Structure

```
packages/core/src/logging/
├── index.ts                      # Main exports
├── types.ts                      # Types + LOGGING_DEFAULTS constants
├── logger.ts                     # Core logger implementation
└── transports/
    ├── index.ts                  # Transport exports
    ├── console.transport.ts      # Pretty console output
    ├── remote.transport.ts       # HTTP batch logging
    ├── sentry.transport.ts       # Error tracking adapter
    └── analytics.transport.ts    # Event tracking adapter
```

---

## Configuration Constants

All configuration values are centralized in `LOGGING_DEFAULTS`:

```typescript
import { LOGGING_DEFAULTS } from '@nxt1/core/logging';

export const LOGGING_DEFAULTS = {
  /** Remote transport batch size (number of logs before flush) */
  REMOTE_BATCH_SIZE: 10,

  /** Remote transport flush interval (milliseconds) */
  REMOTE_FLUSH_INTERVAL: 5000,

  /** Remote transport max retry attempts */
  REMOTE_MAX_RETRIES: 3,

  /** Remote transport base retry delay (milliseconds) */
  REMOTE_RETRY_DELAY: 1000,

  /** Maximum data size for log entries (bytes) */
  MAX_DATA_SIZE: 100 * 1024,

  /** Default namespace for logger instances */
  DEFAULT_NAMESPACE: 'App',
} as const;
```

**Benefits:**

- ✅ No magic numbers in codebase
- ✅ Easy to override per environment
- ✅ Centralized configuration management
- ✅ Type-safe with readonly protection

---

## Usage Patterns

### 1. Basic Logging (Pure TypeScript)

```typescript
import { createLogger, consoleTransport } from '@nxt1/core/logging';

const logger = createLogger({
  environment: 'development',
  minLevel: 'debug',
  enabled: true,
  transports: [consoleTransport({ colors: true })],
});

logger.info('Application started', { version: '1.0.0' });
logger.error('Failed to connect', error, { endpoint: '/api/users' });
```

### 2. Angular Service Usage (Web App)

```typescript
import { Component, inject } from '@angular/core';
import { LoggingService } from '../core/services/logging.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  template: `...`,
})
export class ProfileComponent {
  private readonly logger = inject(LoggingService).child('ProfileComponent');

  ngOnInit(): void {
    this.logger.info('Profile loaded', { userId: this.userId });
  }

  async saveProfile(): Promise<void> {
    try {
      await this.api.updateProfile(this.data);
      this.logger.info('Profile saved successfully');
    } catch (error) {
      this.logger.error('Failed to save profile', error, {
        profileId: this.data.id,
      });
    }
  }
}
```

### 3. Backend Usage (Node.js)

```typescript
import {
  createLogger,
  consoleTransport,
  remoteTransport,
} from '@nxt1/core/logging';

const logger = createLogger({
  environment: process.env.NODE_ENV || 'development',
  minLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  enabled: true,
  transports: [
    consoleTransport({ colors: true }),
    remoteTransport({
      endpoint: process.env.LOGGING_ENDPOINT!,
      headers: { 'x-api-key': process.env.API_KEY! },
    }),
  ],
});

export default logger;
```

### 4. Cloud Functions Usage

```typescript
import { createLogger, consoleTransport } from '@nxt1/core/logging';
import * as functions from 'firebase-functions';

const logger = createLogger({
  environment: 'production',
  minLevel: 'info',
  enabled: true,
  transports: [consoleTransport({ colors: false })], // GCP logs don't support colors
});

export const myFunction = functions.https.onCall(async (data, context) => {
  logger.info('Function invoked', { userId: context.auth?.uid });

  try {
    const result = await processData(data);
    logger.info('Function completed', { resultId: result.id });
    return result;
  } catch (error) {
    logger.error('Function failed', error, { data });
    throw new functions.https.HttpsError('internal', 'Processing failed');
  }
});
```

---

## Transport Configuration

### Console Transport (Development)

```typescript
import { consoleTransport } from '@nxt1/core/logging';

consoleTransport({
  colors: true, // Enable ANSI colors (Node.js only)
  prettyPrint: true, // Pretty-print objects
  timestamp: true, // Include timestamps
});
```

**Output Example:**

```
[2026-12-24 10:30:45.123] INFO [ProfileComponent] Profile loaded
  userId: "user-123"
```

### Remote Transport (Production)

```typescript
import { remoteTransport, LOGGING_DEFAULTS } from '@nxt1/core/logging';

remoteTransport({
  endpoint: 'https://backend.nxt1sports.com/api/v1/logs',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': environment.apiKey,
  },
  batchSize: LOGGING_DEFAULTS.REMOTE_BATCH_SIZE, // 10 logs
  flushInterval: LOGGING_DEFAULTS.REMOTE_FLUSH_INTERVAL, // 5 seconds
  maxRetries: LOGGING_DEFAULTS.REMOTE_MAX_RETRIES, // 3 attempts
  retryDelay: LOGGING_DEFAULTS.REMOTE_RETRY_DELAY, // 1 second base delay
});
```

**Features:**

- ✅ Batching - Reduces HTTP requests
- ✅ Retry logic - Exponential backoff
- ✅ Offline queue - Persists logs during network failures
- ✅ Deduplication - Prevents duplicate log entries

### Sentry Transport (Error Tracking)

```typescript
import { sentryTransport } from '@nxt1/core/logging';
import * as Sentry from '@sentry/angular';

sentryTransport({
  adapter: {
    captureException: Sentry.captureException,
    captureMessage: Sentry.captureMessage,
    setContext: Sentry.setContext,
    setUser: Sentry.setUser,
  },
  minLevel: 'warn', // Only send warnings and errors to Sentry
});
```

### Analytics Transport (Event Tracking)

```typescript
import { analyticsTransport } from '@nxt1/core/logging';
import { Analytics } from '@angular/fire/analytics';

analyticsTransport({
  adapter: {
    logEvent: (name: string, params?: Record<string, unknown>) => {
      analytics.logEvent(name, params);
    },
  },
  eventPrefix: 'app_', // Prefix all events with "app_"
});
```

---

## Environment Configuration

### Development Environment

```typescript
// apps/web/src/environments/environment.ts
export const environment = {
  production: false,
  logging: {
    enabled: true,
    minLevel: 'debug' as const,
    transports: ['console'],
  },
  loggingEndpoint: '', // No remote logging in dev
  sentryDsn: '', // No Sentry in dev
  version: '2.0.0-dev',
};
```

### Production Environment

```typescript
// apps/web/src/environments/environment.prod.ts
export const environment = {
  production: true,
  logging: {
    enabled: true,
    minLevel: 'info' as const,
    transports: ['console', 'remote', 'sentry', 'analytics'],
  },
  loggingEndpoint: 'https://backend.nxt1sports.com/api/v1/logs',
  sentryDsn: 'https://your-sentry-dsn@sentry.io/project-id',
  version: '2.0.0',
};
```

---

## Advanced Features

### Namespaced Loggers

```typescript
const parentLogger = inject(LoggingService);

// Create child logger with namespace
const childLogger = parentLogger.child('FeatureName');

childLogger.info('Message');
// Output: [FeatureName] Message

// Create nested namespace
const nestedLogger = childLogger.child('SubFeature');

nestedLogger.info('Message');
// Output: [FeatureName:SubFeature] Message
```

### Context Management

```typescript
const logger = inject(LoggingService);

// Set global context (persists across all logs)
logger.setContext({
  userId: 'user-123',
  sessionId: 'session-abc',
  environment: 'production',
});

logger.info('User action', { action: 'profile_update' });
// Output includes userId, sessionId, environment in every log
```

### Sensitive Data Redaction

```typescript
const logger = createLogger({
  environment: 'production',
  minLevel: 'info',
  enabled: true,
  transports: [consoleTransport()],
  redactFields: ['password', 'token', 'creditCard', 'ssn'], // Custom fields
});

logger.info('User login', {
  email: 'user@example.com',
  password: 'secret123', // Automatically redacted
  token: 'abc-def-ghi', // Automatically redacted
});

// Output:
// {
//   email: 'user@example.com',
//   password: '[REDACTED]',
//   token: '[REDACTED]'
// }
```

**Default Redacted Fields:**

- `password`, `token`, `accessToken`, `refreshToken`
- `apiKey`, `secret`, `authorization`, `cookie`
- `creditCard`, `ssn`, `cardNumber`, `cvv`, `pin`

### Data Truncation

Large data objects are automatically truncated to prevent memory issues:

```typescript
// Maximum data size: 100KB (configurable via LOGGING_DEFAULTS.MAX_DATA_SIZE)
logger.info('Large payload', {
  data: veryLargeObject, // Truncated if > 100KB
});

// Output:
// { data: "[TRUNCATED: original size 512KB]" }
```

---

## Integration Examples

### Global Error Handler

```typescript
// apps/web/src/app/core/infrastructure/error-handling/global-error-handler.ts
import { ErrorHandler, Injectable, inject, Injector } from '@angular/core';
import { LoggingService } from '../../services/logging.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly injector = inject(Injector);

  handleError(error: Error): void {
    // Lazy-load LoggingService to avoid circular dependencies
    const logger = this.injector.get(LoggingService);

    logger.fatal('Unhandled application error', error, {
      url: window.location.href,
      userAgent: navigator.userAgent,
    });

    // Re-throw in development for debugging
    if (!environment.production) {
      console.error('💥 Unhandled Error:', error);
    }
  }
}
```

### HTTP Interceptor

```typescript
// apps/web/src/app/core/infrastructure/http/logging.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { LoggingService } from '../../services/logging.service';
import { tap, catchError } from 'rxjs/operators';

export const loggingInterceptor: HttpInterceptorFn = (req, next) => {
  const logger = inject(LoggingService).child('HTTP');
  const startTime = Date.now();

  return next(req).pipe(
    tap((response) => {
      const duration = Date.now() - startTime;
      logger.debug('HTTP request completed', {
        method: req.method,
        url: req.url,
        status: response.status,
        duration,
      });
    }),
    catchError((error) => {
      const duration = Date.now() - startTime;
      logger.error('HTTP request failed', error, {
        method: req.method,
        url: req.url,
        status: error.status,
        duration,
      });
      throw error;
    })
  );
};
```

### Route Guard Logging

```typescript
// apps/web/src/app/core/auth/guards/auth.guard.ts
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { LoggingService } from '../../services/logging.service';

export const authGuard: CanActivateFn = (route, state) => {
  const logger = inject(LoggingService).child('AuthGuard');
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    logger.debug('Access granted', { path: state.url });
    return true;
  }

  logger.warn('Access denied - redirecting to login', {
    attemptedPath: state.url,
  });

  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
};
```

---

## Performance Considerations

### Log Levels by Environment

| Environment | Min Level | Transports                            | Purpose               |
| ----------- | --------- | ------------------------------------- | --------------------- |
| Development | `debug`   | Console only                          | Full visibility       |
| Staging     | `info`    | Console + Remote                      | Testing integrations  |
| Production  | `info`    | Console + Remote + Sentry + Analytics | Production monitoring |

### Async Transport Handling

All transports are processed asynchronously and never block your application:

```typescript
// Logger dispatches to transports without awaiting
logger.info('User action'); // Returns immediately

// Transport processes in background
remoteTransport.send(entry); // Non-blocking
```

### Batching Strategy

The remote transport batches logs to reduce HTTP overhead:

```typescript
// Flushes when either condition is met:
// 1. batchSize reached (default: 10 logs)
// 2. flushInterval elapsed (default: 5 seconds)
// 3. Browser beforeunload event (prevents data loss)
```

### Memory Management

```typescript
// Automatic cleanup prevents memory leaks:
// 1. Log queue has maximum size (default: 1000 entries)
// 2. Old entries are dropped when queue is full
// 3. Data truncation prevents large objects (default: 100KB)
```

---

## Testing

### Unit Testing (Pure Functions)

```typescript
// feature.service.spec.ts
import { createLogger, consoleTransport } from '@nxt1/core/logging';
import { vi } from 'vitest';

describe('FeatureService', () => {
  it('should log user actions', () => {
    const mockTransport = vi.fn();
    const logger = createLogger({
      environment: 'test',
      minLevel: 'debug',
      enabled: true,
      transports: [mockTransport],
    });

    logger.info('User action', { userId: 'user-123' });

    expect(mockTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        message: 'User action',
        data: { userId: 'user-123' },
      })
    );
  });
});
```

### Integration Testing (Angular)

```typescript
// component.spec.ts
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { LoggingService } from './core/services/logging.service';

describe('ProfileComponent', () => {
  let logger: { info: any; error: any; child: any };

  beforeEach(() => {
    logger = { info: vi.fn(), error: vi.fn(), child: vi.fn() };
    logger.child.mockReturnValue(logger);

    TestBed.configureTestingModule({
      providers: [{ provide: LoggingService, useValue: logger }],
    });
  });

  it('should log profile updates', () => {
    const component =
      TestBed.createComponent(ProfileComponent).componentInstance;
    component.saveProfile();

    expect(logger.info).toHaveBeenCalledWith('Profile saved successfully');
  });
});
```

---

## Migration Guide

### From Console.log

```typescript
// ❌ BEFORE: Unstructured logging
console.log('User logged in:', userId);
console.error('API error:', error);

// ✅ AFTER: Structured logging
logger.info('User logged in', { userId });
logger.error('API request failed', error, { endpoint: '/api/users' });
```

### From Custom Logger Service

```typescript
// ❌ BEFORE: Custom logger with hardcoded values
@Injectable()
export class OldLoggerService {
  log(message: string): void {
    if (environment.production) {
      fetch('https://api.example.com/logs', { // Hardcoded URL
        method: 'POST',
        body: JSON.stringify({ message }),
      });
    } else {
      console.log(message); // No structure
    }
  }
}

// ✅ AFTER: Centralized logger with configuration
import { LoggingService } from '@nxt1/core/services/logging.service';

@Component({...})
export class MyComponent {
  private readonly logger = inject(LoggingService).child('MyComponent');

  doSomething(): void {
    this.logger.info('Action performed', { actionId: '123' });
  }
}
```

---

## Best Practices

### ✅ DO

1. **Use namespaced loggers** for component-level logging

   ```typescript
   const logger = inject(LoggingService).child('ProfileComponent');
   ```

2. **Include context data** for debugging

   ```typescript
   logger.info('Profile updated', {
     userId,
     profileId,
     fields: ['name', 'email'],
   });
   ```

3. **Log errors with context**

   ```typescript
   logger.error('Failed to save', error, { attemptedData: data });
   ```

4. **Use appropriate log levels**
   - `debug` - Detailed debugging information
   - `info` - General informational messages
   - `warn` - Warning messages (recoverable issues)
   - `error` - Error messages (handled errors)
   - `fatal` - Critical errors (unrecoverable)

5. **Set global context early**
   ```typescript
   logger.setContext({ userId, sessionId, buildVersion });
   ```

### ❌ DON'T

1. **Don't log sensitive data directly**

   ```typescript
   // ❌ BAD
   logger.info('User credentials', { password: 'secret123' });

   // ✅ GOOD - Auto-redacted
   logger.info('User login', { email: 'user@example.com' });
   ```

2. **Don't use console.log in production code**

   ```typescript
   // ❌ BAD
   console.log('Debug info:', data);

   // ✅ GOOD
   logger.debug('Debug info', { data });
   ```

3. **Don't log in tight loops**

   ```typescript
   // ❌ BAD
   items.forEach((item) => logger.debug('Processing', { item }));

   // ✅ GOOD
   logger.debug('Processing batch', { count: items.length });
   ```

4. **Don't hardcode configuration values**

   ```typescript
   // ❌ BAD
   batchSize: 10,
   flushInterval: 5000,

   // ✅ GOOD
   batchSize: LOGGING_DEFAULTS.REMOTE_BATCH_SIZE,
   flushInterval: LOGGING_DEFAULTS.REMOTE_FLUSH_INTERVAL,
   ```

---

## Troubleshooting

### Logs Not Appearing in Console

**Problem:** No logs visible in development.

**Solution:**

```typescript
// Check environment configuration
console.log(environment.logging); // Should be { enabled: true, minLevel: 'debug' }

// Verify LoggingService is provided
// apps/web/src/app/app.config.ts
providers: [
  LoggingService, // Must be here
];
```

### Remote Logs Not Sending

**Problem:** Logs not reaching backend.

**Solution:**

```typescript
// 1. Verify endpoint configuration
console.log(environment.loggingEndpoint); // Should be valid URL

// 2. Check network requests in DevTools
// Look for POST requests to /api/v1/logs

// 3. Verify CORS headers on backend
app.use(
  cors({
    origin: ['https://nxt1sports.com'],
    credentials: true,
  })
);

// 4. Check backend logs for errors
```

### High Memory Usage

**Problem:** Browser tab consuming excessive memory.

**Solution:**

```typescript
// Reduce log data size
maxDataSize: LOGGING_DEFAULTS.MAX_DATA_SIZE / 2, // 50KB instead of 100KB

// Increase batch size to flush more frequently
batchSize: LOGGING_DEFAULTS.REMOTE_BATCH_SIZE / 2, // 5 instead of 10

// Disable debug logs in production
minLevel: 'info',
```

### SSR Errors

**Problem:** `window is not defined` errors during SSR.

**Solution:** The LoggingService is already SSR-safe with platform checks:

```typescript
private get isBrowser(): boolean {
  return isPlatformBrowser(this.platformId);
}
```

If you see SSR errors, ensure you're using LoggingService (not direct logger):

```typescript
// ✅ GOOD - SSR-safe
private readonly logger = inject(LoggingService);

// ❌ BAD - Not SSR-safe
import { createLogger } from '@nxt1/core/logging';
const logger = createLogger({...}); // Called at module load time
```

---

## API Reference

### Types

```typescript
/** Log severity levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Log entry structure */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  namespace?: string;
  correlationId?: string;
  context?: LogContext;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/** Logger configuration */
export interface LoggerConfig {
  environment: 'development' | 'staging' | 'production' | 'test';
  minLevel: LogLevel;
  enabled: boolean;
  transports: LogTransport[];
  defaultContext?: LogContext;
  redactFields?: string[];
  maxDataSize?: number;
}

/** Logger interface */
export interface ILogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: unknown, data?: Record<string, unknown>): void;
  fatal(message: string, error?: unknown, data?: Record<string, unknown>): void;
  child(namespace: string): ILogger;
  setContext(context: LogContext): void;
}
```

### Functions

```typescript
/** Create a logger instance */
export function createLogger(config: LoggerConfig, namespace?: string): ILogger;

/** Create a null logger (no-op) */
export function nullLogger(): ILogger;
```

### Constants

```typescript
/** Default configuration values */
export const LOGGING_DEFAULTS: {
  readonly REMOTE_BATCH_SIZE: 10;
  readonly REMOTE_FLUSH_INTERVAL: 5000;
  readonly REMOTE_MAX_RETRIES: 3;
  readonly REMOTE_RETRY_DELAY: 1000;
  readonly MAX_DATA_SIZE: 102400;
  readonly DEFAULT_NAMESPACE: 'App';
};

/** Log level priorities for filtering */
export const LOG_LEVEL_PRIORITY: {
  readonly debug: 0;
  readonly info: 1;
  readonly warn: 2;
  readonly error: 3;
  readonly fatal: 4;
};
```

---

## Summary

The NXT1 centralized logging system provides:

- ✅ **100% Production-Ready** - No hardcoded values, environment-driven
  configuration
- ✅ **Zero Dependencies** - Pure TypeScript core, portable across all platforms
- ✅ **Enterprise Features** - Batching, retry, redaction, namespaces, context
- ✅ **SSR-Safe** - Works seamlessly with Angular Universal
- ✅ **Mobile-Ready** - Shared core package for web + mobile apps
- ✅ **Best Practices 2026** - Structured logging, type-safe, async transports
- ✅ **Extensible** - Plugin architecture for custom transports
- ✅ **Performance-Optimized** - Async handling, batching, memory management

**Architecture follows NXT1 monorepo patterns:**

- Layer separation (presentation → service → core → infrastructure)
- Pure TypeScript in @nxt1/core for portability
- Angular service wrapper for DI integration
- Configuration over hardcoding
- Type safety throughout

---

## Support

For issues or questions:

1. Check this documentation
2. Review [ARCHITECTURE.md](../architecture/ARCHITECTURE.md)
3. Examine existing implementations in `apps/web/src/app/`
4. Create an issue in the repository

**Version:** 1.0.0  
**Last Updated:** 2026-12-24  
**Maintainer:** NXT1 Platform Team
