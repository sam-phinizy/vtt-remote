package main

import (
	"context"
	"embed"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/grandcat/zeroconf"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/sam-phinizy/vtt-remote/pkg/natsutil"
	"github.com/sam-phinizy/vtt-remote/pkg/relay"
)

//go:embed phone-client/*
var phoneClientFS embed.FS

// ServerState represents the current state of the relay server.
type ServerState string

const (
	StateStopped  ServerState = "stopped"
	StateStarting ServerState = "starting"
	StateRunning  ServerState = "running"
	StateError    ServerState = "error"
)

// ServerStatus contains the current server status.
type ServerStatus struct {
	State         ServerState `json:"state"`
	Port          int         `json:"port"`
	LocalIP       string      `json:"localIP"`
	LocalHostname string      `json:"localHostname"`
	Error         string      `json:"error,omitempty"`
}

// ClientStats contains connected client statistics.
type ClientStats struct {
	RoomCount    int `json:"roomCount"`
	FoundryCount int `json:"foundryCount"`
	PhoneCount   int `json:"phoneCount"`
	TotalClients int `json:"totalClients"`
}

// LogEntry represents a single log message.
type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

// FoundryModuleStatus contains module installation status.
type FoundryModuleStatus struct {
	Installed  bool   `json:"installed"`
	Version    string `json:"version,omitempty"`
	DataPath   string `json:"dataPath"`
	PathExists bool   `json:"pathExists"`
}

// App struct contains the application state.
type App struct {
	ctx         context.Context
	mu          sync.RWMutex
	nats        *natsutil.EmbeddedNATS
	relay       *relay.Relay
	httpServer  *http.Server
	mdnsServer  *zeroconf.Server
	serverState ServerState
	port        int
	logs        []LogEntry
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{
		port:        8080,
		serverState: StateStopped,
		logs:        make([]LogEntry, 0),
	}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// shutdown is called when the app closes.
func (a *App) shutdown(ctx context.Context) {
	_ = a.StopServer()
}

// StartServer starts the relay server.
func (a *App) StartServer() error {
	// Check and set starting state
	a.mu.Lock()
	if a.serverState == StateRunning {
		a.mu.Unlock()
		return fmt.Errorf("server already running")
	}
	a.serverState = StateStarting
	port := a.port
	a.mu.Unlock()

	a.emitStatus()
	a.addLog("info", "Starting server...")

	// Start embedded NATS
	nats, err := natsutil.Start()
	if err != nil {
		a.mu.Lock()
		a.serverState = StateError
		a.mu.Unlock()
		a.emitStatus()
		a.addLog("error", fmt.Sprintf("Failed to start NATS: %v", err))
		return err
	}

	a.addLog("info", fmt.Sprintf("NATS server started at %s", nats.ClientURL()))

	// Create relay
	r, err := relay.NewRelay(relay.Config{
		NatsURL: nats.ClientURL(),
		OnLog: func(level relay.LogLevel, msg string) {
			a.addLog(string(level), msg)
		},
	})
	if err != nil {
		nats.Shutdown()
		a.mu.Lock()
		a.serverState = StateError
		a.mu.Unlock()
		a.emitStatus()
		a.addLog("error", fmt.Sprintf("Failed to create relay: %v", err))
		return err
	}

	a.addLog("info", "Relay created, setting up HTTP server...")

	// Set up HTTP server with WebSocket and phone client
	mux := http.NewServeMux()

	// Serve embedded phone client
	phoneContent, err := fs.Sub(phoneClientFS, "phone-client")
	if err == nil {
		fileServer := http.FileServer(http.FS(phoneContent))
		mux.Handle("/", fileServer)
	}

	// WebSocket endpoint
	upgrader := websocket.Upgrader{
		CheckOrigin: func(req *http.Request) bool { return true },
	}
	mux.HandleFunc("/ws", func(w http.ResponseWriter, req *http.Request) {
		conn, err := upgrader.Upgrade(w, req, nil)
		if err != nil {
			a.addLog("warn", fmt.Sprintf("WebSocket upgrade failed: %v", err))
			return
		}
		a.addLog("info", fmt.Sprintf("New connection from %s", req.RemoteAddr))
		r.HandleClient(conn)
	})

	// Health endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	httpServer := &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: mux,
	}

	// Start HTTP server in goroutine
	go func() {
		if err := httpServer.ListenAndServe(); err != http.ErrServerClosed {
			a.mu.Lock()
			a.serverState = StateError
			a.mu.Unlock()
			a.emitStatus()
			a.addLog("error", fmt.Sprintf("HTTP server error: %v", err))
		}
	}()

	// Give server time to start
	time.Sleep(50 * time.Millisecond)

	// Store references and set running state
	a.mu.Lock()
	a.nats = nats
	a.relay = r
	a.httpServer = httpServer
	a.serverState = StateRunning
	a.mu.Unlock()

	// Register mDNS hostname (vtt-remote.local)
	mdns, err := zeroconf.Register(
		"vtt-remote",     // Instance name (becomes vtt-remote.local)
		"_http._tcp",     // Service type
		"local.",         // Domain
		port,             // Port
		[]string{"path=/ws"}, // TXT records
		nil,              // Interfaces (nil = all)
	)
	if err != nil {
		a.addLog("warn", fmt.Sprintf("mDNS registration failed: %v", err))
	} else {
		a.mu.Lock()
		a.mdnsServer = mdns
		a.mu.Unlock()
		a.addLog("info", "Registered vtt-remote.local via mDNS")
	}

	a.emitStatus()
	a.addLog("info", fmt.Sprintf("Server started on port %d", port))
	return nil
}

