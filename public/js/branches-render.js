import { state } from './state.js';
import { escHtml, escAttr } from './utils.js';
import { renderDiff } from './diff.js';

// ─── Árbol colapsable ─────────────────────────────────────────────────────────

const _collapsedBranchFolders = new Set();

export function toggleBranchFolder(key) {
  if (_collapsedBranchFolders.has(key)) _collapsedBranchFolders.delete(key);
  else                                   _collapsedBranchFolders.add(key);
  if (state.branches) renderBranches(state.branches);
}

function _insertBranch(node, b, parts, idx) {
  if (idx === parts.length - 1) { node._items.push(b); return; }
  const folder = parts[idx];
  if (!node._folders[folder]) node._folders[folder] = { _items: [], _folders: {} };
  _insertBranch(node._folders[folder], b, parts, idx + 1);
}

export function buildBranchTree(branches, nameOf) {
  const root = { _items: [], _folders: {} };
  for (const b of branches) {
    const parts = nameOf(b).split('/');
    _insertBranch(root, b, parts, 0);
  }
  return root;
}

export function renderBranchTree(node, prefix, depth, renderItem) {
  let html = '';
  const pad = 8 + depth * 14;

  for (const [folder, child] of Object.entries(node._folders).sort(([a], [b]) => a.localeCompare(b))) {
    const key       = prefix + folder;
    const collapsed = _collapsedBranchFolders.has(key);
    html += `<div class="branch-folder" style="padding-left:${pad}px" onclick="toggleBranchFolder('${escAttr(key)}')">
      <span class="bf-arrow">${collapsed ? '▸' : '▾'}</span>
      <span class="bf-name">${escHtml(folder)}</span>
    </div>`;
    if (!collapsed) html += renderBranchTree(child, key + '/', depth + 1, renderItem);
  }

  const sorted = [...node._items].sort((a, b) => {
    if (a.current) return -1;
    if (b.current) return  1;
    return a.name.localeCompare(b.name);
  });
  for (const b of sorted) html += renderItem(b, pad);

  return html;
}

export function onBranchFilter() {
  if (state.branches) renderBranches(state.branches);
}

// ctxBranchData es un objeto mutable compartido con branches-ctx.js
export const ctxBranchData = {};

