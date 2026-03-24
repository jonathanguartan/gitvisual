import { state } from './state.js';
import { get, post, opPost } from './api.js';
import { escHtml, escAttr, toast, openModal, closeModal, showCtxMenu, closeAllCtxMenus, spinner } from './utils.js';
import { renderDiff } from './diff.js';

// ─── Branch Context Menu ───────────────────────────────────────────────────────

let _ctxBranchData  = {};
let _ctxActiveBid   = null;

export function branchCtxShow(event, bid) {
  event.preventDefault();
  event.stopPropagation();
  _ctxActiveBid = bid;
  const data = _ctxBranchData[bid];
  if (!data) return;

  let items = '';
  if (data.type === 'local') {
    if (!data.isCurrent) items += `<div class="ctx-item" onclick="branchCtxAction('checkout')">✓ Checkout</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('log')">◷ Ver historial</div>`;
    items += `<div class="ctx-sep"></div>`;
    items += `<div class="ctx-item ctx-primary" onclick="branchCtxAction('pull-from')">↓ Pull desde…</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('rebase')">⎇ Rebase onto…</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('rename')">✎ Renombrar</div>`;
    items += `<div class="ctx-sep"></div>`;
    if (!data.tracking?.hasUpstream)
      items += `<div class="ctx-item" onclick="branchCtxAction('set-upstream')">⇡ Asignar rama remota</div>`;
    if (!data.isCurrent) items += `<div class="ctx-item ctx-danger" onclick="branchCtxAction('delete')">✕ Eliminar rama</div>`;
  } else {
    items += `<div class="ctx-item" onclick="branchCtxAction('log')">◷ Ver historial</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('checkout-remote')">⬇ Checkout local</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('new-from-remote')">⊕ Nueva rama desde aquí…</div>`;
    items += `<div class="ctx-sep"></div>`;
    items += `<div class="ctx-item ctx-primary" onclick="branchCtxAction('merge-from-remote')">↓ Merge en rama actual</div>`;
    items += `<div class="ctx-item" onclick="branchCtxAction('rebase-from-remote')">⎇ Rebase en esta rama</div>`;
  }

  showCtxMenu('branchCtxMenu', event, items);
}

export function branchCtxClose() {
  document.getElementById('branchCtxMenu').style.display = 'none';
}

export function branchCtxAction(action) {
  closeAllCtxMenus();
  const data = _ctxBranchData[_ctxActiveBid];
  if (!data) return;
  switch (action) {
    case 'checkout':        checkoutBranch(data.name); break;
    case 'pull-from':       openPullFromModal(data.name, data.tracking?.upstream); break;
    case 'log':             viewBranchLog(data.fullName || data.name); break;
    case 'rename':          openRenameBranchModal(data.name); break;
    case 'rebase':          openRebaseModal(data.name); break;
    case 'delete':          deleteBranch(data.name, data.tracking?.upstream); break;
    case 'checkout-remote':    checkoutRemoteBranch(data.fullName); break;
    case 'new-from-remote':    openNewBranchModal(data.fullName); break;
    case 'merge-from-remote':  mergeFromRemote(data.fullName, 'merge'); break;
    case 'rebase-from-remote': mergeFromRemote(data.fullName, 'rebase'); break;
    case 'pull-ff':         pullBranchFF(data.name, data.tracking?.upstream); break;
    case 'set-upstream':    openSetUpstreamModal(data.name); break;
  }
}

// ─── Set de carpetas colapsadas en el árbol de ramas ──────────────────────────

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
    const key        = prefix + folder;
    const collapsed  = _collapsedBranchFolders.has(key);
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

