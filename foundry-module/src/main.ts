/**
 * VTT Remote Control - Foundry Module Entry Point
 *
 * IMPERATIVE SHELL: Handles Foundry APIs, WebSocket, and DOM.
 * Business logic lives in ./core (pure functions, tested in Node).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// Foundry globals - types are for Foundry v9, we're targeting v11/12
// Using 'any' for shell code; core is properly typed and tested
declare const game: any;
declare const canvas: any;
declare const ui: any;
declare const Hooks: any;
declare const Dialog: any;
declare const Roll: any;
declare const ChatMessage: any;
declare function $(selector: any): any;

import {
  // Messages
  parseMessage,
  buildMessage,
  routeMessage,
  isPairPayload,
  isMovePayload,
  isUseAbilityPayload,
  isRollDicePayload,
  isLoginPayload,
  isLoginWithTokenPayload,
  isSelectTokenPayload,
  type PairingSession,
  // Pairing
  createSession,
  validateSession,
  generateRoomCode,
  cleanupExpiredSessions,
  findSessionByToken,
  SESSION_TTL_MS,
  // Movement
  directionToDelta,
  applyMovement,
  isValidDirection,
  clampPosition,
  // Auth
  type PasswordStore,
  getControllableTokens,
  type SceneData,
} from './core';

import { getAdapter, type ActorPanelData } from './adapters';

// Foundry FormApplication class (declared for TypeScript)
declare const FormApplication: any;

// Module configuration
const MODULE_ID = 'vtt-remote';

// Placeholder for Password Manager Application
// Will be properly implemented in apps/PasswordManager.ts
class PasswordManagerApp extends FormApplication {
  static get defaultOptions() {
    return {
      ...super.defaultOptions,
      id: 'vtt-remote-password-manager',
      title: 'VTT Remote - Password Manager',
      template: 'modules/vtt-remote/templates/password-manager.html',
      width: 400,
      height: 'auto',
    };
  }

  getData() {
    const isGM = game.user?.isGM ?? false;
    const currentUserId = game.user?.id ?? '';
    const passwords = game.settings?.get(MODULE_ID, 'userPasswords') as PasswordStore ?? {};
    const users = game.users?.contents ?? [];

    return {
      isGM,
      currentUserId,
      users: users.map((u: any) => ({
        id: u.id,
        name: u.name,
        hasPassword: !!passwords[u.id],
        isCurrentUser: u.id === currentUserId,
        canEdit: isGM || u.id === currentUserId,
      })),
    };
  }

  activateListeners(html: any) {
    super.activateListeners(html);
    html.find('.set-password-btn').click(this._onSetPassword.bind(this));
    html.find('.clear-password-btn').click(this._onClearPassword.bind(this));
  }

  async _onSetPassword(event: Event) {
    event.preventDefault();
    const button = event.currentTarget as HTMLElement;
    const userId = button.dataset.userId;
    if (!userId) return;

    const user = game.users?.get(userId);
    const userName = user?.name ?? 'Unknown';

    // Show password input dialog
    const content = `
      <form>
        <div class="form-group">
          <label>New Password for ${userName}</label>
          <input type="password" name="password" placeholder="Enter password">
        </div>
      </form>
    `;

    new Dialog({
      title: `Set Password - ${userName}`,
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-check"></i>',
          label: 'Save',
          callback: async (html: any) => {
            const password = html.find('input[name="password"]').val();
            if (password) {
              await setUserPassword(userId, password);
              ui.notifications?.info(`Password set for ${userName}`);
              this.render();
            }
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Cancel',
        },
      },
      default: 'save',
    }).render(true);
  }

  async _onClearPassword(event: Event) {
    event.preventDefault();
    const button = event.currentTarget as HTMLElement;
    const userId = button.dataset.userId;
    if (!userId) return;

    const user = game.users?.get(userId);
    const userName = user?.name ?? 'Unknown';

    await clearUserPassword(userId);
    ui.notifications?.info(`Password cleared for ${userName}`);
    this.render();
  }
}

// Active pairing sessions (stored in memory only)
const pairingSessions = new Map<string, PairingSession>();

// Track which tokenIds have paired remotes (for real-time updates)
const pairedTokens = new Set<string>();

// Authenticated sessions (password-based login)
interface AuthenticatedSession {
  userId: string;
  userName: string;
  tokenId?: string; // Currently selected token (optional until token picked)
  sceneId?: string;
  actorId?: string;
  createdAt: number;
}

// Map from userId to authenticated session
const authenticatedSessions = new Map<string, AuthenticatedSession>();

// Session token storage (persisted in world settings)
interface SessionToken {
  token: string;
  userId: string;
  userName: string;
  createdAt: number;
  expiresAt: number;
}

interface SessionTokenStore {
  [token: string]: SessionToken;
}

// Token expiry: 30 days
const SESSION_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// WebSocket connection to relay server
let relaySocket: WebSocket | null = null;

// Reconnection state
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

// Cleanup interval
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

// =============================================================================
// FOUNDRY HOOKS (Shell)
// =============================================================================

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing VTT Remote Control`);
  registerSettings();
});

Hooks.once('ready', () => {
  console.log(`${MODULE_ID} | VTT Remote Control ready`);

  // Ensure room code exists
  ensureRoomCode();

  // Start session cleanup interval
  cleanupInterval = setInterval(() => {
    cleanupExpiredSessions(pairingSessions, Date.now());
  }, 60000);

  // Auto-connect to relay
  connectToRelay();

  // Register Token Config button and context menu
  registerTokenConfig();

  // Register hooks for real-time actor updates
  registerActorUpdateHooks();
});

// =============================================================================
// SETTINGS (Shell)
// =============================================================================

function registerSettings(): void {
  game.settings?.register(MODULE_ID, 'relayServerUrl', {
    name: game.i18n?.localize('VTT_REMOTE.Settings.RelayServerUrl') ?? 'Relay Server URL',
    hint: game.i18n?.localize('VTT_REMOTE.Settings.RelayServerUrlHint') ?? 'WebSocket URL of the VTT Remote relay server (leave empty to auto-detect)',
    scope: 'world',
    config: true,
    type: String,
    default: '',
  });

  game.settings?.register(MODULE_ID, 'roomCode', {
    name: game.i18n?.localize('VTT_REMOTE.Settings.RoomCode') ?? 'Room Code',
    hint: game.i18n?.localize('VTT_REMOTE.Settings.RoomCodeHint') ?? 'Unique identifier for this game session',
    scope: 'world',
    config: true,
    type: String,
    default: '',
  });

  // Password storage - not visible in settings UI
  game.settings?.register(MODULE_ID, 'userPasswords', {
    name: 'User Passwords',
    scope: 'world',
    config: false, // Hidden from settings UI
    type: Object,
    default: {} as PasswordStore,
  });

  // Session token storage - not visible in settings UI
  game.settings?.register(MODULE_ID, 'sessionTokens', {
    name: 'Session Tokens',
    scope: 'world',
    config: false, // Hidden from settings UI
    type: Object,
    default: {} as SessionTokenStore,
  });

  // Menu for password management
  game.settings?.registerMenu(MODULE_ID, 'passwordManager', {
    name: game.i18n?.localize('VTT_REMOTE.Settings.PasswordManager') ?? 'Manage Remote Passwords',
    label: game.i18n?.localize('VTT_REMOTE.Settings.PasswordManagerLabel') ?? 'Manage Passwords',
    hint: game.i18n?.localize('VTT_REMOTE.Settings.PasswordManagerHint') ?? 'Set passwords for remote phone connections',
    icon: 'fas fa-key',
    type: PasswordManagerApp,
    restricted: false, // Allow players to access (they can only set their own)
  });
}

function ensureRoomCode(): string {
  let code = game.settings?.get(MODULE_ID, 'roomCode') as string;
  if (!code) {
    code = generateRoomCode(); // Pure function from core
    game.settings?.set(MODULE_ID, 'roomCode', code);
    console.log(`${MODULE_ID} | Generated room code: ${code}`);
  }
  return code;
}

// =============================================================================
// WEBSOCKET CONNECTION (Shell)
// =============================================================================

const RELAY_PORT = 8080;

/**
 * Get the relay WebSocket URL.
 * Defaults to vtt-remote.local (mDNS) if not configured.
 */
