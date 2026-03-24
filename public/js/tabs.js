import { tabs, activeTabId, state, saveSession, newTabData, setActiveTabId } from './state.js';
import { get, post, opPost } from './api.js';
import { escHtml, escAttr, toast, openModal, closeModal } from './utils.js';

// ─── Repo Tab Management ──────────────────────────────────────────────────────

export function renderTabBar() {
  document.getElementById('repoTabList').innerHTML = tabs.map(tab => {
    const label  = tab.repoPath ? tab.repoPath.split('/').pop() : 'Nuevo';
    const branch = tab.currentBranch;
    const dirty  = tab.status && (tab.status.files || []).some(f => f.index !== ' ' || f.working_dir !== ' ');
    const active = tab.id === activeTabId;
    return `
      <div class="repo-tab ${active ? 'active' : ''}" onclick="switchRepoTab('${tab.id}')" title="${escAttr(tab.repoPath)}">
        ${dirty ? '<span class="rt-dot" title="Cambios pendientes"></span>' : ''}
        <span class="rt-name">${escHtml(label)}</span>
        ${branch ? `<span class="rt-branch">⎇ ${escHtml(branch)}</span>` : ''}
        <button class="rt-close" onclick="event.stopPropagation();closeRepoTab('${tab.id}')" title="Cerrar pestaña">✕</button>
      </div>`;
  }).join('');
}

export async function switchRepoTab(id) {
  if (id === activeTabId && !state.isLazy) return;

  setActiveTabId(id);
  renderTabBar();
  const tab = tabs.find(t => t.id === id) || null;

  if (tab && tab.repoPath) {
    document.getElementById('welcome').style.display    = 'none';
    document.getElementById('mainLayout').style.display = 'flex';
    document.getElementById('toolbar').style.display    = 'flex';
    document.getElementById('repoPath').style.display   = 'none';

    const display = document.getElementById('repoPathDisplay');
    display.textContent = tab.repoPath;
    display.style.display = 'flex';

    document.getElementById('headerWelcomeActions').style.display = 'none';
    document.getElementById('headerGitActions').style.display     = 'flex';

    if (tab.isLazy) {
      tab.isLazy = false;
      await window.refreshAll();
    } else {
      window.renderAll();
      window.refreshAll();
    }

    saveSession();
  } else {
    window.showWelcome();
  }
}

export function newRepoTab() {
  const emptyTab = tabs.find(t => !t.repoPath);
  if (emptyTab) {
    switchRepoTab(emptyTab.id);
    return;
  }
  const tab = newTabData('tab_' + Date.now());
  tabs.push(tab);
  setActiveTabId(tab.id);
  renderTabBar();
  window.showWelcome();
  saveSession();
}

export function closeRepoTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  const wasActive = (id === activeTabId);
  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    const tab = newTabData('tab_' + Date.now());
    tabs.push(tab);
    setActiveTabId(tab.id);
    renderTabBar();
    window.showWelcome();
    saveSession();
    return;
  }

  if (wasActive) {
    const nextIdx = Math.max(0, idx - 1);
    const nextId = tabs[nextIdx].id;
    switchRepoTab(nextId);
  } else {
    renderTabBar();
  }

  saveSession();
}

// ─── Clone Repository ──────────────────────────────────────────────────────────

export async function cloneRepo() {
  document.getElementById('cloneUrl').value = '';
  document.getElementById('clonePath').value = '';
  openModal('modalClone');
}

export async function confirmClone() {
  const remoteUrl = document.getElementById('cloneUrl').value.trim();
  const localPath = document.getElementById('clonePath').value.trim();

  if (!remoteUrl || !localPath) {
    toast('Completa todos los campos', 'warn');
    return;
  }

  closeModal('modalClone');
  try {
    const result = await opPost('/repo/clone', { remoteUrl, localPath }, '⬇ Clonando repositorio…');
    if (result === null) return;
    toast('Repositorio clonado con éxito', 'success');
    window.loadRepo(localPath);
  } catch (e) {
    toast(`Error al clonar: ${e.message}`, 'error');
  } finally {
    const btn = document.getElementById('btnConfirmClone');
    btn.disabled = false;
    btn.textContent = 'Empezar a clonar';
  }
}

// ─── Section toggle (sidebar collapsible sections) ────────────────────────────

export function toggleSection(id) {
  const el = document.getElementById(id);
  const wasCollapsed = el.classList.contains('collapsed');
  el.classList.toggle('collapsed');
  if (wasCollapsed) {
    el.style.flex   = '';
    el.style.height = '';
  }
  const collapsed = Array.from(document.querySelectorAll('.side-section.collapsed')).map(e => e.id).filter(Boolean);
  try { localStorage.setItem('gvm_collapsed_sections', JSON.stringify(collapsed)); } catch (_) {}
}

// ─── Window assignments for HTML onclick handlers ────────────────────────────

window.switchRepoTab  = switchRepoTab;
window.closeRepoTab   = closeRepoTab;
window.cloneRepo      = cloneRepo;
window.confirmClone   = confirmClone;
window.renderTabBar   = renderTabBar;
window.newRepoTab     = newRepoTab;
window.toggleSection  = toggleSection;
