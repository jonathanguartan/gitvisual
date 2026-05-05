import { emit } from './bus.js';
import { state } from './state.js';
import { escHtml, escAttr, empty } from './utils.js';
import { fileState } from './files-state.js';
import { ic } from './icons.js';

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

// ─── Badge de count ───────────────────────────────────────────────────────────

export function setCount(id, n, classes) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = n;
  el.className = `badge ${n === 0 ? 'badge-empty' : classes.replace('badge ', '')}`;
}

// ─── Árbol de archivos ────────────────────────────────────────────────────────

export function buildFileTree(files) {
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
  return _conflictTypeLabels[`${i}${w}`] || `${i}${w}`;
}

// ─── renderFileItem ───────────────────────────────────────────────────────────

export function renderCleanItem(f, displayName = null, indentPx = null) {
  const isActive = fileState.activeDiffPath === f.path && fileState.activeDiffList === 'clean';
  const name     = displayName ?? f.path;
  const style    = indentPx !== null ? ` style="padding-left:${indentPx}px"` : '';
  return `<div class="file-item${isActive ? ' active-diff' : ''}"
               data-path="${escAttr(f.path)}" data-list="clean"${style}
               onclick="fileItemClick(event,'${escAttr(f.path)}','clean',false)"
               oncontextmenu="fileCtxShow(event,'${escAttr(f.path)}','clean',false)"
               title="${escAttr(f.path)}">
    <span class="file-icon">${fileIcon(f.path)}</span>
    <span class="file-status clean">·</span>
    <span class="file-name">${escHtml(name)}</span>
  </div>`;
}

export function renderFileItem(f, listType, staged, displayName = null, indentPx = null) {
  const isSel        = fileState.selected[listType].has(f.path);
  const isActive     = !isSel && fileState.activeDiffPath === f.path && fileState.activeDiffList === listType;
  const isUntracked  = listType === 'unstaged' && f.working_dir === '?';
  const statusCode   = staged ? f.index : (isUntracked ? '?' : f.working_dir);
  const name         = displayName ?? f.path;
  const conflicted   = state.status?.conflicted || [];
  const isConflicted = conflicted.includes(f.path);
  const conflictLabel = isConflicted ? _conflictType(f) : null;

  const baseClasses = ['file-item', isSel ? 'selected' : isActive ? 'active-diff' : '', isConflicted ? 'file-conflict' : ''].filter(Boolean).join(' ');
  const style = indentPx !== null ? ` style="padding-left:${indentPx}px"` : '';

  const conflictBadge = isConflicted
    ? `<span class="conflict-type-badge" title="${conflictLabel}">${conflictLabel}</span>
       <button class="file-act conflict-side ours"   onclick="event.stopPropagation();resolveConflictSide('${escAttr(f.path)}','ours')"   title="Usar nuestros cambios (--ours)">↑Nos</button>
       <button class="file-act conflict-side theirs" onclick="event.stopPropagation();resolveConflictSide('${escAttr(f.path)}','theirs')" title="Usar sus cambios (--theirs)">↓Ellos</button>`
    : '';

  return `<div class="${baseClasses}"
               data-path="${escAttr(f.path)}" data-list="${listType}"
               draggable="true"${style}
               onclick="fileItemClick(event,'${escAttr(f.path)}','${listType}',${staged})"
               ondblclick="${staged ? `unstageFile('${escAttr(f.path)}')` : `stageFile('${escAttr(f.path)}')`}"
               oncontextmenu="fileCtxShow(event,'${escAttr(f.path)}','${listType}',${isUntracked})"
               ondragstart="fileDragStart(event,'${escAttr(f.path)}','${listType}')"
               ondragend="fileDragEnd(event)"
               title="${escAttr(f.path)}">
    <input type="checkbox" class="file-checkbox"
      ${isSel ? 'checked' : ''}
      onclick="checkboxItemClick(event,'${escAttr(f.path)}','${listType}',${staged})"
      ondblclick="event.stopPropagation()"
      title="Seleccionar"
    >
    <span class="file-icon">${fileIcon(f.path)}</span>
    <span class="file-status ${statusCode}">${statusCode}</span>
    <span class="file-name">${escHtml(name)}</span>
    ${conflictBadge}
    ${isConflicted || staged ? '' : `<div class="file-acts">
           <button class="file-act delete"  onclick="event.stopPropagation();removeFile('${escAttr(f.path)}')"  title="Eliminar">${ic.trash(13)}</button>
           ${!isUntracked ? `<button class="file-act discard" onclick="event.stopPropagation();discardFile('${escAttr(f.path)}')" title="Descartar">${ic.rotateCcw(13)}</button>` : ''}
         </div>`}
  </div>`;
}

