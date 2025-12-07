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
declare function $(selector: any): any;

import {
  // Messages
  parseMessage,
  buildMessage,
  routeMessage,
  isPairPayload,
  isMovePayload,
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
} from './core';

// Module configuration
const MODULE_ID = 'vtt-remote';

// Active pairing sessions (stored in memory only)
const pairingSessions = new Map<string, PairingSession>();

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

  // Register Token HUD button
  registerTokenHUD();
});

// =============================================================================
// SETTINGS (Shell)
// =============================================================================

function registerSettings(): void {
  game.settings?.register(MODULE_ID, 'relayServerUrl', {
    name: game.i18n?.localize('VTT_REMOTE.Settings.RelayServerUrl') ?? 'Relay Server URL',
    hint: game.i18n?.localize('VTT_REMOTE.Settings.RelayServerUrlHint') ?? 'WebSocket URL of the VTT Remote relay server',
    scope: 'world',
    config: true,
    type: String,
    default: 'ws://localhost:8080/ws',
  });

  game.settings?.register(MODULE_ID, 'roomCode', {
    name: game.i18n?.localize('VTT_REMOTE.Settings.RoomCode') ?? 'Room Code',
    hint: game.i18n?.localize('VTT_REMOTE.Settings.RoomCodeHint') ?? 'Unique identifier for this game session',
    scope: 'world',
    config: true,
    type: String,
    default: '',
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

function connectToRelay(): void {
  const url = game.settings?.get(MODULE_ID, 'relayServerUrl') as string;

  if (!url) {
    console.warn(`${MODULE_ID} | No relay server URL configured`);
    return;
  }

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
    case 'move':
      handleMoveCommand(payload);
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

    sendMessage('PAIR_SUCCESS', {
      tokenId: session.tokenId,
      tokenName: token?.name ?? 'Unknown Token',
      actorName: actor?.name ?? '',
    });

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

// =============================================================================
// TOKEN HUD (Shell)
// =============================================================================

function registerTokenHUD(): void {
  Hooks.on('renderTokenHUD', (_app: unknown, html: JQuery, data: Record<string, unknown>) => {
    const button = $(`
      <div class="control-icon vtt-remote-hud-button" title="${game.i18n?.localize('VTT_REMOTE.Title') ?? 'Remote Control'}">
        <i class="fas fa-mobile-alt"></i>
      </div>
    `);

    button.on('click', (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      showPairingDialog(data);
    });

    html.find('.col.left').append(button);
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
  }, SESSION_TTL_MS);

  const roomCode = ensureRoomCode();
  const relayUrl = game.settings?.get(MODULE_ID, 'relayServerUrl') as string;

  // Build URL for QR code (phone connects to web client with params)
  const baseUrl = relayUrl.replace('/ws', '').replace('ws://', 'http://').replace('wss://', 'https://');
  const clientUrl = `${baseUrl}?room=${roomCode}&code=${session.code}`;

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
