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
    for (const area of ['area-target', 'area-summary', 'area-add-meal', 'area-meals', 'area-foods']) {
      expect(res.text).toContain(area);
    }
  });

  it('serves a stylesheet with desktop breakpoints', async () => {
    const res = await request(app).get('/styles.css');

    expect(res.status).toBe(200);
    expect(res.text).toContain('@media (min-width: 900px)');
    expect(res.text).toContain('@media (min-width: 1280px)');
    expect(res.text).toContain('.dashboard-grid {\n    display: grid;');
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
    expect(hrefs).toEqual(['summary-section', 'meals-section', 'add-meal-section', 'target-section', 'foods-section']);
    for (const id of hrefs) {
      expect(res.text).toContain(`id="${id}"`);
    }
  });

  it('serves mobile styles with a < 768px breakpoint and 44px touch targets', async () => {
    const res = await request(app).get('/styles.css');

    expect(res.text).toContain('--touch-target: 44px;');
    expect(res.text).toContain('@media (max-width: 767px)');
    expect(res.text).toMatch(/\.mobile-nav \{\n\s+display: none;/);
    expect(res.text).toMatch(/\.mobile-nav \{\n\s+position: fixed;/);
    expect(res.text).toMatch(/button \{[^}]*min-height: var\(--touch-target\);/);
    expect(res.text).toMatch(/input,\nselect \{[^}]*min-height: var\(--touch-target\);/);
    expect(res.text).toMatch(/html,\nbody \{[^}]*overflow-x: hidden;/);
  });
});
