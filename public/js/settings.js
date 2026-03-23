import { state } from './state.js';
import { get, post, opPost, api } from './api.js';
import { escHtml, escAttr, toast, openModal, closeModal } from './utils.js';
import { startAutoFetch } from './sync.js';

// ─── Settings ─────────────────────────────────────────────────────────────────

export function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-tab-btn').forEach(b => {
    const btnTab = b.getAttribute('onclick')?.match(/'(\w+)'/)?.[1];
    b.classList.toggle('active', btnTab === tab);
  });
  document.getElementById('settingsTabGeneral').classList.toggle('active', tab === 'general');
  document.getElementById('settingsTabCuenta').classList.toggle('active', tab === 'cuenta');
}

// ─── Platform settings (dynamic) ─────────────────────────────────────────────

let _platformsMeta = null; // cached after successful render

function _platformFieldId(platformId, fieldKey) {
  return `cfg_${platformId}_${fieldKey}`;
}

async function _renderPlatformSettings(cfg) {
  const container = document.getElementById('platformSettingsContainer');
  try {
    const platforms = await api('GET', '/config/platforms');
    _platformsMeta  = platforms; // cache only on success
    container.innerHTML = platforms.map(p => {
      const savedCfg = cfg.platforms?.[p.id] || {};
      const fields   = p.configFields.map(f => `
        <div class="form-row">
          <label>${f.label}</label>
          <input type="${f.type}" id="${_platformFieldId(p.id, f.key)}"
            placeholder="${f.placeholder || ''}"
            value="${(savedCfg[f.key] || '').replace(/"/g, '&quot;')}" />
          ${f.help ? `<small>${f.help}</small>` : ''}
        </div>`).join('');
      return `<fieldset class="form-group-set">
        <legend>${p.name}</legend>
        ${fields}
      </fieldset>`;
    }).join('');
  } catch (e) {
    _platformsMeta = null;
    container.innerHTML = `<div style="color:var(--red);font-size:12px">Error cargando plataformas: ${e.message}</div>`;
  }
}

function _collectPlatformSettings(platforms) {
  const result = {};
  for (const p of platforms) {
    const entry = {};
    for (const f of p.configFields) {
      const el = document.getElementById(_platformFieldId(p.id, f.key));
      if (el) entry[f.key] = el.value.trim();
    }
    result[p.id] = entry;
  }
  return result;
}

// ─── Open / Save ──────────────────────────────────────────────────────────────

export async function openSettingsModal(tab = 'general') {
  switchSettingsTab(tab);
  try {
    const cfg = await api('GET', '/config');
    document.getElementById('cfgAutoFetch').value      = cfg.autoFetchMinutes ?? 5;
    document.getElementById('cfgRebaseOnPull').checked = !!cfg.rebaseOnPull;
    document.getElementById('cfgAutoStash').checked    = !!cfg.autoStash;
    document.getElementById('cfgDiffContext').value    = String(cfg.diffContext ?? 3);
    document.getElementById('cfgLogLimit').value       = String(cfg.logLimit ?? 100);
    document.getElementById('cfgMainBranch').value     = cfg.mainBranch || 'main';

    document.getElementById('cfgName').value   = '';
    document.getElementById('cfgEmail').value  = '';
    document.getElementById('cfgRemote').value = '';
    if (state.repoInfo) {
      document.getElementById('cfgName').value  = state.repoInfo.userName  || '';
      document.getElementById('cfgEmail').value = state.repoInfo.userEmail || '';
      const remotes = state.repoInfo.remotes || [];
      if (remotes.length > 0)
        document.getElementById('cfgRemote').value = remotes[0].refs.push || remotes[0].refs.fetch || '';
    }

    await _renderPlatformSettings(cfg);
    openModal('modalSettings');
  } catch (e) { toast(e.message, 'error'); }
}

