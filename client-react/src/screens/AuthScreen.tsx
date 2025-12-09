import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGameStore, hashPassword } from '@/stores/gameStore';
import { ThemePicker } from '@/components/ThemePicker';

// Room code validation: 4-8 alphanumeric characters
const isValidRoomCode = (code: string) => /^[A-Z0-9]{4,8}$/.test(code);

export function AuthScreen() {
  const {
    roomCode, setRoomCode, pair, login, authMode, setAuthMode,
    foundryConnected, isConnected, connectForStatus,
    loginWithToken, hasStoredSession, clearStoredSession
  } = useGameStore();

  // Check for stored session
  const storedSessionUser = localStorage.getItem('vtt-remote-session-user');
  const hasSession = hasStoredSession();

  // Debounced connection for room status
  useEffect(() => {
    if (!isValidRoomCode(roomCode)) return;

    const timer = setTimeout(() => {
      connectForStatus(roomCode);
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [roomCode, connectForStatus]);

  // Login form state
  const [username, setUsername] = useState(
    () => localStorage.getItem('vtt-remote-username') || ''
  );
  const [password, setPassword] = useState('');

  // Pairing form state
  const [pairingCode, setPairingCode] = useState('');

  const [isConnecting, setIsConnecting] = useState(false);

  const handleQuickLogin = () => {
    if (!isValidRoomCode(roomCode)) return;
    setIsConnecting(true);
    loginWithToken();
    setTimeout(() => setIsConnecting(false), 5000);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode || !username || !password) return;

    setIsConnecting(true);
    localStorage.setItem('vtt-remote-username', username);

    const passwordHash = hashPassword(password, roomCode.toUpperCase());
    login(username, passwordHash);

    // Reset connecting state after a timeout (connection handling is in store)
    setTimeout(() => setIsConnecting(false), 5000);
  };

  const handlePairing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode || !pairingCode) return;

    setIsConnecting(true);
    pair(pairingCode);

    setTimeout(() => setIsConnecting(false), 5000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative">
      {/* Theme picker in corner */}
      <div className="absolute top-4 right-4">
        <ThemePicker />
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">VTT Remote</CardTitle>
          {/* Room status indicator - only show when connected to relay and joined a room */}
          {isConnected && (
            <div className={`flex items-center justify-center gap-2 text-sm mt-2 ${foundryConnected ? 'text-green-500' : 'text-yellow-500'}`}>
              <span className={`w-2 h-2 rounded-full ${foundryConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
              <span>
                {foundryConnected ? 'Foundry connected' : 'Waiting for Foundry...'}
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {/* Quick login if we have a stored session */}
          {hasSession && storedSessionUser && (
            <div className="mb-6 p-4 border rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-3">
                Welcome back, <span className="font-medium text-foreground">{storedSessionUser}</span>
              </p>
              <div className="space-y-2">
                <div className="space-y-2">
                  <label htmlFor="quick-room" className="text-sm font-medium">
                    Room Code
                  </label>
                  <Input
                    id="quick-room"
                    type="text"
                    placeholder="e.g., GAME1"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    className="uppercase"
                    autoCapitalize="characters"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleQuickLogin}
                  disabled={isConnecting || !isValidRoomCode(roomCode)}
                >
                  {isConnecting ? 'Connecting...' : 'Quick Login'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={clearStoredSession}
                >
                  Use different account
                </Button>
              </div>
            </div>
          )}

          <Tabs
            value={authMode}
            onValueChange={(v) => setAuthMode(v as 'login' | 'pairing')}
          >
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="pairing">QR/Code</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="login-room" className="text-sm font-medium">
                    Room Code
                  </label>
                  <Input
                    id="login-room"
                    type="text"
                    placeholder="e.g., GAME1"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    className="uppercase"
                    autoCapitalize="characters"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="username" className="text-sm font-medium">
                    Username
                  </label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="Your Foundry username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Your remote password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isConnecting}
                >
                  {isConnecting ? 'Connecting...' : 'Login'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="pairing">
              <form onSubmit={handlePairing} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="pairing-room" className="text-sm font-medium">
                    Room Code
                  </label>
                  <Input
                    id="pairing-room"
                    type="text"
                    placeholder="e.g., GAME1"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    className="uppercase"
                    autoCapitalize="characters"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="pairing-code" className="text-sm font-medium">
                    Pairing Code
                  </label>
                  <Input
                    id="pairing-code"
                    type="text"
                    placeholder="e.g., 5599"
                    value={pairingCode}
                    onChange={(e) => setPairingCode(e.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isConnecting}
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </Button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      or
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    // TODO: QR scanner integration
                    alert('QR scanner coming soon!');
                  }}
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                    <rect x="7" y="7" width="10" height="10" />
                  </svg>
                  Scan QR Code
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
