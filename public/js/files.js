import { state } from './state.js';
import { get, post, opPost } from './api.js';
import { escHtml, escAttr, relTime, toast, openModal, closeModal, closeAllCtxMenus, showCtxMenu, spinner, empty } from './utils.js';
import { showDiff, renderDiff, renderDiffSplit, getDiffMode, toggleDiffMode, syncSplitPanes } from './diff.js';

// ─── File Icons ───────────────────────────────────────────────────────────────

export function fileIcon(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const icons = {
    js:'🟨', ts:'🔷', jsx:'🟨', tsx:'🔷', vue:'💚', svelte:'🟠',
    html:'🌐', htm:'🌐', css:'🎨', scss:'🎨', less:'🎨',
    json:'📋', yaml:'📋', yml:'📋', toml:'📋', xml:'📋',
    md:'📝', txt:'📄', env:'🔒', gitignore:'🚫',
    py:'🐍', rb:'💎', php:'🐘', java:'☕', cs:'💜', go:'🩵',
    rs:'🦀', c:'⚙', cpp:'⚙', h:'⚙', sh:'🖥', bash:'🖥',
    sql:'🗄', graphql:'🔮',
    png:'🖼', jpg:'🖼', jpeg:'🖼', gif:'🖼', svg:'🖼', ico:'🖼',
    pdf:'📕', zip:'📦', tar:'📦', gz:'📦',
  };
  return icons[ext] || '📄';
}

// ─── File Multi-select ────────────────────────────────────────────────────────

export const _selectedFiles = { staged: new Set(), unstaged: new Set() };
let _activeDiffPath = null;
let _activeDiffList = null;
let _activeTreeItem = null; // { kind: 'file'|'folder', path, listType }
const _lastClickedFile = { staged: null, unstaged: null };

// ─── View mode (list | tree) ──────────────────────────────────────────────────
const _fileViewMode = {
  staged:   localStorage.getItem('gvm_view_staged')   || 'list',
  unstaged: localStorage.getItem('gvm_view_unstaged') || 'list',
};
const _collapsedFolders = { staged: new Set(), unstaged: new Set() };

export function toggleFileSelection(path, listType) {
  const sel = _selectedFiles[listType];
  if (sel.has(path)) sel.delete(path);
  else               sel.add(path);
  updateSelectionBars();
  document.querySelectorAll(`.file-item[data-list="${listType}"]`).forEach(el => {
    el.classList.toggle('selected', sel.has(el.dataset.path));
  });
}

function _setActiveDiff(path, listType) {
  _activeDiffPath = path;
  _activeDiffList = listType;
  document.querySelectorAll('.file-item').forEach(el => {
    el.classList.toggle('active-diff',
      el.dataset.path === path && el.dataset.list === listType);
  });
}

function _clearActiveDiff() {
  _activeDiffPath = null;
  _activeDiffList = null;
  document.querySelectorAll('.file-item.active-diff').forEach(el => el.classList.remove('active-diff'));
}

export function clearFileSelection(listType) {
  if (listType) {
    _selectedFiles[listType].clear();
  } else {
    _selectedFiles.staged.clear();
    _selectedFiles.unstaged.clear();
  }
  document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
  updateSelectionBars();
}

function updateSelectionBars() {
  const sn = _selectedFiles.staged.size;
  const un = _selectedFiles.unstaged.size;

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

function _getFilePathsForList(listType) {
  const files = state.status?.files || [];
  return listType === 'staged'
    ? files.filter(f => f.index !== ' ' && f.index !== '?').map(f => f.path)
    : files.filter(f => f.working_dir !== ' ').map(f => f.path);
}

export function fileItemClick(event, _p, _lt, staged) {
  const item = event.target.closest('.file-item');
  if (!item) return;
  const path     = item.dataset.path;
  const listType = item.dataset.list;

  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    _clearActiveDiff();
    toggleFileSelection(path, listType);
    _lastClickedFile[listType] = path;
  } else if (event.shiftKey) {
    event.preventDefault();
    _clearActiveDiff();
    const paths   = _getFilePathsForList(listType);
    const last    = _lastClickedFile[listType];
    const lastIdx = last ? paths.indexOf(last) : -1;
    const currIdx = paths.indexOf(path);
    if (lastIdx === -1 || currIdx === -1) {
      toggleFileSelection(path, listType);
    } else {
      const [from, to] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
      for (let i = from; i <= to; i++) _selectedFiles[listType].add(paths[i]);
      updateSelectionBars();
      document.querySelectorAll(`.file-item[data-list="${listType}"]`).forEach(el => {
        el.classList.toggle('selected', _selectedFiles[listType].has(el.dataset.path));
      });
    }
  } else {
    clearFileSelection();
    _lastClickedFile[listType] = path;
    _setActiveDiff(path, listType);
    showDiff(path, staged);
    _activeTreeItem = { kind: 'file', path, listType };
    document.querySelectorAll('.tree-folder.tree-active').forEach(e => e.classList.remove('tree-active'));
  }
}

export async function stageSelected() {
  const files = [..._selectedFiles.unstaged];
  if (!files.length) return;
  try {
    await opPost('/repo/stage', { files }, 'Añadiendo al stage…');
    clearFileSelection('unstaged');
    await window.refreshStatus();
  } catch (e) { toast(e.message, 'error'); }
}

