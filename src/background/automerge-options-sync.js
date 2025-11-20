/* global chrome */

/**
 * @typedef {any} AutomergeDoc
 */

import * as Automerge from '../libs/automerge@3.2.0-mjs/entrypoints/fullfat_base64.js';

/**
 * Automerge-based Conflict-Free Options Sync
 *
 * This module provides conflict-free synchronization of extension options
 * using Automerge CRDTs. All feature options are consolidated into a single
 * Automerge document stored in Raindrop with automatic chunking support.
 *
 * Key Features:
 * - Conflict-free merging of concurrent edits across browsers
 * - Automatic chunking for large documents (Raindrop 10K char limit)
 * - Migration from old JSON-based backup format
 * - Device-specific actor IDs for change attribution
 */

import {
  loadValidProviderTokens,
  raindropRequest,
  fetchRaindropItems,
  pushNotification,
} from './mirror.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Collection name in Raindrop for storing Automerge documents */
const AUTOMERGE_COLLECTION_NAME = 'Nenya options backup';

/** Item title for non-chunked Automerge documents */
const AUTOMERGE_ITEM_TITLE = 'automerge-options-sync';

/** Item title prefix for chunked documents */
const AUTOMERGE_CHUNK_TITLE_PREFIX = 'automerge-options-sync-chunk-';

/** Maximum characters per Raindrop item description (hard limit) */
const RAINDROP_MAX_DESCRIPTION_LENGTH = 10000;

/** Automerge document format version */
const AUTOMERGE_VERSION = 2;

/** Tags for Automerge items in Raindrop */
const AUTOMERGE_TAGS = ['nenya', 'automerge', `version:${AUTOMERGE_VERSION}`];

// ============================================================================
// MODULE STATE
// ============================================================================

/** @type {any | null} In-memory Automerge document */
let localAutomergeDoc = null;

/** @type {string | null} Device-specific actor ID */
let deviceActorId = null;

/** @type {number | null} Raindrop collection ID for Automerge storage */
let automergeCollectionId = null;

/** @type {Promise<number> | null} Promise for ongoing collection check */
let ensureCollectionPromise = null;

/** @type {boolean} Whether the module has been initialized */
let isInitialized = false;

// ============================================================================
// ACTOR ID MANAGEMENT
// ============================================================================

/**
 * Generate a unique actor ID for this browser instance.
 * Format: 32 hex characters (128 bits of randomness)
 * @returns {string}
 */
