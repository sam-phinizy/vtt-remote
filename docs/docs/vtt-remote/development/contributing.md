# Contributing

## Development Setup

### Prerequisites

- Go 1.21+
- Node.js 20+
- Task (taskfile.dev)

### Clone and Build

```bash
git clone https://github.com/sam-phinizy/vtt-remote.git
cd vtt-remote
task
```

### Running Locally

```bash
# Start relay server (includes phone client)
task dev:server

# Start Foundry module in watch mode
task dev:module
```

## Project Structure

```
vtt-remote/
├── server/          # Go relay server
├── client-react/    # Phone client (React)
├── foundry-module/  # Foundry VTT module
├── docs/            # This documentation
└── deploy/          # Docker and deployment configs
```

## Code Style

- **Go**: Standard `gofmt`, run `task lint:go`
- **TypeScript**: ESLint + Prettier, run `task lint:ts`

## Testing

```bash
task test:server   # Go tests
task test:module   # Foundry module tests
```

## Pull Requests

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a PR