function getRelayUrl(): string {
  const configured = game.settings?.get(MODULE_ID, 'relayServerUrl') as string;
  const isSecure = window.location.protocol === 'https:';

  if (configured) {
    let url = configured.trim();

    // If user entered full URL with protocol, use as-is (just ensure /ws path)
    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      if (!url.endsWith('/ws')) {
        url = url.replace(/\/$/, '') + '/ws';
      }
      return url;
    }

    // Strip any accidental protocol prefixes (http://, https://)
    url = url.replace(/^https?:\/\//, '');

    // Add appropriate WebSocket protocol based on Foundry's protocol
    const protocol = isSecure ? 'wss://' : 'ws://';

    // If HTTP (insecure) and no port specified, add default port
    if (!isSecure && !url.includes(':')) {
      url = `${url}:${RELAY_PORT}`;
    }

    url = `${protocol}${url}`;

    // Ensure /ws path
    if (!url.endsWith('/ws')) {
      url = url.replace(/\/$/, '') + '/ws';
    }
    return url;
  }

  // Default to same hostname as Foundry (works when desktop app is on same machine)
  // For remote connections, users must configure the relay URL in module settings
  const protocol = isSecure ? 'wss://' : 'ws://';
  const hostname = window.location.hostname;
  return `${protocol}${hostname}:${RELAY_PORT}/ws`;
}

/**
 * Get the relay HTTP base URL for QR codes.
 */
function getRelayHttpUrl(): string {
  const wsUrl = getRelayUrl();
  return wsUrl.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '');
}

