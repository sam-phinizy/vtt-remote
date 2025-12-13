# VTT Remote

A remote control system for Foundry Virtual Tabletop. Players connect their phones to control tokens on the battle map - movement, dice rolling, and quick actions.

## Documentation

Full documentation available at **[docs.arcanegrimoire.com](https://docs.arcanegrimoire.com)**

## Quick Start

Requires Go 1.24+, Node.js 20+, and [Task](https://taskfile.dev/).

```bash
# Build everything
task

# Development
task dev:server     # Run Go server
task dev:client     # React dev server with HMR
task dev:module     # Watch/rebuild Foundry module

# Testing
task test:server    # Go tests
task test:module    # Foundry module tests
```

## Project Structure

```
├── server/          # Go relay server (WebSocket + embedded NATS)
├── client-react/    # Phone client (React + Vite)
├── foundry-module/  # Foundry VTT module (TypeScript)
├── deploy/          # Docker Compose + Traefik config
└── docs/            # MkDocs documentation source
```

## License

MIT