// StopServer stops the relay server.
func (a *App) StopServer() error {
	a.mu.Lock()
	if a.serverState == StateStopped {
		a.mu.Unlock()
		return nil
	}

	// Grab references and clear them
	httpServer := a.httpServer
	relayInstance := a.relay
	natsInstance := a.nats
	mdnsInstance := a.mdnsServer
	a.httpServer = nil
	a.relay = nil
	a.nats = nil
	a.mdnsServer = nil
	a.serverState = StateStopped
	a.mu.Unlock()

	// Shutdown outside of lock
	if mdnsInstance != nil {
		mdnsInstance.Shutdown()
	}
	if httpServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_ = httpServer.Shutdown(ctx)
		cancel()
	}
	if relayInstance != nil {
		relayInstance.Close()
	}
	if natsInstance != nil {
		natsInstance.Shutdown()
	}

	a.emitStatus()
	a.addLog("info", "Server stopped")
	return nil
}

// GetStatus returns current server status.
func (a *App) GetStatus() ServerStatus {
	a.mu.RLock()
	defer a.mu.RUnlock()

	return ServerStatus{
		State:         a.serverState,
		Port:          a.port,
		LocalIP:       getLocalIP(),
		LocalHostname: getLocalHostname(),
	}
}

// GetStats returns client statistics.
func (a *App) GetStats() ClientStats {
	a.mu.RLock()
	defer a.mu.RUnlock()

	if a.relay == nil {
		return ClientStats{}
	}

	stats := a.relay.Stats()
	return ClientStats{
		RoomCount:    stats.RoomCount,
		FoundryCount: stats.FoundryCount,
		PhoneCount:   stats.PhoneCount,
		TotalClients: stats.ClientCount,
	}
}

// SetPort configures the server port (while stopped).
func (a *App) SetPort(port int) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.serverState == StateRunning {
		return fmt.Errorf("cannot change port while running")
	}
	if port < 1 || port > 65535 {
		return fmt.Errorf("invalid port number: %d", port)
	}
	a.port = port
	return nil
}

// GetServerURL returns the full server URL for QR code.
func (a *App) GetServerURL() string {
	return fmt.Sprintf("http://%s:%d", getLocalIP(), a.port)
}