function connectToRelay(): void {
  const url = getRelayUrl();

  // Don't reconnect if already connected
  if (relaySocket?.readyState === WebSocket.OPEN) {
    return;
  }

  console.log(`${MODULE_ID} | Connecting to relay: ${url}`);
  relaySocket = new WebSocket(url);

  relaySocket.onopen = () => {
    console.log(`${MODULE_ID} | Connected to relay server`);
    reconnectAttempts = 0; // Reset on successful connection

    // Send JOIN message
    const roomCode = ensureRoomCode();
    sendMessage('JOIN', { room: roomCode });

    // Identify as Foundry client so server can track room status
    setTimeout(() => {
      sendMessage('IDENTIFY', { clientType: 'foundry' });
    }, 50);
  };

  relaySocket.onmessage = (event) => {
    handleMessage(event.data);
  };

  relaySocket.onclose = () => {
    console.log(`${MODULE_ID} | Disconnected from relay server`);
    relaySocket = null;
    scheduleReconnect();
  };

  relaySocket.onerror = (error) => {
    console.error(`${MODULE_ID} | WebSocket error:`, error);
  };
}

function scheduleReconnect(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;

  console.log(`${MODULE_ID} | Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  reconnectTimeout = setTimeout(connectToRelay, delay);
}

function sendMessage(type: string, payload: object): void {
  if (relaySocket?.readyState === WebSocket.OPEN) {
    const msg = buildMessage(type as any, payload); // Core function
    relaySocket.send(msg);
  }
}

// =============================================================================
// MESSAGE HANDLERS (Shell orchestrating Core)
// =============================================================================

function handleMessage(data: string): void {
  const msg = parseMessage(data); // Core
  if (!msg) {
    console.warn(`${MODULE_ID} | Invalid message:`, data);
    return;
  }

  const { handler, payload } = routeMessage(msg); // Core

  switch (handler) {
    case 'pair':
      handlePairRequest(payload);
      break;
    case 'login':
      handleLogin(payload);
      break;
    case 'loginWithToken':
      handleLoginWithToken(payload);
      break;
    case 'selectToken':
      handleSelectToken(payload);
      break;
    case 'move':
      handleMoveCommand(payload);
      break;
    case 'useAbility':
      handleUseAbility(payload);
      break;
    case 'rollDice':
      handleRollDice(payload);
      break;
    default:
      // Ignore other message types (they're for the phone client)
      break;
  }
}

function handlePairRequest(payload: unknown): void {
  if (!isPairPayload(payload)) { // Core type guard
    console.warn(`${MODULE_ID} | Invalid PAIR payload:`, payload);
    return;
  }

  const session = validateSession(pairingSessions, payload.code, Date.now()); // Core

  if (session) {
    // Get token info from Foundry
    const scene = game.scenes?.get(session.sceneId);
    const token = scene?.tokens?.get(session.tokenId);
    const actor = game.actors?.get(session.actorId);

    // Track this token for real-time updates
    pairedTokens.add(session.tokenId);

    sendMessage('PAIR_SUCCESS', {
      tokenId: session.tokenId,
      tokenName: token?.name ?? 'Unknown Token',
      actorName: actor?.name ?? '',
    });

    // Send initial actor info for the info panel
    console.log(`${MODULE_ID} | About to get actor panel data for token: ${session.tokenId}`);
    const actorData = getActorPanelData(session.tokenId, session.sceneId);
    console.log(`${MODULE_ID} | Got actor data:`, actorData);
    if (actorData) {
      sendMessage('ACTOR_INFO', actorData);
      console.log(`${MODULE_ID} | Sent ACTOR_INFO message`);
    } else {
      console.warn(`${MODULE_ID} | No actor data returned!`);
    }

    console.log(`${MODULE_ID} | Pairing successful for token: ${token?.name}`);
  } else {
    sendMessage('PAIR_FAILED', {
      reason: 'Invalid or expired pairing code',
    });

    console.log(`${MODULE_ID} | Pairing failed for code: ${payload.code}`);
  }
}

async function handleMoveCommand(payload: unknown): Promise<void> {
  if (!isMovePayload(payload)) { // Core type guard
    console.warn(`${MODULE_ID} | Invalid MOVE payload:`, payload);
    return;
  }

  if (!isValidDirection(payload.direction)) { // Core
    console.warn(`${MODULE_ID} | Invalid direction: ${payload.direction}`);
    return;
  }

  // Find the session for this token
  console.log(`${MODULE_ID} | Looking for session for token: ${payload.tokenId}`);
  console.log(`${MODULE_ID} | pairingSessions has ${pairingSessions.size} entries`);
  for (const [code, sess] of pairingSessions.entries()) {
    console.log(`${MODULE_ID} |   - ${code}: tokenId=${sess.tokenId}`);
  }
  const session = findSessionByToken(pairingSessions, payload.tokenId, Date.now()); // Core
  if (!session) {
    console.warn(`${MODULE_ID} | No active session for token: ${payload.tokenId}`);
    return;
  }

  // Get scene and token from Foundry
  const scene = game.scenes?.get(session.sceneId);
  const token = scene?.tokens?.get(payload.tokenId);

  if (!scene || !token) {
    console.warn(`${MODULE_ID} | Token or scene not found`);
    return;
  }

  // Calculate new position using core functions
  const gridSize = scene.grid?.size ?? 100;
  const currentPos = { x: token.x ?? 0, y: token.y ?? 0 };
  const delta = directionToDelta(payload.direction); // Core
  const newPos = applyMovement(currentPos, delta, gridSize); // Core

  // Clamp to scene bounds (optional)
  const dimensions = scene.dimensions;
  const clampedPos = clampPosition(
    newPos,
    0,
    0,
    dimensions?.width ?? undefined,
    dimensions?.height ?? undefined
  ); // Core

  // Update token position via Foundry API
  await token.update({ x: clampedPos.x, y: clampedPos.y });

  // Send acknowledgment
  sendMessage('MOVE_ACK', {
    tokenId: payload.tokenId,
    x: clampedPos.x,
    y: clampedPos.y,
  });
}

async function handleUseAbility(payload: unknown): Promise<void> {
  if (!isUseAbilityPayload(payload)) {
    console.warn(`${MODULE_ID} | Invalid USE_ABILITY payload:`, payload);
    return;
  }

  // Find the session for this token
  const session = findSessionByToken(pairingSessions, payload.tokenId, Date.now());
  if (!session) {
    console.warn(`${MODULE_ID} | No active session for token: ${payload.tokenId}`);
    sendMessage('USE_ABILITY_RESULT', {
      tokenId: payload.tokenId,
      itemId: payload.itemId,
      success: false,
      message: 'Session expired. Please re-pair.',
    });
    return;
  }

  // Get scene and token from Foundry
  const scene = game.scenes?.get(session.sceneId);
  const token = scene?.tokens?.get(payload.tokenId);
  const actor = token?.actor;

  if (!actor) {
    console.warn(`${MODULE_ID} | Actor not found for token: ${payload.tokenId}`);
    sendMessage('USE_ABILITY_RESULT', {
      tokenId: payload.tokenId,
      itemId: payload.itemId,
      success: false,
      message: 'Actor not found.',
    });
    return;
  }

  // Find the item on the actor
  const item = actor.items?.get(payload.itemId);
  if (!item) {
    console.warn(`${MODULE_ID} | Item not found: ${payload.itemId}`);
    sendMessage('USE_ABILITY_RESULT', {
      tokenId: payload.tokenId,
      itemId: payload.itemId,
      success: false,
      message: 'Ability not found.',
    });
    return;
  }

  try {
    // Use the item - this triggers rolls, chat messages, etc.
    console.log(`${MODULE_ID} | Using item: ${item.name}`);

    // dnd5e 3.x+ options to skip all configuration dialogs
    // Create a synthetic event with shiftKey to trigger "fast forward" mode
    const fastForwardEvent = new KeyboardEvent('keydown', { shiftKey: true });

    // Use Foundry's getSpeaker helper to properly attribute the message
    const speaker = ChatMessage.getSpeaker({ token, actor });

    // Try to find the owning user for this actor to attribute the message properly
    const ownerUserId = Object.entries(actor?.ownership ?? {})
      .find(([_id, level]) => level === 3)?.[0]; // OWNER = 3
    const ownerUser = ownerUserId ? game.users?.get(ownerUserId) : null;

    // dnd5e item.use(config, dialog, message) - speaker goes in message config
    await item.use(
      {
        // Use config
        event: fastForwardEvent, // Fast-forward rolls
      },
      {
        // Dialog config
        configure: false,  // Skip configuration dialog
      },
      {
        // Message config
        create: true,
        data: {
          speaker,
          user: ownerUser?.id ?? game.user?.id,
        },
      }
    );

    sendMessage('USE_ABILITY_RESULT', {
      tokenId: payload.tokenId,
      itemId: payload.itemId,
      success: true,
      message: `Used ${item.name}`,
    });

    // Send updated actor data (uses may have changed)
    const actorData = getActorPanelData(payload.tokenId, session.sceneId);
    if (actorData) {
      sendMessage('ACTOR_UPDATE', {
        tokenId: payload.tokenId,
        changes: actorData,
      });
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Error using item:`, err);
    sendMessage('USE_ABILITY_RESULT', {
      tokenId: payload.tokenId,
      itemId: payload.itemId,
      success: false,
      message: `Failed to use ${item.name}`,
    });
  }
}

