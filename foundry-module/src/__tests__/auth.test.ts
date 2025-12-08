import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  getControllableTokens,
  type SceneData,
} from '../core/auth';

describe('hashPassword', () => {
  it('returns a hex string', () => {
    const hash = hashPassword('mypassword', 'ABC123');
    expect(hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 = 64 hex chars
  });

  it('is deterministic - same input yields same output', () => {
    const hash1 = hashPassword('password', 'ROOM01');
    const hash2 = hashPassword('password', 'ROOM01');
    expect(hash1).toBe(hash2);
  });

  it('different passwords yield different hashes', () => {
    const hash1 = hashPassword('password1', 'ROOM01');
    const hash2 = hashPassword('password2', 'ROOM01');
    expect(hash1).not.toBe(hash2);
  });

  it('different salts yield different hashes', () => {
    const hash1 = hashPassword('password', 'ROOM01');
    const hash2 = hashPassword('password', 'ROOM02');
    expect(hash1).not.toBe(hash2);
  });

  it('handles empty password', () => {
    const hash = hashPassword('', 'ROOM01');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles empty salt', () => {
    const hash = hashPassword('password', '');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('verifyPassword', () => {
  it('returns true for matching password', () => {
    const stored = hashPassword('correctpassword', 'ROOM01');
    expect(verifyPassword('correctpassword', stored, 'ROOM01')).toBe(true);
  });

  it('returns false for wrong password', () => {
    const stored = hashPassword('correctpassword', 'ROOM01');
    expect(verifyPassword('wrongpassword', stored, 'ROOM01')).toBe(false);
  });

  it('returns false for wrong salt', () => {
    const stored = hashPassword('password', 'ROOM01');
    expect(verifyPassword('password', stored, 'ROOM02')).toBe(false);
  });

  it('returns false for tampered hash', () => {
    const stored = hashPassword('password', 'ROOM01');
    const tampered = stored.slice(0, -2) + 'ff';
    expect(verifyPassword('password', tampered, 'ROOM01')).toBe(false);
  });
});

describe('getControllableTokens', () => {
  // Mock scene data structure with explicit typing
  const mockScenes: SceneData[] = [
    {
      id: 'scene1',
      name: 'Combat Map',
      tokens: [
        {
          id: 'token1',
          name: 'Player Hero',
          actorId: 'actor1',
          img: 'hero.png',
          ownership: { user1: 3 } as Record<string, number>, // OWNER permission (3)
        },
        {
          id: 'token2',
          name: 'Enemy Goblin',
          actorId: 'actor2',
          img: 'goblin.png',
          ownership: { gm: 3 } as Record<string, number>,
        },
        {
          id: 'token3',
          name: 'Friendly NPC',
          actorId: 'actor3',
          img: 'npc.png',
          ownership: { user1: 2 } as Record<string, number>, // LIMITED permission (2)
        },
      ],
    },
    {
      id: 'scene2',
      name: 'Town',
      tokens: [
        {
          id: 'token4',
          name: 'Second Character',
          actorId: 'actor4',
          img: 'char2.png',
          ownership: { user1: 3 } as Record<string, number>,
        },
      ],
    },
  ];

  it('returns tokens owned by the user', () => {
    const tokens = getControllableTokens('user1', false, mockScenes);
    expect(tokens).toHaveLength(2);
    expect(tokens.map((t) => t.tokenId)).toContain('token1');
    expect(tokens.map((t) => t.tokenId)).toContain('token4');
  });

  it('excludes tokens with limited permission', () => {
    const tokens = getControllableTokens('user1', false, mockScenes);
    expect(tokens.map((t) => t.tokenId)).not.toContain('token3');
  });

  it('excludes tokens owned by other users', () => {
    const tokens = getControllableTokens('user1', false, mockScenes);
    expect(tokens.map((t) => t.tokenId)).not.toContain('token2');
  });

  it('GM can control all tokens', () => {
    const tokens = getControllableTokens('gm', true, mockScenes);
    expect(tokens).toHaveLength(4); // All tokens across both scenes
  });

  it('returns empty array for user with no tokens', () => {
    const tokens = getControllableTokens('unknownuser', false, mockScenes);
    expect(tokens).toHaveLength(0);
  });

  it('includes scene info in returned tokens', () => {
    const tokens = getControllableTokens('user1', false, mockScenes);
    const token1 = tokens.find((t) => t.tokenId === 'token1');
    expect(token1?.sceneId).toBe('scene1');
    expect(token1?.sceneName).toBe('Combat Map');
  });

  it('includes token metadata', () => {
    const tokens = getControllableTokens('user1', false, mockScenes);
    const token1 = tokens.find((t) => t.tokenId === 'token1');
    expect(token1).toMatchObject({
      tokenId: 'token1',
      name: 'Player Hero',
      actorId: 'actor1',
      img: 'hero.png',
    });
  });

  it('handles empty scenes array', () => {
    const tokens = getControllableTokens('user1', false, []);
    expect(tokens).toHaveLength(0);
  });
});
