import { DEFAULT_THEME_ID, THEMES } from './themes.js';

export const STORAGE_KEY = 'joulesTheme';

function findTheme(id) {
  return THEMES.find((theme) => theme.id === id) ?? THEMES.find((theme) => theme.id === DEFAULT_THEME_ID);
}

function hexToRgba(color, opacity) {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return color;
  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

export function getTheme() {
  return findTheme(localStorage.getItem(STORAGE_KEY));
}

export function applyTheme(id) {
  const theme = findTheme(id);
  const root = document.documentElement;
  const { colors, surface, text, background } = theme;

  root.style.setProperty('--bg', background.color);
  root.style.setProperty('--bg-image', background.image);
  root.style.setProperty('--card', hexToRgba(surface.color, surface.opacity));
  root.style.setProperty('--card-blur', surface.blur);
  root.style.setProperty('--text', text.primary);
  root.style.setProperty('--muted', text.muted);
  root.style.setProperty('--text-on-primary', text.onPrimary);
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--primary-hover', colors.primaryHover);
  root.style.setProperty('--secondary', colors.secondary);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--danger', colors.danger);
  root.style.setProperty('--danger-hover', colors.dangerHover);
  root.style.setProperty('--border', surface.border);
  root.dataset.theme = theme.id;

  document.querySelectorAll('[data-theme-id]').forEach((button) => {
    const active = button.dataset.themeId === theme.id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  return theme;
}

export function setTheme(id) {
  const theme = applyTheme(id);
  localStorage.setItem(STORAGE_KEY, theme.id);
  return theme;
}

export function renderThemeSelector() {
  const selector = document.querySelector('#theme-selector');
  if (!selector) return;
  selector.innerHTML = '';

  THEMES.forEach((theme) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-card';
    button.dataset.themeId = theme.id;
    button.setAttribute('aria-pressed', String(theme.id === document.documentElement.dataset.theme));

    const preview = document.createElement('div');
    preview.className = 'theme-preview';
    preview.style.background = theme.background.image === 'none' ? theme.background.color : theme.background.image;
    [theme.colors.primary, theme.colors.accent, theme.surface.color].forEach((color) => {
      const swatch = document.createElement('span');
      swatch.className = 'theme-swatch';
      swatch.style.backgroundColor = color;
      preview.appendChild(swatch);
    });

    const name = document.createElement('span');
    name.className = 'theme-name';
    name.dataset.i18n = theme.nameKey;
    button.append(preview, name);
    button.addEventListener('click', () => setTheme(theme.id));
    selector.appendChild(button);
  });
}

applyTheme(localStorage.getItem(STORAGE_KEY));

export function initTheme() {
  applyTheme(localStorage.getItem(STORAGE_KEY));
  renderThemeSelector();
}
