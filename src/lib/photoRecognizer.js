import { AppError } from './errors.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const SYSTEM_PROMPT = `You are a nutrition assistant. Look at the food photo and identify the main dish or the most prominent food item on the plate.
Estimate the total weight in grams of the visible food, and estimate macros per 100g for that food.
Respond ONLY with a JSON object, no markdown, no explanation:
{
  "name": "short localized food name in the requested locale",
  "nameEn": "canonical English food name (may equal name for en locale)",
  "weightGrams": number,
  "caloriesPer100g": number|null,
  "proteinPer100g": number|null,
  "carbsPer100g": number|null,
  "fatPer100g": number|null,
  "confidence": "high|medium|low"
}
Use the user's locale (en or uk). If multiple items are visible, pick the main one. If you cannot identify anything, set name to "".`;

function providerErrorMessage(text) {
  const message = String(text).match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  const clean = (message ? message.replace(/\\(.)/g, '$1') : String(text)).trim();
  return clean.length > 200 ? `${clean.slice(0, 200)}...` : clean;
}

function buildOpenAIBody({ imageBase64, mime, locale }) {
  return {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Locale: ${locale}` },
          {
            type: 'image_url',
            image_url: { url: `data:${mime};base64,${imageBase64}`, detail: 'low' },
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  };
}

async function callOpenAI({ apiKey, imageBase64, mime, locale, fetchImpl }) {
  const response = await fetchImpl(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildOpenAIBody({ imageBase64, mime, locale })),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown');
    throw new AppError(`AI photo recognition failed (${response.status}): ${providerErrorMessage(text)}`, 502);
  }

  const data = await response.json().catch(() => null);
  return data?.choices?.[0]?.message?.content;
}

const GEMINI_MODEL_CACHE = new Map();

async function listGeminiModels({ apiKey, fetchImpl }) {
  const url = `${GEMINI_API_BASE}/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchImpl(url, { headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) return [];
  const data = await response.json().catch(() => null);
  return data?.models || [];
}

async function resolveGeminiModels({ apiKey, fetchImpl }) {
  const cached = GEMINI_MODEL_CACHE.get(apiKey);
  if (cached) return cached;

  const available = (await listGeminiModels({ apiKey, fetchImpl }))
    .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
    .map((model) => model.name.replace(/^models\//, ''));

  const preferred = available.includes(GEMINI_MODEL)
    ? [GEMINI_MODEL, ...available.filter((name) => name !== GEMINI_MODEL)]
    : [GEMINI_MODEL, ...available];

  GEMINI_MODEL_CACHE.set(apiKey, preferred);
  return preferred;
}

async function generateGeminiContent({ apiKey, model, imageBase64, mime, locale, fetchImpl }) {
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: `Locale: ${locale}` },
            {
              inlineData: { mimeType: mime, data: imageBase64 },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown');
    return { ok: false, status: response.status, text };
  }

  const data = await response.json().catch(() => null);
  return { ok: true, content: data?.candidates?.[0]?.content?.parts?.[0]?.text };
}

async function callGemini({ apiKey, imageBase64, mime, locale, fetchImpl }) {
  const candidates = await resolveGeminiModels({ apiKey, fetchImpl });
  let lastError = 'unknown';

  // Google occasionally returns transient 5xx; run a second pass over the
  // candidates when the first failed with server-side errors only.
  for (let pass = 0; pass < 2; pass++) {
    let sawServerError = false;
    for (const model of candidates) {
      const result = await generateGeminiContent({
        apiKey,
        model,
        imageBase64,
        mime,
        locale,
        fetchImpl,
      });
      if (result.ok) {
        GEMINI_MODEL_CACHE.set(apiKey, [model]);
        return result.content;
      }
      sawServerError = sawServerError || result.status >= 500;
      lastError = `${model} -> ${result.status}: ${providerErrorMessage(result.text)}`;
      console.warn(`Gemini photo model ${model} failed: ${result.status}`);
    }
    if (!sawServerError) break;
  }

  throw new AppError(`AI photo recognition failed: ${lastError}`, 502);
}

function extractJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : cleaned;
}

export async function recognizePhoto({
  imageBase64,
  mime = 'image/jpeg',
  locale = 'en',
  provider,
  apiKey,
  fetchImpl = fetch,
} = {}) {
  if (!imageBase64 || imageBase64.length < 100) {
    throw new AppError('A valid image is required', 400);
  }

  const resolvedProvider = provider
    ? String(provider).toLowerCase()
    : process.env.OPENAI_API_KEY
      ? 'openai'
      : process.env.GEMINI_API_KEY
        ? 'gemini'
        : null;
  const resolvedKey = apiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;

  if (!resolvedKey) {
    throw new AppError('Photo recognition is not configured on this server', 503);
  }

  const content =
    resolvedProvider === 'openai'
      ? await callOpenAI({ apiKey: resolvedKey, imageBase64, mime, locale, fetchImpl })
      : await callGemini({ apiKey: resolvedKey, imageBase64, mime, locale, fetchImpl });

  if (!content) {
    throw new AppError('AI photo recognition returned an empty response', 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(extractJson(content));
  } catch {
    throw new AppError('AI photo recognition returned malformed JSON', 502);
  }

  const name = String(parsed.name || '').trim();
  if (!name) {
    throw new AppError('Could not recognize the food in the photo', 422);
  }

  return {
    name,
    nameEn: String(parsed.nameEn || '').trim() || name,
    weightGrams: Number(parsed.weightGrams) || 0,
    caloriesPer100g: parsed.caloriesPer100g == null ? null : Number(parsed.caloriesPer100g),
    proteinPer100g: parsed.proteinPer100g == null ? null : Number(parsed.proteinPer100g),
    carbsPer100g: parsed.carbsPer100g == null ? null : Number(parsed.carbsPer100g),
    fatPer100g: parsed.fatPer100g == null ? null : Number(parsed.fatPer100g),
    confidence: String(parsed.confidence || 'low'),
  };
}
