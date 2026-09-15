/**
 * FEATURES.md parser — categories and feature tables.
 * Standard columns (CORE-033):
 * Feature ID | Title | Description | Phase | Status | Assignee | Plan Document | Depends | Notes
 */

const STATUS_COMPLETE = '✅ Complete';
const STATUS_WIP = '🔨 WorkInProgress';

export const STANDARD_FEATURE_HEADERS = [
  'Feature ID',
  'Title',
  'Description',
  'Phase',
  'Status',
  'Assignee',
  'Plan Document',
  'Depends',
  'Notes',
];

const FIELD_ALIASES = {
  featureId: ['feature id', 'id', 'feature'],
  title: ['title', 'name'],
  description: ['description', 'desc', 'summary'],
  phase: ['phase'],
  status: ['status'],
  assignee: ['assignee', 'owner'],
  planDocument: ['plan document', 'plan', 'plan doc', 'document'],
  depends: ['depends', 'depends on', 'dependencies', 'dependency', 'deps'],
  notes: ['notes', 'note', 'comments'],
};

/**
 * Parse a markdown table row into cells (handles pipes and escaped content).
 */
function parseTableRow(line) {
  const cells = [];
  let current = '';
  let inPipe = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '|') {
      if (inPipe) {
        cells.push(current.trim());
        current = '';
      }
      inPipe = true;
    } else if (inPipe) {
      current += c;
    }
  }
  if (current) cells.push(current.trim());
  return cells;
}

/**
 * Check if a line is a markdown table separator (|---|---|).
 */
function isTableSeparator(line) {
  return /^\|[\s\-:]+\|/.test(line);
}

/**
 * Normalize status string (trim, handle variations).
 */
function normalizeStatus(s) {
  const t = (s || '').trim();
  if (t.includes('Complete')) return STATUS_COMPLETE;
  if (t.includes('WorkInProgress')) return STATUS_WIP;
  if (t.includes('Testing')) return '🧪 Testing';
  if (t.includes('ReadyToMerge')) return '🟢 ReadyToMerge';
  if (t.includes('PlanReview')) return '👀 PlanReview';
  if (t.includes('Planning')) return '📝 Planning';
  if (t.includes('Planned')) return '📋 Planned';
  if (t.includes('Blocked')) return '🚫 Blocked';
  if (t.includes('Paused')) return '⏸️ Paused';
  return t || '📋 Planned';
}

/**
 * Strip bold markers from text.
 */
function stripBold(text) {
  return (text || '').replace(/\*\*/g, '').trim();
}