async function handleRollDice(payload: unknown): Promise<void> {
  if (!isRollDicePayload(payload)) {
    console.warn(`${MODULE_ID} | Invalid ROLL_DICE payload:`, payload);
    return;
  }

  // Find the session for this token
  const session = findSessionByToken(pairingSessions, payload.tokenId, Date.now());
  if (!session) {
    console.warn(`${MODULE_ID} | No active session for token: ${payload.tokenId}`);
    sendMessage('ROLL_DICE_RESULT', {
      tokenId: payload.tokenId,
      formula: payload.formula,
      success: false,
      actorName: 'Unknown',
      postedToChat: false,
      error: 'Session expired. Please re-pair.',
    });
    return;
  }

  // Get scene and token from Foundry
  const scene = game.scenes?.get(session.sceneId);
  const token = scene?.tokens?.get(payload.tokenId);
  const actor = token?.actor;
  const actorName = actor?.name ?? token?.name ?? 'Unknown';

  try {
    // Create and evaluate the roll using Foundry's Roll API
    const roll = new Roll(payload.formula);
    await roll.evaluate();

    // Build breakdown string from dice terms
    const breakdown = formatRollBreakdown(roll);

    // Optionally post to chat
    if (payload.postToChat) {
      // Use Foundry's getSpeaker helper to properly attribute the message
      const speaker = ChatMessage.getSpeaker({ token, actor });

      // Try to find the owning user for this actor to attribute the message properly
      const ownerUserId = Object.entries(actor?.ownership ?? {})
        .find(([_id, level]) => level === 3)?.[0]; // OWNER = 3
      const ownerUser = ownerUserId ? game.users?.get(ownerUserId) : null;

      await roll.toMessage({
        speaker,
        flavor: payload.label ?? `Dice Roll`,
        user: ownerUser?.id ?? game.user?.id,
      });
    }

    console.log(`${MODULE_ID} | Roll result: ${payload.formula} = ${roll.total}`);

    sendMessage('ROLL_DICE_RESULT', {
      tokenId: payload.tokenId,
      formula: payload.formula,
      success: true,
      total: roll.total,
      breakdown,
      actorName,
      postedToChat: payload.postToChat,
    });
  } catch (err) {
    console.error(`${MODULE_ID} | Error rolling dice:`, err);
    sendMessage('ROLL_DICE_RESULT', {
      tokenId: payload.tokenId,
      formula: payload.formula,
      success: false,
      actorName,
      postedToChat: false,
      error: `Invalid formula: ${payload.formula}`,
    });
  }
}

