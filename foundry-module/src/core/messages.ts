/**
 * Message parsing, building, and routing - pure functions.
 * No side effects, fully testable in Node.js.
 */

import type { ActorPanelData } from '../adapters/types';

export type MessageType =
  | 'JOIN'
  | 'PAIR'
  | 'PAIR_SUCCESS'
  | 'PAIR_FAILED'
  | 'MOVE'
  | 'MOVE_ACK'
  | 'ACTOR_INFO'
  | 'ACTOR_UPDATE';

export interface Envelope {
  type: MessageType;
  payload: unknown;
}

export interface JoinPayload {
  room: string;
}

export interface PairPayload {
  code: string;
}

export interface PairSuccessPayload {
  tokenId: string;
  tokenName: string;
  actorName?: string;
}

export interface PairFailedPayload {
  reason: string;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface MovePayload {
  direction: Direction;
  tokenId: string;
}

export interface MoveAckPayload {
  tokenId: string;
  x: number;
  y: number;
}

export interface ActorInfoPayload extends ActorPanelData {
  // ActorInfoPayload is the full ActorPanelData
}

export interface ActorUpdatePayload {
  tokenId: string;
  changes: ActorPanelData; // Full data, client can diff
}

export type HandlerType =
  | 'join'
  | 'pair'
  | 'pairSuccess'
  | 'pairFailed'
  | 'move'
  | 'moveAck'
  | 'actorInfo'
  | 'actorUpdate'
  | 'unknown';

export interface RouteResult {
  handler: HandlerType;
  payload: unknown;
}

/**
 * Parse a JSON message string into an Envelope.
 * Returns null if parsing fails.
 */
export function parseMessage(data: string): Envelope | null {
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed.type !== 'string') {
      return null;
    }
    return {
      type: parsed.type as MessageType,
      payload: parsed.payload ?? {},
    };
  } catch {
    return null;
  }
}

/**
 * Build a JSON message string from type and payload.
 */
export function buildMessage<T extends object>(type: MessageType, payload: T): string {
  return JSON.stringify({ type, payload });
}

/**
 * Route an envelope to its handler.
 */
export function routeMessage(msg: Envelope): RouteResult {
  const handlerMap: Record<MessageType, HandlerType> = {
    JOIN: 'join',
    PAIR: 'pair',
    PAIR_SUCCESS: 'pairSuccess',
    PAIR_FAILED: 'pairFailed',
    MOVE: 'move',
    MOVE_ACK: 'moveAck',
    ACTOR_INFO: 'actorInfo',
    ACTOR_UPDATE: 'actorUpdate',
  };

  const handler = handlerMap[msg.type] ?? 'unknown';
  return { handler, payload: msg.payload };
}

/**
 * Type guard for PairPayload.
 */
export function isPairPayload(payload: unknown): payload is PairPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'code' in payload &&
    typeof (payload as PairPayload).code === 'string'
  );
}

/**
 * Type guard for MovePayload.
 */
export function isMovePayload(payload: unknown): payload is MovePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'direction' in payload &&
    'tokenId' in payload &&
    typeof (payload as MovePayload).direction === 'string' &&
    typeof (payload as MovePayload).tokenId === 'string'
  );
}

/**
 * Type guard for JoinPayload.
 */
export function isJoinPayload(payload: unknown): payload is JoinPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'room' in payload &&
    typeof (payload as JoinPayload).room === 'string'
  );
}
