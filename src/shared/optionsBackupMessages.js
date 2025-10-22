/**
 * Message type constants shared between background and options scripts for
 * options backup operations.
 * @type {{ STATUS: 'optionsBackup:getStatus', BACKUP_NOW: 'optionsBackup:backupNow', RESTORE_NOW: 'optionsBackup:restoreNow', RESET_DEFAULTS: 'optionsBackup:resetDefaults', RESTORE_AFTER_LOGIN: 'optionsBackup:restoreAfterLogin' }}
 */
export const OPTIONS_BACKUP_MESSAGES = {
  STATUS: 'optionsBackup:getStatus',
  BACKUP_NOW: 'optionsBackup:backupNow',
  RESTORE_NOW: 'optionsBackup:restoreNow',
  RESET_DEFAULTS: 'optionsBackup:resetDefaults',
  RESTORE_AFTER_LOGIN: 'optionsBackup:restoreAfterLogin',
};
