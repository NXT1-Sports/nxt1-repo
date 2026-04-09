/**
 * @fileoverview User Triggers - Barrel Export
 * @module @nxt1/functions/user
 *
 * Firestore triggers for user data changes.
 */

export { generateProfileSlug } from './generateProfileSlug';
export { onUserProfileUpdatedV3 } from './onUserProfileUpdated';
export { onUserDeletedV3 } from './onUserDeleted';
export { onUserCreatedV3 } from './onUserCreated';
export { generateUnicodeForUser, releaseUnicode } from './generateUnicode';
