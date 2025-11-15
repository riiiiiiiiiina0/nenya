## Auth Specification

### Requirement: Connect to Raindrop.io
The system MUST provide a mechanism for users to authenticate with their Raindrop.io account to enable integration features.

#### Scenario: User Connects to Raindrop.io for the First Time
- **Given** a user is on the extension's options page and is not connected to Raindrop.io,
- **When** they click the "Connect" button for the Raindrop.io provider,
- **Then** the system MUST open a new tab to the Raindrop.io OAuth consent screen.
- **And** upon successful authentication and authorization, the new tab MUST close.
- **And** the system MUST securely store the obtained access token, refresh token, and expiration time.
- **And** the options page MUST update to show a "Connected" status, along with the token expiration date.

#### Scenario: User Disconnects from Raindrop.io
- **Given** a user is on the extension's options page and is connected to Raindrop.io,
- **When** they click the "Disconnect" button,
- **Then** the system MUST clear the stored access token, refresh token, and expiration time.
- **And** the system MUST remove any locally mirrored Raindrop.io data (e.g., bookmarks and projects).
- **And** the options page MUST update to show a "Not connected" status.

#### Scenario: User Reconnects to Raindrop.io
- **Given** a user is on the extension's options page and their Raindrop.io connection has expired,
- **When** they click the "Reconnect" button,
- **Then** the system MUST initiate the same OAuth flow as the initial connection to obtain a new set of tokens.

#### Scenario: Automatic Token Refresh (Placeholder)
- **Given** a user is connected to Raindrop.io and their access token has expired,
- **When** the extension needs to make an authenticated API call,
- **Then** the system SHOULD attempt to use the refresh token to obtain a new access token without user interaction.
- **Note**: The current implementation does not automatically refresh the token in the background; it requires the user to manually reconnect. The `refreshAccessToken` function is a placeholder and throws an error to indicate that a manual reconnect is needed.
