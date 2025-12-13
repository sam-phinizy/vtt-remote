# WebSocket Protocol

The relay server uses a simple JSON-based WebSocket protocol.

## Connection

Connect to `/ws` endpoint:

```
wss://your-relay-server.example.com/ws
```

## Message Format

All messages are JSON objects with a `type` field:

```json
{
  "type": "message_type",
  "payload": { ... }
}
```

## Message Types

### Client → Relay

| Type | Description |
|------|-------------|
| `join` | Join a room by code |
| `leave` | Leave current room |
| `message` | Send message to room |

### Relay → Client

| Type | Description |
|------|-------------|
| `joined` | Confirmation of room join |
| `error` | Error response |
| `message` | Message from another client |

## Example: Joining a Room

```json
// Client sends
{
  "type": "join",
  "payload": {
    "room": "ABC123",
    "role": "phone"
  }
}

// Relay responds
{
  "type": "joined",
  "payload": {
    "room": "ABC123"
  }
}
```

## Heartbeat

Send a ping every 30 seconds to keep the connection alive. The relay will close idle connections after 60 seconds.
