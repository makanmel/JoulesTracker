/**
 * @typedef {Object} Theme
 * @property {string} id
 * @property {string} nameKey
 * @property {{color: string, image: string}} background
 * @property {{primary: string, primaryHover: string, secondary: string, accent: string, danger: string, dangerHover: string}} colors
 * @property {{color: string, opacity: number, blur: string, border: string}} surface
 * @property {{primary: string, muted: string, onPrimary: string}} text
 */

/** @type {Theme[]} */
export const THEMES = [
  {
    id: 'default',
    nameKey: 'themes.default',
    background: { color: '#f7f8fa', image: 'none' },
    colors: {
      primary: '#2563eb',
      primaryHover: '#1d4ed8',
      secondary: '#e5e7eb',
      accent: '#2563eb',
      danger: '#dc2626',
      dangerHover: '#b91c1c',
    },
    surface: { color: '#ffffff', opacity: 1, blur: '0px', border: '#e5e7eb' },
    text: { primary: '#1f2937', muted: '#6b7280', onPrimary: '#ffffff' },
  },
  {
    id: 'dark',
    nameKey: 'themes.dark',
    background: { color: '#0f172a', image: 'none' },
    colors: {
      primary: '#60a5fa',
      primaryHover: '#3b82f6',
      secondary: '#334155',
      accent: '#60a5fa',
      danger: '#f87171',
      dangerHover: '#ef4444',
    },
    surface: { color: '#1e293b', opacity: 1, blur: '0px', border: '#334155' },
    text: { primary: '#e2e8f0', muted: '#94a3b8', onPrimary: '#0f172a' },
  },
  {
    id: 'forest',
    nameKey: 'themes.forest',
    background: {
      color: '#f1f5ee',
      image: 'linear-gradient(160deg, #e6efe2 0%, #cfe3cd 100%)',
    },
    colors: {
      primary: '#2f6b3a',
      primaryHover: '#24552d',
      secondary: '#e3ebe0',
      accent: '#8a9a5b',
      danger: '#dc2626',
      dangerHover: '#b91c1c',
    },
    surface: { color: '#ffffff', opacity: 0.92, blur: '0px', border: '#c8d7c5' },
    text: { primary: '#1c2a1e', muted: '#4f6355', onPrimary: '#ffffff' },
  },
  {
    id: 'neon',
    nameKey: 'themes.neon',
    background: {
      color: '#05060f',
      image:
        'radial-gradient(circle at 20% 20%, rgba(0,255,255,0.12), transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,0,200,0.14), transparent 45%)',
    },
    colors: {
      primary: '#00e5ff',
      primaryHover: '#00b8cc',
      secondary: '#1b2440',
      accent: '#ff2fd6',
      danger: '#ff5c7a',
      dangerHover: '#ff3d63',
    },
    surface: { color: '#101427', opacity: 0.85, blur: '10px', border: '#24304d' },
    text: { primary: '#e6f7ff', muted: '#8fb3c4', onPrimary: '#05060f' },
  },
  {
    id: 'sunset',
    nameKey: 'themes.sunset',
    background: {
      color: '#2b1d2f',
      image: 'linear-gradient(135deg, #ff9a5a 0%, #ff5e7e 45%, #6a2c70 100%)',
    },
    colors: {
      primary: '#ffb347',
      primaryHover: '#ff9f1a',
      secondary: 'rgba(255,255,255,0.2)',
      accent: '#ff5e7e',
      danger: '#ff6b6b',
      dangerHover: '#ef4444',
    },
    surface: { color: '#ffffff', opacity: 0.18, blur: '14px', border: 'rgba(255,255,255,0.35)' },
    text: { primary: '#fff7f0', muted: '#ffd9c7', onPrimary: '#2b1d2f' },
  },
];

export const DEFAULT_THEME_ID = 'default';