function generateActorId() {
  // Generate a random 128-bit hex string (32 hex characters)
  // This ensures uniqueness across browser instances
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

/**
 * Load or create actor ID from storage.
 * @returns {Promise<string>}
 */
async function loadOrCreateActorId() {
  try {
    const result = await chrome.storage.local.get('automergeActorId');
    if (
      result.automergeActorId &&
      typeof result.automergeActorId === 'string'
    ) {
      // Check if it's a valid hex string (migration from old format)
      if (/^[0-9a-f]+$/i.test(result.automergeActorId)) {
        return result.automergeActorId;
      } else {
        console.log('[automerge] Migrating from old actor ID format');
        // Old format detected, generate new hex-only actor ID
        const newActorId = generateActorId();
        await chrome.storage.local.set({ automergeActorId: newActorId });
        console.log('[automerge] Generated new actor ID:', newActorId);
        return newActorId;
      }
    }

    // Generate new actor ID
    const newActorId = generateActorId();
    await chrome.storage.local.set({ automergeActorId: newActorId });
    console.log('[automerge] Generated new actor ID:', newActorId);
    return newActorId;
  } catch (error) {
    console.error('[automerge] Failed to load/create actor ID:', error);
    // Fallback to generating without persisting
    return generateActorId();
  }
}

// ============================================================================
// AUTOMERGE DOCUMENT OPERATIONS
// ============================================================================

/**
 * Get the current in-memory Automerge document.
 * @returns {any | null}
 */
export function getLocalAutomergeDoc() {
  return localAutomergeDoc;
}

/**
 * Create an empty Automerge document with default structure.
 * @param {string} actorId - Actor ID for this device
 * @returns {any}
 */
function createEmptyAutomergeDoc(actorId) {
  return Automerge.from(
    {
      // Top-level keys match chrome.storage keys
      mirrorRootFolderSettings: {},
      notificationPreferences: {},
      autoReloadRules: [],
      darkModeRules: [],
      brightModeWhitelist: [],
      highlightTextRules: [],
      blockElementRules: [],
      customCodeRules: [],
      llmPrompts: [],
      urlProcessRules: [],
      autoGoogleLoginRules: [],
      pinnedShortcuts: [],

      // Metadata
      _meta: {
        version: AUTOMERGE_VERSION,
        devices: {
          [actorId]: { lastSeen: Date.now() },
        },
      },
    },
    { actor: actorId },
  );
}

/**
 * Apply chrome.storage changes to the local Automerge document.
 * @param {Object.<string, any>} changes - Changes from chrome.storage.onChanged
 * @returns {Promise<void>}
 */
export async function applyStorageChangesToDoc(changes) {
  if (!localAutomergeDoc || !deviceActorId) {
    console.warn('[automerge] Cannot apply changes: not initialized');
    return;
  }

  try {
    const newDoc = Automerge.clone(localAutomergeDoc);
    localAutomergeDoc = Automerge.change(newDoc, (doc) => {
      for (const key in changes) {
        if (key.startsWith('_') || !changes[key].newValue) {
          continue; // Skip internal keys and deletions
        }

        const value = changes[key].newValue;

        // Update the document with the new value
        if (typeof value === 'object' && value !== null) {
          doc[key] = JSON.parse(JSON.stringify(value)); // Deep clone
        } else {
          doc[key] = value;
        }
      }

      // Update device metadata
      if (doc._meta && doc._meta.devices && deviceActorId) {
        doc._meta.devices[deviceActorId] = { lastSeen: Date.now() };
      }
    });

    console.log('[automerge] Applied storage changes to local document');
  } catch (error) {
    console.error('[automerge] Failed to apply storage changes:', error);
  }
}

/**
 * Apply Automerge document state to chrome.storage.
 * @param {any} doc - Automerge document
 * @param {boolean} suppressBackup - Whether to suppress backup triggers
 * @returns {Promise<void>}
 */
export async function applyDocToStorage(doc, suppressBackup = true) {
  if (!doc) {
    console.warn('[automerge] Cannot apply null document to storage');
    return;
  }

  try {
    const docData = JSON.parse(JSON.stringify(doc)); // Convert Automerge proxy to plain object
    const updates = {};

    // Extract all top-level keys except metadata
    for (const key in docData) {
      if (key === '_meta') {
        continue; // Skip metadata
      }
      updates[key] = docData[key];
    }

    // Apply to storage
    if (Object.keys(updates).length > 0) {
      await chrome.storage.sync.set(updates);
      console.log(
        '[automerge] Applied document to storage:',
        Object.keys(updates),
      );
    }
  } catch (error) {
    console.error('[automerge] Failed to apply document to storage:', error);
    throw error;
  }
}

// ============================================================================
// RAINDROP INTEGRATION
// ============================================================================

/**
 * Ensure the Automerge collection exists in Raindrop.
 * @returns {Promise<number>} Collection ID
 */
async function ensureAutomergeCollection() {
  if (automergeCollectionId !== null) {
    return automergeCollectionId;
  }

  if (ensureCollectionPromise) {
    return ensureCollectionPromise;
  }

  ensureCollectionPromise = (async () => {
    try {
      const tokens = await loadValidProviderTokens();
      if (!tokens) {
        throw new Error('Raindrop authentication required');
      }

      // Fetch all collections
      const collectionsResponse = await raindropRequest('/collections', tokens);

      const collections = Array.isArray(collectionsResponse?.items)
        ? collectionsResponse.items
        : [];

      // Find existing collection
      let collection = collections.find(
        (c) => c.title === AUTOMERGE_COLLECTION_NAME,
      );

      if (!collection) {
        // Create new collection
        const createResponse = await raindropRequest('/collection', tokens, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: AUTOMERGE_COLLECTION_NAME }),
        });

        if (!createResponse || !createResponse.item) {
          throw new Error('Failed to create Automerge collection');
        }

        collection = createResponse.item;
        console.log('[automerge] Created Automerge collection:', collection._id);
      }

      automergeCollectionId = collection._id;
      return automergeCollectionId ?? 0;
    } catch (error) {
      console.error('[automerge] Failed to ensure collection:', error);
      throw error;
    } finally {
      ensureCollectionPromise = null;
    }
  })();

  return ensureCollectionPromise;
}