export function renderBranches(branches) {
  const filter    = (document.getElementById('branchFilter')?.value || '').toLowerCase();
  const tracking  = state.branchTracking || {};
  const allBranches = Object.values(branches.branches || {});

  // Limpiar datos de contexto antes de repoblar
  Object.keys(ctxBranchData).forEach(k => delete ctxBranchData[k]);
  let ctxIdx = 0;

  let localBranches  = allBranches.filter(b => !b.name.startsWith('remotes/'));
  let remoteBranches = allBranches
    .filter(b => b.name.startsWith('remotes/'))
    .map(b => ({ ...b, displayName: b.name.replace(/^remotes\/[^/]+\//, ''), fullRemoteName: b.name }));

  if (filter) {
    localBranches  = localBranches.filter(b => b.name.toLowerCase().includes(filter));
    remoteBranches = remoteBranches.filter(b => b.displayName.toLowerCase().includes(filter));
  }

  function trackBadge(name) {
    const tk = tracking[name];
    if (!tk) return '';
    if (!tk.hasUpstream) return `<span class="bi-track bi-no-remote" title="Sin remote">⌀</span>`;
    if (!tk.ahead && !tk.behind) return '';
    let b = '<span class="bi-track">';
    if (tk.ahead)  b += `<span class="bi-ahead" title="Ahead">↑${tk.ahead}</span>`;
    if (tk.behind) b += `<span class="bi-behind" title="Behind">↓${tk.behind}</span>`;
    return b + '</span>';
  }

  function localItem(b, pad) {
    const leaf = b.name.split('/').pop();
    const bid  = 'b' + (ctxIdx++);
    ctxBranchData[bid] = { name: b.name, isCurrent: b.current, type: 'local', tracking: tracking[b.name] };
    return `<div class="branch-item ${b.current ? 'active' : ''}"
                 style="padding-left:${pad}px"
                 onclick="viewBranchLog('${escAttr(b.name)}')"
                 ondblclick="checkoutBranch('${escAttr(b.name)}')"
                 oncontextmenu="branchCtxShow(event,'${bid}')"
                 title="Clic: ver historial · Doble clic: checkout · Clic derecho: opciones">
      <span class="bi-dot">${b.current ? '●' : '○'}</span>
      <span class="bi-name" title="${escAttr(b.name)}">${escHtml(leaf)}</span>
      ${trackBadge(b.name)}
    </div>`;
  }

  function remoteItem(b, pad) {
    const leaf = b.displayName.split('/').pop();
    const bid  = 'b' + (ctxIdx++);
    ctxBranchData[bid] = { name: b.displayName, fullName: b.fullRemoteName, type: 'remote' };
    return `<div class="branch-item remote-branch"
                 style="padding-left:${pad}px"
                 onclick="viewBranchLog('${escAttr(b.fullRemoteName)}')"
                 ondblclick="checkoutRemoteBranch('${escAttr(b.fullRemoteName)}')"
                 oncontextmenu="branchCtxShow(event,'${bid}')"
                 title="${escAttr(b.fullRemoteName)} · Clic derecho: opciones · Doble clic: checkout">
      <span class="bi-dot">☁</span>
      <span class="bi-name">${escHtml(leaf)}</span>
    </div>`;
  }

  let html = '';

  html += `<div class="branch-group-header">Ramas Locales <span class="branch-count">(${localBranches.length})</span></div>`;
  if (localBranches.length === 0) {
    html += `<div class="empty-state-small">${filter ? 'Sin coincidencias' : 'Sin ramas locales'}</div>`;
  } else {
    const tree = buildBranchTree(localBranches, b => b.name);
    html += renderBranchTree(tree, 'local/', 0, localItem);
  }

  html += `<div class="branch-group-header">Ramas Remotas <span class="branch-count">(${remoteBranches.length})</span></div>`;
  if (remoteBranches.length === 0) {
    html += `<div class="empty-state-small">${filter ? 'Sin coincidencias' : 'Sin ramas remotas (haz fetch)'}</div>`;
  } else {
    const tree = buildBranchTree(remoteBranches, b => b.displayName);
    html += renderBranchTree(tree, 'remote/', 0, remoteItem);
  }

  document.getElementById('branchList').innerHTML = html;

  const allLocal = Object.values(branches.branches || {}).filter(b => !b.name.startsWith('remotes/'));
  const opts = allLocal.map(b => `<option value="${escAttr(b.name)}" ${b.current ? 'selected' : ''}>${escHtml(b.name)}</option>`).join('');
  document.getElementById('newBranchFrom').innerHTML = opts;
}

export function renderRepoInfo(info) {
  const name = state.repoPath.split('/').pop() || state.repoPath;
  const syncRows = [];
  if (info.ahead  > 0) syncRows.push(`<span class="sync-pill ahead">↑ ${info.ahead} ahead</span>`);
  if (info.behind > 0) syncRows.push(`<span class="sync-pill behind">↓ ${info.behind} behind</span>`);
  if (!info.tracking && info.totalCommits > 0) syncRows.push(`<span class="sync-pill unpublished" title="Esta rama nunca se ha publicado en el remote">↑ Sin publicar</span>`);

  document.getElementById('repoInfo').innerHTML = `
    <div class="ri-row"><span>Proyecto</span><span class="val" title="${state.repoPath}">${escHtml(name)}</span></div>
    <div class="ri-row"><span>Rama</span><span class="val" style="color:var(--green)">⎇ ${escHtml(info.currentBranch)}</span></div>
    ${info.tracking
      ? `<div class="ri-row"><span>Remote</span><span class="val" style="font-size:10px">${escHtml(info.tracking)}</span></div>`
      : `<div class="ri-row"><span>Remote</span><span class="val" style="color:var(--yellow);font-size:10px">Sin rama remota</span></div>`}
    ${info.defaultBranch
      ? `<div class="ri-row"><span>Principal</span><span class="val" style="color:var(--blue);font-size:11px">⎇ ${escHtml(info.defaultBranch)}</span></div>`
      : ''}
    ${syncRows.length ? `<div class="sync-row">${syncRows.join('')}</div>` : ''}
    ${info.repoState ? _renderConflictBanner(info.repoState, info.conflictedFiles || []) : ''}
  `;
}

function _renderConflictBanner(repoState, conflictedFiles) {
  const labels = {
    'MERGING':        'Merge en progreso',
    'REBASING':       'Rebase en progreso',
    'CHERRY-PICKING': 'Cherry-pick en progreso',
    'REVERTING':      'Revert en progreso',
  };
  const label    = labels[repoState] || repoState;
  const fileList = conflictedFiles.length
    ? `<div class="conflict-files">${conflictedFiles.map(f => `<span>⚠ ${escHtml(f)}</span>`).join('')}</div>`
    : '';
  return `
    <div class="conflict-banner">
      <div class="conflict-title">⚠ ${label}</div>
      ${conflictedFiles.length ? `<div class="conflict-count">${conflictedFiles.length} archivo(s) en conflicto</div>` : ''}
      ${fileList}
      <div class="conflict-actions">
        <button class="btn btn-xs btn-danger"  onclick="window.conflictAbort('${repoState}')">✕ Abortar</button>
        <button class="btn btn-xs btn-primary" onclick="window.conflictContinue('${repoState}')">✓ Continuar</button>
      </div>
    </div>`;
}
