# VTT Remote - Development Roadmap

## Completed Phases

### ✅ Phase 1: Repo Scaffolding

- Monorepo directory structure
- Go module with NATS + WebSocket deps
- Go server stub with embedded static files
- Foundry module (TypeScript + Vite)
- Web client scaffold (vanilla JS)
- Taskfile build automation
- .gitignore

### ✅ Phase 2: The Relay (Go Server)

**Objective:** Wire up the dumb pipe - NATS bridge for room-based message relay.

Completed:
- ✅ NATS client connection to embedded server (`server/relay.go`)
- ✅ Message protocol defined (`docs/protocol.md`)
- ✅ Room subscription via JOIN message
- ✅ WS → NATS message forwarding
- ✅ NATS → WS broadcast to room clients
- ✅ Client disconnect cleanup
- ✅ Integration tests with race detection (11 tests)

Files created:
- `server/message.go` - Wire format types
- `server/relay.go` - Hub managing connections and NATS subscriptions
- `server/message_test.go` - Unit tests for message parsing
- `server/relay_test.go` - Integration tests for relay logic
- `docs/protocol.md` - Protocol specification

### ✅ Phase 3: The Remote (Web Client)

**Objective:** Finish the phone UI with proper UX.

Completed:
- ✅ JOIN → PAIR → MOVE protocol implementation
- ✅ URL parameter parsing for QR code auto-connect
- ✅ Reconnection with exponential backoff (max 30s)
- ✅ Loading states (button text changes)
- ✅ Haptic feedback on D-pad press
- ✅ Keyboard arrow key support
- ✅ PWA manifest with app icon
- ✅ Theme color and iOS home screen support

Files modified:
- `client/app.js` - Complete rewrite with correct protocol
- `client/index.html` - Added PWA meta tags
- `client/manifest.json` - PWA manifest
- `client/assets/icon.svg` - App icon (D-pad design)

### ✅ Phase 4: The Host (Foundry Module)

**Objective:** Complete Foundry integration with pairing UI and token control.

**Architecture:** Functional Core / Imperative Shell for testability.

Completed:
- ✅ Auto-connect to relay on game ready
- ✅ Reconnection with exponential backoff (max 30s)
- ✅ Room code generation/persistence in world settings
- ✅ "Remote" button on Token HUD
- ✅ Pairing dialog with code + QR code
- ✅ PAIR request validation → PAIR_SUCCESS/PAIR_FAILED
- ✅ MOVE command → token position update + MOVE_ACK
- ✅ Session tracking (one code per token)
- ✅ Unit tests for core logic (60 tests, no Foundry required)

Files created:
- `foundry-module/src/core/messages.ts` - Pure message parsing/building
- `foundry-module/src/core/pairing.ts` - Pure session logic
- `foundry-module/src/core/movement.ts` - Pure direction/position math
- `foundry-module/src/core/index.ts` - Barrel exports
- `foundry-module/src/__tests__/*.test.ts` - Unit tests (vitest)
- `foundry-module/src/main.ts` - Thin imperative shell

---

## Build Outputs

```
dist/
├── vtt-remote           # Go binary (22MB, embeds web client)
└── foundry-module/      # Installable Foundry module
    ├── module.json
    ├── scripts/main.js
    ├── styles/remote.css
    └── languages/en.json
```

**Test Coverage:** 71 total tests (60 TypeScript + 11 Go)

---

## Usage

1. **Start relay:** `./dist/vtt-remote` (serves on :8080)
2. **Install module:** Copy `dist/foundry-module/` to Foundry's modules folder
3. **Configure:** Set relay URL in module settings (default: `ws://localhost:8080/ws`)
4. **Pair:** Click Remote button on Token HUD → scan QR or enter codes
5. **Control:** Use D-pad on phone to move token

---

## Deferred

These features are nice-to-have but not required for MVP:

- [ ] Movement speed multiplier setting
- [ ] Revoke pairing from Token HUD
- [ ] Rate limiting on MOVE commands (server-side)
- [ ] Multi-token control from single phone
- [ ] Service worker for offline shell
- [ ] High contrast mode

---

## Quick Wins (Anytime)

- [x] Add ESLint config to root for TypeScript
- [x] Add golangci-lint config for Go
- [x] Set up GitHub Actions for CI
- [x] Add pre-commit hooks
- [x] Write protocol.md documenting message format
