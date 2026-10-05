import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

const app = createApp();

describe('Static frontend', () => {
  it('serves the dashboard with layout regions', async () => {
    const res = await request(app).get('/index.html');

    expect(res.status).toBe(200);
    expect(res.text).toContain('class="dashboard-grid"');
    expect(res.text).toContain('dashboard-col-main');
    expect(res.text).toContain('dashboard-col-side');
    for (const area of ['area-target', 'area-summary', 'area-add-meal', 'area-meals']) {
      expect(res.text).toContain(area);
    }
  });

  it('serves the application favicon', async () => {
    const page = await request(app).get('/index.html');
    const favicon = await request(app).get('/favicon.svg');

    expect(page.text).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(favicon.status).toBe(200);
    expect(favicon.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect(favicon.body.toString()).toContain('<svg');
  });

  it('serves dashboard section icons and visual accents', async () => {
    const [page, styles] = await Promise.all([request(app).get('/index.html'), request(app).get('/styles.css')]);

    expect(page.text.match(/class="section-icon"/g)).toHaveLength(5);
    for (const section of ['summary', 'target', 'add-meal', 'meals']) {
      expect(page.text).toMatch(new RegExp(`id="${section}-section"[\\s\\S]*?<svg class="section-icon"`));
    }
    // foods picker merged into the add-meal card
    expect(page.text).toMatch(/foods-header[\s\S]*?<svg class="section-icon"/);
    expect(styles.text).toContain('.section-icon');
    expect(styles.text).toContain('--section-accent');
    expect(styles.text).toContain('radial-gradient');
  });

  it('serves a stylesheet with desktop breakpoints', async () => {
    const res = await request(app).get('/styles.css');
    const css = res.text.replace(/\r\n/g, '\n');

    expect(res.status).toBe(200);
    expect(css).toContain('@media (min-width: 900px)');
    expect(css).toContain('@media (min-width: 1280px)');
    expect(css).toContain('.dashboard-grid {\n    display: grid;');
  });

  it('uses a mobile viewport that prevents auto-zoom on inputs', async () => {
    const res = await request(app).get('/index.html');

    const viewport = res.text.match(/<meta name="viewport" content="([^"]+)"/);
    expect(viewport).not.toBeNull();
    expect(viewport[1]).toContain('width=device-width');
    expect(viewport[1]).toContain('initial-scale=1');
    expect(viewport[1]).toContain('maximum-scale=1');
  });

  it('serves a bottom navigation linking to every dashboard section', async () => {
    const res = await request(app).get('/index.html');

    expect(res.text).toContain('id="mobile-nav"');
    const hrefs = [...res.text.matchAll(/class="mobile-nav-link"[^>]*href="#([^"]+)"|href="#([^"]+)" class="mobile-nav-link"/g)].map(
      (m) => m[1] || m[2],
    );
    expect(hrefs).toEqual(['summary-section', 'meals-section', 'add-meal-section']);
    for (const id of hrefs) {
      expect(res.text).toContain(`id="${id}"`);
    }
  });

  it('serves mobile styles with a < 768px breakpoint and 44px touch targets', async () => {
    const res = await request(app).get('/styles.css');
    const css = res.text.replace(/\r\n/g, '\n');

    expect(res.status).toBe(200);
    expect(css).toContain('--touch-target: 44px;');
    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toMatch(/\.mobile-nav \{\n\s+display: none;/);
    expect(css).toMatch(/\.mobile-nav \{\n\s+position: fixed;/);
    expect(css).toMatch(/button \{[^}]*min-height: var\(--touch-target\);/);
    expect(css).toMatch(/input,\nselect \{[^}]*min-height: var\(--touch-target\);/);
    expect(css).toMatch(/html,\nbody \{[^}]*overflow-x: hidden;/);
  });

  it('exposes the profile form, target suggestion UI, and voice AI settings', async () => {
    const [html, js, en, uk] = await Promise.all([
      request(app).get('/index.html'),
      request(app).get('/app.js'),
      request(app).get('/locales/en.json'),
      request(app).get('/locales/uk.json'),
    ]);

    expect(html.text).toContain('id="profile-form"');
    expect(html.text).toContain('id="profile-weight"');
    expect(html.text).toContain('id="profile-birthdate"');
    expect(html.text).toContain('id="profile-activity"');
    expect(html.text).toContain('id="target-section"');
    expect(html.text).toContain('id="target-suggestions"');
    expect(html.text).not.toContain('id="target-date"');
    expect(html.text).toContain('id="target-use-tdee"');
    expect(html.text).toContain('id="voice-settings"');
    expect(html.text).toContain('id="voice-provider"');
    expect(html.text).toContain('id="voice-api-key"');
    expect(js.text).toContain('/daily-target/suggest?date=');
    expect(js.text).toContain('/users/profile');
    expect(js.text).toContain('joulesAiProvider');
    expect(js.text).toContain('joulesAiApiKey');
    expect(js.text).toContain('X-AI-Provider');
    expect(js.text).toContain('X-AI-Key');
    expect(en.body.profile.save).toBe('Save profile');
    expect(uk.body.profile.save).toBe('Зберегти профіль');
    expect(en.body.voice.settingsTitle).toBe('Voice input');
    expect(uk.body.voice.settingsTitle).toBe('Голосовий ввід');
  });

  it('serves eight always-visible summary metrics with proportional colored fills', async () => {
    const [page, script, styles] = await Promise.all([
      request(app).get('/index.html'),
      request(app).get('/app.js'),
      request(app).get('/styles.css'),
    ]);

    const summary = page.text.match(/<div id="summary" class="summary-grid">([\s\S]*?)<\/div>\s*<\/section>/);
    expect(summary).not.toBeNull();
    expect(summary[1]).toContain('class="summary-metric summary-calories"');
    expect(summary[1].match(/class="summary-metric/g)).toHaveLength(8);
    expect(summary[1]).toContain('id="total-fiber"');
    expect(summary[1]).toContain('id="total-salt"');
    expect(summary[1]).toContain('id="total-saturated-fat"');
    expect(summary[1]).toContain('id="total-sugar"');
    expect(page.text).not.toContain('id="progress-area"');
    expect(page.text).not.toContain('id="macro-progress"');
    expect(script.text).toContain('function renderSummaryMetric');
    expect(script.text).toContain("metric.style.setProperty('--metric-fill'");
    expect(script.text).toContain('floatingTargetPct');
    expect(script.text).toContain("metric.classList.toggle('has-floating-target'");
    expect(script.text).toContain("metric.style.setProperty('--floating-target'");
    expect(script.text).toMatch(/renderSummaryMetric\('#total-calories', 'summary\.calories', totals\.calories, caloriesTarget\);/);
    expect(script.text).toMatch(/renderSummaryMetric\('#total-protein', 'summary\.protein', totals\.protein, proteinTarget, floatingTargetPct\);/);
    expect(script.text).toMatch(/renderSummaryMetric\('#total-sugar', 'summary\.sugar', totals\.sugar, targetData\.sugarGrams, floatingTargetPct\);/);
    expect(styles.text).toContain('.summary-grid .summary-metric::before');
    expect(styles.text).toContain('width: var(--metric-fill);');
    expect(styles.text).toContain('.summary-grid .summary-metric.has-floating-target::after');
    expect(styles.text).toContain('left: var(--floating-target');
  });

  it('prevents authentication credentials from being submitted or retained in URLs', async () => {
    const [page, script] = await Promise.all([request(app).get('/index.html'), request(app).get('/app.js')]);

    expect(page.text).toMatch(/<form id="login-form"[^>]*method="post"/);
    expect(page.text).toMatch(/<form id="register-form"[^>]*method="post"/);
    expect(page.text).toContain('autocomplete="current-password"');
    expect(page.text).toContain('autocomplete="new-password"');
    expect(script.text).toContain("url.searchParams.delete('email')");
    expect(script.text).toContain("url.searchParams.delete('password')");
    expect(script.text).toContain('window.history.replaceState');
  });

  it('serves a meal form with a primary row containing the food field and a secondary row containing the type and quantity fields', async () => {
    const page = await request(app).get('/index.html');

    expect(page.text).toMatch(/id="meal-form"[\s\S]*?meal-form-primary-row[\s\S]*?meal-food-field[\s\S]*?<\/div>/);
    expect(page.text).toMatch(/meal-form-secondary-row[\s\S]*?meal-type-field[\s\S]*?meal-quantity-field[\s\S]*?type="submit"/);
  });
});
