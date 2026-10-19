import { describe, expect, it, vi } from 'vitest';
import { transcribeVoiceAudio } from '../../src/lib/voiceTranscriber.js';

const audioBase64 = Buffer.from('recorded speech data'.repeat(10)).toString('base64');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('voice transcriber', () => {
  it('sends inline audio to Gemini and returns its transcript', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ candidates: [{ content: { parts: [{ text: 'двісті грамів вівсянки' }] } }] }),
    );

    const transcript = await transcribeVoiceAudio({
      audioBase64,
      mimeType: 'audio/webm;codecs=opus',
      locale: 'uk',
      provider: 'gemini',
      apiKey: 'gemini-key',
      fetchImpl,
    });

    expect(transcript).toBe('двісті грамів вівсянки');
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe('audio/webm;codecs=opus');
    expect(body.contents[0].parts[1].inlineData.data).toBe(audioBase64);
  });

  it('uploads audio to OpenAI transcription', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ text: 'two hundred grams of oatmeal' }));

    const transcript = await transcribeVoiceAudio({
      audioBase64,
      mimeType: 'audio/webm',
      locale: 'en',
      provider: 'openai',
      apiKey: 'openai-key',
      fetchImpl,
    });

    expect(transcript).toBe('two hundred grams of oatmeal');
    expect(fetchImpl.mock.calls[0][0]).toContain('/audio/transcriptions');
    expect(fetchImpl.mock.calls[0][1].body).toBeInstanceOf(FormData);
  });

  it('rejects empty recordings', async () => {
    await expect(
      transcribeVoiceAudio({ audioBase64: Buffer.from('short').toString('base64'), apiKey: 'key' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
