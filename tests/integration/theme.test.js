import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { THEMES } from '../../public/themes.js';

const app = createApp();

function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'object' && value !== null ? flattenKeys(value, path) : [path];
  });
}

describe('Visual themes', () => {
  it('serves the theme modules and theme presets', async () => {
    const res = await request(app).get('/themes.js');

    expect(res.status).toBe(200);
    expect(res.text).toContain('export const THEMES');
    for (const id of ['default', 'dark', 'forest', 'neon', 'sunset']) {
      expect(res.text).toContain(`'${id}'`);
    }
  });

  it('serves the theme application module', async () => {
    const res = await request(app).get('/theme.js');

    expect(res.status).toBe(200);
    expect(res.text).toContain('localStorage.getItem(STORAGE_KEY)');
    expect(res.text).toContain('localStorage.setItem(STORAGE_KEY');
    expect(res.text).toContain('--bg-image');
    expect(res.text).toContain('--primary');
  });

  it('includes theme settings markup and theme styles', async () => {
    const [html, styles] = await Promise.all([
      request(app).get('/index.html'),
      request(app).get('/styles.css'),
    ]);

    expect(html.status).toBe(200);
    expect(html.text).toContain('id="theme-selector"');
    expect(html.text).toContain('id="settings-toggle"');
    expect(styles.status).toBe(200);
    expect(styles.text).toContain('var(--bg-image)');
    expect(styles.text).toContain('var(--card-blur)');
  });

  it('keeps every theme aligned with the schema and locale names', async () => {
    const en = await request(app).get('/locales/en.json');
    const enKeys = new Set(flattenKeys(en.body));
    const ids = THEMES.map((theme) => theme.id);

    expect(THEMES.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ids).size).toBe(ids.length);
    for (const theme of THEMES) {
      expect(theme).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          nameKey: expect.any(String),
          background: expect.objectContaining({ color: expect.any(String) }),
          colors: expect.objectContaining({
            primary: expect.any(String),
            accent: expect.any(String),
          }),
          surface: expect.objectContaining({
            color: expect.any(String),
            opacity: expect.any(Number),
          }),
          text: expect.objectContaining({
            primary: expect.any(String),
            muted: expect.any(String),
          }),
        }),
      );
      expect(theme.surface.opacity).toBeGreaterThanOrEqual(0);
      expect(theme.surface.opacity).toBeLessThanOrEqual(1);
      expect(enKeys.has(theme.nameKey), `missing locale key: ${theme.nameKey}`).toBe(true);
    }
  });
});
