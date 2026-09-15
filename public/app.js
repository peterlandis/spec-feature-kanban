/**
 * Features Kanban - Client
 */

const API = '/api';
const COL_WIP = '__work_in_progress__';
const COL_COMPLETE = '__complete__';

let state = {
  categories: [],
  preamble: '',
  postamble: '',
};

let uiState = {
  mainView: 'board',
  graphMode: (typeof localStorage !== 'undefined' && localStorage.getItem('graphMode') === '2d') ? '2d' : '3d',
  searchQuery: '',
  workspaceFeatureId: null,
  workspaceTab: 'plan',
  artifactView: { plan: 'preview', tasks: 'preview' },
  shipDraftDirty: false,
  shipDraftFeatureId: null,
  settingsTab: 'ide',
};

let configState = {
  featuresPath: null,
  usingEnvOverride: false,
  candidates: [],
  browseSupported: false,
  cursorConfigured: false,
  cursorModel: '',
  cursorModels: [],
  cursorModelsUpdatedAt: '',
  cursorModelsError: '',
  githubConfigured: false,
  githubTokenHint: '',
  githubTokenSource: 'none',
  xaiConfigured: false,
  xaiKeyHint: '',
  xaiKeySource: 'none',
  openaiConfigured: false,
  openaiKeyHint: '',
  openaiKeySource: 'none',
  jarvisVoiceId: 'local:daniel',
  jarvisVoices: [],
};

let workspacePollTimer = null;
let processPollTimer = null;
let graphHoveredFeatureId = null;
let graphRenderCache = { edgeList: [], features: [], positions: new Map() };
let graphResizeObserver = null;
let graphViewport = { scale: 1, x: 0, y: 0 };
let graphPointer = { active: false, lastX: 0, lastY: 0, didPan: false };
let graph3dResizeObserver = null;
const GRAPH3D_DISTANCE_DEFAULT = 620;

let graph3d = {
  yaw: 0.42,
  pitch: 0.28,
  distance: GRAPH3D_DISTANCE_DEFAULT,
  panX: 0,
  panY: 0,
  autoRotate: true,
  grabbedId: null,
  hoverId: null,
  raf: 0,
  lastTs: 0,
  layoutKey: '',
  nodes: [],
  edges: [],
  features: [],
  pointer: { active: false, lastX: 0, lastY: 0, didDrag: false },
};

const GRAPH_ZOOM_MIN = 0.35;
const GRAPH_ZOOM_MAX = 5;

const GRAPH_EDGE_LEGEND = [
  { type: 'depends on', label: 'depends on', className: 'edge-depends-on' },
  { type: 'blocked by', label: 'blocked by', className: 'edge-blocked-by' },
  { type: 'same category', label: 'same category', className: 'edge-same-category', dashed: true },
  { type: 'plan link', label: 'plan link', className: 'edge-plan-link' },
];

const PROCESS_MAIN_TRACK = [
  { id: 'not-started', label: 'Not started' },
  { id: 'planning', label: 'Planning' },
  { id: 'plan-review', label: 'Plan review' },
  { id: 'coding', label: 'Coding' },
  { id: 'reviewing', label: 'Reviewing' },
  { id: 'ready-to-merge', label: 'Ready to merge' },
  { id: 'complete', label: 'Complete' },
];

const PROCESS_SIDE_TRACK = [
  { id: 'blocked', label: 'Blocked' },
  { id: 'paused', label: 'Paused' },
];

async function fetchConfig() {
  const res = await fetch(`${API}/config`);
  if (!res.ok) throw new Error('Failed to load config');
  return res.json();
}

async function fetchFeaturesFiles() {
  const res = await fetch(`${API}/features-files`);
  if (!res.ok) throw new Error('Failed to list FEATURES.md files');
  return res.json();
}

async function updateConfig(featuresPath) {
  const res = await fetch(`${API}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ featuresPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update FEATURES.md selection');
  }
  return res.json();
}

async function browseForFeaturesFile() {
  const res = await fetch(`${API}/browse-features`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to browse for FEATURES.md');
  }
  return res.json();
}

async function createFeaturesFile(fileName) {
  const res = await fetch(`${API}/create-features-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create features file');
  }
  return res.json();
}

async function fetchFeatures() {
  const res = await fetch(`${API}/features`);
  if (!res.ok) throw new Error('Failed to load features');
  return res.json();
}

async function saveFeatures(data) {
  const res = await fetch(`${API}/features`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save');
  }
}

function toast(message, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 2500);
}

function setSubtitle(text) {
  const el = document.getElementById('featuresSubtitle');
  if (!el) return;
  el.textContent = text;
}

function applyCursorConfig(cfg) {
  if (!cfg) return;
  if ('cursorConfigured' in cfg) configState.cursorConfigured = !!cfg.cursorConfigured;
  if ('cursorModel' in cfg) configState.cursorModel = cfg.cursorModel || '';
  if ('cursorKeyHint' in cfg) configState.cursorKeyHint = cfg.cursorKeyHint || '';
  if ('cursorKeySource' in cfg) configState.cursorKeySource = cfg.cursorKeySource || 'none';
  if ('cursorModels' in cfg) {
    configState.cursorModels = Array.isArray(cfg.cursorModels) ? cfg.cursorModels : [];
  }
  if ('cursorModelsUpdatedAt' in cfg) configState.cursorModelsUpdatedAt = cfg.cursorModelsUpdatedAt || '';
  if ('cursorModelsError' in cfg) configState.cursorModelsError = cfg.cursorModelsError || '';
}

function applyGithubConfig(cfg) {
  if (!cfg) return;
  if ('githubConfigured' in cfg) configState.githubConfigured = !!cfg.githubConfigured;
  if ('githubTokenHint' in cfg) configState.githubTokenHint = cfg.githubTokenHint || '';
  if ('githubTokenSource' in cfg) configState.githubTokenSource = cfg.githubTokenSource || 'none';
}

function syncJarvisVoiceWindow() {
  window.jarvisVoiceConfig = {
    voiceId: configState.jarvisVoiceId,
    voices: configState.jarvisVoices,
    xaiConfigured: configState.xaiConfigured,
    openaiConfigured: configState.openaiConfigured,
  };
}

function applyXaiConfig(cfg) {
  if (!cfg) return;
  if ('xaiConfigured' in cfg) configState.xaiConfigured = !!cfg.xaiConfigured;
  if ('xaiKeyHint' in cfg) configState.xaiKeyHint = cfg.xaiKeyHint || '';
  if ('xaiKeySource' in cfg) configState.xaiKeySource = cfg.xaiKeySource || 'none';
  if ('openaiConfigured' in cfg) configState.openaiConfigured = !!cfg.openaiConfigured;
  if ('openaiKeyHint' in cfg) configState.openaiKeyHint = cfg.openaiKeyHint || '';
  if ('openaiKeySource' in cfg) configState.openaiKeySource = cfg.openaiKeySource || 'none';
  if ('jarvisVoiceId' in cfg) configState.jarvisVoiceId = cfg.jarvisVoiceId || 'local:daniel';
  if ('jarvisVoices' in cfg) {
    configState.jarvisVoices = Array.isArray(cfg.jarvisVoices) ? cfg.jarvisVoices : [];
  }
  syncJarvisVoiceWindow();
}

function selectedJarvisVoice() {
  const select = document.getElementById('jarvisVoiceSelect');
  const id = (select && select.value) || configState.jarvisVoiceId || 'local:daniel';
  return (configState.jarvisVoices || []).find((voice) => voice.id === id) || {
    id,
    provider: id.startsWith('openai:') ? 'openai' : id.startsWith('grok:') ? 'grok' : id.startsWith('browser:') ? 'browser' : 'local',
    setup: id.startsWith('openai:') ? 'openai' : id.startsWith('grok:') ? 'xai' : 'none',
    hint: 'Choose a voice. Setup for that voice appears below.',
    label: id,
  };
}

function renderJarvisVoiceSelect() {
  const select = document.getElementById('jarvisVoiceSelect');
  if (!select) return;
  const voices = configState.jarvisVoices || [];
  const current = configState.jarvisVoiceId || 'local:daniel';
  const groups = [];
  voices.forEach((voice) => {
    let group = groups.find((item) => item.label === voice.group);
    if (!group) {
      group = { label: voice.group || 'Other', voices: [] };
      groups.push(group);
    }
    group.voices.push(voice);
  });
  select.innerHTML = '';
  groups.forEach((group) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    group.voices.forEach((voice) => {
      const suffix = voice.provider === 'local' && voice.available === false
        ? ' (not installed)'
        : voice.provider === 'grok' && !configState.xaiConfigured
          ? ' (needs xAI key)'
          : voice.provider === 'openai' && !configState.openaiConfigured
            ? ' (needs OpenAI key)'
            : '';
      optgroup.appendChild(new Option(`${voice.label}${suffix}`, voice.id));
    });
    select.appendChild(optgroup);
  });
  if (current && !voices.some((voice) => voice.id === current)) {
    select.appendChild(new Option(current, current));
  }
  select.value = current;
}

function renderXaiSettingsStatus() {
  renderJarvisVoiceSelect();
  const voice = selectedJarvisVoice();
  const hintEl = document.getElementById('jarvisVoiceHint');
  const localBox = document.getElementById('jarvisSetupNone');
  const grokBox = document.getElementById('jarvisSetupGrok');
  const openaiBox = document.getElementById('jarvisSetupOpenai');
  const localCopy = document.getElementById('jarvisSetupNoneCopy');
  const statusEl = document.getElementById('xaiSettingsStatus');
  const openaiStatusEl = document.getElementById('openaiSettingsStatus');
  if (hintEl) hintEl.textContent = voice.hint || 'Choose a voice. Setup for that voice appears below.';
  if (localBox) localBox.hidden = voice.setup !== 'none';
  if (grokBox) grokBox.hidden = voice.setup !== 'xai';
  if (openaiBox) openaiBox.hidden = voice.setup !== 'openai';
  if (localCopy) {
    if (voice.provider === 'local' && voice.available === false) {
      localCopy.textContent = `${voice.label} is not installed on this Mac. Download it in System Settings → Spoken Content, or pick another voice.`;
    } else {
      localCopy.textContent = voice.hint || 'This voice needs no extra setup.';
    }
  }
  if (statusEl) {
    if (!configState.xaiConfigured) {
      statusEl.textContent = 'No xAI key saved yet. Paste a key to use this Grok voice.';
    } else {
      const hint = configState.xaiKeyHint ? ` ending in ${configState.xaiKeyHint}` : '';
      const source = configState.xaiKeySource === 'env'
        ? 'from your terminal environment'
        : 'saved in this app';
      statusEl.textContent = `Grok speech ready${hint} (${source}).`;
    }
  }
  if (!openaiStatusEl) return;
  if (!configState.openaiConfigured) {
    openaiStatusEl.textContent = 'No OpenAI key saved yet. Paste a key to use this OpenAI voice.';
    return;
  }
  const openaiHint = configState.openaiKeyHint ? ` ending in ${configState.openaiKeyHint}` : '';
  const openaiSource = configState.openaiKeySource === 'env'
    ? 'from your terminal environment'
    : 'saved in this app';
  openaiStatusEl.textContent = `OpenAI speech ready${openaiHint} (${openaiSource}).`;
}

async function saveJarvisVoiceChoice(voiceId) {
  const res = await fetch(`${API}/xai-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voiceId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save Jarvis voice');
  }
  applyXaiConfig(await res.json());
  if (!configState.jarvisVoices.length) {
    await initConfigUi();
  } else {
    renderXaiSettingsStatus();
  }
  if (typeof window.syncJarvis === 'function') window.syncJarvis();
}

function formatModelsUpdatedAt(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function renderCursorModelSelect() {
  const select = document.getElementById('cursorModel');
  const hintEl = document.getElementById('cursorModelsHint');
  if (!select) return;
  const current = configState.cursorModel || '';
  const models = configState.cursorModels || [];
  const ids = new Set(models.map((m) => m.id));
  select.innerHTML = '';
  if (current && !ids.has(current)) {
    select.appendChild(new Option(`${current} (saved)`, current));
  }
  if (models.length === 0 && !current) {
    select.appendChild(new Option('Save a key, then refresh models', ''));
  }
  for (const model of models) {
    const label = model.displayName && model.displayName !== model.id
      ? `${model.displayName} (${model.id})`
      : model.id;
    select.appendChild(new Option(label, model.id));
  }
  select.value = current || (models[0] ? models[0].id : '');
  if (!hintEl) return;
  if (configState.cursorModelsError) {
    hintEl.textContent = configState.cursorModelsError;
    return;
  }
  if (models.length) {
    const when = formatModelsUpdatedAt(configState.cursorModelsUpdatedAt);
    hintEl.textContent = when
      ? `${models.length} models · updated ${when}`
      : `${models.length} models from Cursor`;
    return;
  }
  hintEl.textContent = 'Models refresh when the app starts after you save a key.';
}

function renderCursorSettingsStatus() {
  const statusEl = document.getElementById('cursorSettingsStatus');
  const cardEl = document.getElementById('cursorCardStatus');
  renderCursorModelSelect();
  if (cardEl) {
    cardEl.textContent = configState.cursorConfigured ? 'Configured' : 'Not configured';
    cardEl.classList.toggle('is-ready', !!configState.cursorConfigured);
  }
  if (!statusEl) return;
  if (!configState.cursorConfigured) {
    statusEl.textContent = 'No key saved yet. Paste one below and click Save and use.';
    return;
  }
  const hint = configState.cursorKeyHint ? ` ending in ${configState.cursorKeyHint}` : '';
  const source = configState.cursorKeySource === 'env'
    ? 'from your terminal environment'
    : 'saved in this app';
  statusEl.textContent = `Ready${hint} (${source}). You can start planning without exporting a variable.`;
}

function renderGithubSettingsStatus() {
  const statusEl = document.getElementById('githubSettingsStatus');
  const cardEl = document.getElementById('githubCardStatus');
  if (cardEl) {
    cardEl.textContent = configState.githubConfigured ? 'Configured' : 'Not configured';
    cardEl.classList.toggle('is-ready', !!configState.githubConfigured);
  }
  if (!statusEl) return;
  if (!configState.githubConfigured) {
    statusEl.textContent = 'No token saved yet. Paste one below and click Save and use.';
    return;
  }
  const hint = configState.githubTokenHint ? ` ending in ${configState.githubTokenHint}` : '';
  const source = configState.githubTokenSource === 'env'
    ? 'from your terminal environment'
    : 'saved in this app';
  statusEl.textContent = `Ready${hint} (${source}). Ship can create draft PRs without gh auth login.`;
}

function setSettingsTab(tab) {
  uiState.settingsTab = tab === 'github' || tab === 'jarvis' ? tab : 'ide';
  document.querySelectorAll('.settings-tab').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.settingsTab === uiState.settingsTab);
  });
  document.querySelectorAll('.settings-pane').forEach((pane) => {
    pane.classList.toggle('is-active', pane.dataset.settingsPane === uiState.settingsTab);
  });
}

function openSettings(tab) {
  const keyInput = document.getElementById('cursorApiKey');
  if (keyInput) {
    keyInput.value = '';
    keyInput.placeholder = configState.cursorKeyHint
      ? `Saved key ending in ${configState.cursorKeyHint}`
      : 'cursor_…';
  }
  const tokenInput = document.getElementById('githubToken');
  if (tokenInput) {
    tokenInput.value = '';
    tokenInput.placeholder = configState.githubTokenHint
      ? `Saved token ending in ${configState.githubTokenHint}`
      : 'ghp_… or github_pat_…';
  }
  const xaiInput = document.getElementById('xaiApiKey');
  if (xaiInput) {
    xaiInput.value = '';
    xaiInput.placeholder = configState.xaiKeyHint
      ? `Saved key ending in ${configState.xaiKeyHint}`
      : 'xai-…';
  }
  const openaiInput = document.getElementById('openaiApiKey');
  if (openaiInput) {
    openaiInput.value = '';
    openaiInput.placeholder = configState.openaiKeyHint
      ? `Saved key ending in ${configState.openaiKeyHint}`
      : 'sk-…';
  }
  renderCursorSettingsStatus();
  renderGithubSettingsStatus();
  renderXaiSettingsStatus();
  setSettingsTab(tab || uiState.settingsTab || 'ide');
  document.getElementById('settings').hidden = false;
  if (configState.cursorConfigured) {
    refreshCursorModels({ silent: true }).catch(() => {});
  }
}

function closeSettings() {
  document.getElementById('settings').hidden = true;
}

function openCursorSettings() {
  openSettings('ide');
}

function openGithubSettings() {
  openSettings('github');
}

async function saveGithubSettings(event) {
  event.preventDefault();
  const token = document.getElementById('githubToken').value.trim();
  if (!token) {
    toast('Paste a GitHub token first', 'error');
    return;
  }
  const res = await fetch(`${API}/github-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save GitHub token');
  }
  document.getElementById('githubToken').value = '';
  applyGithubConfig(await res.json());
  renderGithubSettingsStatus();
  if (uiState.workspaceFeatureId) {
    fetchWorkspace(uiState.workspaceFeatureId).then(renderWorkspace).catch(() => {});
  }
  toast('GitHub token saved. You can create a draft PR now.');
}

