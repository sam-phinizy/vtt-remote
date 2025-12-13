package relay

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/nats-io/nats.go"
)

// WebSocket close codes for protocol errors.
const (
	CloseProtocolError   = 4001
	CloseInvalidRoom     = 4002
	CloseSubscribeFailed = 4003
)

// roomCodeRegex validates room codes: 4-8 alphanumeric characters.
var roomCodeRegex = regexp.MustCompile(`^[a-zA-Z0-9]{4,8}$`)

// ValidateRoomCode checks if a room code is valid.
func ValidateRoomCode(code string) bool {
	return roomCodeRegex.MatchString(code)
}

// ClientType identifies whether a client is Foundry or a phone.
type ClientType string

const (
	ClientTypeUnknown ClientType = ""
	ClientTypeFoundry ClientType = "foundry"
	ClientTypePhone   ClientType = "phone"
)

// LogLevel represents log severity.
type LogLevel string

const (
	LogInfo  LogLevel = "info"
	LogWarn  LogLevel = "warn"
	LogError LogLevel = "error"
)

// Config holds relay configuration.
type Config struct {
	NatsURL string
	OnLog   func(level LogLevel, message string) // Optional log callback
}

// Stats contains relay statistics.
type Stats struct {
	RoomCount    int
	ClientCount  int
	FoundryCount int
	PhoneCount   int
}

// Client represents a connected WebSocket client.
type Client struct {
	conn       *websocket.Conn
	room       string
	sub        *nats.Subscription
	sendChan   chan []byte
	relay      *Relay

	mu         sync.RWMutex
	clientType ClientType
	closed     bool // true when sendChan is closed
}

// Relay manages the NATS connection and room subscriptions.
type Relay struct {
	nc     *nats.Conn
	mu     sync.RWMutex
	rooms  map[string]map[*Client]struct{} // room -> set of clients
	config Config
}

// NewRelay creates a relay connected to the given NATS URL.
func NewRelay(cfg Config) (*Relay, error) {
	nc, err := nats.Connect(cfg.NatsURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}

	return &Relay{
		nc:     nc,
		rooms:  make(map[string]map[*Client]struct{}),
		config: cfg,
	}, nil
}

// Close shuts down the NATS connection.
func (r *Relay) Close() {
	r.nc.Close()
}

// log sends a log message to the configured callback (if any).
func (r *Relay) log(level LogLevel, format string, args ...any) {
	if r.config.OnLog != nil {
		r.config.OnLog(level, fmt.Sprintf(format, args...))
	}
}

// HandleClient processes a new WebSocket connection through its lifecycle.
func (r *Relay) HandleClient(conn *websocket.Conn) {
	client := &Client{
		conn:       conn,
		clientType: ClientTypeUnknown,
		sendChan:   make(chan []byte, 64),
		relay:      r,
	}

	// Wait for JOIN message first
	if err := client.waitForJoin(); err != nil {
		r.log(LogWarn, "Client failed to join: %v", err)
		return
	}

	// Register client in room
	r.addToRoom(client)
	defer func() {
		r.removeFromRoom(client)
		// Broadcast status change when client leaves
		r.broadcastRoomStatus(client.room)
	}()

	r.log(LogInfo, "Client joined room %s", client.room)

	// Start writer goroutine
	go client.writePump()

	// Send initial room status to this client
	client.sendRoomStatus()

	// Read messages and relay to NATS
	client.readPump()
}

// waitForJoin reads the first message and expects a JOIN.
func (c *Client) waitForJoin() error {
	_, data, err := c.conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("read error: %w", err)
	}

	env, err := ParseEnvelope(data)
	if err != nil {
		c.closeWithCode(CloseProtocolError, "Invalid JSON")
		return fmt.Errorf("parse error: %w", err)
	}

	if env.Type != TypeJoin {
		c.closeWithCode(CloseProtocolError, "Expected JOIN message")
		return fmt.Errorf("expected JOIN, got %s", env.Type)
	}

	var payload JoinPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		c.closeWithCode(CloseProtocolError, "Invalid JOIN payload")
		return fmt.Errorf("payload parse error: %w", err)
	}

	// Validate room code
	room := payload.Room
	if !ValidateRoomCode(room) {
		c.closeWithCode(CloseInvalidRoom, "Invalid room code format")
		return fmt.Errorf("invalid room code: %s", room)
	}

	c.room = room

	// Subscribe to NATS subject for this room
	subject := fmt.Sprintf("game.%s", c.room)
	sub, err := c.relay.nc.Subscribe(subject, func(msg *nats.Msg) {
		// Queue message to be sent to this client
		select {
		case c.sendChan <- msg.Data:
		default:
			// Channel full, drop message (client too slow)
			c.relay.log(LogWarn, "Dropping message for slow client in room %s", c.room)
		}
	})
	if err != nil {
		c.closeWithCode(CloseSubscribeFailed, "Failed to subscribe")
		return fmt.Errorf("subscribe error: %w", err)
	}
	c.sub = sub

	return nil
}

// sendRoomStatus sends current room status to this client.
func (c *Client) sendRoomStatus() {
	foundryConnected := c.relay.isFoundryConnected(c.room)
	msg, err := MakeEnvelope(TypeRoomStatus, RoomStatusPayload{
		FoundryConnected: foundryConnected,
	})
	if err != nil {
		c.relay.log(LogError, "Failed to create ROOM_STATUS message: %v", err)
		return
	}

	c.trySend(msg)
}

