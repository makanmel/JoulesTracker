import { AppError } from './errors.js';

const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const GEMINI_API_BASES = ['v1beta', 'v1'].map(
  (version) => `https://generativelanguage.googleapis.com/${version}`,
);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function providerErrorMessage(text) {
  const message = String(text).match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  const clean = (message ? message.replace(/\\(.)/g, '$1') : String(text)).trim();
  return clean.length > 200 ? `${clean.slice(0, 200)}...` : clean;
}

async function transcribeOpenAI({ apiKey, audio, mimeType, locale, fetchImpl }) {
  const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mimeType }), `voice.${extension}`);
  form.append('model', 'whisper-1');
  form.append('language', locale === 'uk' ? 'uk' : 'en');
  const response = await fetchImpl(OPENAI_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown');
    throw new AppError(`AI transcription failed (${response.status}): ${providerErrorMessage(text)}`, 502);
  }
  const data = await response.json().catch(() => null);
  return String(data?.text || '').trim();
}

async function listGeminiTranscriptionModels({ apiKey, requestedModel, fetchImpl }) {
  const response = await fetchImpl(`${GEMINI_API_BASES[0]}/models?key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) return [];
  const data = await response.json().catch(() => null);
  return (data?.models || [])
    .filter((item) => item.supportedGenerationMethods?.includes('generateContent'))
    .map((item) => String(item.name || '').replace(/^models\//, ''))
    .filter((name) => name.startsWith('gemini-') && !/image|tts|embedding|aqa|robotics/i.test(name))
    .filter((name) => name !== requestedModel)
    .sort((a, b) => {
      const aRank = /flash/i.test(a) ? 0 : 1;
      const bRank = /flash/i.test(b) ? 0 : 1;
      return aRank - bRank;
    });
}

async function requestGeminiTranscription({ apiKey, audio, mimeType, locale, model, fetchImpl, baseUrl }) {
  const response = await fetchImpl(
    `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: `Transcribe this ${locale === 'uk' ? 'Ukrainian' : 'English'} speech exactly. Return only the transcript.` },
            { inlineData: { mimeType, data: audio.toString('base64') } },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown');
    return { ok: false, status: response.status, error: providerErrorMessage(text) };
  }
  const data = await response.json().catch(() => null);
  const transcript = (data?.candidates?.[0]?.content?.parts || [])
    .filter((part) => part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text)
    .join(' ')
    .trim();
  return transcript ? { ok: true, transcript } : { ok: false, status: 200, error: 'empty transcript' };
}

async function transcribeGemini({ apiKey, audio, mimeType, locale, model, fetchImpl }) {
  const requestedModel = /^[a-zA-Z0-9._-]+$/.test(String(model || '').trim()) ? String(model).trim() : GEMINI_MODEL;
  let candidates = [requestedModel];
  let discovered = false;
  let lastError = 'unknown';
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    for (const baseUrl of GEMINI_API_BASES) {
      const result = await requestGeminiTranscription({
        apiKey,
        audio,
        mimeType,
        locale,
        model: candidate,
        fetchImpl,
        baseUrl,
      });
      if (result.ok) return result.transcript;
      lastError = `${candidate} -> ${result.status}: ${result.error}`;
      if (result.status !== 404) break;
    }
    if (!discovered && lastError.includes('-> 404:')) {
      discovered = true;
      candidates = [...candidates, ...(await listGeminiTranscriptionModels({ apiKey, requestedModel, fetchImpl }))];
    }
  }
  throw new AppError(`AI transcription failed: ${lastError}`, 502);
}

export async function transcribeVoiceAudio({ audioBase64, mimeType, locale = 'en', provider, apiKey, model, fetchImpl = fetch } = {}) {
  const resolvedProvider = provider
    ? String(provider).toLowerCase()
    : process.env.OPENAI_API_KEY
      ? 'openai'
      : 'gemini';
  const resolvedKey = apiKey || (resolvedProvider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY);
  if (!resolvedKey) throw new AppError('Voice transcription is not configured on this server', 503);
  const audio = Buffer.from(String(audioBase64 || ''), 'base64');
  if (audio.length < 100) throw new AppError('Voice recording is empty', 400);
  if (audio.length > 3_000_000) throw new AppError('Voice recording is too large', 413);
  const safeMimeType = /^audio\/[a-zA-Z0-9.+-]+(?:;codecs=[a-zA-Z0-9,._-]+)?$/.test(String(mimeType || ''))
    ? String(mimeType)
    : 'audio/webm';
  return resolvedProvider === 'openai'
    ? transcribeOpenAI({ apiKey: resolvedKey, audio, mimeType: safeMimeType, locale, fetchImpl })
    : transcribeGemini({ apiKey: resolvedKey, audio, mimeType: safeMimeType, locale, model, fetchImpl });
}
