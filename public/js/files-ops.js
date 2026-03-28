import { post, opPost } from './api.js';
import { escHtml, escAttr, toast, showCtxMenu, closeAllCtxMenus } from './utils.js';
import { showDiff } from './diff.js';
import { fileState } from './files-state.js';

// ─── Single-file operations ───────────────────────────────────────────────────

export async function stageFile(file) {
  try { await opPost('/repo/stage', { files: [file] }, 'Añadiendo al stage…'); await window.refreshStatus(); }
  catch (e) { toast(e.message, 'error'); }
}

export async function unstageFile(file) {
  try { await opPost('/repo/unstage', { files: [file] }, 'Quitando del stage…'); await window.refreshStatus(); }
  catch (e) { toast(e.message, 'error'); }
}

export async function discardFile(file) {
  if (!confirm(`¿Descartar todos los cambios en "${file}"? Esta acción no se puede deshacer.`)) return;
  try {
    await opPost('/repo/discard', { files: [file] }, 'Descartando cambios…');
    await window.refreshStatus();
    toast('Cambios descartados', 'info');
  } catch (e) { toast(e.message, 'error'); }
}

export async function removeFile(file) {
  if (!file) return;
  if (!confirm(`¿Eliminar "${file}" del disco? Esta acción es permanente y no se puede deshacer.`)) return;
  try {
    await opPost('/repo/delete-path', { path: file }, 'Eliminando…');
    await window.refreshStatus();
    toast('Eliminado', 'info');
  } catch (e) { toast(e.message, 'error'); }
}

export async function removeFolder(folderPath) {
  if (!folderPath) return;
  if (!confirm(`¿Eliminar la carpeta "${folderPath}/" y TODO su contenido del disco?\nEsta acción es permanente y no se puede deshacer.`)) return;
  try {
    await opPost('/repo/delete-path', { path: folderPath }, 'Eliminando carpeta…');
    await window.refreshStatus();
    toast('Carpeta eliminada', 'info');
  } catch (e) { toast(e.message, 'error'); }
}

export async function openFileInEditor(file) {
  try {
    await post('/repo/open-file', { file });
    toast(`Abriendo ${file.split('/').pop()}…`, 'info');
  } catch (e) { toast(e.message, 'error'); }
}

export async function resolveConflictSide(file, side) {
  try {
    await post('/repo/checkout-conflict', { file, side });
    await window.refreshStatus();
    const label = side === 'ours' ? 'nuestros' : 'ellos';
    toast(`Usando cambios de ${label} para "${file.split('/').pop()}" ✓`, 'success');
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
  const { state: st } = window;
  switch (action) {
    case 'diff':          showDiff(d.path, d.listType === 'staged'); break;
    case 'stage':         stageFile(d.path); break;
    case 'unstage':       unstageFile(d.path); break;
    case 'discard':       discardFile(d.path); break;
    case 'delete':        removeFile(d.path); break;
    case 'untrack':       _untrackFile(d.path); break;
    case 'gitignore-add': window.openAddToGitignoreModal(d.path); break;
    case 'open':          openFileInEditor(d.path); break;
    case 'history':       window.openFileHistory(d.path); break;
    case 'copy-path':     window.copyToClipboard((st?.repoPath || '') + '/' + d.path); break;
  }
}

async function _untrackFile(file) {
  if (!confirm(`¿Quitar "${file}" del tracking de git?\nEl archivo quedará como no rastreado pero NO se eliminará del disco.`)) return;
  try {
    await opPost('/repo/untrack', { files: [file] }, 'Quitando del tracking…');
    await window.refreshStatus();
    toast(`"${file}" quitado del tracking ✓`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Folder Context Menu ──────────────────────────────────────────────────────

let _folderCtxData = null;

function _filesInFolder(folderPath, listType) {
  const { state: st } = window;
  const prefix = folderPath + '/';
  const files  = st?.status?.files || [];
  if (listType === 'staged')
    return files.filter(f => f.index !== ' ' && f.index !== '?' && f.path.startsWith(prefix)).map(f => f.path);
  return files.filter(f => f.working_dir !== ' ' && f.path.startsWith(prefix)).map(f => f.path);
}

export function folderCtxShow(event, folderPath, listType) {
  event.preventDefault();
  event.stopPropagation();
  _folderCtxData = { folderPath, listType };

  const fileCount  = _filesInFolder(folderPath, listType).length;
  const countLabel = fileCount > 0 ? ` (${fileCount})` : '';
  let items = `<div class="ctx-item ctx-header">📁 ${escHtml(folderPath)}/</div><div class="ctx-sep"></div>`;

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
      window.openAddToGitignoreModal(d.folderPath, true);
      break;
    case 'copy-path':
      window.copyToClipboard(d.folderPath + '/');
      break;
  }
}
