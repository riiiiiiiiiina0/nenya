# Backup and Restore Options

## Overview

Back up extension options to and restore options from a Raindrop collection named "Options backup". Each category of options is stored as a separate Raindrop item for granular control and easy management.

## Data Structure

### Storage Keys to Backup

#### Chrome Storage Sync (Persistent across devices)
- `mirrorRootFolderSettings` - Root folder configuration per provider
- `notificationPreferences` - Notification preferences

## Backup Categories

### 1. Authentication & Provider Settings
**Raindrop Item Title:** `auth-provider-settings`
**Data Structure:**
```json
{
  "privoder": "raindrop",
  "mirrorRootFolderSettings": {
    "parentFolderId": "string",
    "rootFolderName": "string"
  }
}
```
**URL:**
nenya://options/provider

### 2. Notification Preferences
**Raindrop Item Title:** `notification-preferences`
**Data Structure:**
```json
{
  "enabled": "boolean",
  "bookmark": {
    "enabled": "boolean",
    "pullFinished": "boolean",
    "unsortedSaved": "boolean"
  },
  "project": {
    "enabled": "boolean",
    "saveProject": "boolean",
    "addTabs": "boolean",
    "replaceItems": "boolean",
    "deleteProject": "boolean"
  }
}
```
**URL:**
nenya://options/notifications

## Sync Mechanism

### Backup Triggers
- **Real-time backup:** When any option changes locally
- **Manual backup:** User-initiated backup action

### Restore Triggers
- **Extension startup:** Check for server changes
- **Window focus:** Pull latest changes when browser window becomes active
- **Periodic sync:** Every 5 minutes after last successful pull
- **Manual restore:** User-initiated restore action

### Conflict Resolution
- **Strategy:** Latest timestamp wins
- **Implementation:** Compare `lastModified` timestamps
- **Fallback:** Local changes take precedence if timestamps are equal

### Data Validation
- **Schema validation:** Verify JSON structure matches expected format
- **Value validation:** Check data types and ranges
- **Migration support:** Handle version differences gracefully

## Implementation Details

### Backup Process
1. **Collect data** from Chrome storage (sync + local as needed)
2. **Validate data** structure and content
3. **Create/update Raindrop items** in "Options backup" collection
4. **Add metadata** (timestamp, version, device info)
5. **Handle errors** gracefully with user notification

### Restore Process
1. **Fetch data** from Raindrop "Options backup" collection
2. **Validate server data** structure and freshness
3. **Compare timestamps** to determine if restore is needed
4. **Apply changes** to Chrome storage
5. **Update UI** to reflect restored settings
6. **Notify user** of restore results

### Error Handling
- **Network failures:** Retry with exponential backoff
- **Invalid data:** Skip problematic items, log warnings
- **User notification:** Clear error messages with suggested actions

## User Experience

### Backup Status
- **Visual indicators:** Show backup status in options UI
- **Last backup time:** Display when backup was last successful
- **Error notifications:** Alert users to backup/restore issues

### Manual Controls
- **Backup now:** Force immediate backup of current settings
- **Restore from backup:** Pull and apply latest server settings
- **Reset to defaults:** Clear all settings and start fresh

### Automatic Behavior
- **Silent operation:** Backup/restore happens in background
- **Conflict resolution:** Automatically handle most conflicts
- **User prompts:** Only ask for input when user choice is needed