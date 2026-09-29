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
    const fetchImpl = vi.fn().mockResolvedValue(
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

    const items = await parseVoiceInput({
      transcript: 'one banana',
      provider: 'gemini',
      apiKey: 'explicit-gemini-key',
      fetchImpl,
    });

    expect(items).toHaveLength(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
    expect(fetchImpl.mock.calls[0][0]).toContain('explicit-gemini-key');
  });

  it('returns parsed items from the Gemini response', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    const fetchImpl = vi.fn().mockResolvedValue(
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

    const items = await parseVoiceInput({
      transcript: "я з'їв 200 грам вівсянки",
      locale: 'uk',
      fetchImpl,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Вівсянка', quantityGrams: 200, calories: 140 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('gemini-test-key');
    const body = JSON.parse(options.body);
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
});
