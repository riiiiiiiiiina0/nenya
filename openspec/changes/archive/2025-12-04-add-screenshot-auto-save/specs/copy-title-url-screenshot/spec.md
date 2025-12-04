## ADDED Requirements

### Requirement: Screenshot Settings Configuration

The extension MUST provide a configuration option to automatically save screenshots to the file system.

#### Scenario: Define screenshot settings structure

- **GIVEN** the extension needs to store screenshot preferences
- **THEN** a `screenshotSettings` object MUST be stored in `chrome.storage.sync`
- **AND** the object MUST have the following structure:
  ```javascript
  {
    autoSave: boolean  // default: false
  }
  ```
- **AND** the storage key MUST be `'screenshotSettings'`

#### Scenario: Display screenshot settings in options page

- **GIVEN** the user opens the options page
- **WHEN** viewing the Screenshot Settings section
- **THEN** a toggle control MUST be displayed with the label "Automatically save screenshots to Downloads folder"
- **AND** the toggle MUST reflect the current value of `screenshotSettings.autoSave`
- **AND** the default state MUST be unchecked (false)

#### Scenario: Save screenshot settings changes

- **GIVEN** the user toggles the auto-save setting
- **WHEN** the toggle value changes
- **THEN** the new value MUST be saved to `chrome.storage.sync.screenshotSettings`
- **AND** the save operation MUST complete before showing any feedback
- **AND** the setting MUST be synchronized across all open options pages

### Requirement: Automatic Screenshot Download

The extension MUST automatically download screenshots to the file system when auto-save is enabled.

#### Scenario: Check auto-save setting before download

- **GIVEN** a screenshot has been captured
- **WHEN** determining whether to download it
- **THEN** the extension MUST read `screenshotSettings.autoSave` from storage
- **AND** if `autoSave` is true, proceed with download
- **AND** if `autoSave` is false (default), skip download

#### Scenario: Download screenshot to file system

- **GIVEN** auto-save is enabled
- **AND** a screenshot has been captured as a data URL
- **WHEN** the screenshot operation completes
- **THEN** the extension MUST convert the data URL to a Blob
- **AND** use `chrome.downloads.download()` to save the file
- **AND** use the default Downloads folder as the destination
- **AND** generate a filename in the format: `screenshot-{YYYY-MM-DD-HHmmss}.png`
  - Example: `screenshot-2025-11-20-143022.png`

#### Scenario: Handle download alongside clipboard copy

- **GIVEN** auto-save is enabled
- **WHEN** a screenshot is captured
- **THEN** the screenshot MUST be copied to the clipboard (existing behavior)
- **AND** the screenshot MUST also be downloaded to the file system
- **AND** both operations MUST complete successfully
- **AND** if download fails, clipboard copy MUST still succeed
- **AND** download errors MUST be logged but not shown to the user

#### Scenario: Handle download permission errors

- **GIVEN** the download operation fails due to missing permissions
- **WHEN** attempting to save a screenshot
- **THEN** the error MUST be logged to the console
- **AND** the clipboard copy operation MUST still succeed
- **AND** no error notification MUST be shown to the user
- **AND** the success badge/notification MUST still be shown

### Requirement: Storage Change Synchronization

The extension MUST synchronize screenshot settings changes across all contexts.

#### Scenario: Update UI when settings change

- **GIVEN** the options page is open
- **WHEN** screenshot settings are changed in another context
- **THEN** the options page MUST listen to `chrome.storage.onChanged`
- **AND** update the toggle state to reflect the new value
- **AND** maintain the correct disabled state based on other settings

### Requirement: Settings Normalization

The extension MUST normalize screenshot settings to ensure data integrity.

#### Scenario: Normalize loaded settings

- **GIVEN** screenshot settings are loaded from storage
- **WHEN** the stored value is invalid or missing
- **THEN** the extension MUST apply default values:
  - If `screenshotSettings` is missing: `{ autoSave: false }`
  - If `autoSave` is not a boolean: default to `false`
- **AND** the normalized value MUST be used throughout the extension

#### Scenario: Validate settings before saving

- **GIVEN** screenshot settings are being saved
- **WHEN** the value is provided
- **THEN** `autoSave` MUST be coerced to a boolean
- **AND** any extra properties MUST be ignored
- **AND** only valid settings MUST be persisted to storage

