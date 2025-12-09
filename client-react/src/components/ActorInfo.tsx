import { useState, useRef, useCallback } from 'react';
import { Info } from 'lucide-react';
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

const LONG_PRESS_DURATION = 500; // ms

const CATEGORY_LABELS: Record<string, string> = {
  weapon: 'Weapons',
  spell: 'Spells',
  feature: 'Features',
  consumable: 'Consumables',
  other: 'Other',
};

export function ActorInfo() {
  const { actorData, useAbility } = useGameStore();
  const [selectedAbility, setSelectedAbility] = useState<Ability | null>(null);
  const [infoAbility, setInfoAbility] = useState<Ability | null>(null);

  // Long-press handling
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handlePressStart = useCallback((ability: Ability) => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setInfoAbility(ability);
      // Haptic feedback for long press
      if (navigator.vibrate) navigator.vibrate(20);
    }, LONG_PRESS_DURATION);
  }, []);

  const handlePressEnd = useCallback((ability: Ability) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    // Only trigger use dialog if it wasn't a long press
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

  if (!actorData) {
    return (
      <p className="text-muted-foreground text-center py-8">
        No actor info available
      </p>
    );
  }

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

  // Group abilities by category
  const groupedAbilities = actorData.abilities.reduce(
    (acc, ability) => {
      const cat = ability.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(ability);
      return acc;
    },
    {} as Record<string, Ability[]>
  );

  return (
    <div className="space-y-6">
      {/* Portrait */}
      {actorData.portrait && (
        <div className="flex justify-center">
          <img
            src={actorData.portrait}
            alt="Actor portrait"
            className="w-24 h-24 rounded-full object-cover border-2 border-border"
          />
        </div>
      )}

      {/* Resources (HP, etc) */}
      {actorData.resources.length > 0 && (
        <div className="space-y-3">
          {actorData.resources.map((resource, i) => (
            <div key={i}>
              <div className="flex justify-between text-sm mb-1">
                <span>{resource.label}</span>
                <span>
                  {resource.current} / {resource.max}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (resource.current / resource.max) * 100)}%`,
                    backgroundColor: resource.color || '#4ade80',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats grid */}
      {actorData.stats.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {actorData.stats.map((stat, i) => (
            <div
              key={i}
              className="text-center p-2 bg-muted rounded-md"
            >
              <div className="text-xs text-muted-foreground">{stat.label}</div>
              <div className="font-semibold">{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Conditions */}
      {actorData.conditions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {actorData.conditions.map((condition, i) => (
            <Badge key={i} variant="secondary">
              {condition}
            </Badge>
          ))}
        </div>
      )}

      {/* Abilities by category */}
      {Object.entries(groupedAbilities).map(([category, abilities]) => (
        <div key={category}>
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground">
            {CATEGORY_LABELS[category] || category}
          </h4>
          <div className="space-y-1">
            {abilities.map((ability) => {
              const isDisabled = ability.uses && ability.uses.current <= 0;

              return (
                <div key={ability.id} className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    className="flex-1 justify-start h-auto py-2 px-3"
                    disabled={isDisabled}
                    onMouseDown={() => !isDisabled && handlePressStart(ability)}
                    onMouseUp={() => !isDisabled && handlePressEnd(ability)}
                    onMouseLeave={handlePressCancel}
                    onTouchStart={() => !isDisabled && handlePressStart(ability)}
                    onTouchEnd={(e) => {
                      e.preventDefault(); // Prevent click after touch
                      if (!isDisabled) handlePressEnd(ability);
                    }}
                    onTouchCancel={handlePressCancel}
                  >
                    {ability.img && (
                      <img
                        src={ability.img}
                        alt=""
                        className="w-6 h-6 rounded mr-2 object-cover"
                      />
                    )}
                    <span className="flex-1 text-left truncate">
                      {ability.name}
                    </span>
                    {ability.spellLevel !== undefined && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        {ability.spellLevel === 0
                          ? 'Cantrip'
                          : `L${ability.spellLevel}`}
                      </Badge>
                    )}
                    {ability.uses && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {ability.uses.current}/{ability.uses.max}
                      </span>
                    )}
                  </Button>
                  {/* Info button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setInfoAbility(ability)}
                    title="View details"
                  >
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Ability confirmation dialog (quick tap) */}
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

      {/* Ability info modal (long-press or info button) */}
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
              __html: infoAbility?.fullDescription || infoAbility?.description || '<p>No description available.</p>',
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
    </div>
  );
}
