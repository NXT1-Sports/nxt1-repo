/**
 * @fileoverview User Triggers - Barrel Export
 * @module @nxt1/functions/user
 *
 * Firestore triggers for user data changes.
 */

export { generateProfileSlug } from './generateProfileSlug';
export { onUserProfileUpdatedV2 } from './onUserProfileUpdated';
export { onUserDeletedV2 } from './onUserDeleted';
export { onUserCreatedV2 } from './onUserCreated';
export { generateUnicodeForUser, releaseUnicode } from './generateUnicode';
