/**
 * @fileoverview Search Index Utility
 * @module @nxt1/backend/utils/search-index
 *
 * Utility for building and managing search indexes for Firestore documents.
 * Generates lowercase token arrays for efficient array-contains queries.
 */

/**
 * Normalize text for search indexing
 * - Convert to lowercase
 * - Remove special characters
 * - Trim whitespace
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .trim();
}

/**
 * Generate tokens from text
 * Creates both individual words and phrases
 */
function generateTokens(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const words = normalized.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];

  // Add individual words
  tokens.push(...words);

  // Add 2-word phrases
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]} ${words[i + 1]}`);
  }

  // Add 3-word phrases (if applicable)
  if (words.length >= 3) {
    for (let i = 0; i < words.length - 2; i++) {
      tokens.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
  }

  // Add full phrase if more than 1 word
  if (words.length > 1) {
    tokens.push(words.join(' '));
  }

  return tokens;
}

/**
 * Build search index from multiple text fields
 *
 * @param fields - Array of text strings to include in search index
 * @returns Array of lowercase search tokens for Firestore array-contains queries
 *
 * @example
 * ```typescript
 * const searchIndex = buildSearchIndex([
 *   user.displayName,
 *   user.sport,
 *   user.position,
 *   user.location,
 * ]);
 * // Returns: ["john", "smith", "john smith", "basketball", ...]
 * ```
 */
export function buildSearchIndex(fields: (string | undefined | null)[]): string[] {
  const allTokens = new Set<string>();

  for (const field of fields) {
    if (!field || typeof field !== 'string') continue;

    const tokens = generateTokens(field);
    tokens.forEach((token) => allTokens.add(token));
  }

  // Convert to array and sort for consistency
  return Array.from(allTokens).sort();
}

/**
 * Build search index for an athlete/user
 */
export function buildAthleteSearchIndex(data: {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  sport?: string;
  position?: string;
  location?: string;
  highSchool?: string;
  state?: string;
  city?: string;
}): string[] {
  return buildSearchIndex([
    data.displayName,
    data.firstName,
    data.lastName,
    `${data.firstName} ${data.lastName}`,
    data.sport,
    data.position,
    data.location,
    data.highSchool,
    data.city,
    data.state,
    data.city && data.state ? `${data.city} ${data.state}` : undefined,
  ]);
}

/**
 * Build search index for a college
 */
export function buildCollegeSearchIndex(data: {
  name?: string;
  location?: string;
  city?: string;
  state?: string;
  division?: string;
  conference?: string;
  sports?: string[];
}): string[] {
  const fields = [
    data.name,
    data.location,
    data.city,
    data.state,
    data.city && data.state ? `${data.city} ${data.state}` : undefined,
    data.division,
    data.conference,
    ...(data.sports || []),
  ];

  return buildSearchIndex(fields);
}

/**
 * Build search index for a team
 */
export function buildTeamSearchIndex(data: {
  name?: string;
  sport?: string;
  location?: string;
  city?: string;
  state?: string;
  teamType?: string;
}): string[] {
  return buildSearchIndex([
    data.name,
    data.sport,
    data.location,
    data.city,
    data.state,
    data.city && data.state ? `${data.city} ${data.state}` : undefined,
    data.teamType,
  ]);
}

/**
 * Build search index for a video
 */
export function buildVideoSearchIndex(data: {
  title?: string;
  description?: string;
  sport?: string;
  creatorName?: string;
  tags?: string[];
}): string[] {
  const fields = [data.title, data.description, data.sport, data.creatorName, ...(data.tags || [])];

  return buildSearchIndex(fields);
}

/**
 * Build search index for a camp
 */
export function buildCampSearchIndex(data: {
  name?: string;
  sport?: string;
  location?: string;
  city?: string;
  state?: string;
  description?: string;
}): string[] {
  return buildSearchIndex([
    data.name,
    data.sport,
    data.location,
    data.city,
    data.state,
    data.city && data.state ? `${data.city} ${data.state}` : undefined,
    data.description,
  ]);
}

/**
 * Build search index for an event
 */
export function buildEventSearchIndex(data: {
  name?: string;
  type?: string;
  sport?: string;
  location?: string;
  city?: string;
  state?: string;
  description?: string;
}): string[] {
  return buildSearchIndex([
    data.name,
    data.type,
    data.sport,
    data.location,
    data.city,
    data.state,
    data.city && data.state ? `${data.city} ${data.state}` : undefined,
    data.description,
  ]);
}

/**
 * Build search index for a scout report
 */
export function buildScoutReportSearchIndex(data: {
  athleteName?: string;
  eventName?: string;
  notes?: string;
  sport?: string;
  position?: string;
}): string[] {
  return buildSearchIndex([
    data.athleteName,
    data.eventName,
    data.notes,
    data.sport,
    data.position,
  ]);
}

/**
 * Build search index for a leaderboard
 */
export function buildLeaderboardSearchIndex(data: {
  name?: string;
  sport?: string;
  category?: string;
  region?: string;
}): string[] {
  return buildSearchIndex([data.name, data.sport, data.category, data.region]);
}

/**
 * Update search index for a document
 *
 * @param db - Firestore instance
 * @param collection - Collection name
 * @param docId - Document ID
 * @param buildFn - Function to build search index from document data
 */
export async function updateDocumentSearchIndex(
  db: FirebaseFirestore.Firestore,
  collection: string,
  docId: string,
  buildFn: (data: FirebaseFirestore.DocumentData) => string[]
): Promise<void> {
  const docRef = db.collection(collection).doc(docId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error(`Document ${collection}/${docId} not found`);
  }

  const data = doc.data();
  if (!data) return;

  const searchIndex = buildFn(data);

  await docRef.update({
    searchIndex,
    searchIndexUpdatedAt: new Date().toISOString(),
  });
}

/**
 * Batch update search indexes for a collection
 *
 * @param db - Firestore instance
 * @param collection - Collection name
 * @param buildFn - Function to build search index
 * @param batchSize - Number of documents to process per batch (default: 100)
 */
export async function batchUpdateSearchIndexes(
  db: FirebaseFirestore.Firestore,
  collection: string,
  buildFn: (data: FirebaseFirestore.DocumentData) => string[],
  batchSize: number = 100
): Promise<{ updated: number; errors: number }> {
  let updated = 0;
  let errors = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let query = db.collection(collection).limit(batchSize);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();

    if (snapshot.empty) break;

    const batch = db.batch();

    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        const searchIndex = buildFn(data);

        batch.update(doc.ref, {
          searchIndex,
          searchIndexUpdatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`Error processing ${collection}/${doc.id}:`, error);
        errors++;
      }
    }

    await batch.commit();
    updated += snapshot.size;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];

    console.log(`Updated ${updated} documents in ${collection}`);
  }

  return { updated, errors };
}