/**
 * Format a roll's breakdown string showing individual dice results.
 * Example: "2d6+3" rolled [4, 2] → "[4, 2] + 3 = 9"
 */
function formatRollBreakdown(roll: any): string {
  const parts: string[] = [];

  for (const term of roll.terms ?? []) {
    if (term.results) {
      // Dice term - show individual results
      const results = term.results.map((r: any) => r.result);
      parts.push(`[${results.join(', ')}]`);
    } else if (term.operator) {
      // Operator term (+, -, etc.)
      parts.push(term.operator);
    } else if (typeof term.number === 'number') {
      // Numeric modifier
      parts.push(String(term.number));
    }
  }

  return `${parts.join(' ')} = ${roll.total}`;
}

// =============================================================================
// ACTOR INFO PANEL (Shell)
// =============================================================================

/**
 * Get normalized actor panel data using the system adapter.
 */
function getActorPanelData(tokenId: string, sceneId?: string): ActorPanelData | null {
  console.log(`${MODULE_ID} | Getting actor panel data for token: ${tokenId}, scene: ${sceneId}`);
  console.log(`${MODULE_ID} | Current system ID: ${game.system?.id}`);

  const adapter = getAdapter();
  if (!adapter) {
    console.warn(`${MODULE_ID} | No adapter for system: ${game.system?.id}`);
    return null;
  }
  console.log(`${MODULE_ID} | Found adapter: ${adapter.systemId}`);

  // Find the token - check specific scene or search all scenes
  let token: any = null;
  if (sceneId) {
    const scene = game.scenes?.get(sceneId);
    token = scene?.tokens?.get(tokenId);
  } else {
    // Search all scenes for the token
    for (const scene of game.scenes ?? []) {
      token = scene.tokens?.get(tokenId);
      if (token) break;
    }
  }

  if (!token) {
    console.warn(`${MODULE_ID} | Token not found: ${tokenId}`);
    return null;
  }

  const actor = token.actor;
  if (!actor) {
    console.warn(`${MODULE_ID} | Token has no actor: ${tokenId}`);
    return null;
  }

  try {
    const data = adapter.extractActorData(actor, token);
    console.log(`${MODULE_ID} | Extracted actor data:`, data);
    return data;
  } catch (err) {
    console.error(`${MODULE_ID} | Error extracting actor data:`, err);
    return null;
  }
}

/**
 * Register hooks for real-time actor/token updates.
 */
function registerActorUpdateHooks(): void {
  // Hook actor updates (HP changes, etc.)
  Hooks.on('updateActor', (actor: any, _changes: any, _options: any, _userId: string) => {
    // Find tokens for this actor that are paired
    for (const scene of game.scenes ?? []) {
      for (const token of scene.tokens ?? []) {
        if (token.actorId === actor.id && pairedTokens.has(token.id)) {
          const actorData = getActorPanelData(token.id, scene.id);
          if (actorData) {
            sendMessage('ACTOR_UPDATE', {
              tokenId: token.id,
              changes: actorData,
            });
          }
        }
      }
    }
  });

  // Hook token updates (conditions, effects, etc.)
  Hooks.on('updateToken', (token: any, _changes: any, _options: any, _userId: string) => {
    if (pairedTokens.has(token.id)) {
      const actorData = getActorPanelData(token.id);
      if (actorData) {
        sendMessage('ACTOR_UPDATE', {
          tokenId: token.id,
          changes: actorData,
        });
      }
    }
  });

  console.log(`${MODULE_ID} | Actor update hooks registered`);
}

