import { describe, it, expect, vi } from 'vitest';
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
  it('returns parsed items from the OpenAI response', async () => {
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

  it('returns 503 when no API key is configured', async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    await expect(parseVoiceInput({ transcript: 'test', fetchImpl: vi.fn() })).rejects.toMatchObject({
      statusCode: 503,
    });

    process.env.OPENAI_API_KEY = originalKey;
  });

  it('surfaces upstream errors as 502', async () => {
    const originalKey = process.env.OPENAI_API_KEY || 'test-key';
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'rate limit' }, 429));

    await expect(parseVoiceInput({ transcript: 'test', fetchImpl })).rejects.toMatchObject({ statusCode: 502 });

    process.env.OPENAI_API_KEY = originalKey;
  });
});