export function renderTreeNode(node, listType, staged, depth, pathPrefix) {
  let html = '';
  const folderIndent = depth * 16 + 6;
  const fileIndent   = depth * 16 + 22;

  for (const [name, child] of Object.entries(node.__dirs).sort(([a], [b]) => a.localeCompare(b))) {
    const fullPath  = pathPrefix ? `${pathPrefix}/${name}` : name;
    const collapsed = fileState.collapsedFolders[listType].has(fullPath);
    const isActive  = fileState.activeTreeItem?.kind === 'folder' && fileState.activeTreeItem.path === fullPath && fileState.activeTreeItem.listType === listType;
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
    html += listType === 'clean'
      ? renderCleanItem(f, f.path.split('/').pop(), fileIndent)
      : renderFileItem(f, listType, staged, f.path.split('/').pop(), fileIndent);
  }
  return html;
}

// ─── View mode toggle ─────────────────────────────────────────────────────────

function _updateViewToggleBtn(listType) {
  const prefix = listType === 'staged' ? 'Staged' : listType === 'clean' ? 'Clean' : 'Unstaged';
  const btn    = document.getElementById(`btn${prefix}View`);
  if (!btn) return;
  const isTree = fileState.viewMode[listType] === 'tree';
  btn.innerHTML = isTree ? ic.listView() : ic.treeView();
  btn.title     = isTree ? 'Vista lista' : 'Vista árbol';
  btn.classList.toggle('btn-active', isTree);

  const btnExpand   = document.getElementById(`btn${prefix}Expand`);
  const btnCollapse = document.getElementById(`btn${prefix}Collapse`);
  if (btnExpand)   btnExpand.style.display   = isTree ? '' : 'none';
  if (btnCollapse) btnCollapse.style.display = isTree ? '' : 'none';
}

export function toggleFileView(listType) {
  fileState.viewMode[listType] = fileState.viewMode[listType] === 'list' ? 'tree' : 'list';
  localStorage.setItem(`gvm_view_${listType}`, fileState.viewMode[listType]);
  if (fileState.activeTreeItem?.listType === listType) fileState.activeTreeItem = null;
  if (listType === 'clean') _renderCleanSection();
  else emit('repo:refresh-status');
}

export function togglePanelMaximize(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isMax = el.classList.toggle('panel-maximized');
  el.querySelectorAll('.btn-maximize').forEach(btn => {
    btn.innerHTML = isMax ? ic.minimize() : ic.maximize();
    btn.title     = isMax ? 'Restaurar' : 'Maximizar';
  });
}

export function setFileSearch(val) {
  fileState.fileSearch = val;
  if (state.status) renderStatus(state.status);
}

export function expandAllTree(listType) {
  fileState.collapsedFolders[listType].clear();
  if (listType === 'clean') _renderCleanSection();
  else emit('repo:refresh-status');
}

export function collapseAllTree(listType) {
  if (listType === 'clean') {
    // Colapsar carpetas visibles en el DOM del árbol limpio
    document.querySelectorAll('#cleanFiles .tree-folder').forEach(el => {
      if (el.dataset.path) fileState.collapsedFolders.clean.add(el.dataset.path);
    });
    _renderCleanSection();
    return;
  }
  const allFiles = state.status?.files || [];
  const files = listType === 'staged'
    ? allFiles.filter(f => f.index !== ' ' && f.index !== '?')
    : allFiles.filter(f => f.working_dir !== ' ');
  for (const f of files) {
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      fileState.collapsedFolders[listType].add(parts.slice(0, i).join('/'));
    }
  }
  emit('repo:refresh-status');
}

export function toggleTreeFolder(folderPath, listType) {
  if (fileState.collapsedFolders[listType].has(folderPath)) fileState.collapsedFolders[listType].delete(folderPath);
  else fileState.collapsedFolders[listType].add(folderPath);
  fileState.activeTreeItem = { kind: 'folder', path: folderPath, listType };
  fileState.activeDiffPath = null;
  fileState.activeDiffList = null;
  document.querySelectorAll('.file-item.active-diff').forEach(el => el.classList.remove('active-diff'));
  if (listType === 'clean') _renderCleanSection();
  else emit('repo:refresh-status');
}

// ─── File filter ──────────────────────────────────────────────────────────────

const _FILTER_TESTS = {
  all:       ()        => true,
  conflict:  (f, conf) => conf.includes(f.path),
  modified:  (f)       => f.working_dir === 'M' || f.index === 'M',
  untracked: (f)       => f.working_dir === '?',
  added:     (f)       => f.index === 'A' || f.working_dir === 'A',
  deleted:   (f)       => f.working_dir === 'D' || f.index === 'D',
};

