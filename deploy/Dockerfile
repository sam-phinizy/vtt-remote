# VTT Remote Relay Server
# Multi-stage build for minimal image size

# Stage 1: Build React client
FROM node:20-alpine AS client-builder

WORKDIR /build

# Copy package files for caching
COPY client-react/package.json client-react/package-lock.json ./
RUN npm ci

# Copy source and build
COPY client-react/ ./
RUN npm run build

# Stage 2: Build Go server
FROM golang:1.23-alpine AS server-builder

WORKDIR /build

# Install dependencies
RUN apk add --no-cache git

# Copy go mod files first for caching
COPY server/go.mod server/go.sum ./
RUN go mod download

# Copy server source
COPY server/ ./

# Copy built client into public/ for embedding
COPY --from=client-builder /build/dist ./public/

# Build binary (client is embedded via go:embed)
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o vtt-relay .

# Stage 3: Runtime
FROM alpine:3.19

WORKDIR /app

# Install ca-certificates for HTTPS (if needed)
RUN apk add --no-cache ca-certificates

# Copy binary from builder (client is embedded)
COPY --from=server-builder /build/vtt-relay .

# Create non-root user
RUN adduser -D -u 1000 vttremote
USER vttremote

# Expose port
EXPOSE 8181

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:8181/health || exit 1

# Run
CMD ["./vtt-relay"]
