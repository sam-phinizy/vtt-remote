// Package natsutil provides helpers for working with NATS.
package natsutil

import (
	"fmt"
	"time"

	"github.com/nats-io/nats-server/v2/server"
)

// EmbeddedNATS wraps an embedded NATS server for in-process messaging.
type EmbeddedNATS struct {
	server *server.Server
}

// Start creates and starts an embedded NATS server on a random port.
// The server binds to localhost only and is suitable for in-process use.
func Start() (*EmbeddedNATS, error) {
	opts := &server.Options{
		Host:   "127.0.0.1",
		Port:   -1, // Random available port
		NoLog:  true,
		NoSigs: true,
	}

	ns, err := server.NewServer(opts)
	if err != nil {
		return nil, fmt.Errorf("failed to create NATS server: %w", err)
	}

	go ns.Start()

	if !ns.ReadyForConnections(5 * time.Second) {
		return nil, fmt.Errorf("NATS server not ready after 5 seconds")
	}

	return &EmbeddedNATS{server: ns}, nil
}

// ClientURL returns the URL for connecting to this NATS server.
func (e *EmbeddedNATS) ClientURL() string {
	return e.server.ClientURL()
}

// Shutdown stops the embedded NATS server.
func (e *EmbeddedNATS) Shutdown() {
	e.server.Shutdown()
}

// Running returns true if the server is accepting connections.
func (e *EmbeddedNATS) Running() bool {
	return e.server.Running()
}
