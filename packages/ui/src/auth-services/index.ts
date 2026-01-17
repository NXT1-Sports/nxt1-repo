/**
 * @fileoverview Auth Services Module Exports
 * @module @nxt1/ui/auth-services
 *
 * This module provides authentication-related Angular services
 * that are shared across web and mobile applications.
 *
 * @example
 * ```typescript
 * import { AuthErrorHandler, type AuthError } from '@nxt1/ui/auth-services';
 *
 * @Injectable()
 * export class AuthFlowService {
 *   private readonly errorHandler = inject(AuthErrorHandler);
 *
 *   async signIn(email: string, password: string) {
 *     try {
 *       await this.firebase.signIn(email, password);
 *     } catch (err) {
 *       const error = this.errorHandler.handle(err);
 *       this.errorSignal.set(error.message);
 *     }
 *   }
 * }
 * ```
 */

export * from './auth-error.handler';
