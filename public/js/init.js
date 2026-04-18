// ─── Init — Import all modules ────────────────────────────────────────────────
// Order matters: foundational modules first, then those that depend on them.

import './utils.js';
import './state.js';
import './bus.js';
import './api.js';
import './diff.js';
import './files.js';
import './branches.js';
import './log.js';
import './tags.js';
import './stash.js';
import './cherrypick.js';
import './conflict-editor.js';
import './commit.js';
import './sync.js';
import './repo.js';
import './tabs.js';
import './panels.js';

import { hideOp, forceHideOp, opPost, post } from './api.js';
import { state } from './state.js';
import { toast, debounce } from './utils.js';
import { emit } from './bus.js';
import { loadLog, navigateLog, navigateLogFiles } from './log.js';
import { navigateStash } from './stash.js';
import { switchToPanel } from './panels.js';
import { restoreSession, tabs, activeTabId } from './state.js';

// ─── Staging helpers (stageAll / unstageAll / discardAll) ─────────────────────

window.stageAll = async () => {
  try {
    await opPost('/repo/stage', { files: ['.'] }, 'Añadiendo todo al stage…');
    emit('repo:refresh-status');
    toast('Todos los archivos en stage', 'success');
  } catch (e) { toast(e.message, 'error'); }
};

window.unstageAll = async () => {
  if ((state.status?.staged || []).length === 0) return;
  try {
    await opPost('/repo/unstage', { files: 'all' }, 'Limpiando stage…');
    emit('repo:refresh-status');
    toast('Stage limpiado', 'info');
  } catch (e) { toast(e.message, 'error'); }
};

window.discardAll = async () => {
  const unstaged = (state.status?.files || []).filter(f => f.working_dir !== ' ' && f.working_dir !== '?');
  if (unstaged.length === 0) return;
  if (!confirm(`¿Descartar TODOS los cambios no preparados? (${unstaged.length} archivos)\nEsta acción NO se puede deshacer.`)) return;
  try {
    await opPost('/repo/discard', { files: 'all' }, 'Descartando cambios…');
    emit('repo:refresh-status');
    toast('Todos los cambios descartados', 'info');
  } catch (e) { toast(e.message, 'error'); }
};

window.refreshBranchesList = async () => {
  await window.doFetch();
  emit('repo:refresh-branches');
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
const logSearchEl = document.getElementById('logSearch');
if (logSearchEl) {
  logSearchEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); loadLog(); } });
  logSearchEl.addEventListener('input', () => {
    clearTimeout(window._logSearchTimer);
    window._logSearchTimer = setTimeout(() => loadLog(), 400);
  });
}
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

document.getElementById('btnRefresh').addEventListener('click', () => emit('repo:refresh'));
document.getElementById('tbSync').addEventListener('click', () => window.syncRepo());
document.getElementById('btnOpenFolder').addEventListener('click', () => post('/repo/open-folder', {}));
document.getElementById('btnOpenTerminal').addEventListener('click', () => post('/repo/open-terminal', {}));
document.getElementById('btnCompareBranches').addEventListener('click', () => window.openCompareBranchesModal());

document.getElementById('btnConfirmProd').addEventListener('click', () => window.pushToProduction());
document.getElementById('btnConfirmPullFrom').addEventListener('click', () => window.confirmPullFrom());
document.getElementById('btnSubmitPR').addEventListener('click', () => window.submitPR());
document.getElementById('btnRefreshPRs').addEventListener('click', () => window.loadPRs?.());

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

// ─── Centralized data-action dispatcher ──────────────────────────────────────
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const arg    = el.dataset.arg;
  const modal  = el.dataset.modal;

  switch (action) {
    case 'maximize':        window.togglePanelMaximize?.(el.dataset.target); break;
    case 'collapse': {
      const id = el.dataset.target;
      const target = document.getElementById(id);
      if (!target) break;
      target.classList.toggle('collapsed');
      const allCollapsed = Array.from(
        document.querySelectorAll('.panel-collapsible.collapsed, .side-section.collapsed')
      ).map(e => e.id).filter(Boolean);
      try { localStorage.setItem('gvm_collapsed_sections', JSON.stringify(allCollapsed)); } catch (_) {}
      break;
    }
    // Modal management
    case 'closeModal':      window.closeModal(modal || arg); break;
    // Commit/stage actions
    case 'doCommit':        window.doCommit?.(); break;
    case 'confirmReset':    window.confirmReset?.(); break;
    case 'confirmSquash':   window.confirmSquash?.(); break;
    // Branch actions
    case 'confirmDeleteBranch':  window.confirmDeleteBranch?.(); break;
    case 'confirmRenameBranch':  window.confirmRenameBranch?.(); break;
    case 'confirmRebase':        window.confirmRebase?.(); break;
    case 'confirmSquashCommits': window.confirmSquash?.(); break;
    // Tag actions
    case 'confirmCreateTag':  window.confirmCreateTag?.(); break;
    case 'confirmDeleteTag':  window.confirmDeleteTag?.(); break;
    // Stash
    case 'confirmStash':    window.confirmStash?.(); break;
    // Conflict
    case 'conflictAbort':   window.conflictAbort?.(arg); break;
    case 'conflictContinue': window.conflictContinue?.(arg); break;
    // PR
    case 'confirmCreatePR': window.confirmCreatePR?.(); break;
  }
});