export async function saveSettings() {
  const name     = document.getElementById('cfgName').value.trim();
  const email    = document.getElementById('cfgEmail').value.trim();
  let   remote   = document.getElementById('cfgRemote').value.trim();
  const isGlobal = document.getElementById('cfgGlobal').checked;

  const autoFetchMinutes = parseInt(document.getElementById('cfgAutoFetch').value, 10) || 0;
  const rebaseOnPull     = document.getElementById('cfgRebaseOnPull').checked;
  const autoStash        = document.getElementById('cfgAutoStash').checked;
  const diffContext      = parseInt(document.getElementById('cfgDiffContext').value, 10) || 3;
  const logLimit         = parseInt(document.getElementById('cfgLogLimit').value, 10) || 100;
  const mainBranch       = document.getElementById('cfgMainBranch').value.trim() || 'main';

  // Use cached platform metadata from openSettingsModal render.
  // If rendering failed (_platformsMeta is null), skip platforms to avoid overwriting existing tokens.
  const payload = { autoFetchMinutes, rebaseOnPull, autoStash, diffContext, logLimit, mainBranch };
  if (_platformsMeta) {
    payload.platforms = _collectPlatformSettings(_platformsMeta);
  }

  try {
    await api('POST', '/config/save', payload);
    window.mainBranch = mainBranch;
    startAutoFetch(autoFetchMinutes);

    if (name)  await post('/repo/config/set', { key: 'user.name',  value: name,  global: isGlobal });
    if (email) await post('/repo/config/set', { key: 'user.email', value: email, global: isGlobal });

    if (remote && state.repoPath) {
      const sanitizedRemote = remote.replace(/\/+$/, '');
      if (sanitizedRemote !== remote) {
        remote = sanitizedRemote;
        document.getElementById('cfgRemote').value = remote;
        toast('Se quitó la barra "/" final de la URL del remote.', 'info');
      }

      const remotes = state.repoInfo?.remotes || [];
      const originRemote = remotes.find(r => r.name === 'origin');

      if (!originRemote) {
        await post('/repo/remote/add', { name: 'origin', url: remote });
      } else if (originRemote.refs.push !== remote) {
        await post('/repo/remote/set-url', { name: 'origin', url: remote });
      }
    }

    closeModal('modalSettings');
    await window.refreshAll();
    toast('Configuración guardada ✓', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

export function openRecoverModal() {
  openModal('modalRecover');
  scanRecover();
}

export async function scanRecover() {
  document.getElementById('recoverScanning').style.display = '';
  document.getElementById('recoverResults').style.display  = 'none';

  try {
    const data = await get('/repo/recover/scan');
    renderRecoverStashes(data.stashes  || []);
    renderRecoverBranches(data.deletedBranches || []);
    document.getElementById('recoverScanning').style.display = 'none';
    document.getElementById('recoverResults').style.display  = '';
  } catch (e) {
    document.getElementById('recoverScanning').style.display = 'none';
    document.getElementById('recoverResults').style.display  = '';
    toast('Error al escanear: ' + e.message, 'error');
  }
}

function renderRecoverStashes(stashes) {
  const el    = document.getElementById('recoverStashList');
  const badge = document.getElementById('recoverStashCount');
  badge.textContent = stashes.length;
  badge.className   = `badge ${stashes.length > 0 ? '' : 'badge-empty'}`;

  if (stashes.length === 0) {
    el.innerHTML = '<div class="recover-empty">No se encontraron stashes recuperables. Es posible que el GC ya los haya eliminado.</div>';
    return;
  }
  el.innerHTML = stashes.map(s => `
    <div class="recover-item">
      <div class="recover-item-info">
        <div class="recover-item-msg">${escHtml(s.message || '(sin mensaje)')}</div>
        <div class="recover-item-meta">
          <span class="recover-item-hash">${escHtml(s.hash)}</span>
          <span>${escHtml(s.ago)}</span>
        </div>
      </div>
      <div class="recover-item-actions">
        <button class="btn btn-xs btn-secondary" onclick="recoverFromStash('${escAttr(s.fullHash)}')">Aplicar</button>
        <button class="btn btn-xs btn-primary"   onclick="recoverStashStore('${escAttr(s.fullHash)}', '${escAttr(s.message)}')">Guardar en stash</button>
      </div>
    </div>
  `).join('');
}

function renderRecoverBranches(branches) {
  const el    = document.getElementById('recoverBranchList');
  const badge = document.getElementById('recoverBranchCount');
  badge.textContent = branches.length;
  badge.className   = `badge ${branches.length > 0 ? '' : 'badge-empty'}`;

  if (branches.length === 0) {
    el.innerHTML = '<div class="recover-empty">No se encontraron ramas eliminadas en el reflog.</div>';
    return;
  }
  el.innerHTML = branches.map(b => `
    <div class="recover-item">
      <div class="recover-item-info">
        <div class="recover-item-msg">⎇ ${escHtml(b.name)}</div>
        <div class="recover-item-meta">
          <span class="recover-item-hash">${escHtml(b.hash.substring(0,8))}</span>
          <span>último checkout ${escHtml(b.ago)}</span>
        </div>
      </div>
      <div class="recover-item-actions">
        <button class="btn btn-xs btn-primary" onclick="recoverBranch('${escAttr(b.hash)}', '${escAttr(b.name)}')">Restaurar rama</button>
      </div>
    </div>
  `).join('');
}

export async function recoverFromStash(fullHash) {
  try {
    await opPost('/repo/recover/stash-apply', { fullHash }, 'Aplicando stash recuperado…');
    await window.refreshStatus();
    closeModal('modalRecover');
    toast('Stash aplicado correctamente', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function recoverStashStore(fullHash, message) {
  try {
    await opPost('/repo/recover/stash-store', { fullHash, message }, 'Guardando stash recuperado…');
    // refresh stash list
    const stashes = await get('/repo/stash/list');
    state.stashList = stashes;
    window.renderStashList(stashes);
    closeModal('modalRecover');
    toast('Stash guardado de nuevo en la lista', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function recoverBranch(hash, name) {
  const currentBranches = state.branches?.all || [];
  let branchName = name;
  if (currentBranches.includes(name)) {
    branchName = prompt(`La rama "${name}" ya existe. Introduce un nuevo nombre:`, name + '-recovered');
    if (!branchName) return;
  }
  try {
    await opPost('/repo/recover/branch', { hash, name: branchName }, 'Restaurando rama…');
    await window.refreshBranches();
    closeModal('modalRecover');
    toast(`Rama "${branchName}" restaurada`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

document.getElementById('btnRescan').addEventListener('click', scanRecover);

// ─── Cherry-Pick ──────────────────────────────────────────────────────────────

let _cherryPickCommitHash = null;

export async function openCherryPickModal(commitHash) {
  if (!state.repoPath) { toast('Abre un repositorio primero', 'warn'); return; }
  _cherryPickCommitHash = commitHash;
  document.getElementById('cherryPickCommitHash').value = commitHash.slice(0, 7);

  const localBranches = Object.values(state.branches?.branches || {})
    .filter(b => !b.name.startsWith('remotes/'))
    .map(b => b.name);
  const opts = localBranches.map(b => `<option value="${escAttr(b)}" ${b === state.currentBranch ? 'selected' : ''}>${escHtml(b)}</option>`).join('');
  document.getElementById('cherryPickTargetBranch').innerHTML = opts;

  document.getElementById('cherryPickNewBranchName').value = '';

  openModal('modalCherryPick');
}

export async function confirmCherryPick() {
  const commitHash = _cherryPickCommitHash;
  const newBranchName = document.getElementById('cherryPickNewBranchName').value.trim();
  const targetBranch = newBranchName || document.getElementById('cherryPickTargetBranch').value;

  if (!commitHash) { toast('No se seleccionó ningún commit', 'warn'); return; }
  if (!targetBranch) { toast('Selecciona una rama o introduce un nombre para una nueva rama', 'warn'); return; }
  if (newBranchName && !/^[a-zA-Z0-9._/\-]+$/.test(newBranchName)) { toast('Nombre de rama inválido (letras, números, /, -, _)', 'warn'); return; }

  try {
    toast(`Aplicando cherry-pick del commit ${commitHash.slice(0, 7)}…`, 'info');
    await post('/repo/cherry-pick', { commitHash, targetBranch });
    closeModal('modalCherryPick');
    await window.refreshAll();
    toast(`Cherry-pick de ${commitHash.slice(0, 7)} aplicado con éxito ✓`, 'success');
  } catch (e) {
    toast(`Error en cherry-pick: ${e.message}`, 'error');
  }
}

document.getElementById('btnConfirmCherryPick').addEventListener('click', confirmCherryPick);

// ─── Push to Production ────────────────────────────────────────────────────────

export function openProdModal() {
  document.getElementById('prodBranch').value = window.mainBranch || 'main';
  document.getElementById('prodMerge').checked = true;
  openModal('modalProd');
}

export async function pushToProduction(branchOverride = null, mergeFromOverride = null) {
  const productionBranch = branchOverride || document.getElementById('prodBranch').value;
  const mergeFrom        = (mergeFromOverride !== null) ? mergeFromOverride : (document.getElementById('prodMerge').checked ? state.currentBranch : null);

  if (!branchOverride && mergeFrom && mergeFrom === productionBranch) {
    toast('Ya estás en la rama de producción', 'warn'); return;
  }

  if (!branchOverride) closeModal('modalProd');

  try {
    const result = await opPost('/repo/push-production', { productionBranch, mergeFrom }, `🚀 Push a producción (${productionBranch})…`);
    if (result === null) return false;
    await window.refreshAll();
    toast(`🚀 ${result.message}`, 'success');
    return true;
  } catch (e) { toast(`Error: ${e.message}`, 'error'); return false; }
}

// ─── Window assignments for HTML onclick handlers ────────────────────────────

window.openSettingsModal   = openSettingsModal;
window.saveSettings        = saveSettings;
window.switchSettingsTab   = switchSettingsTab;
window.openRecoverModal    = openRecoverModal;
window.scanRecover         = scanRecover;
window.recoverFromStash    = recoverFromStash;
window.recoverBranch       = recoverBranch;
window.openCherryPickModal = openCherryPickModal;
window.confirmCherryPick   = confirmCherryPick;
window.openProdModal       = openProdModal;
window.pushToProduction    = pushToProduction;
window.recoverStashStore   = recoverStashStore;
