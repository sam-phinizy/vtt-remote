import { create } from 'zustand';

export type Theme =
  | 'default'
  | 'terminal'
  | 'synthwave'
  | 'retro-scifi'
  | 'solarized-light'
  | 'solarized-dark'
  | 'high-contrast';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem('vtt-theme') as Theme) || 'default',
  setTheme: (theme) => {
    localStorage.setItem('vtt-theme', theme);
    set({ theme });
  },
}));

export const THEME_NAMES: Record<Theme, string> = {
  default: 'Coral Night',
  terminal: 'CRT Terminal',
  synthwave: 'Synthwave',
  'retro-scifi': 'Retro Sci-Fi',
  'solarized-light': 'Solarized Light',
  'solarized-dark': 'Solarized Dark',
  'high-contrast': 'High Contrast',
};

// Which themes are light mode (for removing .dark class)
export const LIGHT_THEMES: Theme[] = ['solarized-light', 'high-contrast'];