async function saveXaiSettings(event) {
  event.preventDefault();
  const apiKey = document.getElementById('xaiApiKey').value.trim();
  const voiceSelect = document.getElementById('jarvisVoiceSelect');
  const voiceId = (voiceSelect && voiceSelect.value) || configState.jarvisVoiceId;
  const payload = { voiceId };
  if (apiKey) payload.apiKey = apiKey;
  if (!apiKey && !configState.xaiConfigured) {
    toast('Paste an xAI API key first', 'error');
    return;
  }
  const res = await fetch(`${API}/xai-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save xAI key');
  }
  document.getElementById('xaiApiKey').value = '';
  applyXaiConfig(await res.json());
  renderXaiSettingsStatus();
  toast('xAI key saved. Preview the Grok voice.');
}

async function clearXaiSettings() {
  const ok = window.confirm('Remove the xAI key saved in this app?');
  if (!ok) return;
  const res = await fetch(`${API}/xai-settings`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to remove xAI key');
  }
  document.getElementById('xaiApiKey').value = '';
  applyXaiConfig(await res.json());
  renderXaiSettingsStatus();
  toast('Saved xAI key removed');
}

async function saveOpenAiSettings(event) {
  event.preventDefault();
  const apiKey = document.getElementById('openaiApiKey').value.trim();
  const voiceSelect = document.getElementById('jarvisVoiceSelect');
  const voiceId = (voiceSelect && voiceSelect.value) || configState.jarvisVoiceId;
  const payload = { voiceId };
  if (apiKey) payload.apiKey = apiKey;
  if (!apiKey && !configState.openaiConfigured) {
    toast('Paste an OpenAI API key first', 'error');
    return;
  }
  const res = await fetch(`${API}/openai-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save OpenAI key');
  }
  document.getElementById('openaiApiKey').value = '';
  applyXaiConfig(await res.json());
  renderXaiSettingsStatus();
  toast('OpenAI key saved. Preview the OpenAI voice.');
}

async function clearOpenAiSettings() {
  const ok = window.confirm('Remove the OpenAI key saved in this app?');
  if (!ok) return;
  const res = await fetch(`${API}/openai-settings`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to remove OpenAI key');
  }
  document.getElementById('openaiApiKey').value = '';
  applyXaiConfig(await res.json());
  renderXaiSettingsStatus();
  toast('Saved OpenAI key removed');
}

async function clearGithubSettings() {
  const ok = window.confirm('Remove the GitHub token saved in this app?');
  if (!ok) return;
  const res = await fetch(`${API}/github-settings`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to remove GitHub token');
  }
  document.getElementById('githubToken').value = '';
  applyGithubConfig(await res.json());
  renderGithubSettingsStatus();
  if (uiState.workspaceFeatureId) {
    fetchWorkspace(uiState.workspaceFeatureId).then(renderWorkspace).catch(() => {});
  }
  toast('Saved GitHub token removed');
}

async function saveCursorSettings(event) {
  event.preventDefault();
  const apiKey = document.getElementById('cursorApiKey').value.trim();
  const model = document.getElementById('cursorModel').value.trim();
  const payload = {};
  if (apiKey) payload.apiKey = apiKey;
  if (model) payload.model = model;
  if (!apiKey && !configState.cursorConfigured) {
    toast('Paste a Cursor API key first', 'error');
    return;
  }
  if (!apiKey && !model) {
    toast('Enter a key or pick a model to save', 'error');
    return;
  }
  const res = await fetch(`${API}/cursor-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save Cursor key');
  }
  document.getElementById('cursorApiKey').value = '';
  await initConfigUi();
  if (apiKey) {
    await refreshCursorModels({ silent: true }).catch(() => {});
  }
  toast('Cursor key saved. You can start planning now.');
}

async function refreshCursorModels({ silent } = {}) {
  const hintEl = document.getElementById('cursorModelsHint');
  const refreshBtn = document.getElementById('refreshCursorModels');
  if (hintEl) hintEl.textContent = 'Refreshing models from Cursor…';
  if (refreshBtn) refreshBtn.disabled = true;
  try {
    const res = await fetch(`${API}/cursor-models/refresh`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    applyCursorConfig({
      ...body,
      cursorModelsError: body.error || body.cursorModelsError || '',
    });
    renderCursorSettingsStatus();
    if (!res.ok) {
      throw new Error(body.error || 'Failed to refresh Cursor models');
    }
    if (!silent) {
      toast(body.cursorModels && body.cursorModels.length
        ? `Loaded ${body.cursorModels.length} Cursor models`
        : (body.error || 'No models returned'));
    }
  } catch (err) {
    renderCursorSettingsStatus();
    throw err;
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

async function clearCursorSettings() {
  const ok = window.confirm('Remove the Cursor API key saved in this app?');
  if (!ok) return;
  const res = await fetch(`${API}/cursor-settings`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to remove Cursor key');
  }
  document.getElementById('cursorApiKey').value = '';
  await initConfigUi();
  toast('Saved Cursor key removed');
}

function renderFeaturesFileSelector() {
  const select = document.getElementById('featuresFileSelect');
  const applyBtn = document.getElementById('applyFeaturesFile');
  const browseBtn = document.getElementById('browseFeaturesFile');
  const createBtn = document.getElementById('createFeaturesFile');
  if (!select || !applyBtn || !browseBtn || !createBtn) return;

  const candidates = Array.from(new Set(configState.candidates || [])).sort();
  select.innerHTML = '';

  // Active path might not be in candidates (e.g., absolute outside the repo).
  const active = configState.featuresPath;
  const hasActiveInList = active && candidates.includes(active);
  if (active && !hasActiveInList) {
    select.appendChild(new Option(active, active));
  }
  for (const c of candidates) {
    select.appendChild(new Option(c, c));
  }

  if (!active && candidates.length === 0) {
    select.appendChild(new Option('FEATURES.md', 'FEATURES.md'));
  }

  if (active) {
    select.value = hasActiveInList ? active : active;
  } else {
    select.value = candidates[0] || 'FEATURES.md';
  }

  setSubtitle(`Managing ${active || 'FEATURES.md'}`);

  const disabled = !!configState.usingEnvOverride;
  select.disabled = disabled;
  applyBtn.disabled = disabled;
  browseBtn.disabled = disabled || !configState.browseSupported;
  createBtn.disabled = disabled;
  if (disabled) {
    applyBtn.title = 'FEATURES_PATH env override is set';
    browseBtn.title = 'FEATURES_PATH env override is set';
    createBtn.title = 'FEATURES_PATH env override is set';
  } else if (!configState.browseSupported) {
    browseBtn.title = 'Browse is not supported in this environment';
    createBtn.title = '';
  } else {
    applyBtn.title = '';
    browseBtn.title = '';
    createBtn.title = '';
  }
}

async function initConfigUi() {
  try {
    const [cfg, files] = await Promise.all([fetchConfig(), fetchFeaturesFiles()]);
    configState = {
      featuresPath: cfg.featuresPath,
      usingEnvOverride: !!cfg.usingEnvOverride,
      candidates: files.candidates || [],
      browseSupported: !!cfg.browseSupported,
      cursorConfigured: !!cfg.cursorConfigured,
      cursorModel: cfg.cursorModel || '',
      cursorKeyHint: cfg.cursorKeyHint || '',
      cursorKeySource: cfg.cursorKeySource || 'none',
      cursorModels: Array.isArray(cfg.cursorModels) ? cfg.cursorModels : [],
      cursorModelsUpdatedAt: cfg.cursorModelsUpdatedAt || '',
      cursorModelsError: cfg.cursorModelsError || '',
      githubConfigured: !!cfg.githubConfigured,
      githubTokenHint: cfg.githubTokenHint || '',
      githubTokenSource: cfg.githubTokenSource || 'none',
      xaiConfigured: !!cfg.xaiConfigured,
      xaiKeyHint: cfg.xaiKeyHint || '',
      xaiKeySource: cfg.xaiKeySource || 'none',
      openaiConfigured: !!cfg.openaiConfigured,
      openaiKeyHint: cfg.openaiKeyHint || '',
      openaiKeySource: cfg.openaiKeySource || 'none',
      jarvisVoiceId: cfg.jarvisVoiceId || 'local:daniel',
      jarvisVoices: Array.isArray(cfg.jarvisVoices) ? cfg.jarvisVoices : [],
    };
    syncJarvisVoiceWindow();
    renderFeaturesFileSelector();
    renderCursorSettingsStatus();
    renderGithubSettingsStatus();
    renderXaiSettingsStatus();
    if (typeof window.syncJarvis === 'function') window.syncJarvis();
    if (configState.cursorConfigured) {
      refreshCursorModels({ silent: true }).catch(() => {});
    }
  } catch (err) {
    setSubtitle('Failed to load FEATURES.md selection');
    toast(err.message || 'Failed to load config', 'error');
  }
}

function getColumnKey(cat) {
  if (cat === COL_WIP) return COL_WIP;
  if (cat === COL_COMPLETE) return COL_COMPLETE;
  return cat;
}

function getFeaturesForColumn(columnKey) {
  if (columnKey === COL_WIP) {
    const features = state.categories.flatMap((c) =>
      c.features.filter((f) => f.status === '🔨 WorkInProgress')
    );
    return applySearch(features);
  }
  if (columnKey === COL_COMPLETE) {
    const features = state.categories.flatMap((c) =>
      c.features.filter((f) => f.status === '✅ Complete')
    );
    return applySearch(features);
  }
  const cat = state.categories.find((c) => c.title === columnKey);
  if (!cat) return [];
  const features = cat.features.filter(
    (f) => f.status !== '🔨 WorkInProgress' && f.status !== '✅ Complete'
  );
  return applySearch(features);
}

function normalizeQuery(query) {
  return (query || '').trim().toLowerCase();
}

function featureSearchText(feature) {
  const parts = [
    feature.featureId,
    feature.title,
    feature.description,
    feature.phase,
    feature.status,
    feature.assignee,
    feature.planDocument,
    feature.notes,
    feature.categoryTitle,
  ];
  return parts
    .filter((p) => p && p !== '-')
    .join(' ')
    .toLowerCase();
}

function applySearch(features) {
  const q = normalizeQuery(uiState.searchQuery);
  if (!q) return features;
  const terms = q.split(/\s+/).filter(Boolean);
  return features.filter((f) => {
    const haystack = featureSearchText(f);
    return terms.every((t) => haystack.includes(t));
  });
}

function getAllFeatures() {
  return state.categories.flatMap((category) =>
    (category.features || []).map((feature) => ({
      ...feature,
      categoryTitle: feature.categoryTitle || category.title,
    })),
  );
}

function anyFeatureLive(features) {
  return features.some((f) => f.runStatus === 'starting' || f.runStatus === 'running');
}

function stopProcessPolling() {
  if (processPollTimer) {
    clearInterval(processPollTimer);
    processPollTimer = null;
  }
}

function isAlternateMainViewActive() {
  if (uiState.mainView === 'process') {
    const el = document.getElementById('processView');
    return el && !el.hidden;
  }
  if (uiState.mainView === 'graph') {
    const el = document.getElementById('graphView');
    return el && !el.hidden;
  }
  return false;
}

function syncLiveViewPolling(anyLive) {
  const shouldPoll = !!anyLive && isAlternateMainViewActive();
  if (shouldPoll && !processPollTimer) {
    processPollTimer = setInterval(() => {
      if (!isAlternateMainViewActive()) return;
      load().catch(() => {});
    }, 1000);
  }
  if (!shouldPoll) stopProcessPolling();
}

function syncViewToggleButtons() {
  const view = uiState.mainView;
  const boardBtn = document.getElementById('viewBoard');
  const processBtn = document.getElementById('viewProcess');
  const graphBtn = document.getElementById('viewGraph');
  if (boardBtn) {
    boardBtn.classList.toggle('is-active', view === 'board');
    boardBtn.setAttribute('aria-pressed', String(view === 'board'));
  }
  if (processBtn) {
    processBtn.classList.toggle('is-active', view === 'process');
    processBtn.setAttribute('aria-pressed', String(view === 'process'));
  }
  if (graphBtn) {
    graphBtn.classList.toggle('is-active', view === 'graph');
    graphBtn.setAttribute('aria-pressed', String(view === 'graph'));
  }
}

function syncGraphModeButtons() {
  const mode = uiState.graphMode === '3d' ? '3d' : '2d';
  const twoD = document.getElementById('graphMode2d');
  const threeD = document.getElementById('graphMode3d');
  if (twoD) {
    twoD.classList.toggle('is-active', mode === '2d');
    twoD.setAttribute('aria-pressed', String(mode === '2d'));
  }
  if (threeD) {
    threeD.classList.toggle('is-active', mode === '3d');
    threeD.setAttribute('aria-pressed', String(mode === '3d'));
  }
}

function setGraphMode(mode) {
  uiState.graphMode = mode === '3d' ? '3d' : '2d';
  try {
    localStorage.setItem('graphMode', uiState.graphMode);
  } catch (_) { /* ignore */ }
  if (uiState.graphMode !== '3d') stopGraph3dLoop();
  if (uiState.mainView === 'graph') renderGraphPage();
}

function setMainView(view) {
  if (view === 'process' || view === 'graph') {
    uiState.mainView = view;
  } else {
    uiState.mainView = 'board';
  }
  if (uiState.mainView !== 'graph' || uiState.graphMode !== '3d') stopGraph3dLoop();
  renderMainView();
}

function renderGraphPage() {
  const graph2d = document.getElementById('featureGraph');
  const graph3dEl = document.getElementById('featureGraph3d');
  const lead = document.getElementById('graphLead');
  const mode3d = uiState.graphMode === '3d';
  if (graph2d) graph2d.hidden = mode3d;
  if (graph3dEl) graph3dEl.hidden = !mode3d;
  if (lead) {
    lead.textContent = mode3d
      ? 'A rotating 3D perspective of every tracked feature. Scroll or use +/− to zoom, grab a node to stop the spin and inspect it in depth, then drag to orbit. Click a node to open its workspace. This view never starts agents.'
      : 'A network of every tracked feature. Scroll to zoom, drag to pan, hover a node to see its links, click to open its workspace. This view never starts agents.';
  }
  syncGraphModeButtons();
  if (mode3d) renderFeatureGraph3d();
  else renderFeatureGraph();
  if (typeof window.syncJarvis === 'function') window.syncJarvis();
}

function jarvisSnapshot() {
  return {
    features: applySearch(getAllFeatures()),
    graph: state.graph || { edges: [] },
  };
}

function jarvisHighlight(ids) {
  const id = Array.isArray(ids) && ids.length ? ids[0] : null;
  if (!id) return;
  if (uiState.graphMode === '3d') pauseGraph3dSpin(id);
  else setGraphFocus(id);
}

async function jarvisExecuteConfirm(action, featureId) {
  const paths = {
    startPlanning: '/start-planning',
    approvePlan: '/approve-plan',
    startImplement: '/implement',
  };
  const path = paths[action];
  if (!path) throw new Error('That gate is not available from Jarvis.');
  const body = { confirmed: true };
  if (action === 'startPlanning' || action === 'startImplement') {
    const model = selectedWorkspaceModel();
    if (model) body.model = model;
  }
  const res = await fetch(`${API}/features/${encodeURIComponent(featureId)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Confirm failed');
  }
  await load();
}

function renderMainView() {
  const view = uiState.mainView;
  const columns = document.getElementById('columns');
  const processView = document.getElementById('processView');
  const graphView = document.getElementById('graphView');
  if (columns) columns.hidden = view !== 'board';
  if (processView) processView.hidden = view !== 'process';
  if (graphView) graphView.hidden = view !== 'graph';
  syncViewToggleButtons();
  if (view === 'process') renderProcess();
  else if (view === 'graph') renderGraphPage();
  else {
    stopProcessPolling();
    renderColumns();
  }
}

function renderProcessOccupant(feature) {
  const live = feature.runStatus === 'starting' || feature.runStatus === 'running';
  const waiting = !!feature.waitingOnHuman && !live;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'process-occupant';
  if (live) btn.classList.add('is-live');
  if (waiting) btn.classList.add('is-waiting');
  const badge = live
    ? '<span class="process-run-badge" aria-hidden="true">Run</span>'
    : '';
  const activity = feature.activityLine
    ? `<span class="process-activity">${escapeHtml(feature.activityLine)}</span>`
    : '';
  const sr = live ? 'Live agent. ' : (waiting ? 'Waiting on human. ' : '');
  btn.setAttribute('aria-label', `${sr}${feature.featureId}: ${feature.title || feature.featureId}`);
  btn.innerHTML = `
    <span class="process-occupant-top">
      <span class="process-occupant-id">${escapeHtml(feature.featureId)}</span>
      ${badge}
    </span>
    <span class="process-occupant-title">${escapeHtml(feature.title || '')}</span>
    ${activity}
  `;
  btn.addEventListener('click', () => {
    openWorkspace(feature.featureId).catch((err) => toast(err.message || 'Failed to open workspace', 'error'));
  });
  return btn;
}

function buildProcessStageNode(stage, occupants) {
  const count = occupants.length;
  const stageLive = occupants.some((f) => f.runStatus === 'starting' || f.runStatus === 'running');
  const stageWaiting = occupants.some((f) => f.waitingOnHuman && f.runStatus !== 'starting' && f.runStatus !== 'running');

  const node = document.createElement('div');
  node.className = 'process-stage';
  node.dataset.stage = stage.id;
  if (stageLive) node.classList.add('is-live');
  if (stageWaiting && !stageLive) node.classList.add('is-waiting');

  let ariaExtra = '';
  if (stageLive) ariaExtra += ', live agent';
  if (stageWaiting) ariaExtra += ', waiting on human';
  node.setAttribute(
    'aria-label',
    `${stage.label}, ${count} feature${count === 1 ? '' : 's'}${ariaExtra}`,
  );

  const header = document.createElement('div');
  header.className = 'process-stage-header';
  header.innerHTML = `
    <span class="process-stage-name">${escapeHtml(stage.label)}</span>
    <span class="process-stage-count" aria-hidden="true">${count}</span>
  `;
  if (stageLive) {
    const liveCue = document.createElement('span');
    liveCue.className = 'process-live-cue';
    liveCue.textContent = 'Live';
    liveCue.setAttribute('aria-hidden', 'true');
    header.appendChild(liveCue);
  } else if (stageWaiting) {
    const waitCue = document.createElement('span');
    waitCue.className = 'process-wait-cue';
    waitCue.textContent = 'Waiting';
    waitCue.setAttribute('aria-hidden', 'true');
    header.appendChild(waitCue);
  }
  node.appendChild(header);

  const list = document.createElement('div');
  list.className = 'process-occupants';
  for (const feature of occupants) {
    list.appendChild(renderProcessOccupant(feature));
  }
  node.appendChild(list);
  return node;
}

function renderProcess() {
  const graph = document.getElementById('processGraph');
  if (!graph) return;

  const features = applySearch(getAllFeatures());
  const byStage = new Map();
  for (const stage of [...PROCESS_MAIN_TRACK, ...PROCESS_SIDE_TRACK]) {
    byStage.set(stage.id, []);
  }
  for (const feature of features) {
    const stageId = feature.graphStage || 'not-started';
    if (!byStage.has(stageId)) byStage.set(stageId, []);
    byStage.get(stageId).push(feature);
  }

  graph.innerHTML = '';

  const mainRow = document.createElement('div');
  mainRow.className = 'process-main-track';
  PROCESS_MAIN_TRACK.forEach((stage, index) => {
    if (index > 0) {
      const edge = document.createElement('div');
      edge.className = 'process-edge';
      edge.setAttribute('aria-hidden', 'true');
      edge.textContent = '→';
      mainRow.appendChild(edge);
    }
    mainRow.appendChild(buildProcessStageNode(stage, byStage.get(stage.id) || []));
  });

  const revise = document.createElement('div');
  revise.className = 'process-revise-hints';
  revise.setAttribute('aria-hidden', 'true');
  revise.innerHTML = `
    <span class="process-revise">Plan review ↺ Planning (revise plan)</span>
    <span class="process-revise">Reviewing ↺ Coding (revise code or docs)</span>
  `;

  const sideRow = document.createElement('div');
  sideRow.className = 'process-side-track';
  for (const stage of PROCESS_SIDE_TRACK) {
    sideRow.appendChild(buildProcessStageNode(stage, byStage.get(stage.id) || []));
  }

  const blockedLinks = document.createElement('p');
  blockedLinks.className = 'process-side-note';
  blockedLinks.setAttribute('aria-hidden', 'true');
  blockedLinks.textContent = 'Blocked and Paused can be reached from active work (dashed paths in the plan topology).';

  graph.append(mainRow, revise, sideRow, blockedLinks);
  syncLiveViewPolling(anyFeatureLive(features));
}

function truncateGraphTitle(title, maxLen = 28) {
  const t = String(title || '').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

function graph3dFeatureCaption(feature, maxLen = 28) {
  const title = String((feature && feature.title) || '').trim();
  const description = String((feature && feature.description) || '').trim();
  return truncateGraphTitle(title || description, maxLen);
}

function shortCategoryLabel(categoryTitle) {
  const raw = String(categoryTitle || 'Uncategorized').trim();
  const withoutEmoji = raw.replace(/^[\s\p{Extended_Pictographic}\uFE0F]+/u, '').trim();
  return withoutEmoji || raw;
}

function graphNodeTone(feature) {
  const status = feature.status || '';
  if (feature.runStatus === 'starting' || feature.runStatus === 'running') return 'live';
  if (feature.waitingOnHuman) return 'waiting';
  if (status.includes('Blocked')) return 'blocked';
  if (status.includes('Complete')) return 'complete';
  if ((feature.categoryTitle || '').toLowerCase().includes('agent')) return 'agent';
  return 'core';
}

function graphNodeDegree(featureId, edges) {
  let n = 0;
  for (const edge of edges) {
    if (edge.from === featureId || edge.to === featureId) n += 1;
  }
  return n;
}

function layoutFeatureNetwork(features, edges, width, height) {
  const count = features.length;
  const positions = new Map();
  if (!count) return positions;
  const cx = width / 2;
  const cy = height / 2;
  const nodes = features.map((feature, index) => {
    const angle = ((2 * Math.PI * index) / count) - (Math.PI / 2);
    const ring = 0.22 + (index % 4) * 0.11;
    const radius = Math.min(width, height) * ring;
    return {
      id: feature.featureId,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const springs = edges.map((edge) => ({
    a: byId.get(edge.from),
    b: byId.get(edge.to),
    k: edge.type === 'same category' ? 0.014 : edge.type === 'depends on' ? 0.05 : 0.028,
    len: edge.type === 'same category' ? 88 : 150,
  })).filter((spring) => spring.a && spring.b);

  const iterations = 100;
  for (let step = 0; step < iterations; step += 1) {
    const cool = 0.9 - (step / iterations) * 0.35;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
        const distSq = (dx * dx) + (dy * dy) || 1;
        const dist = Math.sqrt(distSq);
        const force = 2800 / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }
    for (const spring of springs) {
      const dx = spring.b.x - spring.a.x;
      const dy = spring.b.y - spring.a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const pull = spring.k * (dist - spring.len);
      const fx = (dx / dist) * pull;
      const fy = (dy / dist) * pull;
      spring.a.vx += fx;
      spring.a.vy += fy;
      spring.b.vx -= fx;
      spring.b.vy -= fy;
    }
    const pad = 42;
    for (const node of nodes) {
      node.vx += (cx - node.x) * 0.01;
      node.vy += (cy - node.y) * 0.01;
      node.vx *= cool;
      node.vy *= cool;
      node.x += node.vx;
      node.y += node.vy;
      node.x = Math.min(width - pad, Math.max(pad, node.x));
      node.y = Math.min(height - pad, Math.max(pad, node.y));
    }
  }
  for (const node of nodes) {
    positions.set(node.id, { x: node.x, y: node.y });
  }
  return positions;
}

function renderGraphLegend(targetId = 'graphLegend') {
  const legend = document.getElementById(targetId);
  if (!legend) return;
  legend.innerHTML = GRAPH_EDGE_LEGEND.map((item) => `
    <span class="graph-legend-item">
      <span class="graph-legend-swatch ${item.dashed ? 'is-same-category' : ''} ${item.className}" aria-hidden="true"></span>
      <span>${escapeHtml(item.label)}</span>
    </span>
  `).join('');
}

function setGraphFocus(featureId) {
  graphHoveredFeatureId = featureId || null;
  applyGraphFocusHighlight();
}

function applyGraphFocusHighlight() {
  const root = document.getElementById('featureGraph');
  if (!root) return;
  const edges = graphRenderCache.edgeList || [];
  const focusId = graphHoveredFeatureId;
  const neighborIds = new Set();
  if (focusId) {
    for (const edge of edges) {
      if (edge.from === focusId) neighborIds.add(edge.to);
      if (edge.to === focusId) neighborIds.add(edge.from);
    }
  }
  root.querySelectorAll('.feature-graph-node').forEach((node) => {
    const id = node.dataset.featureId;
    node.classList.remove('is-selected', 'is-dimmed', 'is-neighbor');
    if (!focusId) return;
    if (id === focusId) node.classList.add('is-selected');
    else if (neighborIds.has(id)) node.classList.add('is-neighbor');
    else node.classList.add('is-dimmed');
  });
  root.querySelectorAll('.feature-graph-link').forEach((link) => {
    const touches = focusId && (link.dataset.from === focusId || link.dataset.to === focusId);
    link.classList.toggle('is-dimmed', !!(focusId && !touches));
    link.classList.toggle('is-hot', !!touches);
  });
  root.querySelectorAll('.feature-graph-edge-label').forEach((label) => {
    const touches = focusId && (label.dataset.from === focusId || label.dataset.to === focusId);
    label.classList.toggle('is-visible', !!touches);
  });
}

function edgeTouchesFocus(edge, focusId) {
  if (!focusId) return false;
  return edge.from === focusId || edge.to === focusId;
}

function clampGraphScale(scale) {
  return Math.min(GRAPH_ZOOM_MAX, Math.max(GRAPH_ZOOM_MIN, scale));
}

function resetGraphViewport() {
  graphViewport = { scale: 1, x: 0, y: 0 };
}

function applyGraphViewport() {
  const viewport = document.querySelector('.feature-graph-viewport');
  if (!viewport) return;
  viewport.setAttribute(
    'transform',
    `translate(${graphViewport.x} ${graphViewport.y}) scale(${graphViewport.scale})`,
  );
  const label = document.getElementById('graphZoomLabel');
  if (label) label.textContent = `${Math.round(graphViewport.scale * 100)}%`;
}

function graphClientToSvg(svg, clientX, clientY) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const mapped = point.matrixTransform(ctm.inverse());
  return { x: mapped.x, y: mapped.y };
}

function zoomGraphAt(svg, nextScale, origin) {
  const scale = clampGraphScale(nextScale);
  const worldX = (origin.x - graphViewport.x) / graphViewport.scale;
  const worldY = (origin.y - graphViewport.y) / graphViewport.scale;
  graphViewport.scale = scale;
  graphViewport.x = origin.x - (worldX * scale);
  graphViewport.y = origin.y - (worldY * scale);
  applyGraphViewport();
}

function bindGraphViewport(svg) {
  svg.addEventListener('wheel', (event) => {
    event.preventDefault();
    const origin = graphClientToSvg(svg, event.clientX, event.clientY);
    const factor = event.deltaY > 0 ? 0.88 : 1.14;
    zoomGraphAt(svg, graphViewport.scale * factor, origin);
  }, { passive: false });

  svg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest && event.target.closest('.feature-graph-node')) return;
    graphPointer = { active: true, lastX: event.clientX, lastY: event.clientY, didPan: false };
    svg.classList.add('is-panning');
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', (event) => {
    if (!graphPointer.active) return;
    const dx = event.clientX - graphPointer.lastX;
    const dy = event.clientY - graphPointer.lastY;
    if (Math.hypot(dx, dy) > 3) graphPointer.didPan = true;
    graphPointer.lastX = event.clientX;
    graphPointer.lastY = event.clientY;
    const ctm = svg.getScreenCTM();
    const unit = ctm ? Math.abs(ctm.a) || 1 : 1;
    graphViewport.x += dx / unit;
    graphViewport.y += dy / unit;
    applyGraphViewport();
  });
  const endPan = (event) => {
    if (!graphPointer.active) return;
    graphPointer.active = false;
    svg.classList.remove('is-panning');
    if (svg.hasPointerCapture && svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  };
  svg.addEventListener('pointerup', endPan);
  svg.addEventListener('pointercancel', endPan);
}

function bindGraphNode(group, feature) {
  const activate = () => {
    if (graphPointer.didPan) {
      graphPointer.didPan = false;
      return;
    }
    openWorkspace(feature.featureId).catch((err) => toast(err.message || 'Failed to open workspace', 'error'));
  };
  group.addEventListener('click', activate);
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  });
  group.addEventListener('mouseenter', () => setGraphFocus(feature.featureId));
  group.addEventListener('mouseleave', () => setGraphFocus(null));
  group.addEventListener('focus', () => setGraphFocus(feature.featureId));
  group.addEventListener('blur', () => setGraphFocus(null));
}

