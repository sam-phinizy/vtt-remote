import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGameStore } from '@/stores/gameStore';
import { DPad } from '@/components/DPad';
import { DiceRoller } from '@/components/DiceRoller';
import { ActorInfo } from '@/components/ActorInfo';

export function ControlScreen() {
  const { tokenName, disconnect, setScreen, isLoggedIn, isConnected } =
    useGameStore();

  const [activeTab, setActiveTab] = useState('dpad');

  const handleSwitchToken = () => {
    setScreen('token-picker');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b">
        {isLoggedIn ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSwitchToken}
            title="Switch Token"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M8 3L4 7l4 4" />
              <path d="M4 7h16" />
              <path d="M16 21l4-4-4-4" />
              <path d="M20 17H4" />
            </svg>
          </Button>
        ) : (
          <div className="w-10" />
        )}

        <span className="font-medium">{tokenName || 'Token'}</span>

        <Button
          variant="ghost"
          size="icon"
          onClick={disconnect}
          title="Disconnect"
        >
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

      {/* Main Content */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col"
      >
        <TabsList className="grid w-full grid-cols-3 rounded-none border-b">
          <TabsTrigger value="dpad">D-Pad</TabsTrigger>
          <TabsTrigger value="dice">Dice</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>

        <TabsContent value="dpad" className="flex-1 flex items-center justify-center p-4 mt-0">
          <DPad />
        </TabsContent>

        <TabsContent value="dice" className="flex-1 p-4 mt-0 overflow-y-auto">
          <DiceRoller />
        </TabsContent>

        <TabsContent value="info" className="flex-1 p-4 mt-0 overflow-y-auto">
          <ActorInfo />
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <footer className="p-2 border-t text-center">
        <span
          className={`text-sm ${isConnected ? 'text-green-500' : 'text-red-500'}`}
        >
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </footer>
    </div>
  );
}
