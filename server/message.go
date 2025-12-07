package main

import "encoding/json"

// MessageType identifies the kind of message.
type MessageType string

const (
	TypeJoin           MessageType = "JOIN"
	TypePair           MessageType = "PAIR"
	TypePairSuccess    MessageType = "PAIR_SUCCESS"
	TypePairFailed     MessageType = "PAIR_FAILED"
	TypeMove           MessageType = "MOVE"
	TypeMoveAck        MessageType = "MOVE_ACK"
	TypeRollDice       MessageType = "ROLL_DICE"
	TypeRollDiceResult MessageType = "ROLL_DICE_RESULT"
)

// Envelope is the outer wrapper for all messages.
type Envelope struct {
	Type    MessageType     `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// JoinPayload contains the room code for joining.
type JoinPayload struct {
	Room string `json:"room"`
}

// PairPayload contains the pairing code.
type PairPayload struct {
	Code string `json:"code"`
}

// PairSuccessPayload contains token info after successful pairing.
type PairSuccessPayload struct {
	TokenID   string `json:"tokenId"`
	TokenName string `json:"tokenName"`
	ActorName string `json:"actorName,omitempty"`
}

// PairFailedPayload contains the failure reason.
type PairFailedPayload struct {
	Reason string `json:"reason"`
}

// MovePayload contains movement direction.
type MovePayload struct {
	Direction string `json:"direction"`
	TokenID   string `json:"tokenId"`
}

// MoveAckPayload confirms movement with new position.
type MoveAckPayload struct {
	TokenID string  `json:"tokenId"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
}

// ParseEnvelope extracts the message type and raw payload.
func ParseEnvelope(data []byte) (*Envelope, error) {
	var env Envelope
	if err := json.Unmarshal(data, &env); err != nil {
		return nil, err
	}
	return &env, nil
}

// MakeEnvelope creates a JSON message with the given type and payload.
func MakeEnvelope(msgType MessageType, payload any) ([]byte, error) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	env := Envelope{
		Type:    msgType,
		Payload: payloadBytes,
	}
	return json.Marshal(env)
}