function normalizeHeaderKey(raw) {
  return String(raw || '')
    .replace(/\*\*/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Map header labels to field names. Supports legacy tables without Depends.
 */
export function mapHeaderIndexes(headerCells) {
  const indexes = {};
  const used = new Set();
  const normalized = (headerCells || []).map((cell, index) => ({
    index,
    key: normalizeHeaderKey(cell),
  }));

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const match = normalized.find((item) => !used.has(item.index) && aliases.includes(item.key));
    if (match) {
      indexes[field] = match.index;
      used.add(match.index);
    }
  }

  // Legacy positional fallback when headers are the classic 8-column layout.
  if (indexes.featureId == null && headerCells && headerCells.length >= 5) {
    indexes.featureId = 0;
    indexes.title = 1;
    indexes.description = 2;
    indexes.phase = 3;
    indexes.status = 4;
    if (headerCells.length >= 6) indexes.assignee = 5;
    if (headerCells.length >= 7) indexes.planDocument = 6;
    if (headerCells.length >= 9) {
      indexes.depends = 7;
      indexes.notes = 8;
    } else if (headerCells.length >= 8) {
      indexes.notes = 7;
    }
  }

  return indexes;
}

function cellAt(cells, indexes, field, fallback = '') {
  const idx = indexes[field];
  if (idx == null || idx < 0 || idx >= cells.length) return fallback;
  return stripBold(cells[idx] || fallback);
}

/**
 * Parse FEATURES.md content into structured data.
 */
export function parseFeaturesMd(content) {
  const lines = content.split('\n');
  const categories = [];
  let currentCategory = null;
  let tableIndexes = null;
  let inFeatureCategories = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('## Feature Categories')) {
      inFeatureCategories = true;
      continue;
    }
    if (inFeatureCategories && (line.startsWith('## How to Use') || line.startsWith('## Feature Statistics'))) {
      break;
    }

    if (!inFeatureCategories) continue;

    const h3Match = line.match(/^### (.+)$/);
    const h4Match = line.match(/^## 🔹 (.+)$/);

    if (h3Match) {
      currentCategory = {
        title: h3Match[1].trim(),
        description: '',
        features: [],
        rawStart: i,
      };
      categories.push(currentCategory);
      tableIndexes = null;
      continue;
    }

    if (h4Match && currentCategory) {
      currentCategory.title = currentCategory.title + ' – ' + h4Match[1].trim();
      continue;
    }

    if (!currentCategory) continue;

    if (/^\|\s*Feature ID\s*\|/i.test(line) || /^\|\s*ID\s*\|/i.test(line)) {
      tableIndexes = mapHeaderIndexes(parseTableRow(line));
      continue;
    }

    if (isTableSeparator(line)) continue;

    if (tableIndexes && line.startsWith('|') && line.includes('|')) {
      const cells = parseTableRow(line);
      if (cells.length >= 5 && tableIndexes.featureId != null) {
        const featureId = cellAt(cells, tableIndexes, 'featureId');
        const title = cellAt(cells, tableIndexes, 'title');
        const description = cellAt(cells, tableIndexes, 'description');
        const phase = cellAt(cells, tableIndexes, 'phase', '-');
        const status = normalizeStatus(cellAt(cells, tableIndexes, 'status'));
        const assignee = cellAt(cells, tableIndexes, 'assignee', '-');
        const planDocument = cellAt(cells, tableIndexes, 'planDocument', '-');
        const depends = cellAt(cells, tableIndexes, 'depends', '-');
        const notes = cellAt(cells, tableIndexes, 'notes', '');

        if (featureId && title) {
          currentCategory.features.push({
            featureId,
            title,
            description,
            phase,
            status,
            assignee,
            planDocument,
            depends: depends || '-',
            notes,
            categoryTitle: currentCategory.title,
          });
        }
      }
    } else if (line.trim() && !line.startsWith('|') && currentCategory.features.length === 0) {
      currentCategory.description = (currentCategory.description + ' ' + line.trim()).trim();
    }
  }

  // Merge duplicate categories (e.g., Cost & Model Definitions appears twice)
  const byTitle = new Map();
  for (const cat of categories) {
    if (byTitle.has(cat.title)) {
      const existing = byTitle.get(cat.title);
      for (const f of cat.features) {
        if (!existing.features.some((e) => e.featureId === f.featureId)) {
          existing.features.push(f);
        }
      }
    } else {
      byTitle.set(cat.title, { ...cat, features: [...cat.features] });
    }
  }
  return { categories: Array.from(byTitle.values()) };
}

function escapeCell(value) {
  return String(value == null ? '' : value).replace(/\|/g, '\\|');
}

/**
 * Serialize categories and features back to markdown (always includes Depends).
 */
export function serializeToMarkdown(parsed, preamble, postamble) {
  const sections = [];
  const header = `| ${STANDARD_FEATURE_HEADERS.join(' | ')} |`;
  const separator = '|' + STANDARD_FEATURE_HEADERS.map(() => '-------').join('|') + '|';

  for (const cat of parsed.categories) {
    sections.push(`### ${cat.title}`);
    if (cat.description) {
      sections.push('');
      sections.push(cat.description);
      sections.push('');
    }
    sections.push(header);
    sections.push(separator);
    for (const f of cat.features) {
      const row = [
        f.featureId,
        f.title,
        f.description,
        f.phase || '-',
        f.status || '📋 Planned',
        f.assignee || '-',
        f.planDocument || '-',
        f.depends && String(f.depends).trim() ? f.depends : '-',
        f.notes || '',
      ].map(escapeCell);
      sections.push('| ' + row.join(' | ') + ' |');
    }
    sections.push('');
    sections.push('');
  }

  return preamble + '\n\n## Feature Categories\n\n' + sections.join('\n') + postamble;
}

/**
 * Extract preamble (everything before "## Feature Categories") and postamble (from "## How to Use" to end).
 */
export function extractPreambleAndPostamble(content) {
  const featureCategoriesIdx = content.indexOf('## Feature Categories');
  const howToUseIdx = content.indexOf('## How to Use This File');
  if (featureCategoriesIdx === -1 || howToUseIdx === -1) {
    return { preamble: content, postamble: '' };
  }
  const preamble = content.slice(0, featureCategoriesIdx).trim();
  const postamble = '\n\n' + content.slice(howToUseIdx).trim();
  return { preamble, postamble };
}

export function contentHasDependsHeader(content) {
  return /\|\s*Depends(?:\s+on)?\s*\|/i.test(String(content || ''))
    || /\|\s*Dependencies\s*\|/i.test(String(content || ''));
}
