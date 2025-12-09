import { useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useThemeStore, LIGHT_THEMES } from '@/stores/themeStore';
import { AuthScreen } from '@/screens/AuthScreen';
import { TokenPickerScreen } from '@/screens/TokenPickerScreen';
import { ControlScreen } from '@/screens/ControlScreen';

function App() {
  const { screen } = useGameStore();
  const { theme } = useThemeStore();

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes
    root.classList.remove(
      'theme-terminal',
      'theme-synthwave',
      'theme-retro-scifi',
      'theme-solarized-light',
      'theme-solarized-dark',
      'theme-high-contrast'
    );

    // Handle dark/light mode
    if (LIGHT_THEMES.includes(theme)) {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }

    // Add current theme class (default uses .dark which is already on html)
    if (theme !== 'default') {
      root.classList.add(`theme-${theme}`);
    }
  }, [theme]);

  switch (screen) {
    case 'auth':
      return <AuthScreen />;
    case 'token-picker':
      return <TokenPickerScreen />;
    case 'control':
      return <ControlScreen />;
    default:
      return <AuthScreen />;
  }
}

export default App
