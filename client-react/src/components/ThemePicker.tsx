import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useThemeStore, THEME_NAMES, type Theme } from '@/stores/themeStore';

const THEME_PREVIEWS: Record<Theme, { bg: string; accent: string; desc: string; light?: boolean }> = {
  default: {
    bg: '#1a1a2e',
    accent: '#e94560',
    desc: 'Dark navy with coral accent',
  },
  terminal: {
    bg: '#0a1a0a',
    accent: '#33ff33',
    desc: 'CRT green phosphor with scanlines',
  },
  synthwave: {
    bg: '#1a0a2e',
    accent: '#ff66b2',
    desc: 'Neon pink & cyan, outrun vibes',
  },
  'retro-scifi': {
    bg: '#1a1408',
    accent: '#ffaa33',
    desc: 'Amber terminals, Blade Runner style',
  },
  'solarized-light': {
    bg: '#fdf6e3',
    accent: '#268bd2',
    desc: 'Warm light theme, easy on eyes',
    light: true,
  },
  'solarized-dark': {
    bg: '#002b36',
    accent: '#268bd2',
    desc: 'Classic dark with blue accent',
  },
  'high-contrast': {
    bg: '#ffffff',
    accent: '#000000',
    desc: 'Maximum readability, WCAG AAA',
    light: true,
  },
};

export function ThemePicker() {
  const { theme, setTheme } = useThemeStore();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Change Theme">
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Choose Theme</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 pt-2">
          {(Object.keys(THEME_NAMES) as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${
                theme === t
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {/* Color preview */}
              <div
                className="w-10 h-10 rounded-md flex items-center justify-center"
                style={{ backgroundColor: THEME_PREVIEWS[t].bg }}
              >
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: THEME_PREVIEWS[t].accent }}
                />
              </div>
              {/* Label */}
              <div className="text-left">
                <div className="font-medium text-sm">{THEME_NAMES[t]}</div>
                <div className="text-xs text-muted-foreground">
                  {THEME_PREVIEWS[t].desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