/**
 * Serialize Automerge document and split into chunks if needed.
 * @param {any} doc - Automerge document
 * @returns {{ chunks: string[], totalLength: number }}
 */
function serializeAndChunkDoc(doc) {
  if (!doc) {
    throw new Error('Cannot serialize null document');
  }

  try {
    // Serialize to binary
    const binary = Automerge.save(doc);

    // Convert to Base64
    const base64 = btoa(String.fromCharCode(...binary));
    const totalLength = base64.length;

    console.log(
      '[automerge] Serialized document size:',
      totalLength,
      'characters',
    );

    // Check if chunking is needed
    if (totalLength <= RAINDROP_MAX_DESCRIPTION_LENGTH) {
      return { chunks: [base64], totalLength };
    }

    // Split into chunks
    const chunks = [];
    for (let i = 0; i < totalLength; i += RAINDROP_MAX_DESCRIPTION_LENGTH) {
      chunks.push(base64.substring(i, i + RAINDROP_MAX_DESCRIPTION_LENGTH));
    }

    console.log('[automerge] Document chunked into', chunks.length, 'parts');
    return { chunks, totalLength };
  } catch (error) {
    console.error('[automerge] Failed to serialize document:', error);
    throw error;
  }
}

/**
 * Save Automerge document to Raindrop (with automatic chunking).
 * @param {any} doc - Automerge document to save
 * @returns {Promise<void>}
 */
export async function saveDocToRaindrop(doc) {
  if (!doc) {
    throw new Error('Cannot save null document');
  }

  try {
    const collectionId = await ensureAutomergeCollection();
    const tokens = await loadValidProviderTokens();
    if (!tokens) {
      throw new Error('Raindrop authentication required');
    }

    // Serialize and chunk
    const { chunks, totalLength } = serializeAndChunkDoc(doc);

    console.log('[automerge] Saving document:', {
      chunks: chunks.length,
      totalSize: totalLength,
    });

    if (chunks.length === 1) {
      // Single item (no chunking)
      await saveSingleItem(tokens, collectionId, chunks[0]);
    } else {
      // Multiple chunks
      await saveChunkedItems(tokens, collectionId, chunks);
    }

    console.log('[automerge] Document saved successfully');
  } catch (error) {
    console.error('[automerge] Failed to save document:', error);
    throw error;
  }
}

/**
 * Save a single (non-chunked) Automerge document to Raindrop.
 * @param {Object} tokens - Raindrop tokens
 * @param {number} collectionId - Collection ID
 * @param {string} base64Data - Base64-encoded document
 * @returns {Promise<void>}
 */
async function saveSingleItem(tokens, collectionId, base64Data) {
  // Safety check
  if (base64Data.length > RAINDROP_MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      `Description too long: ${base64Data.length} > ${RAINDROP_MAX_DESCRIPTION_LENGTH}`,
    );
  }

  // Find existing item
  const items = await fetchRaindropItems(tokens, collectionId, 0);
  const existing = items.find((item) => item.title === AUTOMERGE_ITEM_TITLE);

  if (existing) {
    // Update existing
    await raindropRequest(`/raindrop/${existing._id}`, tokens, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excerpt: base64Data,
        tags: AUTOMERGE_TAGS,
      }),
    });
    console.log('[automerge] Updated single item:', existing._id);
  } else {
    // Create new
    await raindropRequest('/raindrop', tokens, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        link: 'https://nenya.local/automerge-options-sync',
        title: AUTOMERGE_ITEM_TITLE,
        excerpt: base64Data,
        collectionId,
        tags: AUTOMERGE_TAGS,
      }),
    });
    console.log('[automerge] Created single item');
  }

  // Clean up any old chunks
  await cleanupObsoleteChunks(tokens, collectionId, 0);
}

/**
 * Save a chunked Automerge document to Raindrop.
 * @param {Object} tokens - Raindrop tokens
 * @param {number} collectionId - Collection ID
 * @param {string[]} chunks - Array of Base64 chunks
 * @returns {Promise<void>}
 */