/**
 * Remove a token from the paired set when session expires.
 */
function cleanupPairedToken(tokenId: string): void {
  pairedTokens.delete(tokenId);
}

// =============================================================================
// TOKEN CONFIG (Shell)
// =============================================================================

function registerTokenConfig(): void {
  // Add "Remote Pairing" button to Token Config sheet header
  Hooks.on('renderTokenConfig', (app: any, html: HTMLElement | JQuery, _data: any) => {
    const token = app.token ?? app.document;
    if (!token) return;

    // Handle both jQuery (v11) and HTMLElement (v13)
    const element = html instanceof HTMLElement ? html : html[0];
    const headerTitle = element.querySelector('.window-header .window-title');
    if (!headerTitle) return;

    // Create button
    const button = document.createElement('a');
    button.className = 'vtt-remote-config-btn';
    button.title = game.i18n?.localize('VTT_REMOTE.Title') ?? 'Remote Control';
    button.innerHTML = '<i class="fas fa-mobile-alt"></i>';

    button.addEventListener('click', (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      showPairingDialog({
        _id: token.id,
        actorId: token.actorId,
        name: token.name,
      });
    });

    headerTitle.after(button);
  });

  // Also keep context menu option as fallback
  Hooks.on('getTokenContextOptions', (_html: any, options: any[]) => {
    options.push({
      name: game.i18n?.localize('VTT_REMOTE.Title') ?? 'Remote Control',
      icon: '<i class="fas fa-mobile-alt"></i>',
      condition: () => true,
      callback: (tokens: any) => {
        const token = tokens[0]?.document ?? tokens[0];
        if (token) {
          showPairingDialog({
            _id: token.id,
            actorId: token.actorId,
            name: token.name,
          });
        }
      },
    });
  });
}

// =============================================================================
// PAIRING DIALOG (Shell)
// =============================================================================

async function showPairingDialog(tokenData: any): Promise<void> {
  const tokenId = tokenData._id;
  const actorId = tokenData.actorId;
  const sceneId = canvas?.scene?.id ?? '';

  if (!tokenId || !sceneId) {
    ui.notifications?.warn('Cannot create pairing: invalid token or scene');
    return;
  }

  // Create session using core function
  const session = createSession(tokenId, sceneId, actorId ?? '', Date.now()); // Core
  pairingSessions.set(session.code, session);

  // Schedule auto-expire
  setTimeout(() => {
    pairingSessions.delete(session.code);
    cleanupPairedToken(session.tokenId);
  }, SESSION_TTL_MS);

  const roomCode = ensureRoomCode();

  // Build URL for QR code (phone connects to web client with params)
  const clientUrl = `${getRelayHttpUrl()}?room=${roomCode}&code=${session.code}`;

  const isConnected = relaySocket?.readyState === WebSocket.OPEN;
  const connectionClass = isConnected ? 'connected' : 'disconnected';
  const connectionStatus = isConnected
    ? game.i18n?.localize('VTT_REMOTE.Status.Connected') ?? 'Connected'
    : game.i18n?.localize('VTT_REMOTE.Status.Disconnected') ?? 'Disconnected';

  const content = `
    <div class="vtt-remote-pairing">
      <p>${game.i18n?.localize('VTT_REMOTE.PairingDialog.Instructions') ?? 'Enter this code on your phone:'}</p>
      <div class="vtt-remote-pairing-code">${session.code}</div>
      <div class="vtt-remote-qr">
        <canvas id="vtt-remote-qr-canvas"></canvas>
      </div>
      <p class="notes">Room: <strong>${roomCode}</strong></p>
      <p class="notes">${game.i18n?.localize('VTT_REMOTE.PairingDialog.Expires') ?? 'Code expires in 5 minutes'}</p>
      <div class="vtt-remote-status">
        <span class="vtt-remote-status-indicator ${connectionClass}"></span>
        <span>${connectionStatus}</span>
      </div>
    </div>
  `;

  new Dialog({
    title: game.i18n?.localize('VTT_REMOTE.PairingDialog.Title') ?? 'Remote Pairing',
    content,
    buttons: {
      close: {
        icon: '<i class="fas fa-times"></i>',
        label: 'Close',
      },
    },
    render: (element: HTMLElement | JQuery) => {
      // Generate QR code
      const html = element instanceof HTMLElement ? $(element) : element;
      import('qrcode').then((QRCode) => {
        const qrCanvas = html.find('#vtt-remote-qr-canvas')[0] as HTMLCanvasElement;
        if (qrCanvas) {
          QRCode.toCanvas(qrCanvas, clientUrl, { width: 200 });
        }
      }).catch((err) => {
        console.warn(`${MODULE_ID} | QR code generation failed:`, err);
      });
    },
    default: 'close',
  }).render(true);

  console.log(`${MODULE_ID} | Created pairing session: ${session.code} for token: ${tokenData.name}`);
}

