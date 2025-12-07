// Package main provides the VTT Remote relay server.
// This server embeds NATS for message relay and serves the web client.
package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/gorilla/websocket"
	"github.com/nats-io/nats-server/v2/server"
)

var relay *Relay

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

	// Create relay connected to embedded NATS
	relay, err = NewRelay(natsServer.ClientURL())
	if err != nil {
		log.Fatalf("Failed to create relay: %v", err)
	}
	defer relay.Close()

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

	// Start HTTP server (bind to all interfaces for LAN access)
	addr := fmt.Sprintf(":%d", *port)
	log.Printf("VTT Remote server starting:")
	log.Printf("  Local:   http://localhost:%d", *port)
	if ip := getLocalIP(); ip != "" {
		log.Printf("  Network: http://%s:%d", ip, *port)
	}

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

	log.Printf("New WebSocket connection from %s", r.RemoteAddr)
	relay.HandleClient(conn)
}

// getLocalIP returns the preferred outbound IP of this machine.
func getLocalIP() string {
	// Use UDP dial to find the preferred outbound IP
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return ""
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}
