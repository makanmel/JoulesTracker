import { AppError } from './errors.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// v1beta is a superset of v1 for generateContent (previews, gemma, image
// models). Some models listable on one version only generate on the other,
// so a 404 is retried on the alternate version.
const GEMINI_API_BASES = ['v1beta', 'v1'].map(
  (version) => `https://generativelanguage.googleapis.com/${version}`,
);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const RETRY_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SYSTEM_PROMPT = `You are a nutrition assistant. Look at the food photo and identify every distinct food item visible (e.g. a plate with rice, chicken and salad is 3 items; a single dish is 1 item).
For each item estimate its portion weight in grams and its macros per 100g.
Respond ONLY with a JSON object, no markdown, no explanation:
{
  "items": [
    {
      "name": "short localized food name in the requested locale",
      "nameEn": "canonical English food name (may equal name for en locale)",
      "weightGrams": number,
      "caloriesPer100g": number|null,
      "proteinPer100g": number|null,
      "carbsPer100g": number|null,
      "fatPer100g": number|null
    }
  ],
  "confidence": "high|medium|low"
}
Use the user's locale (en or uk). List at most 8 items, most prominent first. If you cannot identify anything, set items to [].`;

function providerErrorMessage(text) {
  const message = String(text).match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  const clean = (message ? message.replace(/\\(.)/g, '$1') : String(text)).trim();
  return clean.length > 200 ? `${clean.slice(0, 200)}...` : clean;
}

function buildOpenAIBody({ imageBase64, mime, locale, model }) {
  return {
    model: model || OPENAI_MODEL,
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

async function callOpenAI({ apiKey, imageBase64, mime, locale, model, fetchImpl }) {
  const response = await fetchImpl(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildOpenAIBody({ imageBase64, mime, locale, model })),
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
  const url = `${GEMINI_API_BASES[0]}/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchImpl(url, { headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) return [];
  const data = await response.json().catch(() => null);
  return data?.models || [];
}

// Cheaper, more reliable vision models first; gemma/image/tts models last —
// they either reject images or are rate-limited on most keys. -latest aliases
// rank below versioned models: they see heavier demand spikes and can be
// repointed or retired without notice.
function geminiModelRank(name, preferred) {
  const n = name.toLowerCase();
  if (n === preferred.toLowerCase()) return 0;
  if (!n.startsWith('gemini-')) return 3;
  if (/image|tts|embedding|aqa|robotics/.test(n)) return 3;
  if (n.endsWith('-latest')) return 2;
  return n.includes('flash') ? 1 : 2;
}

async function resolveGeminiModels({ apiKey, requestedModel, fetchImpl }) {
  const cacheKey = `${apiKey}:${requestedModel}`;
  const cached = GEMINI_MODEL_CACHE.get(cacheKey);
  if (cached) return cached;

  const available = (await listGeminiModels({ apiKey, fetchImpl }))
    .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
    .map((model) => model.name.replace(/^models\//, ''));

  const preferred = [...new Set([requestedModel, ...available])].sort(
    (a, b) => geminiModelRank(a, requestedModel) - geminiModelRank(b, requestedModel),
  );

  GEMINI_MODEL_CACHE.set(cacheKey, preferred);
  return preferred;
}

async function requestGeminiContent({
  apiKey,
  model,
  imageBase64,
  mime,
  locale,
  fetchImpl,
  baseUrl,
}) {
  const url = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
  const parts = data?.candidates?.[0]?.content?.parts || [];
  // Thinking models emit reasoning parts flagged with `thought: true` — they
  // are not the answer and break JSON parsing if concatenated.
  const content = parts
    .filter((part) => part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
  if (!content) return { ok: false, status: 200, text: 'empty candidates' };
  return { ok: true, content };
}

async function generateGeminiContent({ apiKey, model, imageBase64, mime, locale, fetchImpl }) {
  let lastResult = null;
  for (const baseUrl of GEMINI_API_BASES) {
    const result = await requestGeminiContent({
      apiKey,
      model,
      imageBase64,
      mime,
      locale,
      fetchImpl,
      baseUrl,
    });
    if (result.ok || result.status !== 404) return result;
    lastResult = result;
  }
  return lastResult;
}

async function callGemini({ apiKey, imageBase64, mime, locale, model, fetchImpl }) {
  const requestedModel = model || GEMINI_MODEL;
  const candidates = await resolveGeminiModels({ apiKey, requestedModel, fetchImpl });
  let lastError = 'unknown';

  // Google occasionally returns transient 5xx; run a second pass over the
  // candidates when the first failed with server-side errors only.
  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) await sleep(RETRY_DELAY_MS);
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
        GEMINI_MODEL_CACHE.set(`${apiKey}:${requestedModel}`, [model]);
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

// Returns each top-level balanced {...} block, ignoring braces inside
// strings. Models that emit a reasoning preamble may echo the JSON schema,
// so a naive first-`{`-to-last-`}` regex produces unparseable text.
function extractJsonObjects(text) {
  const objects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0) objects.push(text.slice(start, i + 1));
    }
  }
  return objects;
}

function extractJson(text) {
  const cleaned = text
    .replace(/```(?:json)?/gi, '')
    .trim();
  const objects = extractJsonObjects(cleaned);
  // The actual answer comes last; earlier objects are schema echoes/reasoning.
  for (let i = objects.length - 1; i >= 0; i--) {
    if (/"name"\s*:/.test(objects[i])) return objects[i];
  }
  return objects[objects.length - 1] || cleaned;
}

export async function recognizePhoto({
  imageBase64,
  mime = 'image/jpeg',
  locale = 'en',
  provider,
  apiKey,
  model,
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
  // Model may come from the client; it is interpolated into a URL path, so
  // keep only safe characters and ignore anything else.
  const requestedModel = /^[a-zA-Z0-9._-]+$/.test(String(model || '').trim())
    ? String(model).trim()
    : null;

  if (!resolvedKey) {
    throw new AppError('Photo recognition is not configured on this server', 503);
  }

  const content =
    resolvedProvider === 'openai'
      ? await callOpenAI({ apiKey: resolvedKey, imageBase64, mime, locale, model: requestedModel, fetchImpl })
      : await callGemini({ apiKey: resolvedKey, imageBase64, mime, locale, model: requestedModel, fetchImpl });

  if (!content) {
    throw new AppError('AI photo recognition returned an empty response', 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(extractJson(content));
  } catch {
    console.warn('AI photo recognition raw output:', String(content).slice(0, 500));
    throw new AppError('AI photo recognition returned malformed JSON', 502);
  }

  // Preferred shape is {items: [...]}; models that ignore it and return a
  // single flat object are treated as a one-item list.
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [parsed];
  const items = rawItems
    .map((entry) => ({
      name: String(entry?.name || '').trim(),
      nameEn: String(entry?.nameEn || '').trim() || String(entry?.name || '').trim(),
      weightGrams: Number(entry?.weightGrams) || 0,
      caloriesPer100g: entry?.caloriesPer100g == null ? null : Number(entry.caloriesPer100g),
      proteinPer100g: entry?.proteinPer100g == null ? null : Number(entry.proteinPer100g),
      carbsPer100g: entry?.carbsPer100g == null ? null : Number(entry.carbsPer100g),
      fatPer100g: entry?.fatPer100g == null ? null : Number(entry.fatPer100g),
    }))
    .filter((entry) => entry.name)
    .slice(0, 8);

  if (!items.length) {
    throw new AppError('Could not recognize the food in the photo', 422);
  }

  return { items, confidence: String(parsed.confidence || 'low') };
}
