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
};

let workspacePollTimer = null;

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
  uiState.settingsTab = tab === 'github' ? 'github' : 'ide';
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
  renderCursorSettingsStatus();
  renderGithubSettingsStatus();
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
    };
    renderFeaturesFileSelector();
    renderCursorSettingsStatus();
    renderGithubSettingsStatus();
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

function pipelineChip(status) {
  const value = status || '';
  if (value.includes('Planning')) return { label: 'planning', cls: 'chip-planning' };
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
  const chip = pipelineChip(feature.status);
  const chipHtml = chip
    ? `<span class="pipeline-chip ${chip.cls}">${escapeHtml(chip.label)}</span>`
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
  renderColumns();
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
  renderColumns();
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
  renderColumns();
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
  const mapped = feature ? pipelineChip(feature.status) : null;
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

function renderWorkspace(payload) {
  const feature = payload.feature;
  uiState.workspaceFeatureId = feature.featureId;
  document.getElementById('workspaceFeatureId').textContent = feature.featureId;
  document.getElementById('workspaceTitle').textContent = feature.title;
  document.getElementById('workspaceStatus').textContent = feature.status;

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
  hint.textContent = configured
    ? `Local Cursor agent (${configState.cursorModel || 'composer-2.5'}). One run per repo.`
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

async function startPlanning() {
  const featureId = uiState.workspaceFeatureId;
  if (!featureId) return;
  const ok = window.confirm(
    `Start a local Cursor agent to write the plan and tasks for ${featureId}? This spends Cursor usage. It will not implement product code.`
  );
  if (!ok) return;
  const data = await postWorkflow('/start-planning', { confirmed: true }, 'Failed to start planning');
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
  const ok = window.confirm(
    `Send this revision to the Cursor agent for ${featureId}? It will edit plan and task files only.`
  );
  if (!ok) return;
  const data = await postWorkflow('/revise', { confirmed: true, note }, 'Failed to start revision');
  renderWorkspace(data.workspace);
  await load();
  toast('Revision agent started');
}

async function startImplement() {
  const featureId = uiState.workspaceFeatureId;
  if (!featureId) return;
  const ok = window.confirm(
    `Start implementation for ${featureId} with the local Cursor agent? This writes product code from the approved plan.`
  );
  if (!ok) return;
  const data = await postWorkflow('/implement', { confirmed: true }, 'Failed to start implementation');
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
  renderColumns();
  toast(isEdit ? 'Feature updated' : 'Feature created');
}

async function load() {
  try {
    state = await fetchFeatures();
    renderColumns();
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
  renderColumns();
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
    renderColumns();
  });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchEl.value = '';
      uiState.searchQuery = '';
      renderColumns();
    }
  });
}

load();
initConfigUi();
