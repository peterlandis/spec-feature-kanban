/**
 * Iron Man–style Jarvis speech: British Daniel, lower pitch, measured pace.
 * Uses macOS `say` when available. Never interpolates text into a shell.
 */

import { execFile, execFileSync } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const MAX_SPEECH_CHARS = 1800;
const SAY_RATE = '158';
const VOICE_CANDIDATES = ['Daniel', 'Reed (English (UK))', 'Eddy (English (UK))'];
const GROK_TTS_URL = 'https://api.x.ai/v1/tts';
const GROK_CHAT_URL = 'https://api.x.ai/v1/chat/completions';
const GROK_REWRITE_MODELS = ['grok-4-fast-non-reasoning', 'grok-4-1-fast-non-reasoning', 'grok-3-mini'];
const GROK_VOICES = ['rex', 'ara', 'leo', 'sal', 'eve'];
const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const OPENAI_VOICES = ['onyx', 'echo', 'ash', 'fable', 'cedar', 'sage', 'alloy', 'nova', 'coral'];
const OPENAI_JARVIS_INSTRUCTIONS = [
  'You are J.A.R.V.I.S. answering a colleague out loud — a real person, not a screen reader.',
  'British Received Pronunciation, calm, slightly dry, never cartoonish.',
  'Speak in connected phrases at a natural conversational pace. Do not pause after every word.',
  'Do not read lists or status fields item by item. Pronounce CORE-018 as Core eighteen, AGENT-001 as Agent one.',
].join(' ');
export const JARVIS_VOICE_CATALOG = [
  { id: 'local:daniel', provider: 'local', group: 'On this Mac', sayName: 'Daniel', label: 'Daniel — classic British Jarvis', setup: 'none', hint: 'Uses the Mac speech voice. No API key.' },
  { id: 'local:reed-uk', provider: 'local', group: 'On this Mac', sayName: 'Reed (English (UK))', label: 'Reed UK — more natural Mac voice', setup: 'none', hint: 'Uses the Mac Reed voice. No API key.' },
  { id: 'local:eddy-uk', provider: 'local', group: 'On this Mac', sayName: 'Eddy (English (UK))', label: 'Eddy UK — Mac voice', setup: 'none', hint: 'Uses the Mac Eddy voice. No API key.' },
  { id: 'browser:uk-male', provider: 'browser', group: 'Browser', sayName: '', label: 'Browser UK male', setup: 'none', hint: 'Uses the browser speech engine. Quality varies. No API key.' },
  { id: 'openai:onyx', provider: 'openai', group: 'OpenAI', openaiId: 'onyx', label: 'Onyx — deep male (closest Jarvis)', setup: 'openai', hint: 'OpenAI briefs from the graph, then speaks. Needs an OpenAI API key.' },
  { id: 'openai:echo', provider: 'openai', group: 'OpenAI', openaiId: 'echo', label: 'Echo — male', setup: 'openai', hint: 'OpenAI neural speech. Needs an OpenAI API key from platform.openai.com.' },
  { id: 'openai:ash', provider: 'openai', group: 'OpenAI', openaiId: 'ash', label: 'Ash — male', setup: 'openai', hint: 'OpenAI neural speech. Needs an OpenAI API key from platform.openai.com.' },
  { id: 'openai:fable', provider: 'openai', group: 'OpenAI', openaiId: 'fable', label: 'Fable — British-leaning', setup: 'openai', hint: 'OpenAI neural speech. Needs an OpenAI API key from platform.openai.com.' },
  { id: 'openai:cedar', provider: 'openai', group: 'OpenAI', openaiId: 'cedar', label: 'Cedar', setup: 'openai', hint: 'OpenAI neural speech. Needs an OpenAI API key from platform.openai.com.' },
  { id: 'openai:sage', provider: 'openai', group: 'OpenAI', openaiId: 'sage', label: 'Sage — calm', setup: 'openai', hint: 'OpenAI neural speech. Needs an OpenAI API key from platform.openai.com.' },
  { id: 'openai:alloy', provider: 'openai', group: 'OpenAI', openaiId: 'alloy', label: 'Alloy — neutral', setup: 'openai', hint: 'OpenAI neural speech. Needs an OpenAI API key from platform.openai.com.' },
  { id: 'openai:nova', provider: 'openai', group: 'OpenAI', openaiId: 'nova', label: 'Nova', setup: 'openai', hint: 'OpenAI neural speech. Needs an OpenAI API key from platform.openai.com.' },
  { id: 'openai:coral', provider: 'openai', group: 'OpenAI', openaiId: 'coral', label: 'Coral', setup: 'openai', hint: 'OpenAI neural speech. Needs an OpenAI API key from platform.openai.com.' },
  { id: 'grok:rex', provider: 'grok', group: 'Grok (xAI)', grokId: 'rex', label: 'Rex — composed male', setup: 'xai', hint: 'Grok briefs from the graph, then speaks. Needs an xAI API key.' },
  { id: 'grok:ara', provider: 'grok', group: 'Grok (xAI)', grokId: 'ara', label: 'Ara', setup: 'xai', hint: 'Grok neural speech. Needs an xAI API key from console.x.ai.' },
  { id: 'grok:leo', provider: 'grok', group: 'Grok (xAI)', grokId: 'leo', label: 'Leo', setup: 'xai', hint: 'Grok neural speech. Needs an xAI API key from console.x.ai.' },
  { id: 'grok:sal', provider: 'grok', group: 'Grok (xAI)', grokId: 'sal', label: 'Sal', setup: 'xai', hint: 'Grok neural speech. Needs an xAI API key from console.x.ai.' },
  { id: 'grok:eve', provider: 'grok', group: 'Grok (xAI)', grokId: 'eve', label: 'Eve', setup: 'xai', hint: 'Grok neural speech. Needs an xAI API key from console.x.ai.' },
];
const DEFAULT_VOICE_ID = 'local:daniel';
let installedCache = { at: 0, names: [] };
const JARVIS_REWRITE_PROMPT = [
  'You are J.A.R.V.I.S. answering a colleague out loud.',
  'Turn these facts into one or two spoken sentences: British, calm, slightly dry, human.',
  'Lead with the answer. Do not read fields word by word or list every status.',
  'Do not invent features, IDs, statuses, or relations. Keep every feature ID that appears.',
  'No markdown, no quotes, spoken text only.',
].join(' ');

