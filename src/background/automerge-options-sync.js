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

/** Page size used by Raindrop pagination (mirrors mirror.js FETCH_PAGE_SIZE) */
const RAINDROP_PAGE_SIZE = 100;

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

const ACTOR_ID_PREFIX = 'nenya';

/**
 * Generate a random hexadecimal string.
 * @param {number} length
 * @returns {string}
 */
function generateRandomHex(length) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/**
 * Read the device id from options backup state when available.
 * @returns {Promise<string | null>}
 */
async function readDeviceIdFromState() {
  try {
    const result = await chrome.storage.local.get('optionsBackupState');
    const storedState = result?.optionsBackupState;
    const deviceId = storedState?.deviceId;
    if (typeof deviceId === 'string' && deviceId.trim()) {
      return deviceId.trim();
    }

    const generated = 'device-' + generateRandomHex(6);
    const nextState =
      storedState && typeof storedState === 'object'
        ? { ...storedState, deviceId: generated }
        : { deviceId: generated };
    await chrome.storage.local.set({ optionsBackupState: nextState });
    return generated;
  } catch (error) {
    console.warn('[automerge] Failed to read deviceId from state:', error);
  }
  return null;
}

// ============================================================================
// ACTOR ID MANAGEMENT
// ============================================================================

/**
 * Generate a unique actor ID for this browser instance.
 * Format: nenya-<deviceId>-<randomHex8>
 * @returns {Promise<string>}
 */
async function generateActorId() {
  const deviceId =
    (await readDeviceIdFromState()) ?? 'device-' + generateRandomHex(6);
  const sanitizedDeviceId =
    deviceId.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-') || 'device';
  const randomHex = generateRandomHex(8);
  return `${ACTOR_ID_PREFIX}-${sanitizedDeviceId}-${randomHex}`;
}

/**
 * Convert the readable actor id into a hex-only string acceptable by Automerge.
 * @param {string} actorId
 * @returns {string}
 */
function toHexActorId(actorId) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(actorId);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalize base64 data by stripping whitespace and padding to a valid length.
 * @param {string} data
 * @returns {string}
 */
