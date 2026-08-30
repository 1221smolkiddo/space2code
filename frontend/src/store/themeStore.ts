import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeState {
  theme: ThemeMode;
  fontSize: number;
  setTheme: (theme: ThemeMode) => void;
  setFontSize: (size: number) => void;
  applyTheme: () => void;
  hydrate: (theme: ThemeMode, fontSize: number) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: (localStorage.getItem('space2code_theme') as ThemeMode) || 'dark', // default dark per design
  fontSize: Number(localStorage.getItem('space2code_font_size')) || 14,

  setTheme: (theme) => {
    localStorage.setItem('space2code_theme', theme);
    set({ theme });
    get().applyTheme();
  },

  setFontSize: (fontSize) => {
    localStorage.setItem('space2code_font_size', String(fontSize));
    set({ fontSize });
  },

  applyTheme: () => {
    const { theme } = get();
    const root = document.documentElement;
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
  },
  hydrate: (theme, fontSize) => {
    localStorage.setItem('space2code_theme', theme);
    localStorage.setItem('space2code_font_size', String(fontSize));
    set({ theme, fontSize });
    get().applyTheme();
  },
}));

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useThemeStore.getState().theme === 'system') {
      useThemeStore.getState().applyTheme();
    }
  });
}
