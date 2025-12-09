package main

import (
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/nats-io/nats.go"
)

// WebSocket close codes for protocol errors.
const (
	CloseProtocolError  = 4001
	CloseInvalidRoom    = 4002
	CloseSubscribeFailed = 4003
)

// roomCodeRegex validates room codes: 4-8 alphanumeric characters.
var roomCodeRegex = regexp.MustCompile(`^[a-zA-Z0-9]{4,8}$`)

// ClientType identifies whether a client is Foundry or a phone.
type ClientType string

const (
	ClientTypeUnknown ClientType = ""
	ClientTypeFoundry ClientType = "foundry"
	ClientTypePhone   ClientType = "phone"
)

// Client represents a connected WebSocket client.
type Client struct {
	conn       *websocket.Conn
	room       string
	clientType ClientType
	sub        *nats.Subscription
	sendChan   chan []byte
	relay      *Relay
}

// Relay manages the NATS connection and room subscriptions.
type Relay struct {
	nc      *nats.Conn
	mu      sync.RWMutex
	rooms   map[string]map[*Client]struct{} // room -> set of clients
}

// NewRelay creates a relay connected to the given NATS URL.
func NewRelay(natsURL string) (*Relay, error) {
	nc, err := nats.Connect(natsURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}

	return &Relay{
		nc:    nc,
		rooms: make(map[string]map[*Client]struct{}),
	}, nil
}

// Close shuts down the NATS connection.
func (r *Relay) Close() {
	r.nc.Close()
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
		log.Printf("Client failed to join: %v", err)
		return
	}

	// Register client in room
	r.addToRoom(client)
	defer func() {
		r.removeFromRoom(client)
		// Broadcast status change when client leaves
		r.broadcastRoomStatus(client.room)
	}()

	log.Printf("Client joined room %s", client.room)

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

	// Normalize room code to uppercase
	room := payload.Room
	if !roomCodeRegex.MatchString(room) {
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
			log.Printf("Dropping message for slow client in room %s", c.room)
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
		log.Printf("Failed to create ROOM_STATUS message: %v", err)
		return
	}

	select {
	case c.sendChan <- msg:
	default:
		// Channel full, skip
	}
}

// readPump reads messages from WebSocket and publishes to NATS.
func (c *Client) readPump() {
	defer func() {
		if c.sub != nil {
			c.sub.Unsubscribe()
		}
		close(c.sendChan)
		c.conn.Close()
	}()

	subject := fmt.Sprintf("game.%s", c.room)

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			return
		}

		// Validate it's a proper envelope before relaying
		env, err := ParseEnvelope(data)
		if err != nil {
			log.Printf("Invalid message from client: %v", err)
			continue
		}

		// Handle IDENTIFY locally (don't relay to NATS)
		if env.Type == TypeIdentify {
			c.handleIdentify(env.Payload)
			continue
		}

		// Publish to NATS
		if err := c.relay.nc.Publish(subject, data); err != nil {
			log.Printf("NATS publish error: %v", err)
			return
		}
	}
}

// handleIdentify processes an IDENTIFY message and updates client type.
func (c *Client) handleIdentify(payload json.RawMessage) {
	var p IdentifyPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		log.Printf("Invalid IDENTIFY payload: %v", err)
		return
	}

	oldType := c.clientType

	switch p.ClientType {
	case "foundry":
		c.clientType = ClientTypeFoundry
	case "phone":
		c.clientType = ClientTypePhone
	default:
		log.Printf("Unknown client type: %s", p.ClientType)
		return
	}

	log.Printf("Client identified as %s in room %s", c.clientType, c.room)

	// If client type changed, broadcast new room status
	if oldType != c.clientType {
		c.relay.broadcastRoomStatus(c.room)
	}
}

// writePump sends messages from the sendChan to the WebSocket.
func (c *Client) writePump() {
	for data := range c.sendChan {
		if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("WebSocket write error: %v", err)
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
	log.Printf("Client left room %s", c.room)
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

// isFoundryConnected checks if a Foundry client is connected to a room.
func (r *Relay) isFoundryConnected(room string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	clients, ok := r.rooms[room]
	if !ok {
		return false
	}

	for client := range clients {
		if client.clientType == ClientTypeFoundry {
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
		if client.clientType == ClientTypeFoundry {
			foundryConnected = true
			break
		}
	}
	r.mu.RUnlock()

	msg, err := MakeEnvelope(TypeRoomStatus, RoomStatusPayload{
		FoundryConnected: foundryConnected,
	})
	if err != nil {
		log.Printf("Failed to create ROOM_STATUS message: %v", err)
		return
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	for client := range clients {
		select {
		case client.sendChan <- msg:
		default:
			// Channel full, skip
		}
	}
}
