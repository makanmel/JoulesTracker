import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

const app = createApp();

function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'object' && value !== null ? flattenKeys(value, path) : [path];
  });
}

describe('Internationalization', () => {
  it('serves English and Ukrainian locale files with identical keys', async () => {
    const [en, uk] = await Promise.all([
      request(app).get('/locales/en.json'),
      request(app).get('/locales/uk.json'),
    ]);

    expect(en.status).toBe(200);
    expect(uk.status).toBe(200);
    expect(en.headers['content-type']).toMatch(/application\/json/);

    const enKeys = flattenKeys(en.body).sort();
    const ukKeys = flattenKeys(uk.body).sort();
    expect(enKeys.length).toBeGreaterThan(0);
    expect(ukKeys).toEqual(enKeys);
  });

  it('keeps interpolation placeholders consistent across locales', async () => {
    const [en, uk] = await Promise.all([
      request(app).get('/locales/en.json'),
      request(app).get('/locales/uk.json'),
    ]);

    const placeholders = (str) => (str.match(/\{\{\s*\w+\s*\}\}/g) || []).map((p) => p.replace(/\s/g, '')).sort();
    const lookup = (obj, path) => path.split('.').reduce((acc, part) => acc[part], obj);

    for (const key of flattenKeys(en.body)) {
      expect(placeholders(lookup(uk.body, key)), key).toEqual(placeholders(lookup(en.body, key)));
    }
  });

  it('marks Ukrainian translations with Cyrillic text', async () => {
    const res = await request(app).get('/locales/uk.json');

    expect(res.body.auth.login).toMatch(/[\u0400-\u04FF]/);
    expect(res.body.summary.title).toMatch(/[\u0400-\u04FF]/);
  });

  it('serves the dashboard with i18n hooks and a language switcher', async () => {
    const res = await request(app).get('/index.html');

    expect(res.status).toBe(200);
    expect(res.text).toContain('id="language-switcher"');
    expect(res.text).toContain('data-lang="en"');
    expect(res.text).toContain('data-lang="uk"');
    expect(res.text).toContain('<script type="module" src="app.js"></script>');
    expect(res.text).toContain('data-i18n="auth.login"');
    expect(res.text).toContain('data-i18n-placeholder="foods.search"');
  });

  it('references every data-i18n key in the English locale', async () => {
    const [html, en] = await Promise.all([request(app).get('/index.html'), request(app).get('/locales/en.json')]);

    const keys = [...html.text.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)].map((m) => m[1]);
    const enKeys = new Set(flattenKeys(en.body));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(enKeys.has(key), `missing locale key: ${key}`).toBe(true);
    }
  });

  it('serves the i18n module with localStorage persistence and browser detection', async () => {
    const res = await request(app).get('/i18n.js');

    expect(res.status).toBe(200);
    expect(res.text).toContain("localStorage.getItem(STORAGE_KEY)");
    expect(res.text).toContain('localStorage.setItem(STORAGE_KEY');
    expect(res.text).toContain('navigator.language');
  });
});
