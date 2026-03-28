import { state } from './state.js';
import { get, post, opPost } from './api.js';
import { escHtml, escAttr, toast, openModal, closeModal, spinner } from './utils.js';
import { renderDiff } from './diff.js';

// ─── Helpers internos ─────────────────────────────────────────────────────────

function showStatusLoading() {
  const el = document.getElementById('stagedFiles');
  const ul = document.getElementById('unstagedFiles');
  const s  = spinner();
  if (el) el.innerHTML = s;
  if (ul) ul.innerHTML = s;
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

// ─── Log & Navigation ────────────────────────────────────────────────────────

export function viewBranchLog(name) {
  document.querySelectorAll('.side-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.side-nav-btn[data-panel="log"]').classList.add('active');
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-log').classList.add('active');
  window.loadLog(name);
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

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
  const stripped  = fullRemoteName.replace(/^remotes\//, '');
  const parts     = stripped.split('/');
  const localName = parts.slice(1).join('/');

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

// ─── Delete ───────────────────────────────────────────────────────────────────

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
  const name      = _branchToDelete;
  const force     = document.getElementById('forceDeleteBranch').checked;
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

export async function confirmDeleteRemoteBranch(upstream) {
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

// ─── Pull ─────────────────────────────────────────────────────────────────────

export function openPullFromModal(localBranch, trackedUpstream) {
  document.getElementById('pullFromLocalBranch').textContent = localBranch;

  const allBranches    = Object.values(state.branches?.branches || {});
  const remoteBranches = allBranches
    .filter(b => b.name.startsWith('remotes/'))
    .map(b => b.name.replace(/^remotes\//, ''));

  const sel = document.getElementById('pullFromRemoteBranch');
  sel.innerHTML = remoteBranches
    .map(b => `<option value="${escAttr(b)}" ${b === trackedUpstream ? 'selected' : ''}>${escHtml(b)}</option>`)
    .join('');

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

export async function pullBranchFF(branch, upstream) {
  if (!upstream) { toast('Esta rama no tiene remote asociado', 'warn'); return; }
  const remote = upstream.split('/')[0];
  try {
    await opPost('/repo/branch/pull-ff', { branch, remote }, `Actualizando "${branch}"…`);
    await window.refreshBranches();
    toast(`Rama "${branch}" actualizada ✓`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Merge / Rebase from remote ───────────────────────────────────────────────

export async function mergeFromRemote(fullRemoteName, strategy = 'merge') {
  const normalized = fullRemoteName.replace(/^remotes\//, '');
  const action     = strategy === 'rebase' ? 'Rebaseando' : 'Mergeando';
  const label      = `${action} desde ${normalized} en "${state.currentBranch}"…`;

  try {
    await opPost('/repo/branch/merge-from-remote', { remoteBranch: normalized, strategy }, label);
    await window.refreshAll();
    toast(`"${state.currentBranch}" actualizada desde ${normalized} ✓`, 'success');
  } catch (e) {
    await window.refreshAll();
    toast(e.message, 'error');
  }
}

export async function checkoutNewBranchFromRemote(remoteDisplayName, fullRemoteName) {
  openNewBranchModal(fullRemoteName, remoteDisplayName);
}

// ─── Conflict ─────────────────────────────────────────────────────────────────

export async function conflictAbort(repoState) {
  try {
    await opPost('/repo/conflict/abort', { state: repoState }, `Abortando ${repoState.toLowerCase()}…`);
    await window.refreshAll();
    toast('Operación abortada. El repositorio volvió a su estado anterior.', 'info');
  } catch (e) { toast(e.message, 'error'); }
}

export async function conflictContinue(repoState) {
  let message = '';
  if (repoState === 'MERGING') {
    const pending = state.status?.conflicted || [];
    if (pending.length > 0) {
      toast(`Hay ${pending.length} archivo(s) todavía en conflicto. Resuélvelos primero.`, 'warn');
      return;
    }
    message = prompt('Mensaje para el commit de merge:', `Merge (resolviendo conflictos)`);
    if (!message) return;
  }
  try {
    await opPost('/repo/conflict/continue', { state: repoState, message }, `Continuando ${repoState.toLowerCase()}…`);
    await window.refreshAll();
    toast('Operación completada ✓', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Rename ───────────────────────────────────────────────────────────────────

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

// ─── Create Branch ────────────────────────────────────────────────────────────

export function openNewBranchModal(fromBranchName = '', suggestedNewBranchName = '') {
  document.getElementById('newBranchName').value = suggestedNewBranchName;
  const newBranchFromEl = document.getElementById('newBranchFrom');
  newBranchFromEl.innerHTML = '';

  const allBranches    = Object.values(state.branches?.branches || {});
  const localBranches  = allBranches.filter(b => !b.name.startsWith('remotes/'));
  const remoteBranches = allBranches.filter(b => b.name.startsWith('remotes/'));

  let optionsHtml = `<option value="">Crear desde HEAD (primer rama)</option>`;

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

  if (fromBranchName)        newBranchFromEl.value = fromBranchName;
  else if (state.currentBranch) newBranchFromEl.value = state.currentBranch;

  openModal('modalBranch');
  requestAnimationFrame(() => document.getElementById('newBranchName').focus());
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

// ─── Set Upstream ─────────────────────────────────────────────────────────────

export function openSetUpstreamModal(localBranch) {
  const allBranches    = Object.values(state.branches?.branches || {});
  const remoteBranches = allBranches
    .filter(b => b.name.startsWith('remotes/'))
    .map(b => b.name.replace(/^remotes\//, ''));

  const matchingRemote = remoteBranches.find(r => r.endsWith('/' + localBranch));

  document.getElementById('setUpstreamLocal').textContent = localBranch;

  const select = document.getElementById('setUpstreamRemote');
  select.innerHTML = '';

  const newOpt = document.createElement('option');
  newOpt.value = `origin/${localBranch}`;
  newOpt.textContent = `➕ Publicar como origin/${localBranch} (nueva)`;
  newOpt.dataset.new = 'true';
  if (!matchingRemote) newOpt.selected = true;
  select.appendChild(newOpt);

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

// ─── Compare ──────────────────────────────────────────────────────────────────

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
    const data    = await get('/repo/branch/compare', { from, to });
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
    const data     = await get('/repo/branches/merged', { base });
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
