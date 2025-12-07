/**
 * VTT Remote - Phone Client Application
 * Vanilla JS WebSocket client for token control
 */

(function () {
  'use strict';

  // Configuration
  const MOVE_THROTTLE_MS = 150; // Max 1 move per 150ms per PRD

  // State
  let socket = null;
  let isConnected = false;
  let lastMoveTime = 0;
  let sessionData = null;

  // DOM Elements
  const pairingScreen = document.getElementById('pairing-screen');
  const controlScreen = document.getElementById('control-screen');
  const pairingForm = document.getElementById('pairing-form');
  const roomCodeInput = document.getElementById('room-code');
  const pairingCodeInput = document.getElementById('pairing-code');
  const connectBtn = document.getElementById('connect-btn');
  const statusMessage = document.getElementById('status-message');
  const actorName = document.getElementById('actor-name');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const connectionStatus = document.getElementById('connection-status');
  const dpadButtons = document.querySelectorAll('.dpad-btn');

  /**
   * Initialize the application.
   */
  function init() {
    pairingForm.addEventListener('submit', handlePairingSubmit);
    disconnectBtn.addEventListener('click', disconnect);

    // Set up D-pad controls
    dpadButtons.forEach((btn) => {
      btn.addEventListener('click', () => handleMove(btn.dataset.dir));
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleMove(btn.dataset.dir);
      });
    });

    // Restore last used room code from localStorage
    const savedRoomCode = localStorage.getItem('vtt-remote-room');
    if (savedRoomCode) {
      roomCodeInput.value = savedRoomCode;
    }
  }

  /**
   * Handle pairing form submission.
   * @param {Event} e - Form submit event
   */
  function handlePairingSubmit(e) {
    e.preventDefault();

    const roomCode = roomCodeInput.value.trim().toUpperCase();
    const pairingCode = pairingCodeInput.value.trim();

    if (!roomCode || !pairingCode) {
      showStatus('Please enter both codes', 'error');
      return;
    }

    // Save room code for next time
    localStorage.setItem('vtt-remote-room', roomCode);

    connect(roomCode, pairingCode);
  }

  /**
   * Connect to the relay server and attempt pairing.
   * @param {string} roomCode - The room identifier
   * @param {string} pairingCode - The 4-digit pairing code
   */
  function connect(roomCode, pairingCode) {
    connectBtn.disabled = true;
    showStatus('Connecting...', '');

    // Determine WebSocket URL (same host, /ws path)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      showStatus('Connected, pairing...', '');

      // Send pairing request
      sendMessage({
        type: 'PAIR',
        room: roomCode,
        code: pairingCode,
      });
    };

    socket.onmessage = (event) => {
      handleMessage(JSON.parse(event.data));
    };

    socket.onclose = () => {
      isConnected = false;
      connectBtn.disabled = false;

      if (sessionData) {
        // Was connected, show reconnecting
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.className = 'disconnected';
        // TODO: Implement auto-reconnect
      }
    };

    socket.onerror = () => {
      showStatus('Connection failed', 'error');
      connectBtn.disabled = false;
    };
  }

  /**
   * Handle incoming WebSocket message.
   * @param {Object} message - Parsed message object
   */
  function handleMessage(message) {
    switch (message.type) {
      case 'PAIR_SUCCESS':
        handlePairSuccess(message);
        break;
      case 'PAIR_FAILED':
        showStatus(message.reason || 'Pairing failed', 'error');
        connectBtn.disabled = false;
        break;
      case 'MOVE_ACK':
        // Optional: visual feedback that move was received
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  /**
   * Handle successful pairing.
   * @param {Object} message - Pairing success message with actor data
   */
  function handlePairSuccess(message) {
    isConnected = true;
    sessionData = message;

    // Update UI
    actorName.textContent = message.actorName || 'Token';
    connectionStatus.textContent = 'Connected';
    connectionStatus.className = 'connected';

    // Switch to control screen
    showScreen('control');
  }

  /**
   * Handle D-pad movement.
   * @param {string} direction - 'up', 'down', 'left', 'right'
   */
  function handleMove(direction) {
    if (!isConnected || !socket) return;

    // Throttle moves
    const now = Date.now();
    if (now - lastMoveTime < MOVE_THROTTLE_MS) return;
    lastMoveTime = now;

    // Calculate delta based on direction
    const deltas = {
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 },
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 },
    };

    const { dx, dy } = deltas[direction] || { dx: 0, dy: 0 };

    sendMessage({
      type: 'MOVE',
      dx,
      dy,
    });
  }

  /**
   * Disconnect from the server.
   */
  function disconnect() {
    if (socket) {
      socket.close();
      socket = null;
    }

    isConnected = false;
    sessionData = null;
    pairingCodeInput.value = '';

    showScreen('pairing');
    showStatus('', '');
  }

  /**
   * Send a message through the WebSocket.
   * @param {Object} data - Message data to send
   */
  function sendMessage(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  /**
   * Show a status message on the pairing screen.
   * @param {string} text - Message text
   * @param {string} type - 'error', 'success', or ''
   */
  function showStatus(text, type) {
    statusMessage.textContent = text;
    statusMessage.className = `status ${type}`;
  }

  /**
   * Switch between screens.
   * @param {string} screen - 'pairing' or 'control'
   */
  function showScreen(screen) {
    pairingScreen.classList.toggle('active', screen === 'pairing');
    controlScreen.classList.toggle('active', screen === 'control');
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
