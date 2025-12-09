import { Button } from '@/components/ui/button';
import { useGameStore } from '@/stores/gameStore';
import type { Direction } from '@/types';

export function DPad() {
  const { move } = useGameStore();

  const handleMove = (direction: Direction) => {
    move(direction);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const keyMap: Record<string, Direction> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };

    const direction = keyMap[e.key];
    if (direction) {
      e.preventDefault();
      handleMove(direction);
    }
  };

  return (
    <div
      className="grid grid-cols-3 gap-2 w-56 h-56"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Row 1 */}
      <div />
      <Button
        variant="secondary"
        className="h-full text-2xl active:scale-95 transition-transform"
        onClick={() => handleMove('up')}
        onTouchStart={(e) => {
          e.preventDefault();
          handleMove('up');
        }}
        aria-label="Move Up"
      >
        ▲
      </Button>
      <div />

      {/* Row 2 */}
      <Button
        variant="secondary"
        className="h-full text-2xl active:scale-95 transition-transform"
        onClick={() => handleMove('left')}
        onTouchStart={(e) => {
          e.preventDefault();
          handleMove('left');
        }}
        aria-label="Move Left"
      >
        ◀
      </Button>
      <div />
      <Button
        variant="secondary"
        className="h-full text-2xl active:scale-95 transition-transform"
        onClick={() => handleMove('right')}
        onTouchStart={(e) => {
          e.preventDefault();
          handleMove('right');
        }}
        aria-label="Move Right"
      >
        ▶
      </Button>

      {/* Row 3 */}
      <div />
      <Button
        variant="secondary"
        className="h-full text-2xl active:scale-95 transition-transform"
        onClick={() => handleMove('down')}
        onTouchStart={(e) => {
          e.preventDefault();
          handleMove('down');
        }}
        aria-label="Move Down"
      >
        ▼
      </Button>
      <div />
    </div>
  );
}