async function saveChunkedItems(tokens, collectionId, chunks) {
  const totalChunks = chunks.length;
  const chunkTags = [
    ...AUTOMERGE_TAGS,
    'chunked',
    `total-chunks:${totalChunks}`,
  ];

  // Fetch existing items
  const items = await fetchRaindropItems(tokens, collectionId, 0);
  const existingChunks = items.filter((item) =>
    item.title.startsWith(AUTOMERGE_CHUNK_TITLE_PREFIX),
  );

  // Save each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunkNumber = i + 1;
    const title = `${AUTOMERGE_CHUNK_TITLE_PREFIX}${chunkNumber}`;
    const chunk = chunks[i];

    // Safety check
    if (chunk.length > RAINDROP_MAX_DESCRIPTION_LENGTH) {
      throw new Error(
        `Chunk ${chunkNumber} too long: ${chunk.length} > ${RAINDROP_MAX_DESCRIPTION_LENGTH}`,
      );
    }

    const existing = existingChunks.find((item) => item.title === title);

    if (existing) {
      // Update existing chunk
      await raindropRequest(`/raindrop/${existing._id}`, tokens, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          excerpt: chunk,
          tags: chunkTags,
        }),
      });
      console.log('[automerge] Updated chunk:', chunkNumber);
    } else {
      // Create new chunk
      await raindropRequest('/raindrop', tokens, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link: `https://nenya.local/automerge-options-sync-chunk-${chunkNumber}`,
          title,
          excerpt: chunk,
          collectionId,
          tags: chunkTags,
        }),
      });
      console.log('[automerge] Created chunk:', chunkNumber);
    }
  }

  // Clean up obsolete single item if it exists
  const singleItem = items.find((item) => item.title === AUTOMERGE_ITEM_TITLE);
  if (singleItem) {
    await raindropRequest(`/raindrop/${singleItem._id}`, tokens, {
      method: 'DELETE',
    });
    console.log('[automerge] Deleted obsolete single item');
  }

  // Clean up extra chunks
  await cleanupObsoleteChunks(tokens, collectionId, totalChunks);
}

/**
 * Clean up obsolete chunks from Raindrop.
 * @param {Object} tokens - Raindrop tokens
 * @param {number} collectionId - Collection ID
 * @param {number} keepCount - Number of chunks to keep (0 = delete all)
 * @returns {Promise<void>}
 */
async function cleanupObsoleteChunks(tokens, collectionId, keepCount) {
  try {
    const items = await fetchRaindropItems(tokens, collectionId, 0);
    const chunks = items.filter((item) =>
      item.title.startsWith(AUTOMERGE_CHUNK_TITLE_PREFIX),
    );

    for (const chunk of chunks) {
      // Extract chunk number from title
      const match = chunk.title.match(/chunk-(\d+)$/);
      if (!match) continue;

      const chunkNumber = parseInt(match[1], 10);
      if (chunkNumber > keepCount) {
        await raindropRequest(`/raindrop/${chunk._id}`, tokens, {
          method: 'DELETE',
        });
        console.log('[automerge] Deleted obsolete chunk:', chunkNumber);
      }
    }
  } catch (error) {
    console.warn('[automerge] Failed to cleanup obsolete chunks:', error);
    // Non-fatal error, continue
  }
}

/**
 * Load Automerge document from Raindrop (with automatic chunk reassembly).
 * @param {string} [actorId] - Actor ID to use for the loaded document (default: generate random)
 * @returns {Promise<any | null>} Loaded document or null if not found
 */
export async function loadDocFromRaindrop(actorId) {
  try {
    const collectionId = await ensureAutomergeCollection();
    const tokens = await loadValidProviderTokens();
    if (!tokens) {
      throw new Error('Raindrop authentication required');
    }

    // Fetch all items from collection
    const items = await fetchRaindropItems(tokens, collectionId, 0);

    // Check for single item first
    const singleItem = items.find(
      (item) => item.title === AUTOMERGE_ITEM_TITLE,
    );
    if (singleItem && singleItem.excerpt) {
      console.log('[automerge] Found single item, loading...');
      return deserializeDoc(singleItem.excerpt, actorId);
    }

    // Check for chunked items
    const chunks = items.filter((item) =>
      item.title.startsWith(AUTOMERGE_CHUNK_TITLE_PREFIX),
    );

    if (chunks.length === 0) {
      console.log('[automerge] No Automerge document found in Raindrop');
      return null;
    }

    // Validate and reassemble chunks
    console.log('[automerge] Found', chunks.length, 'chunks, reassembling...');
    return reassembleAndDeserializeChunks(chunks, actorId);
  } catch (error) {
    console.error('[automerge] Failed to load document from Raindrop:', error);
    throw error;
  }
}