// =============================================================================
// CLEANUP (Shell)
// =============================================================================

Hooks.once('closeApplication', () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }
  if (relaySocket) {
    relaySocket.close();
  }
});

// =============================================================================
// PASSWORD MANAGEMENT (Shell)
// =============================================================================

/**
 * Browser-compatible SHA-256 hash using SubtleCrypto.
 */
async function hashPasswordBrowser(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Set a user's password (hashed and stored in world settings).
 */
async function setUserPassword(userId: string, password: string): Promise<void> {
  const roomCode = ensureRoomCode();
  const hash = await hashPasswordBrowser(password, roomCode);

  const passwords = (game.settings?.get(MODULE_ID, 'userPasswords') as PasswordStore) ?? {};
  const currentUserId = game.user?.id ?? '';

  passwords[userId] = {
    hash,
    setBy: currentUserId,
    setAt: Date.now(),
  };

  await game.settings?.set(MODULE_ID, 'userPasswords', passwords);
  console.log(`${MODULE_ID} | Password set for user: ${userId}`);
}

/**
 * Clear a user's password.
 */
async function clearUserPassword(userId: string): Promise<void> {
  const passwords = (game.settings?.get(MODULE_ID, 'userPasswords') as PasswordStore) ?? {};

  if (passwords[userId]) {
    delete passwords[userId];
    await game.settings?.set(MODULE_ID, 'userPasswords', passwords);
    console.log(`${MODULE_ID} | Password cleared for user: ${userId}`);
  }
}

/**
 * Verify a user's password (compare hashes).
 */
function verifyUserPassword(userId: string, passwordHash: string): boolean {
  const passwords = (game.settings?.get(MODULE_ID, 'userPasswords') as PasswordStore) ?? {};
  const entry = passwords[userId];

  if (!entry) {
    return false;
  }

  // Direct hash comparison (phone already hashed with same salt)
  return entry.hash === passwordHash;
}

// =============================================================================
// SESSION TOKEN MANAGEMENT (Shell)
// =============================================================================

/**
 * Generate a cryptographically random session token.
 */
function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create and store a new session token for a user.
 */
async function createSessionToken(userId: string, userName: string): Promise<string> {
  const tokens = (game.settings?.get(MODULE_ID, 'sessionTokens') as SessionTokenStore) ?? {};
  const now = Date.now();

  // Clean up expired tokens while we're here
  for (const [token, data] of Object.entries(tokens)) {
    if (data.expiresAt < now) {
      delete tokens[token];
    }
  }

  // Generate new token
  const token = generateSessionToken();
  tokens[token] = {
    token,
    userId,
    userName,
    createdAt: now,
    expiresAt: now + SESSION_TOKEN_TTL_MS,
  };

  await game.settings?.set(MODULE_ID, 'sessionTokens', tokens);
  console.log(`${MODULE_ID} | Session token created for user: ${userName}`);

  return token;
}

/**
 * Validate a session token and return user info if valid.
 */
function validateSessionToken(token: string): SessionToken | null {
  const tokens = (game.settings?.get(MODULE_ID, 'sessionTokens') as SessionTokenStore) ?? {};
  const entry = tokens[token];

  if (!entry) {
    return null;
  }

  // Check expiry
  if (entry.expiresAt < Date.now()) {
    return null;
  }

  return entry;
}

// Expose revokeSessionToken for GM use via console
// Usage: game.modules.get('vtt-remote').api.revokeSessionToken(token)
(window as any).vttRemoteApi = {
  revokeSessionToken: async (token: string): Promise<void> => {
    const tokens = (game.settings?.get(MODULE_ID, 'sessionTokens') as SessionTokenStore) ?? {};
    if (tokens[token]) {
      delete tokens[token];
      await game.settings?.set(MODULE_ID, 'sessionTokens', tokens);
      console.log(`${MODULE_ID} | Session token revoked`);
    }
  },
};

// =============================================================================
// LOGIN HANDLERS (Shell)
// =============================================================================

/**
 * Handle LOGIN request from phone client.
 */
async function handleLogin(payload: unknown): Promise<void> {
  if (!isLoginPayload(payload)) {
    console.warn(`${MODULE_ID} | Invalid LOGIN payload:`, payload);
    return;
  }

  const { username, passwordHash } = payload;

  // Find user by name
  const user = game.users?.find((u: any) => u.name === username);
  if (!user) {
    sendMessage('LOGIN_FAILED', { reason: 'user_not_found' });
    console.log(`${MODULE_ID} | Login failed: user not found: ${username}`);
    return;
  }

  // Check if user has a password set
  const passwords = (game.settings?.get(MODULE_ID, 'userPasswords') as PasswordStore) ?? {};
  if (!passwords[user.id]) {
    sendMessage('LOGIN_FAILED', { reason: 'no_password_set' });
    console.log(`${MODULE_ID} | Login failed: no password set for: ${username}`);
    return;
  }

  // Verify password
  if (!verifyUserPassword(user.id, passwordHash)) {
    sendMessage('LOGIN_FAILED', { reason: 'invalid_credentials' });
    console.log(`${MODULE_ID} | Login failed: invalid credentials for: ${username}`);
    return;
  }

  // Get controllable tokens for this user
  const isGM = user.isGM ?? false;
  const scenes = getSceneData();
  const availableTokens = getControllableTokens(user.id, isGM, scenes);

  // Create authenticated session
  const session: AuthenticatedSession = {
    userId: user.id,
    userName: user.name,
    createdAt: Date.now(),
  };
  authenticatedSessions.set(user.id, session);

  // Generate session token for "remember me"
  const sessionToken = await createSessionToken(user.id, user.name);

  // Send success with token list and session token
  sendMessage('LOGIN_SUCCESS', {
    userId: user.id,
    userName: user.name,
    sessionToken,
    availableTokens,
  });

  console.log(`${MODULE_ID} | Login successful for: ${username}, ${availableTokens.length} tokens available`);
}

/**
 * Handle LOGIN_WITH_TOKEN request from phone client.
 */
function handleLoginWithToken(payload: unknown): void {
  if (!isLoginWithTokenPayload(payload)) {
    console.warn(`${MODULE_ID} | Invalid LOGIN_WITH_TOKEN payload:`, payload);
    return;
  }

  const { sessionToken } = payload;

  // Validate the session token
  const tokenData = validateSessionToken(sessionToken);
  if (!tokenData) {
    sendMessage('LOGIN_FAILED', { reason: 'invalid_token' });
    console.log(`${MODULE_ID} | Token login failed: invalid or expired token`);
    return;
  }

  // Verify user still exists
  const user = game.users?.get(tokenData.userId);
  if (!user) {
    sendMessage('LOGIN_FAILED', { reason: 'user_not_found' });
    console.log(`${MODULE_ID} | Token login failed: user no longer exists`);
    return;
  }

  // Get controllable tokens for this user
  const isGM = user.isGM ?? false;
  const scenes = getSceneData();
  const availableTokens = getControllableTokens(user.id, isGM, scenes);

  // Create authenticated session
  const session: AuthenticatedSession = {
    userId: user.id,
    userName: user.name,
    createdAt: Date.now(),
  };
  authenticatedSessions.set(user.id, session);

  // Send success with same token (still valid)
  sendMessage('LOGIN_SUCCESS', {
    userId: user.id,
    userName: user.name,
    sessionToken,
    availableTokens,
  });

  console.log(`${MODULE_ID} | Token login successful for: ${user.name}, ${availableTokens.length} tokens available`);
}

/**
 * Handle SELECT_TOKEN request from phone client.
 */
function handleSelectToken(payload: unknown): void {
  if (!isSelectTokenPayload(payload)) {
    console.warn(`${MODULE_ID} | Invalid SELECT_TOKEN payload:`, payload);
    return;
  }

  const { tokenId, sceneId } = payload;

  // Get token info from Foundry
  const scene = game.scenes?.get(sceneId);
  const token = scene?.tokens?.get(tokenId);
  const actor = token?.actor;

  if (!token) {
    console.warn(`${MODULE_ID} | Token not found: ${tokenId}`);
    return;
  }

  // Create a session in pairingSessions so move/ability handlers work
  // Use a synthetic code based on tokenId to avoid collisions
  const sessionCode = `login-${tokenId}`;
  const session = {
    code: sessionCode,
    tokenId,
    sceneId,
    actorId: actor?.id ?? '',
    createdAt: Date.now(),
  };
  pairingSessions.set(sessionCode, session);
  console.log(`${MODULE_ID} | Created session for login:`, session);
  console.log(`${MODULE_ID} | pairingSessions now has ${pairingSessions.size} entries`);

  // Track this token for real-time updates
  pairedTokens.add(tokenId);

  // Send success
  sendMessage('SELECT_TOKEN_SUCCESS', {
    tokenId,
    tokenName: token.name ?? 'Unknown Token',
    actorName: actor?.name ?? '',
  });

  // Send initial actor info
  const actorData = getActorPanelData(tokenId, sceneId);
  if (actorData) {
    sendMessage('ACTOR_INFO', actorData);
  }

  console.log(`${MODULE_ID} | Token selected: ${token.name} (session: ${sessionCode})`);
}

/**
 * Get scene data in the format expected by getControllableTokens.
 */
function getSceneData(): SceneData[] {
  const scenes: SceneData[] = [];

  for (const scene of game.scenes ?? []) {
    const tokens: SceneData['tokens'] = [];

    for (const token of scene.tokens ?? []) {
      const actor = token.actor;
      tokens.push({
        id: token.id,
        name: token.name,
        actorId: actor?.id ?? '',
        img: token.texture?.src ?? token.img ?? '',
        ownership: actor?.ownership ?? {},
      });
    }

    scenes.push({
      id: scene.id,
      name: scene.name,
      tokens,
    });
  }

  return scenes;
}
