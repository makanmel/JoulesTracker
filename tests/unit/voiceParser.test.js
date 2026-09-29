import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseVoiceInput } from '../../src/lib/voiceParser.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function geminiModelListResponse(models = ['gemini-1.5-flash']) {
  const names = Array.isArray(models) ? models : [models];
  return jsonResponse({
    models: names.map((name) => ({
      name: `models/${name}`,
      supportedGenerationMethods: ['generateContent'],
    })),
  });
}

describe('voice parser', () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;

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

  it('returns parsed items from the OpenAI response', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  { name: 'Oatmeal', quantityGrams: 200, calories: 140, protein: 5, carbs: 24, fat: 2 },
                ],
              }),
            },
          },
        ],
      }),
    );

    const items = await parseVoiceInput({ transcript: 'I had 200 grams of oatmeal', locale: 'en', fetchImpl });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Oatmeal', quantityGrams: 200, calories: 140 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain('Locale: en');
    expect(body.messages[1].content).toContain('I had 200 grams of oatmeal');
  });

  it('uses an explicit provider and API key over environment variables', async () => {
    process.env.OPENAI_API_KEY = 'env-openai-key';
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/models?key=')) {
        return Promise.resolve(geminiModelListResponse('gemini-1.5-flash'));
      }
      return Promise.resolve(
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      items: [{ name: 'Banana', quantityGrams: 120, calories: 106, protein: 1, carbs: 27, fat: 0 }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      );
    });

    const items = await parseVoiceInput({
      transcript: 'one banana',
      provider: 'gemini',
      apiKey: 'explicit-gemini-key',
      fetchImpl,
    });

    expect(items).toHaveLength(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('generativelanguage.googleapis.com/v1/models');
    expect(fetchImpl.mock.calls[0][0]).toContain('explicit-gemini-key');
  });

  it('returns parsed items from the Gemini response', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/models?key=')) {
        return Promise.resolve(geminiModelListResponse('gemini-1.5-flash'));
      }
      return Promise.resolve(
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      items: [
                        { name: 'Вівсянка', quantityGrams: 200, calories: 140, protein: 5, carbs: 24, fat: 2 },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      );
    });

    const items = await parseVoiceInput({
      transcript: "я з'їв 200 грам вівсянки",
      locale: 'uk',
      fetchImpl,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Вівсянка', quantityGrams: 200, calories: 140 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const generateCall = fetchImpl.mock.calls.find(([callUrl]) => callUrl.includes(':generateContent'));
    expect(generateCall[0]).toContain('generativelanguage.googleapis.com');
    expect(generateCall[0]).toContain('gemini-test-key');
    const body = JSON.parse(generateCall[1].body);
    expect(body.contents[0].parts[0].text).toContain('Locale: uk');
    expect(body.contents[0].parts[0].text).toContain("я з'їв 200 грам вівсянки");
  });

  it('returns 503 when no API key is configured', async () => {
    await expect(parseVoiceInput({ transcript: 'test', fetchImpl: vi.fn() })).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it('surfaces upstream errors as 502', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'rate limit' }, 429));

    await expect(parseVoiceInput({ transcript: 'test', fetchImpl })).rejects.toMatchObject({ statusCode: 502 });
  });

  it('falls back to the next Gemini model when the first returns 404', async () => {
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/models?key=')) {
        return Promise.resolve(geminiModelListResponse(['gemini-2.5-flash', 'gemini-3.8-flash']));
      }
      if (url.includes('/models/gemini-2.5-flash:generateContent')) {
        return Promise.resolve(jsonResponse({ error: { code: 404, message: 'no longer available' } }, 404));
      }
      return Promise.resolve(
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ items: [{ name: 'Apple', quantityGrams: 150, calories: 78, protein: 0, carbs: 21, fat: 0 }] }) }],
              },
            },
          ],
        }),
      );
    });

    const items = await parseVoiceInput({
      transcript: 'one apple',
      provider: 'gemini',
      apiKey: 'fallback-gemini-key',
      fetchImpl,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Apple' });
    const generateCalls = fetchImpl.mock.calls.filter(([callUrl]) => callUrl.includes(':generateContent'));
    expect(generateCalls).toHaveLength(2);
    expect(generateCalls[1][0]).toContain('gemini-3.8-flash');
  });

  it('throws 502 when all Gemini models return 404', async () => {
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/models?key=')) {
        return Promise.resolve(geminiModelListResponse(['gemini-2.5-flash']));
      }
      return Promise.resolve(jsonResponse({ error: { code: 404, message: 'no longer available' } }, 404));
    });

    await expect(
      parseVoiceInput({ transcript: 'test', provider: 'gemini', apiKey: 'all-fail-gemini-key', fetchImpl }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it('extracts JSON wrapped in markdown fences from the Gemini response', async () => {
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/models?key=')) {
        return Promise.resolve(geminiModelListResponse('gemini-1.5-flash'));
      }
      return Promise.resolve(
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [{ text: '```json\n{"items":[{"name":"Banana","quantityGrams":120,"calories":106,"protein":1,"carbs":27,"fat":0}]}\n```' }],
              },
            },
          ],
        }),
      );
    });

    const items = await parseVoiceInput({ transcript: 'one banana', provider: 'gemini', apiKey: 'md-gemini-key', fetchImpl });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Banana' });
  });

  it('extracts JSON object from surrounding prose', async () => {
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/models?key=')) {
        return Promise.resolve(geminiModelListResponse('gemini-1.5-flash'));
      }
      return Promise.resolve(
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [{ text: 'Here you go: {"items":[{"name":"Oatmeal","quantityGrams":200,"calories":140,"protein":5,"carbs":24,"fat":2}]}' }],
              },
            },
          ],
        }),
      );
    });

    const items = await parseVoiceInput({ transcript: 'oatmeal', provider: 'gemini', apiKey: 'prose-gemini-key', fetchImpl });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Oatmeal' });
  });
});
