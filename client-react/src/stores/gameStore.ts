import { create } from 'zustand';
import { sha256 } from 'js-sha256';
import type {
  Screen,
  AuthMode,
  ActorData,
  AvailableToken,
  Direction,
  RollDiceResult,
  RoomStatusPayload,
  WSMessage,
} from '@/types';

const MOVE_THROTTLE_MS = 150;
const MAX_RECONNECT_DELAY = 30000;
const HAPTIC_DURATION = 10;

interface GameState {
  // Connection state
  socket: WebSocket | null;
  isConnected: boolean;
  isPaired: boolean;
  isLoggedIn: boolean;
  reconnectAttempts: number;
  foundryConnected: boolean; // Is Foundry VTT connected to the room?

  // Navigation
  screen: Screen;
  authMode: AuthMode;

  // Room/token state
  roomCode: string;
  tokenId: string | null;
  tokenName: string | null;

  // Login state
  userId: string | null;
  userName: string | null;
  sessionToken: string | null; // For "remember me" auto-login
  availableTokens: AvailableToken[];

  // Actor data
  actorData: ActorData | null;

  // Dice rolling
  lastDiceResult: RollDiceResult | null;

  // Move throttling
  lastMoveTime: number;

  // Actions
  setScreen: (screen: Screen) => void;
  setAuthMode: (mode: AuthMode) => void;
  setRoomCode: (code: string) => void;

  // Connection actions
  connect: (roomCode: string) => void;
  connectForStatus: (roomCode: string) => void; // Connect just to get room status
  disconnect: () => void;
  sendMessage: <T>(type: string, payload: T) => void;

  // Auth actions
  pair: (pairingCode: string) => void;
  login: (username: string, passwordHash: string) => void;
  loginWithToken: () => void; // Auto-login with stored session token
  hasStoredSession: () => boolean; // Check if we have a stored session
  selectToken: (tokenId: string, sceneId: string) => void;
  logout: () => void;
  clearStoredSession: () => void; // Clear stored session token

  // Game actions
  move: (direction: Direction) => void;
  rollDice: (formula: string, postToChat: boolean) => void;
  useAbility: (itemId: string) => void;
}

// Helper: haptic feedback
function hapticFeedback(duration: number) {
  if (navigator.vibrate) {
    navigator.vibrate(duration);
  }
}

// Helper: hash password with SHA-256
// Uses js-sha256 library to work in non-secure contexts (HTTP over LAN)
function hashPassword(password: string, salt: string): string {
  return sha256(password + salt);
}

export { hashPassword };

