import { emit } from './bus.js';
import { state } from './state.js';
import { get, post, opPost, api } from './api.js';
import { escHtml, escAttr, toast, openModal, closeModal } from './utils.js';
import { startAutoFetch } from './sync.js';
import { isValidRefName } from './validation.js';

// ─── Settings ─────────────────────────────────────────────────────────────────

export function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-tab-btn').forEach(b => {
    const btnTab = b.getAttribute('onclick')?.match(/'(\w+)'/)?.[1];
    b.classList.toggle('active', btnTab === tab);
  });
  document.getElementById('settingsTabGeneral').classList.toggle('active', tab === 'general');
  document.getElementById('settingsTabCuenta').classList.toggle('active', tab === 'cuenta');
  const remotosTab = document.getElementById('settingsTabRemotos');
  if (remotosTab) remotosTab.classList.toggle('active', tab === 'remotos');
  const repoTab = document.getElementById('settingsTabRepositorio');
  if (repoTab) repoTab.classList.toggle('active', tab === 'repositorio');
  if (tab === 'remotos')     loadRemotesTab();
  if (tab === 'repositorio') _loadRepoTab();
}

// ─── Per-repo config tab ──────────────────────────────────────────────────────

async function _loadRepoTab() {
  const noRepo = document.getElementById('repoSettingsNoRepo');
  const body   = document.getElementById('repoSettingsBody');
  if (!state.repoPath) {
    noRepo.style.display = '';
    body.style.display   = 'none';
    return;
  }
  noRepo.style.display = 'none';
  body.style.display   = '';
  document.getElementById('repoSettingsPathLabel').textContent = state.repoPath;

  try {
    const { global: g, overrides } = await get('/config/repo');

    // Checkboxes: si hay override lo usamos, si no caemos al global
    document.getElementById('repoCfgRebaseOnPull').checked =
      overrides.rebaseOnPull !== undefined ? !!overrides.rebaseOnPull : !!g.rebaseOnPull;
    document.getElementById('repoCfgAutoStash').checked =
      overrides.autoStash !== undefined ? !!overrides.autoStash : !!g.autoStash;

    // Text input: vacío = heredado de global
    document.getElementById('repoCfgMainBranch').value =
      overrides.mainBranch !== undefined ? overrides.mainBranch : '';
    document.getElementById('repoCfgMainBranch').placeholder =
      `heredado de global (${g.mainBranch || 'main'})`;

    // Selects: valor vacío = heredado de global
    const diffSel = document.getElementById('repoCfgDiffContext');
    diffSel.value = overrides.diffContext !== undefined ? String(overrides.diffContext) : '';

    const logSel = document.getElementById('repoCfgLogLimit');
    logSel.value = overrides.logLimit !== undefined ? String(overrides.logLimit) : '';
  } catch (e) { toast(e.message, 'error'); }
}

export async function saveRepoSettings() {
  if (!state.repoPath) { toast('No hay repositorio abierto', 'warn'); return; }

  const mainBranch = document.getElementById('repoCfgMainBranch').value.trim();
  if (mainBranch && !isValidRefName(mainBranch)) {
    toast('Nombre de rama principal inválido.', 'warn'); return;
  }

  const payload = { repoPath: state.repoPath };
  payload.rebaseOnPull = document.getElementById('repoCfgRebaseOnPull').checked;
  payload.autoStash    = document.getElementById('repoCfgAutoStash').checked;
  if (mainBranch) payload.mainBranch = mainBranch;

  const diffVal = document.getElementById('repoCfgDiffContext').value;
  if (diffVal) payload.diffContext = parseInt(diffVal, 10);

  const logVal = document.getElementById('repoCfgLogLimit').value;
  if (logVal) payload.logLimit = parseInt(logVal, 10);

  try {
    await api('POST', '/config/repo/save', payload);
    toast('Configuración del repositorio guardada ✓', 'success');
    emit('repo:refresh');
  } catch (e) { toast(e.message, 'error'); }
}

