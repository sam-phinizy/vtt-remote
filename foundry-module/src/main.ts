/**
 * VTT Remote Control - Foundry Module Entry Point
 *
 * This module enables phone-based remote control for token movement.
 * It acts as the "Host" - generating pairing codes and executing
 * movement commands received from the relay server.
 */

// Module configuration
const MODULE_ID = 'vtt-remote';

interface PairingSession {
  code: string;
  actorId: string;
  tokenId: string;
  sceneId: string;
  createdAt: number;
}

// Active pairing sessions (stored in memory only)
const pairingSessions = new Map<string, PairingSession>();

// WebSocket connection to relay server
let relaySocket: WebSocket | null = null;

/**
 * Initialize the module when Foundry is ready.
 */
Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing VTT Remote Control`);

  // Register module settings
  registerSettings();
});

/**
 * Set up hooks after Foundry is fully ready.
 */
Hooks.once('ready', () => {
  console.log(`${MODULE_ID} | VTT Remote Control ready`);

  // TODO: Add UI button to token HUD for generating pairing codes
  // TODO: Connect to relay server
});

/**
 * Register module settings.
 */
function registerSettings(): void {
  game.settings?.register(MODULE_ID, 'relayServerUrl', {
    name: 'Relay Server URL',
    hint: 'WebSocket URL of the VTT Remote relay server',
    scope: 'world',
    config: true,
    type: String,
    default: 'ws://localhost:8080/ws',
  });

  game.settings?.register(MODULE_ID, 'roomCode', {
    name: 'Room Code',
    hint: 'Unique identifier for this game session',
    scope: 'world',
    config: true,
    type: String,
    default: '',
  });
}

/**
 * Generate a random 4-digit pairing code.
 */
function generatePairingCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Create a new pairing session for a token.
 */
export function createPairingSession(
  actorId: string,
  tokenId: string,
  sceneId: string
): string {
  const code = generatePairingCode();

  const session: PairingSession = {
    code,
    actorId,
    tokenId,
    sceneId,
    createdAt: Date.now(),
  };

  pairingSessions.set(code, session);

  // Auto-expire after 5 minutes
  setTimeout(() => {
    pairingSessions.delete(code);
  }, 5 * 60 * 1000);

  console.log(`${MODULE_ID} | Created pairing session: ${code}`);
  return code;
}

/**
 * Validate a pairing request and return session data if valid.
 */
export function validatePairingCode(
  code: string
): PairingSession | null {
  return pairingSessions.get(code) ?? null;
}

/**
 * Connect to the relay server via WebSocket.
 */
export function connectToRelay(): void {
  const url = game.settings?.get(MODULE_ID, 'relayServerUrl') as string;

  if (!url) {
    console.warn(`${MODULE_ID} | No relay server URL configured`);
    return;
  }

  relaySocket = new WebSocket(url);

  relaySocket.onopen = () => {
    console.log(`${MODULE_ID} | Connected to relay server`);
    // TODO: Send room join message
  };

  relaySocket.onmessage = (event) => {
    // TODO: Handle incoming messages (PAIR requests, MOVE commands)
    console.log(`${MODULE_ID} | Received:`, event.data);
  };

  relaySocket.onclose = () => {
    console.log(`${MODULE_ID} | Disconnected from relay server`);
    relaySocket = null;
    // TODO: Implement reconnection logic
  };

  relaySocket.onerror = (error) => {
    console.error(`${MODULE_ID} | WebSocket error:`, error);
  };
}

/**
 * Move a token by grid units.
 */
export async function moveToken(
  tokenId: string,
  sceneId: string,
  dx: number,
  dy: number
): Promise<void> {
  const scene = game.scenes?.get(sceneId);
  if (!scene) {
    console.warn(`${MODULE_ID} | Scene not found: ${sceneId}`);
    return;
  }

  const token = scene.tokens?.get(tokenId);
  if (!token) {
    console.warn(`${MODULE_ID} | Token not found: ${tokenId}`);
    return;
  }

  // Calculate new position based on grid size
  const gridSize = scene.grid?.size ?? 100;
  const newX = (token.x ?? 0) + dx * gridSize;
  const newY = (token.y ?? 0) + dy * gridSize;

  await token.update({ x: newX, y: newY });
}
