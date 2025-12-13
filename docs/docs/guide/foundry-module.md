# Foundry Module

The Foundry VTT module provides the bridge between your game and the phone client.

## Configuration

Access module settings via **Game Settings** → **Module Settings** → **VTT Remote**.

### Relay Server URL

The WebSocket relay server URL. Default uses the public relay at `wss://remote.arcanegrimoire.com/ws`.

### Room Code

Auto-generated code that links your Foundry instance to phone clients. Share this with players.

## Features

### QR Code Display

Click the VTT Remote sidebar button to show a QR code. Players scan this to connect instantly.

### Macro Sync

Macros are automatically synced to connected phones. Players see only macros they have permission to execute.

## Troubleshooting

**Phone won't connect?**

- Verify the relay server is reachable
- Check that WebSocket connections aren't blocked by firewall
- Try refreshing both Foundry and the phone client
