/* global chrome */

/**
 * @typedef {Object} StoredProviderTokens
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {number} expiresAt
 */

const STORAGE_KEY_TOKENS = 'cloudAuthTokens';
const OAUTH_REFRESH_URL = 'https://ohauth.vercel.app/oauth/refresh';

/**
 * Attempt to refresh the access token using the refresh token.
 * @param {string} providerId - The provider ID (e.g., 'raindrop')
 * @param {string} refreshToken - The refresh token
 * @returns {Promise<StoredProviderTokens | null>} - New tokens or null if refresh failed
 */
export async function refreshAccessToken(providerId, refreshToken) {
  if (!refreshToken) {
    console.warn('[tokenRefresh] No refresh token available');
    return null;
  }

  try {
    const response = await fetch(OAUTH_REFRESH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: providerId,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      console.warn(
        '[tokenRefresh] Refresh request failed:',
        response.status,
        response.statusText,
      );
      return null;
    }

    const data = await response.json();

    if (!data || !data.access_token) {
      console.warn('[tokenRefresh] Invalid refresh response:', data);
      return null;
    }

    const expiresInMs = Number(data.expires_in) * 1000;
    const newTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Use new refresh token if provided, otherwise keep old
      expiresAt: Date.now() + expiresInMs,
    };

    // Persist the new tokens
    await saveProviderTokens(providerId, newTokens);

    console.log('[tokenRefresh] Successfully refreshed tokens for', providerId);
    return newTokens;
  } catch (error) {
    console.error('[tokenRefresh] Failed to refresh token:', error);
    return null;
  }
}

/**
 * Save provider tokens to storage.
 * @param {string} providerId - The provider ID
 * @param {StoredProviderTokens} tokens - The tokens to save
 * @returns {Promise<void>}
 */
async function saveProviderTokens(providerId, tokens) {
  const result = await chrome.storage.sync.get(STORAGE_KEY_TOKENS);
  const tokensMap = result[STORAGE_KEY_TOKENS] || {};
  tokensMap[providerId] = tokens;
  await chrome.storage.sync.set({ [STORAGE_KEY_TOKENS]: tokensMap });
}

/**
 * Get stored tokens for a provider.
 * @param {string} providerId - The provider ID
 * @returns {Promise<StoredProviderTokens | null>}
 */
export async function getStoredTokens(providerId) {
  const result = await chrome.storage.sync.get(STORAGE_KEY_TOKENS);
  const tokensMap = result[STORAGE_KEY_TOKENS];
  if (!tokensMap || !tokensMap[providerId]) {
    return null;
  }

  const record = tokensMap[providerId];
  if (!record || typeof record.accessToken !== 'string') {
    return null;
  }

  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken || '',
    expiresAt: Number(record.expiresAt) || 0,
  };
}

/**
 * Check if tokens are expired.
 * @param {StoredProviderTokens} tokens - The tokens to check
 * @returns {boolean}
 */
export function areTokensExpired(tokens) {
  if (!tokens || !tokens.expiresAt) {
    return true;
  }
  return tokens.expiresAt <= Date.now();
}

/**
 * Get valid tokens for a provider, attempting refresh if expired.
 * @param {string} providerId - The provider ID
 * @returns {Promise<{ tokens: StoredProviderTokens | null, needsReauth: boolean, error?: string }>}
 */
export async function getValidTokens(providerId) {
  const tokens = await getStoredTokens(providerId);

  if (!tokens) {
    return {
      tokens: null,
      needsReauth: true,
      error: 'No tokens stored. Please connect to ' + providerId + '.',
    };
  }

  // If tokens are not expired, return them
  if (!areTokensExpired(tokens)) {
    return { tokens, needsReauth: false };
  }

  // Tokens are expired, try to refresh
  console.log('[tokenRefresh] Tokens expired, attempting refresh...');

  if (!tokens.refreshToken) {
    return {
      tokens: null,
      needsReauth: true,
      error:
        'Session expired and no refresh token available. Please reconnect.',
    };
  }

  const refreshedTokens = await refreshAccessToken(
    providerId,
    tokens.refreshToken,
  );

  if (refreshedTokens) {
    return { tokens: refreshedTokens, needsReauth: false };
  }

  // Refresh failed
  return {
    tokens: null,
    needsReauth: true,
    error: 'Session expired and refresh failed. Please reconnect.',
  };
}

/**
 * Message type for token validation requests.
 */
export const TOKEN_VALIDATION_MESSAGE = 'auth:validateTokens';

/**
 * Message type for token validation response.
 * @typedef {Object} TokenValidationResponse
 * @property {boolean} isValid
 * @property {boolean} needsReauth
 * @property {string} [error]
 */


