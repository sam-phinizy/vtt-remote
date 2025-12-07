// Package main provides the VTT Remote relay server.
// This server embeds NATS for message relay and serves the web client.
package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/gorilla/websocket"
	"github.com/nats-io/nats-server/v2/server"
)

//go:embed public/*
var publicFS embed.FS

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// TODO: Implement proper origin checking for production
		return true
	},
}

func main() {
	port := flag.Int("port", 8080, "HTTP server port")
	flag.Parse()

	// Start embedded NATS server
	natsServer, err := startNATS()
	if err != nil {
		log.Fatalf("Failed to start NATS: %v", err)
	}
	defer natsServer.Shutdown()

	// Set up HTTP routes
	mux := http.NewServeMux()

	// Serve static files from embedded public directory
	publicContent, err := fs.Sub(publicFS, "public")
	if err != nil {
		log.Fatalf("Failed to access public directory: %v", err)
	}
	mux.Handle("/", http.FileServer(http.FS(publicContent)))

	// WebSocket endpoint for relay
	mux.HandleFunc("/ws", handleWebSocket)

	// Start HTTP server
	addr := fmt.Sprintf(":%d", *port)
	log.Printf("VTT Remote server starting on http://localhost%s", addr)

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Shutting down...")
		natsServer.Shutdown()
		os.Exit(0)
	}()

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// startNATS initializes and starts the embedded NATS server.
func startNATS() (*server.Server, error) {
	opts := &server.Options{
		// Ephemeral in-memory only, no persistence
		NoLog:  true,
		NoSigs: true,
	}

	ns, err := server.NewServer(opts)
	if err != nil {
		return nil, fmt.Errorf("failed to create NATS server: %w", err)
	}

	go ns.Start()

	if !ns.ReadyForConnections(5 * 1e9) { // 5 second timeout
		return nil, fmt.Errorf("NATS server not ready")
	}

	log.Printf("Embedded NATS server running at %s", ns.ClientURL())
	return ns, nil
}

// handleWebSocket upgrades HTTP connections to WebSocket and bridges to NATS.
func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	// TODO: Implement WebSocket <-> NATS bridge
	// - Read room code from initial message
	// - Subscribe to NATS subject for that room
	// - Relay messages bidirectionally

	log.Printf("New WebSocket connection from %s", r.RemoteAddr)

	for {
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			log.Printf("WebSocket read error: %v", err)
			break
		}

		// Echo for now - will be replaced with NATS relay
		if err := conn.WriteMessage(messageType, message); err != nil {
			log.Printf("WebSocket write error: %v", err)
			break
		}
	}
}