/**
 * Deserialize a Base64-encoded Automerge document.
 * @param {string} base64Data - Base64-encoded document
 * @param {string} [actorId] - Actor ID to use
 * @returns {any} Automerge document
 */
function deserializeDoc(base64Data, actorId) {
  try {
    // Decode Base64
    const binary = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    // Load Automerge document
    // Use provided actor ID or let Automerge generate one
    const options = actorId ? { actor: actorId } : undefined;
    const doc = Automerge.load(binary, options);
    console.log('[automerge] Document deserialized successfully');
    return doc;
  } catch (error) {
    console.error('[automerge] Failed to deserialize document:', error);
    throw error;
  }
}

/**
 * Reassemble chunks and deserialize Automerge document.
 * @param {Array<{title: string, excerpt: string, tags: string[]}>} chunks - Chunk items
 * @param {string} [actorId] - Actor ID to use
 * @returns {any} Automerge document
 */
function reassembleAndDeserializeChunks(chunks, actorId) {
  try {
    // Extract total chunks from tags
    const firstChunk = chunks[0];
    const totalChunksTag = firstChunk.tags?.find((tag) =>
      tag.startsWith('total-chunks:'),
    );
    if (!totalChunksTag) {
      throw new Error('Missing total-chunks tag on chunk');
    }

    const totalChunks = parseInt(totalChunksTag.split(':')[1], 10);
    if (chunks.length !== totalChunks) {
      throw new Error(
        `Missing chunks: found ${chunks.length}, expected ${totalChunks}`,
      );
    }

    // Sort chunks by number
    const sortedChunks = chunks.sort((a, b) => {
      const aMatch = a.title.match(/chunk-(\d+)$/);
      const bMatch = b.title.match(/chunk-(\d+)$/);
      if (!aMatch || !bMatch) return 0;
      const aNum = parseInt(aMatch[1], 10);
      const bNum = parseInt(bMatch[1], 10);
      return aNum - bNum;
    });

    // Verify integrity
    for (let i = 0; i < totalChunks; i++) {
      const expectedNum = i + 1;
      const match = sortedChunks[i].title.match(/chunk-(\d+)$/);
      if (!match) {
        throw new Error(`Invalid chunk format at index ${i}`);
      }
      const actualNum = parseInt(match[1], 10);
      if (expectedNum !== actualNum) {
        throw new Error(`Missing chunk ${expectedNum}`);
      }
    }

    // Concatenate chunks
    const base64Data = sortedChunks.map((chunk) => chunk.excerpt).join('');
    console.log(
      '[automerge] Reassembled',
      totalChunks,
      'chunks, total length:',
      base64Data.length,
    );

    // Deserialize
    return deserializeDoc(base64Data, actorId);
  } catch (error) {
    console.error('[automerge] Failed to reassemble chunks:', error);
    throw error;
  }
}

// ============================================================================
// SYNC AND MERGE LOGIC
// ============================================================================

/**
 * Perform sync with remote Raindrop document.
 * Merges local and remote documents using Automerge CRDT.
 * @param {{ forceRestore?: boolean }} options - Sync options
 * @returns {Promise<{merged: boolean, conflictsResolved: number, documentSize: number, chunkCount: number}>}
 */