export function setFileFilter(type) {
  fileState.fileFilter = type;
  const sel = document.getElementById('fileFilterSelect');
  if (sel && sel.value !== type) sel.value = type;
  if (state.status) renderStatus(state.status);
}

// ─── Render: Status ───────────────────────────────────────────────────────────

let _cleanFilesCache = null;
let _cleanCacheDirty = true;

export function invalidateCleanCache() {
  _cleanCacheDirty = true;
}

async function _renderCleanSection() {
  const cleanSection   = document.getElementById('cleanSection');
  const cleanFilesList = document.getElementById('cleanFiles');
  if (!cleanSection || !cleanFilesList) return;

  cleanSection.style.display = '';

  if (_cleanCacheDirty) {
    _cleanCacheDirty = false;
    cleanFilesList.innerHTML = `<div class="diff-hint" style="font-size:11px">Cargando…</div>`;
    try {
      const { get } = await import('./api.js');
      const files = await get('/repo/files/all');
      _cleanFilesCache = files.filter(f => f.index === ' ' && f.working_dir === ' ');
    } catch (_) {
      _cleanCacheDirty = true; // permitir reintento en el próximo render
      cleanFilesList.innerHTML = '';
      return;
    }
  }

  const search = fileState.fileSearch.toLowerCase().trim();
  const filtered = search
    ? _cleanFilesCache.filter(f => f.path.toLowerCase().includes(search))
    : _cleanFilesCache;

  const countEl = document.getElementById('cleanCount');
  if (countEl) countEl.textContent = filtered.length;

  if (!filtered.length) {
    cleanFilesList.innerHTML = empty('', search ? 'Sin resultados' : 'Sin archivos sin cambios');
    return;
  }

  if (fileState.viewMode.clean === 'tree') {
    cleanFilesList.innerHTML = renderTreeNode(buildFileTree(filtered), 'clean', false, 0, '');
  } else {
    cleanFilesList.innerHTML = filtered.map(f => renderCleanItem(f)).join('');
  }
  _updateViewToggleBtn('clean');
}

function _updateSelectionBars() {
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

export function renderStatus(status) {
  const allFiles    = status.files || [];
  const conflicted  = status.conflicted || [];
  const test        = _FILTER_TESTS[fileState.fileFilter];
  const applyFilter = (files) => test ? files.filter(f => test(f, conflicted)) : files;

  const search      = fileState.fileSearch.toLowerCase().trim();
  const applySearch = (files) => search ? files.filter(f => f.path.toLowerCase().includes(search)) : files;

  const stagedFiles   = applySearch(applyFilter(allFiles.filter(f => f.index !== ' ' && f.index !== '?')));
  const unstagedFiles = applySearch(applyFilter(allFiles.filter(f => f.working_dir !== ' ')));

  const totalStaged   = allFiles.filter(f => f.index !== ' ' && f.index !== '?').length;
  const totalUnstaged = allFiles.filter(f => f.working_dir !== ' ').length;

  setCount('stagedCount',   totalStaged,   'badge');
  setCount('unstagedCount', totalUnstaged, 'badge badge-warn');
  _updateSelectionBars();

  const _filterLabels = { conflict: 'en conflicto', modified: 'modificados', untracked: 'sin rastrear', added: 'añadidos', deleted: 'eliminados' };
  const emptyMsg = (fileState.fileFilter === 'all' && !search)
    ? null
    : search
      ? 'Sin resultados'
      : `Sin archivos ${_filterLabels[fileState.fileFilter] || ''} en esta sección`;

  const renderList = (files, listType, staged) => {
    if (!files.length) return empty('', emptyMsg ?? (staged ? 'Sin archivos en stage' : 'Sin cambios pendientes'));
    if (fileState.viewMode[listType] === 'tree') return renderTreeNode(buildFileTree(files), listType, staged, 0, '');
    return files.map(f => renderFileItem(f, listType, staged)).join('');
  };

  document.getElementById('stagedFiles').innerHTML   = renderList(stagedFiles,   'staged',   true);
  document.getElementById('unstagedFiles').innerHTML = renderList(unstagedFiles, 'unstaged', false);

  const showClean = fileState.fileFilter === 'all-files';
  const cleanSection = document.getElementById('cleanSection');
  if (cleanSection) cleanSection.style.display = showClean ? '' : 'none';
  if (showClean) _renderCleanSection();

  _updateViewToggleBtn('staged');
  _updateViewToggleBtn('unstaged');
  window.updateCommitBadge();
}
