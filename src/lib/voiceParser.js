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
const GEMINI_MODEL_CACHE = new Map();
const RETRY_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SYSTEM_PROMPT = `You are a nutrition assistant for a calorie tracker. The user speaks in either Ukrainian or English.
Parse the input into food items with estimated macros per the described portion.
Respond ONLY with a JSON object in this exact shape, no markdown, no explanation:
{
  "items": [
    {
      "name": "short localized food name matching the requested locale",
      "nameEn": "canonical English food name (may equal name for en locale)",
      "nameUk": "Ukrainian food name (may equal name for uk locale)",
      "quantityGrams": number,
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number
    }
  ]
}
Use standard USDA or similar reference data for estimates. If the portion is given in ml, assume 1 ml ≈ 1 g for liquids. If confidence is low, still provide the best estimate.`;

function userPrompt(transcript, locale) {
  return `Locale: ${locale}\nTranscript: ${transcript}`;
}

// Pull the human-readable message out of a provider error body
// (e.g. Gemini's {"error":{"message":"..."}}) and keep it short.
function providerErrorMessage(text) {
  const message = String(text).match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  const clean = (message ? message.replace(/\\(.)/g, '$1') : String(text)).trim();
  return clean.length > 200 ? `${clean.slice(0, 200)}...` : clean;
}

async function callOpenAI({ apiKey, transcript, locale, model, fetchImpl }) {
  const response = await fetchImpl(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(transcript, locale) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown');
    throw new AppError(`AI parsing failed (${response.status}): ${providerErrorMessage(text)}`, 502);
  }

  const data = await response.json().catch(() => null);
  return data?.choices?.[0]?.message?.content;
}

async function listGeminiModels({ apiKey, fetchImpl }) {
  const url = `${GEMINI_API_BASES[0]}/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchImpl(url, { headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown');
    throw new AppError(`Gemini model list failed (${response.status}): ${providerErrorMessage(text)}`, 502);
  }
  const data = await response.json().catch(() => null);
  return data?.models || [];
}

// Cheaper, more reliable text models first; gemma/image/tts models last.
// -latest aliases rank below versioned models: they see heavier demand
// spikes and can be repointed or retired without notice.
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

  const models = await listGeminiModels({ apiKey, fetchImpl });
  const available = models
    .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
    .map((model) => model.name.replace(/^models\//, ''));

  if (!available.length) {
    throw new AppError('No Gemini text-generation model available for this API key', 503);
  }

  const preferred = [...new Set([requestedModel, ...available])].sort(
    (a, b) => geminiModelRank(a, requestedModel) - geminiModelRank(b, requestedModel),
  );

  GEMINI_MODEL_CACHE.set(cacheKey, preferred);
  return preferred;
}

async function requestGeminiContent({ apiKey, model, transcript, locale, fetchImpl, baseUrl }) {
  const url = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        role: 'user',
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt(transcript, locale) }],
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

async function generateGeminiContent({ apiKey, model, transcript, locale, fetchImpl }) {
  let lastResult = null;
  for (const baseUrl of GEMINI_API_BASES) {
    const result = await requestGeminiContent({
      apiKey,
      model,
      transcript,
      locale,
      fetchImpl,
      baseUrl,
    });
    if (result.ok || result.status !== 404) return result;
    lastResult = result;
  }
  return lastResult;
}

async function callGemini({ apiKey, transcript, locale, model, fetchImpl }) {
  const requestedModel = model || GEMINI_MODEL;
  const candidates = await resolveGeminiModels({ apiKey, requestedModel, fetchImpl });
  let lastError = 'unknown';

  // Google occasionally returns transient 5xx; run a second pass over the
  // candidates when the first failed with server-side errors only.
  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) await sleep(RETRY_DELAY_MS);
    let sawServerError = false;
    for (const model of candidates) {
      const result = await generateGeminiContent({ apiKey, model, transcript, locale, fetchImpl });
      if (result.ok) {
        GEMINI_MODEL_CACHE.set(`${apiKey}:${requestedModel}`, [model]);
        return result.content;
      }
      sawServerError = sawServerError || result.status >= 500;
      lastError = `${model} -> ${result.status}: ${providerErrorMessage(result.text)}`;
      console.warn(`Gemini voice model ${model} failed: ${result.status}`);
    }
    if (!sawServerError) break;
  }

  throw new AppError(`AI parsing failed: ${lastError}`, 502);
}

export async function parseVoiceInput({
  transcript,
  locale = 'en',
  provider,
  apiKey,
  model,
  fetchImpl = fetch,
} = {}) {
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
    throw new AppError('Voice parsing is not configured on this server', 503);
  }

  const content = resolvedProvider === 'openai'
    ? await callOpenAI({ apiKey: resolvedKey, transcript, locale, model: requestedModel, fetchImpl })
    : await callGemini({ apiKey: resolvedKey, transcript, locale, model: requestedModel, fetchImpl });

  if (!content) {
    throw new AppError('AI parsing returned an empty response', 502);
  }

  function extractJson(text) {
    const cleaned = text
      .replace(/```(?:json)?/gi, '')
      .trim();
    const objects = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
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
        if (depth === 0) objects.push(cleaned.slice(start, i + 1));
      }
    }
    // The actual answer comes last; earlier objects are schema echoes/reasoning.
    for (let i = objects.length - 1; i >= 0; i--) {
      if (/"items"\s*:/.test(objects[i])) return objects[i];
    }
    return objects[objects.length - 1] || cleaned;
  }

  let parsed;
  try {
    parsed = JSON.parse(extractJson(content));
  } catch {
    throw new AppError('AI parsing returned malformed JSON', 502);
  }

  if (!Array.isArray(parsed.items)) {
    throw new AppError('AI parsing returned unexpected shape', 502);
  }

  return parsed.items.map((item) => ({
    name: String(item.name || ''),
    nameEn: String(item.nameEn || '').trim() || String(item.name || ''),
    nameUk: String(item.nameUk || '').trim() || null,
    quantityGrams: Number(item.quantityGrams) || 0,
    calories: Number(item.calories) || 0,
    protein: Number(item.protein) || 0,
    carbs: Number(item.carbs) || 0,
    fat: Number(item.fat) || 0,
  }));
}
