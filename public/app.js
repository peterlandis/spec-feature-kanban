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
};

let configState = {
  featuresPath: null,
  usingEnvOverride: false,
  candidates: [],
  browseSupported: false,
};

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
    };
    renderFeaturesFileSelector();
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

function renderCard(feature, categoryTitle) {
  const div = document.createElement('div');
  div.className = 'card';
  div.draggable = true;
  div.dataset.featureId = feature.featureId;
  div.dataset.category = feature.categoryTitle;
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
    <div class="card-actions">
      <button type="button" data-action="edit">Edit</button>
      <button type="button" data-action="delete">Delete</button>
    </div>
  `;

  div.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ feature, fromColumn: categoryTitle }));
    e.dataTransfer.effectAllowed = 'move';
    div.classList.add('dragging');
  });
  div.addEventListener('dragend', () => div.classList.remove('dragging'));

  div.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(feature);
  });

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
    colEl.className = 'column';
    colEl.dataset.column = col.key;

    const isCategoryColumn = col.key !== COL_WIP && col.key !== COL_COMPLETE;
    const cat = isCategoryColumn ? state.categories.find((c) => c.title === col.key) : null;
    const hasAnyFeaturesInCategory = !!(isCategoryColumn && cat && (cat.features || []).length > 0);

    colEl.innerHTML = `
      <div class="column-header ${col.css}">
        <div class="column-header-row">
          <span class="column-title">${escapeHtml(col.title)}</span>
          ${isCategoryColumn
            ? `<button type="button" class="column-delete ${hasAnyFeaturesInCategory ? 'is-disabled' : ''}" data-action="delete-category" title="${hasAnyFeaturesInCategory ? 'Category is not empty' : 'Delete empty category'}">Delete</button>`
            : ''
          }
        </div>
      </div>
      <div class="column-cards" data-column="${col.key}"></div>
    `;

    const cardsContainer = colEl.querySelector('.column-cards');
    const features = getFeaturesForColumn(col.key);

    for (const f of features) {
      const displayCategory = col.key === COL_WIP || col.key === COL_COMPLETE ? f.categoryTitle : col.key;
      cardsContainer.appendChild(renderCard(f, displayCategory));
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

function openCreateModal() {
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
  sel.value = '';
  document.getElementById('newCategory').value = '';
  document.getElementById('newCategory').style.display = 'block';

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
