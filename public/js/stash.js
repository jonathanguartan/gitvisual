import { state } from './state.js';
import { get, opPost } from './api.js';
import { escHtml, escAttr, toast, openModal, closeModal, spinner } from './utils.js';
import { renderDiff, renderDiffSplit, getDiffMode, toggleDiffMode, parseDiffByFile, syncSplitPanes } from './diff.js';
import { fileIcon } from './files.js';

// ─── Stash ────────────────────────────────────────────────────────────────────

let _stashFiles = [];

export function renderStashList(stashes) {
  const el = document.getElementById('stashList');
  if (!stashes.length) {
    el.innerHTML = '<div class="stash-empty">Sin stashes</div>';
    return;
  }
  el.innerHTML = stashes.map((s, i) => `
    <div class="stash-item" data-stash-idx="${i}" onclick="showStashDiff(${i})" style="cursor:pointer">
      <div class="stash-item-body">
        <div class="stash-item-ref">${escHtml(s.ref)}</div>
        <div class="stash-item-msg" title="${escAttr(s.message)}">${escHtml(s.message)}</div>
        <div class="stash-item-date">${escHtml(s.date)}</div>
      </div>
      <div class="stash-actions">
        <button class="stash-btn pop"   onclick="event.stopPropagation();stashPop('${escAttr(s.ref)}')"   title="Aplicar y eliminar">▶</button>
        <button class="stash-btn apply" onclick="event.stopPropagation();stashApply('${escAttr(s.ref)}')" title="Aplicar (conservar)">↓</button>
        <button class="stash-btn drop"  onclick="event.stopPropagation();stashDrop('${escAttr(s.ref)}')"  title="Eliminar">✕</button>
      </div>
    </div>
  `).join('');
}

export async function showStashDiff(idx) {
  const stash = (state.stashList || [])[idx];
  if (!stash) return;

  document.querySelectorAll('.stash-item').forEach(el => el.classList.remove('active-diff'));
  const item = document.querySelector(`.stash-item[data-stash-idx="${idx}"]`);
  if (item) item.classList.add('active-diff');

  document.querySelectorAll('.side-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-stash').classList.add('active');

  document.getElementById('stashViewTitle').textContent = `${stash.ref} — ${stash.message}`;
  document.getElementById('stashFileList').innerHTML = spinner();
  document.getElementById('stashDiffView').innerHTML = '<div class="diff-hint">Selecciona un archivo</div>';

  try {
    const data = await get('/repo/stash/show', { ref: stash.ref });
    if (!data.diff) {
      document.getElementById('stashFileList').innerHTML = '<div class="diff-hint">Sin cambios</div>';
      return;
    }
    _stashFiles = parseDiffByFile(data.diff);
    renderStashFileList(_stashFiles);
    if (_stashFiles.length) showStashFileDiff(0);
  } catch (e) {
    document.getElementById('stashFileList').innerHTML = `<div class="diff-hint">${escHtml(e.message)}</div>`;
  }
}

function renderStashFileList(files) {
  document.getElementById('stashFileList').innerHTML = files.map((f, i) => `
    <div class="file-item" data-file-idx="${i}" onclick="showStashFileDiff(${i})">
      <span class="file-icon">${fileIcon(f.filename)}</span>
      <span>${escHtml(f.filename)}</span>
    </div>
  `).join('');
}

let _stashDiffIdx = null;

export function showStashFileDiff(idx) {
  document.querySelectorAll('#stashFileList .file-item').forEach(el => el.classList.remove('active-diff'));
  const item = document.querySelector(`#stashFileList .file-item[data-file-idx="${idx}"]`);
  if (item) item.classList.add('active-diff');
  const f = _stashFiles[idx];
  if (!f) return;
  _stashDiffIdx = idx;
  _renderStashDiff(f);
}

function _renderStashDiff(f) {
  window.ensureSplitVisible?.('.stash-view-files', 'col', 180);
  const isSplit = getDiffMode() === 'split';
  const modeBtn = `<button class="btn btn-xs diff-mode-btn" onclick="toggleStashDiffMode()" title="${isSplit ? 'Vista unificada' : 'Vista lado a lado'}">${isSplit ? '⊟' : '⊞'}</button>`;
  const content = isSplit ? renderDiffSplit(f.diff, f.filename) : renderDiff(f.diff, f.filename);
  const el = document.getElementById('stashDiffView');
  el.innerHTML = `<div class="diff-filename"><span>${escHtml(f.filename)}</span>${modeBtn}</div>${content}`;
  if (isSplit) syncSplitPanes(el);
}

export function openStashModal() {
  document.getElementById('stashMessage').value  = '';
  document.getElementById('stashUntracked').checked = false;
  openModal('modalStash');
  requestAnimationFrame(() => document.getElementById('stashMessage').focus());
}

export async function confirmStash() {
  const message          = document.getElementById('stashMessage').value.trim();
  const includeUntracked = document.getElementById('stashUntracked').checked;

  const hasPending = (state.status?.files || []).some(f => f.working_dir !== ' ' || (f.index !== ' ' && f.index !== '?'));
  if (!hasPending) { toast('No hay cambios para guardar en stash', 'warn'); return; }

  try {
    await opPost('/repo/stash', { message, includeUntracked }, 'Guardando stash…');
    closeModal('modalStash');
    await Promise.all([window.refreshStatus(), _refreshStash()]);
    toast(`Cambios guardados en stash${message ? ': ' + message : ''}`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function stashPop(ref) {
  try {
    await opPost('/repo/stash/pop', { ref }, `Aplicando ${ref}…`);
    await Promise.all([window.refreshStatus(), _refreshStash()]);
    toast(`${ref} aplicado y eliminado`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function stashApply(ref) {
  try {
    await opPost('/repo/stash/apply', { ref }, `Aplicando ${ref}…`);
    await Promise.all([window.refreshStatus(), _refreshStash()]);
    toast(`${ref} aplicado (conservado en la lista)`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function stashDrop(ref) {
  if (!confirm(`¿Eliminar ${ref}? Esta acción no se puede deshacer.`)) return;
  try {
    await opPost('/repo/stash/drop', { ref }, `Eliminando ${ref}…`);
    await _refreshStash();
    toast(`${ref} eliminado`, 'info');
  } catch (e) { toast(e.message, 'error'); }
}

async function _refreshStash() {
  try {
    const stashes = await get('/repo/stash/list');
    state.stashList = stashes;
    renderStashList(stashes);
  } catch (_) {
    state.stashList = [];
    renderStashList([]);
  }
}

// ─── Window assignments for HTML onclick handlers ────────────────────────────

window.stashPop          = stashPop;
window.stashApply        = stashApply;
window.stashDrop         = stashDrop;
window.showStashDiff     = showStashDiff;
window.showStashFileDiff = showStashFileDiff;
window.openStashModal    = openStashModal;
window.confirmStash      = confirmStash;
window.toggleStashDiffMode = function() {
  toggleDiffMode();
  if (_stashDiffIdx !== null && _stashFiles[_stashDiffIdx]) _renderStashDiff(_stashFiles[_stashDiffIdx]);
};
