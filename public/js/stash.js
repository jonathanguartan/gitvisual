import { defineList, getList } from './gvm/gvm-lists.js';
import { state } from './state.js';
import { get, opPost } from './api.js';
import { escHtml, escAttr, toast, openModal, closeModal, spinner } from './utils.js';
import { parseDiffByFile } from './diff.js';
import { defineEditor, getEditor } from './gvm/gvm-editors.js';
import { fileIcon } from './files.js';
import { emit } from './bus.js';

// ─── Render ───────────────────────────────────────────────────────────────────

function _renderStashItem(s, idx, { selected }) {
  const label = `${s.seq} - ${escHtml(s.branch)}: ${escHtml(s.description)}`;
  return `<div class="stash-item${selected ? ' active-diff' : ''}" title="${escAttr(s.description)}">
    <div class="stash-item-body">
      <div class="stash-item-msg stash-item-label">${label}</div>
      <div class="stash-item-date">${escHtml(s.date)}</div>
    </div>
    <div class="stash-actions">
      <button class="stash-btn pop"   onclick="event.stopPropagation();stashPop('${escAttr(s.ref)}')"   title="Aplicar y eliminar">▶</button>
      <button class="stash-btn apply" onclick="event.stopPropagation();stashApply('${escAttr(s.ref)}')" title="Aplicar (conservar)">↓</button>
      <button class="stash-btn drop"  onclick="event.stopPropagation();stashDrop('${escAttr(s.ref)}')"  title="Eliminar">✕</button>
    </div>
  </div>`;
}

function _renderStashFileItem(f, idx, { selected }) {
  return `<div class="file-item${selected ? ' active-diff' : ''}">
    <span class="file-icon">${fileIcon(f.filename)}</span>
    <span>${escHtml(f.filename)}</span>
  </div>`;
}

// ─── Stash list ───────────────────────────────────────────────────────────────

export function renderStashList(stashes) {
  getList('stashList')?.setItems(stashes);
}

export async function showStashDiff(idx) {
  const stash = (state.stashList || [])[idx];
  if (!stash) return;

  getList('stashList')?.selectIndex(idx, false);

  document.querySelectorAll('.side-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-stash').classList.add('active');

  document.getElementById('stashViewTitle').textContent = `${stash.seq} - ${stash.branch}: ${stash.description}`;
  document.getElementById('stashFileList').innerHTML = spinner();
  getEditor('stashDiffView').setHint('Selecciona un archivo');

  try {
    const data = await get('/repo/stash/show', { ref: stash.ref });
    if (!data.diff) {
      document.getElementById('stashFileList').innerHTML = '<div class="diff-hint">Sin cambios</div>';
      return;
    }
    _stashFiles = parseDiffByFile(data.diff);
    getList('stashFileList')?.setItems(_stashFiles);
    if (_stashFiles.length) getList('stashFileList')?.selectIndex(0, true);
  } catch (e) {
    document.getElementById('stashFileList').innerHTML = `<div class="diff-hint">${escHtml(e.message)}</div>`;
  }
}

// ─── Stash file list ──────────────────────────────────────────────────────────

let _stashFiles   = [];
let _stashDiffIdx = null;

export function showStashFileDiff(idx) {
  getList('stashFileList')?.selectIndex(idx, false);
  const f = _stashFiles[idx];
  if (!f) return;
  _stashDiffIdx = idx;
  _renderStashDiff(f);
}

function _renderStashDiff(f) {
  window.ensureSplitVisible?.('.stash-view-files', 'col', 180);
  getEditor('stashDiffView').render(f.diff, f.filename);
}

// ─── Keyboard navigation ─────────────────────────────────────────────────────

export function navigateStash(direction) {
  getList('stashList')?.focusNeighbor(direction);
}

// ─── Stash ops ────────────────────────────────────────────────────────────────

export function openStashModal() {
  document.getElementById('stashMessage').value  = '';
  document.getElementById('stashUntracked').checked = false;
  openModal('modalStash');
  requestAnimationFrame(() => document.getElementById('stashMessage').focus());
}

export async function confirmStash() {
  const message          = document.getElementById('stashMessage').value.trim();
  const includeUntracked = document.getElementById('stashUntracked').checked;

  const conflicted = state.status?.conflicted || [];
  if (conflicted.length) {
    const names   = conflicted.map(p => p.split('/').pop());
    const preview = names.slice(0, 3).join(', ');
    const extra   = names.length > 3 ? ` y ${names.length - 3} más` : '';
    toast(`No se puede crear el stash: resuelve los conflictos primero — ${preview}${extra}`, 'error');
    return;
  }

  const hasPending = (state.status?.files || []).some(f => f.working_dir !== ' ' || (f.index !== ' ' && f.index !== '?'));
  if (!hasPending) { toast('No hay cambios para guardar en stash', 'warn'); return; }

  try {
    await opPost('/repo/stash', { message, includeUntracked }, 'Guardando stash…');
    closeModal('modalStash');
    emit('repo:refresh-status'); await _refreshStash();
    toast(`Cambios guardados en stash${message ? ': ' + message : ''}`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function _applyWithConflictHandling(action, ref) {
  const result = await opPost(`/repo/stash/${action}`, { ref }, `Aplicando ${ref}…`);

  if (result?.conflict && result.type === 'merge') {
    emit('repo:refresh-status'); await _refreshStash();
    toast(
      `${ref} aplicado con conflictos. Resuélvelos en la pestaña de Cambios${action === 'pop' ? ' y luego elimina el stash manualmente' : ''}.`,
      'warn'
    );
    return;
  }

  if (result?.conflict && result.type === 'prevented') {
    const ok = confirm(
      `"${ref}" tiene conflictos con los cambios actuales del repo.\n\n` +
      `¿Guardar automáticamente tus cambios actuales en un nuevo stash y luego aplicar?`
    );
    if (!ok) return;
    await opPost(`/repo/stash/${action}`, { ref, autoStash: true }, `Aplicando ${ref}…`);
  }

  const label = action === 'pop' ? 'aplicado y eliminado' : 'aplicado (conservado en la lista)';
  emit('repo:refresh-status'); await _refreshStash();
  toast(`${ref} ${label}`, 'success');
}

export async function stashPop(ref) {
  try { await _applyWithConflictHandling('pop', ref); }
  catch (e) { toast(e.message, 'error'); }
}

export async function stashApply(ref) {
  try { await _applyWithConflictHandling('apply', ref); }
  catch (e) { toast(e.message, 'error'); }
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

// ─── Window assignments for HTML onclick handlers ─────────────────────────────

window.stashPop          = stashPop;
window.stashApply        = stashApply;
window.stashDrop         = stashDrop;
window.showStashDiff     = showStashDiff;
window.showStashFileDiff = showStashFileDiff;
window.openStashModal    = openStashModal;
window.confirmStash      = confirmStash;

// ─── List & editor registration (consumed by panels.js) ───────────────────────

defineEditor('stashDiffView', {});

defineList('stashList', {
  renderItem: _renderStashItem,
  onActivate: (s, idx) => showStashDiff(idx),
});

defineList('stashFileList', {
  renderItem: _renderStashFileItem,
  onActivate: (f, idx) => { _stashDiffIdx = idx; _renderStashDiff(f); },
});
