/**
 * Authentication utilities - pure functions for password hashing and token permissions.
 * No side effects, testable in Node.js.
 *
 * Note: hashPassword uses Node's crypto (for tests). Browser code should use
 * hashPasswordBrowser (async, uses SubtleCrypto).
 */

// Conditionally import crypto for Node.js environment (tests)
let nodeCreateHash: typeof import('crypto').createHash | null = null;
try {
  // Dynamic import that won't break in browser bundling
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nodeCreateHash = require('crypto').createHash;
} catch {
  // Running in browser - crypto not available
}

/**
 * Token info returned by getControllableTokens.
 */
export interface TokenInfo {
  tokenId: string;
  sceneId: string;
  sceneName?: string;
  name: string;
  actorId: string;
  img?: string;
}

/**
 * Minimal scene structure for token permission checking.
 */
export interface SceneData {
  id: string;
  name: string;
  tokens: Array<{
    id: string;
    name: string;
    actorId: string;
    img?: string;
    ownership?: Record<string, number>;
  }>;
}

/**
 * Password entry stored in world settings.
 */
export interface PasswordEntry {
  hash: string;
  setBy: string; // userId who set it
  setAt: number; // timestamp
}

/**
 * Password store structure (stored in world settings).
 */
export type PasswordStore = Record<string, PasswordEntry>;

// Foundry permission levels
const OWNER_PERMISSION = 3;

/**
 * Hash a password with a salt using SHA-256 (Node.js version).
 * Returns a 64-character hex string.
 * Use hashPasswordBrowser for browser environments.
 *
 * @param password - The plaintext password
 * @param salt - Salt value (typically the room code)
 */
export function hashPassword(password: string, salt: string): string {
  if (!nodeCreateHash) {
    throw new Error('hashPassword requires Node.js crypto. Use hashPasswordBrowser in browser.');
  }
  return nodeCreateHash('sha256')
    .update(password + salt)
    .digest('hex');
}

/**
 * Hash a password with a salt using SHA-256 (Browser version).
 * Uses Web Crypto API (SubtleCrypto).
 *
 * @param password - The plaintext password
 * @param salt - Salt value (typically the room code)
 */
export async function hashPasswordBrowser(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a password against a stored hash (Node.js version).
 *
 * @param input - The plaintext password to verify
 * @param storedHash - The stored hash to compare against
 * @param salt - Salt value used when creating the hash
 */
export function verifyPassword(input: string, storedHash: string, salt: string): boolean {
  const inputHash = hashPassword(input, salt);
  return inputHash === storedHash;
}

/**
 * Verify a password against a stored hash (Browser version).
 * Uses Web Crypto API (SubtleCrypto).
 *
 * @param input - The plaintext password to verify
 * @param storedHash - The stored hash to compare against
 * @param salt - Salt value used when creating the hash
 */
export async function verifyPasswordBrowser(
  input: string,
  storedHash: string,
  salt: string
): Promise<boolean> {
  const inputHash = await hashPasswordBrowser(input, salt);
  return inputHash === storedHash;
}

/**
 * Get all tokens a user can control across all scenes.
 *
 * @param userId - The Foundry user ID
 * @param isGM - Whether the user is a GM (GMs can control all tokens)
 * @param scenes - Array of scene data with tokens
 */
export function getControllableTokens(
  userId: string,
  isGM: boolean,
  scenes: SceneData[]
): TokenInfo[] {
  const tokens: TokenInfo[] = [];

  for (const scene of scenes) {
    for (const token of scene.tokens) {
      // GM can control any token
      if (isGM) {
        tokens.push({
          tokenId: token.id,
          sceneId: scene.id,
          sceneName: scene.name,
          name: token.name,
          actorId: token.actorId,
          img: token.img,
        });
        continue;
      }

      // Check if user has OWNER permission on this token
      const userPermission = token.ownership?.[userId] ?? 0;
      if (userPermission >= OWNER_PERMISSION) {
        tokens.push({
          tokenId: token.id,
          sceneId: scene.id,
          sceneName: scene.name,
          name: token.name,
          actorId: token.actorId,
          img: token.img,
        });
      }
    }
  }

  return tokens;
}