// ─── Content Tabs ─────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'log') loadLog();
    if (btn.dataset.tab === 'prs') window.loadPRs?.();
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
    emit('repo:refresh');
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
          <kbd>↑ ↓</kbd><span>Navegar archivos / commits del historial</span>
          <kbd>Alt+↑ ↓</kbd><span>Navegar entre hunks del diff</span>
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

// Alt+↑ / Alt+↓ para navegar entre hunks
document.addEventListener('keydown', e => {
  if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  e.preventDefault();
  window.navigateHunk(e.key === 'ArrowDown' ? 'next' : 'prev');
});

// ↑ / ↓ sin modificadores → navegar commits o archivos del commit cuando el panel Log está activo
document.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const logPanel = document.getElementById('tab-log');
  if (!logPanel || !logPanel.classList.contains('active')) return;
  e.preventDefault();
  const dir = e.key === 'ArrowDown' ? 1 : -1;
  // If a file is active in the detail panel, navigate files; otherwise navigate commits
  const hasActiveFile = !!document.querySelector('#logDetailFiles .log-detail-file.active');
  if (hasActiveFile) navigateLogFiles(dir);
  else navigateLog(dir);
});

// ↑ / ↓ → navegar stash cuando el panel Stash está activo
document.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const stashPanel = document.getElementById('tab-stash');
  if (!stashPanel || !stashPanel.classList.contains('active')) return;
  e.preventDefault();
  navigateStash(e.key === 'ArrowDown' ? 1 : -1);
});

// ─── Diff search (Ctrl+F) ─────────────────────────────────────────────────────

let _dsMatches = [];
let _dsIdx     = -1;

function _getActiveDiffView() {
  // Priority: logDetailDiff (if visible) → stashDiffView → main diffView
  for (const id of ['logDetailDiff', 'stashDiffView', 'diffView']) {
    const el = document.getElementById(id);
    if (el && el.offsetParent !== null && el.textContent.trim()) return el;
  }
  return null;
}

function diffSearchOpen() {
  const bar = document.getElementById('diffSearchBar');
  bar.style.display = 'flex';
  document.getElementById('diffSearchInput').focus();
  document.getElementById('diffSearchInput').select();
}

function diffSearchClose() {
  document.getElementById('diffSearchBar').style.display = 'none';
  diffSearchClear();
}

function diffSearchClear() {
  document.querySelectorAll('.diff-match-line, .diff-match-current').forEach(el => {
    el.classList.remove('diff-match-line', 'diff-match-current');
  });
  _dsMatches = [];
  _dsIdx = -1;
  document.getElementById('diffSearchCount').textContent = '';
}

function diffSearchRun(query) {
  diffSearchClear();
  if (!query) return;
  const view = _getActiveDiffView();
  if (!view) return;
  const lines = view.querySelectorAll('.dl-line, .d-line, .diff-line, tr');
  const lq = query.toLowerCase();
  lines.forEach(line => {
    if (line.textContent.toLowerCase().includes(lq)) {
      line.classList.add('diff-match-line');
      _dsMatches.push(line);
    }
  });
  if (_dsMatches.length) { _dsIdx = 0; _dsHighlight(); }
  const countEl = document.getElementById('diffSearchCount');
  countEl.textContent = _dsMatches.length ? `1 / ${_dsMatches.length}` : 'Sin resultados';
}

function _dsHighlight() {
  _dsMatches.forEach((el, i) => el.classList.toggle('diff-match-current', i === _dsIdx));
  if (_dsMatches[_dsIdx]) {
    _dsMatches[_dsIdx].scrollIntoView({ block: 'center' });
    document.getElementById('diffSearchCount').textContent = `${_dsIdx + 1} / ${_dsMatches.length}`;
  }
}

function diffSearchNav(dir) {
  if (!_dsMatches.length) return;
  _dsIdx = (_dsIdx + dir + _dsMatches.length) % _dsMatches.length;
  _dsHighlight();
}

const _dsDebouncedRun = debounce(q => diffSearchRun(q), 200);

document.getElementById('diffSearchInput').addEventListener('input', e => _dsDebouncedRun(e.target.value.trim()));
document.getElementById('diffSearchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter')  { e.preventDefault(); diffSearchNav(e.shiftKey ? -1 : 1); }
  if (e.key === 'Escape') { e.preventDefault(); diffSearchClose(); }
});
document.getElementById('diffSearchPrev').addEventListener('click',  () => diffSearchNav(-1));
document.getElementById('diffSearchNext').addEventListener('click',  () => diffSearchNav(1));
document.getElementById('diffSearchClose').addEventListener('click', () => diffSearchClose());

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (_getActiveDiffView()) { e.preventDefault(); diffSearchOpen(); }
  }
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

// ─── Lazy-load módulos no críticos al arranque ────────────────────────────────
// settings, pr, reflog se cargan en idle para no bloquear el render inicial.
function _lazyLoadDeferred() {
  import('./settings.js').catch(() => {});
  import('./pr.js').catch(() => {});
  import('./reflog.js').catch(() => {});
}
if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(_lazyLoadDeferred, { timeout: 2000 });
} else {
  setTimeout(_lazyLoadDeferred, 300);
}
