# VTT Remote - Next Steps

## Completed: Plan 1 - Repo Scaffolding

✅ Monorepo directory structure
✅ Go module with NATS + WebSocket deps
✅ Go server stub with embedded static files
✅ Foundry module (TypeScript + Vite)
✅ Web client scaffold (vanilla JS)
✅ Makefile build automation
✅ .gitignore

---

## Plan 2: The Relay (Go Server Implementation)

**Objective:** Wire up the dumb pipe - NATS bridge for room-based message relay.

### Tasks

1. **NATS Client Integration**
   - Create internal NATS client connection to embedded server
   - Define message protocol (JSON schema for PAIR, MOVE, etc.)

2. **WebSocket Room Management**
   - Parse room code from initial client message
   - Subscribe WebSocket to NATS subject `game.{roomCode}`
   - Track connected clients per room

3. **Message Relay Logic**
   - WS → NATS: Forward incoming messages to room subject
   - NATS → WS: Broadcast room messages to all connected sockets
   - Handle client disconnect cleanup

4. **Protocol Definition**
   - Document message types in `docs/protocol.md`
   - PAIR, PAIR_SUCCESS, PAIR_FAILED, MOVE, MOVE_ACK

---

## Plan 3: The Remote (Web Client Polish)

**Objective:** Finish the phone UI with proper UX.

### Tasks

1. **WebSocket Protocol Handling**
   - Implement full message protocol from Plan 2
   - Handle reconnection with exponential backoff

2. **UI Polish**
   - Add loading states and transitions
   - Haptic feedback on button press (if supported)
   - Error toasts instead of status line

3. **PWA Support**
   - Add manifest.json for home screen install
   - Service worker for offline shell (optional)
   - App icons

4. **Accessibility**
   - Keyboard navigation support
   - Screen reader labels
   - High contrast mode

---

## Plan 4: The Host (Foundry Module)

**Objective:** Complete Foundry integration with pairing UI and token control.

### Tasks

1. **Pairing UI**
   - Add "Remote" button to Token HUD
   - Create pairing dialog showing code + QR
   - Display connected remotes list

2. **Relay Connection**
   - Auto-connect on game ready
   - Handle reconnection
   - Room code generation/persistence

3. **Message Handlers**
   - PAIR request validation
   - MOVE command → token.update()
   - Rate limiting / abuse prevention

4. **Multi-Token Support**
   - Allow one phone per token
   - Session management (who controls what)
   - Revoke pairing option

5. **Settings UI**
   - Relay server URL config
   - Auto-connect toggle
   - Movement speed multiplier

---

## Suggested Order

1. **Plan 2** first - need working relay before client/module can talk
2. **Plan 4** next - Foundry side needs to generate codes and respond
3. **Plan 3** last - polish client after protocol is stable

---

## Quick Wins (Can Do Anytime)

- [ ] Add ESLint config to root for TypeScript
- [ ] Add golangci-lint config for Go
- [ ] Set up GitHub Actions for CI
- [ ] Add pre-commit hooks
- [ ] Write protocol.md documenting message format