export async function clearRepoSettings() {
  if (!state.repoPath) return;
  if (!confirm('¿Eliminar la configuración específica de este repositorio y volver a los ajustes globales?')) return;
  try {
    await api('POST', '/config/repo/clear', { repoPath: state.repoPath });
    await _loadRepoTab();
    toast('Configuración del repositorio restablecida a global ✓', 'info');
  } catch (e) { toast(e.message, 'error'); }
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
        <div class="platform-verify-row">
          <button class="btn btn-xs btn-secondary" onclick="verifyPlatformCredentials('${p.id}')">Verificar credenciales</button>
          <span id="verify_status_${p.id}" class="platform-verify-status"></span>
        </div>
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

// ─── Verify Platform Credentials ─────────────────────────────────────────────

export async function verifyPlatformCredentials(platformId) {
  const platform = _platformsMeta?.find(p => p.id === platformId);
  if (!platform) return;

  const statusEl = document.getElementById(`verify_status_${platformId}`);
  statusEl.textContent = 'Verificando…';
  statusEl.className   = 'platform-verify-status';

  const credentials = {};
  for (const f of platform.configFields) {
    const el = document.getElementById(_platformFieldId(platformId, f.key));
    if (el) credentials[f.key] = el.value.trim();
  }

  try {
    const result = await api('POST', '/pr/verify', { type: platformId, ...credentials });
    if (result.ok) {
      statusEl.textContent = result.login ? `✓ Conectado como ${result.login}` : '✓ Credenciales válidas';
      statusEl.className   = 'platform-verify-status ok';
    } else {
      statusEl.textContent = '✗ ' + result.error;
      statusEl.className   = 'platform-verify-status fail';
    }
  } catch (e) {
    statusEl.textContent = '✗ ' + e.message;
    statusEl.className   = 'platform-verify-status fail';
  }
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
  if (!isValidRefName(mainBranch)) { toast('Nombre de rama principal inválido.', 'warn'); return; }

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
    emit('repo:refresh');
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
    emit('repo:refresh-status');
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
  const currentBranches = Object.keys(state.branches?.branches || []);
  let branchName = name;
  if (currentBranches.includes(name)) {
    branchName = prompt(`La rama "${name}" ya existe. Introduce un nuevo nombre:`, name + '-recovered');
    if (!branchName) return;
  }
  try {
    await opPost('/repo/recover/branch', { hash, name: branchName }, 'Restaurando rama…');
    emit('repo:refresh-branches');
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
  if (newBranchName && !isValidRefName(newBranchName)) { toast('Nombre de rama inválido. Evita espacios, .., tildes, y caracteres especiales.', 'warn'); return; }

  try {
    toast(`Aplicando cherry-pick del commit ${commitHash.slice(0, 7)}…`, 'info');
    await post('/repo/cherry-pick', { commitHash, targetBranch });
    closeModal('modalCherryPick');
    emit('repo:refresh');
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
    emit('repo:refresh');
    toast(`🚀 ${result.message}`, 'success');
    return true;
  } catch (e) { toast(`Error: ${e.message}`, 'error'); return false; }
}

// ─── Window assignments for HTML onclick handlers ────────────────────────────

window.openSettingsModal          = openSettingsModal;
window.saveSettings               = saveSettings;
window.saveRepoSettings           = saveRepoSettings;
window.clearRepoSettings          = clearRepoSettings;
window.switchSettingsTab          = switchSettingsTab;
window.verifyPlatformCredentials  = verifyPlatformCredentials;
window.openRecoverModal    = openRecoverModal;
window.scanRecover         = scanRecover;
window.recoverFromStash    = recoverFromStash;
window.recoverBranch       = recoverBranch;
window.openCherryPickModal = openCherryPickModal;
window.confirmCherryPick   = confirmCherryPick;
window.openProdModal       = openProdModal;
window.pushToProduction    = pushToProduction;
window.recoverStashStore   = recoverStashStore;

// ─── Remote Management ─────────────────────────────────────────────────────────

export async function loadRemotesTab() {
  if (!state.repoPath) {
    const el = document.getElementById('remoteList');
    if (el) el.innerHTML = '<div style="color:var(--tx3);font-size:12px">Abre un repositorio primero.</div>';
    return;
  }
  const el = document.getElementById('remoteList');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--tx3);font-size:12px">Cargando…</div>';
  try {
    const data = await get('/repo/info');
    _renderRemoteList(data.remotes || []);
  } catch (e) { el.innerHTML = `<div style="color:var(--red);font-size:12px">${escHtml(e.message)}</div>`; }
}

function _renderRemoteList(remotes) {
  const el = document.getElementById('remoteList');
  if (!el) return;
  if (remotes.length === 0) {
    el.innerHTML = '<div style="color:var(--tx3);font-size:12px;padding:8px 0">Sin remotos configurados.</div>';
    return;
  }
  el.innerHTML = remotes.map(r => {
    const url = r.refs?.push || r.refs?.fetch || '';
    return `<div class="remote-item">
      <div class="remote-item-info">
        <span class="remote-item-name">${escHtml(r.name)}</span>
        <span class="remote-item-url" title="${escAttr(url)}">${escHtml(url)}</span>
      </div>
      <button class="btn btn-xs btn-secondary" onclick="renameRemotePrompt('${escAttr(r.name)}')" title="Renombrar">✎</button>
      <button class="btn btn-xs" onclick="setRemoteUrlPrompt('${escAttr(r.name)}','${escAttr(url)}')" title="Cambiar URL">🔗</button>
      <button class="btn btn-xs btn-danger" onclick="deleteRemote('${escAttr(r.name)}')" title="Eliminar">🗑</button>
    </div>`;
  }).join('');
}

export async function addRemoteFromForm() {
  const name = document.getElementById('newRemoteName')?.value.trim();
  const url  = document.getElementById('newRemoteUrl')?.value.trim();
  if (!name) { toast('Introduce un nombre para el remoto', 'warn'); return; }
  if (!isValidRefName(name)) { toast('Nombre de remoto inválido. Evita espacios y caracteres especiales.', 'warn'); return; }
  if (!url)  { toast('Introduce la URL del remoto', 'warn'); return; }
  try {
    await post('/repo/remote/add', { name, url });
    document.getElementById('newRemoteName').value = '';
    document.getElementById('newRemoteUrl').value  = '';
    toast(`Remoto "${name}" añadido ✓`, 'success');
    loadRemotesTab();
    emit('repo:refresh');
  } catch (e) { toast(e.message, 'error'); }
}

export async function deleteRemote(name) {
  if (!confirm(`¿Eliminar el remoto "${name}"? Esto no borra las ramas locales que lo rastrean.`)) return;
  try {
    await post('/repo/remote/delete', { name });
    toast(`Remoto "${name}" eliminado ✓`, 'info');
    loadRemotesTab();
    emit('repo:refresh');
  } catch (e) { toast(e.message, 'error'); }
}

export async function renameRemotePrompt(oldName) {
  const newName = prompt(`Nuevo nombre para "${oldName}":`, oldName);
  if (!newName || newName === oldName) return;
  try {
    await post('/repo/remote/rename', { oldName, newName });
    toast(`Remoto renombrado a "${newName}" ✓`, 'success');
    loadRemotesTab();
    emit('repo:refresh');
  } catch (e) { toast(e.message, 'error'); }
}

export async function setRemoteUrlPrompt(name, currentUrl) {
  const newUrl = prompt(`URL del remoto "${name}":`, currentUrl);
  if (!newUrl || newUrl === currentUrl) return;
  try {
    await post('/repo/remote/set-url', { name, url: newUrl });
    toast(`URL de "${name}" actualizada ✓`, 'success');
    loadRemotesTab();
  } catch (e) { toast(e.message, 'error'); }
}

window.loadRemotesTab      = loadRemotesTab;
window.addRemoteFromForm   = addRemoteFromForm;
window.deleteRemote        = deleteRemote;
window.renameRemotePrompt  = renameRemotePrompt;
window.setRemoteUrlPrompt  = setRemoteUrlPrompt;
