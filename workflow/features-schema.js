/**
 * CORE-033 — FEATURES.md Depends-column schema helpers.
 * Deterministic migrate Notes → Depends; optional AI repair for broken files.
 */

import {
  contentHasDependsHeader,
  extractPreambleAndPostamble,
  parseFeaturesMd,
  serializeToMarkdown,
} from '../parser.js';
import {
  extractDependsOnFromNotes,
  extractFeatureIds,
  normalizeFeatureId,
} from './feature-relations.js';
import {
  isGrokSpeechConfigured,
  isOpenAiSpeechConfigured,
  openaiApiKey,
  xaiApiKey,
} from './jarvis-voice.js';

const GROK_CHAT_URL = 'https://api.x.ai/v1/chat/completions';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const GROK_MODELS = ['grok-4-fast-non-reasoning', 'grok-4-1-fast-non-reasoning', 'grok-3-mini'];
const OPENAI_MODEL = 'gpt-4o-mini';

const REPAIR_PROMPT = [
  'Rewrite the user FEATURES.md into the Kanban standard format.',
  'Keep every feature row and all useful text. Do not invent feature IDs.',
  'Required sections: Status Legend (optional keep), "## Feature Categories", category ### headings, markdown tables, "## How to Use This File".',
  'Every feature table MUST use exactly these columns in order:',
  'Feature ID | Title | Description | Phase | Status | Assignee | Plan Document | Depends | Notes',
  'Depends cells: comma-separated IDs like CORE-017, AGENT-001, or -.',
  'If Notes contains "Depends on …", move those IDs into Depends and remove the Depends phrases from Notes.',
  'Return ONLY the full markdown file. No code fences, no commentary.',
].join('\n');

export function formatDependsCell(ids) {
  const unique = [];
  const seen = new Set();
  for (const raw of ids || []) {
    const id = normalizeFeatureId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique.length ? unique.join(', ') : '-';
}

export function parseDependsCell(text, excludeId) {
  return extractFeatureIds(text || '', { excludeId: excludeId ? normalizeFeatureId(excludeId) : undefined });
}

export function stripDependsPhrasesFromNotes(notes) {
  let text = String(notes || '').trim();
  if (!text || text === '-') return text || '';
  text = text.replace(/\bdepends\s+on\s+[^.;\n]+[.;]?/gi, ' ');
  text = text.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
  text = text.replace(/^[.;,\s]+|[.;,\s]+$/g, '').trim();
  return text;
}

export function normalizeFeatureDepends(feature) {
  if (!feature) return false;
  const id = feature.featureId;
  const fromField = parseDependsCell(feature.depends, id);
  const fromNotes = extractDependsOnFromNotes(feature.notes, id);
  const merged = formatDependsCell([...fromField, ...fromNotes]);
  const cleanedNotes = stripDependsPhrasesFromNotes(feature.notes);
  const beforeDepends = feature.depends && String(feature.depends).trim() ? String(feature.depends).trim() : '-';
  const beforeNotes = String(feature.notes || '');
  feature.depends = merged;
  feature.notes = cleanedNotes;
  return beforeDepends !== merged || beforeNotes !== cleanedNotes;
}

export function appendDependsOn(feature, targetId) {
  const id = normalizeFeatureId(targetId);
  if (!id) throw new Error('Invalid dependency feature id');
  const current = parseDependsCell(feature.depends, feature.featureId);
  if (!current.includes(id)) current.push(id);
  feature.depends = formatDependsCell(current);
  feature.notes = stripDependsPhrasesFromNotes(feature.notes);
  return feature;
}

export function countParsedFeatures(parsed) {
  let n = 0;
  for (const cat of parsed?.categories || []) n += (cat.features || []).length;
  return n;
}

export function looksLikeFeatureTracker(content) {
  const text = String(content || '');
  return text.includes('## Feature Categories')
    || /\|\s*Feature ID\s*\|/i.test(text)
    || /\b[A-Z]{2,8}-\d{3}\b/.test(text);
}

/**
 * Deterministic ensure: Depends column + migrate Notes → Depends.
 */
export function ensureFeaturesSchema(content) {
  const source = String(content || '');
  const parsed = parseFeaturesMd(source);
  const { preamble, postamble } = extractPreambleAndPostamble(source);
  let changed = !contentHasDependsHeader(source);

  for (const cat of parsed.categories || []) {
    for (const feature of cat.features || []) {
      if (normalizeFeatureDepends(feature)) changed = true;
    }
  }

  if (!changed && countParsedFeatures(parsed) === 0) {
    return { content: source, changed: false, method: 'none', featureCount: 0 };
  }

  if (!changed) {
    return { content: source, changed: false, method: 'none', featureCount: countParsedFeatures(parsed) };
  }

  const next = serializeToMarkdown(parsed, preamble, postamble);
  return {
    content: next,
    changed: next !== source,
    method: 'deterministic',
    featureCount: countParsedFeatures(parsed),
  };
}

export function needsAiSchemaRepair(content, validateFn) {
  const source = String(content || '');
  if (!looksLikeFeatureTracker(source)) return false;
  if (typeof validateFn === 'function') {
    const validated = validateFn(source);
    if (!validated?.ok) return true;
  }
  const parsed = parseFeaturesMd(source);
  if (countParsedFeatures(parsed) > 0) return false;
  return /\|\s*Feature ID\s*\|/i.test(source) || /\b[A-Z]{2,8}-\d{3}\b/.test(source);
}

function extractMarkdownPayload(text) {
  let out = String(text || '').trim();
  const fenced = out.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i);
  if (fenced) out = fenced[1].trim();
  return out;
}

async function chatCompletion({ url, key, model, models, userContent }) {
  const candidates = models && models.length ? models : [model];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: candidate,
          temperature: 0.1,
          messages: [
            { role: 'system', content: REPAIR_PROMPT },
            { role: 'user', content: userContent.slice(0, 120000) },
          ],
        }),
      });
      if (!res.ok) {
        lastError = new Error(`LLM HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text) return extractMarkdownPayload(text);
      lastError = new Error('Empty LLM response');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('LLM repair failed');
}

export function isSchemaRepairConfigured() {
  return isOpenAiSpeechConfigured() || isGrokSpeechConfigured();
}

/**
 * AI rewrite of a broken FEATURES.md into the standard schema.
 */
export async function repairFeaturesSchemaWithAi(content, { validateFn } = {}) {
  if (!isSchemaRepairConfigured()) {
    throw new Error('AI schema repair needs an OpenAI or xAI/Grok API key in Settings.');
  }

  let repaired;
  if (isOpenAiSpeechConfigured()) {
    repaired = await chatCompletion({
      url: OPENAI_CHAT_URL,
      key: openaiApiKey(),
      model: OPENAI_MODEL,
      userContent: content,
    });
  } else {
    repaired = await chatCompletion({
      url: GROK_CHAT_URL,
      key: xaiApiKey(),
      models: GROK_MODELS,
      userContent: content,
    });
  }

  if (typeof validateFn === 'function') {
    const validated = validateFn(repaired);
    if (!validated?.ok) {
      throw new Error(validated.error || 'AI repair produced an invalid FEATURES.md');
    }
  }

  const ensured = ensureFeaturesSchema(repaired);
  const parsed = parseFeaturesMd(ensured.content);
  if (countParsedFeatures(parsed) === 0) {
    throw new Error('AI repair produced no feature rows');
  }

  return {
    content: ensured.content,
    changed: true,
    method: 'ai',
    featureCount: countParsedFeatures(parsed),
  };
}