export async function unstageSelected() {
  const files = [..._selectedFiles.staged];
  if (!files.length) return;
  try {
    await opPost('/repo/unstage', { files }, 'Quitando del stage…');
    clearFileSelection('staged');
    await window.refreshStatus();
  } catch (e) { toast(e.message, 'error'); }
}

export async function discardSelected() {
  const files = [..._selectedFiles.unstaged];
  if (!files.length) return;
  if (!confirm(`¿Descartar cambios en ${files.length} archivo(s)? Esta acción no se puede deshacer.`)) return;
  try {
    await opPost('/repo/discard', { files }, 'Descartando cambios…');
    clearFileSelection('unstaged');
    await window.refreshStatus();
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Drag & Drop ──────────────────────────────────────────────────────────────

let _dragFiles = [];
let _dragFrom  = null;

export function fileDragStart(event, path, from) {
  const sel = _selectedFiles[from];
  _dragFiles = sel.size > 0 && sel.has(path) ? [...sel] : [path];
  _dragFrom  = from;
  event.dataTransfer.effectAllowed = 'move';
  document.querySelectorAll(`.file-item[data-list="${from}"]`).forEach(el => {
    if (_dragFiles.includes(el.dataset.path)) el.style.opacity = '0.5';
  });
}

export function fileDragEnd(event) {
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

// ─── Open in Editor ───────────────────────────────────────────────────────────

async function openFileInEditor(file) {
  try {
    await post('/repo/open-file', { file });
    toast(`Abriendo ${file.split('/').pop()}…`, 'info');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── File Context Menu ────────────────────────────────────────────────────────

let _fileCtxData = null;

export function fileCtxShow(event, path, listType, isUntracked) {
  event.preventDefault();
  event.stopPropagation();
  _fileCtxData = { path, listType, isUntracked };

  let items = '';
  if (listType === 'clean') {
    items += `<div class="ctx-item" onclick="fileCtxAction('open')">↗ Abrir en editor</div>`;
    items += `<div class="ctx-item" onclick="fileCtxAction('history')">📜 Historial del archivo</div>`;
    items += `<div class="ctx-item" onclick="fileCtxAction('copy-path')">📋 Copiar ruta</div>`;
    items += `<div class="ctx-sep"></div>`;
    items += `<div class="ctx-item ctx-warn" onclick="fileCtxAction('untrack')">🚫 Quitar del tracking</div>`;
    items += `<div class="ctx-item" onclick="fileCtxAction('gitignore-add')">➕ Añadir a .gitignore</div>`;
    items += `<div class="ctx-item ctx-danger" onclick="fileCtxAction('delete')">🗑 Eliminar archivo</div>`;
  } else if (listType === 'staged') {
    items += `<div class="ctx-item" onclick="fileCtxAction('diff')">🔍 Ver diff</div>`;
    items += `<div class="ctx-sep"></div>`;
    items += `<div class="ctx-item" onclick="fileCtxAction('unstage')">− Quitar del stage</div>`;
    items += `<div class="ctx-item ctx-warn" onclick="fileCtxAction('untrack')">🚫 Quitar del tracking</div>`;
    items += `<div class="ctx-item" onclick="fileCtxAction('gitignore-add')">➕ Añadir a .gitignore</div>`;
    items += `<div class="ctx-item ctx-danger" onclick="fileCtxAction('delete')">🗑 Eliminar archivo</div>`;
    items += `<div class="ctx-sep"></div>`;
    items += `<div class="ctx-item" onclick="fileCtxAction('open')">↗ Abrir en editor</div>`;
    items += `<div class="ctx-item" onclick="fileCtxAction('history')">📜 Historial del archivo</div>`;
    items += `<div class="ctx-item" onclick="fileCtxAction('copy-path')">📋 Copiar ruta</div>`;
  } else {
    items += `<div class="ctx-item" onclick="fileCtxAction('diff')">🔍 Ver diff</div>`;
    items += `<div class="ctx-sep"></div>`;
    items += `<div class="ctx-item ctx-primary" onclick="fileCtxAction('stage')">+ Stage</div>`;
    if (!isUntracked) items += `<div class="ctx-item ctx-warn" onclick="fileCtxAction('discard')">⟲ Descartar cambios</div>`;
    if (!isUntracked) items += `<div class="ctx-item ctx-warn" onclick="fileCtxAction('untrack')">🚫 Quitar del tracking</div>`;
    items += `<div class="ctx-item" onclick="fileCtxAction('gitignore-add')">➕ Añadir a .gitignore</div>`;
    items += `<div class="ctx-item ctx-danger" onclick="fileCtxAction('delete')">🗑 Eliminar archivo</div>`;
    items += `<div class="ctx-sep"></div>`;
    items += `<div class="ctx-item" onclick="fileCtxAction('open')">↗ Abrir en editor</div>`;
    items += `<div class="ctx-item" onclick="fileCtxAction('history')">📜 Historial del archivo</div>`;
    items += `<div class="ctx-item" onclick="fileCtxAction('copy-path')">📋 Copiar ruta</div>`;
  }

  showCtxMenu('fileCtxMenu', event, items);
}

export function fileCtxAction(action) {
  closeAllCtxMenus();
  const d = _fileCtxData;
  if (!d) return;
  switch (action) {
    case 'diff':       showDiff(d.path, d.listType === 'staged'); break;
    case 'stage':      stageFile(d.path); break;
    case 'unstage':    unstageFile(d.path); break;
    case 'discard':    discardFile(d.path); break;
    case 'delete':     removeFile(d.path); break;
    case 'untrack':       untrackFile(d.path); break;
    case 'gitignore-add': openAddToGitignoreModal(d.path); break;
    case 'open':       openFileInEditor(d.path); break;
    case 'history':    openFileHistory(d.path); break;
    case 'copy-path':  window.copyToClipboard(state.repoPath + '/' + d.path); break;
  }
}

// ─── Staging helpers (used by file ctx menu) ──────────────────────────────────

async function stageFile(file) {
  try { await opPost('/repo/stage', { files: [file] }, 'Añadiendo al stage…'); await window.refreshStatus(); }
  catch (e) { toast(e.message, 'error'); }
}

async function unstageFile(file) {
  try { await opPost('/repo/unstage', { files: [file] }, 'Quitando del stage…'); await window.refreshStatus(); }
  catch (e) { toast(e.message, 'error'); }
}

async function discardFile(file) {
  if (!confirm(`¿Descartar todos los cambios en "${file}"? Esta acción no se puede deshacer.`)) return;
  try {
    await opPost('/repo/discard', { files: [file] }, 'Descartando cambios…');
    await window.refreshStatus();
    toast('Cambios descartados', 'info');
  } catch (e) { toast(e.message, 'error'); }
}

async function removeFile(file) {
  if (!file) return;
  if (!confirm(`¿Eliminar "${file}" del disco? Esta acción es permanente y no se puede deshacer.`)) return;
  try {
    await opPost('/repo/delete-path', { path: file }, 'Eliminando…');
    await window.refreshStatus();
    toast('Eliminado', 'info');
  } catch (e) { toast(e.message, 'error'); }
}

async function removeFolder(folderPath) {
  if (!folderPath) return;
  if (!confirm(`¿Eliminar la carpeta "${folderPath}/" y TODO su contenido del disco?\nEsta acción es permanente y no se puede deshacer.`)) return;
  try {
    await opPost('/repo/delete-path', { path: folderPath }, 'Eliminando carpeta…');
    await window.refreshStatus();
    toast('Carpeta eliminada', 'info');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

function buildFileTree(files) {
  const root = { __files: [], __dirs: {} };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!node.__dirs[dir]) node.__dirs[dir] = { __files: [], __dirs: {} };
      node = node.__dirs[dir];
    }
    node.__files.push(f);
  }
  return root;
}

// ─── Conflict helpers ─────────────────────────────────────────────────────────

const _conflictTypeLabels = {
  'UU': 'Ambos mod.', 'AA': 'Ambos añad.', 'DD': 'Ambos elim.',
  'AU': 'Añad. nosotros', 'UA': 'Añad. ellos',
  'DU': 'Elim. nosotros', 'UD': 'Elim. ellos',
};

function _conflictType(f) {
  const i = (f.index || ' ').trim(), w = (f.working_dir || ' ').trim();
  const key = `${i}${w}`;
  return _conflictTypeLabels[key] || key;
}

export async function resolveConflictSide(file, side) {
  try {
    await post('/repo/checkout-conflict', { file, side });
    await window.refreshStatus();
    const label = side === 'ours' ? 'nuestros' : 'ellos';
    toast(`Usando cambios de ${label} para "${file.split('/').pop()}" ✓`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── renderFileItem ───────────────────────────────────────────────────────────

function renderFileItem(f, listType, staged, displayName = null, indentPx = null) {
  const isSel         = _selectedFiles[listType].has(f.path);
  const isActive      = !isSel && _activeDiffPath === f.path && _activeDiffList === listType;
  const isUntracked   = listType === 'unstaged' && f.working_dir === '?';
  const statusCode    = staged ? f.index : (isUntracked ? '?' : f.working_dir);
  const name          = displayName ?? f.path;
  const conflicted    = state.status?.conflicted || [];
  const isConflicted  = conflicted.includes(f.path);
  const conflictLabel = isConflicted ? _conflictType(f) : null;

  const baseClasses = ['file-item', isSel ? 'selected' : isActive ? 'active-diff' : '', isConflicted ? 'file-conflict' : ''].filter(Boolean).join(' ');
  const style = indentPx !== null ? ` style="padding-left:${indentPx}px"` : '';

  const conflictBadge = isConflicted
    ? `<span class="conflict-type-badge" title="${conflictLabel}">${conflictLabel}</span>
       <button class="file-act conflict-side ours" onclick="event.stopPropagation();resolveConflictSide('${escAttr(f.path)}','ours')" title="Usar nuestros cambios (--ours)">↑Nos</button>
       <button class="file-act conflict-side theirs" onclick="event.stopPropagation();resolveConflictSide('${escAttr(f.path)}','theirs')" title="Usar sus cambios (--theirs)">↓Ellos</button>`
    : '';

  return `<div class="${baseClasses}"
               data-path="${escAttr(f.path)}" data-list="${listType}"
               draggable="true"${style}
               onclick="fileItemClick(event,'${escAttr(f.path)}','${listType}',${staged})"
               oncontextmenu="fileCtxShow(event,'${escAttr(f.path)}','${listType}',${isUntracked})"
               ondragstart="fileDragStart(event,'${escAttr(f.path)}','${listType}')"
               ondragend="fileDragEnd(event)"
               title="${escAttr(f.path)}">
    <span class="file-icon">${fileIcon(f.path)}</span>
    <span class="file-status ${statusCode}">${statusCode}</span>
    <span class="file-name">${escHtml(name)}</span>
    ${conflictBadge}
    ${isConflicted ? '' : staged
      ? `<button class="file-act" onclick="event.stopPropagation();unstageFile('${escAttr(f.path)}')" title="Quitar del stage">−</button>`
      : `<div class="file-acts">
           <button class="file-act delete" onclick="event.stopPropagation();removeFile('${escAttr(f.path)}')" title="Eliminar">🗑</button>
           ${!isUntracked ? `<button class="file-act discard" onclick="event.stopPropagation();discardFile('${escAttr(f.path)}')" title="Descartar">⟲</button>` : ''}
           <button class="file-act" onclick="event.stopPropagation();stageFile('${escAttr(f.path)}')" title="Stage">+</button>
         </div>`
    }
  </div>`;
}

function renderTreeNode(node, listType, staged, depth, pathPrefix) {
  let html = '';
  const folderIndent = depth * 16 + 6;
  const fileIndent   = depth * 16 + 22;

  for (const [name, child] of Object.entries(node.__dirs).sort(([a], [b]) => a.localeCompare(b))) {
    const fullPath  = pathPrefix ? `${pathPrefix}/${name}` : name;
    const collapsed = _collapsedFolders[listType].has(fullPath);
    const isActive  = _activeTreeItem?.kind === 'folder' && _activeTreeItem.path === fullPath && _activeTreeItem.listType === listType;
    html += `<div class="tree-folder${isActive ? ' tree-active' : ''}" style="padding-left:${folderIndent}px"
                  data-path="${escAttr(fullPath)}" data-list="${listType}"
                  onclick="toggleTreeFolder('${escAttr(fullPath)}','${listType}')"
                  oncontextmenu="folderCtxShow(event,'${escAttr(fullPath)}','${listType}')">
      <span class="tree-caret">${collapsed ? '▶' : '▼'}</span>
      <span class="tree-dir-icon">📁</span>
      <span class="tree-dir-name">${escHtml(name)}</span>
    </div>`;
    if (!collapsed) html += renderTreeNode(child, listType, staged, depth + 1, fullPath);
  }

  for (const f of node.__files) {
    html += renderFileItem(f, listType, staged, f.path.split('/').pop(), fileIndent);
  }
  return html;
}

function _updateViewToggleBtn(listType) {
  const prefix = listType === 'staged' ? 'Staged' : 'Unstaged';
  const btn = document.getElementById(`btn${prefix}View`);
  if (!btn) return;
  const isTree = _fileViewMode[listType] === 'tree';
  btn.textContent = isTree ? '☰' : '⊞';
  btn.title       = isTree ? 'Vista lista' : 'Vista árbol';
  btn.classList.toggle('btn-active', isTree);

  // Show/hide expand-collapse tree buttons
  const btnExpand   = document.getElementById(`btn${prefix}Expand`);
  const btnCollapse = document.getElementById(`btn${prefix}Collapse`);
  if (btnExpand)   btnExpand.style.display   = isTree ? '' : 'none';
  if (btnCollapse) btnCollapse.style.display = isTree ? '' : 'none';
}

export function expandAllTree(listType) {
  _collapsedFolders[listType].clear();
  window.refreshStatus();
}

export function collapseAllTree(listType) {
  const allFiles = state.status?.files || [];
  const files = listType === 'staged'
    ? allFiles.filter(f => f.index !== ' ' && f.index !== '?')
    : allFiles.filter(f => f.working_dir !== ' ');
  for (const f of files) {
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      _collapsedFolders[listType].add(parts.slice(0, i).join('/'));
    }
  }
  window.refreshStatus();
}

export function toggleFileView(listType) {
  _fileViewMode[listType] = _fileViewMode[listType] === 'list' ? 'tree' : 'list';
  localStorage.setItem(`gvm_view_${listType}`, _fileViewMode[listType]);
  if (_activeTreeItem?.listType === listType) _activeTreeItem = null;
  window.refreshStatus();
}

export function toggleTreeFolder(folderPath, listType) {
  if (_collapsedFolders[listType].has(folderPath)) _collapsedFolders[listType].delete(folderPath);
  else _collapsedFolders[listType].add(folderPath);
  _activeTreeItem = { kind: 'folder', path: folderPath, listType };
  _clearActiveDiff();
  window.refreshStatus();
}

// ─── Folder Context Menu ──────────────────────────────────────────────────────

let _folderCtxData = null;

function _filesInFolder(folderPath, listType) {
  const prefix = folderPath + '/';
  const files  = state.status?.files || [];
  if (listType === 'staged')
    return files.filter(f => f.index !== ' ' && f.index !== '?' && f.path.startsWith(prefix)).map(f => f.path);
  return files.filter(f => f.working_dir !== ' ' && f.path.startsWith(prefix)).map(f => f.path);
}

export function folderCtxShow(event, folderPath, listType) {
  event.preventDefault();
  event.stopPropagation();
  _folderCtxData = { folderPath, listType };

  const fileCount = _filesInFolder(folderPath, listType).length;
  const countLabel = fileCount > 0 ? ` (${fileCount})` : '';
  let items = `<div class="ctx-item ctx-header">📁 ${escHtml(folderPath)}/</div>`;
  items += `<div class="ctx-sep"></div>`;

  if (listType === 'staged') {
    items += `<div class="ctx-item" onclick="folderCtxAction('unstage')">− Quitar del stage${countLabel}</div>`;
    items += `<div class="ctx-item ctx-warn" onclick="folderCtxAction('untrack')">🚫 Quitar del tracking${countLabel}</div>`;
  } else {
    items += `<div class="ctx-item ctx-primary" onclick="folderCtxAction('stage')">+ Stage${countLabel}</div>`;
    items += `<div class="ctx-item ctx-warn" onclick="folderCtxAction('discard')">⟲ Descartar cambios${countLabel}</div>`;
  }
  items += `<div class="ctx-item" onclick="folderCtxAction('gitignore-add')">➕ Añadir a .gitignore</div>`;
  items += `<div class="ctx-item ctx-danger" onclick="folderCtxAction('delete')">🗑 Eliminar carpeta</div>`;
  items += `<div class="ctx-sep"></div>`;
  items += `<div class="ctx-item" onclick="folderCtxAction('copy-path')">📋 Copiar ruta</div>`;

  showCtxMenu('fileCtxMenu', event, items);
}

export async function folderCtxAction(action) {
  closeAllCtxMenus();
  const d = _folderCtxData;
  if (!d) return;
  const files = _filesInFolder(d.folderPath, d.listType);

  switch (action) {
    case 'stage':
      if (!files.length) { toast('No hay archivos para agregar al stage', 'info'); return; }
      try { await opPost('/repo/stage', { files }, 'Añadiendo al stage…'); await window.refreshStatus(); } catch (e) { toast(e.message, 'error'); }
      break;
    case 'unstage':
      if (!files.length) { toast('No hay archivos en stage', 'info'); return; }
      try { await opPost('/repo/unstage', { files }, 'Quitando del stage…'); await window.refreshStatus(); } catch (e) { toast(e.message, 'error'); }
      break;
    case 'discard':
      if (!files.length) { toast('No hay cambios que descartar', 'info'); return; }
      if (!confirm(`¿Descartar cambios en ${files.length} archivo(s) de "${d.folderPath}/"? Esta acción no se puede deshacer.`)) return;
      try { await opPost('/repo/discard', { files }, 'Descartando cambios…'); await window.refreshStatus(); } catch (e) { toast(e.message, 'error'); }
      break;
    case 'untrack':
      if (!files.length) { toast('No hay archivos rastreados en esta carpeta', 'info'); return; }
      if (!confirm(`¿Quitar ${files.length} archivo(s) de "${d.folderPath}/" del tracking?\nNO se eliminarán del disco.`)) return;
      try { await opPost('/repo/untrack', { files }, 'Quitando del tracking…'); await window.refreshStatus(); toast(`${files.length} archivo(s) quitados del tracking ✓`, 'success'); } catch (e) { toast(e.message, 'error'); }
      break;
    case 'delete':
      await removeFolder(d.folderPath);
      break;
    case 'gitignore-add':
      openAddToGitignoreModal(d.folderPath, true);
      break;
    case 'copy-path':
      window.copyToClipboard(d.folderPath + '/');
      break;
  }
}

// ─── Keyboard navigation ──────────────────────────────────────────────────────

function _activateItem(el, listType) {
  document.querySelectorAll('.tree-folder.tree-active').forEach(e => e.classList.remove('tree-active'));
  if (el.classList.contains('tree-folder')) {
    _activeTreeItem = { kind: 'folder', path: el.dataset.path, listType };
    _clearActiveDiff();
    el.classList.add('tree-active');
  } else {
    _activeTreeItem = { kind: 'file', path: el.dataset.path, listType };
    clearFileSelection();
    _setActiveDiff(el.dataset.path, listType);
    showDiff(el.dataset.path, listType === 'staged');
  }
  el.scrollIntoView({ block: 'nearest' });
}

function _kbGetItems(listType) {
  const id = listType === 'staged' ? 'stagedFiles' : 'unstagedFiles';
  if (_fileViewMode[listType] === 'tree')
    return [...document.querySelectorAll(`#${id} .tree-folder, #${id} .file-item`)];
  return [...document.querySelectorAll(`#${id} .file-item`)];
}

function kbNavigate(dir) {
  const listType = _activeTreeItem?.listType ?? _activeDiffList;
  if (!listType) return;
  const items = _kbGetItems(listType);
  if (!items.length) return;

  let idx = -1;
  if (_activeTreeItem) {
    idx = items.findIndex(el =>
      el.dataset.path === _activeTreeItem.path &&
      (_activeTreeItem.kind === 'folder' ? el.classList.contains('tree-folder') : el.classList.contains('file-item'))
    );
  } else if (_activeDiffPath) {
    idx = items.findIndex(el => el.classList.contains('file-item') && el.dataset.path === _activeDiffPath);
  }
  const next = idx === -1 ? 0 : dir === 'down'
    ? Math.min(idx + 1, items.length - 1)
    : Math.max(idx - 1, 0);
  if (next === idx && idx !== -1) return;
  _activateItem(items[next], listType);
}

function kbFolderToggle(dir) {
  const listType = _activeTreeItem?.listType ?? _activeDiffList;
  if (!listType || _fileViewMode[listType] !== 'tree') return;

  if (_activeTreeItem?.kind === 'folder') {
    const { path } = _activeTreeItem;
    const isCollapsed = _collapsedFolders[listType].has(path);
    if (dir === 'left' && !isCollapsed) {
      _collapsedFolders[listType].add(path);
    } else if (dir === 'right' && isCollapsed) {
      _collapsedFolders[listType].delete(path);
    } else return;
    window.refreshStatus();
    requestAnimationFrame(() => {
      const id = listType === 'staged' ? 'stagedFiles' : 'unstagedFiles';
      const el = [...document.querySelectorAll(`#${id} .tree-folder`)].find(e => e.dataset.path === path);
      if (el) { el.classList.add('tree-active'); el.scrollIntoView({ block: 'nearest' }); }
    });
  } else if (_activeTreeItem?.kind === 'file' && dir === 'left') {
    const parts = _activeTreeItem.path.split('/');
    if (parts.length <= 1) return;
    const parentPath = parts.slice(0, -1).join('/');
    const id = listType === 'staged' ? 'stagedFiles' : 'unstagedFiles';
    const el = [...document.querySelectorAll(`#${id} .tree-folder`)].find(e => e.dataset.path === parentPath);
    if (el) _activateItem(el, listType);
  }
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  if      (e.key === 'ArrowDown')  { e.preventDefault(); kbNavigate('down'); }
  else if (e.key === 'ArrowUp')    { e.preventDefault(); kbNavigate('up'); }
  else if (e.key === 'ArrowLeft')  { e.preventDefault(); kbFolderToggle('left'); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); kbFolderToggle('right'); }
});

// ─── File filter ──────────────────────────────────────────────────────────────

let _fileFilter = 'all';

const _FILTER_TESTS = {
  all:       ()        => true,
  conflict:  (f, conf) => conf.includes(f.path),
  modified:  (f)       => f.working_dir === 'M' || f.index === 'M',
  untracked: (f)       => f.working_dir === '?',
  added:     (f)       => f.index === 'A' || f.working_dir === 'A',
  deleted:   (f)       => f.working_dir === 'D' || f.index === 'D',
};

export async function setFileFilter(type) {
  _fileFilter = type;
  const sel = document.getElementById('fileFilterSelect');
  if (sel && sel.value !== type) sel.value = type;

  if (state.status) renderStatus(state.status);
}

async function _appendCleanFiles() {
  const list = document.getElementById('unstagedFiles');
  if (!list) return;

  list.insertAdjacentHTML('beforeend',
    `<div class="files-clean-sep">Sin cambios</div>` +
    `<div id="cleanFilesLoading" class="diff-hint" style="font-size:11px">Cargando…</div>`
  );

  try {
    const files = await get('/repo/files/all');
    const clean = files.filter(f => f.index === ' ' && f.working_dir === ' ');
    document.getElementById('cleanFilesLoading')?.remove();
    if (!clean.length) return;
    list.insertAdjacentHTML('beforeend', clean.map(f => `
      <div class="file-item"
           title="${escAttr(f.path)}"
           onclick="openFileInEditor('${escAttr(f.path)}')"
           oncontextmenu="fileCtxShow(event,'${escAttr(f.path)}','clean',false)">
        <span class="file-icon">${fileIcon(f.path)}</span>
        <span class="file-status clean">·</span>
        <span class="file-name">${escHtml(f.path)}</span>
      </div>`).join(''));
  } catch (e) {
    document.getElementById('cleanFilesLoading')?.remove();
    toast('No se pudo cargar la lista de archivos', 'error');
  }
}

function _applyFilter(files, conflicted) {
  const test = _FILTER_TESTS[_fileFilter];
  return test ? files.filter(f => test(f, conflicted)) : files;
}

// ─── Render: Status ───────────────────────────────────────────────────────────

export function renderStatus(status) {
  const allFiles      = status.files || [];
  const conflicted    = status.conflicted || [];
  const stagedFiles   = _applyFilter(allFiles.filter(f => f.index !== ' ' && f.index !== '?'), conflicted);
  const unstagedFiles = _applyFilter(allFiles.filter(f => f.working_dir !== ' '),              conflicted);

  const totalStaged   = allFiles.filter(f => f.index !== ' ' && f.index !== '?').length;
  const totalUnstaged = allFiles.filter(f => f.working_dir !== ' ').length;

  setCount('stagedCount',   totalStaged,   'badge');
  setCount('unstagedCount', totalUnstaged, 'badge badge-warn');
  updateSelectionBars();

  const _filterLabels = { conflict: 'en conflicto', modified: 'modificados', untracked: 'sin rastrear', added: 'añadidos', deleted: 'eliminados' };
  const emptyMsg = _fileFilter === 'all'
    ? null
    : `Sin archivos ${_filterLabels[_fileFilter] || ''} en esta sección`;

  const renderList = (files, listType, staged) => {
    if (!files.length) return empty('', emptyMsg ?? (staged ? 'Sin archivos en stage' : 'Sin cambios pendientes'));
    if (_fileViewMode[listType] === 'tree') return renderTreeNode(buildFileTree(files), listType, staged, 0, '');
    return files.map(f => renderFileItem(f, listType, staged)).join('');
  };

  document.getElementById('stagedFiles').innerHTML   = renderList(stagedFiles,   'staged',   true);
  document.getElementById('unstagedFiles').innerHTML = renderList(unstagedFiles, 'unstaged', false);

  if (_fileFilter === 'all-files') _appendCleanFiles();

  _updateViewToggleBtn('staged');
  _updateViewToggleBtn('unstaged');
  window.updateCommitBadge();
}

export function setCount(id, n, classes) {
  const el = document.getElementById(id);
  el.textContent = n;
  el.className = `badge ${n === 0 ? 'badge-empty' : classes.replace('badge ', '')}`;
}

// ─── File History ─────────────────────────────────────────────────────────────

let _fhSelected = []; // up to 2 hashes (click-order)
let _fhFilePath  = null;

export async function openFileHistory(filePath) {
  // Reset state before loading new history
  _fhSelected = [];
  _fhFilePath  = filePath;
  document.getElementById('fileHistoryName').textContent = filePath;
  document.getElementById('fileHistoryList').innerHTML = spinner();
  document.getElementById('fileHistoryDiff').innerHTML = '<div class="diff-hint">Selecciona un commit para ver sus cambios.<br><span style="color:var(--tx3)">Selecciona dos para comparar entre ellos.</span></div>';
  document.getElementById('fhSearch').value = '';
  _resetFhMaximize();
  openModal('modalFileHistory');
  try {
    const data = await get('/repo/log', { file: filePath, limit: '200' });
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

let _fhMaximized = false;

function _resetFhMaximize() {
  _fhMaximized = false;
  document.getElementById('modalFileHistoryBox').classList.remove('modal-maximized');
  const btn = document.getElementById('btnFhMaximize');
  btn.textContent = '⛶';
  btn.title = 'Maximizar';
}

export function toggleFhMaximize() {
  _fhMaximized = !_fhMaximized;
  document.getElementById('modalFileHistoryBox').classList.toggle('modal-maximized', _fhMaximized);
  const btn = document.getElementById('btnFhMaximize');
  btn.textContent = _fhMaximized ? '⊡' : '⛶';
  btn.title = _fhMaximized ? 'Restaurar' : 'Maximizar';
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
  // Determine chronological order: rows higher in list = newer commits
  const allHashes = [...document.querySelectorAll('.fh-row')].map(r => r.dataset.hash);
  // sorted[0] = older (larger list index), sorted[1] = newer (smaller list index)
  const sorted = _fhSelected.slice().sort((a, b) => allHashes.indexOf(b) - allHashes.indexOf(a));
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
  const sorted = _fhSelected.slice().sort((a, b) => allHashes.indexOf(b) - allHashes.indexOf(a));
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

// Keep for backward compatibility
export async function showFileHistoryDiff(hash, file) {
  if (file && file !== _fhFilePath) _fhFilePath = file;
  fhRowClick(hash);
}

export function stageOrUnstageActiveFile() {
  if (!_activeDiffPath || !_activeDiffList) return;
  if (_activeDiffList === 'staged') unstageFile(_activeDiffPath);
  else stageFile(_activeDiffPath);
}

// ─── Untrack (git rm --cached) ────────────────────────────────────────────────

async function untrackFile(file) {
  if (!confirm(`¿Quitar "${file}" del tracking de git?\nEl archivo quedará como no rastreado pero NO se eliminará del disco.`)) return;
  try {
    await opPost('/repo/untrack', { files: [file] }, 'Quitando del tracking…');
    await window.refreshStatus();
    toast(`"${file}" quitado del tracking ✓`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function untrackSelected() {
  const files = [..._selectedFiles.staged];
  if (!files.length) return;
  if (!confirm(`¿Quitar ${files.length} archivo(s) del tracking de git?\nQuedarán como no rastreados pero NO se eliminarán del disco.`)) return;
  try {
    await opPost('/repo/untrack', { files }, 'Quitando del tracking…');
    clearFileSelection('staged');
    await window.refreshStatus();
    toast(`${files.length} archivo(s) quitados del tracking ✓`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── .gitignore editor ────────────────────────────────────────────────────────

export async function openGitignoreEditor() {
  try {
    const data = await get('/repo/gitignore');
    document.getElementById('gitignoreContent').value = data.content;
    openModal('modalGitignore');
  } catch (e) { toast(e.message, 'error'); }
}

export async function saveGitignore() {
  const content = document.getElementById('gitignoreContent').value;
  try {
    await post('/repo/gitignore', { content });
    closeModal('modalGitignore');
    toast('.gitignore guardado ✓', 'success');
    await window.refreshStatus();
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Add to .gitignore modal ──────────────────────────────────────────────────

export function openAddToGitignoreModal(inputPath, isFolder = false) {
  const cleanPath = inputPath.replace(/\\/g, '/').replace(/\/$/, '');
  const parts     = cleanPath.split('/');

  const rows = [];

  if (isFolder) {
    // For folders: this folder + all parent folders
    for (let i = parts.length; i >= 1; i--) {
      const folderPattern = parts.slice(0, i).join('/') + '/';
      const indent = '&nbsp;'.repeat((parts.length - i) * 2);
      const label  = i === parts.length
        ? `📁 Esta carpeta: <code>${escHtml(folderPattern)}</code>`
        : `📁 ${indent}Carpeta padre: <code>${escHtml(folderPattern)}</code>`;
      rows.push({ label, pattern: folderPattern });
    }
  } else {
    // For files: exact file, all parent folders, extension
    rows.push({ label: '📄 Archivo exacto', pattern: cleanPath });

    for (let i = parts.length - 1; i >= 1; i--) {
      const folderPattern = parts.slice(0, i).join('/') + '/';
      const indent = '&nbsp;'.repeat((parts.length - 1 - i) * 2);
      rows.push({ label: `📁 ${indent}Carpeta: <code>${escHtml(folderPattern)}</code>`, pattern: folderPattern });
    }

    const ext = parts[parts.length - 1].includes('.')
      ? parts[parts.length - 1].split('.').pop()
      : null;
    if (ext) rows.push({ label: `🔤 Por extensión: <code>*.${escHtml(ext)}</code>`, pattern: `*.${ext}` });
  }

  // Default selection: first folder level (index 1 for files, 0 for folders)
  const defaultIdx = isFolder ? 0 : Math.min(1, rows.length - 1);

  const optionsHtml = rows.map((r, i) =>
    `<label class="gi-option ${i === defaultIdx ? 'gi-option-selected' : ''}" onclick="selectGiOption(${i})">
      <input type="radio" name="giPattern" value="${escAttr(r.pattern)}" ${i === defaultIdx ? 'checked' : ''} style="display:none">
      <span class="gi-dot"></span>
      <span class="gi-label">${r.label}</span>
    </label>`
  ).join('');

  const displayLabel = isFolder ? cleanPath + '/' : cleanPath;
  document.getElementById('giFilePath').textContent  = displayLabel;
  document.getElementById('giOptions').innerHTML     = optionsHtml;
  document.getElementById('giCustomInput').value     = '';
  document.getElementById('giPreview').textContent   = rows[defaultIdx]?.pattern ?? '';
  document.getElementById('giCustomRow').style.display = 'none';
  openModal('modalAddGitignore');
}

export function selectGiOption(idx) {
  document.querySelectorAll('.gi-option').forEach((el, i) => {
    el.classList.toggle('gi-option-selected', i === idx);
    el.querySelector('input').checked = i === idx;
  });
  const selected = document.querySelector('.gi-option-selected input');
  document.getElementById('giPreview').textContent = selected ? selected.value : '';
  document.getElementById('giCustomRow').style.display = 'none';
  document.getElementById('giCustomInput').value = '';
}

export function selectGiCustom() {
  document.querySelectorAll('.gi-option').forEach(el => {
    el.classList.remove('gi-option-selected');
    el.querySelector('input').checked = false;
  });
  document.getElementById('giCustomRow').style.display = '';
  document.getElementById('giCustomInput').focus();
  _updateGiCustomPreview();
}

export function _updateGiCustomPreview() {
  const val = document.getElementById('giCustomInput').value.trim();
  document.getElementById('giPreview').textContent = val || '';
}

export async function confirmAddToGitignore() {
  const customRow = document.getElementById('giCustomRow');
  let pattern;
  if (customRow.style.display !== 'none') {
    pattern = document.getElementById('giCustomInput').value.trim();
  } else {
    const checked = document.querySelector('#giOptions input[name="giPattern"]:checked');
    pattern = checked ? checked.value : '';
  }
  if (!pattern) { toast('Selecciona un patrón', 'warn'); return; }

  try {
    const data = await get('/repo/gitignore');
    const existing = data.content;
    // Avoid duplicates
    const lines = existing.split('\n').map(l => l.trim());
    if (lines.includes(pattern)) {
      toast(`"${pattern}" ya está en .gitignore`, 'info');
      closeModal('modalAddGitignore');
      return;
    }
    const newContent = existing.endsWith('\n') || existing === ''
      ? existing + pattern + '\n'
      : existing + '\n' + pattern + '\n';
    await post('/repo/gitignore', { content: newContent });
    closeModal('modalAddGitignore');
    toast(`"${pattern}" añadido a .gitignore ✓`, 'success');
    await window.refreshStatus();
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Window assignments for HTML onclick handlers ────────────────────────────

window.toggleFileView   = toggleFileView;
window.toggleTreeFolder = toggleTreeFolder;
window.folderCtxShow    = folderCtxShow;
window.folderCtxAction  = folderCtxAction;
window.fileCtxShow      = fileCtxShow;
window.fileCtxAction    = fileCtxAction;
window.toggleFileSelection = toggleFileSelection;
window.fileItemClick      = fileItemClick;
window.fileDragStart      = fileDragStart;
window.fileDragEnd        = fileDragEnd;
window.fileDragOver       = fileDragOver;
window.fileDragLeave      = fileDragLeave;
window.fileDrop           = fileDrop;
window.clearFileSelection = clearFileSelection;
window.stageSelected      = stageSelected;
window.unstageSelected    = unstageSelected;
window.discardSelected    = discardSelected;
// Also expose single-file helpers used in inline onclick
window.stageFile   = stageFile;
window.unstageFile = unstageFile;
window.discardFile = discardFile;
window.removeFile   = removeFile;
window.removeFolder = removeFolder;
window.openFileHistory     = openFileHistory;
window.showFileHistoryDiff = showFileHistoryDiff;
window.fhRowClick          = fhRowClick;
window.toggleFhMaximize    = toggleFhMaximize;
window.toggleFhDiffMode    = toggleFhDiffMode;
window.filterFileHistory   = filterFileHistory;
window.stageOrUnstageActiveFile = stageOrUnstageActiveFile;
window.untrackSelected  = untrackSelected;
window.openGitignoreEditor     = openGitignoreEditor;
window.saveGitignore           = saveGitignore;
window.openAddToGitignoreModal = openAddToGitignoreModal;
window.selectGiOption          = selectGiOption;
window.selectGiCustom          = selectGiCustom;
window._updateGiCustomPreview  = _updateGiCustomPreview;
window.confirmAddToGitignore   = confirmAddToGitignore;
window.expandAllTree      = expandAllTree;
window.collapseAllTree    = collapseAllTree;
window.resolveConflictSide = resolveConflictSide;
window.setFileFilter       = setFileFilter;
