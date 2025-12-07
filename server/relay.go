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

// Client represents a connected WebSocket client.
type Client struct {
	conn     *websocket.Conn
	room     string
	sub      *nats.Subscription
	sendChan chan []byte
	relay    *Relay
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
		conn:     conn,
		sendChan: make(chan []byte, 64),
		relay:    r,
	}

	// Wait for JOIN message first
	if err := client.waitForJoin(); err != nil {
		log.Printf("Client failed to join: %v", err)
		return
	}

	// Register client in room
	r.addToRoom(client)
	defer r.removeFromRoom(client)

	log.Printf("Client joined room %s", client.room)

	// Start writer goroutine
	go client.writePump()

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
		if _, err := ParseEnvelope(data); err != nil {
			log.Printf("Invalid message from client: %v", err)
			continue
		}

		// Publish to NATS
		if err := c.relay.nc.Publish(subject, data); err != nil {
			log.Printf("NATS publish error: %v", err)
			return
		}
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