export const useGameStore = create<GameState>((set, get) => {
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingPairingCode: string | null = null;
  let pendingLogin: { username: string; passwordHash: string } | null = null;

  function scheduleReconnect() {
    const state = get();
    if (reconnectTimeout) clearTimeout(reconnectTimeout);

    const delay = Math.min(
      1000 * Math.pow(2, state.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );

    set({ reconnectAttempts: state.reconnectAttempts + 1 });

    reconnectTimeout = setTimeout(() => {
      if (get().isPaired) {
        get().connect(get().roomCode);
      }
    }, delay);
  }

  function handleMessage(event: MessageEvent) {
    let msg: WSMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.warn('Invalid message:', event.data);
      return;
    }

    const { type, payload } = msg;

    switch (type) {
      case 'ROOM_STATUS': {
        const status = payload as RoomStatusPayload;
        set({ foundryConnected: status.foundryConnected });
        break;
      }
      case 'PAIR_SUCCESS':
        handlePairSuccess(payload as { tokenId: string; tokenName?: string });
        break;
      case 'PAIR_FAILED':
        handlePairFailed(payload as { reason?: string });
        break;
      case 'LOGIN_SUCCESS':
        handleLoginSuccess(
          payload as {
            userId: string;
            userName: string;
            sessionToken: string;
            availableTokens: AvailableToken[];
          }
        );
        break;
      case 'LOGIN_FAILED':
        handleLoginFailed(payload as { reason?: string });
        break;
      case 'SELECT_TOKEN_SUCCESS':
        handleSelectTokenSuccess(
          payload as { tokenId: string; tokenName?: string }
        );
        break;
      case 'ACTOR_INFO':
        set({ actorData: payload as ActorData });
        break;
      case 'ACTOR_UPDATE': {
        const update = payload as { tokenId: string; changes: ActorData };
        if (update.tokenId === get().tokenId) {
          set({ actorData: update.changes });
        }
        break;
      }
      case 'ROLL_DICE_RESULT': {
        const result = payload as RollDiceResult;
        if (result.tokenId === get().tokenId) {
          set({ lastDiceResult: result });
          hapticFeedback(result.success ? 30 : 100);
        }
        break;
      }
      case 'USE_ABILITY_RESULT':
        // Could add toast notification here
        break;
    }
  }

  function handlePairSuccess(payload: { tokenId: string; tokenName?: string }) {
    set({
      isPaired: true,
      isConnected: true,
      tokenId: payload.tokenId,
      tokenName: payload.tokenName || 'Token',
      screen: 'control',
      reconnectAttempts: 0,
    });
    hapticFeedback(50);
  }

  function handlePairFailed(_payload: { reason?: string }) {
    pendingPairingCode = null;
    // Could add toast notification here
  }

  function handleLoginSuccess(payload: {
    userId: string;
    userName: string;
    sessionToken: string;
    availableTokens: AvailableToken[];
  }) {
    // Store session token for auto-login
    localStorage.setItem('vtt-remote-session-token', payload.sessionToken);
    localStorage.setItem('vtt-remote-session-user', payload.userName);

    set({
      isLoggedIn: true,
      isConnected: true,
      userId: payload.userId,
      userName: payload.userName,
      sessionToken: payload.sessionToken,
      availableTokens: payload.availableTokens || [],
      screen: 'token-picker',
      reconnectAttempts: 0,
    });
  }

  function handleLoginFailed(payload: { reason?: string }) {
    // If token login failed, clear stored session
    if (payload.reason === 'invalid_token' || payload.reason === 'token_expired') {
      localStorage.removeItem('vtt-remote-session-token');
      localStorage.removeItem('vtt-remote-session-user');
      set({ sessionToken: null });
    }
    // Could add toast notification here
  }

  function handleSelectTokenSuccess(payload: {
    tokenId: string;
    tokenName?: string;
  }) {
    set({
      isPaired: true,
      tokenId: payload.tokenId,
      tokenName: payload.tokenName || 'Token',
      screen: 'control',
    });
    hapticFeedback(50);
  }

  return {
    // Initial state
    socket: null,
    isConnected: false,
    isPaired: false,
    isLoggedIn: false,
    reconnectAttempts: 0,
    foundryConnected: false,
    screen: 'auth',
    authMode: 'login',
    roomCode: localStorage.getItem('vtt-remote-room') || '',
    tokenId: null,
    tokenName: null,
    userId: null,
    userName: null,
    sessionToken: localStorage.getItem('vtt-remote-session-token'),
    availableTokens: [],
    actorData: null,
    lastDiceResult: null,
    lastMoveTime: 0,

    // Navigation
    setScreen: (screen) => set({ screen }),
    setAuthMode: (authMode) => set({ authMode }),
    setRoomCode: (roomCode) => {
      localStorage.setItem('vtt-remote-room', roomCode);
      set({ roomCode });
    },

    // Connection
    connect: (roomCode) => {
      const state = get();
      if (state.socket?.readyState === WebSocket.OPEN) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        set({ reconnectAttempts: 0 });
        get().sendMessage('JOIN', { room: roomCode });

        // Identify as phone client
        setTimeout(() => {
          get().sendMessage('IDENTIFY', { clientType: 'phone' });
        }, 25);

        // If we have a pending pairing code, send it after JOIN
        if (pendingPairingCode) {
          setTimeout(() => {
            get().sendMessage('PAIR', { code: pendingPairingCode });
            pendingPairingCode = null;
          }, 50);
        }

        // If we have pending login credentials, send after JOIN
        if (pendingLogin) {
          setTimeout(() => {
            get().sendMessage('LOGIN', pendingLogin);
            pendingLogin = null;
          }, 50);
        }
      };

      socket.onmessage = handleMessage;

      socket.onclose = () => {
        set({ isConnected: false });
        if (get().isPaired) {
          scheduleReconnect();
        }
      };

      socket.onerror = () => {
        // Could add toast notification here
      };

      set({ socket, roomCode });
      localStorage.setItem('vtt-remote-room', roomCode);
    },

    // Connect just to get room status (no login/pair)
    connectForStatus: (roomCode) => {
      const state = get();

      // If already connected to this room, no need to reconnect
      if (state.socket?.readyState === WebSocket.OPEN && state.roomCode === roomCode) {
        return;
      }

      // If connected to a different room, disconnect first
      if (state.socket) {
        state.socket.close();
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        set({ reconnectAttempts: 0, isConnected: true });
        get().sendMessage('JOIN', { room: roomCode });

        // Identify as phone client
        setTimeout(() => {
          get().sendMessage('IDENTIFY', { clientType: 'phone' });
        }, 25);
      };

      socket.onmessage = handleMessage;

      socket.onclose = () => {
        set({ isConnected: false, foundryConnected: false });
      };

      socket.onerror = () => {
        // Silent error for status check
      };

      set({ socket, roomCode, foundryConnected: false });
      localStorage.setItem('vtt-remote-room', roomCode);
    },

    disconnect: () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      const { socket } = get();
      if (socket) {
        socket.close();
      }

      set({
        socket: null,
        isConnected: false,
        isPaired: false,
        tokenId: null,
        tokenName: null,
        actorData: null,
        screen: 'auth',
        reconnectAttempts: 0,
      });
    },

    sendMessage: (type, payload) => {
      const { socket } = get();
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type, payload }));
      }
    },

    // Auth
    pair: (pairingCode) => {
      const { socket, roomCode } = get();
      // If already connected, send PAIR directly
      if (socket?.readyState === WebSocket.OPEN) {
        get().sendMessage('PAIR', { code: pairingCode });
      } else {
        // Otherwise connect first, then pair
        pendingPairingCode = pairingCode;
        get().connect(roomCode);
      }
    },

    login: (username, passwordHash) => {
      const { socket, roomCode } = get();
      // If already connected, send LOGIN directly
      if (socket?.readyState === WebSocket.OPEN) {
        get().sendMessage('LOGIN', { username, passwordHash });
      } else {
        // Otherwise connect first, then login
        pendingLogin = { username, passwordHash };
        get().connect(roomCode);
      }
    },

    loginWithToken: () => {
      const sessionToken = localStorage.getItem('vtt-remote-session-token');
      if (!sessionToken) return;

      const { socket, roomCode } = get();
      // If already connected, send LOGIN_WITH_TOKEN directly
      if (socket?.readyState === WebSocket.OPEN) {
        get().sendMessage('LOGIN_WITH_TOKEN', { sessionToken });
      } else {
        // Connect first, then login with token
        get().connectForStatus(roomCode);
        // Wait for connection then send token
        const checkConnection = setInterval(() => {
          const state = get();
          if (state.socket?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection);
            state.sendMessage('LOGIN_WITH_TOKEN', { sessionToken });
          }
        }, 100);
        // Timeout after 5 seconds
        setTimeout(() => clearInterval(checkConnection), 5000);
      }
    },

    hasStoredSession: () => {
      return !!localStorage.getItem('vtt-remote-session-token');
    },

    selectToken: (tokenId, sceneId) => {
      get().sendMessage('SELECT_TOKEN', { tokenId, sceneId });
    },

    logout: () => {
      get().disconnect();
      set({
        isLoggedIn: false,
        userId: null,
        userName: null,
        sessionToken: null,
        availableTokens: [],
      });
    },

    clearStoredSession: () => {
      localStorage.removeItem('vtt-remote-session-token');
      localStorage.removeItem('vtt-remote-session-user');
      set({ sessionToken: null });
    },

    // Game actions
    move: (direction) => {
      const state = get();
      if (!state.isPaired || !state.socket || !state.tokenId) return;

      const now = Date.now();
      if (now - state.lastMoveTime < MOVE_THROTTLE_MS) return;

      set({ lastMoveTime: now });
      hapticFeedback(HAPTIC_DURATION);

      state.sendMessage('MOVE', {
        direction,
        tokenId: state.tokenId,
      });
    },

    rollDice: (formula, postToChat) => {
      const state = get();
      if (!state.isPaired || !state.tokenId) return;

      hapticFeedback(15);
      set({ lastDiceResult: null });

      state.sendMessage('ROLL_DICE', {
        tokenId: state.tokenId,
        formula,
        postToChat,
      });
    },

    useAbility: (itemId) => {
      const state = get();
      if (!state.isPaired || !state.tokenId) return;

      hapticFeedback(20);

      state.sendMessage('USE_ABILITY', {
        tokenId: state.tokenId,
        itemId,
      });
    },
  };
});
