# Architecture

VTT Remote consists of three components working together.

## Components

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│  Phone Client   │◄──────────────────►│  Relay Server   │
│  (React PWA)    │                    │  (Go)           │
└─────────────────┘                    └────────┬────────┘
                                                │
                                                │ WebSocket
                                                │
                                       ┌────────▼────────┐
                                       │ Foundry Module  │
                                       │ (TypeScript)    │
                                       └─────────────────┘
```

## Relay Server

The relay server is a lightweight Go application that:

- Manages WebSocket connections from phones and Foundry
- Routes messages between paired clients using room codes
- Serves the phone client static files (embedded in binary)

### Deployment Options

1. **Docker with Traefik** (recommended) - Automatic SSL
2. **Docker standalone** - Behind your own reverse proxy
3. **Binary** - Direct execution with nginx/caddy in front

## Phone Client

React-based progressive web app optimized for mobile:

- Touch-optimized UI components
- Real-time WebSocket communication
- Works offline (cached assets)

## Foundry Module

TypeScript module for Foundry VTT:

- Establishes WebSocket connection to relay
- Translates phone commands to Foundry API calls
- Syncs game state to connected phones
