import { state } from './state.js';
import { opPost, post } from './api.js';
import { toast } from './utils.js';
import { showDiff } from './diff.js';
import { fileState } from './files-state.js';

// ─── Selection UI helpers ─────────────────────────────────────────────────────

export function updateSelectionBars() {
  const sn = fileState.selected.staged.size;
  const un = fileState.selected.unstaged.size;
  const sb = document.getElementById('stagedSelBar');
  const ub = document.getElementById('unstagedSelBar');
  if (sb) {
    sb.style.display = sn > 0 ? '' : 'none';
    document.getElementById('stagedSelCount').textContent = `${sn} seleccionado${sn !== 1 ? 's' : ''}`;
  }
  if (ub) {
    ub.style.display = un > 0 ? '' : 'none';
    document.getElementById('unstagedSelCount').textContent = `${un} seleccionado${un !== 1 ? 's' : ''}`;
  }
}

export function toggleFileSelection(path, listType) {
  const sel = fileState.selected[listType];
  if (sel.has(path)) sel.delete(path);
  else               sel.add(path);
  updateSelectionBars();
  document.querySelectorAll(`.file-item[data-list="${listType}"]`).forEach(el => {
    el.classList.toggle('selected', sel.has(el.dataset.path));
  });
}

export function clearFileSelection(listType) {
  if (listType) {
    fileState.selected[listType].clear();
  } else {
    fileState.selected.staged.clear();
    fileState.selected.unstaged.clear();
  }
  document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
  updateSelectionBars();
}

// ─── Active diff tracking ─────────────────────────────────────────────────────

export function setActiveDiff(path, listType) {
  fileState.activeDiffPath = path;
  fileState.activeDiffList = listType;
  document.querySelectorAll('.file-item').forEach(el => {
    el.classList.toggle('active-diff',
      el.dataset.path === path && el.dataset.list === listType);
  });
}

export function clearActiveDiff() {
  fileState.activeDiffPath = null;
  fileState.activeDiffList = null;
  document.querySelectorAll('.file-item.active-diff').forEach(el => el.classList.remove('active-diff'));
}

// ─── File list for shift-select ───────────────────────────────────────────────

function _getFilePathsForList(listType) {
  const files = state.status?.files || [];
  return listType === 'staged'
    ? files.filter(f => f.index !== ' ' && f.index !== '?').map(f => f.path)
    : files.filter(f => f.working_dir !== ' ').map(f => f.path);
}

// ─── Click handler ────────────────────────────────────────────────────────────

export function fileItemClick(event, _p, _lt, staged) {
  const item = event.target.closest('.file-item');
  if (!item) return;
  const path     = item.dataset.path;
  const listType = item.dataset.list;

  if (listType === 'clean') {
    // Clean files: just highlight, show "no changes" hint
    fileState.lastClicked.clean = path;
    fileState.activeDiffPath    = path;
    fileState.activeDiffList    = 'clean';
    fileState.activeTreeItem    = { kind: 'file', path, listType: 'clean' };
    document.querySelectorAll('.file-item.active-diff').forEach(el2 => el2.classList.remove('active-diff'));
    item.classList.add('active-diff');
    document.querySelectorAll('.tree-folder.tree-active').forEach(e => e.classList.remove('tree-active'));
    const dv = document.getElementById('diffView');
    if (dv) dv.innerHTML = `<div class="diff-hint">Sin cambios en <strong>${path.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c])}</strong></div>`;
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    clearActiveDiff();
    toggleFileSelection(path, listType);
    fileState.lastClicked[listType] = path;
  } else if (event.shiftKey) {
    event.preventDefault();
    clearActiveDiff();
    const paths   = _getFilePathsForList(listType);
    const last    = fileState.lastClicked[listType];
    const lastIdx = last ? paths.indexOf(last) : -1;
    const currIdx = paths.indexOf(path);
    if (lastIdx === -1 || currIdx === -1) {
      toggleFileSelection(path, listType);
    } else {
      const [from, to] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
      for (let i = from; i <= to; i++) fileState.selected[listType].add(paths[i]);
      updateSelectionBars();
      document.querySelectorAll(`.file-item[data-list="${listType}"]`).forEach(el => {
        el.classList.toggle('selected', fileState.selected[listType].has(el.dataset.path));
      });
    }
  } else {
    clearFileSelection();
    fileState.lastClicked[listType] = path;
    setActiveDiff(path, listType);
    showDiff(path, staged);
    fileState.activeTreeItem = { kind: 'file', path, listType };
    document.querySelectorAll('.tree-folder.tree-active').forEach(e => e.classList.remove('tree-active'));
  }
}

