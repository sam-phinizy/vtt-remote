import { describe, it, expect } from 'vitest';
import {
  parseMessage,
  buildMessage,
  routeMessage,
  isPairPayload,
  isMovePayload,
  isJoinPayload,
  isRollDicePayload,
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

  it('parses valid ROLL_DICE message', () => {
    const msg = parseMessage('{"type":"ROLL_DICE","payload":{"tokenId":"tok1","formula":"2d6+3","postToChat":true}}');
    expect(msg?.type).toBe('ROLL_DICE');
    expect(msg?.payload).toEqual({ tokenId: 'tok1', formula: '2d6+3', postToChat: true });
  });

  it('parses valid ROLL_DICE_RESULT message', () => {
    const msg = parseMessage('{"type":"ROLL_DICE_RESULT","payload":{"tokenId":"tok1","formula":"2d6+3","success":true,"total":11,"breakdown":"[5,3]+3","actorName":"Runner","postedToChat":true}}');
    expect(msg?.type).toBe('ROLL_DICE_RESULT');
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

  it('builds ROLL_DICE_RESULT message', () => {
    const result = buildMessage('ROLL_DICE_RESULT', {
      tokenId: 'tok1',
      formula: '1d20',
      success: true,
      total: 17,
      breakdown: '[17]',
      actorName: 'Shadowrunner',
      postedToChat: false,
    });
    const parsed = JSON.parse(result);
    expect(parsed.type).toBe('ROLL_DICE_RESULT');
    expect(parsed.payload.total).toBe(17);
    expect(parsed.payload.actorName).toBe('Shadowrunner');
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

  it('routes ROLL_DICE to rollDice handler', () => {
    const result = routeMessage({ type: 'ROLL_DICE', payload: { tokenId: 'tok1', formula: '1d20', postToChat: true } });
    expect(result.handler).toBe('rollDice');
  });

  it('routes ROLL_DICE_RESULT to rollDiceResult handler', () => {
    const result = routeMessage({ type: 'ROLL_DICE_RESULT', payload: {} });
    expect(result.handler).toBe('rollDiceResult');
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

  describe('isRollDicePayload', () => {
    it('returns true for valid payload with all fields', () => {
      expect(isRollDicePayload({ tokenId: 'tok1', formula: '2d6+3', postToChat: true })).toBe(true);
    });

    it('returns true for valid payload with optional label', () => {
      expect(isRollDicePayload({ tokenId: 'tok1', formula: '1d20', postToChat: false, label: 'Attack roll' })).toBe(true);
    });

    it('returns false for missing tokenId', () => {
      expect(isRollDicePayload({ formula: '1d20', postToChat: true })).toBe(false);
    });

    it('returns false for missing formula', () => {
      expect(isRollDicePayload({ tokenId: 'tok1', postToChat: true })).toBe(false);
    });

    it('returns false for missing postToChat', () => {
      expect(isRollDicePayload({ tokenId: 'tok1', formula: '1d20' })).toBe(false);
    });

    it('returns false for null', () => {
      expect(isRollDicePayload(null)).toBe(false);
    });

    it('returns false for non-boolean postToChat', () => {
      expect(isRollDicePayload({ tokenId: 'tok1', formula: '1d20', postToChat: 'yes' })).toBe(false);
    });
  });
});
