# Backup Performance Optimization

## Overview

This document describes the performance optimization for Raindrop backup operations, specifically reducing the number of HTTP requests during full backups by batching multiple category updates into bulk API calls.

## Problem

Previously, each backup operation for all 7 categories would result in:
- 2 GET requests (fetch collections)
- 1 GET request (load existing backup items with pagination)
- **7 individual PUT/POST requests** (one per category)
- **Total: ~10+ requests per backup**

For categories with chunked data (> 10,000 chars), additional requests were needed:
- DELETE requests for obsolete chunks
- Multiple PUT/POST requests per category

## Solution

Batch all category backup operations into bulk API calls using Raindrop's multiple raindrops endpoints:
- `POST /raindrops` - Create many raindrops (max 100 items)
- `PUT /raindrops/{collectionId}` - Update many raindrops
- `DELETE /raindrops/{collectionId}` - Remove many raindrops

### Optimization Strategy (Implemented)

**Simple and Effective Approach:**
1. **Ensure collection exists** (1-3 requests, mostly one-time)
2. **Fetch all existing backup items** (1+ requests for pagination)
3. **Delete ALL existing items** in one bulk request
4. **Create ALL new items** in batches of 100

This "delete-all, create-all" approach is simpler than trying to update individual items because:
- Raindrop's bulk update API doesn't support updating `note` and `excerpt` fields
- No need to track which items changed
- Clean state on each backup
- Easier error recovery

### Improved Request Flow (Implemented)

**Phase 1: Ensure Collection Exists**
1. GET `/collections` - Fetch root collections (parallel with next)
2. GET `/collections/childrens` - Fetch child collections (parallel with above)
3. POST `/collection` - Create backup collection (only if doesn't exist, first-time only)

**Phase 2: Load Existing Items**
4. GET `/raindrops/{collectionId}?perpage=100&page=0` - Fetch existing items
5. GET `/raindrops/{collectionId}?perpage=100&page=1` - Continue if needed (rare)

**Phase 3: Batch Delete All Existing**
6. DELETE `/raindrops/{collectionId}` with `ids` array - Delete ALL existing in one request

**Phase 4: Batch Create All New**
7. POST `/raindrops` with `items` array - Create all items (max 100 per batch)
   - If > 100 items total: multiple POST requests (e.g., 7 categories usually = 7 items = 1 request)
   - If chunked data: might need 2-3 batches total

**Typical Request Counts:**
- **First-time backup** (no existing items): 
  - 2 GET (collections) + 1 POST (create collection) + 1 GET (items) + 1 POST (create items) = **5 requests**
- **Subsequent backup** (7 existing items): 
  - 2 GET (collections) + 1 GET (items) + 1 DELETE (all) + 1 POST (create all) = **5 requests**
- **With large chunked data** (e.g., 250 items):
  - 2 GET (collections) + 2 GET (items pagination) + 1 DELETE (all) + 3 POST (100+100+50) = **8 requests**

**OLD approach was:**
- 2 GET (collections) + 1 GET (items) + 7 individual PUTs + checking/deleting obsolete chunks = **15-20+ requests**

## Performance Gains (Implemented)

| Scenario | Old Approach | New Approach | Improvement |
|----------|-------------|--------------|-------------|
| First-time backup (7 categories, no chunks) | 11 requests | 5 requests | **55% reduction** |
| Subsequent backup (7 categories, no chunks) | 10-15 requests | 5 requests | **50-67% reduction** |
| Backup with 2 chunked categories (3 chunks each) | 16-20 requests | 5-6 requests | **70% reduction** |
| Large backup (250 items across categories) | 30+ requests | 8 requests | **73% reduction** |

**Key Insight:** The new approach scales better with data size because all items are batched together, regardless of which category they belong to or how many chunks they have.

## Implementation Details

### Key Functions

- `performFullBackup(trigger)` - Main entry point for batched backup
  - Prepares all category data
  - Collects items to delete/create/update
  - Executes batch operations
  - Updates category states

### Data Structures

```javascript
// Category data collection
{
  categoryId: string,
  chunks: string[],
  config: CategoryConfig
}

// Items to create/update
{
  title: string,          // e.g., "custom-code-rules-1"
  link: string,           // e.g., "https://nenya.local/options/custom-code/1"
  note: string,           // JSON payload (max 10,000 chars)
  excerpt: string,        // Chunk info (empty for single chunk)
  collectionId: number,
  categoryId: string,
  chunkNum: number
}
```

**Note:** Links use `https://nenya.local/` instead of `nenya://` protocol to ensure compatibility with Raindrop's bulk create API, which requires valid HTTP/HTTPS URLs.

### Error Handling

- Individual category preparation errors don't block other categories
- Batch operation failures are logged and reported
- Category states are updated with success/failure per batch
- Partial failures allow some categories to succeed

## Indexed Naming Convention

All backup items use indexed naming format: `{category-name}-{index}`
- Single chunk: `auth-provider-settings-1`
- Multiple chunks: `custom-code-rules-1`, `custom-code-rules-2`, `custom-code-rules-3`

This simplifies:
- Restore logic (always look for indexed items)
- Cleanup (consistent naming pattern)
- Debugging (clear chunk numbering)

## Backward Compatibility

- Checks for old non-indexed format during restore
- Automatically migrates by deleting old non-indexed items
- Restore falls back to old format if new format not found

## Future Improvements

1. **Parallel Preparation**: Use `Promise.all()` to prepare all category payloads simultaneously
2. **Smart Diffing**: Only update items that have actually changed
3. **Compression**: Use compression for large payloads before chunking
4. **Incremental Backup**: Only backup categories that changed since last backup
5. **Cache Optimization**: Cache existing items map between backup operations

## Testing Considerations

- Test with varying data sizes (small, medium, large)
- Test with different chunk counts (1, 2, 10, 50)
- Test error scenarios (network failures, API errors)
- Test backward compatibility (restore old format backups)
- Test with concurrent backup requests
- Monitor performance in production (request count, timing)

## Known Issues & Solutions

### Bulk Create API Validation
**Issue:** The Raindrop bulk create endpoint (`POST /raindrops`) silently rejects items with non-HTTP/HTTPS URLs. When using `nenya://` protocol URLs, the API returns `200 OK` with `{"result": true, "items": []}` - an empty items array, causing all backup data to be lost.

**Solution:** Use `https://nenya.local/` domain for all backup item links instead of custom `nenya://` protocol. This ensures:
- Full compatibility with Raindrop's bulk create API
- Proper validation and error reporting
- Successful batch creation of items

**Impact:** This was discovered after a failed backup that deleted all existing items but failed to create new ones. Always test bulk operations in a safe environment first!

## Related Files

- `/src/background/options-backup.js` - Main backup implementation
- `/src/background/mirror.js` - Raindrop API wrapper
- `/references/raindrop/3.3 - Multiple raindrops - API Documentation_20251021-0926.md` - API docs

## API Limits

- **Raindrop Bulk Create**: Max 100 items per request
- **Raindrop Bulk Update**: Max 100 items (but doesn't support `note` field)
- **Raindrop Bulk Delete**: No hard limit documented, but use reasonable batch sizes
- **Note Field**: Max 10,000 characters per raindrop item
- **Rate Limiting**: Monitor for 429 responses, implement exponential backoff if needed

## Monitoring

Key metrics to track:
- Total requests per backup operation
- Backup duration (start to finish)
- Success rate per category
- Average chunk count per category
- Error frequency and types

