// WebSocket message types
export type MessageType =
  | 'JOIN'
  | 'IDENTIFY'
  | 'ROOM_STATUS'
  | 'PAIR'
  | 'PAIR_SUCCESS'
  | 'PAIR_FAILED'
  | 'LOGIN'
  | 'LOGIN_WITH_TOKEN'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'SELECT_TOKEN'
  | 'SELECT_TOKEN_SUCCESS'
  | 'MOVE'
  | 'MOVE_ACK'
  | 'ROLL_DICE'
  | 'ROLL_DICE_RESULT'
  | 'USE_ABILITY'
  | 'USE_ABILITY_RESULT'
  | 'ACTOR_INFO'
  | 'ACTOR_UPDATE';

export interface RoomStatusPayload {
  foundryConnected: boolean;
}

export interface WSMessage<T = unknown> {
  type: MessageType;
  payload: T;
}

// Auth types
export interface PairSuccessPayload {
  tokenId: string;
  tokenName: string;
}

export interface LoginSuccessPayload {
  userId: string;
  userName: string;
  sessionToken: string; // For "remember me" - store for future auto-login
  availableTokens: AvailableToken[];
}

export interface AvailableToken {
  tokenId: string;
  sceneId: string;
  name: string;
  img?: string;
  sceneName?: string;
}

// Actor types
export interface Resource {
  label: string;
  current: number;
  max: number;
  color?: string;
}

export interface Stat {
  label: string;
  value: string | number;
}

export interface Ability {
  id: string;
  name: string;
  description?: string;
  fullDescription?: string; // Full HTML description for info modal
  img?: string;
  category: 'weapon' | 'spell' | 'feature' | 'consumable' | 'other';
  spellLevel?: number;
  uses?: {
    current: number;
    max: number;
  };
}

export interface ActorData {
  portrait?: string;
  resources: Resource[];
  stats: Stat[];
  conditions: string[];
  abilities: Ability[];
}

// Dice types
export interface RollDicePayload {
  tokenId: string;
  formula: string;
  postToChat: boolean;
}

export interface RollDiceResult {
  tokenId: string;
  success: boolean;
  total?: number;
  breakdown?: string;
  formula: string;
  error?: string;
}

// Move types
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface MovePayload {
  direction: Direction;
  tokenId: string;
}

// App state
export type Screen = 'auth' | 'token-picker' | 'control';
export type AuthMode = 'login' | 'pairing';
