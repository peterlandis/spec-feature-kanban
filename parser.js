/**
 * Parser for FEATURES.md - extracts categories and features from markdown tables.
 */

const STATUS_COMPLETE = '✅ Complete';
const STATUS_WIP = '🔨 WorkInProgress';

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

/**
 * Parse FEATURES.md content into structured data.
 */
export function parseFeaturesMd(content) {
  const lines = content.split('\n');
  const categories = [];
  let currentCategory = null;
  let tableColumns = null;
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
      tableColumns = null;
      continue;
    }

    if (h4Match && currentCategory) {
      currentCategory.title = currentCategory.title + ' – ' + h4Match[1].trim();
      continue;
    }

    if (!currentCategory) continue;

    if (line.startsWith('| Feature ID |') || line.startsWith('| Feature ID |')) {
      tableColumns = parseTableRow(line);
      continue;
    }

    if (isTableSeparator(line)) continue;

    if (tableColumns && line.startsWith('|') && line.includes('|')) {
      const cells = parseTableRow(line);
      if (cells.length >= 5) {
        const featureId = stripBold(cells[0] || '');
        const title = stripBold(cells[1] || '');
        const description = stripBold(cells[2] || '');
        const phase = stripBold(cells[3] || '-');
        const status = normalizeStatus(cells[4] || '');
        const assignee = stripBold(cells[5] || '-');
        const planDocument = stripBold(cells[6] || '-');
        const notes = stripBold(cells[7] || '');

        if (featureId && title) {
          currentCategory.features.push({
            featureId,
            title,
            description,
            phase,
            status,
            assignee,
            planDocument,
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

/**
 * Serialize categories and features back to markdown.
 */
export function serializeToMarkdown(parsed, preamble, postamble) {
  const sections = [];

  for (const cat of parsed.categories) {
    sections.push(`### ${cat.title}`);
    if (cat.description) {
      sections.push('');
      sections.push(cat.description);
      sections.push('');
    }
    sections.push('| Feature ID | Title | Description | Phase | Status | Assignee | Plan Document | Notes |');
    sections.push('|------------|-------|-------------|-------|--------|----------|---------------|-------|');
    for (const f of cat.features) {
      const row = [
        f.featureId,
        f.title,
        f.description,
        f.phase || '-',
        f.status || '📋 Planned',
        f.assignee || '-',
        f.planDocument || '-',
        f.notes || '',
      ].join(' | ');
      sections.push('| ' + row + ' |');
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
