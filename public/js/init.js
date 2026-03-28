// ─── Init — Import all modules ────────────────────────────────────────────────
// Order matters: foundational modules first, then those that depend on them.

import './utils.js';
import './state.js';
import './api.js';
import './diff.js';
import './files.js';
import './branches.js';
import './log.js';
import './tags.js';
import './stash.js';
import './cherrypick.js';
import './reflog.js';
import './commit.js';
import './sync.js';
import './pr.js';
import './settings.js';
import './repo.js';
import './tabs.js';
import './panels.js';

import { hideOp, forceHideOp, opPost } from './api.js';
import { state } from './state.js';
import { toast } from './utils.js';
import { loadLog } from './log.js';
import { loadPRs } from './pr.js';
import { switchToPanel } from './panels.js';
import { restoreSession, tabs, activeTabId } from './state.js';

// ─── Staging helpers (stageAll / unstageAll / discardAll) ─────────────────────

window.stageAll = async () => {
  try {
    await opPost('/repo/stage', { files: ['.'] }, 'Añadiendo todo al stage…');
    await window.refreshStatus();
    toast('Todos los archivos en stage', 'success');
  } catch (e) { toast(e.message, 'error'); }
};

window.unstageAll = async () => {
  if ((state.status?.staged || []).length === 0) return;
  try {
    await opPost('/repo/unstage', { files: 'all' }, 'Limpiando stage…');
    await window.refreshStatus();
    toast('Stage limpiado', 'info');
  } catch (e) { toast(e.message, 'error'); }
};

window.discardAll = async () => {
  const unstaged = (state.status?.files || []).filter(f => f.working_dir !== ' ' && f.working_dir !== '?');
  if (unstaged.length === 0) return;
  if (!confirm(`¿Descartar TODOS los cambios no preparados? (${unstaged.length} archivos)\nEsta acción NO se puede deshacer.`)) return;
  try {
    await opPost('/repo/discard', { files: 'all' }, 'Descartando cambios…');
    await window.refreshStatus();
    toast('Todos los cambios descartados', 'info');
  } catch (e) { toast(e.message, 'error'); }
};

window.refreshBranchesList = async () => {
  await window.doFetch();
  await window.refreshBranches();
  toast('Ramas actualizadas', 'info');
};

// Expose state for keyboard shortcut access
window.state = state;

// ─── Event Bindings ───────────────────────────────────────────────────────────

document.getElementById('btnCancelOp').addEventListener('click', () => {
  const abort = window._getOpAbort ? window._getOpAbort() : null;
  if (abort) abort.abort();
  forceHideOp(); // fuerza el cierre sin importar _opCount
});

document.getElementById('btnNewTab').addEventListener('click', () => window.newRepoTab());

document.getElementById('btnLoadRepo').addEventListener('click', () => window.loadRepo(document.getElementById('repoPath').value));
document.getElementById('repoPath').addEventListener('keydown', e => { if (e.key === 'Enter') window.loadRepo(e.target.value); });

document.getElementById('btnBrowse').addEventListener('click', () => {
  window.openFolderBrowser(selectedPath => {
    document.getElementById('repoPath').value = selectedPath;
    window.loadRepo(selectedPath);
  });
});

document.getElementById('btnWelcomeOpen').addEventListener('click', () => window.loadRepo(document.getElementById('welcomePath').value));
document.getElementById('welcomePath').addEventListener('keydown', e => { if (e.key === 'Enter') window.loadRepo(e.target.value); });

document.getElementById('btnWelcomeBrowse').addEventListener('click', () => {
  window.openFolderBrowser(selectedPath => {
    document.getElementById('welcomePath').value = selectedPath;
    window.loadRepo(selectedPath);
  });
});

document.getElementById('btnWelcomeClone').addEventListener('click', () => window.cloneRepo());
document.getElementById('btnConfirmClone').addEventListener('click', () => window.confirmClone());
document.getElementById('btnConfirmDeleteBranch').addEventListener('click', () => window.confirmDeleteBranch());
document.getElementById('btnConfirmRenameBranch').addEventListener('click', () => window.confirmRenameBranch());
document.getElementById('btnConfirmRebase').addEventListener('click', () => window.confirmRebase());
document.getElementById('btnSearchLog')?.addEventListener('click', () => loadLog());
document.getElementById('btnLogAllBranches')?.addEventListener('click', () => loadLog(null));
document.getElementById('logSearch')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadLog(); });
document.getElementById('btnCloneBrowse').addEventListener('click', () => {
  window.openFolderBrowser(selectedPath => {
    document.getElementById('clonePath').value = selectedPath;
  });
});

