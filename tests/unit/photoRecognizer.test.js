import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recognizePhoto } from '../../src/lib/photoRecognizer.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

describe('photo recognizer', () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalOpenAiKey) process.env.OPENAI_API_KEY = originalOpenAiKey;
    else delete process.env.OPENAI_API_KEY;
    if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;
    else delete process.env.GEMINI_API_KEY;
  });

  it('returns parsed result from OpenAI response', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Buckwheat (cooked)',
                weightGrams: 250,
                caloriesPer100g: 132,
                proteinPer100g: 4.5,
                carbsPer100g: 24,
                fatPer100g: 1.6,
                confidence: 'high',
              }),
            },
          },
        ],
      }),
    );

    const result = await recognizePhoto({ imageBase64, locale: 'en', fetchImpl });

    expect(result).toMatchObject({
      name: 'Buckwheat (cooked)',
      weightGrams: 250,
      caloriesPer100g: 132,
      confidence: 'high',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.messages[1].content[0].text).toContain('Locale: en');
    expect(body.messages[1].content[1].image_url.url).toContain(imageBase64);
  });

  it('returns parsed result from Gemini response', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/models?key=')) {
        return Promise.resolve(
          jsonResponse({
            models: [{ name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] }],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      name: 'Roasted pork',
                      weightGrams: 180,
                      caloriesPer100g: 247,
                      proteinPer100g: 27,
                      carbsPer100g: 0,
                      fatPer100g: 15,
                      confidence: 'medium',
                    }),
                  },
                ],
              },
            },
          ],
        }),
      );
    });

    const result = await recognizePhoto({ imageBase64, provider: 'gemini', apiKey: 'explicit-key', locale: 'uk', fetchImpl });

    expect(result).toMatchObject({ name: 'Roasted pork', weightGrams: 180, confidence: 'medium' });
    expect(fetchImpl.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
  });

  it('throws when AI returns empty name', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: JSON.stringify({ name: '', weightGrams: 0, confidence: 'low' }) } }],
      }),
    );

    await expect(recognizePhoto({ imageBase64, fetchImpl })).rejects.toThrow('Could not recognize');
  });

  it('throws when no API key is configured', async () => {
    await expect(recognizePhoto({ imageBase64 })).rejects.toThrow('not configured');
  });
});
