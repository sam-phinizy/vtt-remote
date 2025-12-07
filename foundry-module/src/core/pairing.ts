/**
 * Pairing session management - pure functions.
 * Clock is injected for testability.
 */

export interface PairingSession {
  code: string;
  tokenId: string;
  sceneId: string;
  actorId: string;
  createdAt: number;
}

/** Default session TTL: 5 minutes */
export const SESSION_TTL_MS = 5 * 60 * 1000;

/**
 * Generate a random 4-digit pairing code.
 */
export function generateCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Generate a random 6-character room code.
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0/O/1/I confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new pairing session.
 * @param tokenId - Token document ID
 * @param sceneId - Scene document ID
 * @param actorId - Actor document ID
 * @param now - Current timestamp (injectable for testing)
 */
export function createSession(
  tokenId: string,
  sceneId: string,
  actorId: string,
  now: number
): PairingSession {
  return {
    code: generateCode(),
    tokenId,
    sceneId,
    actorId,
    createdAt: now,
  };
}

/**
 * Check if a session is expired.
 * @param session - The session to check
 * @param now - Current timestamp
 * @param ttlMs - Time-to-live in milliseconds
 */
export function isExpired(
  session: PairingSession,
  now: number,
  ttlMs: number = SESSION_TTL_MS
): boolean {
  return now - session.createdAt > ttlMs;
}

/**
 * Validate a pairing code against active sessions.
 * Returns the session if valid and not expired, null otherwise.
 * @param sessions - Map of code -> session
 * @param code - Code to validate
 * @param now - Current timestamp
 * @param ttlMs - Time-to-live in milliseconds
 */
export function validateSession(
  sessions: Map<string, PairingSession>,
  code: string,
  now: number,
  ttlMs: number = SESSION_TTL_MS
): PairingSession | null {
  const session = sessions.get(code);
  if (!session) {
    return null;
  }
  if (isExpired(session, now, ttlMs)) {
    return null;
  }
  return session;
}

/**
 * Find a session by token ID (for move validation).
 * Returns the session if found and not expired, null otherwise.
 */
export function findSessionByToken(
  sessions: Map<string, PairingSession>,
  tokenId: string,
  now: number,
  ttlMs: number = SESSION_TTL_MS
): PairingSession | null {
  for (const session of sessions.values()) {
    if (session.tokenId === tokenId && !isExpired(session, now, ttlMs)) {
      return session;
    }
  }
  return null;
}

/**
 * Clean up expired sessions from the map.
 * Returns the number of sessions removed.
 */
export function cleanupExpiredSessions(
  sessions: Map<string, PairingSession>,
  now: number,
  ttlMs: number = SESSION_TTL_MS
): number {
  let removed = 0;
  for (const [code, session] of sessions.entries()) {
    if (isExpired(session, now, ttlMs)) {
      sessions.delete(code);
      removed++;
    }
  }
  return removed;
}
