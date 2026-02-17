/**
 * @fileoverview Request Validation Middleware using Class-Validator
 * @module @nxt1/backend/middleware/validation
 *
 * Provides structured request validation using class-validator and class-transformer.
 * Replaces manual validation with type-safe, decorator-based validation.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { validate, ValidationError as ClassValidatorError } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { validationError } from '@nxt1/core/errors';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

/**
 * Class constructor type for validation DTOs
 */
type ClassConstructor<T = object> = new (...args: unknown[]) => T;

/**
 * Validation source (where to get data from request)
 */
type ValidationSource = 'body' | 'query' | 'params';

/**
 * Validation options
 */
interface ValidationOptions {
  /** Skip missing properties */
  skipMissingProperties?: boolean;
  /** Strip properties not defined in the DTO */
  whitelist?: boolean;
  /** Throw error if non-whitelisted properties are found */
  forbidNonWhitelisted?: boolean;
  /** Transform string values to appropriate types */
  transform?: boolean;
}

// ============================================
// DEFAULT OPTIONS
// ============================================

const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
  skipMissingProperties: false,
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
};

// ============================================
// VALIDATION MIDDLEWARE FACTORY
// ============================================

/**
 * Create validation middleware for a specific DTO class
 *
 * @param dtoClass - Class constructor for the DTO to validate
 * @param source - Where to get validation data (body, query, params)
 * @param options - Validation options
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import { validateRequest } from './middleware/validation.middleware';
 * import { CreatePostDto } from './dtos/create-post.dto';
 *
 * router.post('/posts',
 *   validateRequest(CreatePostDto, 'body'),
 *   async (req, res) => {
 *     // req.body is now typed as CreatePostDto and validated
 *     const post = req.body; // Type: CreatePostDto
 *   }
 * );
 * ```
 */
export function validateRequest<T extends object>(
  dtoClass: ClassConstructor<T>,
  source: ValidationSource = 'body',
  options: ValidationOptions = {}
): RequestHandler {
  const validationOptions = { ...DEFAULT_VALIDATION_OPTIONS, ...options };

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract data from request based on source
      const data = req[source];

      if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
        logger.warn('[Validation] Empty request data', {
          method: req.method,
          path: req.path,
          source,
        });

        throw validationError([
          {
            field: source,
            message: `${source} is required`,
            rule: 'required',
          },
        ]);
      }

      // Transform plain object to class instance
      const dto = plainToClass(dtoClass, data, {
        excludeExtraneousValues: validationOptions.whitelist,
      });

      // Validate the DTO
      const errors = await validate(dto, {
        skipMissingProperties: validationOptions.skipMissingProperties,
        whitelist: validationOptions.whitelist,
        forbidNonWhitelisted: validationOptions.forbidNonWhitelisted,
      });

      if (errors.length > 0) {
        logger.warn('[Validation] Validation failed', {
          method: req.method,
          path: req.path,
          source,
          errorCount: errors.length,
          errors: errors.map((err) => ({
            property: err.property,
            constraints: err.constraints,
            value: err.value,
          })),
        });

        // Convert class-validator errors to our error format
        const validationErrors = convertValidationErrors(errors);
        throw validationError(validationErrors);
      }

      // Replace request data with validated and transformed DTO
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any)[source] = dto;

      logger.debug('[Validation] Request validated successfully', {
        method: req.method,
        path: req.path,
        source,
        dtoClass: dtoClass.name,
      });

      next();
    } catch (error) {
      logger.error('[Validation] Validation middleware error', {
        method: req.method,
        path: req.path,
        source,
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  };
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Convert class-validator ValidationError to our error format
 */
function convertValidationErrors(
  errors: ClassValidatorError[]
): Array<{ field: string; message: string; rule: string }> {
  const result: Array<{ field: string; message: string; rule: string }> = [];

  function extractErrors(error: ClassValidatorError, parentPath: string = ''): void {
    const fieldPath = parentPath ? `${parentPath}.${error.property}` : error.property;

    // Extract constraint errors
    if (error.constraints) {
      Object.entries(error.constraints).forEach(([rule, message]) => {
        result.push({
          field: fieldPath,
          message,
          rule,
        });
      });
    }

    // Handle nested validation errors
    if (error.children && error.children.length > 0) {
      error.children.forEach((child) => extractErrors(child, fieldPath));
    }
  }

  errors.forEach((error) => extractErrors(error));
  return result;
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Validate request body
 */
export function validateBody<T extends object>(
  dtoClass: ClassConstructor<T>,
  options?: ValidationOptions
) {
  return validateRequest(dtoClass, 'body', options);
}

/**
 * Validate query parameters
 */
export function validateQuery<T extends object>(
  dtoClass: ClassConstructor<T>,
  options?: ValidationOptions
) {
  return validateRequest(dtoClass, 'query', options);
}

/**
 * Validate route parameters
 */
export function validateParams<T extends object>(
  dtoClass: ClassConstructor<T>,
  options?: ValidationOptions
) {
  return validateRequest(dtoClass, 'params', options);
}

// ============================================
// TYPE AUGMENTATION
// ============================================

/**
 * Extend Express Request type to support validated data
 * This helps with TypeScript auto-completion after validation
 */
// Note: ValidatedRequest interface is available for use in route files

// Augment Express types using module augmentation instead of namespace
declare module 'express-serve-static-core' {
  interface Request {
    /** Validated request body (set after validation middleware) */
    validatedBody?: Record<string, unknown>;
    /** Validated query parameters (set after validation middleware) */
    validatedQuery?: Record<string, unknown>;
    /** Validated route parameters (set after validation middleware) */
    validatedParams?: Record<string, unknown>;
  }
}
