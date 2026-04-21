/**
 * Portable timestamp representation for shared core models.
 *
 * Firestore adapters should normalize native Timestamp values to one of these
 * portable shapes at the boundary.
 */
export type PortableTimestamp = Date | string;
