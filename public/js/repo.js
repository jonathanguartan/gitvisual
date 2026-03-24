import { state, tabs, activeTabId, saveSession } from './state.js';
import { get, post, api } from './api.js';
import { toast, openModal, escHtml, escAttr } from './utils.js';
import { renderBranches, renderRepoInfo } from './branches.js';
import { renderStatus } from './files.js';
import { renderTags } from './tags.js';
import { renderStashList } from './stash.js';
import { startAutoFetch } from './sync.js';

// ─── Repo Loading ─────────────────────────────────────────────────────────────

export async function loadRepo(repoPath) {
  repoPath = repoPath.trim().replace(/\\/g, '/');
  if (!repoPath) { toast('Ingresa una ruta válida', 'warn'); return; }

  const existingTab = tabs.find(t => t.repoPath && t.repoPath.toLowerCase() === repoPath.toLowerCase());
  if (existingTab) {
    if (existingTab.id !== activeTabId) {
      await window.switchRepoTab(existingTab.id);
      toast('Este repositorio ya está abierto en otra pestaña', 'info');
    }
    return;
  }

  try {
    const check = await api('GET', `/repo/check?repoPath=${encodeURIComponent(repoPath)}`);

    if (!check.isRepo) {
      const init = confirm(`"${repoPath}" no es un repositorio Git.\n¿Deseas inicializarlo ahora?`);
      if (!init) return;
      await api('POST', '/repo/init', { repoPath });
      toast('Repositorio Git inicializado', 'success');
    }

    state.repoPath = repoPath;
    state.isLazy = false;
    document.getElementById('repoPath').value = repoPath;

    const cfg = await api('GET', '/config');
    const recent = (cfg.recentRepos || []).filter(r => r !== repoPath);
    recent.unshift(repoPath);
    await api('POST', '/config/save', { recentRepos: recent.slice(0, 6) });

    document.getElementById('welcome').style.display    = 'none';
    document.getElementById('mainLayout').style.display = 'flex';
    document.getElementById('toolbar').style.display    = 'flex';

    await refreshAll();
    window.renderTabBar();
    saveSession();
    startAutoFetch(cfg.autoFetchMinutes ?? 5);

    // Avisar si la rama tiene commits pero nunca se ha publicado
    if (state.repoInfo?.totalCommits > 0 && !state.repoInfo?.tracking) {
      toast(`La rama "${state.repoInfo.currentBranch}" tiene commits locales pero nunca se ha publicado en el remote. Usa Push (↑) para publicarla.`, 'warn');
    }

    if (!check.configComplete) {
      const missing = [];
      if (check.missingConfig.name)   missing.push('nombre de usuario');
      if (check.missingConfig.email)  missing.push('email');
      if (check.missingConfig.remote) missing.push('remote origin');
      toast(`Config Git incompleta: falta ${missing.join(', ')}. Abre ⚙ Configuración.`, 'warn');
      window.openSettingsModal();
    } else if (state.repoInfo?.githubInfo?.type === 'github' && !cfg.platforms?.github?.token) {
      toast('Repositorio GitHub detectado sin token de acceso personal. Configúralo en ⚙ → Configuración para poder hacer push y ver PRs.', 'warn');
      window.openSettingsModal('general');
    }
  } catch (e) {
    toast(`Error: ${e.message}`, 'error');
  }
}

let _refreshing = false;
let _refreshTabId = null;

export async function refreshAll() {
  const tabId = activeTabId;
  // Solo bloquear si ya está refrescando ESTE mismo tab; si es otro tab, proceder
  if (_refreshing && _refreshTabId === tabId) return;
  _refreshing = true;
  _refreshTabId = tabId;
  window._refreshing = true;
  try {
    await Promise.all([
      refreshInfo(tabId),
      refreshStatus(tabId),
      refreshBranches(tabId),
      refreshStash(tabId),
      refreshTags(tabId),
    ]);
    if (activeTabId === tabId) window.renderTabBar();
  } finally {
    if (_refreshTabId === tabId) {
      _refreshing = false;
      window._refreshing = false;
    }
  }
}

export async function refreshInfo(tabId = activeTabId) {
  try {
    const info = await get('/repo/info');
    if (activeTabId !== tabId) return;
    state.repoInfo    = info;
    state.currentBranch = info.currentBranch;
    state.githubInfo  = info.githubInfo;
    // Use repo's detected default branch, falling back to global setting
    if (info.defaultBranch) window.mainBranch = info.defaultBranch;
    renderRepoInfo(info);
  } catch (e) { console.warn('refreshInfo:', e.message); }
}

export async function refreshStatus(tabId = activeTabId) {
  try {
    const status = await get('/repo/status');
    if (activeTabId !== tabId) return;
    state.status = status;
    renderStatus(status);
  } catch (e) { console.warn('refreshStatus:', e.message); }
}

export async function refreshBranches(tabId = activeTabId) {
  try {
    const [branches, tracking] = await Promise.all([
      get('/repo/branches'),
      get('/repo/branches/tracking').catch(() => ({})),
    ]);
    if (activeTabId !== tabId) return;
    state.branches       = branches;
    state.branchTracking = tracking;
    renderBranches(branches);
  } catch (e) { console.warn('refreshBranches:', e.message); }
}

async function refreshTags(tabId = activeTabId) {
  try {
    const data = await get('/repo/tags');
    if (activeTabId !== tabId) return;
    renderTags(data.all || []);
  } catch (e) { console.warn('refreshTags:', e.message); }
}

async function refreshStash(tabId = activeTabId) {
  try {
    const stashes = await get('/repo/stash/list');
    if (activeTabId !== tabId) return;
    state.stashList = stashes;
    renderStashList(stashes);
  } catch (_) {
    if (activeTabId !== tabId) return;
    state.stashList = [];
    renderStashList([]);
  }
}