export async function syncWithRemote(options = {}) {
  // Ensure initialization before sync
  if (!isInitialized) {
    await initializeAutomergeSync();
  }

  if (!deviceActorId) {
    throw new Error('Automerge sync not initialized');
  }

  // Check if we have Raindrop tokens before attempting sync
  const tokens = await loadValidProviderTokens();
  if (!tokens) {
    console.log('[automerge] Skipping sync - no Raindrop authentication');
    // Return a default result indicating no sync occurred
    return {
      merged: false,
      conflictsResolved: 0,
      documentSize: 0,
      chunkCount: 0,
    };
  }

  try {
    console.log('[automerge] Starting sync with remote...');

    // Load remote document
    // Load with random actor ID to avoid conflict with local document
    // when merging (we don't need to own the remote snapshot)
    const remoteDoc = await loadDocFromRaindrop(undefined);

    if (!remoteDoc) {
      // No remote document exists, push local
      console.log('[automerge] No remote document, pushing local...');
      if (localAutomergeDoc) {
        await saveDocToRaindrop(localAutomergeDoc);
      } else {
        // Create and push empty document
        localAutomergeDoc = createEmptyAutomergeDoc(deviceActorId);
        await saveDocToRaindrop(localAutomergeDoc);
      }

      // Calculate document info
      const binary = Automerge.save(localAutomergeDoc);
      const base64 = btoa(String.fromCharCode(...binary));
      const chunkCount = Math.ceil(
        base64.length / RAINDROP_MAX_DESCRIPTION_LENGTH,
      );

      return {
        merged: false,
        conflictsResolved: 0,
        documentSize: base64.length,
        chunkCount,
      };
    }

    if (options.forceRestore && remoteDoc) {
      // Force restore: replace local with remote without merging
      console.log('[automerge] Force restore: replacing local with remote');
      localAutomergeDoc = remoteDoc;
      await applyDocToStorage(localAutomergeDoc, true);

      // Calculate document info
      const binary = Automerge.save(localAutomergeDoc);
      const base64 = btoa(String.fromCharCode(...binary));
      const chunkCount = Math.ceil(
        base64.length / RAINDROP_MAX_DESCRIPTION_LENGTH,
      );

      return {
        merged: false,
        conflictsResolved: 0,
        documentSize: base64.length,
        chunkCount,
      };
    }

    // Merge documents
    console.log('[automerge] Merging local and remote documents...');

    // Clone local document to avoid "out of date" errors, as merge freezes inputs
    // See: https://github.com/automerge/automerge/issues/553#issuecomment-1342037962
    const baseDoc = localAutomergeDoc
      ? Automerge.clone(localAutomergeDoc)
      : Automerge.clone(remoteDoc);

    const mergedDoc = Automerge.merge(baseDoc, remoteDoc);

    // Check if anything changed
    const localHistory = localAutomergeDoc
      ? Automerge.getHistory(localAutomergeDoc).length
      : 0;
    const mergedHistory = Automerge.getHistory(mergedDoc).length;
    const conflictsResolved = Math.max(0, mergedHistory - localHistory - 1);

    if (mergedHistory !== localHistory && localAutomergeDoc) {
      console.log('[automerge] Changes detected after merge');
      localAutomergeDoc = mergedDoc;

      // Apply to storage
      await applyDocToStorage(localAutomergeDoc, true);

      // Save back to Raindrop
      await saveDocToRaindrop(localAutomergeDoc);

      // Calculate document info
      const binary = Automerge.save(localAutomergeDoc);
      const base64 = btoa(String.fromCharCode(...binary));
      const chunkCount = Math.ceil(
        base64.length / RAINDROP_MAX_DESCRIPTION_LENGTH,
      );

      return {
        merged: true,
        conflictsResolved,
        documentSize: base64.length,
        chunkCount,
      };
    } else {
      console.log('[automerge] No changes after merge');

      // Calculate document info
      const binary = Automerge.save(localAutomergeDoc);
      const base64 = btoa(String.fromCharCode(...binary));
      const chunkCount = Math.ceil(
        base64.length / RAINDROP_MAX_DESCRIPTION_LENGTH,
      );

      return {
        merged: false,
        conflictsResolved: 0,
        documentSize: base64.length,
        chunkCount,
      };
    }
  } catch (error) {
    console.error('[automerge] Sync failed:', error);
    throw error;
  }
}

// ============================================================================
// MIGRATION FROM OLD FORMAT
// ============================================================================

/**
 * Detect if old JSON-based backup exists.
 * @returns {Promise<boolean>}
 */
async function detectOldBackupFormat() {
  try {
    const tokens = await loadValidProviderTokens();
    if (!tokens) {
      return false;
    }

    // Fetch all collections
    const collectionsResponse = await raindropRequest(
      '/collections',
      tokens,
    );

    const collections = Array.isArray(collectionsResponse?.items)
      ? collectionsResponse.items
      : [];
    const oldCollection = collections.find((c) => c.title === 'Options backup');

    if (!oldCollection) {
      return false;
    }

    // Check if collection has items
    const items = await fetchRaindropItems(tokens, oldCollection._id, 0);
    return items.length > 0;
  } catch (error) {
    console.warn('[automerge] Failed to detect old backup format:', error);
    return false;
  }
}

