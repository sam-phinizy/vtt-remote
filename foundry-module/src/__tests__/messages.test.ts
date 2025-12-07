import { describe, it, expect } from 'vitest';
import {
  parseMessage,
  buildMessage,
  routeMessage,
  isPairPayload,
  isMovePayload,
  isJoinPayload,
} from '../core/messages';

describe('parseMessage', () => {
  it('parses valid JOIN message', () => {
    const msg = parseMessage('{"type":"JOIN","payload":{"room":"GAME1"}}');
    expect(msg).not.toBeNull();
    expect(msg?.type).toBe('JOIN');
    expect(msg?.payload).toEqual({ room: 'GAME1' });
  });

  it('parses valid PAIR message', () => {
    const msg = parseMessage('{"type":"PAIR","payload":{"code":"1234"}}');
    expect(msg?.type).toBe('PAIR');
  });

  it('parses valid MOVE message', () => {
    const msg = parseMessage('{"type":"MOVE","payload":{"direction":"up","tokenId":"tok1"}}');
    expect(msg?.type).toBe('MOVE');
  });

  it('returns null for invalid JSON', () => {
    expect(parseMessage('{not valid}')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseMessage('')).toBeNull();
  });

  it('returns null for missing type', () => {
    expect(parseMessage('{"payload":{}}')).toBeNull();
  });

  it('handles missing payload gracefully', () => {
    const msg = parseMessage('{"type":"JOIN"}');
    expect(msg?.type).toBe('JOIN');
    expect(msg?.payload).toEqual({});
  });
});

describe('buildMessage', () => {
  it('builds valid JSON envelope', () => {
    const result = buildMessage('JOIN', { room: 'TEST1' });
    const parsed = JSON.parse(result);
    expect(parsed.type).toBe('JOIN');
    expect(parsed.payload.room).toBe('TEST1');
  });

  it('builds PAIR_SUCCESS message', () => {
    const result = buildMessage('PAIR_SUCCESS', {
      tokenId: 'tok1',
      tokenName: 'Hero',
      actorName: 'Player',
    });
    const parsed = JSON.parse(result);
    expect(parsed.type).toBe('PAIR_SUCCESS');
    expect(parsed.payload.tokenName).toBe('Hero');
  });
});

describe('routeMessage', () => {
  it('routes JOIN to join handler', () => {
    const result = routeMessage({ type: 'JOIN', payload: { room: 'X' } });
    expect(result.handler).toBe('join');
  });

  it('routes PAIR to pair handler', () => {
    const result = routeMessage({ type: 'PAIR', payload: { code: '1234' } });
    expect(result.handler).toBe('pair');
  });

  it('routes MOVE to move handler', () => {
    const result = routeMessage({ type: 'MOVE', payload: { direction: 'up' } });
    expect(result.handler).toBe('move');
  });

  it('routes PAIR_SUCCESS to pairSuccess handler', () => {
    const result = routeMessage({ type: 'PAIR_SUCCESS', payload: {} });
    expect(result.handler).toBe('pairSuccess');
  });

  it('routes unknown types to unknown handler', () => {
    const result = routeMessage({ type: 'UNKNOWN' as any, payload: {} });
    expect(result.handler).toBe('unknown');
  });

  it('passes payload through', () => {
    const payload = { code: '5678' };
    const result = routeMessage({ type: 'PAIR', payload });
    expect(result.payload).toBe(payload);
  });
});

describe('type guards', () => {
  describe('isPairPayload', () => {
    it('returns true for valid payload', () => {
      expect(isPairPayload({ code: '1234' })).toBe(true);
    });

    it('returns false for missing code', () => {
      expect(isPairPayload({})).toBe(false);
    });

    it('returns false for null', () => {
      expect(isPairPayload(null)).toBe(false);
    });

    it('returns false for non-string code', () => {
      expect(isPairPayload({ code: 1234 })).toBe(false);
    });
  });

  describe('isMovePayload', () => {
    it('returns true for valid payload', () => {
      expect(isMovePayload({ direction: 'up', tokenId: 'tok1' })).toBe(true);
    });

    it('returns false for missing direction', () => {
      expect(isMovePayload({ tokenId: 'tok1' })).toBe(false);
    });

    it('returns false for missing tokenId', () => {
      expect(isMovePayload({ direction: 'up' })).toBe(false);
    });
  });

  describe('isJoinPayload', () => {
    it('returns true for valid payload', () => {
      expect(isJoinPayload({ room: 'GAME1' })).toBe(true);
    });

    it('returns false for missing room', () => {
      expect(isJoinPayload({})).toBe(false);
    });
  });
});
