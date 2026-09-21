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
});