function normalizeBase64(data) {
  const cleaned = (data || '').replace(/\s+/g, '');
  const pad = cleaned.length % 4;
  if (pad === 0) {
    return cleaned;
  }
  return cleaned + '='.repeat(4 - pad);
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
      // Check if it's a valid actor id (migration from old format)
      if (/^nenya-[\w-]+-[0-9a-f]{8}$/i.test(result.automergeActorId)) {
        return result.automergeActorId;
      } else {
        console.log('[automerge] Migrating from old actor ID format');
        // Old format detected, generate new actor ID using deviceId
        const newActorId = await generateActorId();
        await chrome.storage.local.set({ automergeActorId: newActorId });
        console.log('[automerge] Generated new actor ID:', newActorId);
        return newActorId;
      }
    }

    // Generate new actor ID
    const newActorId = await generateActorId();
    await chrome.storage.local.set({ automergeActorId: newActorId });
    console.log('[automerge] Generated new actor ID:', newActorId);
    return newActorId;
  } catch (error) {
    console.error('[automerge] Failed to load/create actor ID:', error);
    // Fallback to generating without persisting
    return await generateActorId();
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
 * Get the current automerge actor id for this device.
 * @returns {string | null}
 */
export function getAutomergeActorId() {
  return deviceActorId;
}

/**
 * Get the Automerge-safe hex actor id for this device.
 * @returns {string | null}
 */
function getAutomergeActorHex() {
  if (!deviceActorId) {
    return null;
  }
  return toHexActorId(deviceActorId);
}

/**
 * Create an empty Automerge document with default structure.
 * @param {string} actorId - Actor ID for this device
 * @returns {any}
 */
function createEmptyAutomergeDoc(actorId) {
  const actorHex = toHexActorId(actorId);
  return Automerge.from(
    {
      // Top-level keys match chrome.storage keys
      mirrorRootFolderSettings: {},
      notificationPreferences: {},
      autoReloadRules: [],
      darkModeRules: [],
      brightModeWhitelist: [],
      highlightTextRules: [],
      videoEnhancementRules: [],
      blockElementRules: [],
      customCodeRules: [],
      llmPrompts: [],
      urlProcessRules: [],
      autoGoogleLoginRules: [],
      screenshotSettings: { autoSave: false },
      pinnedShortcuts: [],

      // Metadata
      _meta: {
        version: AUTOMERGE_VERSION,
        devices: {
          [actorId]: { lastSeen: Date.now() },
        },
      },
    },
    { actor: actorHex },
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
        if (key.startsWith('_')) {
          continue; // Skip internal keys
        }

        const change = changes[key];
        if (!Object.prototype.hasOwnProperty.call(change, 'newValue')) {
          continue;
        }

        const value = change.newValue;

        // Propagate deletions/removals
        if (value === undefined) {
          delete doc[key];
          continue;
        }

        // Update the document with the new value (allow falsy/empty values)
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
 * Note: customCodeRules is stored in chrome.storage.local due to size limits,
 * while all other settings are stored in chrome.storage.sync.
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
    const syncUpdates = {};
    const localUpdates = {};
    /** @type {string[]} */
    const syncRemovals = [];
    /** @type {string[]} */
    const localRemovals = [];

    // Extract all top-level keys except metadata
    for (const key in docData) {
      if (key === '_meta') {
        continue; // Skip metadata
      }
      const value = docData[key];
      // customCodeRules goes to local storage due to size limits
      if (key === 'customCodeRules') {
        if (value === undefined) {
          localRemovals.push(key);
        } else {
          localUpdates[key] = value;
        }
      } else {
        if (value === undefined) {
          syncRemovals.push(key);
        } else {
          syncUpdates[key] = value;
        }
      }
    }

    // Apply to storage (sync and local separately)
    const promises = [];
    if (Object.keys(syncUpdates).length > 0) {
      promises.push(chrome.storage.sync.set(syncUpdates));
    }
    if (syncRemovals.length > 0) {
      promises.push(chrome.storage.sync.remove(syncRemovals));
    }
    if (Object.keys(localUpdates).length > 0) {
      promises.push(chrome.storage.local.set(localUpdates));
    }
    if (localRemovals.length > 0) {
      promises.push(chrome.storage.local.remove(localRemovals));
    }

    await Promise.all(promises);

    const allKeys = [
      ...Object.keys(syncUpdates),
      ...Object.keys(localUpdates),
      ...syncRemovals,
      ...localRemovals,
    ];
    console.log('[automerge] Applied document to storage:', allKeys);
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
        console.log(
          '[automerge] Created Automerge collection:',
          collection._id,
        );
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
 * Fetch all items from a collection, paging until exhausted.
 * @param {any} tokens
 * @param {number} collectionId
 * @returns {Promise<any[]>}
 */
async function fetchAllCollectionItems(tokens, collectionId) {
  /** @type {any[]} */
  const all = [];
  for (let page = 0; page < 50; page += 1) {
    const items = await fetchRaindropItems(tokens, collectionId, page);
    if (!items || items.length === 0) {
      break;
    }
    all.push(...items);
    if (items.length < RAINDROP_PAGE_SIZE) {
      break;
    }
  }
  return all;
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

  // Find existing item (all pages to avoid missing prior chunks)
  const items = await fetchAllCollectionItems(tokens, collectionId);
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

  // Fetch existing items (all pages)
  const items = await fetchAllCollectionItems(tokens, collectionId);
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
    const items = await fetchAllCollectionItems(tokens, collectionId);
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
 * @returns {Promise<{ doc: any | null, lastRemoteModifiedAt: number }>} Loaded document and timestamp metadata
 */
export async function loadDocFromRaindrop(actorId) {
  try {
    const actorHex = actorId ? toHexActorId(actorId) : undefined;
    const collectionId = await ensureAutomergeCollection();
    const tokens = await loadValidProviderTokens();
    if (!tokens) {
      throw new Error('Raindrop authentication required');
    }

    // Fetch all items from collection (ensure all chunks visible)
    const items = await fetchAllCollectionItems(tokens, collectionId);
    const lastRemoteModifiedAt = Math.max(
      0,
      ...items.map((item) => {
        const ts = Date.parse(item?.lastUpdate ?? '');
        return Number.isFinite(ts) ? ts : 0;
      }),
    );

    // Check for single item first
    const singleItem = items.find(
      (item) => item.title === AUTOMERGE_ITEM_TITLE,
    );
    if (singleItem && singleItem.excerpt) {
      console.log('[automerge] Found single item, loading...');
      return {
        doc: deserializeDoc(singleItem.excerpt, actorHex),
        lastRemoteModifiedAt,
      };
    }

    // Check for chunked items
    const chunks = items.filter((item) =>
      item.title.startsWith(AUTOMERGE_CHUNK_TITLE_PREFIX),
    );

    if (chunks.length === 0) {
      console.log('[automerge] No Automerge document found in Raindrop');
      return { doc: null, lastRemoteModifiedAt };
    }

    // Validate and reassemble chunks
    console.log('[automerge] Found', chunks.length, 'chunks, reassembling...');
    return {
      doc: reassembleAndDeserializeChunks(chunks, actorHex),
      lastRemoteModifiedAt,
    };
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
    const normalized = normalizeBase64(base64Data);

    // Decode Base64
    const binary = Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));

    // Load Automerge document
    // Use provided actor ID or let Automerge generate one
    const options = actorId ? { actor: toHexActorId(actorId) } : undefined;
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

    // Concatenate chunks (ensure excerpt exists)
    const base64Data = sortedChunks
      .map((chunk) => {
        if (typeof chunk.excerpt !== 'string') {
          throw new Error('Chunk missing excerpt data');
        }
        return chunk.excerpt;
      })
      .join('');
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
 * Ensure local storage values are applied to the Automerge document.
 * This is critical because storage changes might not have been captured
 * if the service worker restarted or wasn't initialized when changes occurred.
 * @returns {Promise<void>}
 */
async function ensureLocalStorageInDoc() {
  if (!localAutomergeDoc || !deviceActorId) {
    return;
  }

  try {
    // Read current local storage values
    const [syncStorage, localStorage] = await Promise.all([
      chrome.storage.sync.get(null),
      chrome.storage.local.get('customCodeRules'),
    ]);

    // Get current doc values for comparison
    const docData = JSON.parse(JSON.stringify(localAutomergeDoc));

    // Keys to sync from chrome.storage.sync
    const syncKeys = [
      'mirrorRootFolderSettings',
      'notificationPreferences',
      'autoReloadRules',
      'darkModeRules',
      'brightModeWhitelist',
      'highlightTextRules',
      'videoEnhancementRules',
      'blockElementRules',
      'llmPrompts',
      'urlProcessRules',
      'autoGoogleLoginRules',
      'screenshotSettings',
      'pinnedShortcuts',
    ];

    // Check if any values differ
    let hasChanges = false;
    for (const key of syncKeys) {
      const storageValue = syncStorage[key];
      const docValue = docData[key];
      if (
        storageValue !== undefined &&
        JSON.stringify(storageValue) !== JSON.stringify(docValue)
      ) {
        hasChanges = true;
        break;
      }
    }

    // Check customCodeRules (from local storage)
    const customCodeRules = localStorage.customCodeRules;
    if (
      customCodeRules !== undefined &&
      JSON.stringify(customCodeRules) !==
        JSON.stringify(docData.customCodeRules)
    ) {
      hasChanges = true;
    }

    if (!hasChanges) {
      console.log('[automerge] Local storage already in sync with document');
      return;
    }

    console.log('[automerge] Applying local storage changes to document...');

    // Apply changes using Automerge.change()
    const newDoc = Automerge.clone(localAutomergeDoc);
    localAutomergeDoc = Automerge.change(newDoc, (doc) => {
      for (const key of syncKeys) {
        const storageValue = syncStorage[key];
        if (storageValue !== undefined) {
          doc[key] = JSON.parse(JSON.stringify(storageValue));
        }
      }
      if (customCodeRules !== undefined) {
        doc.customCodeRules = JSON.parse(JSON.stringify(customCodeRules));
      }
      // Update device metadata
      if (doc._meta && doc._meta.devices && deviceActorId) {
        doc._meta.devices[deviceActorId] = { lastSeen: Date.now() };
      }
    });

    console.log('[automerge] Local storage changes applied to document');
  } catch (error) {
    console.error('[automerge] Failed to ensure local storage in doc:', error);
  }
}

/**
 * Calculate document size and chunk count for diagnostics.
 * @param {any} doc
 * @returns {{ documentSize: number, chunkCount: number }}
 */
function calculateDocMetrics(doc) {
  if (!doc) {
    return { documentSize: 0, chunkCount: 0 };
  }
  const binary = Automerge.save(doc);
  const base64 = btoa(String.fromCharCode(...binary));
  const chunkCount = Math.ceil(base64.length / RAINDROP_MAX_DESCRIPTION_LENGTH);
  return { documentSize: base64.length, chunkCount };
}

/**
 * Stamp the current device metadata onto a document.
 * @param {any} doc
 * @returns {any}
 */
function stampDeviceMetadata(doc) {
  if (!doc || !deviceActorId) {
    return doc;
  }
  try {
    const actorId = /** @type {string} */ (deviceActorId);
    return Automerge.change(doc, (mutable) => {
      if (mutable._meta && mutable._meta.devices) {
        mutable._meta.devices[actorId] = { lastSeen: Date.now() };
      }
    });
  } catch (error) {
    console.warn('[automerge] Failed to stamp device metadata:', error);
    return doc;
  }
}

/**
 * Perform sync with remote Raindrop document.
 * Merges local and remote documents using Automerge CRDT.
 * @param {{ forceRestore?: boolean, trigger?: string }} options - Sync options
 * @returns {Promise<{merged: boolean, conflictsResolved: number, documentSize: number, chunkCount: number, pulled: boolean, pushed: boolean, remoteLastModifiedAt?: number}>}
 */
export async function syncWithRemote(options = {}) {
  const { forceRestore = false, trigger = 'storage' } = options;
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
      pulled: false,
      pushed: false,
      remoteLastModifiedAt: 0,
    };
  }

  try {
    console.log('[automerge] Starting sync with remote...');

    // CRITICAL: If not doing force restore, ensure local storage values
    // are captured in the Automerge document before syncing.
    // This handles cases where storage changes weren't captured due to
    // service worker restart or initialization timing issues.
    if (!forceRestore) {
      await ensureLocalStorageInDoc();
    }

    // Load remote document
    // Load with random actor ID to avoid conflict with local document
    // when merging (we don't need to own the remote snapshot)
    const remoteResult = await loadDocFromRaindrop(undefined);
    const remoteDoc = remoteResult?.doc ?? null;
    const remoteLastModifiedAt = Number(
      remoteResult?.lastRemoteModifiedAt ?? 0,
    );

    if (!remoteDoc) {
      // No remote document exists, push local
      console.log('[automerge] No remote document, pushing local...');
      if (localAutomergeDoc) {
        localAutomergeDoc = stampDeviceMetadata(localAutomergeDoc);
        await saveDocToRaindrop(localAutomergeDoc);
      } else {
        // Create and push empty document
        localAutomergeDoc = createEmptyAutomergeDoc(deviceActorId);
        await saveDocToRaindrop(localAutomergeDoc);
      }

      // Calculate document info
      const metrics = calculateDocMetrics(localAutomergeDoc);

      return {
        merged: false,
        conflictsResolved: 0,
        documentSize: metrics.documentSize,
        chunkCount: metrics.chunkCount,
        pulled: false,
        pushed: true,
        remoteLastModifiedAt,
      };
    }

    if (forceRestore && remoteDoc) {
      // Force restore: replace local with remote without merging
      console.log('[automerge] Force restore: replacing local with remote');
      localAutomergeDoc = stampDeviceMetadata(remoteDoc);
      await applyDocToStorage(localAutomergeDoc, true);

      // Calculate document info
      const metrics = calculateDocMetrics(localAutomergeDoc);

      return {
        merged: false,
        conflictsResolved: 0,
        documentSize: metrics.documentSize,
        chunkCount: metrics.chunkCount,
        pulled: true,
        pushed: false,
        remoteLastModifiedAt,
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

    // Check what changed
    const remoteHistory = Automerge.getHistory(remoteDoc).length;
    const localHistory = localAutomergeDoc
      ? Automerge.getHistory(localAutomergeDoc).length
      : 0;
    const mergedHistory = Automerge.getHistory(mergedDoc).length;

    // Check if remote had changes we need to apply locally
    const remoteHadNewChanges = mergedHistory > localHistory;
    // Check if local has changes that need to be pushed to remote
    const localHasUnpushedChanges = mergedHistory > remoteHistory;

    const conflictsResolved = Math.max(
      0,
      mergedHistory - Math.max(localHistory, remoteHistory),
    );

    console.log('[automerge] History comparison:', {
      remoteHistory,
      localHistory,
      mergedHistory,
      remoteHadNewChanges,
      localHasUnpushedChanges,
    });

    // Update local document if merge produced changes or local doc was empty
    if (remoteHadNewChanges || localHasUnpushedChanges || !localAutomergeDoc) {
      localAutomergeDoc = mergedDoc;
    }

    // Stamp metadata for this device on the merged document
    localAutomergeDoc = stampDeviceMetadata(localAutomergeDoc);

    // Apply remote changes to local storage if any
    if (remoteHadNewChanges) {
      console.log('[automerge] Applying remote changes to local storage');
      await applyDocToStorage(localAutomergeDoc, true);
    }

    // Push to Raindrop if local has changes remote doesn't have
    if (localHasUnpushedChanges) {
      console.log('[automerge] Pushing local changes to Raindrop');
      await saveDocToRaindrop(localAutomergeDoc);
    }

    // Calculate document info
    const metrics = calculateDocMetrics(localAutomergeDoc);

    return {
      merged: remoteHadNewChanges || localHasUnpushedChanges,
      conflictsResolved,
      documentSize: metrics.documentSize,
      chunkCount: metrics.chunkCount,
      pulled: remoteHadNewChanges,
      pushed: localHasUnpushedChanges,
      remoteLastModifiedAt,
    };
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
    const collectionsResponse = await raindropRequest('/collections', tokens);

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
        videoEnhancementRules: storage.videoEnhancementRules || [],
        blockElementRules: storage.blockElementRules || [],
        customCodeRules: storage.customCodeRules || [],
        llmPrompts: storage.llmPrompts || [],
        urlProcessRules: storage.urlProcessRules || [],
        autoGoogleLoginRules: storage.autoGoogleLoginRules || [],
        screenshotSettings: storage.screenshotSettings || { autoSave: false },
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
    const remoteResult = await loadDocFromRaindrop(deviceActorId);
    const remoteDoc = remoteResult?.doc ?? null;

    if (remoteDoc) {
      console.log('[automerge] Loaded existing document from Raindrop');
      // Use remote document directly - trust remote as source of truth during initialization
      // Local changes are only tracked when user makes changes AFTER initialization
      // User should click "Backup Now" to push local changes before switching browsers
      localAutomergeDoc = stampDeviceMetadata(remoteDoc);
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
