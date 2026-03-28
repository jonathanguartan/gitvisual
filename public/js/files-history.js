import { get } from './api.js';
import { escHtml, escAttr, relTime, toast, openModal, spinner } from './utils.js';
import { renderDiff, renderDiffSplit, getDiffMode, toggleDiffMode, syncSplitPanes } from './diff.js';

let _fhSelected      = [];
let _fhFilePath      = null;
let _fhMaximized     = false;
let _fhListCollapsed = false;

// ─── Open File History ────────────────────────────────────────────────────────

export async function openFileHistory(filePath) {
  _fhSelected = [];
  _fhFilePath  = filePath;
  document.getElementById('fileHistoryName').textContent = filePath;
  document.getElementById('fileHistoryList').innerHTML   = spinner();
  document.getElementById('fileHistoryDiff').innerHTML   = '<div class="diff-hint">Selecciona un commit para ver sus cambios.<br><span style="color:var(--tx3)">Selecciona dos para comparar entre ellos.</span></div>';
  document.getElementById('fhSearch').value = '';
  _resetFhMaximize();
  _resetFhList();
  openModal('modalFileHistory');
  try {
    const data    = await get('/repo/log', { file: filePath, limit: '200' });
    const commits = data.all || [];
    if (commits.length === 0) {
      document.getElementById('fileHistoryList').innerHTML = '<div class="recover-empty">Sin historial para este archivo.</div>';
      return;
    }
    document.getElementById('fileHistoryList').innerHTML = commits.map(c => `
      <div class="fh-row" data-hash="${escAttr(c.hash)}" onclick="fhRowClick('${escAttr(c.hash)}')">
        <div class="fh-row-meta">
          <span class="fh-row-hash">${escHtml(c.hash.slice(0, 7))}</span>
          <span>${escHtml(c.author_name)}</span>
          <span>${relTime(c.date)}</span>
        </div>
        <div class="fh-row-msg">${escHtml(c.message)}</div>
      </div>`).join('');
  } catch (e) { toast(e.message, 'error'); }
}

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

export function filterFileHistory(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('#fileHistoryList .fh-row').forEach(row => {
    row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

export function fhRowClick(hash) {
  const idx = _fhSelected.indexOf(hash);
  if (idx !== -1) {
    _fhSelected.splice(idx, 1);
  } else {
    if (_fhSelected.length >= 2) _fhSelected.shift();
    _fhSelected.push(hash);
  }
  _applyFhRowStyles();
  _updateFhDiff();
}

function _applyFhRowStyles() {
  const allHashes = [...document.querySelectorAll('.fh-row')].map(r => r.dataset.hash);
  const sorted    = _fhSelected.slice().sort((a, b) => allHashes.indexOf(b) - allHashes.indexOf(a));
  document.querySelectorAll('.fh-row').forEach(r => {
    r.classList.remove('active', 'fh-sel-from', 'fh-sel-to');
    const si = sorted.indexOf(r.dataset.hash);
    if (si === 0) r.classList.add(_fhSelected.length === 1 ? 'active' : 'fh-sel-from');
    else if (si === 1) r.classList.add('fh-sel-to');
  });
}

function _fhDiffModeBtn() {
  const isSplit = getDiffMode() === 'split';
  return `<button class="btn btn-xs diff-mode-btn" onclick="toggleFhDiffMode()" title="${isSplit ? 'Vista unificada' : 'Vista lado a lado'}">${isSplit ? '⊟' : '⊞'}</button>`;
}

function _renderFhContent(diff) {
  return getDiffMode() === 'split'
    ? renderDiffSplit(diff, _fhFilePath)
    : renderDiff(diff, _fhFilePath);
}

async function _updateFhDiff() {
  const diffEl = document.getElementById('fileHistoryDiff');
  if (!_fhSelected.length) {
    diffEl.innerHTML = '<div class="diff-hint">Selecciona un commit para ver sus cambios.<br><span style="color:var(--tx3)">Selecciona dos para comparar entre ellos.</span></div>';
    return;
  }
  diffEl.innerHTML = spinner();
  const allHashes = [...document.querySelectorAll('.fh-row')].map(r => r.dataset.hash);
  const sorted    = _fhSelected.slice().sort((a, b) => allHashes.indexOf(b) - allHashes.indexOf(a));
  try {
    if (sorted.length === 2) {
      const [older, newer] = sorted;
      const data = await get('/repo/commit/diff-range', { hash1: older, hash2: newer, file: _fhFilePath });
      diffEl.innerHTML =
        `<div class="fh-diff-header"><span>Comparando <code class="fh-code-from">${escHtml(older.slice(0,7))}</code> → <code class="fh-code-to">${escHtml(newer.slice(0,7))}</code></span>${_fhDiffModeBtn()}</div>` +
        _renderFhContent(data.diff);
    } else {
      const data = await get('/repo/commit/diff', { hash: sorted[0], file: _fhFilePath });
      diffEl.innerHTML =
        `<div class="fh-diff-header"><span class="fh-code-to" style="font-family:monospace;font-size:11px">${escHtml(sorted[0].slice(0,7))}</span>${_fhDiffModeBtn()}</div>` +
        _renderFhContent(data.diff);
    }
    if (getDiffMode() === 'split') syncSplitPanes(diffEl);
  } catch (e) {
    diffEl.innerHTML = `<div class="diff-hint">Error: ${escHtml(e.message)}</div>`;
  }
}

export function toggleFhDiffMode() {
  toggleDiffMode();
  _updateFhDiff();
}

export async function showFileHistoryDiff(hash, file) {
  if (file && file !== _fhFilePath) _fhFilePath = file;
  fhRowClick(hash);
}
