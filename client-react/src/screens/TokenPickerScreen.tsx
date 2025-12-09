import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useGameStore } from '@/stores/gameStore';

export function TokenPickerScreen() {
  const { userName, availableTokens, selectToken, logout } = useGameStore();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b">
        <span className="font-medium">{userName}</span>
        <Button variant="ghost" size="icon" onClick={logout} title="Logout">
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </Button>
      </header>

      {/* Content */}
      <div className="flex-1 p-4">
        <h2 className="text-xl font-semibold mb-4">Select Token</h2>

        {availableTokens.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No tokens available to control
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {availableTokens.map((token) => (
              <Card
                key={token.tokenId}
                className="p-3 cursor-pointer hover:bg-accent transition-colors active:scale-95"
                onClick={() => selectToken(token.tokenId, token.sceneId)}
              >
                <div className="aspect-square mb-2 rounded-md overflow-hidden bg-muted">
                  <img
                    src={
                      token.img ||
                      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%23555"/></svg>'
                    }
                    alt={token.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="font-medium text-sm truncate">{token.name}</p>
                {token.sceneName && (
                  <p className="text-xs text-muted-foreground truncate">
                    {token.sceneName}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