// ─── Batch operations ─────────────────────────────────────────────────────────

export async function stageSelected() {
  const files = [...fileState.selected.unstaged];
  if (!files.length) return;
  try {
    await opPost('/repo/stage', { files }, 'Añadiendo al stage…');
    clearFileSelection('unstaged');
    await window.refreshStatus();
  } catch (e) { toast(e.message, 'error'); }
}

export async function unstageSelected() {
  const files = [...fileState.selected.staged];
  if (!files.length) return;
  try {
    await opPost('/repo/unstage', { files }, 'Quitando del stage…');
    clearFileSelection('staged');
    await window.refreshStatus();
  } catch (e) { toast(e.message, 'error'); }
}

export async function discardSelected() {
  const files = [...fileState.selected.unstaged];
  if (!files.length) return;
  if (!confirm(`¿Descartar cambios en ${files.length} archivo(s)? Esta acción no se puede deshacer.`)) return;
  try {
    await opPost('/repo/discard', { files }, 'Descartando cambios…');
    clearFileSelection('unstaged');
    await window.refreshStatus();
  } catch (e) { toast(e.message, 'error'); }
}

export async function untrackSelected() {
  const files = [...fileState.selected.staged];
  if (!files.length) return;
  if (!confirm(`¿Quitar ${files.length} archivo(s) del tracking de git?\nQuedarán como no rastreados pero NO se eliminarán del disco.`)) return;
  try {
    await opPost('/repo/untrack', { files }, 'Quitando del tracking…');
    clearFileSelection('staged');
    await window.refreshStatus();
    toast(`${files.length} archivo(s) quitados del tracking ✓`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export function stageOrUnstageActiveFile() {
  if (!fileState.activeDiffPath || !fileState.activeDiffList) return;
  const path = fileState.activeDiffPath;
  const lt   = fileState.activeDiffList;
  if (lt === 'staged') {
    opPost('/repo/unstage', { files: [path] }, 'Quitando del stage…')
      .then(() => window.refreshStatus()).catch(e => toast(e.message, 'error'));
  } else {
    opPost('/repo/stage', { files: [path] }, 'Añadiendo al stage…')
      .then(() => window.refreshStatus()).catch(e => toast(e.message, 'error'));
  }
}

// ─── Drag & Drop ──────────────────────────────────────────────────────────────

let _dragFiles = [];
let _dragFrom  = null;

export function fileDragStart(event, path, from) {
  const sel = fileState.selected[from];
  _dragFiles = sel.size > 0 && sel.has(path) ? [...sel] : [path];
  _dragFrom  = from;
  event.dataTransfer.effectAllowed = 'move';
  document.querySelectorAll(`.file-item[data-list="${from}"]`).forEach(el => {
    if (_dragFiles.includes(el.dataset.path)) el.style.opacity = '0.5';
  });
}

export function fileDragEnd() {
  document.querySelectorAll('.file-item').forEach(el => el.style.opacity = '');
  _dragFiles = [];
  _dragFrom  = null;
}

export function fileDragOver(event, to) {
  if (_dragFrom === to || !_dragFiles.length) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('drop-active');
}

export function fileDragLeave(event) {
  event.currentTarget.classList.remove('drop-active');
}

export async function fileDrop(event, to) {
  event.preventDefault();
  event.currentTarget.classList.remove('drop-active');
  if (!_dragFiles.length || _dragFrom === to) return;
  const files = _dragFiles;
  _dragFiles = []; _dragFrom = null;
  try {
    if (to === 'staged') await opPost('/repo/stage',   { files }, 'Añadiendo al stage…');
    else                 await opPost('/repo/unstage', { files }, 'Quitando del stage…');
    clearFileSelection();
    await window.refreshStatus();
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Keyboard navigation ──────────────────────────────────────────────────────

function _kbGetItems(listType) {
  const id = listType === 'staged' ? 'stagedFiles' : listType === 'clean' ? 'cleanFiles' : 'unstagedFiles';
  if (fileState.viewMode[listType] === 'tree')
    return [...document.querySelectorAll(`#${id} .tree-folder, #${id} .file-item`)];
  return [...document.querySelectorAll(`#${id} .file-item`)];
}

function _activateItem(el, listType) {
  document.querySelectorAll('.tree-folder.tree-active').forEach(e => e.classList.remove('tree-active'));
  if (el.classList.contains('tree-folder')) {
    fileState.activeTreeItem = { kind: 'folder', path: el.dataset.path, listType };
    clearActiveDiff();
    el.classList.add('tree-active');
  } else {
    fileState.activeTreeItem = { kind: 'file', path: el.dataset.path, listType };
    if (listType === 'clean') {
      clearActiveDiff();
      fileState.activeDiffPath = el.dataset.path;
      fileState.activeDiffList = 'clean';
      document.querySelectorAll('.file-item.active-diff').forEach(e => e.classList.remove('active-diff'));
      el.classList.add('active-diff');
      const dv = document.getElementById('diffView');
      const p  = el.dataset.path;
      if (dv) dv.innerHTML = `<div class="diff-hint">Sin cambios en <strong>${p.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c])}</strong></div>`;
    } else {
      clearFileSelection();
      setActiveDiff(el.dataset.path, listType);
      showDiff(el.dataset.path, listType === 'staged');
    }
  }
  el.scrollIntoView({ block: 'nearest' });
}

function _kbNavigate(dir) {
  const listType = fileState.activeTreeItem?.listType ?? fileState.activeDiffList;
  if (!listType) return;
  const items = _kbGetItems(listType);
  if (!items.length) return;

  let idx = -1;
  if (fileState.activeTreeItem) {
    idx = items.findIndex(el =>
      el.dataset.path === fileState.activeTreeItem.path &&
      (fileState.activeTreeItem.kind === 'folder' ? el.classList.contains('tree-folder') : el.classList.contains('file-item'))
    );
  } else if (fileState.activeDiffPath) {
    idx = items.findIndex(el => el.classList.contains('file-item') && el.dataset.path === fileState.activeDiffPath);
  }

  const next = idx === -1 ? 0 : dir === 'down'
    ? Math.min(idx + 1, items.length - 1)
    : Math.max(idx - 1, 0);
  if (next === idx && idx !== -1) return;
  _activateItem(items[next], listType);
}

function _kbFolderToggle(dir) {
  const listType = fileState.activeTreeItem?.listType ?? fileState.activeDiffList;
  if (!listType || fileState.viewMode[listType] !== 'tree') return;

  if (fileState.activeTreeItem?.kind === 'folder') {
    const { path } = fileState.activeTreeItem;
    const isCollapsed = fileState.collapsedFolders[listType].has(path);
    if      (dir === 'left'  && !isCollapsed) fileState.collapsedFolders[listType].add(path);
    else if (dir === 'right' && isCollapsed)  fileState.collapsedFolders[listType].delete(path);
    else return;
    window.refreshStatus();
    requestAnimationFrame(() => {
      const id = listType === 'staged' ? 'stagedFiles' : 'unstagedFiles';
      const el = [...document.querySelectorAll(`#${id} .tree-folder`)].find(e => e.dataset.path === path);
      if (el) { el.classList.add('tree-active'); el.scrollIntoView({ block: 'nearest' }); }
    });
  } else if (fileState.activeTreeItem?.kind === 'file' && dir === 'left') {
    const parts = fileState.activeTreeItem.path.split('/');
    if (parts.length <= 1) return;
    const parentPath = parts.slice(0, -1).join('/');
    const id = listType === 'staged' ? 'stagedFiles' : 'unstagedFiles';
    const el = [...document.querySelectorAll(`#${id} .tree-folder`)].find(e => e.dataset.path === parentPath);
    if (el) _activateItem(el, listType);
  }
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  if      (e.key === 'ArrowDown')  { e.preventDefault(); _kbNavigate('down'); }
  else if (e.key === 'ArrowUp')    { e.preventDefault(); _kbNavigate('up'); }
  else if (e.key === 'ArrowLeft')  { e.preventDefault(); _kbFolderToggle('left'); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); _kbFolderToggle('right'); }
});
