/** Preferenza del tema: "system" segue il sistema operativo (prefers-color-scheme). */
export type ThemePreference = 'system' | 'light' | 'dark';

// La stessa chiave è letta dallo script in index.html, che applica il tema prima del primo rendering.
const THEME_KEY = 'mymonday.theme';

export function loadThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyThemePreference(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === 'system') delete root.dataset.theme;
  else root.dataset.theme = preference;
  try {
    if (preference === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
  } catch {
    /* preferenza valida solo per questa sessione */
  }
}
