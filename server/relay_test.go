package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	natsserver "github.com/nats-io/nats-server/v2/server"
)

// startTestNATS starts an ephemeral NATS server for testing.
func startTestNATS(t *testing.T) *natsserver.Server {
	t.Helper()
	opts := &natsserver.Options{
		Host:   "127.0.0.1",
		Port:   -1, // Random available port
		NoLog:  true,
		NoSigs: true,
	}
	ns, err := natsserver.NewServer(opts)
	if err != nil {
		t.Fatalf("Failed to create NATS server: %v", err)
	}
	ns.Start()
	if !ns.ReadyForConnections(10 * time.Second) {
		t.Fatal("NATS server not ready")
	}
	return ns
}

// setupTestRelay creates a test server with WebSocket endpoint.
func setupTestRelay(t *testing.T) (*httptest.Server, *Relay, func()) {
	t.Helper()
	ns := startTestNATS(t)

	r, err := NewRelay(ns.ClientURL())
	if err != nil {
		ns.Shutdown()
		t.Fatalf("Failed to create relay: %v", err)
	}

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		conn, err := upgrader.Upgrade(w, req, nil)
		if err != nil {
			t.Logf("Upgrade failed: %v", err)
			return
		}
		r.HandleClient(conn)
	}))

	cleanup := func() {
		server.Close()
		r.Close()
		ns.Shutdown()
	}

	return server, r, cleanup
}

// dialWS connects to the test server's WebSocket endpoint.
func dialWS(t *testing.T, serverURL string) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(serverURL, "http")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to dial WebSocket: %v", err)
	}
	return conn
}

func TestRelayJoinRoom(t *testing.T) {
	server, r, cleanup := setupTestRelay(t)
	defer cleanup()

	conn := dialWS(t, server.URL)
	defer conn.Close()

	// Send JOIN message
	joinMsg := `{"type":"JOIN","payload":{"room":"TEST1"}}`
	if err := conn.WriteMessage(websocket.TextMessage, []byte(joinMsg)); err != nil {
		t.Fatalf("Failed to send JOIN: %v", err)
	}

	// Give it a moment to process
	time.Sleep(50 * time.Millisecond)

	// Check room count
	if r.RoomCount() != 1 {
		t.Errorf("RoomCount = %d, want 1", r.RoomCount())
	}
	if r.ClientCount() != 1 {
		t.Errorf("ClientCount = %d, want 1", r.ClientCount())
	}
}

func TestRelayInvalidJoin(t *testing.T) {
	server, _, cleanup := setupTestRelay(t)
	defer cleanup()

	conn := dialWS(t, server.URL)
	defer conn.Close()

	// Send invalid room code
	joinMsg := `{"type":"JOIN","payload":{"room":"AB"}}`
	if err := conn.WriteMessage(websocket.TextMessage, []byte(joinMsg)); err != nil {
		t.Fatalf("Failed to send JOIN: %v", err)
	}

	// Should receive close message
	conn.SetReadDeadline(time.Now().Add(time.Second))
	_, _, err := conn.ReadMessage()
	if err == nil {
		t.Error("Expected connection to be closed")
	}
}

func TestRelayMessageBroadcast(t *testing.T) {
	server, _, cleanup := setupTestRelay(t)
	defer cleanup()

	// Connect two clients to the same room
	conn1 := dialWS(t, server.URL)
	defer conn1.Close()
	conn2 := dialWS(t, server.URL)
	defer conn2.Close()

	// Both join the same room
	joinMsg := `{"type":"JOIN","payload":{"room":"GAME1"}}`
	conn1.WriteMessage(websocket.TextMessage, []byte(joinMsg))
	conn2.WriteMessage(websocket.TextMessage, []byte(joinMsg))

	time.Sleep(50 * time.Millisecond)

	// Client 1 sends a message
	moveMsg := `{"type":"MOVE","payload":{"direction":"up","tokenId":"tok1"}}`
	conn1.WriteMessage(websocket.TextMessage, []byte(moveMsg))

	// Both clients should receive it (including sender, since it's broadcast)
	conn1.SetReadDeadline(time.Now().Add(time.Second))
	conn2.SetReadDeadline(time.Now().Add(time.Second))

	_, msg1, err1 := conn1.ReadMessage()
	_, msg2, err2 := conn2.ReadMessage()

	if err1 != nil {
		t.Errorf("Client 1 read error: %v", err1)
	}
	if err2 != nil {
		t.Errorf("Client 2 read error: %v", err2)
	}

	if string(msg1) != moveMsg {
		t.Errorf("Client 1 got %s, want %s", msg1, moveMsg)
	}
	if string(msg2) != moveMsg {
		t.Errorf("Client 2 got %s, want %s", msg2, moveMsg)
	}
}

func TestRelayDisconnectCleanup(t *testing.T) {
	server, r, cleanup := setupTestRelay(t)
	defer cleanup()

	conn := dialWS(t, server.URL)

	// Join room
	joinMsg := `{"type":"JOIN","payload":{"room":"TEST1"}}`
	conn.WriteMessage(websocket.TextMessage, []byte(joinMsg))
	time.Sleep(50 * time.Millisecond)

	if r.ClientCount() != 1 {
		t.Errorf("ClientCount = %d, want 1", r.ClientCount())
	}

	// Disconnect
	conn.Close()
	time.Sleep(50 * time.Millisecond)

	// Room should be cleaned up
	if r.ClientCount() != 0 {
		t.Errorf("ClientCount after disconnect = %d, want 0", r.ClientCount())
	}
	if r.RoomCount() != 0 {
		t.Errorf("RoomCount after disconnect = %d, want 0", r.RoomCount())
	}
}

func TestRelayMultipleRooms(t *testing.T) {
	server, r, cleanup := setupTestRelay(t)
	defer cleanup()

	// Connect to different rooms
	conn1 := dialWS(t, server.URL)
	defer conn1.Close()
	conn2 := dialWS(t, server.URL)
	defer conn2.Close()

	conn1.WriteMessage(websocket.TextMessage, []byte(`{"type":"JOIN","payload":{"room":"ROOM1"}}`))
	conn2.WriteMessage(websocket.TextMessage, []byte(`{"type":"JOIN","payload":{"room":"ROOM2"}}`))

	time.Sleep(50 * time.Millisecond)

	if r.RoomCount() != 2 {
		t.Errorf("RoomCount = %d, want 2", r.RoomCount())
	}

	// Message in ROOM1 should not reach ROOM2
	conn1.WriteMessage(websocket.TextMessage, []byte(`{"type":"MOVE","payload":{"direction":"up"}}`))

	conn1.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
	_, _, err1 := conn1.ReadMessage()
	if err1 != nil {
		t.Errorf("ROOM1 client should receive own message: %v", err1)
	}

	// ROOM2 client should timeout (no message)
	conn2.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
	_, _, err2 := conn2.ReadMessage()
	if err2 == nil {
		t.Error("ROOM2 client should not receive ROOM1 message")
	}
}