export function renderBranches(branches) {
  const filter   = (document.getElementById('branchFilter')?.value || '').toLowerCase();
  const tracking = state.branchTracking || {};
  const allBranches = Object.values(branches.branches || {});
  _ctxBranchData    = {};
  let ctxIdx        = 0;

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
    _ctxBranchData[bid] = { name: b.name, isCurrent: b.current, type: 'local', tracking: tracking[b.name] };
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
    _ctxBranchData[bid] = { name: b.displayName, fullName: b.fullRemoteName, type: 'remote' };
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

  html += '<div class="branch-group-header">Ramas Locales</div>';
  if (localBranches.length === 0) {
    html += `<div class="empty-state-small">${filter ? 'Sin coincidencias' : 'Sin ramas locales'}</div>`;
  } else {
    const tree = buildBranchTree(localBranches, b => b.name);
    html += renderBranchTree(tree, 'local/', 0, localItem);
  }

  html += '<div class="branch-group-header">Ramas Remotas</div>';
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

// ─── Render: Repo Info ────────────────────────────────────────────────────────

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
  `;
}

// ─── Branch Operations ────────────────────────────────────────────────────────

export function viewBranchLog(name) {
  document.querySelectorAll('.side-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.side-nav-btn[data-panel="log"]').classList.add('active');
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-log').classList.add('active');
  window.loadLog(name);
}

function showStatusLoading() {
  const s = spinner();
  const el = document.getElementById('stagedFiles');
  const ul = document.getElementById('unstagedFiles');
  if (el) el.innerHTML = s;
  if (ul) ul.innerHTML = s;
}

export async function checkoutBranch(name) {
  if (name === state.currentBranch) return;
  const pending = (state.status?.files || []).filter(f => f.index !== ' ' || f.working_dir !== ' ').length;
  if (pending > 0 && !confirm(`Tienes ${pending} cambios sin commitear. ¿Cambiar a "${name}" de todos modos?`)) return;
  showStatusLoading();
  try {
    await post('/repo/branch/checkout', { branchName: name });
    await window.refreshAll();
    toast(`Rama cambiada a "${name}"`, 'success');
  } catch (e) {
    await window.refreshStatus();
    toast(e.message, 'error');
  }
}

export async function checkoutRemoteBranch(fullRemoteName) {
  // fullRemoteName: e.g. "origin/feature-x" or "remotes/origin/feature-x"
  const stripped = fullRemoteName.replace(/^remotes\//, '');
  const parts    = stripped.split('/');
  const localName = parts.slice(1).join('/'); // strip remote prefix

  // If local branch with same name exists, just switch to it
  const localBranches = Object.values(state.branches?.branches || {})
    .filter(b => !b.name.startsWith('remotes/'))
    .map(b => b.name);

  if (localBranches.includes(localName)) {
    return checkoutBranch(localName);
  }

  const pending = (state.status?.files || []).filter(f => f.index !== ' ' || f.working_dir !== ' ').length;
  if (pending > 0 && !confirm(`Tienes ${pending} cambios sin commitear. ¿Crear y cambiar a "${localName}" de todos modos?`)) return;

  showStatusLoading();
  try {
    await post('/repo/branch/checkout-remote', { remoteName: stripped });
    await window.refreshAll();
    toast(`Rama local "${localName}" creada desde ${stripped} ✓`, 'success');
  } catch (e) {
    await window.refreshStatus();
    toast(e.message, 'error');
  }
}

let _branchToDelete = null;
let _branchToDeleteUpstream = null;

export function deleteBranch(name, upstream) {
  _branchToDelete = name;
  _branchToDeleteUpstream = upstream || null;
  document.getElementById('deleteBranchNameLabel').textContent = name;
  document.getElementById('forceDeleteBranch').checked = false;
  document.getElementById('deleteBranchWarn').style.display = 'none';
  document.getElementById('deleteRemoteBranch').checked = false;

  const remoteRow = document.getElementById('deleteRemoteRow');
  if (upstream) {
    document.getElementById('deleteRemoteLabel').textContent = upstream;
    remoteRow.style.display = '';
  } else {
    remoteRow.style.display = 'none';
  }

  document.getElementById('forceDeleteBranch').onchange = (e) => {
    document.getElementById('deleteBranchWarn').style.display = e.target.checked ? 'block' : 'none';
  };

  openModal('modalDeleteBranch');
}

export async function confirmDeleteBranch() {
  const name     = _branchToDelete;
  const force    = document.getElementById('forceDeleteBranch').checked;
  const delRemote = document.getElementById('deleteRemoteBranch').checked;

  if (!name) return;

  try {
    await post('/repo/branch/delete', { branchName: name, force });
    if (delRemote && _branchToDeleteUpstream) {
      const parts  = _branchToDeleteUpstream.split('/');
      const remote = parts[0];
      const branch = parts.slice(1).join('/');
      await post('/repo/branch/delete-remote', { remote, branch });
    }
    closeModal('modalDeleteBranch');
    await window.refreshBranches();
    const extra = delRemote ? ' y rama remota' : '';
    toast(`Rama "${name}"${extra} eliminada ${force ? '(forzado)' : ''}`, 'info');
  } catch (e) {
    let msg = e.message;
    if (msg.includes('not fully merged')) {
      msg = 'La rama no ha sido fusionada completamente. Marca "Forzar eliminación" si deseas borrarla de todos modos.';
    }
    toast(msg, 'error');
  }
}

export function openPullFromModal(localBranch, trackedUpstream) {
  document.getElementById('pullFromLocalBranch').textContent = localBranch;

  const allBranches   = Object.values(state.branches?.branches || {});
  const remoteBranches = allBranches
    .filter(b => b.name.startsWith('remotes/'))
    .map(b => b.name.replace(/^remotes\//, '')); // "origin/main"

  const sel = document.getElementById('pullFromRemoteBranch');
  sel.innerHTML = remoteBranches
    .map(b => `<option value="${escAttr(b)}" ${b === trackedUpstream ? 'selected' : ''}>${escHtml(b)}</option>`)
    .join('');

  // Si no hay ramas remotas cargadas, avisar
  if (remoteBranches.length === 0) {
    sel.innerHTML = '<option value="">Sin ramas remotas — haz fetch primero</option>';
  }

  openModal('modalPullFrom');
}

export async function confirmPullFrom() {
  const remoteBranch = document.getElementById('pullFromRemoteBranch').value;
  const strategy     = document.getElementById('pullFromStrategy').value;
  if (!remoteBranch) { toast('Selecciona una rama remota', 'warn'); return; }

  closeModal('modalPullFrom');
  await mergeFromRemote(remoteBranch, strategy);
}

export async function mergeFromRemote(fullRemoteName, strategy = 'merge') {
  const normalized = fullRemoteName.replace(/^remotes\//, ''); // "origin/main"
  const action     = strategy === 'rebase' ? 'Rebaseando' : 'Mergeando';
  const label      = `${action} desde ${normalized} en "${state.currentBranch}"…`;

  try {
    await opPost('/repo/branch/merge-from-remote', { remoteBranch: normalized, strategy }, label);
    await window.refreshAll();
    toast(`"${state.currentBranch}" actualizada desde ${normalized} ✓`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function checkoutNewBranchFromRemote(remoteDisplayName, fullRemoteName) {
  openNewBranchModal(fullRemoteName, remoteDisplayName);
}

// ─── Rename Branch ────────────────────────────────────────────────────────────

let _renameBranchOld = null;

export function openRenameBranchModal(name) {
  _renameBranchOld = name;
  document.getElementById('renameBranchOld').value = name;
  document.getElementById('renameBranchNew').value = name;
  openModal('modalRenameBranch');
  requestAnimationFrame(() => {
    const el = document.getElementById('renameBranchNew');
    el.focus(); el.select();
  });
}

export async function confirmRenameBranch() {
  const newName = document.getElementById('renameBranchNew').value.trim();
  if (!newName || newName === _renameBranchOld) { closeModal('modalRenameBranch'); return; }
  try {
    await opPost('/repo/branch/rename', { branchName: _renameBranchOld, newName }, `Renombrando a "${newName}"…`);
    closeModal('modalRenameBranch');
    await window.refreshBranches();
    toast(`Rama renombrada a "${newName}" ✓`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Delete Remote Branch ─────────────────────────────────────────────────────

export async function confirmDeleteRemoteBranch(localName, upstream) {
  if (!upstream) { toast('Esta rama no tiene remote asociado', 'warn'); return; }
  const parts        = upstream.split('/');
  const remote       = parts[0];
  const remoteBranch = parts.slice(1).join('/');
  if (!confirm(`¿Eliminar la rama remota "${upstream}"?\nEsta acción no se puede deshacer.`)) return;
  try {
    await opPost('/repo/branch/delete-remote', { remote, branch: remoteBranch }, `Eliminando ${upstream}…`);
    await window.refreshBranches();
    toast(`Rama remota "${upstream}" eliminada ✓`, 'info');
  } catch (e) { toast(e.message, 'error'); }
}

export async function pullBranchFF(branch, upstream) {
  if (!upstream) { toast('Esta rama no tiene remote asociado', 'warn'); return; }
  const remote = upstream.split('/')[0];
  try {
    await opPost('/repo/branch/pull-ff', { branch, remote }, `Actualizando "${branch}"…`);
    await window.refreshBranches();
    toast(`Rama "${branch}" actualizada ✓`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Rebase ───────────────────────────────────────────────────────────────────

let _rebaseBranch = null;

export function openRebaseModal(name) {
  _rebaseBranch = name;
  document.getElementById('rebaseBranch').value = name;

  const allBranches = Object.values(state.branches?.branches || {});
  const local  = allBranches.filter(b => !b.name.startsWith('remotes/') && b.name !== name).map(b => b.name);
  const remote = allBranches.filter(b => b.name.startsWith('remotes/')).map(b => b.name);
  document.getElementById('rebaseOnto').innerHTML =
    [...local, ...remote].map(b => `<option value="${escAttr(b)}">${escHtml(b)}</option>`).join('');

  openModal('modalRebase');
}

export async function confirmRebase() {
  const onto   = document.getElementById('rebaseOnto').value;
  const branch = _rebaseBranch;
  if (!onto || !branch) return;
  try {
    if (branch !== state.currentBranch) {
      await opPost('/repo/branch/checkout', { branchName: branch }, `Cambiando a "${branch}"…`);
    }
    await opPost('/repo/branch/rebase', { onto }, `Rebaseando "${branch}" sobre "${onto}"…`);
    closeModal('modalRebase');
    await window.refreshAll();
    toast('Rebase completado ✓', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export function openNewBranchModal(fromBranchName = '', suggestedNewBranchName = '') {
  document.getElementById('newBranchName').value = suggestedNewBranchName;
  const newBranchFromEl = document.getElementById('newBranchFrom');

  newBranchFromEl.innerHTML = '';

  const allBranches = Object.values(state.branches?.branches || {});
  const localBranches = allBranches.filter(b => !b.name.startsWith('remotes/'));
  const remoteBranches = allBranches.filter(b => b.name.startsWith('remotes/'));

  let optionsHtml = '';
  optionsHtml += `<option value="">Crear desde HEAD (primer rama)</option>`;

  if (localBranches.length > 0) {
    optionsHtml += `<optgroup label="Ramas Locales">`;
    optionsHtml += localBranches.map(b => `<option value="${escAttr(b.name)}" ${b.current ? 'selected' : ''}>${escHtml(b.name)}</option>`).join('');
    optionsHtml += `</optgroup>`;
  }

  if (remoteBranches.length > 0) {
    optionsHtml += `<optgroup label="Ramas Remotas">`;
    optionsHtml += remoteBranches.map(b => `<option value="${escAttr(b.name)}">${escHtml(b.name.replace(/^remotes\/(origin|upstream)\//, '$1/'))}</option>`).join('');
    optionsHtml += `</optgroup>`;
  }

  newBranchFromEl.innerHTML = optionsHtml;

  if (fromBranchName) {
    newBranchFromEl.value = fromBranchName;
  } else if (state.currentBranch) {
    newBranchFromEl.value = state.currentBranch;
  }

  openModal('modalBranch');
  requestAnimationFrame(() => document.getElementById('newBranchName').focus());
}

function _highlightBranch(name) {
  const branchList = document.getElementById('branchList');
  if (!branchList) return;
  const leafName = name.split('/').pop();
  for (const item of branchList.querySelectorAll('.branch-item')) {
    const nameEl = item.querySelector('.bi-name');
    if (nameEl && (nameEl.title === name || nameEl.textContent.trim() === leafName)) {
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      item.classList.add('branch-new-highlight');
      setTimeout(() => item.classList.remove('branch-new-highlight'), 2500);
      break;
    }
  }
}

export async function createBranch(name, from, skipModal = false) {
  if (!name) { if (!skipModal) toast('Ingresa un nombre de rama', 'warn'); return false; }
  if (!/^[a-zA-Z0-9._/\-]+$/.test(name)) { if (!skipModal) toast('Nombre inválido (usa letras, números, /, -, _)', 'warn'); return false; }
  const noCheckout = !skipModal && !!document.getElementById('newBranchNoCheckout')?.checked;
  try {
    await post('/repo/branch/create', { branchName: name, fromBranch: from, noCheckout });
    if (!skipModal) closeModal('modalBranch');
    await window.refreshAll();
    if (!skipModal) toast(noCheckout ? `Rama "${name}" creada (sin checkout)` : `Rama "${name}" creada y activa`, 'success');
    if (noCheckout) _highlightBranch(name);
    return true;
  } catch (e) { if (!skipModal) toast(e.message, 'error'); return false; }
}

export function updateCreateBranchBtn() {
  const btn = document.getElementById('btnCreateBranch');
  if (!btn) return;
  const noCheckout = document.getElementById('newBranchNoCheckout')?.checked;
  btn.textContent = noCheckout ? 'Solo Crear' : 'Crear y Cambiar';
}

export function openSetUpstreamModal(localBranch) {
  const allBranches = Object.values(state.branches?.branches || {});
  const remoteBranches = allBranches
    .filter(b => b.name.startsWith('remotes/'))
    .map(b => b.name.replace(/^remotes\//, ''));

  const matchingRemote = remoteBranches.find(r => r.endsWith('/' + localBranch));

  document.getElementById('setUpstreamLocal').textContent = localBranch;

  const select = document.getElementById('setUpstreamRemote');
  select.innerHTML = '';

  // Opción: publicar como nueva rama remota (primer push)
  const newOpt = document.createElement('option');
  newOpt.value = `origin/${localBranch}`;
  newOpt.textContent = `➕ Publicar como origin/${localBranch} (nueva)`;
  newOpt.dataset.new = 'true';
  if (!matchingRemote) newOpt.selected = true;
  select.appendChild(newOpt);

  // Separador + ramas remotas existentes
  if (remoteBranches.length > 0) {
    const sep = document.createElement('option');
    sep.disabled = true;
    sep.textContent = '─── Ramas remotas existentes ───';
    select.appendChild(sep);
    for (const r of remoteBranches) {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      if (r === matchingRemote) opt.selected = true;
      select.appendChild(opt);
    }
  }

  const btn = document.getElementById('btnConfirmSetUpstream');
  const syncBtn = () => {
    const sel = select.options[select.selectedIndex];
    btn.textContent = sel?.dataset?.new ? 'Publicar' : 'Asignar';
  };
  select.onchange = syncBtn;
  syncBtn();

  btn.onclick = () => confirmSetUpstream(localBranch);
  openModal('modalSetUpstream');
}

export async function confirmSetUpstream(localBranch) {
  const select   = document.getElementById('setUpstreamRemote');
  const upstream = select.value.trim();
  const isNew    = select.options[select.selectedIndex]?.dataset?.new === 'true';
  if (!upstream) { toast('Selecciona una opción', 'warn'); return; }
  try {
    if (isNew) {
      const remote = upstream.split('/')[0];
      await opPost('/repo/push', { branch: localBranch, remote, setUpstream: true }, `↑ Publicando "${localBranch}"…`);
    } else {
      await post('/repo/branch/set-upstream', { branchName: localBranch, upstream });
    }
    closeModal('modalSetUpstream');
    await window.refreshAll();
    toast(isNew ? `Rama "${localBranch}" publicada en ${upstream} ✓` : `Rama remota asignada: ${upstream} → ${localBranch} ✓`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function openCreateBranchAtModal(hash) {
  const name = prompt(`Nombre para la nueva rama (desde ${hash.slice(0,7)}):`);
  if (!name?.trim()) return;
  post('/repo/branch/create-at', { branchName: name.trim(), hash })
    .then(() => { window.refreshBranches(); toast(`Rama "${name.trim()}" creada ✓`, 'success'); })
    .catch(e => toast(e.message, 'error'));
}

// ─── Compare branches ─────────────────────────────────────────────────────────

export function openCompareBranchesModal() {
  const branches = Object.keys(state.branches?.branches || {});
  if (branches.length < 2) { toast('Se necesitan al menos 2 ramas para comparar', 'warn'); return; }
  const current = state.repoInfo?.currentBranch || branches[0];
  const opts = branches.map(b => `<option value="${escAttr(b)}"${b === current ? ' selected' : ''}>${escHtml(b)}</option>`).join('');
  document.getElementById('compareFrom').innerHTML = opts;
  document.getElementById('compareTo').innerHTML   = opts;
  const mb = window.mainBranch || 'main';
  const defaultTo = branches.find(b => b === mb) || branches.find(b => b === 'main' || b === 'master') || branches.find(b => b !== current) || branches[0];
  document.getElementById('compareTo').value = defaultTo;
  document.getElementById('compareResult').innerHTML = '<div class="compare-empty">Selecciona dos ramas y pulsa Comparar</div>';
  openModal('modalCompare');
}

export async function loadBranchCompare() {
  const from = document.getElementById('compareFrom').value;
  const to   = document.getElementById('compareTo').value;
  if (from === to) { toast('Selecciona dos ramas distintas', 'warn'); return; }
  const result = document.getElementById('compareResult');
  result.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div> Cargando…</div>';
  try {
    const data = await get('/repo/branch/compare', { from, to });
    const commits = data.commits || [];
    const commitsHtml = commits.length
      ? `<div class="compare-commits">
           <div class="compare-section-title">📋 ${commits.length} commit${commits.length !== 1 ? 's' : ''} en <strong>${escHtml(to)}</strong> que no están en <strong>${escHtml(from)}</strong></div>
           ${commits.map(c => `<div class="compare-commit-row"><span class="log-hash">${escHtml(c.slice(0,7))}</span> ${escHtml(c.slice(8))}</div>`).join('')}
         </div>`
      : `<div class="compare-empty">Las ramas están al mismo nivel</div>`;
    const diffHtml = data.diff
      ? `<div class="compare-section-title" style="margin-top:12px">Diff</div><div class="compare-diff-wrap">${renderDiff(data.diff, to)}</div>`
      : '';
    result.innerHTML = commitsHtml + diffHtml;
  } catch (e) {
    result.innerHTML = `<div class="compare-empty">${escHtml(e.message)}</div>`;
  }
}

// ─── Merged branches cleanup ──────────────────────────────────────────────────

export async function openMergedBranchesModal() {
  const base = state.currentBranch;
  document.getElementById('mergedBranchesBase').textContent = base;
  document.getElementById('mergedBranchesList').innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
  openModal('modalMergedBranches');
  try {
    const data = await get('/repo/branches/merged', { base });
    const branches = data.branches || [];
    if (branches.length === 0) {
      document.getElementById('mergedBranchesList').innerHTML = '<div class="recover-empty">No hay ramas mergeadas para limpiar.</div>';
      return;
    }
    document.getElementById('mergedBranchesList').innerHTML = branches.map(b => `
      <label class="merged-branch-row">
        <input type="checkbox" class="merged-branch-chk" value="${escAttr(b)}" checked />
        <span class="merged-branch-name">${escHtml(b)}</span>
      </label>`).join('');
  } catch (e) { toast(e.message, 'error'); }
}

export async function deleteSelectedMergedBranches() {
  const checks = [...document.querySelectorAll('.merged-branch-chk:checked')];
  if (checks.length === 0) { toast('Selecciona al menos una rama', 'warn'); return; }
  if (!confirm(`¿Eliminar ${checks.length} rama(s) mergeada(s)?`)) return;
  let ok = 0, fail = 0;
  for (const chk of checks) {
    try {
      await post('/repo/branch/delete', { branchName: chk.value, force: false });
      ok++;
    } catch (_) { fail++; }
  }
  closeModal('modalMergedBranches');
  await window.refreshBranches();
  toast(`${ok} ramas eliminadas${fail ? `, ${fail} fallidas` : ''} ✓`, ok > 0 ? 'success' : 'error');
}

// ─── Window assignments for HTML onclick handlers ────────────────────────────

window.branchCtxShow            = branchCtxShow;
window.branchCtxClose           = branchCtxClose;
window.branchCtxAction          = branchCtxAction;
window.toggleBranchFolder       = toggleBranchFolder;
window.viewBranchLog            = viewBranchLog;
window.checkoutBranch           = checkoutBranch;
window.checkoutRemoteBranch     = checkoutRemoteBranch;
window.deleteBranch             = deleteBranch;
window.confirmDeleteBranch      = confirmDeleteBranch;
window.openRenameBranchModal    = openRenameBranchModal;
window.confirmRenameBranch      = confirmRenameBranch;
window.openRebaseModal          = openRebaseModal;
window.confirmRebase            = confirmRebase;
window.openNewBranchModal       = openNewBranchModal;
window.createBranch             = createBranch;
window.updateCreateBranchBtn    = updateCreateBranchBtn;
window.checkoutNewBranchFromRemote = checkoutNewBranchFromRemote;
window.mergeFromRemote             = mergeFromRemote;
window.openPullFromModal           = openPullFromModal;
window.confirmPullFrom             = confirmPullFrom;
window.pullBranchFF             = pullBranchFF;
window.openCreateBranchAtModal  = openCreateBranchAtModal;
window.openSetUpstreamModal     = openSetUpstreamModal;
window.confirmSetUpstream       = confirmSetUpstream;
window.openCompareBranchesModal   = openCompareBranchesModal;
window.loadBranchCompare          = loadBranchCompare;
window.onBranchFilter             = onBranchFilter;
window.openMergedBranchesModal    = openMergedBranchesModal;
window.deleteSelectedMergedBranches = deleteSelectedMergedBranches;