document.getElementById('btnStashSave').addEventListener('click', () => window.openStashModal());
document.getElementById('btnConfirmStash').addEventListener('click', () => window.confirmStash());

document.getElementById('btnSettings').addEventListener('click', () => window.openSettingsModal());
document.getElementById('btnGitignore').addEventListener('click', () => window.openGitignoreEditor());
document.getElementById('btnSaveSettings').addEventListener('click', () => window.saveSettings());

document.getElementById('btnNewBranch').addEventListener('click', () => window.openNewBranchModal());
document.getElementById('btnCreateBranch').addEventListener('click', () => {
  const name = document.getElementById('newBranchName').value.trim();
  const from = document.getElementById('newBranchFrom').value;
  window.createBranch(name, from);
});
document.getElementById('newBranchNoCheckout').addEventListener('change', () => window.updateCreateBranchBtn());

document.getElementById('btnNewTagSide').addEventListener('click', () => window.openModal('modalTag'));
document.getElementById('btnCreateTag').addEventListener('click', () => window.confirmCreateTag());

document.getElementById('btnRefreshBranches').addEventListener('click', () => window.refreshBranchesList());

document.getElementById('btnRefresh').addEventListener('click', () => window.refreshAll());
document.getElementById('btnSync').addEventListener('click', () => window.syncRepo());
document.getElementById('btnFetch').addEventListener('click', () => window.doFetch());
document.getElementById('btnPull').addEventListener('click', () => window.doPull());
document.getElementById('btnPush').addEventListener('click', () => window.doPush());
document.getElementById('btnCompareBranches').addEventListener('click', () => window.openCompareBranchesModal());

document.getElementById('btnPushProd').addEventListener('click', () => window.openProdModal());
document.getElementById('btnConfirmProd').addEventListener('click', () => window.pushToProduction());
document.getElementById('btnConfirmPullFrom').addEventListener('click', () => window.confirmPullFrom());

document.getElementById('btnCreatePR').addEventListener('click', () => window.openPRModal());
document.getElementById('btnSubmitPR').addEventListener('click', () => window.submitPR());
document.getElementById('btnRefreshPRs').addEventListener('click', () => loadPRs());

document.getElementById('btnStageAll').addEventListener('click', () => window.stageAll());
document.getElementById('btnDiscardAll').addEventListener('click', () => window.discardAll());
document.getElementById('btnUnstageAll').addEventListener('click', () => window.unstageAll());
document.getElementById('btnCommit').addEventListener('click', () => window.doCommit());

// ─── Toolbar Bindings ──────────────────────────────────────────────────────────

document.getElementById('tbCommit').addEventListener('click', () => window.doCommit());
document.getElementById('tbPull').addEventListener('click', () => window.doPull());
document.getElementById('tbPush').addEventListener('click', () => window.doPush());
document.getElementById('tbFetch').addEventListener('click', () => window.doFetch());
document.getElementById('tbBranch').addEventListener('click', () => window.openModal('modalBranch'));
document.getElementById('tbStash').addEventListener('click', () => window.openStashModal());
document.getElementById('tbTag').addEventListener('click', () => window.openModal('modalTag'));
document.getElementById('tbDiscard').addEventListener('click', () => window.discardAll());
document.getElementById('tbRecover').addEventListener('click', () => window.openRecoverModal());
document.getElementById('tbProd').addEventListener('click', () => window.openProdModal());
document.getElementById('tbPR').addEventListener('click', () => window.openPRModal());

// ─── Content Tabs ─────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'log') loadLog();
    if (btn.dataset.tab === 'prs') loadPRs();
  });
});

// ─── Sidebar Nav ───────────────────────────────────────────────────────────────

document.querySelectorAll('.side-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchToPanel(btn.dataset.panel));
});

// ─── Keyboard shortcuts ─────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
    // Si el overlay está visible, Escape lo cierra y restaura el estado
    if (document.getElementById('opOverlay')?.classList.contains('active')) forceHideOp();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.activeElement.id === 'commitMessage') {
    window.doCommit();
  }
  if (e.key === 'F5' && state.repoPath) {
    e.preventDefault();
    window.refreshAll();
  }
});

