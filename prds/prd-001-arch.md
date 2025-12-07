# **Product Requirements Document (PRD): Foundry VTT Remote Control (Lean Architecture)**

Version: 4.1 (Pure Go \+ Embedded NATS \+ Monorepo Structure)  
Status: Ready for Development  
Architecture Type: Single Binary / Stateless

## **1\. Executive Summary**

Develop a "Remote Control" system for Foundry VTT.  
Core Innovation: The system runs as a stateless, single-binary Golang application. It embeds a NATS server for high-speed message relaying and serves the web client directly.  
Authentication: Uses a "Pairing Code" model. The Server has no user accounts; it purely relays handshake messages between the Phone and Foundry.

## **2\. System Architecture**

### **2.1 The Lean Server (Golang)**

* **Role:** The dumb pipe.  
* **Components:**  
  1. **Static File Server:** Serves the ./public folder containing the Web Client.  
  2. **Embedded NATS:** Runs in-process (ephemeral, no disk persistence).  
  3. **WebSocket Bridge:** Accepts connections at /ws and pumps data to NATS.

### **2.2 The Foundry Module (Host)**

* **Role:** The Logic & Auth Provider.  
* **Responsibilities:**  
  * Connects to Server (wss://...).  
  * Generates Pairing Codes (e.g., "5599").  
  * Validates "Pairing Requests" from the Relay.  
  * Executes token.document.update({x, y}) on Move commands.

### **2.3 The Web Client (Player)**

* **Role:** The UI.  
* **Responsibilities:**  
  * Prompts user for **Room Code** & **Pairing Code**.  
  * Connects to WebSocket.  
  * Sends PAIR request.  
  * On success, shows D-Pad.  
  * Sends MOVE commands (max 1/150ms).

## **3\. Data Flow (Stateless)**

### **3.1 Pairing Flow**

1. **Foundry:** User clicks "Remote". Module generates code ABCD. Stores in RAM.  
2. **Phone:** User enters Room GAME1 and Code ABCD.  
3. **Server:** Receives PAIR msg. Relays to NATS subject game.GAME1.  
4. **Foundry:** Receives PAIR. Checks ABCD.  
5. **Foundry:** Sends PAIR\_SUCCESS (with Actor Data) back to NATS.  
6. **Phone:** Receives PAIR\_SUCCESS. Unlocks UI.

### **3.2 Movement Flow**

1. **Phone:** User taps "Up".  
2. **Server:** Relays MOVE to NATS game.GAME1.  
3. **Foundry:** Receives MOVE. Checks if that socket is authorized (optional, or trusts the Pair). Moves Token.

## **4\. Component Requirements**

### **4.1 Server (Golang)**

* **Dependencies:** github.com/nats-io/nats-server/v2, github.com/gorilla/websocket.  
* **Persistence:** None. If server restarts, clients reconnect and re-pair (or auto-reconnect).

### **4.2 Web Client**

* **Files:** Single index.html (plus optional CSS/JS).  
* **Tech:** Vanilla JS.

## **5\. Deployment**

* **Artifact:** Single Binary (server).  
* **Command:** ./server  
* **Ports:** 8080 (default).

## **6\. Suggested Monorepo Organization**

To streamline development and separate the three distinct environments (Go, Browser, Foundry VTT), the following folder structure is recommended:  
foundry-remote/  
├── README.md               \# Documentation and setup instructions  
├── Makefile                \# Automation for build steps  
├── .gitignore  
│  
├── server/                 \# THE RELAY (Golang)  
│   ├── main.go             \# The single binary source code  
│   ├── go.mod  
│   ├── go.sum  
│   └── public/             \# The "Build Target" for the web client  
│       └── .keep           \# (Empty file to ensure git tracks folder)  
│  
├── client/                 \# THE REMOTE (HTML/JS)  
│   ├── index.html          \# Main entry point for the phone  
│   ├── styles.css          \# Optional separate CSS  
│   ├── app.js              \# Gamepad loop and WebSocket logic  
│   └── assets/             \# SVG icons (D-Pad, etc.)  
│  
└── foundry-module/         \# THE HOST (TypeScript)  
    ├── module.json         \# Foundry VTT Manifest  
    ├── src/  
    │   └── main.ts         \# Main entry point for Foundry Logic  
    ├── styles/  
    │   └── remote.css      \# Styling for the Foundry-side "Pairing" dialog  
    ├── templates/          \# HTML templates for the Pairing dialog  
    ├── package.json        \# Dev dependencies (e.g., Rollup/Vite)  
    └── tsconfig.json

### **6.1 Build Workflow**

1. **Client Build:**  
   * *Task:* Copy contents of client/ into server/public/.  
   * *Purpose:* Allows the Go binary to embed or serve the latest web client code.  
2. **Server Build:**  
   * *Task:* Run go build \-o dist/remote-server ./server.  
   * *Purpose:* Generates the executable that runs the NATS relay and serves the web page.  
3. **Module Build:**  
   * *Task:* Run npm run build (inside foundry-module/).  
   * *Purpose:* Transpiles TypeScript to JavaScript and copies module.json to dist/foundry-module/. This folder is then zipped to create the installable Foundry Module.