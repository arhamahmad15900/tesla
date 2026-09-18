import React, { createContext, useContext, useState, useEffect } from 'react';

export type AppTheme = 
  | 'dark' 
  | 'light';

export interface ThemeConfig {
  id: AppTheme;
  name: string;
  tagline: string;
  accentColor: string;
  bgGradient: string;
  cardBg: string;
  heroGradient: string;
  buttonGradient: string;
  badgeBg: string;
  borderGlow: string;
  icon: string;
}

export const THEMES: Record<AppTheme, ThemeConfig> = {
  'dark': {
    id: 'dark',
    name: 'Dark Mode',
    tagline: 'Deep Obsidian Slate with Electric Cyan & Blue Highlights',
    accentColor: '#06b6d4',
    bgGradient: 'from-slate-950 via-[#0b0f19] to-[#0f172a]',
    cardBg: 'bg-slate-900/90 backdrop-blur-xl border-slate-800/80 text-white shadow-xl',
    heroGradient: 'from-cyan-500 via-blue-600 to-indigo-600',
    buttonGradient: 'from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-cyan-500/25',
    badgeBg: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30',
    borderGlow: 'border-cyan-500/30 ring-1 ring-cyan-500/20',
    icon: '🌙'
  },
  'light': {
    id: 'light',
    name: 'Light Mode',
    tagline: 'Crisp Institutional Blueprint & High-Contrast Azure',
    accentColor: '#2563eb',
    bgGradient: 'from-slate-900 via-[#0e1726] to-[#111c30]',
    cardBg: 'bg-slate-900/90 backdrop-blur-xl border-blue-900/40 text-white shadow-xl',
    heroGradient: 'from-blue-500 via-indigo-600 to-sky-500',
    buttonGradient: 'from-blue-600 via-indigo-600 to-sky-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/25',
    badgeBg: 'bg-blue-500/15 text-blue-300 border-blue-400/30',
    borderGlow: 'border-blue-500/30 ring-1 ring-blue-500/20',
    icon: '☀️'
  }
};

interface ThemeContextType {
  theme: AppTheme;
  themeConfig: ThemeConfig;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nielit_app_theme') as AppTheme;
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'dark';
  });

  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nielit_app_sound');
      if (saved !== null) return saved === 'true';
    }
    return true;
  });

  const setTheme = (newTheme: AppTheme) => {
    setThemeState(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('nielit_app_theme', newTheme);
    }
  };

  const toggleTheme = () => {
    setThemeState((prev) => {
      const nextTheme: AppTheme = prev === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined') {
        localStorage.setItem('nielit_app_theme', nextTheme);
      }
      return nextTheme;
    });
  };

  const setSoundEnabled = (enabled: boolean) => {
    setSoundEnabledState(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('nielit_app_sound', String(enabled));
    }
  };

  return (
    <ThemeContext.Provider 
      value={{
        theme,
        themeConfig: THEMES[theme],
        setTheme,
        toggleTheme,
        soundEnabled,
        setSoundEnabled
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};