// ─── Keyboard Shortcuts ────────────────────────────────────────────────────────
// Ctrl+Enter in commit textarea → commit
document.getElementById('commitMessage').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); window.doCommit(); }
});

// Global shortcuts (skip when typing in inputs/textareas)
document.addEventListener('keydown', e => {
  const tag = e.target.tagName;
  const editing = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;
  if (editing && e.key !== 'Escape') return;

  if (e.ctrlKey || e.metaKey) {
    switch (e.key) {
      case '1': e.preventDefault(); window.switchToPanel('changes');  break;
      case '2': e.preventDefault(); window.switchToPanel('branches'); break;
      case '3': e.preventDefault(); window.switchToPanel('log');      break;
      case '4': e.preventDefault(); window.switchToPanel('stash');    break;
      case '5': e.preventDefault(); window.switchToPanel('tags');     break;
      case 'Enter': {
        e.preventDefault();
        const msg = document.getElementById('commitMessage')?.value?.trim();
        const staged = (window.state?.status?.staged || []).length;
        if (msg && staged > 0) window.doCommit();
        break;
      }
    }
    return;
  }

  if (e.key === '?' && !editing) {
    e.preventDefault();
    window.showShortcutsOverlay();
  }
  if (e.key === ' ' && !editing) {
    e.preventDefault();
    window.stageOrUnstageActiveFile?.();
  }
  if (e.key === 'd' && !editing) {
    e.preventDefault();
    window.toggleMainDiffMode?.();
  }
  if (e.key === 'Escape') {
    window.hideShortcutsOverlay?.();
  }
});

// ─── Shortcuts overlay ────────────────────────────────────────────────────────

function showShortcutsOverlay() {
  let el = document.getElementById('shortcutsOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'shortcutsOverlay';
    el.className = 'shortcuts-overlay';
    el.innerHTML = `
      <div class="shortcuts-card">
        <div class="shortcuts-title">Atajos de teclado</div>
        <div class="shortcuts-grid">
          <kbd>Ctrl+1…5</kbd><span>Cambios / Ramas / Historial / Stash / Tags</span>
          <kbd>Ctrl+↵</kbd><span>Commit (desde cualquier lugar)</span>
          <kbd>Space</kbd><span>Stage / Unstage archivo activo</span>
          <kbd>↑ ↓</kbd><span>Navegar archivos y carpetas</span>
          <kbd>← →</kbd><span>Colapsar / Expandir carpeta (árbol)</span>
          <kbd>← (en archivo)</kbd><span>Ir a carpeta padre</span>
          <kbd>d</kbd><span>Alternar vista unificada / lado a lado</span>
          <kbd>F5</kbd><span>Actualizar</span>
          <kbd>?</kbd><span>Esta ayuda</span>
          <kbd>Esc</kbd><span>Cerrar modal / ayuda</span>
        </div>
      </div>`;
    el.addEventListener('click', hideShortcutsOverlay);
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
}
function hideShortcutsOverlay() {
  const el = document.getElementById('shortcutsOverlay');
  if (el) el.style.display = 'none';
}
window.showShortcutsOverlay = showShortcutsOverlay;
window.hideShortcutsOverlay = hideShortcutsOverlay;

// ─── Recuperación de foco al volver a la ventana ──────────────────────────────
// Si el overlay quedó activo mientras la ventana estaba en segundo plano,
// y no hay operaciones en curso, se cierra automáticamente al regresar.
window.addEventListener('focus', () => {
  const overlay = document.getElementById('opOverlay');
  if (overlay?.classList.contains('active') && window._getOpAbort?.() === null) {
    forceHideOp();
  }
});

// ─── Guardar sesión al cerrar la ventana ──────────────────────────────────────
// sendBeacon garantiza que la petición se complete aunque la página se esté cerrando

window.addEventListener('pagehide', () => {
  try {
    const openTabs = tabs.filter(t => t.repoPath).map(t => ({
      repoPath: t.repoPath,
      active:   t.id === activeTabId,
    }));
    const blob = new Blob([JSON.stringify({ openTabs })], { type: 'application/json' });
    navigator.sendBeacon('/api/config/tabs', blob);
  } catch (_) {}
});

// ─── Init ─────────────────────────────────────────────────────────────────────

function initApp() {
  try {
    const collapsed = JSON.parse(localStorage.getItem('gvm_collapsed_sections') || '[]');
    collapsed.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('collapsed');
    });
  } catch (_) {}
  restoreSession();
}

initApp();
