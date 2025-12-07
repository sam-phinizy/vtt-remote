# VTT Remote Protocol

Version: 1.0

## Overview

The VTT Remote protocol uses JSON messages over WebSocket. All messages follow a nested envelope structure with type-specific payloads.

## Message Envelope

```json
{
  "type": "MESSAGE_TYPE",
  "payload": { ... }
}
```

All messages include:
- `type` (string): The message type identifier
- `payload` (object): Type-specific data

## NATS Subjects

Messages are relayed via NATS subjects:
- `game.{roomCode}` - All messages for a specific room

## Message Types

### JOIN

Sent by client immediately after WebSocket connection. Must be the first message.

**Direction:** Client → Server

```json
{
  "type": "JOIN",
  "payload": {
    "room": "GAME1"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| room | string | Room code (case-insensitive, 4-8 alphanumeric chars) |

**Response:** Server subscribes client to room. No explicit acknowledgment.

---

### PAIR

Sent by phone client to request pairing with a token.

**Direction:** Phone → Foundry (via relay)

```json
{
  "type": "PAIR",
  "payload": {
    "code": "5599"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| code | string | Pairing code displayed in Foundry (4 digits) |

---

### PAIR_SUCCESS

Sent by Foundry when pairing code is valid.

**Direction:** Foundry → Phone (via relay)

```json
{
  "type": "PAIR_SUCCESS",
  "payload": {
    "tokenId": "abc123",
    "tokenName": "Shadowcat",
    "actorName": "Sam's Character"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| tokenId | string | Foundry token document ID |
| tokenName | string | Display name on the token |
| actorName | string | Actor name (optional) |

---

### PAIR_FAILED

Sent by Foundry when pairing code is invalid or expired.

**Direction:** Foundry → Phone (via relay)

```json
{
  "type": "PAIR_FAILED",
  "payload": {
    "reason": "Invalid pairing code"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| reason | string | Human-readable error message |

---

### MOVE

Sent by phone to move the paired token.

**Direction:** Phone → Foundry (via relay)

```json
{
  "type": "MOVE",
  "payload": {
    "direction": "up",
    "tokenId": "abc123"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| direction | string | One of: `up`, `down`, `left`, `right` |
| tokenId | string | Token to move (from PAIR_SUCCESS) |

**Rate Limit:** Clients should throttle to max 1 message per 150ms.

---

### MOVE_ACK

Sent by Foundry to confirm movement was applied.

**Direction:** Foundry → Phone (via relay)

```json
{
  "type": "MOVE_ACK",
  "payload": {
    "tokenId": "abc123",
    "x": 350,
    "y": 200
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| tokenId | string | Token that was moved |
| x | number | New X position (pixels) |
| y | number | New Y position (pixels) |

---

### ACTOR_INFO

Sent by Foundry immediately after PAIR_SUCCESS to provide actor data for the info panel.

**Direction:** Foundry → Phone (via relay)

```json
{
  "type": "ACTOR_INFO",
  "payload": {
    "tokenId": "abc123",
    "name": "Shadowcat",
    "portrait": "/path/to/image.png",
    "resources": [
      { "id": "hp", "label": "HP", "current": 25, "max": 45, "color": "#e74c3c" }
    ],
    "stats": [
      { "id": "ac", "label": "AC", "value": 16 },
      { "id": "speed", "label": "Speed", "value": "30 ft" }
    ],
    "conditions": ["prone", "poisoned"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| tokenId | string | Token document ID |
| name | string | Token display name |
| portrait | string | URL or path to actor image (optional) |
| resources | array | Trackable resources (HP, spell slots, etc.) |
| stats | array | Static stats (AC, speed, level, etc.) |
| conditions | array | Active status effects |

**Resource Object:**
| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| label | string | Display label |
| current | number | Current value |
| max | number | Maximum value |
| color | string | Hex color for UI (optional) |

**Stat Object:**
| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| label | string | Display label |
| value | string/number | Stat value |

---

### ACTOR_UPDATE

Sent by Foundry when paired actor data changes (HP damage, conditions added, etc.).

**Direction:** Foundry → Phone (via relay)

```json
{
  "type": "ACTOR_UPDATE",
  "payload": {
    "tokenId": "abc123",
    "changes": {
      "tokenId": "abc123",
      "name": "Shadowcat",
      "resources": [...],
      "stats": [...],
      "conditions": [...]
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| tokenId | string | Token document ID |
| changes | object | Full ActorPanelData with current values |

**Note:** The `changes` object contains the complete current actor state, not a diff. The phone client replaces its cached data with this payload.

---

## Connection Lifecycle

1. Client opens WebSocket to `/ws`
2. Client sends `JOIN` message with room code
3. Server subscribes client to NATS subject `game.{room}`
4. Client sends `PAIR` request
5. Foundry validates and responds with `PAIR_SUCCESS` or `PAIR_FAILED`
6. On success, client shows D-Pad and can send `MOVE` commands
7. On disconnect, server unsubscribes from NATS

## Error Handling

If the server receives a non-JOIN message before JOIN, it will close the connection with code 4001.

WebSocket close codes:
- `4001` - Protocol error (no JOIN message)
- `4002` - Invalid room code format
- `4003` - Room subscription failed
