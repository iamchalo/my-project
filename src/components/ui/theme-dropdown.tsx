'use client';

import { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useThemeWaveTransition } from './theme-wave-transition';

export function ThemeDropdown() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { triggerWaveTransition } = useThemeWaveTransition();

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setIsDarkMode(isDark);
  }, []);

  const handleThemeChange = (theme: 'light' | 'dark', event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const clickX = rect.left + rect.width / 2;
    const clickY = rect.top + rect.height / 2;

    const newIsDark = theme === 'dark';

    if (newIsDark !== isDarkMode) {
      triggerWaveTransition(clickX, clickY, theme, () => {
        setIsDarkMode(newIsDark);
      });
    }
  };

  return (
    <div className="inline-flex border rounded-lg overflow-hidden shadow-sm">
      <button
        onClick={(e) => handleThemeChange('light', e)}
        className={`flex items-center gap-2 px-4 py-2 font-medium transition-all ${
          !isDarkMode
            ? 'bg-white text-black border-r'
            : 'bg-black text-white border-r border-gray-700 hover:bg-gray-900'
        }`}
      >
        <Sun className="h-4 w-4" />
        <span>Light</span>
      </button>
      <button
        onClick={(e) => handleThemeChange('dark', e)}
        className={`flex items-center gap-2 px-4 py-2 font-medium transition-all ${
          isDarkMode
            ? 'bg-black text-white'
            : 'bg-white text-black hover:bg-gray-100'
        }`}
      >
        <Moon className="h-4 w-4" />
        <span>Dark</span>
      </button>
    </div>
  );
}
