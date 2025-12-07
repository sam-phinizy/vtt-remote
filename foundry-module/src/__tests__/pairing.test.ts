import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  validateSession,
  isExpired,
  generateCode,
  generateRoomCode,
  findSessionByToken,
  cleanupExpiredSessions,
  SESSION_TTL_MS,
  type PairingSession,
} from '../core/pairing';

describe('generateCode', () => {
  it('generates 4-digit string', () => {
    const code = generateCode();
    expect(code).toMatch(/^\d{4}$/);
  });

  it('generates codes >= 1000', () => {
    for (let i = 0; i < 100; i++) {
      const code = parseInt(generateCode(), 10);
      expect(code).toBeGreaterThanOrEqual(1000);
      expect(code).toBeLessThan(10000);
    }
  });
});

describe('generateRoomCode', () => {
  it('generates 6-character string', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
  });

  it('uses only allowed characters (no 0/O/1/I)', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
});

describe('createSession', () => {
  it('creates session with correct fields', () => {
    const now = 1000000;
    const session = createSession('tok1', 'scene1', 'actor1', now);

    expect(session.tokenId).toBe('tok1');
    expect(session.sceneId).toBe('scene1');
    expect(session.actorId).toBe('actor1');
    expect(session.createdAt).toBe(now);
    expect(session.code).toMatch(/^\d{4}$/);
  });
});

describe('isExpired', () => {
  it('returns false for fresh session', () => {
    const now = Date.now();
    const session = createSession('t', 's', 'a', now);
    expect(isExpired(session, now)).toBe(false);
  });

  it('returns false just before TTL', () => {
    const now = Date.now();
    const session = createSession('t', 's', 'a', now - SESSION_TTL_MS + 1000);
    expect(isExpired(session, now)).toBe(false);
  });

  it('returns true after TTL', () => {
    const now = Date.now();
    const session = createSession('t', 's', 'a', now - SESSION_TTL_MS - 1);
    expect(isExpired(session, now)).toBe(true);
  });

  it('respects custom TTL', () => {
    const now = Date.now();
    const session = createSession('t', 's', 'a', now - 5000);
    expect(isExpired(session, now, 10000)).toBe(false);
    expect(isExpired(session, now, 4000)).toBe(true);
  });
});

describe('validateSession', () => {
  let sessions: Map<string, PairingSession>;

  beforeEach(() => {
    sessions = new Map();
  });

  it('returns session for valid code', () => {
    const now = Date.now();
    const session = createSession('tok1', 'scene1', 'actor1', now);
    sessions.set(session.code, session);

    const result = validateSession(sessions, session.code, now);
    expect(result).toBe(session);
  });

  it('returns null for unknown code', () => {
    const now = Date.now();
    expect(validateSession(sessions, '9999', now)).toBeNull();
  });

  it('returns null for expired session', () => {
    const now = Date.now();
    const session = createSession('tok1', 'scene1', 'actor1', now - SESSION_TTL_MS - 1);
    sessions.set(session.code, session);

    expect(validateSession(sessions, session.code, now)).toBeNull();
  });
});

describe('findSessionByToken', () => {
  let sessions: Map<string, PairingSession>;

  beforeEach(() => {
    sessions = new Map();
  });

  it('finds session by token ID', () => {
    const now = Date.now();
    const session = createSession('tok1', 'scene1', 'actor1', now);
    sessions.set(session.code, session);

    const result = findSessionByToken(sessions, 'tok1', now);
    expect(result).toBe(session);
  });

  it('returns null for unknown token', () => {
    const now = Date.now();
    expect(findSessionByToken(sessions, 'unknown', now)).toBeNull();
  });

  it('returns null for expired session', () => {
    const now = Date.now();
    const session = createSession('tok1', 'scene1', 'actor1', now - SESSION_TTL_MS - 1);
    sessions.set(session.code, session);

    expect(findSessionByToken(sessions, 'tok1', now)).toBeNull();
  });
});

describe('cleanupExpiredSessions', () => {
  it('removes expired sessions', () => {
    const now = Date.now();
    const sessions = new Map<string, PairingSession>();

    const fresh = createSession('tok1', 's', 'a', now);
    const expired = createSession('tok2', 's', 'a', now - SESSION_TTL_MS - 1);

    sessions.set(fresh.code, fresh);
    sessions.set(expired.code, expired);

    const removed = cleanupExpiredSessions(sessions, now);

    expect(removed).toBe(1);
    expect(sessions.size).toBe(1);
    expect(sessions.has(fresh.code)).toBe(true);
    expect(sessions.has(expired.code)).toBe(false);
  });

  it('returns 0 when no sessions expired', () => {
    const now = Date.now();
    const sessions = new Map<string, PairingSession>();
    const fresh = createSession('tok1', 's', 'a', now);
    sessions.set(fresh.code, fresh);

    expect(cleanupExpiredSessions(sessions, now)).toBe(0);
    expect(sessions.size).toBe(1);
  });
});
