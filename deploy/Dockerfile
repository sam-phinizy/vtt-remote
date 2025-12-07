# VTT Remote Relay Server
# Multi-stage build for minimal image size

# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /build

# Install dependencies
RUN apk add --no-cache git

# Copy go mod files first for caching
COPY server/go.mod server/go.sum ./
RUN go mod download

# Copy source
COPY server/ ./

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o vtt-relay .

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# Install ca-certificates for HTTPS (if needed)
RUN apk add --no-cache ca-certificates

# Copy binary from builder
COPY --from=builder /build/vtt-relay .

# Copy client files for embedded serving
COPY client/ ./public/

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
