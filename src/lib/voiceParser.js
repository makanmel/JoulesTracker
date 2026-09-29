import { AppError } from './errors.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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

export async function parseVoiceInput({ transcript, locale = 'en', fetchImpl = fetch } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AppError('Voice parsing is not configured on this server', 503);
  }

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
        { role: 'user', content: `Locale: ${locale}\nTranscript: ${transcript}` },
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
  if (!data || typeof data !== 'object') {
    throw new AppError('AI parsing returned invalid JSON', 502);
  }

  const content = data.choices?.[0]?.message?.content;
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
