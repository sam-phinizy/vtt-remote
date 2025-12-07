/**
 * VTT Remote - Phone Client Application
 * Vanilla JS WebSocket client for token control
 *
 * Protocol: JOIN → PAIR → MOVE (per docs/protocol.md)
 */

(function () {
  'use strict';

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  const MOVE_THROTTLE_MS = 150; // Max 1 move per 150ms per PRD
  const MAX_RECONNECT_DELAY = 30000; // 30 seconds
  const HAPTIC_DURATION = 10; // ms

  // ==========================================================================
  // STATE
  // ==========================================================================

  let socket = null;
  let roomCode = null;
  let tokenId = null;
  let tokenName = null;
  let isConnected = false;
  let isPaired = false;
  let lastMoveTime = 0;
  let reconnectAttempts = 0;
  let reconnectTimeout = null;
  let pendingPairingCode = null;
  let actorData = null; // Stores ActorPanelData for info panel

  // ==========================================================================
  // DOM ELEMENTS
  // ==========================================================================

  const pairingScreen = document.getElementById('pairing-screen');
  const controlScreen = document.getElementById('control-screen');
  const pairingForm = document.getElementById('pairing-form');
  const roomCodeInput = document.getElementById('room-code');
  const pairingCodeInput = document.getElementById('pairing-code');
  const connectBtn = document.getElementById('connect-btn');
  const statusMessage = document.getElementById('status-message');
  const actorNameEl = document.getElementById('actor-name');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const connectionStatus = document.getElementById('connection-status');
  const dpadButtons = document.querySelectorAll('.dpad-btn');

  // Tab elements
  const tabButtons = document.querySelectorAll('.screen-tabs .tab');
  const dpadContent = document.getElementById('dpad-content');
  const infoContent = document.getElementById('info-content');

  // Info panel elements
  const actorPortrait = document.getElementById('actor-portrait');
  const resourcesContainer = document.getElementById('resources-container');
  const statsContainer = document.getElementById('stats-container');
  const conditionsContainer = document.getElementById('conditions-container');
  const noInfoMessage = document.getElementById('no-info-message');

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  function init() {
    // Event listeners
    pairingForm.addEventListener('submit', handlePairingSubmit);
    disconnectBtn.addEventListener('click', disconnect);

    // D-pad controls with haptic feedback
    dpadButtons.forEach((btn) => {
      btn.addEventListener('click', () => handleMove(btn.dataset.dir));
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleMove(btn.dataset.dir);
      });
    });

    // Tab switching
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Keyboard support for D-pad
    document.addEventListener('keydown', handleKeyboard);

    // Restore room code from localStorage
    const savedRoomCode = localStorage.getItem('vtt-remote-room');
    if (savedRoomCode) {
      roomCodeInput.value = savedRoomCode;
    }

    // Parse URL params (from QR code scan)
    parseUrlParams();
  }

  // ==========================================================================
  // URL PARAMETER PARSING (for QR code)
  // ==========================================================================

  function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    const urlCode = params.get('code');

    if (urlRoom) {
      roomCodeInput.value = urlRoom.toUpperCase();
    }

    if (urlCode) {
      pairingCodeInput.value = urlCode;
    }

    // Auto-connect if both params present
    if (urlRoom && urlCode) {
      // Clear URL params to prevent re-connect on refresh
      window.history.replaceState({}, '', window.location.pathname);

      // Small delay to ensure DOM is ready
      setTimeout(() => {
        handlePairingSubmit(new Event('submit'));
      }, 100);
    }
  }

  // ==========================================================================
  // PAIRING FLOW
  // ==========================================================================

  function handlePairingSubmit(e) {
    e.preventDefault();

    roomCode = roomCodeInput.value.trim().toUpperCase();
    const pairingCode = pairingCodeInput.value.trim();

    if (!roomCode || !pairingCode) {
      showToast('Please enter both codes', 'error');
      return;
    }

    // Save room code for next time
    localStorage.setItem('vtt-remote-room', roomCode);

    // Store pairing code for after JOIN completes
    pendingPairingCode = pairingCode;

    // Start connection
    connect();
  }

  // ==========================================================================
  // WEBSOCKET CONNECTION
  // ==========================================================================

  function connect() {
    if (socket?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnecting(true);
    showToast('Connecting...', '');

    // Determine WebSocket URL (same host, /ws path)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    socket = new WebSocket(wsUrl);

    socket.onopen = handleSocketOpen;
    socket.onmessage = handleSocketMessage;
    socket.onclose = handleSocketClose;
    socket.onerror = handleSocketError;
  }

  function handleSocketOpen() {
    reconnectAttempts = 0; // Reset on successful connection
    showToast('Connected, joining room...', '');

    // Step 1: Send JOIN message
    sendMessage('JOIN', { room: roomCode });
  }

  function handleSocketMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.warn('Invalid message:', event.data);
      return;
    }

    // Handle envelope format: { type, payload }
    const type = msg.type;
    const payload = msg.payload || {};

    switch (type) {
      case 'PAIR_SUCCESS':
        handlePairSuccess(payload);
        break;

      case 'PAIR_FAILED':
        handlePairFailed(payload);
        break;

      case 'MOVE_ACK':
        // Optional: visual feedback that move was applied
        break;

      case 'ACTOR_INFO':
        handleActorInfo(payload);
        break;

      case 'ACTOR_UPDATE':
        handleActorUpdate(payload);
        break;

      default:
        // Ignore other message types (JOIN echo, etc.)
        break;
    }
  }

  function handleSocketClose() {
    isConnected = false;

    if (isPaired) {
      // Was paired, try to reconnect
      updateConnectionStatus('disconnected');
      scheduleReconnect();
    } else {
      // Connection failed during pairing
      setConnecting(false);
    }
  }

  function handleSocketError() {
    showToast('Connection failed', 'error');
    setConnecting(false);
  }

  // ==========================================================================
  // RECONNECTION LOGIC
  // ==========================================================================

  function scheduleReconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    reconnectAttempts++;

    showToast(`Reconnecting in ${Math.round(delay / 1000)}s...`, '');

    reconnectTimeout = setTimeout(() => {
      if (isPaired) {
        // Re-pair after reconnect
        pendingPairingCode = null; // Already paired, just rejoin
        connect();
      }
    }, delay);
  }

  function cancelReconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    reconnectAttempts = 0;
  }

  // ==========================================================================
  // MESSAGE HANDLERS
  // ==========================================================================

  function handlePairSuccess(payload) {
    isPaired = true;
    isConnected = true;
    tokenId = payload.tokenId;
    tokenName = payload.tokenName || 'Token';

    // Update UI
    actorNameEl.textContent = tokenName;
    updateConnectionStatus('connected');
    setConnecting(false);

    // Switch to control screen
    showScreen('control');
    showToast(`Paired with ${tokenName}`, 'success');

    // Haptic feedback for successful pairing
    hapticFeedback(50);
  }

  function handlePairFailed(payload) {
    showToast(payload.reason || 'Pairing failed', 'error');
    setConnecting(false);
    pendingPairingCode = null;
  }

  function handleActorInfo(payload) {
    // Initial actor data received after pairing
    actorData = payload;
    renderInfoPanel();
  }

  function handleActorUpdate(payload) {
    // Real-time update - check if it's for our token
    if (payload.tokenId === tokenId) {
      actorData = payload.changes;
      renderInfoPanel();
    }
  }

  // ==========================================================================
  // INFO PANEL
  // ==========================================================================

  function renderInfoPanel() {
    if (!actorData) {
      noInfoMessage.style.display = 'block';
      resourcesContainer.innerHTML = '';
      statsContainer.innerHTML = '';
      conditionsContainer.innerHTML = '';
      actorPortrait.style.display = 'none';
      return;
    }

    noInfoMessage.style.display = 'none';

    // Portrait
    if (actorData.portrait) {
      actorPortrait.src = actorData.portrait;
      actorPortrait.style.display = 'block';
    } else {
      actorPortrait.style.display = 'none';
    }

    // Resources (HP bars, spell slots, etc.)
    resourcesContainer.innerHTML = (actorData.resources || [])
      .map((r) => `
        <div class="resource">
          <label>${escapeHtml(r.label)}</label>
          <div class="resource-bar">
            <div class="resource-fill" style="width: ${Math.min(100, (r.current / r.max) * 100)}%; background: ${r.color || '#4ade80'}"></div>
          </div>
          <span class="resource-text">${r.current} / ${r.max}</span>
        </div>
      `)
      .join('');

    // Stats grid (AC, speed, level, etc.)
    statsContainer.innerHTML = (actorData.stats || [])
      .map((s) => `
        <div class="stat">
          <span class="stat-label">${escapeHtml(s.label)}</span>
          <span class="stat-value">${escapeHtml(String(s.value))}</span>
        </div>
      `)
      .join('');

    // Conditions/status effects
    conditionsContainer.innerHTML = (actorData.conditions || [])
      .map((c) => `<span class="condition-badge">${escapeHtml(c)}</span>`)
      .join('');
  }

  function switchTab(tabName) {
    // Update tab button states
    tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update content visibility
    dpadContent.classList.toggle('active', tabName === 'dpad');
    infoContent.classList.toggle('active', tabName === 'info');

    // Haptic feedback on tab switch
    hapticFeedback(5);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==========================================================================
  // MOVEMENT
  // ==========================================================================

  function handleMove(direction) {
    if (!isPaired || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    // Throttle moves
    const now = Date.now();
    if (now - lastMoveTime < MOVE_THROTTLE_MS) {
      return;
    }
    lastMoveTime = now;

    // Haptic feedback
    hapticFeedback(HAPTIC_DURATION);

    // Send MOVE with direction and tokenId (per protocol)
    sendMessage('MOVE', {
      direction: direction,
      tokenId: tokenId,
    });
  }

  function handleKeyboard(e) {
    // Only handle arrow keys when on control screen
    if (!isPaired) return;

    const keyMap = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };

    const direction = keyMap[e.key];
    if (direction) {
      e.preventDefault();
      handleMove(direction);
    }
  }

  // ==========================================================================
  // DISCONNECT
  // ==========================================================================

  function disconnect() {
    cancelReconnect();

    if (socket) {
      socket.close();
      socket = null;
    }

    isConnected = false;
    isPaired = false;
    tokenId = null;
    tokenName = null;
    pendingPairingCode = null;
    actorData = null;
    pairingCodeInput.value = '';

    showScreen('pairing');
    showToast('', '');

    // Reset to D-pad tab
    switchTab('dpad');
  }

  // ==========================================================================
  // MESSAGE SENDING
  // ==========================================================================

  function sendMessage(type, payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({ type, payload });
      socket.send(msg);

      // After JOIN, send PAIR if we have a pending code
      if (type === 'JOIN' && pendingPairingCode) {
        // Small delay to ensure server processes JOIN first
        setTimeout(() => {
          sendMessage('PAIR', { code: pendingPairingCode });
          pendingPairingCode = null;
          showToast('Pairing...', '');
        }, 50);
      }
    }
  }

  // ==========================================================================
  // UI HELPERS
  // ==========================================================================

  function showToast(text, type) {
    statusMessage.textContent = text;
    statusMessage.className = `status ${type}`;
  }

  function showScreen(screen) {
    pairingScreen.classList.toggle('active', screen === 'pairing');
    controlScreen.classList.toggle('active', screen === 'control');
  }

  function setConnecting(connecting) {
    connectBtn.disabled = connecting;
    connectBtn.textContent = connecting ? 'Connecting...' : 'Connect';
  }

  function updateConnectionStatus(status) {
    connectionStatus.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
    connectionStatus.className = status;
  }

  function hapticFeedback(duration) {
    if (navigator.vibrate) {
      navigator.vibrate(duration);
    }
  }

  // ==========================================================================
  // STARTUP
  // ==========================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