let cachedVoice = undefined;

export function xaiApiKey() {
  return (process.env.XAI_API_KEY || '').trim();
}

export function isGrokSpeechConfigured() {
  return Boolean(xaiApiKey());
}

export function openaiApiKey() {
  return (process.env.OPENAI_API_KEY || '').trim();
}

export function isOpenAiSpeechConfigured() {
  return Boolean(openaiApiKey());
}

export function resolveOpenAiVoiceId(requested) {
  const raw = String(requested || '').trim().toLowerCase();
  return OPENAI_VOICES.includes(raw) ? raw : 'onyx';
}

export function resolveGrokVoiceId(requested) {
  const raw = String(requested || '').trim().toLowerCase();
  return GROK_VOICES.includes(raw) ? raw : 'rex';
}

export function normalizeJarvisVoiceId(raw) {
  const value = String(raw || '').trim();
  if (!value) return DEFAULT_VOICE_ID;
  if (GROK_VOICES.includes(value)) return `grok:${value}`;
  if (OPENAI_VOICES.includes(value)) return `openai:${value}`;
  if (JARVIS_VOICE_CATALOG.some((voice) => voice.id === value)) return value;
  return DEFAULT_VOICE_ID;
}

export function parseJarvisVoice(raw) {
  const id = normalizeJarvisVoiceId(raw);
  return JARVIS_VOICE_CATALOG.find((voice) => voice.id === id) || JARVIS_VOICE_CATALOG[0];
}

function installedSayVoices() {
  if (Date.now() - installedCache.at < 60000) return installedCache.names;
  try {
    const stdout = execFileSync('say', ['-v', '?'], { encoding: 'utf8', timeout: 5000 });
    installedCache = { at: Date.now(), names: parseSayVoices(stdout) };
  } catch (_) {
    installedCache = { at: Date.now(), names: [] };
  }
  return installedCache.names;
}

export function listJarvisVoices() {
  const installed = installedSayVoices();
  const grokReady = isGrokSpeechConfigured();
  const openaiReady = isOpenAiSpeechConfigured();
  return JARVIS_VOICE_CATALOG.map((voice) => {
    let available = true;
    if (voice.provider === 'local') available = installed.includes(voice.sayName);
    if (voice.provider === 'grok') available = grokReady;
    if (voice.provider === 'openai') available = openaiReady;
    return { ...voice, available };
  });
}