// readPump reads messages from WebSocket and publishes to NATS.
func (c *Client) readPump() {
	defer func() {
		if c.sub != nil {
			c.sub.Unsubscribe()
		}
		c.markClosed()
		close(c.sendChan)
		c.conn.Close()
	}()

	subject := fmt.Sprintf("game.%s", c.room)

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				c.relay.log(LogWarn, "WebSocket error: %v", err)
			}
			return
		}

		// Validate it's a proper envelope before relaying
		env, err := ParseEnvelope(data)
		if err != nil {
			c.relay.log(LogWarn, "Invalid message from client: %v", err)
			continue
		}

		// Handle IDENTIFY locally (don't relay to NATS)
		if env.Type == TypeIdentify {
			c.handleIdentify(env.Payload)
			continue
		}

		// Publish to NATS
		if err := c.relay.nc.Publish(subject, data); err != nil {
			c.relay.log(LogError, "NATS publish error: %v", err)
			return
		}
	}
}

// handleIdentify processes an IDENTIFY message and updates client type.
func (c *Client) handleIdentify(payload json.RawMessage) {
	var p IdentifyPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		c.relay.log(LogWarn, "Invalid IDENTIFY payload: %v", err)
		return
	}

	oldType := c.getClientType()
	var newType ClientType

	switch p.ClientType {
	case "foundry":
		newType = ClientTypeFoundry
	case "phone":
		newType = ClientTypePhone
	default:
		c.relay.log(LogWarn, "Unknown client type: %s", p.ClientType)
		return
	}

	c.setClientType(newType)
	c.relay.log(LogInfo, "Client identified as %s in room %s", newType, c.room)

	// If client type changed, broadcast new room status
	if oldType != newType {
		c.relay.broadcastRoomStatus(c.room)
	}
}

// writePump sends messages from the sendChan to the WebSocket.
func (c *Client) writePump() {
	for data := range c.sendChan {
		if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
			c.relay.log(LogWarn, "WebSocket write error: %v", err)
			return
		}
	}
}

// closeWithCode closes the WebSocket with an error code and message.
func (c *Client) closeWithCode(code int, message string) {
	c.conn.WriteMessage(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(code, message),
	)
	c.conn.Close()
}

// getClientType returns the client type (thread-safe).
func (c *Client) getClientType() ClientType {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.clientType
}

// setClientType sets the client type (thread-safe).
func (c *Client) setClientType(t ClientType) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.clientType = t
}

// trySend attempts to send a message to the client's send channel.
// Returns false if the channel is closed or full.
func (c *Client) trySend(msg []byte) bool {
	c.mu.RLock()
	if c.closed {
		c.mu.RUnlock()
		return false
	}
	c.mu.RUnlock()

	select {
	case c.sendChan <- msg:
		return true
	default:
		return false
	}
}

// markClosed marks the client as closed (should be called before closing sendChan).
func (c *Client) markClosed() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.closed = true
}

// addToRoom registers a client in a room.
func (r *Relay) addToRoom(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.rooms[c.room] == nil {
		r.rooms[c.room] = make(map[*Client]struct{})
	}
	r.rooms[c.room][c] = struct{}{}
}

// removeFromRoom unregisters a client from a room.
func (r *Relay) removeFromRoom(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if clients, ok := r.rooms[c.room]; ok {
		delete(clients, c)
		if len(clients) == 0 {
			delete(r.rooms, c.room)
		}
	}
	r.log(LogInfo, "Client left room %s", c.room)
}

// RoomCount returns the number of active rooms.
func (r *Relay) RoomCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.rooms)
}

// ClientCount returns the total number of connected clients.
func (r *Relay) ClientCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	count := 0
	for _, clients := range r.rooms {
		count += len(clients)
	}
	return count
}

// Stats returns current relay statistics.
func (r *Relay) Stats() Stats {
	r.mu.RLock()
	defer r.mu.RUnlock()

	stats := Stats{RoomCount: len(r.rooms)}
	for _, clients := range r.rooms {
		for c := range clients {
			stats.ClientCount++
			switch c.getClientType() {
			case ClientTypeFoundry:
				stats.FoundryCount++
			case ClientTypePhone:
				stats.PhoneCount++
			}
		}
	}
	return stats
}

// isFoundryConnected checks if a Foundry client is connected to a room.
func (r *Relay) isFoundryConnected(room string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	clients, ok := r.rooms[room]
	if !ok {
		return false
	}

	for client := range clients {
		if client.getClientType() == ClientTypeFoundry {
			return true
		}
	}
	return false
}

// broadcastRoomStatus sends ROOM_STATUS to all clients in a room.
func (r *Relay) broadcastRoomStatus(room string) {
	r.mu.RLock()
	clients, ok := r.rooms[room]
	if !ok {
		r.mu.RUnlock()
		return
	}

	foundryConnected := false
	for client := range clients {
		if client.getClientType() == ClientTypeFoundry {
			foundryConnected = true
			break
		}
	}

	// Copy clients to send to (avoid holding lock during send)
	clientList := make([]*Client, 0, len(clients))
	for client := range clients {
		clientList = append(clientList, client)
	}
	r.mu.RUnlock()

	msg, err := MakeEnvelope(TypeRoomStatus, RoomStatusPayload{
		FoundryConnected: foundryConnected,
	})
	if err != nil {
		r.log(LogError, "Failed to create ROOM_STATUS message: %v", err)
		return
	}

	for _, client := range clientList {
		client.trySend(msg)
	}
}
