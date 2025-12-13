package natsutil

import (
	"strings"
	"testing"

	"github.com/nats-io/nats.go"
)

func TestEmbeddedNATSStart(t *testing.T) {
	ns, err := Start()
	if err != nil {
		t.Fatalf("Failed to start embedded NATS: %v", err)
	}
	defer ns.Shutdown()

	if !ns.Running() {
		t.Error("Server should be running after Start()")
	}

	url := ns.ClientURL()
	if !strings.HasPrefix(url, "nats://127.0.0.1:") {
		t.Errorf("ClientURL = %q, want nats://127.0.0.1:*", url)
	}
}

func TestEmbeddedNATSConnectivity(t *testing.T) {
	ns, err := Start()
	if err != nil {
		t.Fatalf("Failed to start embedded NATS: %v", err)
	}
	defer ns.Shutdown()

	// Connect a client
	nc, err := nats.Connect(ns.ClientURL())
	if err != nil {
		t.Fatalf("Failed to connect to NATS: %v", err)
	}
	defer nc.Close()

	// Test pub/sub
	received := make(chan []byte, 1)
	sub, err := nc.Subscribe("test.topic", func(msg *nats.Msg) {
		received <- msg.Data
	})
	if err != nil {
		t.Fatalf("Failed to subscribe: %v", err)
	}
	defer sub.Unsubscribe()

	// Publish a message
	err = nc.Publish("test.topic", []byte("hello"))
	if err != nil {
		t.Fatalf("Failed to publish: %v", err)
	}

	// Wait for message
	select {
	case msg := <-received:
		if string(msg) != "hello" {
			t.Errorf("Received %q, want %q", msg, "hello")
		}
	default:
		nc.Flush()
		select {
		case msg := <-received:
			if string(msg) != "hello" {
				t.Errorf("Received %q, want %q", msg, "hello")
			}
		}
	}
}

func TestEmbeddedNATSShutdown(t *testing.T) {
	ns, err := Start()
	if err != nil {
		t.Fatalf("Failed to start embedded NATS: %v", err)
	}

	if !ns.Running() {
		t.Error("Server should be running")
	}

	ns.Shutdown()

	if ns.Running() {
		t.Error("Server should not be running after Shutdown()")
	}
}