export function toJarvisSpeech(text, options = {}) {
  let spoken = String(text || '').replace(/\[\[.*?\]\]/g, ' ').trim();
  if (!spoken) return '';
  spoken = spoken.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ');
  if (!options.keepIds) {
    spoken = spoken.replace(/\b(CORE|AGENT)-(\d{3})\b/gi, (_, kind, digits) => {
      const name = String(kind).toUpperCase() === 'AGENT' ? 'Agent' : 'Core';
      const n = Number(digits);
      return Number.isFinite(n) ? `${name} ${n}` : `${name} ${digits}`;
    });
  }
  spoken = spoken
    .replace(/WorkInProgress/g, 'work in progress')
    .replace(/ReadyToMerge/g, 'ready to merge')
    .replace(/PlanReview/g, 'plan review')
    .replace(/\bBlocked\b/g, 'blocked')
    .replace(/\bPaused\b/g, 'paused')
    .replace(/\bPlanned\b/g, 'planned')
    .replace(/\bPlanning\b/g, 'planning')
    .replace(/\bTesting\b/g, 'testing')
    .replace(/\bComplete\b/g, 'complete')
    .replace(/—/g, '. ')
    .replace(/\s+\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
  return spoken.slice(0, MAX_SPEECH_CHARS);
}

function parseSayVoices(stdout) {
  return String(stdout || '')
    .split('\n')
    .map((line) => {
      const match = line.match(/^(.+?)\s+[a-z]{2}_[A-Z]{2}\s+#/);
      return match ? match[1].trim() : '';
    })
    .filter(Boolean);
}

export async function resolveJarvisVoice() {
  if (cachedVoice !== undefined) return cachedVoice;
  try {
    const { stdout } = await execFileAsync('say', ['-v', '?'], { timeout: 5000 });
    const installed = parseSayVoices(stdout);
    cachedVoice = VOICE_CANDIDATES.find((name) => installed.includes(name)) || null;
  } catch (_) {
    cachedVoice = null;
  }
  return cachedVoice;
}

function cleanRewrite(text, fallback) {
  const cleaned = String(text || '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^```[\s\S]*?\n|```$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

async function rewriteJarvisLine(spoken) {
  const key = xaiApiKey();
  if (!key) return spoken;
  let lastError = null;
  for (const model of GROK_REWRITE_MODELS) {
    try {
      const res = await fetch(GROK_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: 220,
          messages: [
            { role: 'system', content: JARVIS_REWRITE_PROMPT },
            { role: 'user', content: spoken },
          ],
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        lastError = new Error(`Grok rewrite ${res.status}`);
        continue;
      }
      const data = await res.json();
      const line = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : '';
      return cleanRewrite(line, spoken);
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) {
    console.warn('Jarvis Grok rewrite skipped:', lastError.message);
  }
  return spoken;
}

async function synthesizeGrokSpeech(spoken, voiceId) {
  const key = xaiApiKey();
  if (!key) {
    const err = new Error('Grok speech needs an xAI API key.');
    err.code = 'NO_GROK';
    throw err;
  }
  const res = await fetch(GROK_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: spoken,
      language: 'en',
      voice_id: resolveGrokVoiceId(voiceId),
      speed: 1,
      text_normalization: true,
      output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: 128000 },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(detail.slice(0, 180) || `Grok voice failed (${res.status}).`);
    err.code = 'GROK_TTS';
    throw err;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    buffer,
    mime: 'audio/mpeg',
    voice: `grok:${resolveGrokVoiceId(voiceId)}`,
    spoken,
    engine: 'grok',
  };
}

async function synthesizeOpenAiSpeech(spoken, voiceId) {
  const key = openaiApiKey();
  if (!key) {
    const err = new Error('OpenAI speech needs an OpenAI API key.');
    err.code = 'NO_OPENAI';
    throw err;
  }
  const voice = resolveOpenAiVoiceId(voiceId);
  const res = await fetch(OPENAI_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice,
      input: spoken,
      instructions: OPENAI_JARVIS_INSTRUCTIONS,
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(detail.slice(0, 180) || `OpenAI voice failed (${res.status}).`);
    err.code = 'OPENAI_TTS';
    throw err;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    buffer,
    mime: 'audio/mpeg',
    voice: `openai:${voice}`,
    spoken,
    engine: 'openai',
  };
}

async function synthesizeLocalSpeech(spoken, sayName) {
  const installed = installedSayVoices();
  const voice = installed.includes(sayName)
    ? sayName
    : (await resolveJarvisVoice());
  if (!voice) {
    const err = new Error('Native Jarvis voice is not available.');
    err.code = 'NO_VOICE';
    throw err;
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jarvis-voice-'));
  const out = path.join(dir, 'line.wav');
  const script = `[[rate ${SAY_RATE}]] [[pbas 40]] ${spoken}`;
  try {
    await execFileAsync('say', [
      '-v',
      voice,
      '-r',
      SAY_RATE,
      '-o',
      out,
      '--data-format=LEI16@22050',
      script,
    ], { timeout: 20000 });
    const buffer = await readFile(out);
    return { buffer, mime: 'audio/wav', voice, spoken, engine: 'local' };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function synthesizeJarvisSpeech(text, options = {}) {
  const choice = parseJarvisVoice(options.voiceId);
  const neural = choice.provider === 'grok' || choice.provider === 'openai';
  const spoken = toJarvisSpeech(text, { keepIds: neural });
  if (!spoken) {
    const err = new Error('Nothing to speak.');
    err.code = 'EMPTY';
    throw err;
  }
  if (choice.provider === 'browser') {
    const err = new Error('Use the browser speech engine for this voice.');
    err.code = 'BROWSER';
    throw err;
  }
  if (choice.provider === 'grok') {
    if (!isGrokSpeechConfigured()) {
      const err = new Error('This Grok voice needs an xAI API key in Settings → Jarvis.');
      err.code = 'NO_GROK';
      throw err;
    }
    const line = options.natural ? spoken : await rewriteJarvisLine(spoken);
    return synthesizeGrokSpeech(line, choice.grokId);
  }
  if (choice.provider === 'openai') {
    if (!isOpenAiSpeechConfigured()) {
      const err = new Error('This OpenAI voice needs an OpenAI API key in Settings → Jarvis.');
      err.code = 'NO_OPENAI';
      throw err;
    }
    return synthesizeOpenAiSpeech(spoken, choice.openaiId);
  }
  return synthesizeLocalSpeech(spoken, choice.sayName);
}