// ─── renderAll ────────────────────────────────────────────────────────────────

export function renderAll() {
  const tab = (tabs.find(t => t.id === activeTabId)) || null;
  if (!tab) return;
  if (tab.repoInfo)  renderRepoInfo(tab.repoInfo);
  if (tab.status)    renderStatus(tab.status);
  if (tab.branches)  renderBranches(tab.branches);
  renderStashList(tab.stashList || []);
  document.getElementById('diffView').innerHTML = '<div class="diff-hint">Selecciona un archivo para ver los cambios</div>';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.side-nav-btn').forEach(b => b.classList.remove('active'));
  const changesNavBtn = document.querySelector('.side-nav-btn[data-panel="changes"]');
  if (changesNavBtn) changesNavBtn.classList.add('active');
  document.getElementById('tab-changes').classList.add('active');

  const commitMessageEl = document.getElementById('commitMessage');
  const btnCommitEl     = document.getElementById('btnCommit');
  const btnCommitPushEl = document.getElementById('btnCommitPush');
  const commitColEl     = document.querySelector('.commit-col');

  if (tab.currentBranch) {
    commitMessageEl.disabled = false;
    btnCommitEl.disabled     = false;
    btnCommitPushEl.disabled = false;
    const overlay = commitColEl.querySelector('.no-branch-overlay');
    if (overlay) {
      overlay.remove();
    }
  } else {
    commitMessageEl.disabled = true;
    btnCommitEl.disabled     = true;
    btnCommitPushEl.disabled = true;
    let overlay = commitColEl.querySelector('.no-branch-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'no-branch-overlay';
      commitColEl.appendChild(overlay);
    }
    if (tab.repoInfo && tab.repoInfo.totalCommits === 0) {
      overlay.innerHTML = `
        <p>Este repositorio no tiene commits iniciales. <br>
           Puedes crear tu primera rama 'main' y subirla.</p>
        <button id="btnCreateInitialMain" class="btn btn-primary btn-lg mt-3">
          Crear 'main' y subir a producción
        </button>
      `;
      document.getElementById('btnCreateInitialMain').addEventListener('click', createMainAndPush);
    } else {
      overlay.innerHTML = '<p>No hay rama seleccionada. <br>Crea una rama o haz checkout a una existente para hacer commits.</p>';
    }
  }
}

async function createMainAndPush() {
  if (!state.repoPath) { toast('Abre un repositorio primero', 'warn'); return; }

  toast('Preparando archivos para commit inicial...', 'info');
  try {
    await post('/repo/stage', { files: ['.'] });
    await refreshStatus();
  } catch (e) {
    toast(`Error al preparar archivos: ${e.message}`, 'error');
    return;
  }

  toast('Creando rama "main"...', 'info');
  const branchCreated = await window.createBranch('main', '', true);
  if (!branchCreated) {
    toast('Error al crear la rama "main".', 'error');
    return;
  }

  toast('Realizando commit inicial...', 'info');
  const commitMade = await window.doCommit('Initial commit');
  if (!commitMade) {
    toast('Error al realizar el commit inicial. Asegúrate de tener archivos en el repositorio.', 'error');
    return;
  }

  toast('Subiendo "main" a producción...', 'info');
  const pushSuccessful = await window.pushToProduction('main', null);
  if (pushSuccessful) {
    toast('Rama "main" creada, commit inicial hecho y subida a producción ✓', 'success');
  } else {
    toast('Error al subir la rama "main" a producción. Verifica la configuración remota.', 'error');
  }
}

// ─── Welcome ──────────────────────────────────────────────────────────────────

async function loadWelcome() {
  try {
    const cfg    = await api('GET', '/config');
    const recent = cfg.recentRepos || [];
    const el     = document.getElementById('recentRepos');

    if (recent.length === 0) return;
    el.innerHTML = `<div class="recent-lbl">Repositorios recientes</div>` +
      recent.map(r => `
        <button class="recent-item" onclick="loadRepo('${escAttr(r)}')">
          <span>📁</span>
          <span class="recent-item-path">${escHtml(r)}</span>
        </button>
      `).join('');
  } catch (_) {}
}

export function showWelcome() {
  document.getElementById('welcome').style.display    = '';
  document.getElementById('mainLayout').style.display = 'none';
  document.getElementById('toolbar').style.display    = 'none';
  document.getElementById('repoPath').style.display   = 'block';
  document.getElementById('repoPathDisplay').style.display = 'none';
  document.getElementById('repoPath').value    = '';
  document.getElementById('welcomePath').value = '';

  document.getElementById('headerWelcomeActions').style.display = 'flex';
  document.getElementById('headerGitActions').style.display     = 'none';

  loadWelcome();
}

// Focus/visibility refresh listeners — debounced para evitar apilamiento de operaciones git
let _focusDebounce = null;
function _scheduleRefresh(fn) {
  clearTimeout(_focusDebounce);
  _focusDebounce = setTimeout(() => {
    if (state.repoPath && document.getElementById('mainLayout').style.display !== 'none') fn();
  }, 800);
}
window.addEventListener('focus', () => _scheduleRefresh(refreshAll));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _scheduleRefresh(refreshStatus);
});

// ─── Window assignments for HTML onclick handlers ────────────────────────────

window.loadRepo         = loadRepo;
window.refreshAll       = refreshAll;
window.refreshInfo      = refreshInfo;
window.refreshStatus    = refreshStatus;
window.refreshBranches  = refreshBranches;
window.showWelcome      = showWelcome;
window.renderAll        = renderAll;
window.renderStashList  = renderStashList;
