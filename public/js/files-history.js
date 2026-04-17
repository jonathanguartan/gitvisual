import { defineList, getList } from './gvm/gvm-lists.js';
import { get } from './api.js';
import { escHtml, escAttr, relTime, toast, openModal, spinner } from './utils.js';
import { renderDiff, renderDiffSplit, getDiffMode } from './diff.js';
import { defineEditor, getEditor } from './gvm/gvm-editors.js';

let _fhSelected   = [];   // up to 2 selected hashes
let _fhFilePath   = null;
let _fhAllCommits = [];   // full list for ordering in diff comparisons

let _fhMaximized     = false;
let _fhListCollapsed = false;

// ─── Render ───────────────────────────────────────────────────────────────────

function _renderFhItem(c) {
  const pos = _fhSelected.indexOf(c.hash);
  let selClass = '';
  if (pos !== -1) {
    if (_fhSelected.length === 1) {
      selClass = ' active';
    } else {
      const sorted = _fhSelected.slice().sort(
        (a, b) => _fhAllCommits.findIndex(x => x.hash === b) - _fhAllCommits.findIndex(x => x.hash === a)
      );
      selClass = c.hash === sorted[0] ? ' fh-sel-from' : ' fh-sel-to';
    }
  }
  return `<div class="fh-row${selClass}" data-hash="${escAttr(c.hash)}">
    <div class="fh-row-meta">
      <span class="fh-row-hash">${escHtml(c.hash.slice(0, 7))}</span>
      <span>${escHtml(c.author_name)}</span>
      <span>${relTime(c.date)}</span>
    </div>
    <div class="fh-row-msg">${escHtml(c.message)}</div>
  </div>`;
}

// ─── Open File History ────────────────────────────────────────────────────────

export async function openFileHistory(filePath) {
  _fhSelected   = [];
  _fhFilePath   = filePath;
  _fhAllCommits = [];

  document.getElementById('fileHistoryName').textContent = filePath;
  document.getElementById('fileHistoryList').innerHTML   = spinner();
  getEditor('fileHistoryDiff')?.setHint('Selecciona un commit para ver sus cambios.<br><span style="color:var(--tx3)">Selecciona dos para comparar entre ellos.</span>');
  document.getElementById('fhSearch').value = '';
  _resetFhMaximize();
  _resetFhList();
  openModal('modalFileHistory');

  try {
    const data    = await get('/repo/log', { file: filePath, limit: '200' });
    const commits = data.all || [];
    _fhAllCommits = commits;
    getList('fileHistoryList')?.setItems(commits);
  } catch (e) { toast(e.message, 'error'); }
}

// ─── UI state ─────────────────────────────────────────────────────────────────

function _resetFhMaximize() {
  _fhMaximized = false;
  document.getElementById('modalFileHistoryBox').classList.remove('modal-maximized');
  const btn = document.getElementById('btnFhMaximize');
  if (btn) { btn.textContent = '⛶'; btn.title = 'Maximizar'; }
}

function _resetFhList() {
  _fhListCollapsed = false;
  document.querySelector('.fh-list-panel')?.classList.remove('fh-collapsed');
  const btn = document.getElementById('btnFhListToggle');
  if (btn) { btn.textContent = '◁'; btn.title = 'Colapsar lista'; }
}

export function toggleFhList() {
  _fhListCollapsed = !_fhListCollapsed;
  document.querySelector('.fh-list-panel')?.classList.toggle('fh-collapsed', _fhListCollapsed);
  const btn = document.getElementById('btnFhListToggle');
  if (btn) {
    btn.textContent = _fhListCollapsed ? '▷' : '◁';
    btn.title       = _fhListCollapsed ? 'Expandir lista' : 'Colapsar lista';
  }
}

export function toggleFhMaximize() {
  _fhMaximized = !_fhMaximized;
  document.getElementById('modalFileHistoryBox').classList.toggle('modal-maximized', _fhMaximized);
  const btn = document.getElementById('btnFhMaximize');
  if (btn) { btn.textContent = _fhMaximized ? '⊡' : '⛶'; btn.title = _fhMaximized ? 'Restaurar' : 'Maximizar'; }
}

// ─── Search filter ────────────────────────────────────────────────────────────

export function filterFileHistory(query) {
  const q = query.toLowerCase().trim();
  const filtered = q
    ? _fhAllCommits.filter(c =>
        c.message.toLowerCase().includes(q) ||
        c.author_name.toLowerCase().includes(q) ||
        c.hash.startsWith(q))
    : _fhAllCommits;
  getList('fileHistoryList')?.setItems(filtered);
}

// ─── Row selection (up to 2 commits) ─────────────────────────────────────────

