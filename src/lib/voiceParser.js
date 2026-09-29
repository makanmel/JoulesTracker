import { AppError } from './errors.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_MODEL_CACHE = new Map();

const SYSTEM_PROMPT = `You are a nutrition assistant for a calorie tracker. The user speaks in either Ukrainian or English.
Parse the input into food items with estimated macros per the described portion.
Respond ONLY with a JSON object in this exact shape, no markdown, no explanation:
{
  "items": [
    {
      "name": "short localized food name matching the requested locale",
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

async function callOpenAI({ apiKey, transcript, locale, fetchImpl }) {
  const response = await fetchImpl(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
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
    throw new AppError(`AI parsing failed (${response.status}): ${text}`, 502);
  }

  const data = await response.json().catch(() => null);
  return data?.choices?.[0]?.message?.content;
}

async function listGeminiModels({ apiKey, fetchImpl }) {
  const url = `${GEMINI_API_BASE}/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchImpl(url, { headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown');
    throw new AppError(`Gemini model list failed (${response.status}): ${text}`, 502);
  }
  const data = await response.json().catch(() => null);
  return data?.models || [];
}

async function resolveGeminiModel({ apiKey, requestedModel, fetchImpl }) {
  const cached = GEMINI_MODEL_CACHE.get(apiKey);
  if (cached) return cached;

  const models = await listGeminiModels({ apiKey, fetchImpl });
  const available = models
    .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
    .map((model) => model.name.replace(/^models\//, ''));

  const selected = available.includes(requestedModel) ? requestedModel : available[0];
  if (!selected) {
    throw new AppError('No Gemini text-generation model available for this API key', 503);
  }

  GEMINI_MODEL_CACHE.set(apiKey, selected);
  return selected;
}

async function callGemini({ apiKey, transcript, locale, fetchImpl }) {
  const model = await resolveGeminiModel({ apiKey, requestedModel: GEMINI_MODEL, fetchImpl });
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
    throw new AppError(`AI parsing failed (${response.status}): ${text}`, 502);
  }

  const data = await response.json().catch(() => null);
  return data?.candidates?.[0]?.content?.parts?.[0]?.text;
}

export async function parseVoiceInput({
  transcript,
  locale = 'en',
  provider,
  apiKey,
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

  if (!resolvedKey) {
    throw new AppError('Voice parsing is not configured on this server', 503);
  }

  const content = resolvedProvider === 'openai'
    ? await callOpenAI({ apiKey: resolvedKey, transcript, locale, fetchImpl })
    : await callGemini({ apiKey: resolvedKey, transcript, locale, fetchImpl });

  if (!content) {
    throw new AppError('AI parsing returned an empty response', 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AppError('AI parsing returned malformed JSON', 502);
  }

  if (!Array.isArray(parsed.items)) {
    throw new AppError('AI parsing returned unexpected shape', 502);
  }

  return parsed.items.map((item) => ({
    name: String(item.name || ''),
    quantityGrams: Number(item.quantityGrams) || 0,
    calories: Number(item.calories) || 0,
    protein: Number(item.protein) || 0,
    carbs: Number(item.carbs) || 0,
    fat: Number(item.fat) || 0,
  }));
}