function drawFeatureNetwork(shell, { features, edges, positions, width, height, focusId }) {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('class', 'feature-graph-canvas');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'presentation');

  const defs = document.createElementNS(svgNs, 'defs');
  defs.innerHTML = `
    <filter id="feature-graph-glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="3.2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <marker id="feature-graph-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L6,3 z" fill="#6e7c8f"/>
    </marker>
  `;
  svg.appendChild(defs);

  const viewport = document.createElementNS(svgNs, 'g');
  viewport.setAttribute('class', 'feature-graph-viewport');

  const edgeLayer = document.createElementNS(svgNs, 'g');
  edgeLayer.setAttribute('class', 'feature-graph-links');
  for (const edge of edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;
    const cls = `edge-${edge.type.replace(/\s+/g, '-')}`;
    const hot = edgeTouchesFocus(edge, focusId);
    const dimmed = focusId && !hot;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const curve = Math.min(36, dist * 0.14);
    const cx = ((from.x + to.x) / 2) + ((-dy / dist) * curve);
    const cy = ((from.y + to.y) / 2) + ((dx / dist) * curve);
    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`);
    path.setAttribute('class', `feature-graph-link ${cls}${dimmed ? ' is-dimmed' : ''}${hot ? ' is-hot' : ''}`);
    path.dataset.from = edge.from;
    path.dataset.to = edge.to;
    if (edge.directed !== false) path.setAttribute('marker-end', 'url(#feature-graph-arrow)');
    edgeLayer.appendChild(path);

    const label = document.createElementNS(svgNs, 'text');
    label.setAttribute('class', `feature-graph-edge-label${hot ? ' is-visible' : ''}`);
    label.setAttribute('x', String(cx));
    label.setAttribute('y', String(cy - 6));
    label.setAttribute('text-anchor', 'middle');
    label.dataset.from = edge.from;
    label.dataset.to = edge.to;
    label.textContent = edge.type;
    edgeLayer.appendChild(label);
  }
  viewport.appendChild(edgeLayer);

  const nodeLayer = document.createElementNS(svgNs, 'g');
  for (const feature of features) {
    const pos = positions.get(feature.featureId);
    if (!pos) continue;
    const degree = graphNodeDegree(feature.featureId, edges);
    const radius = Math.min(16, 6 + degree * 1.15);
    const tone = graphNodeTone(feature);
    const live = tone === 'live';
    const waiting = tone === 'waiting';
    const neighborIds = new Set();
    if (focusId) {
      for (const edge of edges) {
        if (edge.from === focusId) neighborIds.add(edge.to);
        if (edge.to === focusId) neighborIds.add(edge.from);
      }
    }
    const group = document.createElementNS(svgNs, 'g');
    group.setAttribute('class', `feature-graph-node is-${tone}`);
    if (focusId === feature.featureId) group.classList.add('is-selected');
    else if (focusId && neighborIds.has(feature.featureId)) group.classList.add('is-neighbor');
    else if (focusId) group.classList.add('is-dimmed');
    group.dataset.featureId = feature.featureId;
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    const sr = live ? 'Live agent. ' : (waiting ? 'Waiting on human. ' : '');
    group.setAttribute(
      'aria-label',
      `${sr}${feature.featureId}: ${feature.title || feature.featureId}. ${shortCategoryLabel(feature.categoryTitle)}. ${feature.status || ''}`,
    );
    group.setAttribute('transform', `translate(${pos.x} ${pos.y})`);

    const halo = document.createElementNS(svgNs, 'circle');
    halo.setAttribute('class', 'feature-graph-halo');
    halo.setAttribute('r', String(radius + 7));
    group.appendChild(halo);

    const circle = document.createElementNS(svgNs, 'circle');
    circle.setAttribute('class', 'feature-graph-dot');
    circle.setAttribute('r', String(radius));
    group.appendChild(circle);

    const idText = document.createElementNS(svgNs, 'text');
    idText.setAttribute('class', 'feature-graph-id');
    idText.setAttribute('y', String(-(radius + 10)));
    idText.setAttribute('text-anchor', 'middle');
    idText.textContent = feature.featureId;
    group.appendChild(idText);

    const titleText = document.createElementNS(svgNs, 'text');
    titleText.setAttribute('class', 'feature-graph-caption');
    titleText.setAttribute('y', String(radius + 14));
    titleText.setAttribute('text-anchor', 'middle');
    titleText.textContent = truncateGraphTitle(feature.title);
    group.appendChild(titleText);

    bindGraphNode(group, feature);
    nodeLayer.appendChild(group);
  }
  viewport.appendChild(nodeLayer);
  svg.appendChild(viewport);
  shell.innerHTML = '';
  shell.appendChild(svg);
  bindGraphViewport(svg);
  applyGraphViewport();
}

function renderGraphZoomControls(root) {
  const existing = root.querySelector('.graph-zoom-controls');
  if (existing) existing.remove();
  const controls = document.createElement('div');
  controls.className = 'graph-zoom-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Graph zoom');
  controls.innerHTML = `
    <button type="button" class="graph-zoom-btn" data-graph-zoom="out" aria-label="Zoom out">−</button>
    <span class="graph-zoom-label" id="graphZoomLabel">${Math.round(graphViewport.scale * 100)}%</span>
    <button type="button" class="graph-zoom-btn" data-graph-zoom="in" aria-label="Zoom in">+</button>
    <button type="button" class="graph-zoom-btn graph-zoom-reset" data-graph-zoom="reset">Reset</button>
  `;
  controls.addEventListener('click', (event) => {
    const button = event.target.closest('[data-graph-zoom]');
    if (!button) return;
    const svg = root.querySelector('.feature-graph-canvas');
    if (!svg) return;
    const action = button.dataset.graphZoom;
    if (action === 'reset') {
      resetGraphViewport();
      applyGraphViewport();
      return;
    }
    const box = svg.getBoundingClientRect();
    const origin = graphClientToSvg(svg, box.left + (box.width / 2), box.top + (box.height / 2));
    const factor = action === 'in' ? 1.2 : 0.83;
    zoomGraphAt(svg, graphViewport.scale * factor, origin);
  });
  root.appendChild(controls);
}

function ensureGraphResizeObserver(root) {
  if (graphResizeObserver || typeof ResizeObserver === 'undefined') return;
  graphResizeObserver = new ResizeObserver(() => {
    if (uiState.mainView !== 'graph' || uiState.graphMode === '3d') return;
    renderFeatureGraph();
  });
  graphResizeObserver.observe(root);
}

function renderFeatureGraph() {
  const root = document.getElementById('featureGraph');
  if (!root) return;

  renderGraphLegend();
  const features = applySearch(getAllFeatures());
  const visibleIds = new Set(features.map((f) => f.featureId));
  const allEdges = (state.graph && state.graph.edges) || [];
  const edges = allEdges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));
  if (graphHoveredFeatureId && !visibleIds.has(graphHoveredFeatureId)) {
    graphHoveredFeatureId = null;
  }
  const focusId = graphHoveredFeatureId;

  const width = Math.max(320, root.clientWidth || 960);
  const height = Math.max(280, root.clientHeight || 560);
  const layoutKey = `${[...visibleIds].sort().join(',')}|${Math.round(width / 40)}x${Math.round(height / 40)}`;
  let positions = graphRenderCache.positions;
  if (graphRenderCache.layoutKey !== layoutKey) {
    positions = layoutFeatureNetwork(features, edges, width, height);
    graphRenderCache.layoutKey = layoutKey;
    resetGraphViewport();
  }
  graphRenderCache.edgeList = edges;
  graphRenderCache.features = features;
  graphRenderCache.positions = positions;

  root.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'feature-graph-shell';
  root.appendChild(shell);
  drawFeatureNetwork(shell, { features, edges, positions, width, height, focusId });
  renderGraphZoomControls(root);
  ensureGraphResizeObserver(root);
  syncLiveViewPolling(anyFeatureLive(features));
}

const GRAPH3D_NODE_COLORS = {
  core: { fill: '#dce3ea', glow: 'rgba(220, 227, 234, 0.35)' },
  agent: { fill: '#f0c6d8', glow: 'rgba(240, 198, 216, 0.4)' },
  complete: { fill: '#3fb950', glow: 'rgba(63, 185, 80, 0.45)' },
  live: { fill: '#58a6ff', glow: 'rgba(88, 166, 255, 0.5)' },
  waiting: { fill: '#d29922', glow: 'rgba(210, 153, 34, 0.45)' },
  blocked: { fill: '#f85149', glow: 'rgba(248, 81, 73, 0.45)' },
};

const GRAPH3D_EDGE_COLORS = {
  'depends on': 'rgba(88, 166, 255, 0.72)',
  'blocked by': 'rgba(248, 81, 73, 0.7)',
  'same category': 'rgba(110, 124, 143, 0.28)',
  'plan link': 'rgba(210, 153, 34, 0.7)',
};

function layoutFeatureNetwork3d(features, edges) {
  const count = features.length;
  const spread = Math.min(440, 200 + (Math.sqrt(Math.max(1, count)) * 26));
  const heightSpread = spread * 0.8;
  const springScale = spread / 210;
  const nodes = features.map((feature, index) => {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const y = count === 1 ? 0 : 1 - ((index / (count - 1)) * 2);
    const radius = Math.sqrt(Math.max(0, 1 - (y * y)));
    const theta = golden * index;
    return {
      id: feature.featureId,
      feature,
      tone: graphNodeTone(feature),
      radius: Math.min(16, 6 + graphNodeDegree(feature.featureId, edges) * 1.15),
      x: Math.cos(theta) * radius * spread,
      y: y * heightSpread,
      z: Math.sin(theta) * radius * spread,
      vx: 0,
      vy: 0,
      vz: 0,
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const springs = edges.map((edge) => ({
    a: byId.get(edge.from),
    b: byId.get(edge.to),
    k: edge.type === 'same category' ? 0.012 : edge.type === 'depends on' ? 0.042 : 0.024,
    len: (edge.type === 'same category' ? 110 : 168) * springScale,
    type: edge.type,
  })).filter((spring) => spring.a && spring.b);

  const iterations = 90;
  for (let step = 0; step < iterations; step += 1) {
    const cool = 0.88 - (step / iterations) * 0.32;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
        let dz = nodes[j].z - nodes[i].z;
        const distSq = (dx * dx) + (dy * dy) + (dz * dz) || 1;
        const dist = Math.sqrt(distSq);
        const force = (3800 * springScale) / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[i].vz -= fz;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
        nodes[j].vz += fz;
      }
    }
    for (const spring of springs) {
      const dx = spring.b.x - spring.a.x;
      const dy = spring.b.y - spring.a.y;
      const dz = spring.b.z - spring.a.z;
      const dist = Math.hypot(dx, dy, dz) || 1;
      const pull = spring.k * (dist - spring.len);
      const fx = (dx / dist) * pull;
      const fy = (dy / dist) * pull;
      const fz = (dz / dist) * pull;
      spring.a.vx += fx;
      spring.a.vy += fy;
      spring.a.vz += fz;
      spring.b.vx -= fx;
      spring.b.vy -= fy;
      spring.b.vz -= fz;
    }
    for (const node of nodes) {
      node.vx -= node.x * 0.008;
      node.vy -= node.y * 0.008;
      node.vz -= node.z * 0.008;
      node.vx *= cool;
      node.vy *= cool;
      node.vz *= cool;
      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;
    }
  }
  return nodes;
}

function rotateGraph3dPoint(point, yaw, pitch) {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = (point.x * cosY) + (point.z * sinY);
  const z1 = (point.z * cosY) - (point.x * sinY);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  return {
    x: x1,
    y: (point.y * cosP) - (z1 * sinP),
    z: (point.y * sinP) + (z1 * cosP),
  };
}

function projectGraph3dPoint(point, width, height, distance) {
  const depth = point.z + distance;
  const scale = 520 / Math.max(80, depth);
  return {
    x: (width / 2) + (point.x * scale) + graph3d.panX,
    y: (height / 2) + (point.y * scale) + graph3d.panY,
    scale,
    depth,
  };
}

function graph3dViewScale() {
  return GRAPH3D_DISTANCE_DEFAULT / graph3d.distance;
}

function graph3dZoomPercent() {
  return Math.round(graph3dViewScale() * 100);
}

function applyGraph3dZoomLabel() {
  const label = document.getElementById('graph3dZoomLabel');
  if (label) label.textContent = `${graph3dZoomPercent()}%`;
}

function graph3dFitDistance(nodes) {
  let maxR = 180;
  for (const node of nodes || []) {
    const reach = Math.hypot(node.x || 0, node.y || 0, node.z || 0);
    if (reach > maxR) maxR = reach;
  }
  return Math.max(GRAPH3D_DISTANCE_DEFAULT, maxR * 1.9);
}

function resetGraph3dViewport() {
  graph3d.distance = graph3dFitDistance(graph3d.nodes);
  graph3d.panX = 0;
  graph3d.panY = 0;
  graph3d.yaw = 0.42;
  graph3d.pitch = 0.28;
  applyGraph3dZoomLabel();
}

function graph3dBoxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function graph3dLabelBox(item, kind) {
  const r = Math.max(4.5, item.node.radius * item.proj.scale);
  const text = kind === 'title'
    ? graph3dFeatureCaption(item.node.feature, 24)
    : item.node.id;
  const w = Math.max(40, String(text || '').length * 6.6);
  const h = 13;
  const y = kind === 'title' ? item.proj.y + r + 2 : item.proj.y - r - 16;
  return { x: item.proj.x - (w / 2), y, w, h };
}

function graph3dLabelPlan(projected, focusId, neighborIds) {
  const showId = new Set();
  const showTitle = new Set();
  const boxes = [];
  const byId = new Map(projected.map((item) => [item.node.id, item]));

  const tryAdd = (id, kind) => {
    const item = byId.get(id);
    if (!item) return false;
    const box = graph3dLabelBox(item, kind);
    if (boxes.some((other) => graph3dBoxesOverlap(box, other))) return false;
    boxes.push(box);
    return true;
  };

  if (focusId) {
    showId.add(focusId);
    showTitle.add(focusId);
    tryAdd(focusId, 'id');
    tryAdd(focusId, 'title');
    neighborIds.forEach((id) => {
      showId.add(id);
      tryAdd(id, 'id');
      if (tryAdd(id, 'title')) showTitle.add(id);
    });
    return { showId, showTitle };
  }

  const nearest = [...projected].sort((a, b) => a.proj.depth - b.proj.depth);
  const maxIds = Math.min(14, Math.max(6, Math.ceil(nearest.length / 6)));
  let added = 0;
  for (const item of nearest) {
    if (item.proj.scale < 0.4) continue;
    const idOk = tryAdd(item.node.id, 'id');
    const titleOk = tryAdd(item.node.id, 'title');
    if (!idOk && !titleOk) continue;
    if (idOk) showId.add(item.node.id);
    if (titleOk) showTitle.add(item.node.id);
    added += 1;
    if (added >= maxIds) break;
  }
  return { showId, showTitle };
}

function zoomGraph3dAt(origin, nextScale, width, height) {
  const oldScale = graph3dViewScale() || 1;
  const scale = clampGraphScale(nextScale);
  const worldX = (origin.x - (width / 2) - graph3d.panX) / oldScale;
  const worldY = (origin.y - (height / 2) - graph3d.panY) / oldScale;
  graph3d.distance = GRAPH3D_DISTANCE_DEFAULT / scale;
  graph3d.panX = origin.x - (width / 2) - (worldX * scale);
  graph3d.panY = origin.y - (height / 2) - (worldY * scale);
  applyGraph3dZoomLabel();
}

function graph3dProjectedNodes(width, height) {
  return graph3d.nodes.map((node) => {
    const rotated = rotateGraph3dPoint(node, graph3d.yaw, graph3d.pitch);
    const proj = projectGraph3dPoint(rotated, width, height, graph3d.distance);
    return { node, rotated, proj };
  }).sort((a, b) => b.proj.depth - a.proj.depth);
}

function graph3dHitTest(px, py, projected) {
  for (let i = projected.length - 1; i >= 0; i -= 1) {
    const item = projected[i];
    const focused = item.node.id === graph3d.grabbedId || item.node.id === graph3d.hoverId;
    const radius = Math.max(12, (item.node.radius + (focused ? 14 : 8)) * item.proj.scale);
    if (Math.hypot(px - item.proj.x, py - item.proj.y) <= radius) return item;
  }
  return null;
}

function stopGraph3dLoop() {
  if (graph3d.raf) {
    cancelAnimationFrame(graph3d.raf);
    graph3d.raf = 0;
  }
  graph3d.lastTs = 0;
}

function pauseGraph3dSpin(featureId) {
  graph3d.autoRotate = false;
  graph3d.grabbedId = featureId || graph3d.grabbedId;
  updateGraph3dHud();
}

function resumeGraph3dSpin() {
  graph3d.autoRotate = true;
  graph3d.grabbedId = null;
  graph3d.hoverId = null;
  updateGraph3dHud();
}

function graph3dRelationsFor(focusId) {
  const byNeighbor = new Map();
  if (!focusId) return byNeighbor;
  for (const edge of graph3d.edges) {
    let other = null;
    if (edge.from === focusId) other = edge.to;
    else if (edge.to === focusId) other = edge.from;
    if (!other) continue;
    const list = byNeighbor.get(other) || [];
    list.push(edge);
    byNeighbor.set(other, list);
  }
  return byNeighbor;
}

function updateGraph3dInspect() {
  const card = document.getElementById('graph3dInspect');
  if (!card) return;
  const held = graph3d.nodes.find((node) => node.id === graph3d.grabbedId);
  if (!held) {
    card.hidden = true;
    card.innerHTML = '';
    return;
  }
  const relations = graph3dRelationsFor(held.id);
  const related = [...relations.entries()].map(([id, edges]) => {
    const other = graph3d.nodes.find((node) => node.id === id);
    const types = [...new Set(edges.map((edge) => edge.type))];
    return {
      id,
      title: other ? (other.feature.title || id) : id,
      types,
    };
  });
  const relItems = related.length
    ? related.map((item) => `
        <li>
          <span class="graph-3d-inspect-rel-id">${escapeHtml(item.id)}</span>
          <span class="graph-3d-inspect-rel-type">${escapeHtml(item.types.join(', '))}</span>
          <span class="graph-3d-inspect-rel-title">${escapeHtml(truncateGraphTitle(item.title, 36))}</span>
        </li>
      `).join('')
    : '<li class="is-empty">No parsed links — this feature is isolated here.</li>';
  card.hidden = false;
  card.innerHTML = `
    <p class="graph-3d-inspect-kicker">Selected</p>
    <p class="graph-3d-inspect-id">${escapeHtml(held.id)}</p>
    <p class="graph-3d-inspect-title">${escapeHtml(held.feature.title || held.id)}</p>
    <p class="graph-3d-inspect-kicker">${related.length} related</p>
    <ul class="graph-3d-inspect-rels">${relItems}</ul>
  `;
}

function updateGraph3dHud() {
  const hud = document.getElementById('graph3dHud');
  const status = document.getElementById('graph3dStatus');
  const resume = document.getElementById('graph3dResume');
  if (!hud || !status || !resume) return;
  const held = graph3d.nodes.find((node) => node.id === graph3d.grabbedId);
  const spinning = graph3d.autoRotate && !graph3d.grabbedId;
  const relatedCount = held ? graph3dRelationsFor(held.id).size : 0;
  hud.classList.toggle('is-paused', !spinning);
  if (held) {
    status.textContent = `Selected ${held.id} · ${relatedCount} related — drag to orbit, click again to open`;
  } else if (!spinning) {
    status.textContent = 'Paused — drag to orbit the cloud';
  } else {
    status.textContent = 'Spinning — hover a feature to read its name, click to pin it';
  }
  resume.hidden = spinning;
  updateGraph3dInspect();
}

function drawGraph3dFrame(ts) {
  const canvas = document.getElementById('graph3dCanvas');
  if (!canvas || uiState.mainView !== 'graph' || uiState.graphMode !== '3d') {
    stopGraph3dLoop();
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const last = graph3d.lastTs || ts;
  const dt = Math.min(48, ts - last);
  graph3d.lastTs = ts;
  if (graph3d.autoRotate && !graph3d.pointer.active) {
    graph3d.yaw += dt * 0.00028;
  }

  const dpr = canvas.width / Math.max(1, canvas.clientWidth);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const bg = ctx.createRadialGradient(cx, cy * 0.9, 20, cx, cy, Math.max(width, height) * 0.62);
  bg.addColorStop(0, 'rgba(88, 166, 255, 0.07)');
  bg.addColorStop(1, 'rgba(7, 11, 16, 0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = 'rgba(88, 166, 255, 0.12)';
  ctx.lineWidth = 1;
  for (let ring = 80; ring <= 240; ring += 80) {
    ctx.beginPath();
    for (let i = 0; i <= 64; i += 1) {
      const angle = (i / 64) * Math.PI * 2;
      const rotated = rotateGraph3dPoint({
        x: Math.cos(angle) * ring,
        y: 0,
        z: Math.sin(angle) * ring,
      }, graph3d.yaw, graph3d.pitch);
      const proj = projectGraph3dPoint(rotated, width, height, graph3d.distance);
      if (i === 0) ctx.moveTo(proj.x, proj.y);
      else ctx.lineTo(proj.x, proj.y);
    }
    ctx.stroke();
  }
  ctx.restore();

  const projected = graph3dProjectedNodes(width, height);
  const byId = new Map(projected.map((item) => [item.node.id, item]));
  const focusId = graph3d.grabbedId || graph3d.hoverId;
  const relations = graph3dRelationsFor(focusId);
  const neighborIds = new Set(relations.keys());
  const labels = graph3dLabelPlan(projected, focusId, neighborIds);
  const pulse = 0.55 + (0.45 * Math.sin((ts || 0) * 0.005));

  for (const edge of graph3d.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const hot = focusId && (edge.from === focusId || edge.to === focusId);
    const dim = !!(focusId && !hot);
    const color = GRAPH3D_EDGE_COLORS[edge.type] || 'rgba(110, 124, 143, 0.5)';
    if (hot) {
      ctx.beginPath();
      ctx.moveTo(from.proj.x, from.proj.y);
      ctx.lineTo(to.proj.x, to.proj.y);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.setLineDash([]);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(from.proj.x, from.proj.y);
    ctx.lineTo(to.proj.x, to.proj.y);
    ctx.strokeStyle = color;
    ctx.globalAlpha = dim ? 0.05 : (hot ? 1 : 0.55);
    ctx.lineWidth = hot ? 2.6 : 1.05;
    ctx.lineCap = 'round';
    if (!hot && (edge.type === 'same category' || edge.type === 'blocked by')) {
      ctx.setLineDash([4, 4]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (hot) {
      const mx = (from.proj.x + to.proj.x) / 2;
      const my = (from.proj.y + to.proj.y) / 2;
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = edge.type;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(13, 17, 23, 0.82)';
      ctx.fillRect(mx - (tw / 2) - 5, my - 8, tw + 10, 16);
      ctx.fillStyle = '#e6edf3';
      ctx.fillText(label, mx, my);
    }
  }

  const drawNode = (item, role) => {
    const { node, proj } = item;
    const tone = GRAPH3D_NODE_COLORS[node.tone] || GRAPH3D_NODE_COLORS.core;
    const isFocus = role === 'focus';
    const isNeighbor = role === 'neighbor';
    const dim = role === 'dim';
    const boost = isFocus ? 1.55 : (isNeighbor ? 1.22 : 1);
    const r = Math.max(4.5, node.radius * proj.scale * boost);
    const fade = Math.max(0.22, Math.min(1, 1.2 - ((proj.depth - 400) / 620)));
    ctx.globalAlpha = dim ? 0.12 : fade;

    if (isFocus) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(88, 166, 255, ${0.1 + (pulse * 0.12)})`;
      ctx.arc(proj.x, proj.y, r + 22 + (pulse * 8), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.fillStyle = tone.glow;
    ctx.arc(proj.x, proj.y, r + (isFocus ? 14 : 8), 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = tone.fill;
    ctx.shadowColor = isFocus ? 'rgba(88, 166, 255, 0.95)' : tone.glow;
    ctx.shadowBlur = isFocus ? 28 : (isNeighbor ? 16 : 8);
    ctx.arc(proj.x, proj.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (isFocus) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(88, 166, 255, ${0.55 + (pulse * 0.4)})`;
      ctx.lineWidth = 2.4;
      ctx.arc(proj.x, proj.y, r + 8 + (pulse * 3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(230, 237, 243, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.arc(proj.x, proj.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isNeighbor) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(88, 166, 255, 0.7)';
      ctx.lineWidth = 1.6;
      ctx.arc(proj.x, proj.y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    const wantId = labels.showId.has(node.id);
    const wantTitle = labels.showTitle.has(node.id);
    if (wantId) {
      ctx.fillStyle = dim ? '#6e7681' : '#e6edf3';
      ctx.font = `700 ${Math.max(10, (isFocus ? 14 : 11.5) * proj.scale)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(node.id, proj.x, proj.y - r - 8);
    }
    if (wantTitle) {
      ctx.fillStyle = isFocus ? '#c9d1d9' : '#8b949e';
      ctx.font = `${isFocus ? 600 : 400} ${Math.max(8, (isFocus ? 11 : 9.5) * proj.scale)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(graph3dFeatureCaption(node.feature, isFocus ? 34 : 24), proj.x, proj.y + r + 6);
    }
    ctx.globalAlpha = 1;
  };

  for (const item of projected) {
    const role = !focusId
      ? 'plain'
      : (item.node.id === focusId ? 'skip' : (neighborIds.has(item.node.id) ? 'skip' : 'dim'));
    if (role === 'skip') continue;
    drawNode(item, role);
  }
  for (const item of projected) {
    if (focusId && neighborIds.has(item.node.id)) drawNode(item, 'neighbor');
  }
  if (focusId && byId.get(focusId)) drawNode(byId.get(focusId), 'focus');

  graph3d.raf = requestAnimationFrame(drawGraph3dFrame);
}

function startGraph3dLoop() {
  if (graph3d.raf) return;
  graph3d.lastTs = 0;
  graph3d.raf = requestAnimationFrame(drawGraph3dFrame);
}

function syncGraph3dCanvasSize(root, canvas) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, root.clientWidth || 960);
  const height = Math.max(280, root.clientHeight || 560);
  const nextW = Math.round(width * dpr);
  const nextH = Math.round(height * dpr);
  if (canvas.width !== nextW || canvas.height !== nextH) {
    canvas.width = nextW;
    canvas.height = nextH;
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  return { width, height };
}

function graph3dPointerPosition(canvas, event) {
  const box = canvas.getBoundingClientRect();
  return {
    x: event.clientX - box.left,
    y: event.clientY - box.top,
  };
}

function bindGraph3dCanvas(root, canvas) {
  if (canvas.dataset.bound === '1') return;
  canvas.dataset.bound = '1';

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const { width, height } = syncGraph3dCanvasSize(root, canvas);
    const origin = graph3dPointerPosition(canvas, event);
    const factor = event.deltaY > 0 ? 0.88 : 1.14;
    zoomGraph3dAt(origin, graph3dViewScale() * factor, width, height);
  }, { passive: false });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const { width, height } = syncGraph3dCanvasSize(root, canvas);
    const pos = graph3dPointerPosition(canvas, event);
    const hit = graph3dHitTest(pos.x, pos.y, graph3dProjectedNodes(width, height));
    graph3d.pointer = {
      active: true,
      lastX: event.clientX,
      lastY: event.clientY,
      didDrag: false,
      hitId: hit ? hit.node.id : null,
      openOnRelease: !!(hit && hit.node.id === graph3d.grabbedId && !graph3d.autoRotate),
    };
    if (hit) {
      pauseGraph3dSpin(hit.node.id);
      root.classList.add('is-holding');
    } else {
      pauseGraph3dSpin(graph3d.grabbedId);
      root.classList.add('is-orbiting');
    }
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    const { width, height } = syncGraph3dCanvasSize(root, canvas);
    const pos = graph3dPointerPosition(canvas, event);
    if (!graph3d.pointer.active) {
      const hit = graph3dHitTest(pos.x, pos.y, graph3dProjectedNodes(width, height));
      graph3d.hoverId = hit ? hit.node.id : null;
      canvas.style.cursor = hit ? 'grab' : 'grab';
      return;
    }
    const dx = event.clientX - graph3d.pointer.lastX;
    const dy = event.clientY - graph3d.pointer.lastY;
    if (Math.hypot(dx, dy) > 3) graph3d.pointer.didDrag = true;
    graph3d.pointer.lastX = event.clientX;
    graph3d.pointer.lastY = event.clientY;
    graph3d.yaw += dx * 0.008;
    graph3d.pitch = Math.max(-1.1, Math.min(1.1, graph3d.pitch + (dy * 0.006)));
  });

  const endPointer = (event) => {
    if (!graph3d.pointer.active) return;
    const didDrag = graph3d.pointer.didDrag;
    const openId = graph3d.pointer.openOnRelease ? graph3d.pointer.hitId : null;
    graph3d.pointer.active = false;
    root.classList.remove('is-orbiting', 'is-holding');
    if (canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (!didDrag && openId) {
      openWorkspace(openId).catch((err) => toast(err.message || 'Failed to open workspace', 'error'));
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
}

function bindGraph3dZoomControls(root) {
  const controls = root.querySelector('.graph-zoom-controls');
  if (!controls || controls.dataset.bound === '1') return;
  controls.dataset.bound = '1';
  controls.addEventListener('click', (event) => {
    const button = event.target.closest('[data-graph3d-zoom]');
    if (!button) return;
    const canvas = document.getElementById('graph3dCanvas');
    if (!canvas) return;
    const action = button.dataset.graph3dZoom;
    if (action === 'reset') {
      resetGraph3dViewport();
      return;
    }
    const { width, height } = syncGraph3dCanvasSize(root, canvas);
    const origin = { x: width / 2, y: height / 2 };
    const factor = action === 'in' ? 1.2 : 0.83;
    zoomGraph3dAt(origin, graph3dViewScale() * factor, width, height);
  });
}

function ensureGraph3dInspectCard(root) {
  if (root.querySelector('#graph3dInspect')) return;
  const card = document.createElement('div');
  card.id = 'graph3dInspect';
  card.className = 'graph-3d-inspect';
  card.hidden = true;
  root.appendChild(card);
}

function ensureGraph3dChrome(root) {
  if (root.querySelector('#graph3dCanvas')) {
    if (!root.querySelector('[data-graph3d-zoom]')) {
      const controls = document.createElement('div');
      controls.className = 'graph-zoom-controls';
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', '3D graph zoom');
      controls.innerHTML = `
        <button type="button" class="graph-zoom-btn" data-graph3d-zoom="out" aria-label="Zoom out">−</button>
        <span class="graph-zoom-label" id="graph3dZoomLabel">${graph3dZoomPercent()}%</span>
        <button type="button" class="graph-zoom-btn" data-graph3d-zoom="in" aria-label="Zoom in">+</button>
        <button type="button" class="graph-zoom-btn graph-zoom-reset" data-graph3d-zoom="reset">Reset</button>
      `;
      root.appendChild(controls);
    }
    ensureGraph3dInspectCard(root);
    bindGraph3dZoomControls(root);
    return;
  }
  root.innerHTML = `
    <canvas id="graph3dCanvas" class="feature-graph-3d-canvas" role="img" aria-label="Rotating three-dimensional feature graph"></canvas>
    <div class="graph-3d-inspect" id="graph3dInspect" hidden></div>
    <div class="graph-3d-hud" id="graph3dHud">
      <span id="graph3dStatus">Spinning — hover a feature to read its name, click to pin it</span>
      <button type="button" class="graph-3d-resume" id="graph3dResume" hidden>Resume spin</button>
    </div>
    <div class="graph-zoom-controls" role="group" aria-label="3D graph zoom">
      <button type="button" class="graph-zoom-btn" data-graph3d-zoom="out" aria-label="Zoom out">−</button>
      <span class="graph-zoom-label" id="graph3dZoomLabel">${graph3dZoomPercent()}%</span>
      <button type="button" class="graph-zoom-btn" data-graph3d-zoom="in" aria-label="Zoom in">+</button>
      <button type="button" class="graph-zoom-btn graph-zoom-reset" data-graph3d-zoom="reset">Reset</button>
    </div>
  `;
  const canvas = document.getElementById('graph3dCanvas');
  const resume = document.getElementById('graph3dResume');
  bindGraph3dCanvas(root, canvas);
  bindGraph3dZoomControls(root);
  resume.addEventListener('click', () => resumeGraph3dSpin());
}

function ensureGraph3dResizeObserver(root) {
  if (graph3dResizeObserver || typeof ResizeObserver === 'undefined') return;
  graph3dResizeObserver = new ResizeObserver(() => {
    if (uiState.mainView !== 'graph' || uiState.graphMode !== '3d') return;
    const canvas = document.getElementById('graph3dCanvas');
    if (canvas) syncGraph3dCanvasSize(root, canvas);
  });
  graph3dResizeObserver.observe(root);
}

function renderFeatureGraph3d() {
  const root = document.getElementById('featureGraph3d');
  if (!root) return;

  renderGraphLegend('graphLegend');
  const features = applySearch(getAllFeatures());
  const visibleIds = new Set(features.map((f) => f.featureId));
  const allEdges = (state.graph && state.graph.edges) || [];
  const edges = allEdges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));
  if (graph3d.grabbedId && !visibleIds.has(graph3d.grabbedId)) {
    graph3d.grabbedId = null;
  }
  if (graph3d.hoverId && !visibleIds.has(graph3d.hoverId)) {
    graph3d.hoverId = null;
  }

  const layoutKey = [...visibleIds].sort().join(',');
  if (graph3d.layoutKey !== layoutKey) {
    graph3d.nodes = layoutFeatureNetwork3d(features, edges);
    graph3d.layoutKey = layoutKey;
    resetGraph3dViewport();
  } else {
    const byId = new Map(features.map((feature) => [feature.featureId, feature]));
    graph3d.nodes = graph3d.nodes.map((node) => {
      const feature = byId.get(node.id) || node.feature;
      return {
        ...node,
        feature,
        tone: graphNodeTone(feature),
        radius: Math.min(16, 6 + graphNodeDegree(node.id, edges) * 1.15),
      };
    });
  }
  graph3d.edges = edges;
  graph3d.features = features;

  ensureGraph3dChrome(root);
  const canvas = document.getElementById('graph3dCanvas');
  if (canvas) syncGraph3dCanvasSize(root, canvas);
  applyGraph3dZoomLabel();
  updateGraph3dHud();
  ensureGraph3dResizeObserver(root);
  startGraph3dLoop();
  syncLiveViewPolling(anyFeatureLive(features));
}

function pipelineChip(featureOrStatus, workflow) {
  const feature = featureOrStatus && typeof featureOrStatus === 'object'
    ? featureOrStatus
    : { status: featureOrStatus };
  const value = feature.status || '';
  const approved = !!(feature.planApprovedAt || (workflow && workflow.planApprovedAt));
  if (value.includes('Planning')) return { label: 'planning', cls: 'chip-planning' };
  if (value.includes('PlanReview') && approved) {
    return { label: 'ready to implement', cls: 'chip-ready', gate: true };
  }
  if (value.includes('PlanReview')) return { label: 'awaiting approval', cls: 'chip-review' };
  if (value.includes('WorkInProgress')) return { label: 'coding', cls: 'chip-coding' };
  if (value.includes('Testing')) return { label: 'review', cls: 'chip-testing' };
  if (value.includes('ReadyToMerge')) return { label: 'ready', cls: 'chip-ready' };
  if (value.includes('Complete')) return { label: 'complete', cls: 'chip-complete' };
  return null;
}

function renderCard(feature, categoryTitle) {
  const div = document.createElement('div');
  div.className = 'card';
  div.draggable = true;
  div.dataset.featureId = feature.featureId;
  div.dataset.category = feature.categoryTitle;
  const chip = pipelineChip(feature);
  const chipHtml = chip
    ? `<span class="pipeline-chip ${chip.cls}${chip.gate ? ' is-gate' : ''}">${escapeHtml(chip.label)}</span>`
    : '';
  div.innerHTML = `
    <div class="card-header">
      <span class="card-feature-id">${escapeHtml(feature.featureId)}</span>
      <span class="card-title">${escapeHtml(feature.title)}</span>
    </div>
    <div class="card-description">${escapeHtml(feature.description || '')}</div>
    <div class="card-meta">
      <span class="card-status">${escapeHtml(feature.status)}</span>
      <span class="card-assignee ${!(feature.assignee && feature.assignee !== '-') ? 'unassigned' : ''}">${escapeHtml(feature.assignee && feature.assignee !== '-' ? feature.assignee : 'Unassigned')}</span>
    </div>
    ${feature.branch
      ? `<div class="card-branch${feature.branchCurrent ? ' is-current' : ''}" title="${escapeHtml(feature.branchExists ? 'Git branch for this feature' : 'Expected branch (not created locally yet)')}">${escapeHtml(feature.branch)}${feature.branchCurrent ? ' · checked out' : ''}</div>`
      : ''}
    ${chipHtml}
    <div class="card-actions">
      <button type="button" data-action="open">Open</button>
      <button type="button" data-action="edit">Edit</button>
      ${(feature.status || '').includes('ReadyToMerge')
        ? '<button type="button" class="btn-gate" data-action="complete">Complete</button>'
        : ''}
      <button type="button" data-action="delete">Delete</button>
    </div>
  `;

  div.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ feature, fromColumn: categoryTitle }));
    e.dataTransfer.effectAllowed = 'move';
    div.classList.add('dragging');
  });
  div.addEventListener('dragend', () => div.classList.remove('dragging'));

  div.querySelector('[data-action="open"]').addEventListener('click', (e) => {
    e.stopPropagation();
    openWorkspace(feature.featureId).catch((err) => toast(err.message || 'Failed to open workspace', 'error'));
  });

  div.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(feature);
  });

  const completeBtn = div.querySelector('[data-action="complete"]');
  if (completeBtn) {
    completeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      markFeatureComplete(feature.featureId).catch((err) => toast(err.message || 'Failed to mark complete', 'error'));
    });
  }

  div.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteFeature(feature.featureId).catch((err) => toast(err.message || 'Failed to delete feature', 'error'));
  });

  return div;
}

async function deleteFeature(featureId) {
  const ok = window.confirm(`Delete feature ${featureId}? This cannot be undone.`);
  if (!ok) return;

  let removed = false;
  for (const cat of state.categories) {
    const before = cat.features.length;
    cat.features = cat.features.filter((f) => f.featureId !== featureId);
    if (cat.features.length !== before) removed = true;
  }
  if (!removed) {
    toast('Feature not found', 'error');
    return;
  }

  await persist();
  renderMainView();
  toast('Feature deleted');
}

async function deleteCategory(categoryTitle) {
  const cat = state.categories.find((c) => c.title === categoryTitle);
  if (!cat) {
    toast('Category not found', 'error');
    return;
  }

  const features = cat.features || [];
  if (features.length > 0) {
    const byStatus = new Map();
    for (const f of features) {
      const s = (f.status || '📋 Planned').trim();
      const entry = byStatus.get(s) || { count: 0, ids: [] };
      entry.count += 1;
      if (f.featureId) entry.ids.push(f.featureId);
      byStatus.set(s, entry);
    }

    const statusLines = Array.from(byStatus.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([status, info]) => {
        const ids = info.ids.slice(0, 6).join(', ');
        const more = info.ids.length > 6 ? ` (+${info.ids.length - 6} more)` : '';
        return `- ${status}: ${info.count} (${ids}${more})`;
      })
      .join('\n');

    window.alert(
      `Cannot delete category "${categoryTitle}" because it still has ${features.length} feature(s).\n\n` +
      `Some features may not be visible in this category column because cards in "🔨 Work In Progress" and "✅ Completed" are shown in those default columns.\n\n` +
      `Features by status:\n${statusLines}`
    );
    return;
  }

  const ok = window.confirm(`Delete category "${categoryTitle}"?`);
  if (!ok) return;

  state.categories = state.categories.filter((c) => c.title !== categoryTitle);
  await persist();
  renderMainView();
  toast('Category deleted');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function renderColumns() {
  const container = document.getElementById('columns');
  container.innerHTML = '';

  const categoryTitles = state.categories.map((c) => c.title);

  const columns = [
    { key: COL_WIP, title: '🔨 Work In Progress', css: 'wip' },
    ...categoryTitles.map((t) => ({ key: t, title: t, css: '' })),
    { key: COL_COMPLETE, title: '✅ Completed', css: 'complete' },
  ];

  for (const col of columns) {
    const colEl = document.createElement('div');
    colEl.dataset.column = col.key;

    const isCategoryColumn = col.key !== COL_WIP && col.key !== COL_COMPLETE;
    const cat = isCategoryColumn ? state.categories.find((c) => c.title === col.key) : null;
    const hasAnyFeaturesInCategory = !!(isCategoryColumn && cat && (cat.features || []).length > 0);
    const hasAnyNonDefaultFeaturesInCategory = !!(
      isCategoryColumn &&
      cat &&
      (cat.features || []).some((f) => f.status !== '🔨 WorkInProgress' && f.status !== '✅ Complete')
    );
    const isVisuallyEmptyCategoryColumn = !!(isCategoryColumn && cat && !hasAnyNonDefaultFeaturesInCategory);

    colEl.className = `column${isVisuallyEmptyCategoryColumn ? ' is-empty' : ''}`;

    const features = getFeaturesForColumn(col.key);
    const count = features.length;
    const countLabel = `${count} feature${count === 1 ? '' : 's'}`;

    colEl.innerHTML = `
      <div class="column-header ${col.css}">
        <div class="column-header-row">
          <div class="column-header-leading">
            <span class="column-title">${escapeHtml(col.title)}</span>
            <span class="column-count" aria-label="${countLabel}">${count}</span>
          </div>
          ${isCategoryColumn
            ? `<button type="button" class="column-delete ${hasAnyFeaturesInCategory ? 'is-disabled' : ''}" data-action="delete-category" title="${hasAnyFeaturesInCategory ? 'Category is not empty' : 'Delete empty category'}">Delete</button>`
            : ''
          }
        </div>
      </div>
      <div class="column-cards" data-column="${col.key}"></div>
    `;

    const cardsContainer = colEl.querySelector('.column-cards');

    for (const f of features) {
      const displayCategory = col.key === COL_WIP || col.key === COL_COMPLETE ? f.categoryTitle : col.key;
      cardsContainer.appendChild(renderCard(f, displayCategory));
    }

    if (isVisuallyEmptyCategoryColumn) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'column-empty';
      emptyEl.innerHTML = '<button type="button" class="btn btn-secondary empty-create">+ Create New Feature</button>';
      emptyEl.querySelector('button').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCreateModal(col.key);
      });
      cardsContainer.appendChild(emptyEl);
    }

    cardsContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      cardsContainer.classList.add('drag-over');
    });
    cardsContainer.addEventListener('dragleave', () => cardsContainer.classList.remove('drag-over'));
    cardsContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      cardsContainer.classList.remove('drag-over');
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const { feature, fromColumn } = JSON.parse(raw);
      handleDrop(feature, fromColumn, col.key);
    });

    const deleteBtn = colEl.querySelector('[data-action="delete-category"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCategory(col.key).catch((err) => toast(err.message || 'Failed to delete category', 'error'));
      });
    }

    container.appendChild(colEl);
  }
}

async function handleDrop(feature, fromColumn, toColumn) {
  if (fromColumn === toColumn) return;

  let newStatus = feature.status;
  let newCategory = feature.categoryTitle;

  if (toColumn === COL_COMPLETE) {
    newStatus = '✅ Complete';
  } else if (toColumn === COL_WIP) {
    newStatus = '🔨 WorkInProgress';
  } else {
    newCategory = toColumn;
  }

  const cat = state.categories.find((c) => c.title === feature.categoryTitle);
  if (!cat) return;
  const idx = cat.features.findIndex((f) => f.featureId === feature.featureId);
  if (idx === -1) return;

  cat.features[idx].status = newStatus;
  cat.features[idx].categoryTitle = newCategory;

  if (newCategory !== feature.categoryTitle) {
    cat.features.splice(idx, 1);
    let targetCat = state.categories.find((c) => c.title === newCategory);
    if (!targetCat) {
      targetCat = { title: newCategory, description: '', features: [] };
      state.categories.push(targetCat);
    }
    targetCat.features.push({ ...feature, status: newStatus, categoryTitle: newCategory });
  }

  await persist();
  renderMainView();
  toast('Updated');
}

async function persist() {
  await saveFeatures({
    categories: state.categories,
    preamble: state.preamble,
    postamble: state.postamble,
  });
}

function findFeatureById(featureId) {
  for (const category of state.categories) {
    const feature = category.features.find((item) => item.featureId === featureId);
    if (feature) return feature;
  }
  return null;
}

function setWorkspaceTab(tabName) {
  uiState.workspaceTab = tabName;
  document.querySelectorAll('.workspace-tab').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === tabName);
  });
  document.querySelectorAll('.workspace-pane').forEach((pane) => {
    pane.classList.toggle('is-active', pane.dataset.pane === tabName);
  });
}

function setEditorValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (document.activeElement === el) return;
  if (el.value === value) return;
  el.value = value;
}

function markdownHtml(source) {
  try {
    if (typeof window.renderMarkdown === 'function') {
      return window.renderMarkdown(source);
    }
  } catch (err) {
    console.error(err);
  }
  const div = document.createElement('div');
  div.textContent = source || '';
  return '<pre>' + div.innerHTML + '</pre>';
}

function setMarkdownPreview(id, source) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = markdownHtml(source);
}

function setArtifactView(kind, mode) {
  uiState.artifactView[kind] = mode;
  const preview = document.getElementById(kind + 'Preview');
  const editor = document.getElementById(kind + 'Editor');
  if (preview) preview.hidden = mode !== 'preview';
  if (editor) editor.hidden = mode !== 'edit';
  document.querySelectorAll('[data-preview-for="' + kind + '"]').forEach((btn) => {
    btn.classList.toggle('is-active', mode === 'preview');
  });
  document.querySelectorAll('[data-edit-for="' + kind + '"]').forEach((btn) => {
    btn.classList.toggle('is-active', mode === 'edit');
  });
  if (mode === 'preview' && editor) {
    setMarkdownPreview(kind + 'Preview', editor.value);
  }
}

const GATE_BUTTON_IDS = [
  'startPlanning',
  'approvePlan',
  'startImplement',
  'createMergeRequest',
  'markComplete',
  'markCompleteFromShip',
];

function nextWorkspaceGate({ feature, workflow, ship, running, approved, configured, tasksExist }) {
  const status = feature.status || '';
  const runStatus = workflow.runStatus || '';

  if (running) {
    return { buttonIds: [], tab: null, hint: 'Agent is running. Wait or cancel.', chipLabel: null, waiting: true };
  }
  if (status.includes('Complete')) {
    return { buttonIds: [], tab: null, hint: '', chipLabel: null, waiting: false };
  }
  if (status.includes('ReadyToMerge')) {
    return {
      buttonIds: ['markComplete', 'markCompleteFromShip'],
      tab: 'ship',
      hint: 'Next: mark complete after the PR is merged.',
      chipLabel: 'ready',
      waiting: true,
    };
  }
  if (status.includes('Testing')) {
    if (ship && ship.canCreate) {
      return {
        buttonIds: ['createMergeRequest'],
        tab: 'ship',
        hint: 'Next: create the draft PR.',
        chipLabel: 'review',
        waiting: true,
      };
    }
    const missing = ship && Array.isArray(ship.missing) ? ship.missing : [];
    return {
      buttonIds: [],
      tab: 'review',
      hint: missing.length ? `Next: add ${missing.join(' and ')}.` : 'Next: review artifacts, then ship.',
      chipLabel: 'review',
      waiting: true,
    };
  }
  if (status.includes('Blocked')) {
    return {
      buttonIds: approved ? ['startImplement'] : ['startPlanning'],
      tab: 'plan',
      hint: 'Blocked. Next: retry the last gate or edit the feature.',
      chipLabel: null,
      waiting: true,
    };
  }
  if (approved && !status.includes('WorkInProgress')) {
    return {
      buttonIds: ['startImplement'],
      tab: 'implementation',
      hint: 'Next: start implementation.',
      chipLabel: 'ready to implement',
      waiting: true,
    };
  }
  if (status.includes('PlanReview') || (tasksExist && !approved && runStatus === 'finished')) {
    return {
      buttonIds: ['approvePlan'],
      tab: 'plan',
      hint: 'Next: approve the plan.',
      chipLabel: 'awaiting approval',
      waiting: true,
    };
  }
  if (status.includes('WorkInProgress')) {
    return {
      buttonIds: ['startImplement'],
      tab: 'implementation',
      hint: 'Next: continue implementation.',
      chipLabel: 'coding',
      waiting: true,
    };
  }
  if (status.includes('Paused')) {
    if (approved) {
      return {
        buttonIds: ['startImplement'],
        tab: 'implementation',
        hint: 'Paused. Next: start implementation.',
        chipLabel: null,
        waiting: true,
      };
    }
    if (tasksExist) {
      return {
        buttonIds: ['approvePlan'],
        tab: 'plan',
        hint: 'Paused. Next: approve the plan.',
        chipLabel: null,
        waiting: true,
      };
    }
  }
  return {
    buttonIds: ['startPlanning'],
    tab: 'plan',
    hint: configured ? 'Next: start planning.' : 'Next: save a Cursor key, then start planning.',
    chipLabel: null,
    waiting: true,
  };
}

function syncNextGate(gate) {
  GATE_BUTTON_IDS.forEach((id) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.classList.remove('btn-primary', 'btn-gate');
    button.classList.add('btn-secondary');
    button.removeAttribute('aria-current');
  });
  (gate.buttonIds || []).forEach((id) => {
    const button = document.getElementById(id);
    if (!button || button.disabled) return;
    button.classList.remove('btn-secondary');
    button.classList.add('btn-gate');
    button.setAttribute('aria-current', 'step');
  });

  const statusEl = document.getElementById('workspaceStatus');
  if (statusEl) statusEl.classList.toggle('is-gate', !!gate.waiting);

  const chip = document.getElementById('workspaceChip');
  const feature = findFeatureById(uiState.workspaceFeatureId);
  const mapped = feature ? pipelineChip(feature) : null;
  if (chip) {
    const label = gate.chipLabel || (mapped && mapped.label);
    if (label) {
      chip.hidden = false;
      chip.textContent = label;
      chip.className = 'pipeline-chip';
      if (mapped) chip.classList.add(mapped.cls);
      if (gate.waiting) chip.classList.add('is-gate');
    } else {
      chip.hidden = true;
    }
  }

  const hint = document.getElementById('workspaceGateHint');
  if (hint) {
    hint.hidden = !gate.hint;
    hint.textContent = gate.hint || '';
  }

  document.querySelectorAll('.workspace-tab').forEach((tab) => {
    tab.classList.toggle('is-gate', !!gate.tab && tab.dataset.tab === gate.tab);
  });
}

function renderWorkspaceBranch(payload) {
  const git = payload.git || {};
  const branch = git.branch || (payload.feature && payload.feature.branch) || '';
  const branchEl = document.getElementById('workspaceBranch');
  const currentEl = document.getElementById('workspaceBranchCurrent');
  const copyBtn = document.getElementById('copyBranch');
  const checkoutBtn = document.getElementById('checkoutBranch');
  if (branchEl) branchEl.textContent = branch || '—';
  if (currentEl) currentEl.hidden = !git.isCurrent;
  if (copyBtn) copyBtn.disabled = !branch;
  if (checkoutBtn) {
    checkoutBtn.disabled = !branch || !!git.isCurrent;
    checkoutBtn.textContent = git.isCurrent ? 'Checked out' : (git.exists ? 'Check out' : 'Create and check out');
  }
}

function renderWorkspace(payload) {
  const feature = payload.feature;
  uiState.workspaceFeatureId = feature.featureId;
  document.getElementById('workspaceFeatureId').textContent = feature.featureId;
  document.getElementById('workspaceTitle').textContent = feature.title;
  document.getElementById('workspaceStatus').textContent = feature.status;
  renderWorkspaceBranch(payload);

  const plan = payload.artifacts.plan;
  const tasks = payload.artifacts.tasks;
  document.getElementById('planPath').textContent = plan.exists ? plan.path : 'not created yet';
  document.getElementById('tasksPath').textContent = tasks.exists ? tasks.path : 'not created yet';
  setEditorValue('planEditor', plan.content || '');
  setEditorValue('tasksEditor', tasks.content || '');
  setArtifactView('plan', uiState.artifactView.plan || 'preview');
  setArtifactView('tasks', uiState.artifactView.tasks || 'preview');
  setMarkdownPreview('planPreview', document.getElementById('planEditor').value);
  setMarkdownPreview('tasksPreview', document.getElementById('tasksEditor').value);

  const completion = payload.artifacts.completion;
  const review = payload.artifacts.review;
  setMarkdownPreview('completionPreview', completion.exists ? completion.content : '');
  setMarkdownPreview('reviewPreview', review.exists ? review.content : '');

  const workflow = payload.workflow || {};
  const running = workflow.runStatus === 'running' || workflow.runStatus === 'starting';
  const approved = !!workflow.planApprovedAt;
  const configured = !!configState.cursorConfigured;
  renderAgentTranscript(workflow);
  renderWorkspaceCursorModel(workflow, running);

  document.getElementById('approvePlan').textContent = approved ? 'Plan approved' : 'Approve plan';
  document.getElementById('approvePlan').disabled = approved || !tasks.exists || running;
  document.getElementById('startPlanning').textContent = workflow.runStatus === 'finished' && workflow.kind === 'planning'
    ? 'Re-run planning agent'
    : 'Start planning';
  document.getElementById('startPlanning').disabled = !configured || running;
  document.getElementById('sendRevision').disabled = !configured || running || !tasks.exists;
  document.getElementById('startImplement').disabled = !configured || running || !approved;
  document.getElementById('cancelRun').disabled = !running;
  syncMarkCompleteButtons(feature, running);

  const ship = payload.ship || {};
  const shipStatus = document.getElementById('shipStatus');
  const shipMissing = document.getElementById('shipMissing');
  const shipBlockers = document.getElementById('shipBlockers');
  const shipMrLine = document.getElementById('shipMrLine');
  const shipMrLink = document.getElementById('shipMrLink');
  const createMr = document.getElementById('createMergeRequest');
  const copyMr = document.getElementById('copyMergeRequest');
  if ((feature.status || '').includes('Complete')) {
    shipStatus.textContent = 'This feature is marked complete. The board does not merge; GitHub is the source of truth for the PR.';
  } else if (ship.mrUrl) {
    shipStatus.textContent = ship.approved
      ? 'Review approved. Draft merge request is on the feature row. After you merge on GitHub, mark the feature complete.'
      : 'A merge request URL is on the feature row. After you merge on GitHub, mark the feature complete.';
  } else {
    shipStatus.textContent = 'Approve the completion summary and security review by creating a draft PR. This commits current work (except local secrets), pushes the branch, and opens a draft merge request. It does not merge. After you merge on GitHub, mark the feature complete.';
  }
  if (ship.missing && ship.missing.length) {
    shipMissing.hidden = false;
    shipMissing.textContent = `Still needed: ${ship.missing.join(' and ')}.`;
  } else {
    shipMissing.hidden = true;
    shipMissing.textContent = '';
  }
  if (ship.securityBlocked) {
    shipBlockers.hidden = false;
    shipBlockers.textContent = ship.securityReason || 'Security review is blocked.';
  } else if (ship.ghError) {
    shipBlockers.hidden = false;
    shipBlockers.textContent = ship.ghError;
  } else {
    shipBlockers.hidden = true;
    shipBlockers.textContent = '';
  }
  const shipGithubHint = document.getElementById('shipGithubHint');
  if (shipGithubHint) shipGithubHint.hidden = !ship.ghError;
  if (ship.mrUrl) {
    shipMrLine.hidden = false;
    shipMrLink.href = ship.mrUrl;
    shipMrLink.textContent = ship.mrUrl;
    copyMr.hidden = false;
  } else {
    shipMrLine.hidden = true;
    shipMrLink.href = '#';
    shipMrLink.textContent = '';
    copyMr.hidden = true;
  }
  createMr.textContent = ship.mrUrl ? 'Update draft PR' : 'Create draft PR';
  createMr.disabled = running || !ship.canCreate;
  fillShipDraft(payload.feature && payload.feature.featureId, ship);
  document.getElementById('resetShipDraft').disabled = !ship.draftBody && !ship.draftTitle;
  syncNextGate(nextWorkspaceGate({
    feature,
    workflow,
    ship,
    running,
    approved,
    configured,
    tasksExist: tasks.exists,
  }));

  const hint = document.getElementById('cursorConfigHint');
  const featureModel = workflow.preferredModel || workflow.model || configState.cursorModel || 'composer-2.5';
  hint.textContent = configured
    ? `Local Cursor agent for this feature: ${featureModel}. Change the model above before planning or implementing. One concurrent run per feature.`
    : 'Save a Cursor API key in Settings → IDE tools to fire agents from the app.';

  const runMeta = document.getElementById('runMeta');
  const parts = [
    workflow.kind ? `kind: ${workflow.kind}` : null,
    workflow.runStatus ? `status: ${workflow.runStatus}` : 'No Cursor run yet.',
    workflow.agentId ? `agent: ${workflow.agentId}` : null,
    workflow.runId ? `run: ${workflow.runId}` : null,
  ].filter(Boolean);
  runMeta.textContent = parts.join(' · ');
  document.getElementById('runSummary').textContent = workflow.lastAssistantText
    || 'The latest agent summary will appear here.';
  const runError = document.getElementById('runError');
  if (workflow.lastError) {
    runError.hidden = false;
    runError.textContent = workflow.lastError;
  } else {
    runError.hidden = true;
    runError.textContent = '';
  }

  syncWorkspacePolling(running);
}

function renderAgentTranscript(workflow) {
  const statusEl = document.getElementById('agentLiveStatus');
  const listEl = document.getElementById('agentTranscript');
  if (!statusEl || !listEl) return;
  const status = workflow.runStatus || 'idle';
  const kind = workflow.kind ? `${workflow.kind} · ` : '';
  statusEl.textContent = workflow.lastError && status === 'error'
    ? `${kind}error`
    : (kind + status);
  const lines = Array.isArray(workflow.transcript) ? workflow.transcript : [];
  const nearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 40;
  if (!lines.length && workflow.lastError) {
    listEl.innerHTML = `<li class="tx-error"><span class="tx-kind">Error</span>${escapeHtml(workflow.lastError)}</li>`;
    return;
  }
  if (!lines.length) {
    listEl.innerHTML = '<li class="tx-empty">Confirm Start planning. This log shows thinking, tools, and errors while the agent runs. The Plan tab may still show an empty template until the agent writes it.</li>';
    return;
  }
  listEl.innerHTML = lines.map((line) => {
    const kindClass = 'tx-' + (line.kind || 'status');
    const title = escapeHtml(line.title || line.kind || '');
    const text = escapeHtml(line.text || '');
    return `<li class="${kindClass}"><span class="tx-kind">${title}</span>${text}</li>`;
  }).join('');
  if (nearBottom) listEl.scrollTop = listEl.scrollHeight;
}

async function fetchWorkspace(featureId) {
  const res = await fetch(`${API}/features/${encodeURIComponent(featureId)}/workspace`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load workspace');
  }
  return res.json();
}

async function openWorkspace(featureId) {
  const payload = await fetchWorkspace(featureId);
  renderWorkspace(payload);
  setWorkspaceTab(uiState.workspaceTab || 'plan');
  document.getElementById('workspace').hidden = false;
}

function stopWorkspacePolling() {
  if (workspacePollTimer) {
    clearInterval(workspacePollTimer);
    workspacePollTimer = null;
  }
}

function syncWorkspacePolling(running) {
  if (running && !workspacePollTimer) {
    workspacePollTimer = setInterval(() => {
      if (!uiState.workspaceFeatureId || document.getElementById('workspace').hidden) return;
      fetchWorkspace(uiState.workspaceFeatureId)
        .then((payload) => {
          renderWorkspace(payload);
          load().catch(() => {});
        })
        .catch(() => {});
    }, 1000);
  }
  if (!running) {
    stopWorkspacePolling();
  }
}

function closeWorkspace() {
  stopWorkspacePolling();
  document.getElementById('workspace').hidden = true;
}

function isCompleteStatus(status) {
  return (status || '').includes('Complete');
}

function syncMarkCompleteButtons(feature, running) {
  const done = isCompleteStatus(feature.status);
  const buttons = [
    document.getElementById('markComplete'),
    document.getElementById('markCompleteFromShip'),
  ];
  buttons.forEach((button) => {
    if (!button) return;
    button.hidden = false;
    button.disabled = done || running;
    button.textContent = done ? 'Completed' : 'Mark complete';
  });
}

async function markFeatureComplete(featureId) {
  const id = featureId || uiState.workspaceFeatureId;
  if (!id) return;
  const feature = findFeatureById(id);
  if (feature && isCompleteStatus(feature.status)) {
    toast('Already complete');
    return;
  }
  const ok = window.confirm(
    `Mark ${id} complete? This moves the card to Completed in FEATURES.md. It does not merge or close the pull request on GitHub.`
  );
  if (!ok) return;
  const previousId = uiState.workspaceFeatureId;
  uiState.workspaceFeatureId = id;
  try {
    const data = await postWorkflow('/complete', { confirmed: true }, 'Failed to mark complete');
    if (previousId === id && !document.getElementById('workspace').hidden) {
      renderWorkspace(data.workspace);
    }
    await load();
    toast(`${id} marked complete`);
  } finally {
    if (previousId && previousId !== id) uiState.workspaceFeatureId = previousId;
  }
}

async function copyFeatureBranch() {
  const branch = document.getElementById('workspaceBranch');
  const name = branch && branch.textContent ? branch.textContent.trim() : '';
  if (!name || name === '—') return;
  await navigator.clipboard.writeText(name);
  toast(`Copied ${name}`);
}

async function checkoutFeatureBranch() {
  const featureId = uiState.workspaceFeatureId;
  const name = document.getElementById('workspaceBranch').textContent.trim();
  if (!featureId || !name || name === '—') return;
  const ok = window.confirm(
    `Check out ${name} for ${featureId}? This switches the local git repo. It will not discard committed work, but it refuses if you have uncommitted changes.`
  );
  if (!ok) return;
  const data = await postWorkflow('/checkout-branch', { confirmed: true }, 'Failed to check out branch');
  renderWorkspace(data.workspace);
  await load();
  toast(data.created ? `Created and checked out ${data.branch}` : `Checked out ${data.branch}`);
}

async function postWorkflow(path, body, fallbackError) {
  const res = await fetch(`${API}/features/${encodeURIComponent(uiState.workspaceFeatureId)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || fallbackError);
  }
  return res.json();
}

function renderWorkspaceCursorModel(workflow, running) {
  const select = document.getElementById('workspaceCursorModel');
  if (!select) return;
  const models = configState.cursorModels || [];
  const defaultId = configState.cursorModel || 'composer-2.5';
  const preferred = String((workflow && workflow.preferredModel) || '').trim();
  const previous = select.value;
  select.innerHTML = '';
  select.appendChild(new Option(`Settings default (${defaultId})`, ''));
  const ids = new Set();
  for (const model of models) {
    if (!model || !model.id || ids.has(model.id)) continue;
    ids.add(model.id);
    const label = model.displayName && model.displayName !== model.id
      ? `${model.displayName} (${model.id})`
      : model.id;
    select.appendChild(new Option(label, model.id));
  }
  if (preferred && !ids.has(preferred)) {
    select.appendChild(new Option(`${preferred} (saved)`, preferred));
  }
  const next = preferred || previous || '';
  select.value = next;
  if (select.value !== next) select.value = '';
  select.disabled = !configState.cursorConfigured || !!running;
}

function selectedWorkspaceModel() {
  const select = document.getElementById('workspaceCursorModel');
  return select && select.value ? select.value : '';
}

async function saveWorkspacePreferredModel(model) {
  const featureId = uiState.workspaceFeatureId;
  if (!featureId) return;
  const res = await fetch(`${API}/features/${encodeURIComponent(featureId)}/preferred-model`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || '' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save model preference');
  }
  const data = await res.json();
  if (data.workspace) renderWorkspace(data.workspace);
}

async function startPlanning() {
  const featureId = uiState.workspaceFeatureId;
  if (!featureId) return;
  const model = selectedWorkspaceModel();
  const modelLabel = model || configState.cursorModel || 'default';
  const ok = window.confirm(
    `Start a local Cursor agent (${modelLabel}) to write the plan and tasks for ${featureId}? This spends Cursor usage. It will not implement product code.`
  );
  if (!ok) return;
  const body = { confirmed: true };
  if (model) body.model = model;
  const data = await postWorkflow('/start-planning', body, 'Failed to start planning');
  renderWorkspace(data.workspace);
  await load();
  toast('Planning agent started');
}

async function saveArtifact(kind) {
  const featureId = uiState.workspaceFeatureId;
  if (!featureId) return;
  const content = kind === 'plan'
    ? document.getElementById('planEditor').value
    : document.getElementById('tasksEditor').value;
  const res = await fetch(`${API}/features/${encodeURIComponent(featureId)}/artifacts`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save artifact');
  }
  const data = await res.json();
  renderWorkspace(data.workspace);
  toast(kind === 'plan' ? 'Plan saved' : 'Tasks saved');
}

async function approvePlan() {
  const featureId = uiState.workspaceFeatureId;
  if (!featureId) return;
  const ok = window.confirm(
    `Approve the plan and tasks for ${featureId}? This records approval only. It does not start implementation.`
  );
  if (!ok) return;
  const res = await fetch(`${API}/features/${encodeURIComponent(featureId)}/approve-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmed: true }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to approve plan');
  }
  const data = await res.json();
  renderWorkspace(data.workspace);
  await load();
  toast('Plan approved. Start implementation when you are ready.');
}

async function sendRevision() {
  const featureId = uiState.workspaceFeatureId;
  if (!featureId) return;
  const note = document.getElementById('revisionNote').value.trim();
  if (!note) {
    toast('Enter a revision note first', 'error');
    return;
  }
  const model = selectedWorkspaceModel();
  const modelLabel = model || configState.cursorModel || 'default';
  const ok = window.confirm(
    `Send this revision to the Cursor agent (${modelLabel}) for ${featureId}? It will edit plan and task files only.`
  );
  if (!ok) return;
  const body = { confirmed: true, note };
  if (model) body.model = model;
  const data = await postWorkflow('/revise', body, 'Failed to start revision');
  renderWorkspace(data.workspace);
  await load();
  toast('Revision agent started');
}

async function startImplement() {
  const featureId = uiState.workspaceFeatureId;
  if (!featureId) return;
  const model = selectedWorkspaceModel();
  const modelLabel = model || configState.cursorModel || 'default';
  const ok = window.confirm(
    `Start implementation for ${featureId} with Cursor model ${modelLabel}? This writes product code from the approved plan.`
  );
  if (!ok) return;
  const body = { confirmed: true };
  if (model) body.model = model;
  const data = await postWorkflow('/implement', body, 'Failed to start implementation');
  renderWorkspace(data.workspace);
  await load();
  toast('Implementation agent started');
}

function fillShipDraft(featureId, ship, force) {
  const titleEl = document.getElementById('shipTitle');
  const bodyEl = document.getElementById('shipBody');
  const hintEl = document.getElementById('shipDraftHint');
  const filesBlock = document.getElementById('shipFilesBlock');
  const filesEl = document.getElementById('shipFiles');
  if (uiState.shipDraftFeatureId !== featureId) {
    uiState.shipDraftFeatureId = featureId;
    uiState.shipDraftDirty = false;
  }
  hintEl.textContent = ship.draftSource === 'completion-summary'
    ? '(generated from the completion summary)'
    : '(generated draft — edit before creating)';
  if (force || !uiState.shipDraftDirty) {
    titleEl.value = ship.draftTitle || '';
    bodyEl.value = ship.draftBody || '';
    if (force) uiState.shipDraftDirty = false;
  }
  const files = Array.isArray(ship.files) ? ship.files : [];
  if (files.length) {
    filesBlock.hidden = false;
    filesEl.innerHTML = files.map((filePath) => `<li>${escapeHtml(filePath)}</li>`).join('');
  } else {
    filesBlock.hidden = true;
    filesEl.innerHTML = '';
  }
}

function markShipDraftDirty() {
  uiState.shipDraftDirty = true;
}

async function createMergeRequest() {
  const featureId = uiState.workspaceFeatureId;
  if (!featureId) return;
  const title = document.getElementById('shipTitle').value.trim();
  const body = document.getElementById('shipBody').value.trim();
  if (!title || !body) {
    toast('Edit the generated PR title and description before creating the draft.', 'error');
    return;
  }
  const ok = window.confirm(
    `Create a draft PR for ${featureId} with the title and description in the Ship tab? This commits current work except local secrets, pushes the branch, and opens a draft merge request. It will not merge.`
  );
  if (!ok) return;
  const data = await postWorkflow('/ship', { confirmed: true, title, body }, 'Failed to create merge request');
  uiState.shipDraftDirty = false;
  renderWorkspace(data.workspace);
  await load();
  toast(data.reused ? 'Existing draft PR updated' : 'Draft PR created');
}

function resetShipDraft() {
  if (!uiState.workspaceFeatureId) return;
  fetchWorkspace(uiState.workspaceFeatureId).then((payload) => {
    fillShipDraft(uiState.workspaceFeatureId, payload.ship || {}, true);
    toast('Restored the generated PR description');
  }).catch((err) => toast(err.message || 'Failed to restore draft', 'error'));
}

async function copyMergeRequest() {
  const link = document.getElementById('shipMrLink');
  const url = link && link.href && link.href !== window.location.href ? link.href : '';
  if (!url || url.endsWith('#')) {
    toast('No merge request link yet', 'error');
    return;
  }
  await navigator.clipboard.writeText(url);
  toast('Copied merge request link');
}

async function cancelRun() {
  const featureId = uiState.workspaceFeatureId;
  if (!featureId) return;
  const ok = window.confirm(`Cancel the in-flight Cursor run for ${featureId}?`);
  if (!ok) return;
  const data = await postWorkflow('/cancel', { confirmed: true }, 'Failed to cancel run');
  renderWorkspace(data.workspace);
  await load();
  toast('Cancel requested');
}

function openCreateModal(preselectedCategoryTitleOrEvent) {
  const preselectedCategoryTitle =
    typeof preselectedCategoryTitleOrEvent === 'string' ? preselectedCategoryTitleOrEvent : null;

  document.getElementById('modalTitle').textContent = 'Create New Feature';
  document.getElementById('editFeatureId').value = '';
  document.getElementById('featureId').value = '';
  document.getElementById('featureId').disabled = false;
  document.getElementById('title').value = '';
  document.getElementById('description').value = '';
  document.getElementById('phase').value = '-';
  document.getElementById('planDocument').value = '-';
  document.getElementById('notes').value = '';
  document.getElementById('status').value = '📋 Planned';

  const sel = document.getElementById('category');
  sel.innerHTML = '<option value="">-- Select or type new --</option>';
  for (const c of state.categories) {
    sel.appendChild(new Option(c.title, c.title));
  }
  sel.value =
    preselectedCategoryTitle && state.categories.some((c) => c.title === preselectedCategoryTitle)
      ? preselectedCategoryTitle
      : '';
  document.getElementById('newCategory').value = '';
  document.getElementById('newCategory').style.display = 'block';
  sel.dispatchEvent(new Event('change'));

  populateAssigneeList();
  document.getElementById('assignee').value = '-';
  document.getElementById('assigneeOther').value = '';
  document.getElementById('assigneeOther').style.display = 'none';

  document.getElementById('featureModal').classList.add('open');
}

function openEditModal(feature) {
  document.getElementById('modalTitle').textContent = 'Update Feature';
  document.getElementById('editFeatureId').value = feature.featureId;
  document.getElementById('featureId').value = feature.featureId;
  document.getElementById('featureId').disabled = true;
  document.getElementById('title').value = feature.title;
  document.getElementById('description').value = feature.description || '';
  document.getElementById('phase').value = feature.phase || '-';
  document.getElementById('planDocument').value = feature.planDocument || '-';
  document.getElementById('notes').value = feature.notes || '';
  document.getElementById('status').value = feature.status || '📋 Planned';

  const sel = document.getElementById('category');
  sel.innerHTML = '<option value="">-- Select or type new --</option>';
  for (const c of state.categories) {
    sel.appendChild(new Option(c.title, c.title));
  }
  sel.value = feature.categoryTitle || '';
  document.getElementById('newCategory').value = '';
  document.getElementById('newCategory').style.display = 'none';

  populateAssigneeList();
  const assigneeVal = feature.assignee || '-';
  document.getElementById('assignee').value = getExistingAssignees().includes(assigneeVal) ? assigneeVal : (assigneeVal !== '-' ? ASSIGNEE_OTHER_VALUE : '-');
  document.getElementById('assigneeOther').value = assigneeVal !== '-' && !getExistingAssignees().includes(assigneeVal) ? assigneeVal : '';
  document.getElementById('assigneeOther').style.display = document.getElementById('assignee').value === ASSIGNEE_OTHER_VALUE ? 'block' : 'none';

  document.getElementById('featureModal').classList.add('open');
}

function getSelectedCategory() {
  const sel = document.getElementById('category');
  const newCat = document.getElementById('newCategory').value.trim();
  if (newCat) return newCat;
  return sel.value || null;
}

function getExistingAssignees() {
  const assignees = new Set();
  for (const cat of state.categories) {
    for (const f of cat.features) {
      if (f.assignee && f.assignee !== '-') assignees.add(f.assignee);
    }
  }
  return Array.from(assignees).sort();
}

const ASSIGNEE_OTHER_VALUE = '__other__';

function populateAssigneeList() {
  const sel = document.getElementById('assignee');
  sel.innerHTML = '<option value="-">-</option>';
  for (const a of getExistingAssignees()) {
    sel.appendChild(new Option(a, a));
  }
  sel.appendChild(new Option('Other...', ASSIGNEE_OTHER_VALUE));
}

/** Derive prefix from category title when category has no features yet */
function inferPrefixFromCategoryTitle(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('refactor')) return 'REF';
  if (t.includes('devops')) return 'OPS';
  if (t.includes('database') || t.includes('infrastructure')) return 'DB';
  if (t.includes('user experience') || t.includes('ux')) return 'UX';
  if (t.includes('cost') || t.includes('model')) return 'COST';
  if (t.includes('ingestion') || t.includes('collection')) return 'ING';
  if (t.includes('evaluation') || t.includes('eval')) return 'EVAL';
  if (t.includes('agent setup') || t.includes('agent')) return 'AGENT';
  if (t.includes('sdk')) return 'SDK';
  if (t.includes('skill') || t.includes('claude')) return 'SKILL';
  if (t.includes('dashboard')) return 'DASH';
  if (t.includes('trace')) return 'TRACE';
  if (t.includes('log')) return 'LOG';
  if (t.includes('settings')) return 'SET';
  return 'NEW';
}

/** Get next feature ID for a category: PREFIX-(maxNumber+1) */
function getNextFeatureId(categoryTitle) {
  const cat = state.categories.find((c) => c.title === categoryTitle);
  let prefix = 'NEW';
  let maxNum = 0;

  if (cat && cat.features.length > 0) {
    const match = cat.features[0].featureId.match(/^([A-Za-z]+)-(\d+)$/);
    if (match) {
      prefix = match[1].toUpperCase();
      for (const f of state.categories.flatMap((c) => c.features)) {
        const m = f.featureId.match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
    }
  } else {
    prefix = inferPrefixFromCategoryTitle(categoryTitle);
    for (const f of state.categories.flatMap((c) => c.features)) {
      const m = f.featureId.match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
  }

  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
}

function updateFeatureIdFromCategory() {
  const categoryTitle = getSelectedCategory();
  if (!categoryTitle) {
    document.getElementById('featureId').value = '';
    return;
  }
  if (document.getElementById('editFeatureId').value) return;
  document.getElementById('featureId').value = getNextFeatureId(categoryTitle);
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const isEdit = !!document.getElementById('editFeatureId').value;
  const featureId = document.getElementById('featureId').value.trim();
  const title = document.getElementById('title').value.trim();
  const description = document.getElementById('description').value.trim();
  const phase = document.getElementById('phase').value.trim() || '-';
  const status = document.getElementById('status').value;
  const assigneeSel = document.getElementById('assignee').value;
  const assignee = assigneeSel === ASSIGNEE_OTHER_VALUE
    ? document.getElementById('assigneeOther').value.trim() || '-'
    : (assigneeSel || '-');
  const planDocument = document.getElementById('planDocument').value.trim() || '-';
  const notes = document.getElementById('notes').value.trim() || '';
  const categoryTitle = getSelectedCategory();

  if (!categoryTitle) {
    toast('Please select or enter a category', 'error');
    return;
  }

  if (isEdit) {
    const oldId = document.getElementById('editFeatureId').value;
    let found = false;
    for (const cat of state.categories) {
      const f = cat.features.find((x) => x.featureId === oldId);
      if (f) {
        f.title = title;
        f.description = description;
        f.phase = phase;
        f.status = status;
        f.assignee = assignee;
        f.planDocument = planDocument;
        f.notes = notes;
        if (categoryTitle !== cat.title) {
          cat.features = cat.features.filter((x) => x.featureId !== oldId);
          let target = state.categories.find((c) => c.title === categoryTitle);
          if (!target) {
            target = { title: categoryTitle, description: '', features: [] };
            state.categories.push(target);
          }
          target.features.push({ ...f, categoryTitle });
        } else {
          f.categoryTitle = categoryTitle;
        }
        found = true;
        break;
      }
    }
    if (!found) {
      toast('Feature not found', 'error');
      return;
    }
  } else {
    const exists = state.categories.some((c) =>
      c.features.some((f) => f.featureId === featureId)
    );
    if (exists) {
      toast('Feature ID already exists', 'error');
      return;
    }
    let target = state.categories.find((c) => c.title === categoryTitle);
    if (!target) {
      target = { title: categoryTitle, description: '', features: [] };
      state.categories.push(target);
    }
    target.features.push({
      featureId,
      title,
      description,
      phase,
      status,
      assignee,
      planDocument,
      notes,
      categoryTitle,
    });
  }

  document.getElementById('featureModal').classList.remove('open');
  await persist();
  renderMainView();
  toast(isEdit ? 'Feature updated' : 'Feature created');
}

async function load() {
  try {
    state = await fetchFeatures();
    renderMainView();
    if (typeof window.syncJarvis === 'function') window.syncJarvis();
  } catch (err) {
    toast(err.message || 'Failed to load', 'error');
  }
}

async function addCategory() {
  const name = (window.prompt('New category name (e.g. "🧪 Quality & Testing")') || '').trim();
  if (!name) return;

  const exists = state.categories.some((c) => (c.title || '').trim().toLowerCase() === name.toLowerCase());
  if (exists) {
    toast('Category already exists', 'error');
    return;
  }

  state.categories.push({ title: name, description: '', features: [] });
  await persist();
  renderMainView();
  toast('Category added');
}

document.getElementById('applyFeaturesFile')?.addEventListener('click', async () => {
  try {
    const select = document.getElementById('featuresFileSelect');
    if (!select) return;

    const selected = select.value;
    if (!selected) {
      toast('Please select a FEATURES.md file', 'error');
      return;
    }
    await updateConfig(selected);
    toast('Switched FEATURES.md');
    await initConfigUi();
    await load();
  } catch (err) {
    toast(err.message || 'Failed to switch FEATURES.md', 'error');
  }
});

document.getElementById('browseFeaturesFile')?.addEventListener('click', async () => {
  try {
    const result = await browseForFeaturesFile();
    if (result && result.cancelled) return;
    toast('Switched FEATURES.md');
    await initConfigUi();
    await load();
  } catch (err) {
    toast(err.message || 'Failed to browse for FEATURES.md', 'error');
  }
});

document.getElementById('createFeaturesFile')?.addEventListener('click', async () => {
  try {
    const fileName = (window.prompt('New features file name (e.g. FEATURES_EXAMPLES.md)') || '').trim();
    if (!fileName) return;
    await createFeaturesFile(fileName);
    toast('Created and switched file');
    await initConfigUi();
    await load();
  } catch (err) {
    toast(err.message || 'Failed to create features file', 'error');
  }
});

document.getElementById('createFeature').addEventListener('click', openCreateModal);
document.getElementById('addCategory')?.addEventListener('click', () => {
  addCategory().catch((err) => toast(err.message || 'Failed to add category', 'error'));
});
document.getElementById('refresh').addEventListener('click', load);
document.getElementById('viewBoard')?.addEventListener('click', () => setMainView('board'));
document.getElementById('viewProcess')?.addEventListener('click', () => setMainView('process'));
document.getElementById('viewGraph')?.addEventListener('click', () => setMainView('graph'));
document.getElementById('graphMode2d')?.addEventListener('click', () => setGraphMode('2d'));
document.getElementById('graphMode3d')?.addEventListener('click', () => setGraphMode('3d'));
document.getElementById('openSettings').addEventListener('click', () => openSettings());
document.getElementById('closeSettings').addEventListener('click', closeSettings);
document.getElementById('openGithubSettingsFromShip').addEventListener('click', openGithubSettings);
document.querySelectorAll('.settings-tab').forEach((button) => {
  button.addEventListener('click', () => setSettingsTab(button.dataset.settingsTab));
});
document.getElementById('settings').addEventListener('click', (e) => {
  if (e.target.id === 'settings') closeSettings();
});
document.getElementById('githubSettingsForm').addEventListener('submit', (event) => {
  saveGithubSettings(event).catch((err) => toast(err.message || 'Failed to save GitHub token', 'error'));
});
document.getElementById('clearGithubSettings').addEventListener('click', () => {
  clearGithubSettings().catch((err) => toast(err.message || 'Failed to remove GitHub token', 'error'));
});
document.getElementById('cursorSettingsForm').addEventListener('submit', (event) => {
  saveCursorSettings(event).catch((err) => toast(err.message || 'Failed to save Cursor key', 'error'));
});
document.getElementById('clearCursorSettings').addEventListener('click', () => {
  clearCursorSettings().catch((err) => toast(err.message || 'Failed to remove Cursor key', 'error'));
});
document.getElementById('refreshCursorModels').addEventListener('click', () => {
  refreshCursorModels().catch((err) => toast(err.message || 'Failed to refresh Cursor models', 'error'));
});
document.getElementById('jarvisVoiceSelect')?.addEventListener('change', () => {
  const voiceId = document.getElementById('jarvisVoiceSelect').value;
  configState.jarvisVoiceId = voiceId;
  syncJarvisVoiceWindow();
  renderXaiSettingsStatus();
  if (typeof window.syncJarvis === 'function') window.syncJarvis();
  saveJarvisVoiceChoice(voiceId).catch((err) => toast(err.message || 'Failed to save voice', 'error'));
});
document.getElementById('xaiSettingsForm')?.addEventListener('submit', (event) => {
  saveXaiSettings(event).catch((err) => toast(err.message || 'Failed to save xAI key', 'error'));
});
document.getElementById('clearXaiSettings')?.addEventListener('click', () => {
  clearXaiSettings().catch((err) => toast(err.message || 'Failed to remove xAI key', 'error'));
});
document.getElementById('openaiSettingsForm')?.addEventListener('submit', (event) => {
  saveOpenAiSettings(event).catch((err) => toast(err.message || 'Failed to save OpenAI key', 'error'));
});
document.getElementById('clearOpenaiSettings')?.addEventListener('click', () => {
  clearOpenAiSettings().catch((err) => toast(err.message || 'Failed to remove OpenAI key', 'error'));
});
document.getElementById('closeModal').addEventListener('click', () =>
  document.getElementById('featureModal').classList.remove('open')
);
document.getElementById('cancelModal').addEventListener('click', () =>
  document.getElementById('featureModal').classList.remove('open')
);
document.getElementById('featureForm').addEventListener('submit', handleFormSubmit);

document.getElementById('category').addEventListener('change', function () {
  const newCat = document.getElementById('newCategory');
  newCat.style.display = this.value === '' ? 'block' : 'none';
  if (this.value) newCat.value = '';
  updateFeatureIdFromCategory();
});

document.getElementById('assignee').addEventListener('change', function () {
  document.getElementById('assigneeOther').style.display = this.value === ASSIGNEE_OTHER_VALUE ? 'block' : 'none';
  if (this.value !== ASSIGNEE_OTHER_VALUE) document.getElementById('assigneeOther').value = '';
});

document.getElementById('newCategory').addEventListener('input', updateFeatureIdFromCategory);
document.getElementById('newCategory').addEventListener('blur', updateFeatureIdFromCategory);

document.getElementById('closeWorkspace').addEventListener('click', closeWorkspace);
document.querySelectorAll('[data-preview-for]').forEach((button) => {
  button.addEventListener('click', () => setArtifactView(button.dataset.previewFor, 'preview'));
});
document.querySelectorAll('[data-edit-for]').forEach((button) => {
  button.addEventListener('click', () => setArtifactView(button.dataset.editFor, 'edit'));
});
document.getElementById('startPlanning').addEventListener('click', () => {
  startPlanning().catch((err) => toast(err.message || 'Failed to start planning', 'error'));
});
document.getElementById('workspaceCursorModel')?.addEventListener('change', () => {
  const model = selectedWorkspaceModel();
  saveWorkspacePreferredModel(model).catch((err) => toast(err.message || 'Failed to save model', 'error'));
});
document.getElementById('approvePlan').addEventListener('click', () => {
  approvePlan().catch((err) => toast(err.message || 'Failed to approve plan', 'error'));
});
document.getElementById('sendRevision').addEventListener('click', () => {
  sendRevision().catch((err) => toast(err.message || 'Failed to revise', 'error'));
});
document.getElementById('startImplement').addEventListener('click', () => {
  startImplement().catch((err) => toast(err.message || 'Failed to start implementation', 'error'));
});
document.getElementById('cancelRun').addEventListener('click', () => {
  cancelRun().catch((err) => toast(err.message || 'Failed to cancel', 'error'));
});
document.getElementById('markComplete').addEventListener('click', () => {
  markFeatureComplete().catch((err) => toast(err.message || 'Failed to mark complete', 'error'));
});
document.getElementById('markCompleteFromShip').addEventListener('click', () => {
  markFeatureComplete().catch((err) => toast(err.message || 'Failed to mark complete', 'error'));
});
document.getElementById('createMergeRequest').addEventListener('click', () => {
  createMergeRequest().catch((err) => toast(err.message || 'Failed to create merge request', 'error'));
});
document.getElementById('resetShipDraft').addEventListener('click', resetShipDraft);
document.getElementById('shipTitle').addEventListener('input', markShipDraftDirty);
document.getElementById('shipBody').addEventListener('input', markShipDraftDirty);
document.getElementById('copyMergeRequest').addEventListener('click', () => {
  copyMergeRequest().catch((err) => toast(err.message || 'Failed to copy link', 'error'));
});
document.getElementById('savePlan').addEventListener('click', () => {
  saveArtifact('plan').catch((err) => toast(err.message || 'Failed to save plan', 'error'));
});
document.getElementById('saveTasks').addEventListener('click', () => {
  saveArtifact('tasks').catch((err) => toast(err.message || 'Failed to save tasks', 'error'));
});
document.getElementById('editFeatureFromWorkspace').addEventListener('click', () => {
  const feature = findFeatureById(uiState.workspaceFeatureId);
  if (feature) openEditModal(feature);
});
document.getElementById('copyBranch').addEventListener('click', () => {
  copyFeatureBranch().catch((err) => toast(err.message || 'Failed to copy branch', 'error'));
});
document.getElementById('checkoutBranch').addEventListener('click', () => {
  checkoutFeatureBranch().catch((err) => toast(err.message || 'Failed to check out branch', 'error'));
});
document.querySelectorAll('.workspace-tab').forEach((button) => {
  button.addEventListener('click', () => setWorkspaceTab(button.dataset.tab));
});
document.getElementById('workspace').addEventListener('click', (e) => {
  if (e.target.id === 'workspace') closeWorkspace();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!document.getElementById('settings').hidden) {
      closeSettings();
      return;
    }
    if (!document.getElementById('workspace').hidden) {
      if (document.getElementById('featureModal').classList.contains('open')) return;
      closeWorkspace();
    }
  }
});

const searchEl = document.getElementById('searchFeatures');
if (searchEl) {
  searchEl.addEventListener('input', () => {
    uiState.searchQuery = searchEl.value;
    renderMainView();
  });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchEl.value = '';
      uiState.searchQuery = '';
      renderMainView();
    }
  });
}

load();
initConfigUi();
