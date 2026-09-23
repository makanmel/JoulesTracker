import { describe, it, expect, vi } from 'vitest';
import { mapProduct, searchProducts, getProductByBarcode, isValidBarcode } from '../../src/lib/openFoodFacts.js';

const product = {
  code: '4820000000000',
  product_name: 'Yagotynske Milk',
  product_name_uk: 'Молоко Яготинське 2.6%',
  brands: 'Яготинське',
  categories: 'Молочні продукти, Молоко',
  nutriments: {
    'energy-kcal_100g': 52,
    proteins_100g: 3,
    carbohydrates_100g: 4.7,
    fat_100g: 2.6,
    fiber_100g: 0,
    sugars_100g: 4.7,
    'saturated-fat_100g': 1.6,
    salt_100g: 0.1,
  },
};

const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

describe('OpenFoodFacts mapper', () => {
  it('maps a product to the FoodItem shape preferring the Ukrainian name', () => {
    const food = mapProduct(product);
    expect(food).toEqual({
      name: 'Молоко Яготинське 2.6%',
      brand: 'Яготинське',
      category: 'Молочні продукти, Молоко',
      barcode: '4820000000000',
      source: 'openfoodfacts',
      caloriesPer100g: 52,
      proteinPer100g: 3,
      carbsPer100g: 4.7,
      fatPer100g: 2.6,
      fiberPer100g: 0,
      sugarPer100g: 4.7,
      saturatedFatPer100g: 1.6,
      saltPer100g: 0.1,
    });
    expect(food.name).toMatch(/[\u0400-\u04FF]/);
  });

  it('falls back to product_name and converts kJ when kcal is missing', () => {
    const food = mapProduct({ code: '1', product_name: 'Bread', nutriments: { energy_100g: 1046 } });
    expect(food.name).toBe('Bread');
    expect(food.caloriesPer100g).toBe(250);
    expect(food.proteinPer100g).toBe(0);
  });

  it('returns null for products without a name', () => {
    expect(mapProduct({ code: '1', nutriments: {} })).toBeNull();
    expect(mapProduct(null)).toBeNull();
  });

  it('validates barcodes', () => {
    expect(isValidBarcode('4820000000000')).toBe(true);
    expect(isValidBarcode('12345678')).toBe(true);
    expect(isValidBarcode('1234')).toBe(false);
    expect(isValidBarcode('abc')).toBe(false);
  });
});

describe('OpenFoodFacts client', () => {
  it('searches the Ukrainian dataset via /api/v2/search', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ count: 1, products: [product, { code: '2' }] }));

    const result = await searchProducts('Молоко', { limit: 5, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.origin).toBe('https://ua.openfoodfacts.org');
    expect(url.pathname).toBe('/api/v2/search');
    expect(url.searchParams.get('search_terms')).toBe('Молоко');
    expect(url.searchParams.get('countries_tags_en')).toBe('ukraine');
    expect(url.searchParams.get('page_size')).toBe('5');
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Молоко Яготинське 2.6%');
  });

  it('fetches a product by barcode via /api/v2/product/{barcode}', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 1, product }));

    const food = await getProductByBarcode('4820000000000', { fetchImpl });

    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/v2/product/4820000000000');
    expect(food.barcode).toBe('4820000000000');
  });

  it('returns null when the barcode is unknown', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 0, status_verbose: 'product not found' }, 404));
    expect(await getProductByBarcode('4820000000001', { fetchImpl })).toBeNull();

    fetchImpl.mockResolvedValue(jsonResponse({ status: 0 }));
    expect(await getProductByBarcode('4820000000001', { fetchImpl })).toBeNull();
  });

  it('surfaces upstream failures as 502 errors', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(searchProducts('Хліб', { fetchImpl })).rejects.toMatchObject({ statusCode: 502 });

    fetchImpl.mockResolvedValue(jsonResponse({}, 500));
    await expect(searchProducts('Хліб', { fetchImpl })).rejects.toMatchObject({ statusCode: 502 });
  });
});
