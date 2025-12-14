import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './App.css';
import {
  StartServer,
  StopServer,
  GetStatus,
  GetStats,
  GetServerURL,
  GetLogs,
  ClearLogs,
  SetPort,
} from '../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../wailsjs/runtime/runtime';

// Use string for state to match Wails-generated bindings
interface ServerStatus {
  state: string;
  port: number;
  localIP: string;
  localHostname: string;
  error?: string;
}

interface ClientStats {
  roomCount: number;
  foundryCount: number;
  phoneCount: number;
  totalClients: number;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

function App() {
  const [status, setStatus] = useState<ServerStatus>({
    state: 'stopped',
    port: 8080,
    localIP: '',
    localHostname: '',
  });
  const [stats, setStats] = useState<ClientStats>({
    roomCount: 0,
    foundryCount: 0,
    phoneCount: 0,
    totalClients: 0,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [serverURL, setServerURL] = useState('');
  const [portInput, setPortInput] = useState('8080');

  // Fetch initial status
  useEffect(() => {
    GetStatus().then(setStatus);
    GetServerURL().then(setServerURL);
    GetLogs().then(setLogs);
  }, []);

  // Subscribe to events
  useEffect(() => {
    const handleStatus = (newStatus: ServerStatus) => {
      setStatus(newStatus);
      GetServerURL().then(setServerURL);
    };

    const handleLog = (entry: LogEntry) => {
      setLogs((prev) => [...prev.slice(-99), entry]);
    };

    EventsOn('serverStatus', handleStatus);
    EventsOn('log', handleLog);

    return () => {
      EventsOff('serverStatus');
      EventsOff('log');
    };
  }, []);

  // Poll stats when running
  useEffect(() => {
    if (status.state !== 'running') return;

    const interval = setInterval(() => {
      GetStats().then(setStats);
    }, 2000);

    return () => clearInterval(interval);
  }, [status.state]);

  const handleStart = useCallback(async () => {
    console.log('Starting server...');
    try {
      await StartServer();
      console.log('StartServer returned');
      // Refresh status after start
      const newStatus = await GetStatus();
      console.log('New status:', newStatus);
      setStatus(newStatus);
    } catch (err) {
      console.error('Failed to start server:', err);
      alert(`Failed to start server: ${err}`);
    }
  }, []);

  const handleStop = useCallback(async () => {
    try {
      await StopServer();
      setStats({ roomCount: 0, foundryCount: 0, phoneCount: 0, totalClients: 0 });
    } catch (err) {
      console.error('Failed to stop server:', err);
    }
  }, []);

  const handleSetPort = useCallback(async () => {
    const port = parseInt(portInput, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      alert('Invalid port number');
      return;
    }
    try {
      await SetPort(port);
      GetStatus().then(setStatus);
      GetServerURL().then(setServerURL);
    } catch (err) {
      console.error('Failed to set port:', err);
    }
  }, [portInput]);

  const handleClearLogs = useCallback(() => {
    ClearLogs();
    setLogs([]);
  }, []);

  const isRunning = status.state === 'running';
  const isStarting = status.state === 'starting';

  return (
    <div className="app">
      <header className="header">
        <h1>VTT Remote Control Panel</h1>
      </header>

      <main className="main">
        <div className="panel-row">
          {/* Server Status Panel */}
          <section className="panel">
            <h2>Server Status</h2>
            <div className="status-indicator">
              <span
                className={`status-dot ${isRunning ? 'running' : isStarting ? 'starting' : 'stopped'}`}
              />
              <span className="status-text">
                {isRunning ? 'Running' : isStarting ? 'Starting...' : 'Stopped'}
              </span>
            </div>

            <div className="info-row">
              <label>IP Address:</label>
              <span>{status.localIP || 'N/A'}</span>
            </div>

            <div className="info-row">
              <label>Port:</label>
              <input
                type="number"
                value={portInput}
                onChange={(e) => setPortInput(e.target.value)}
                disabled={isRunning || isStarting}
                min="1"
                max="65535"
              />
              {!isRunning && !isStarting && (
                <button onClick={handleSetPort} className="btn-small">
                  Set
                </button>
              )}
            </div>

            <div className="button-row">
              <button
                onClick={handleStart}
                disabled={isRunning || isStarting}
                className="btn btn-start"
              >
                Start Server
              </button>
              <button
                onClick={handleStop}
                disabled={!isRunning}
                className="btn btn-stop"
              >
                Stop Server
              </button>
            </div>
          </section>

          {/* QR Code Panel */}
          <section className="panel">
            <h2>Phone Access</h2>
            {isRunning && serverURL ? (
              <>
                <div className="qr-container">
                  <QRCodeSVG value={serverURL} size={150} bgColor="#18181b" fgColor="#ffffff" />
                </div>
                <div className="url-display">{serverURL}</div>
              </>
            ) : (
              <div className="qr-placeholder">
                <p>Start the server to generate QR code</p>
              </div>
            )}
          </section>
        </div>

        <div className="panel-row">
          {/* Clients Panel */}
          <section className="panel">
            <h2>Connected Clients</h2>
            <div className="stats-grid">
              <div className="stat">
                <span className="stat-value">{stats.roomCount}</span>
                <span className="stat-label">Rooms</span>
              </div>
              <div className="stat">
                <span className="stat-value">{stats.foundryCount}</span>
                <span className="stat-label">Foundry</span>
              </div>
              <div className="stat">
                <span className="stat-value">{stats.phoneCount}</span>
                <span className="stat-label">Phones</span>
              </div>
              <div className="stat">
                <span className="stat-value">{stats.totalClients}</span>
                <span className="stat-label">Total</span>
              </div>
            </div>
          </section>

          {/* Foundry Connection Panel */}
          <section className="panel">
            <h2>Foundry Connection</h2>
            {isRunning ? (
              <>
                <div className="info-row">
                  <label>Hostname:</label>
                  <span className="url-display">{status.localHostname}</span>
                </div>
                <div className="info-row">
                  <label>WebSocket:</label>
                  <span className="url-display" style={{ flex: 1, textAlign: 'left' }}>
                    ws://{status.localHostname}:{status.port}/ws
                  </span>
                </div>
                <div className="info-row" style={{ opacity: 0.7, fontSize: '0.85em' }}>
                  <label>Fallback IP:</label>
                  <span>{status.localIP}:{status.port}</span>
                </div>
              </>
            ) : (
              <p className="not-found">Start server to see connection info</p>
            )}
          </section>
        </div>

        {/* Logs Panel */}
        <section className="panel logs-panel">
          <div className="logs-header">
            <h2>Server Logs</h2>
            <button onClick={handleClearLogs} className="btn-small">
              Clear
            </button>
          </div>
          <div className="logs-container">
            {logs.length === 0 ? (
              <p className="no-logs">No logs yet</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`log-entry log-${log.level}`}>
                  <span className="log-time">{log.timestamp}</span>
                  <span className="log-level">[{log.level}]</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
