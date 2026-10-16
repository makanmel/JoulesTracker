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
  const imageBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB//9k=';

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
                name: 'Гречка (варена)',
                nameEn: 'Buckwheat (cooked)',
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

    expect(result.confidence).toBe('high');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      name: 'Гречка (варена)',
      nameEn: 'Buckwheat (cooked)',
      weightGrams: 250,
      caloriesPer100g: 132,
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

    expect(result.confidence).toBe('medium');
    expect(result.items[0]).toMatchObject({ name: 'Roasted pork', weightGrams: 180 });
    expect(fetchImpl.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
  });

  it('retries a model on the alternate API version after a 404', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    const generateUrls = [];
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/models?key=')) {
        return Promise.resolve(
          jsonResponse({
            models: [{ name: 'models/gemini-9-preview', supportedGenerationMethods: ['generateContent'] }],
          }),
        );
      }
      generateUrls.push(url);
      if (url.includes('/v1beta/')) {
        return Promise.resolve(jsonResponse({ error: { message: 'not found' } }, 404));
      }
      return Promise.resolve(
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  { text: JSON.stringify({ name: 'Pizza', weightGrams: 100, confidence: 'medium' }) },
                ],
              },
            },
          ],
        }),
      );
    });

    const result = await recognizePhoto({
      imageBase64,
      provider: 'gemini',
      apiKey: 'version-fallback-key',
      fetchImpl,
    });

    expect(result.items[0].name).toBe('Pizza');
    expect(generateUrls[0]).toContain('/v1beta/');
    expect(generateUrls[1]).toContain('/v1/');
  });

  it('skips thought parts and parses JSON after a reasoning preamble', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    const answer = JSON.stringify({ name: 'Black coffee', weightGrams: 250, caloriesPer100g: 2 });
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/models?key=')) {
        return Promise.resolve(
          jsonResponse({
            models: [{ name: 'models/gemma-think', supportedGenerationMethods: ['generateContent'] }],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  { thought: true, text: 'The image shows a mug of black coffee. {"name": "schema echo"}' },
                  { text: `Analysis: mug with dark liquid. {"name": "Coffee draft"}\n${answer}` },
                ],
              },
            },
          ],
        }),
      );
    });

    const result = await recognizePhoto({
      imageBase64,
      provider: 'gemini',
      apiKey: 'thought-parts-key',
      fetchImpl,
    });

    expect(result.items[0]).toMatchObject({ name: 'Black coffee', weightGrams: 250 });
  });

  it('tries a UI-selected model first for Gemini', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    const generateUrls = [];
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/models?key=')) {
        return Promise.resolve(
          jsonResponse({
            models: [
              { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-9-custom', supportedGenerationMethods: ['generateContent'] },
            ],
          }),
        );
      }
      generateUrls.push(url);
      return Promise.resolve(
        jsonResponse({
          candidates: [
            { content: { parts: [{ text: JSON.stringify({ name: 'Pizza', weightGrams: 100 }) }] } },
          ],
        }),
      );
    });

    const result = await recognizePhoto({
      imageBase64,
      provider: 'gemini',
      apiKey: 'ui-model-key',
      model: 'gemini-9-custom',
      fetchImpl,
    });

    expect(result.items[0].name).toBe('Pizza');
    expect(generateUrls[0]).toContain('gemini-9-custom');
  });

  it('returns every item when the model responds with an items array', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  { name: 'Rice', nameEn: 'Rice', weightGrams: 150, caloriesPer100g: 130 },
                  { name: 'Chicken', nameEn: 'Chicken breast', weightGrams: 120, caloriesPer100g: 165 },
                  { name: '', weightGrams: 50 },
                ],
                confidence: 'high',
              }),
            },
          },
        ],
      }),
    );

    const result = await recognizePhoto({ imageBase64, locale: 'en', fetchImpl });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.name)).toEqual(['Rice', 'Chicken']);
    expect(result.items[1].weightGrams).toBe(120);
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
