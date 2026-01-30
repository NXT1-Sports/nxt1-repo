/**
 * @fileoverview Email Functions - Barrel Export
 * @module @nxt1/functions/email
 *
 * Transactional and marketing email functionality.
 * Only export Cloud Functions here - helpers are internal.
 */

// Cloud Functions only (Firebase loader expects these)
export { sendEmail } from './sendEmail';
export { processEmailQueue } from './processEmailQueue';
