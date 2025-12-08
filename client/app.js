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
  let isLoggedIn = false; // Password-based login state
  let lastMoveTime = 0;
  let reconnectAttempts = 0;
  let reconnectTimeout = null;
  let pendingPairingCode = null;
  let actorData = null; // Stores ActorPanelData for info panel

  // Login state
  let userId = null;
  let userName = null;
  let availableTokens = []; // Tokens available after login
  let authMode = 'login'; // 'login' or 'pairing'

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
  const diceContent = document.getElementById('dice-content');
  const infoContent = document.getElementById('info-content');

  // Dice elements
  const diceButtons = document.querySelectorAll('.dice-btn');
  const diceFormulaInput = document.getElementById('dice-formula');
  const rollCustomBtn = document.getElementById('roll-custom-btn');
  const postToChatCheckbox = document.getElementById('post-to-chat');
  const diceResultEl = document.getElementById('dice-result');
  const diceTotalEl = document.getElementById('dice-total');
  const diceBreakdownEl = document.getElementById('dice-breakdown');
  const diceFormulaDisplayEl = document.getElementById('dice-formula-display');

  // Info panel elements
  const actorPortrait = document.getElementById('actor-portrait');
  const resourcesContainer = document.getElementById('resources-container');
  const statsContainer = document.getElementById('stats-container');
  const conditionsContainer = document.getElementById('conditions-container');
  const abilitiesContainer = document.getElementById('abilities-container');
  const noInfoMessage = document.getElementById('no-info-message');

  // Confirm dialog elements
  const confirmDialog = document.getElementById('confirm-dialog');
  const confirmTitle = document.getElementById('confirm-title');
  const confirmDescription = document.getElementById('confirm-description');
  const confirmCancelBtn = document.getElementById('confirm-cancel');
  const confirmUseBtn = document.getElementById('confirm-use');

  // Pending ability use (for confirmation)
  let pendingAbility = null;

  // QR Scanner elements
  const scanQrBtn = document.getElementById('scan-qr-btn');
  const qrScannerModal = document.getElementById('qr-scanner-modal');
  const closeScannerBtn = document.getElementById('close-scanner-btn');
  let html5QrCode = null;

  // Auth mode elements
  const authTabs = document.querySelectorAll('.auth-tab');
  const loginForm = document.getElementById('login-form');
  const loginRoomCodeInput = document.getElementById('login-room-code');
  const loginUsernameInput = document.getElementById('login-username');
  const loginPasswordInput = document.getElementById('login-password');
  const loginBtn = document.getElementById('login-btn');

  // Token picker elements
  const tokenPickerScreen = document.getElementById('token-picker-screen');
  const tokenList = document.getElementById('token-list');
  const pickerUsername = document.getElementById('picker-username');
  const pickerLogoutBtn = document.getElementById('picker-logout-btn');
  const noTokensMessage = document.getElementById('no-tokens-message');

  // Switch token button
  const switchTokenBtn = document.getElementById('switch-token-btn');

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

    // Dice quick buttons
    diceButtons.forEach((btn) => {
      btn.addEventListener('click', () => rollDice(btn.dataset.formula));
    });

    // Custom dice roll
    rollCustomBtn.addEventListener('click', () => {
      const formula = diceFormulaInput.value.trim();
      if (formula) rollDice(formula);
    });

    // Enter key on dice formula input
    diceFormulaInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const formula = diceFormulaInput.value.trim();
        if (formula) rollDice(formula);
      }
    });

    // Keyboard support for D-pad
    document.addEventListener('keydown', handleKeyboard);

    // Confirm dialog buttons
    confirmCancelBtn.addEventListener('click', hideConfirmDialog);
    confirmUseBtn.addEventListener('click', confirmUseAbility);

    // Close dialog on backdrop click
    confirmDialog.addEventListener('click', (e) => {
      if (e.target === confirmDialog) hideConfirmDialog();
    });

    // QR scanner buttons
    scanQrBtn.addEventListener('click', openQrScanner);
    closeScannerBtn.addEventListener('click', closeQrScanner);

    // Auth mode tabs
    authTabs.forEach((tab) => {
      tab.addEventListener('click', () => switchAuthMode(tab.dataset.mode));
    });

    // Login form
    loginForm.addEventListener('submit', handleLoginSubmit);

    // Token picker
    pickerLogoutBtn.addEventListener('click', logout);

    // Switch token button
    switchTokenBtn.addEventListener('click', showTokenPicker);

    // Restore room code from localStorage
    const savedRoomCode = localStorage.getItem('vtt-remote-room');
    if (savedRoomCode) {
      roomCodeInput.value = savedRoomCode;
      loginRoomCodeInput.value = savedRoomCode;
    }

    // Restore username from localStorage
    const savedUsername = localStorage.getItem('vtt-remote-username');
    if (savedUsername) {
      loginUsernameInput.value = savedUsername;
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
  // QR CODE SCANNER
  // ==========================================================================

  function openQrScanner() {
    qrScannerModal.classList.remove('hidden');

    // Initialize scanner if not already
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode('qr-reader');
    }

    // Start scanning with back camera preferred
    html5QrCode.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      },
      onQrCodeSuccess,
      () => {} // Ignore scan failures (normal during scanning)
    ).catch((err) => {
      console.error('Camera error:', err);
      showToast('Camera access denied', 'error');
      closeQrScanner();
    });
  }

  function closeQrScanner() {
    qrScannerModal.classList.add('hidden');

    if (html5QrCode && html5QrCode.isScanning) {
      html5QrCode.stop().catch(() => {});
    }
  }

  function onQrCodeSuccess(decodedText) {
    // Stop scanning immediately
    closeQrScanner();
    hapticFeedback(30);

    // Parse the URL to extract room and code params
    try {
      const url = new URL(decodedText);
      const urlRoom = url.searchParams.get('room');
      const urlCode = url.searchParams.get('code');

      if (urlRoom) {
        roomCodeInput.value = urlRoom.toUpperCase();
      }

      if (urlCode) {
        pairingCodeInput.value = urlCode;
      }

      // Auto-connect if both present
      if (urlRoom && urlCode) {
        setTimeout(() => {
          handlePairingSubmit(new Event('submit'));
        }, 100);
      } else {
        showToast('Scanned! Fill in remaining fields', 'success');
      }
    } catch {
      // Not a URL, maybe just raw data - try to use as-is
      showToast('Invalid QR code format', 'error');
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

      case 'LOGIN_SUCCESS':
        handleLoginSuccess(payload);
        break;

      case 'LOGIN_FAILED':
        handleLoginFailed(payload);
        break;

      case 'SELECT_TOKEN_SUCCESS':
        handleSelectTokenSuccess(payload);
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

      case 'USE_ABILITY_RESULT':
        handleUseAbilityResult(payload);
        break;

      case 'ROLL_DICE_RESULT':
        handleRollDiceResult(payload);
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
    console.log('VTT Remote | Received ACTOR_INFO:', payload);
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
  // LOGIN HANDLERS
  // ==========================================================================

  function handleLoginSuccess(payload) {
    isLoggedIn = true;
    isConnected = true;
    userId = payload.userId;
    userName = payload.userName;
    availableTokens = payload.availableTokens || [];

    setConnecting(false);
    showToast(`Welcome, ${userName}!`, 'success');

    // Show token picker
    showTokenPicker();
  }

  function handleLoginFailed(payload) {
    setConnecting(false);

    const reasons = {
      user_not_found: 'Username not found',
      no_password_set: 'No password set. Ask GM to set one.',
      invalid_credentials: 'Invalid password',
    };

    const message = reasons[payload.reason] || 'Login failed';
    showToast(message, 'error');
  }

  function handleSelectTokenSuccess(payload) {
    isPaired = true;
    tokenId = payload.tokenId;
    tokenName = payload.tokenName || 'Token';

    // Update UI
    actorNameEl.textContent = tokenName;
    updateConnectionStatus('connected');

    // Switch to control screen
    showScreen('control');
    showToast(`Controlling ${tokenName}`, 'success');

    // Haptic feedback
    hapticFeedback(50);
  }

  // ==========================================================================
  // AUTH MODE SWITCHING
  // ==========================================================================

  function switchAuthMode(mode) {
    authMode = mode;

    // Update tab active states
    authTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    // Show/hide forms
    if (mode === 'login') {
      loginForm.classList.remove('hidden');
      pairingForm.classList.add('hidden');
    } else {
      loginForm.classList.add('hidden');
      pairingForm.classList.remove('hidden');
    }
  }

  // ==========================================================================
  // LOGIN FORM HANDLING
  // ==========================================================================

  async function handleLoginSubmit(e) {
    e.preventDefault();

    const inputRoomCode = loginRoomCodeInput.value.trim().toUpperCase();
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value;

    if (!inputRoomCode || !username || !password) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    roomCode = inputRoomCode;
    localStorage.setItem('vtt-remote-room', roomCode);
    localStorage.setItem('vtt-remote-username', username);

    // Hash password with room code as salt
    const passwordHash = await hashPassword(password, roomCode);

    // Connect and send login
    setConnecting(true);
    showToast('Connecting...', '');

    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      reconnectAttempts = 0;
      showToast('Connected, logging in...', '');

      // Send JOIN then LOGIN
      sendMessage('JOIN', { room: roomCode });

      // Small delay to ensure JOIN is processed first
      setTimeout(() => {
        sendMessage('LOGIN', { username, passwordHash });
      }, 50);
    };

    socket.onmessage = handleSocketMessage;
    socket.onclose = handleSocketClose;
    socket.onerror = handleSocketError;
  }

  // ==========================================================================
  // PASSWORD HASHING (SHA-256)
  // ==========================================================================

  async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ==========================================================================
  // TOKEN PICKER
  // ==========================================================================

  function showTokenPicker() {
    // Update header with username
    pickerUsername.textContent = userName || 'Player';

    // Render token list
    renderTokenList();

    // Show token picker screen
    showScreen('token-picker');
  }

  function renderTokenList() {
    tokenList.innerHTML = '';

    if (availableTokens.length === 0) {
      noTokensMessage.classList.remove('hidden');
      return;
    }

    noTokensMessage.classList.add('hidden');

    availableTokens.forEach((token) => {
      const card = document.createElement('div');
      card.className = 'token-card';
      card.dataset.tokenId = token.tokenId;
      card.dataset.sceneId = token.sceneId;

      // Token image
      const img = document.createElement('img');
      img.src = token.img || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%23555"/></svg>';
      img.alt = token.name;

      // Token name
      const name = document.createElement('div');
      name.className = 'token-name';
      name.textContent = token.name;

      // Scene name (if available)
      if (token.sceneName) {
        const scene = document.createElement('div');
        scene.className = 'token-scene';
        scene.textContent = token.sceneName;
        card.appendChild(img);
        card.appendChild(name);
        card.appendChild(scene);
      } else {
        card.appendChild(img);
        card.appendChild(name);
      }

      // Click handler
      card.addEventListener('click', () => selectToken(token.tokenId, token.sceneId));

      tokenList.appendChild(card);
    });
  }

  function selectToken(selectedTokenId, sceneId) {
    // Send SELECT_TOKEN message
    sendMessage('SELECT_TOKEN', { tokenId: selectedTokenId, sceneId });
    showToast('Selecting token...', '');
  }

  function logout() {
    // Reset login state
    isLoggedIn = false;
    isPaired = false;
    userId = null;
    userName = null;
    availableTokens = [];
    tokenId = null;
    tokenName = null;
    actorData = null;

    // Close socket
    if (socket) {
      socket.close();
      socket = null;
    }

    // Return to auth screen
    showScreen('pairing');
    showToast('Logged out', '');
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
      abilitiesContainer.innerHTML = '';
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

    // Abilities organized by category
    renderAbilities(actorData.abilities || []);
  }

  function renderAbilities(abilities) {
    if (!abilities.length) {
      abilitiesContainer.innerHTML = '';
      return;
    }

    // Group by category
    const grouped = {
      weapon: [],
      spell: [],
      feature: [],
      consumable: [],
      other: [],
    };

    for (const ability of abilities) {
      const cat = ability.category || 'other';
      if (grouped[cat]) {
        grouped[cat].push(ability);
      } else {
        grouped.other.push(ability);
      }
    }

    const categoryLabels = {
      weapon: 'Weapons',
      spell: 'Spells',
      feature: 'Features',
      consumable: 'Consumables',
      other: 'Other',
    };

    let html = '';

    for (const [category, items] of Object.entries(grouped)) {
      if (!items.length) continue;

      html += `<div class="ability-category">`;
      html += `<h4 class="ability-category-header">${categoryLabels[category]}</h4>`;
      html += `<div class="ability-list">`;

      for (const ability of items) {
        const usesHtml = ability.uses
          ? `<span class="ability-uses">${ability.uses.current}/${ability.uses.max}</span>`
          : '';
        const levelHtml = ability.spellLevel !== undefined && ability.spellLevel > 0
          ? `<span class="ability-level">L${ability.spellLevel}</span>`
          : ability.spellLevel === 0
          ? `<span class="ability-level">Cantrip</span>`
          : '';
        const disabled = ability.uses && ability.uses.current <= 0 ? 'disabled' : '';

        html += `
          <button class="ability-btn ${disabled}" data-id="${escapeHtml(ability.id)}" ${disabled}>
            ${ability.img ? `<img src="${escapeHtml(ability.img)}" alt="" class="ability-icon">` : ''}
            <span class="ability-name">${escapeHtml(ability.name)}</span>
            ${levelHtml}
            ${usesHtml}
          </button>
        `;
      }

      html += `</div></div>`;
    }

    abilitiesContainer.innerHTML = html;

    // Add click handlers to ability buttons
    abilitiesContainer.querySelectorAll('.ability-btn:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', () => {
        const abilityId = btn.dataset.id;
        const ability = abilities.find((a) => a.id === abilityId);
        if (ability) {
          showConfirmDialog(ability);
        }
      });
    });
  }

  // ==========================================================================
  // ABILITY CONFIRMATION DIALOG
  // ==========================================================================

  function showConfirmDialog(ability) {
    pendingAbility = ability;
    confirmTitle.textContent = `Use ${ability.name}?`;
    confirmDescription.textContent = ability.description || 'Activate this ability?';
    confirmDialog.classList.remove('hidden');
    hapticFeedback(10);
  }

  function hideConfirmDialog() {
    confirmDialog.classList.add('hidden');
    pendingAbility = null;
  }

  function confirmUseAbility() {
    if (!pendingAbility || !isPaired || !socket || socket.readyState !== WebSocket.OPEN) {
      hideConfirmDialog();
      return;
    }

    // Send USE_ABILITY message
    sendMessage('USE_ABILITY', {
      tokenId: tokenId,
      itemId: pendingAbility.id,
    });

    hapticFeedback(20);
    hideConfirmDialog();
  }

  function handleUseAbilityResult(payload) {
    if (payload.success) {
      showToast(payload.message || 'Ability used!', 'success');
    } else {
      showToast(payload.message || 'Failed to use ability', 'error');
    }
  }

  // ==========================================================================
  // DICE ROLLING
  // ==========================================================================

  function rollDice(formula) {
    if (!isPaired || !socket || socket.readyState !== WebSocket.OPEN) {
      showToast('Not connected', 'error');
      return;
    }

    // Haptic feedback for roll
    hapticFeedback(15);

    // Hide previous result while waiting
    diceResultEl.classList.add('hidden');

    // Send ROLL_DICE message
    sendMessage('ROLL_DICE', {
      tokenId: tokenId,
      formula: formula,
      postToChat: postToChatCheckbox.checked,
    });
  }

  function handleRollDiceResult(payload) {
    // Only show results for our token
    if (payload.tokenId !== tokenId) return;

    diceResultEl.classList.remove('hidden');

    if (payload.success) {
      diceResultEl.classList.remove('error');
      diceTotalEl.textContent = payload.total;
      diceBreakdownEl.textContent = payload.breakdown || '';
      diceFormulaDisplayEl.textContent = payload.formula;

      // Strong haptic for successful roll
      hapticFeedback(30);

      // Quick celebration animation
      diceResultEl.style.animation = 'none';
      // Trigger reflow to restart animation
      void diceResultEl.offsetWidth;
      diceResultEl.style.animation = 'dice-result-pop 0.3s ease';
    } else {
      diceResultEl.classList.add('error');
      diceTotalEl.textContent = payload.error || 'Error';
      diceBreakdownEl.textContent = '';
      diceFormulaDisplayEl.textContent = payload.formula;

      // Error haptic
      hapticFeedback(100);
    }
  }

  function switchTab(tabName) {
    // Update tab button states
    tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update content visibility
    dpadContent.classList.toggle('active', tabName === 'dpad');
    diceContent.classList.toggle('active', tabName === 'dice');
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
    tokenPickerScreen.classList.toggle('active', screen === 'token-picker');
    controlScreen.classList.toggle('active', screen === 'control');
  }

  function setConnecting(connecting) {
    connectBtn.disabled = connecting;
    connectBtn.textContent = connecting ? 'Connecting...' : 'Connect';
    loginBtn.disabled = connecting;
    loginBtn.textContent = connecting ? 'Connecting...' : 'Login';
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
