package main

import (
	"encoding/json"
	"testing"
)

func TestParseEnvelope(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantType MessageType
		wantErr bool
	}{
		{
			name:     "valid JOIN message",
			input:    `{"type":"JOIN","payload":{"room":"GAME1"}}`,
			wantType: TypeJoin,
			wantErr:  false,
		},
		{
			name:     "valid MOVE message",
			input:    `{"type":"MOVE","payload":{"direction":"up","tokenId":"abc123"}}`,
			wantType: TypeMove,
			wantErr:  false,
		},
		{
			name:    "invalid JSON",
			input:   `{not valid json}`,
			wantErr: true,
		},
		{
			name:    "empty input",
			input:   ``,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			env, err := ParseEnvelope([]byte(tt.input))
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseEnvelope() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && env.Type != tt.wantType {
				t.Errorf("ParseEnvelope() type = %v, want %v", env.Type, tt.wantType)
			}
		})
	}
}

func TestMakeEnvelope(t *testing.T) {
	payload := JoinPayload{Room: "TEST1"}
	data, err := MakeEnvelope(TypeJoin, payload)
	if err != nil {
		t.Fatalf("MakeEnvelope() error = %v", err)
	}

	// Parse it back
	env, err := ParseEnvelope(data)
	if err != nil {
		t.Fatalf("ParseEnvelope() error = %v", err)
	}

	if env.Type != TypeJoin {
		t.Errorf("Type = %v, want %v", env.Type, TypeJoin)
	}

	var parsed JoinPayload
	if err := json.Unmarshal(env.Payload, &parsed); err != nil {
		t.Fatalf("Unmarshal payload error = %v", err)
	}

	if parsed.Room != "TEST1" {
		t.Errorf("Room = %v, want TEST1", parsed.Room)
	}
}

func TestRoomCodeRegex(t *testing.T) {
	valid := []string{"GAME", "game1", "ABC123", "test", "ABCD1234"}
	invalid := []string{"AB", "ABC", "ABCDEFGHI", "game-1", "game_1", "game 1", ""}

	for _, code := range valid {
		if !roomCodeRegex.MatchString(code) {
			t.Errorf("Expected %q to be valid", code)
		}
	}

	for _, code := range invalid {
		if roomCodeRegex.MatchString(code) {
			t.Errorf("Expected %q to be invalid", code)
		}
	}
}
