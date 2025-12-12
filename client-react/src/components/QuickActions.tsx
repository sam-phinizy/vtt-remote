import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useGameStore } from '@/stores/gameStore';
import type { Ability } from '@/types';

const LONG_PRESS_DURATION = 500;

export function QuickActions() {
  const { actorData, useAbility } = useGameStore();
  const [selectedAbility, setSelectedAbility] = useState<Ability | null>(null);
  const [infoAbility, setInfoAbility] = useState<Ability | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handlePressStart = useCallback((ability: Ability) => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setInfoAbility(ability);
      if (navigator.vibrate) navigator.vibrate(20);
    }, LONG_PRESS_DURATION);
  }, []);

  const handlePressEnd = useCallback((ability: Ability) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!didLongPress.current) {
      setSelectedAbility(ability);
    }
  }, []);

  const handlePressCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleUseAbility = () => {
    if (selectedAbility) {
      useAbility(selectedAbility.id);
      setSelectedAbility(null);
    }
  };

  const handleUseFromInfo = () => {
    if (infoAbility) {
      useAbility(infoAbility.id);
      setInfoAbility(null);
    }
  };

  if (!actorData || !actorData.abilities.length) {
    return null;
  }

  // Filter to show most useful abilities: weapons, consumables, and features with uses
  const quickAbilities = actorData.abilities.filter((a) => {
    if (a.category === 'weapon') return true;
    if (a.category === 'consumable') return true;
    // Features with limited uses (like Rage, Second Wind)
    if (a.category === 'feature' && a.uses) return true;
    return false;
  });

  if (!quickAbilities.length) {
    return null;
  }

  return (
    <>
      <div className="w-full overflow-x-auto pb-2 mb-2">
        <div className="flex gap-2 px-1 min-w-min">
          {quickAbilities.map((ability) => {
            const isDisabled = ability.uses && ability.uses.current <= 0;

            return (
              <Button
                key={ability.id}
                variant="secondary"
                className="flex-shrink-0 h-auto py-2 px-3 flex flex-col items-center gap-1 min-w-[70px] max-w-[80px]"
                disabled={isDisabled}
                onMouseDown={() => !isDisabled && handlePressStart(ability)}
                onMouseUp={() => !isDisabled && handlePressEnd(ability)}
                onMouseLeave={handlePressCancel}
                onTouchStart={() => !isDisabled && handlePressStart(ability)}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  if (!isDisabled) handlePressEnd(ability);
                }}
                onTouchCancel={handlePressCancel}
              >
                {ability.img ? (
                  <img
                    src={ability.img}
                    alt=""
                    className="w-10 h-10 rounded object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                    <span className="text-xs">{ability.name.charAt(0)}</span>
                  </div>
                )}
                <span className="text-xs truncate w-full text-center">
                  {ability.name}
                </span>
                {ability.uses && (
                  <Badge
                    variant={ability.uses.current > 0 ? 'outline' : 'secondary'}
                    className="text-[10px] px-1"
                  >
                    {ability.uses.current}/{ability.uses.max}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Use confirmation dialog */}
      <Dialog
        open={!!selectedAbility}
        onOpenChange={(open) => !open && setSelectedAbility(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use {selectedAbility?.name}?</DialogTitle>
            <DialogDescription>
              {selectedAbility?.description || 'Activate this ability?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAbility(null)}>
              Cancel
            </Button>
            <Button onClick={handleUseAbility}>Use</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info modal (long-press) */}
      <Dialog
        open={!!infoAbility}
        onOpenChange={(open) => !open && setInfoAbility(null)}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {infoAbility?.img && (
                <img
                  src={infoAbility.img}
                  alt=""
                  className="w-12 h-12 rounded object-cover"
                />
              )}
              <div>
                <DialogTitle>{infoAbility?.name}</DialogTitle>
                {infoAbility?.spellLevel !== undefined && (
                  <Badge variant="outline" className="mt-1">
                    {infoAbility.spellLevel === 0
                      ? 'Cantrip'
                      : `Level ${infoAbility.spellLevel} Spell`}
                  </Badge>
                )}
              </div>
            </div>
          </DialogHeader>
          <div
            className="prose prose-sm dark:prose-invert max-w-none py-2"
            dangerouslySetInnerHTML={{
              __html:
                infoAbility?.fullDescription ||
                infoAbility?.description ||
                '<p>No description available.</p>',
            }}
          />
          {infoAbility?.uses && (
            <p className="text-sm text-muted-foreground">
              Uses: {infoAbility.uses.current} / {infoAbility.uses.max}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInfoAbility(null)}>
              Close
            </Button>
            <Button
              onClick={handleUseFromInfo}
              disabled={infoAbility?.uses && infoAbility.uses.current <= 0}
            >
              Use
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
