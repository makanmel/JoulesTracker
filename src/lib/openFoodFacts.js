import { AppError } from './errors.js';

const BASE_URL = (process.env.OPENFOODFACTS_BASE_URL || 'https://ua.openfoodfacts.org').replace(/\/$/, '');
const USER_AGENT = 'JoulesTracker/0.1.0 (https://github.com/makanmel/JoulesTracker)';
const TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
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

const HTML_ENTITIES = new Map([
  ['amp', '&'],
  ['apos', "'"],
  ['gt', '>'],
  ['lt', '<'],
  ['quot', '"'],
]);

function decodeHtmlEntities(value) {
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|quot));/gi, (entity, decimal, hexadecimal, named) => {
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
    return HTML_ENTITIES.get(named.toLowerCase()) ?? entity;
  });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function first(...values) {
  const value = values.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return value ? decodeHtmlEntities(value.trim()) : null;
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

  const kcal = n['energy-kcal_100g'];
  const calories = kcal != null && kcal !== '' ? num(kcal) : num(n.energy_100g) / 4.184;

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

async function fetchResponse(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetchImpl(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: controller.signal,
  })
    .then(
      (response) => response,
      () => null,
    )
    .finally(() => clearTimeout(timer));
}

async function fetchJson(url, fetchImpl, attempt = 0) {
  const response = await fetchResponse(url, fetchImpl);
  if (!response || RETRYABLE_STATUSES.has(response.status)) {
    if (attempt < MAX_RETRIES) return fetchJson(url, fetchImpl, attempt + 1);
    throw new AppError('OpenFoodFacts is temporarily unavailable', 502);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new AppError(`OpenFoodFacts request failed (${response.status})`, 502);

  const data = await response.json().then(
    (value) => value,
    () => null,
  );
  if (!data) throw new AppError('OpenFoodFacts returned an invalid response', 502);
  return data;
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function matchesQuery(product, query) {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  const searchable = normalizeSearchText(
    [product.product_name_uk, product.product_name, product.brands, product.categories].filter(Boolean).join(' '),
  );
  return terms.every((term) => searchable.includes(term));
}

export async function searchProducts(query, { limit = 20, page = 1, fetchImpl = fetch } = {}) {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  const searches = terms.length > 1 ? terms : [query];
  const responses = await Promise.all(
    searches.map((searchTerms) => {
      const params = new URLSearchParams({
        action: 'process',
        search_terms: searchTerms,
        countries_tags_en: 'ukraine',
        fields: PRODUCT_FIELDS,
        page_size: String(limit),
        page: String(page),
        json: '1',
      });
      return fetchJson(`${BASE_URL}/cgi/search.pl?${params}`, fetchImpl);
    }),
  );
  const products = responses.flatMap((data) => (Array.isArray(data?.products) ? data.products : []));
  const uniqueProducts = [...new Map(products.map((product) => [product.code || JSON.stringify(product), product])).values()];
  const items = uniqueProducts.filter((product) => matchesQuery(product, query)).map(mapProduct).filter(Boolean).slice(0, limit);
  return {
    items,
    total: items.length,
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
