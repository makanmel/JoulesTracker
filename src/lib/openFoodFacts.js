import { AppError } from './errors.js';

const BASE_URL = (process.env.OPENFOODFACTS_BASE_URL || 'https://ua.openfoodfacts.org').replace(/\/$/, '');
const USER_AGENT = 'JoulesTracker/0.1.0 (https://github.com/makanmel/JoulesTracker)';
const TIMEOUT_MS = 8000;
const BARCODE_REGEX = /^\d{8,14}$/;

const PRODUCT_FIELDS = [
  'code',
  'product_name',
  'product_name_uk',
  'brands',
  'categories',
  'categories_tags',
  'nutriments',
].join(',');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function first(...values) {
  return values.find((v) => typeof v === 'string' && v.trim().length > 0)?.trim() || null;
}

export function isValidBarcode(value) {
  return BARCODE_REGEX.test(String(value || ''));
}

/** Maps an OpenFoodFacts product to the FoodItem shape used by the local catalog. */
export function mapProduct(product) {
  if (!product) return null;
  const n = product.nutriments || {};
  const name = first(product.product_name_uk, product.product_name);
  if (!name) return null;

  const calories = n['energy-kcal_100g'] !== undefined ? num(n['energy-kcal_100g']) : num(n.energy_100g) / 4.184;

  return {
    name,
    brand: first(product.brands),
    category: first(product.categories),
    barcode: first(product.code),
    source: 'openfoodfacts',
    caloriesPer100g: Math.round(calories * 10) / 10,
    proteinPer100g: num(n.proteins_100g),
    carbsPer100g: num(n.carbohydrates_100g),
    fatPer100g: num(n.fat_100g),
    fiberPer100g: num(n.fiber_100g),
    sugarPer100g: num(n.sugars_100g),
    saturatedFatPer100g: num(n['saturated-fat_100g']),
    saltPer100g: num(n.salt_100g),
  };
}

async function fetchJson(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new AppError(`OpenFoodFacts request failed (${res.status})`, 502);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('OpenFoodFacts is unavailable', 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function searchProducts(query, { limit = 20, page = 1, fetchImpl = fetch } = {}) {
  const params = new URLSearchParams({
    search_terms: query,
    countries_tags_en: 'ukraine',
    fields: PRODUCT_FIELDS,
    page_size: String(limit),
    page: String(page),
  });
  const data = await fetchJson(`${BASE_URL}/api/v2/search?${params}`, fetchImpl);
  const products = Array.isArray(data?.products) ? data.products : [];
  return {
    items: products.map(mapProduct).filter(Boolean),
    total: Number(data?.count) || 0,
    page,
    limit,
  };
}

export async function getProductByBarcode(barcode, { fetchImpl = fetch } = {}) {
  const params = new URLSearchParams({ fields: PRODUCT_FIELDS });
  const data = await fetchJson(`${BASE_URL}/api/v2/product/${encodeURIComponent(barcode)}?${params}`, fetchImpl);
  if (!data || data.status === 0 || !data.product) return null;
  return mapProduct(data.product);
}