/**
 * Migrate from old JSON-based backup to Automerge.
 * Creates new document from current chrome.storage values.
 * @returns {Promise<void>}
 */
async function migrateFromOldFormat() {
  try {
    console.log('[automerge] Starting migration from old format...');

    // Load current storage values (most recent local state)
    const storage = await chrome.storage.sync.get(null);

    // Create new Automerge document
    localAutomergeDoc = Automerge.from(
      {
        mirrorRootFolderSettings: storage.mirrorRootFolderSettings || {},
        notificationPreferences: storage.notificationPreferences || {},
        autoReloadRules: storage.autoReloadRules || [],
        darkModeRules: storage.darkModeRules || [],
        brightModeWhitelist: storage.brightModeWhitelist || [],
        highlightTextRules: storage.highlightTextRules || [],
        blockElementRules: storage.blockElementRules || [],
        customCodeRules: storage.customCodeRules || [],
        llmPrompts: storage.llmPrompts || [],
        urlProcessRules: storage.urlProcessRules || [],
        autoGoogleLoginRules: storage.autoGoogleLoginRules || [],
        pinnedShortcuts: storage.pinnedShortcuts || [],
        _meta: {
          version: AUTOMERGE_VERSION,
          migrated: true,
          migratedAt: Date.now(),
          devices: (() => {
            const devices = {};
            if (deviceActorId) {
              devices[deviceActorId] = { lastSeen: Date.now() };
            }
            return devices;
          })(),
        },
      },
      { actor: deviceActorId },
    );

    // Save to Raindrop
    await saveDocToRaindrop(localAutomergeDoc);

    console.log('[automerge] Migration completed successfully');
  } catch (error) {
    console.error('[automerge] Migration failed:', error);
    throw error;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize Automerge sync system.
 * Loads actor ID, creates/loads document, and performs migration if needed.
 * @returns {Promise<void>}
 */
export async function initializeAutomergeSync() {
  if (isInitialized) {
    console.log('[automerge] Already initialized');
    return;
  }

  try {
    console.log('[automerge] Initializing...');

    // Load actor ID
    deviceActorId = await loadOrCreateActorId();
    console.log('[automerge] Actor ID:', deviceActorId);

    // Check if we have Raindrop tokens before trying to load remote document
    const tokens = await loadValidProviderTokens();
    if (!tokens) {
      console.log(
        '[automerge] No Raindrop tokens available, creating empty document',
      );
      localAutomergeDoc = createEmptyAutomergeDoc(deviceActorId);
      isInitialized = true;
      console.log('[automerge] Initialization complete (no authentication)');
      return;
    }

    // Try to load existing remote document
    console.log('[automerge] Attempting to load document from Raindrop...');
    const remoteDoc = await loadDocFromRaindrop(deviceActorId);

    if (remoteDoc) {
      console.log('[automerge] Loaded existing document from Raindrop');
      localAutomergeDoc = remoteDoc;
    } else {
      // Check if migration is needed
      const hasOldBackup = await detectOldBackupFormat();
      if (hasOldBackup) {
        console.log('[automerge] Old backup detected, performing migration...');
        await migrateFromOldFormat();
      } else {
        // Create empty document
        console.log('[automerge] Creating new empty document');
        localAutomergeDoc = createEmptyAutomergeDoc(deviceActorId);
        await saveDocToRaindrop(localAutomergeDoc);
      }
    }

    isInitialized = true;
    console.log('[automerge] Initialization complete');
  } catch (error) {
    console.error('[automerge] Initialization failed:', error);

    // Create a local document so the extension can continue working
    if (!localAutomergeDoc && deviceActorId) {
      localAutomergeDoc = createEmptyAutomergeDoc(deviceActorId);
      console.log(
        '[automerge] Created empty document as fallback (error: ' +
          error.message +
          ')',
      );
    }

    // Mark as initialized to prevent repeated attempts
    isInitialized = true;
    console.log(
      '[automerge] Initialization complete (with errors, working in offline mode)',
    );
  }
}

// Note: Functions are exported inline above