import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useGameStore } from '@/stores/gameStore';

const QUICK_DICE = [
  { formula: '1d4', label: 'd4' },
  { formula: '1d6', label: 'd6' },
  { formula: '1d8', label: 'd8' },
  { formula: '1d10', label: 'd10' },
  { formula: '1d12', label: 'd12' },
  { formula: '1d20', label: 'd20' },
];

export function DiceRoller() {
  const { rollDice, lastDiceResult } = useGameStore();
  const [customFormula, setCustomFormula] = useState('');
  const [postToChat, setPostToChat] = useState(true);

  const handleRoll = (formula: string) => {
    rollDice(formula, postToChat);
  };

  const handleCustomRoll = (e: React.FormEvent) => {
    e.preventDefault();
    if (customFormula.trim()) {
      handleRoll(customFormula.trim());
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick dice buttons */}
      <div className="grid grid-cols-3 gap-2">
        {QUICK_DICE.map((die) => (
          <Button
            key={die.formula}
            variant="secondary"
            className="h-14 text-lg font-medium"
            onClick={() => handleRoll(die.formula)}
          >
            {die.label}
          </Button>
        ))}
      </div>

      {/* Custom formula */}
      <form onSubmit={handleCustomRoll} className="flex gap-2">
        <Input
          type="text"
          placeholder="e.g., 2d6+3"
          value={customFormula}
          onChange={(e) => setCustomFormula(e.target.value)}
          className="flex-1"
          autoCapitalize="off"
        />
        <Button type="submit" disabled={!customFormula.trim()}>
          Roll
        </Button>
      </form>

      {/* Post to chat toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={postToChat}
          onChange={(e) => setPostToChat(e.target.checked)}
          className="w-4 h-4 rounded border-input"
        />
        <span className="text-sm">Post to Foundry chat</span>
      </label>

      {/* Result display */}
      {lastDiceResult && (
        <Card
          className={`transition-all animate-in fade-in slide-in-from-bottom-2 ${
            lastDiceResult.success ? '' : 'border-destructive'
          }`}
        >
          <CardContent className="p-4 text-center">
            {lastDiceResult.success ? (
              <>
                <div className="text-4xl font-bold mb-1">
                  {lastDiceResult.total}
                </div>
                {lastDiceResult.breakdown && (
                  <div className="text-sm text-muted-foreground mb-1">
                    {lastDiceResult.breakdown}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {lastDiceResult.formula}
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-medium text-destructive">
                  {lastDiceResult.error || 'Error'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {lastDiceResult.formula}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
