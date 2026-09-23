import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { registerAndLogin } from '../helpers/auth.js';

const app = createApp();
let authHeader;

const BARCODE = '4820000000000';
const product = {
  code: BARCODE,
  product_name_uk: 'Хліб Духмяний',
  brands: 'Київхліб',
  categories: 'Хлібобулочні вироби',
  nutriments: {
    'energy-kcal_100g': 240,
    proteins_100g: 7.5,
    carbohydrates_100g: 48,
    fat_100g: 1.2,
    fiber_100g: 3.1,
    sugars_100g: 2,
    'saturated-fat_100g': 0.3,
    salt_100g: 1.1,
  },
};

const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

let fetchMock;

beforeEach(async () => {
  const { token } = await registerAndLogin(app);
  authHeader = `Bearer ${token}`;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Extended food nutrients', () => {
  it('stores micro/macronutrients, barcode, brand and category on custom foods', async () => {
    const res = await request(app).post('/api/v1/foods').set('Authorization', authHeader).send({
      name: 'Молоко Яготинське',
      caloriesPer100g: 52,
      proteinPer100g: 3,
      carbsPer100g: 4.7,
      fatPer100g: 2.6,
      fiberPer100g: 0,
      sugarPer100g: 4.7,
      saturatedFatPer100g: 1.6,
      saltPer100g: 0.1,
      barcode: '4820000000001',
      brand: 'Яготинське',
      category: 'Молоко',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Молоко Яготинське',
      fiberPer100g: 0,
      sugarPer100g: 4.7,
      saturatedFatPer100g: 1.6,
      saltPer100g: 0.1,
      barcode: '4820000000001',
      brand: 'Яготинське',
      category: 'Молоко',
      source: 'local',
    });
  });

  it('defaults the extended nutrients to zero', async () => {
    const res = await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'Tofu', caloriesPer100g: 76 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ fiberPer100g: 0, sugarPer100g: 0, saturatedFatPer100g: 0, saltPer100g: 0, barcode: null });
  });

  it('rejects malformed barcodes', async () => {
    const res = await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'Bad', caloriesPer100g: 1, barcode: 'abc' });

    expect(res.status).toBe(400);
  });

  it('searches Cyrillic names case-insensitively', async () => {
    await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'Хліб Духмяний', caloriesPer100g: 240 });

    const res = await request(app).get('/api/v1/foods?q=хліб').set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.items.map((f) => f.name)).toContain('Хліб Духмяний');
  });
});

describe('OpenFoodFacts endpoints', () => {
  it('proxies search to the Ukrainian OpenFoodFacts dataset', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ count: 1, products: [product] }));

    const res = await request(app)
      .get('/api/v1/foods/external/search?q=' + encodeURIComponent('Хліб'))
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      name: 'Хліб Духмяний',
      category: 'Хлібобулочні вироби',
      barcode: BARCODE,
      source: 'openfoodfacts',
      fiberPer100g: 3.1,
      saltPer100g: 1.1,
    });
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/ua\.openfoodfacts\.org\/api\/v2\/search\?/);
  });

  it('rejects too-short search queries without calling upstream', async () => {
    const res = await request(app).get('/api/v1/foods/external/search?q=a').set('Authorization', authHeader);

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/foods/external/search?q=milk');
    expect(res.status).toBe(401);
  });

  it('returns 502 when OpenFoodFacts is unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const res = await request(app).get('/api/v1/foods/external/search?q=milk').set('Authorization', authHeader);

    expect(res.status).toBe(502);
  });

  it('looks up a barcode on OpenFoodFacts when not saved locally', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 1, product }));

    const res = await request(app).get(`/api/v1/foods/barcode/${BARCODE}`).set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('openfoodfacts');
    expect(res.body.saved).toBe(false);
    expect(res.body.food.name).toBe('Хліб Духмяний');
    expect(fetchMock.mock.calls[0][0]).toMatch(new RegExp(`^https://ua\\.openfoodfacts\\.org/api/v2/product/${BARCODE}`));
  });

  it('prefers a locally saved food with the same barcode', async () => {
    await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'Мій хліб', caloriesPer100g: 200, barcode: BARCODE });

    const res = await request(app).get(`/api/v1/foods/barcode/${BARCODE}`).set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('local');
    expect(res.body.saved).toBe(true);
    expect(res.body.food.name).toBe('Мій хліб');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 404 so the client can fall back to a custom product', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 0, status_verbose: 'product not found' }, 404));

    const res = await request(app).get('/api/v1/foods/barcode/4820000000009').set('Authorization', authHeader);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/custom food/);
  });

  it('rejects invalid barcodes', async () => {
    const res = await request(app).get('/api/v1/foods/barcode/abc').set('Authorization', authHeader);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('imports an OpenFoodFacts product into the user catalog once', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 1, product }));

    const first = await request(app).post('/api/v1/foods/import').set('Authorization', authHeader).send({ barcode: BARCODE });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      name: 'Хліб Духмяний',
      brand: 'Київхліб',
      barcode: BARCODE,
      source: 'openfoodfacts',
      caloriesPer100g: 240,
      fiberPer100g: 3.1,
      sugarPer100g: 2,
      saturatedFatPer100g: 0.3,
      saltPer100g: 1.1,
    });
    expect(first.body.createdById).toBeDefined();

    const second = await request(app).post('/api/v1/foods/import').set('Authorization', authHeader).send({ barcode: BARCODE });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const list = await request(app).get('/api/v1/foods?q=' + encodeURIComponent('духмяний')).set('Authorization', authHeader);
    expect(list.body.items.filter((f) => f.barcode === BARCODE)).toHaveLength(1);
  });

  it('does not expose another user imported product', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 1, product }));
    await request(app).post('/api/v1/foods/import').set('Authorization', authHeader).send({ barcode: BARCODE });

    const other = await registerAndLogin(app);
    const res = await request(app).get(`/api/v1/foods/barcode/${BARCODE}`).set('Authorization', `Bearer ${other.token}`);

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Frontend product search', () => {
  it('debounces the food search input by 300ms and offers barcode lookup', async () => {
    const [html, js] = await Promise.all([request(app).get('/index.html'), request(app).get('/app.js')]);

    expect(js.text).toContain('const SEARCH_DEBOUNCE_MS = 300;');
    expect(js.text).toMatch(/debounce\([\s\S]*?SEARCH_DEBOUNCE_MS\)/);
    expect(html.text).toContain('id="barcode-form"');
    expect(html.text).toContain('id="external-food-list"');
    expect(html.text).toContain('id="food-fiber"');
    expect(html.text).toContain('id="food-salt"');
    expect(html.text).toContain('id="food-sugar"');
    expect(html.text).toContain('id="food-saturated-fat"');
    expect(html.text).toContain('<meta charset="UTF-8" />');
  });
});