export function fhRowClick(hash) {
  const idx = _fhSelected.indexOf(hash);
  if (idx !== -1) {
    _fhSelected.splice(idx, 1);
  } else {
    if (_fhSelected.length >= 2) _fhSelected.shift();
    _fhSelected.push(hash);
  }
  getList('fileHistoryList')?.refresh();
  _updateFhDiff();
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

async function _updateFhDiff() {
  const editor = getEditor('fileHistoryDiff');
  if (!_fhSelected.length) {
    editor.setHint('Selecciona un commit para ver sus cambios.<br><span style="color:var(--tx3)">Selecciona dos para comparar entre ellos.</span>');
    return;
  }
  editor.setLoading();

  // Sort: sorted[0] = oldest (highest index in _fhAllCommits)
  const sorted = _fhSelected.slice().sort(
    (a, b) => _fhAllCommits.findIndex(c => c.hash === b) - _fhAllCommits.findIndex(c => c.hash === a)
  );

  try {
    const isSplit = getDiffMode() === 'split';
    const modeBtn = `<button class="btn btn-xs diff-mode-btn" title="${isSplit ? 'Vista unificada' : 'Vista lado a lado'}">${isSplit ? '⊟' : '⊞'}</button>`;
    if (sorted.length === 2) {
      const [older, newer] = sorted;
      const data = await get('/repo/commit/diff-range', { hash1: older, hash2: newer, file: _fhFilePath });
      const content = isSplit ? renderDiffSplit(data.diff, _fhFilePath) : renderDiff(data.diff, _fhFilePath);
      editor.setContent(
        `<div class="fh-diff-header"><span>Comparando <code class="fh-code-from">${escHtml(older.slice(0,7))}</code> → <code class="fh-code-to">${escHtml(newer.slice(0,7))}</code></span>${modeBtn}</div>` +
        content
      );
    } else {
      const data = await get('/repo/commit/diff', { hash: sorted[0], file: _fhFilePath });
      const content = isSplit ? renderDiffSplit(data.diff, _fhFilePath) : renderDiff(data.diff, _fhFilePath);
      editor.setContent(
        `<div class="fh-diff-header"><span class="fh-code-to" style="font-family:monospace;font-size:11px">${escHtml(sorted[0].slice(0,7))}</span>${modeBtn}</div>` +
        content
      );
    }
  } catch (e) {
    editor.setHint(`Error: ${escHtml(e.message)}`);
  }
}

export async function showFileHistoryDiff(hash, file) {
  if (file && file !== _fhFilePath) _fhFilePath = file;
  fhRowClick(hash);
}

// ─── Blame (Autoría) ─────────────────────────────────────────────────────────

let _blameMaximized = false;

export async function openBlame(filePath) {
  _blameMaximized = false;
  document.getElementById('blameFileName').textContent = filePath;
  document.getElementById('blameContent').innerHTML = spinner();
  openModal('modalBlame');
  try {
    const data = await get('/repo/blame', { file: filePath });
    const lines = data.lines || [];
    if (!lines.length) {
      document.getElementById('blameContent').innerHTML = '<div class="recover-empty">Sin datos de autoría.</div>';
      return;
    }
    const hashColor = hash => {
      let h = 0;
      for (const c of hash) h = (h * 31 + c.charCodeAt(0)) & 0xFFFFFF;
      return `hsl(${h % 360},50%,60%)`;
    };
    const rows = lines.map(l => `
      <tr class="blame-row" onclick="window.copyToClipboard('${escAttr(l.fullHash)}')" title="${escAttr(l.summary)}\n${escAttr(l.author)} · ${escAttr(l.date?.slice(0,10) || '')}">
        <td class="blame-ln">${l.lineNum}</td>
        <td class="blame-hash" style="color:${hashColor(l.hash)}">${escHtml(l.hash)}</td>
        <td class="blame-author">${escHtml(l.author)}</td>
        <td class="blame-date">${escHtml(l.date?.slice(0,10) || '')}</td>
        <td class="blame-code"><pre>${escHtml(l.content)}</pre></td>
      </tr>`).join('');
    document.getElementById('blameContent').innerHTML =
      `<table class="blame-table"><tbody>${rows}</tbody></table>`;
  } catch (e) {
    document.getElementById('blameContent').innerHTML = `<div class="recover-empty">Error: ${escHtml(e.message)}</div>`;
  }
}

export function toggleBlameMaximize() {
  _blameMaximized = !_blameMaximized;
  document.getElementById('modalBlameBox').classList.toggle('modal-maximized', _blameMaximized);
  const btn = document.getElementById('btnBlameMaximize');
  if (btn) { btn.textContent = _blameMaximized ? '⊡' : '⛶'; btn.title = _blameMaximized ? 'Restaurar' : 'Maximizar'; }
}

// ─── List registration (consumed by initAllGvmLists in panels.js) ─────────────

defineEditor('fileHistoryDiff', { onToggle: () => _updateFhDiff() });

defineList('fileHistoryList', {
  renderItem: _renderFhItem,
  selMode:    'none',
  onActivate: (c) => fhRowClick(c.hash),
});
