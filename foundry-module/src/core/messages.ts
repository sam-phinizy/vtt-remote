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
  | 'LOGIN'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'SELECT_TOKEN'
  | 'SELECT_TOKEN_SUCCESS'
  | 'MOVE'
  | 'MOVE_ACK'
  | 'ACTOR_INFO'
  | 'ACTOR_UPDATE'
  | 'USE_ABILITY'
  | 'USE_ABILITY_RESULT'
  | 'ROLL_DICE'
  | 'ROLL_DICE_RESULT';

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

// ============================================================================
// LOGIN / TOKEN SELECTION (Password-based auth)
// ============================================================================

export interface LoginPayload {
  username: string;
  passwordHash: string; // SHA256(password + roomCode)
}

export interface LoginTokenInfo {
  tokenId: string;
  sceneId: string;
  sceneName?: string;
  name: string;
  actorId: string;
  img?: string;
}

export interface LoginSuccessPayload {
  userId: string;
  userName: string;
  availableTokens: LoginTokenInfo[];
}

export interface LoginFailedPayload {
  reason: 'invalid_credentials' | 'no_password_set' | 'user_not_found';
}

export interface SelectTokenPayload {
  tokenId: string;
  sceneId: string;
}

export interface SelectTokenSuccessPayload {
  tokenId: string;
  tokenName: string;
  actorName?: string;
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

export interface UseAbilityPayload {
  tokenId: string;
  itemId: string; // Foundry item ID
}

export interface UseAbilityResultPayload {
  tokenId: string;
  itemId: string;
  success: boolean;
  message?: string; // Error message or confirmation
}

export interface RollDicePayload {
  tokenId: string;
  formula: string; // e.g., "2d6+3", "1d20"
  postToChat: boolean;
  label?: string; // Optional description for the roll
}

export interface RollDiceResultPayload {
  tokenId: string;
  formula: string;
  success: boolean;
  total?: number; // Only if success
  breakdown?: string; // e.g., "[5, 3] + 3 = 11"
  actorName: string;
  postedToChat: boolean;
  error?: string; // Only if !success
}

export type HandlerType =
  | 'join'
  | 'pair'
  | 'pairSuccess'
  | 'pairFailed'
  | 'login'
  | 'loginSuccess'
  | 'loginFailed'
  | 'selectToken'
  | 'selectTokenSuccess'
  | 'move'
  | 'moveAck'
  | 'actorInfo'
  | 'actorUpdate'
  | 'useAbility'
  | 'useAbilityResult'
  | 'rollDice'
  | 'rollDiceResult'
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
    LOGIN: 'login',
    LOGIN_SUCCESS: 'loginSuccess',
    LOGIN_FAILED: 'loginFailed',
    SELECT_TOKEN: 'selectToken',
    SELECT_TOKEN_SUCCESS: 'selectTokenSuccess',
    MOVE: 'move',
    MOVE_ACK: 'moveAck',
    ACTOR_INFO: 'actorInfo',
    ACTOR_UPDATE: 'actorUpdate',
    USE_ABILITY: 'useAbility',
    USE_ABILITY_RESULT: 'useAbilityResult',
    ROLL_DICE: 'rollDice',
    ROLL_DICE_RESULT: 'rollDiceResult',
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

/**
 * Type guard for UseAbilityPayload.
 */
export function isUseAbilityPayload(payload: unknown): payload is UseAbilityPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'tokenId' in payload &&
    'itemId' in payload &&
    typeof (payload as UseAbilityPayload).tokenId === 'string' &&
    typeof (payload as UseAbilityPayload).itemId === 'string'
  );
}

/**
 * Type guard for RollDicePayload.
 */
export function isRollDicePayload(payload: unknown): payload is RollDicePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'tokenId' in payload &&
    'formula' in payload &&
    'postToChat' in payload &&
    typeof (payload as RollDicePayload).tokenId === 'string' &&
    typeof (payload as RollDicePayload).formula === 'string' &&
    typeof (payload as RollDicePayload).postToChat === 'boolean'
  );
}

/**
 * Type guard for LoginPayload.
 */
export function isLoginPayload(payload: unknown): payload is LoginPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'username' in payload &&
    'passwordHash' in payload &&
    typeof (payload as LoginPayload).username === 'string' &&
    typeof (payload as LoginPayload).passwordHash === 'string'
  );
}

/**
 * Type guard for SelectTokenPayload.
 */
export function isSelectTokenPayload(payload: unknown): payload is SelectTokenPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'tokenId' in payload &&
    'sceneId' in payload &&
    typeof (payload as SelectTokenPayload).tokenId === 'string' &&
    typeof (payload as SelectTokenPayload).sceneId === 'string'
  );
}