// DetectFoundryPath attempts to find Foundry VTT data directory.
func (a *App) DetectFoundryPath() string {
	var paths []string

	home, _ := os.UserHomeDir()

	switch runtime.GOOS {
	case "darwin":
		paths = []string{
			filepath.Join(home, "Library/Application Support/FoundryVTT/Data"),
			filepath.Join(home, "foundrydata/Data"),
		}
	case "windows":
		localAppData := os.Getenv("LOCALAPPDATA")
		paths = []string{
			filepath.Join(localAppData, "FoundryVTT/Data"),
			filepath.Join("C:", "foundrydata", "Data"),
		}
	case "linux":
		paths = []string{
			filepath.Join(home, ".local/share/FoundryVTT/Data"),
			filepath.Join(home, "foundrydata/Data"),
		}
	}

	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// GetModuleStatus checks if the Foundry module is installed.
func (a *App) GetModuleStatus(dataPath string) FoundryModuleStatus {
	status := FoundryModuleStatus{DataPath: dataPath}

	if dataPath == "" {
		return status
	}

	if _, err := os.Stat(dataPath); err == nil {
		status.PathExists = true
	} else {
		return status
	}

	modulePath := filepath.Join(dataPath, "modules", "arcane-grimoire-vtt-remote")
	manifestPath := filepath.Join(modulePath, "module.json")

	if _, err := os.Stat(manifestPath); err == nil {
		status.Installed = true
		// Could parse module.json for version
	}

	return status
}

// InstallModule copies the Foundry module to the data directory.
func (a *App) InstallModule(dataPath string) error {
	if dataPath == "" {
		return fmt.Errorf("no data path specified")
	}

	modulesDir := filepath.Join(dataPath, "modules")
	targetDir := filepath.Join(modulesDir, "arcane-grimoire-vtt-remote")

	// Create modules directory if needed
	if err := os.MkdirAll(modulesDir, 0755); err != nil {
		return fmt.Errorf("failed to create modules directory: %w", err)
	}

	// Remove existing installation
	_ = os.RemoveAll(targetDir)

	// Create target directory
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return fmt.Errorf("failed to create module directory: %w", err)
	}

	// Copy module files from dist/foundry-module
	sourceDir := filepath.Join("..", "dist", "foundry-module")

	err := filepath.Walk(sourceDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, _ := filepath.Rel(sourceDir, path)
		targetPath := filepath.Join(targetDir, relPath)

		if info.IsDir() {
			return os.MkdirAll(targetPath, info.Mode())
		}

		srcFile, err := os.Open(path)
		if err != nil {
			return err
		}
		defer srcFile.Close()

		dstFile, err := os.Create(targetPath)
		if err != nil {
			return err
		}
		defer dstFile.Close()

		_, err = io.Copy(dstFile, srcFile)
		return err
	})

	if err != nil {
		return fmt.Errorf("failed to copy module files: %w", err)
	}

	a.addLog("info", fmt.Sprintf("Module installed to %s", targetDir))
	return nil
}

// GetLogs returns recent log entries.
func (a *App) GetLogs() []LogEntry {
	a.mu.RLock()
	defer a.mu.RUnlock()
	// Return a copy
	logs := make([]LogEntry, len(a.logs))
	copy(logs, a.logs)
	return logs
}

// ClearLogs clears the log buffer.
func (a *App) ClearLogs() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.logs = make([]LogEntry, 0)
}

// addLog adds a log entry and emits to frontend.
func (a *App) addLog(level, message string) {
	entry := LogEntry{
		Timestamp: time.Now().Format("15:04:05"),
		Level:     level,
		Message:   message,
	}

	a.mu.Lock()
	a.logs = append(a.logs, entry)
	// Keep only last 500 entries
	if len(a.logs) > 500 {
		a.logs = a.logs[len(a.logs)-500:]
	}
	a.mu.Unlock()

	// Emit to frontend
	if a.ctx != nil {
		wailsruntime.EventsEmit(a.ctx, "log", entry)
	}
}

// emitStatus emits the current server status to the frontend.
// Must be called WITHOUT holding the lock - it will acquire its own.
func (a *App) emitStatus() {
	if a.ctx != nil {
		wailsruntime.EventsEmit(a.ctx, "serverStatus", a.GetStatus())
	}
}

// emitStatusLocked emits status when lock is already held.
// Caller must hold a.mu lock.
func (a *App) emitStatusLocked() {
	if a.ctx != nil {
		status := ServerStatus{
			State:         a.serverState,
			Port:          a.port,
			LocalIP:       getLocalIP(),
			LocalHostname: getLocalHostname(),
		}
		wailsruntime.EventsEmit(a.ctx, "serverStatus", status)
	}
}

// getLocalIP returns the preferred outbound IP of this machine.
func getLocalIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "localhost"
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

// getLocalHostname returns the machine's .local mDNS hostname.
func getLocalHostname() string {
	hostname, err := os.Hostname()
	if err != nil {
		return ""
	}
	// On macOS, hostname may already include .local suffix
	if strings.HasSuffix(hostname, ".local") {
		return hostname
	}
	return hostname + ".local"
}
