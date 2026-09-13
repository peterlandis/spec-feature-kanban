/**
 * Small markdown-to-HTML renderer for spec artifacts.
 * Escapes HTML first so preview does not execute script.
 */
(function (root) {
  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderInline(text) {
    let html = escapeHtml(text);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    html = html.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return html;
  }

  function flushParagraph(out, lines) {
    if (!lines.length) return;
    out.push('<p>' + renderInline(lines.join(' ')) + '</p>');
    lines.length = 0;
  }

  function renderTable(rows) {
    if (rows.length < 2) return null;
    const header = rows[0];
    const body = rows.slice(2);
    const thead = '<thead><tr>' + header.map((cell) => '<th>' + renderInline(cell) + '</th>').join('') + '</tr></thead>';
    const tbody = '<tbody>' + body.map((row) => (
      '<tr>' + row.map((cell) => '<td>' + renderInline(cell) + '</td>').join('') + '</tr>'
    )).join('') + '</tbody>';
    return '<table>' + thead + tbody + '</table>';
  }

  function parseRow(line) {
    return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
  }

  function isSeparator(line) {
    return /^\|?[\s:|-]+\|[\s:|-]+/.test(line) && !/[A-Za-z0-9]/.test(line);
  }

  function renderMarkdown(source) {
    const text = String(source || '');
    if (!text.trim()) return '<p class="md-empty">Nothing to preview yet.</p>';

    const out = [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let i = 0;
    let paragraph = [];

    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith('```')) {
        flushParagraph(out, paragraph);
        const lang = escapeHtml(line.slice(3).trim());
        const code = [];
        i += 1;
        while (i < lines.length && !lines[i].startsWith('```')) {
          code.push(escapeHtml(lines[i]));
          i += 1;
        }
        out.push('<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' + code.join('\n') + '</code></pre>');
        i += 1;
        continue;
      }

      if (/^\s*\|.+\|/.test(line)) {
        flushParagraph(out, paragraph);
        const tableLines = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) {
          tableLines.push(lines[i]);
          i += 1;
        }
        const rows = tableLines.map(parseRow);
        if (tableLines[1] && isSeparator(tableLines[1])) {
          out.push(renderTable(rows));
        } else {
          tableLines.forEach((rowLine) => out.push('<p>' + renderInline(rowLine) + '</p>'));
        }
        continue;
      }

      if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
        flushParagraph(out, paragraph);
        out.push('<hr>');
        i += 1;
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph(out, paragraph);
        const level = heading[1].length;
        out.push('<h' + level + '>' + renderInline(heading[2]) + '</h' + level + '>');
        i += 1;
        continue;
      }

      const task = line.match(/^\s*[-*]\s+\[( |x|X)\]\s*(.*)$/);
      if (task) {
        flushParagraph(out, paragraph);
        const items = [];
        const start = i;
        while (i < lines.length) {
          const match = lines[i].match(/^\s*[-*]\s+\[( |x|X)\]\s*(.*)$/);
          if (!match) break;
          const checked = match[1].toLowerCase() === 'x' ? ' checked' : '';
          items.push('<li><label><input type="checkbox" disabled' + checked + '> ' + renderInline(match[2]) + '</label></li>');
          i += 1;
        }
        if (i === start) i += 1;
        out.push('<ul class="md-tasks">' + items.join('') + '</ul>');
        continue;
      }

      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      if (bullet) {
        flushParagraph(out, paragraph);
        const items = [];
        const start = i;
        while (i < lines.length) {
          const match = lines[i].match(/^\s*[-*]\s+(.+)$/);
          if (!match || /^\s*[-*]\s+\[[ xX]\]/.test(lines[i])) break;
          items.push('<li>' + renderInline(match[1]) + '</li>');
          i += 1;
        }
        if (i === start) i += 1;
        out.push('<ul>' + items.join('') + '</ul>');
        continue;
      }

      const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
      if (ordered) {
        flushParagraph(out, paragraph);
        const items = [];
        const start = i;
        while (i < lines.length) {
          const match = lines[i].match(/^\s*\d+\.\s+(.+)$/);
          if (!match) break;
          items.push('<li>' + renderInline(match[1]) + '</li>');
          i += 1;
        }
        if (i === start) i += 1;
        out.push('<ol>' + items.join('') + '</ol>');
        continue;
      }

      if (line.startsWith('>')) {
        flushParagraph(out, paragraph);
        const quote = [];
        while (i < lines.length && lines[i].startsWith('>')) {
          quote.push(lines[i].replace(/^>\s?/, ''));
          i += 1;
        }
        out.push('<blockquote>' + renderInline(quote.join(' ')) + '</blockquote>');
        continue;
      }

      if (!line.trim()) {
        flushParagraph(out, paragraph);
        i += 1;
        continue;
      }

      paragraph.push(line.trim());
      i += 1;
    }

    flushParagraph(out, paragraph);
    return out.join('\n');
  }

  root.renderMarkdown = renderMarkdown;
})(window);
